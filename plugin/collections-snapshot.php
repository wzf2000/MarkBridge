<?php
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
require_once __DIR__ . '/collections-store.php';
require_once __DIR__ . '/component-catalog.php';
require_once __DIR__ . '/relation-map-documents.php';
/** Trusted PHP registration only. There is deliberately no client callback/path interface. */

function mbb_register_publication_adapter(string $id, array $descriptor): bool
{
    $hasSchemas = array_key_exists('collectionSchemas', $descriptor);
    $schemas = $hasSchemas ? $descriptor['collectionSchemas'] : [1];
    if (
        !preg_match('/^[a-z][a-z0-9-]{0,31}$/D', $id) ||
        isset($GLOBALS['mbb_publication_adapters'][$id]) ||
        count($GLOBALS['mbb_publication_adapters'] ?? []) >= 8 ||
        !mbb_collections_closed($descriptor, [
            'contract',
            'version',
            'fingerprint',
            'title',
            'extension',
            'mime',
            'build',
            ...$hasSchemas ? ['collectionSchemas'] : [],
        ]) ||
        !is_array($schemas) ||
        !array_is_list($schemas) ||
        !$schemas ||
        count($schemas) > 2 ||
        count(array_unique($schemas, SORT_REGULAR)) !== count($schemas) ||
        array_filter($schemas, static fn($schema) => !in_array($schema, [1, 2], true)) ||
        $descriptor['contract'] !== 'mbb-publication-adapter/v1' ||
        !is_string($descriptor['version']) ||
        !preg_match('/^[0-9]+\.[0-9]+\.[0-9]+$/D', $descriptor['version']) ||
        !is_string($descriptor['fingerprint']) ||
        !preg_match('/^[a-f0-9]{64}$/D', $descriptor['fingerprint']) ||
        !is_string($descriptor['title']) ||
        strlen($descriptor['title']) > 200 ||
        !in_array($descriptor['extension'], ['zip', 'html', 'epub', 'pdf'], true) ||
        !is_string($descriptor['mime']) ||
        !preg_match('~^[a-z-]+/[a-z0-9.+-]+$~D', $descriptor['mime']) ||
        !is_callable($descriptor['build'])
    ) {
        return false;
    }
    $descriptor['collectionSchemas'] = $schemas;
    $GLOBALS['mbb_publication_adapters'][$id] = $descriptor;
    return true;
}
function mbb_collections_renderer(string $adapter): array
{
    $p = $GLOBALS['mbb_publication_adapters'][$adapter] ?? null;
    if (!$p) {
        mbb_collections_fail('collection_adapter', 503);
    }
    $files = [];
    foreach (
        [
            'kernel.js',
            'static-export.php',
            'technical.php',
            'collections-snapshot.php',
            'references.php',
            'references-data.php',
            'export.php',
            'resource-import.php',
            'components.php',
            'component-catalog.php',
            'projections.php',
            'projections.js',
            'projections-profile.json',
            'projections.css',
            'relation-map.php',
            'relation-map-v2.php',
            'relation-map-v3.php',
            'knowledge-map.php',
            'knowledge-map.js',
            'relation-map-v2.js',
            'relation-map-v3.js',
            'relation-map-layout-v3.js',
            'relation-map-v3-reader.js',
            'relation-map-documents.php',
            'relation-map.js',
            'relation-map.css',
            'languages/messages.json',
            'php-converter-manifest.json',
            'static-export.css',
            'technical.css',
            'media-presentation.css',
            'vendor-manifest.json',
            'runtime-contract.json',
        ]
        as $file
    ) {
        $sha = hash_file('sha256', __DIR__ . '/' . $file);
        if (!$sha) {
            mbb_collections_fail('collection_storage', 503);
        }
        $files[$file] = $sha;
    }
    return [
        'contract' => $p['contract'],
        'adapter' => $adapter,
        'version' => $p['version'],
        'fingerprint' => $p['fingerprint'],
        'mime' => $p['mime'],
        'extension' => $p['extension'],
        'collectionSchemas' => $p['collectionSchemas'],
        'files' => $files,
        'blockAdapters' => mbb_block_adapter_digest(),
        'client' => function_exists('mbb_collections_client_metadata')
            ? mbb_collections_client_metadata($adapter)
            : null,
        'pluginState' => hash(
            'sha256',
            mbb_collections_json([
                get_option('active_plugins', []),
                get_site_option('active_sitewide_plugins', []),
            ]),
        ),
    ];
}
function mbb_collections_post(int $id, bool $private): array
{
    $s = mbb_references_snapshot($id, true);
    $p = $s['post'];
    if (
        strlen($p->post_title) > 800 ||
        !mb_check_encoding($p->post_title, 'UTF-8') ||
        $p->post_password !== '' ||
        (!$private && $p->post_status !== 'publish') ||
        !in_array($p->post_status, ['publish', 'draft', 'pending', 'private', 'future'], true) ||
        strlen($s['document']['source']) > 262144 ||
        strlen($s['document']['serialized']) > 262144
    ) {
        mbb_collections_fail('collection_scope', 422);
    }
    // Do not retain ten conversion results in the per-request reference cache.
    $GLOBALS['mbb_reference_pairs'] = [];
    return $s;
}
function mbb_collections_stamp(array $snapshot): array
{
    $p = $snapshot['post'];
    return [
        'post_id' => (int) $p->ID,
        'expected' => $snapshot['expected'],
        'pairHash' => $snapshot['hash'],
        'documentId' => $snapshot['document']['documentId'],
        'title' => $p->post_title,
        'status' => $p->post_status,
        'password' => $p->post_password,
        'url' => $p->post_status === 'publish' ? get_permalink($p) : '',
        'identity' => $snapshot['projection']['identity'],
    ];
}
function mbb_collections_final_stamp(array $stamp, bool $edit, bool $private): bool
{
    mbb_references_fresh_user();
    $p = mbb_references_fresh_post($stamp['post_id']);
    return $p &&
        mbb_managed($p->ID) &&
        mbb_references_readable($p) &&
        (!$edit || current_user_can('edit_post', $p->ID)) &&
        $p->post_password === '' &&
        ($private || $p->post_status === 'publish') &&
        hash_equals($stamp['expected'], mbb_token($p)) &&
        hash_equals($stamp['pairHash'], mbb_references_pair_hash($p)) &&
        mbb_id($p->ID) === $stamp['documentId'] &&
        ($p->post_status === 'publish' ? get_permalink($p) : '') === $stamp['url'];
}
function mbb_collections_tuple(array $identity): string
{
    return $identity['namespace'] . ':' . $identity['document'];
}
function mbb_collections_object(array $object, array $target, string $article, string $url): array
{
    if ($object['kind'] !== $target['kind']) {
        return ['state' => 'unavailable'];
    }
    return [
        'state' => 'available',
        'title' => $object['title'],
        'article' => $article,
        'label' =>
            ($object['displayKind'] === 'step'
                ? mbb_t('Stage')
                : ($object['displayKind'] === 'activity'
                    ? mbb_t('Activity')
                    : mbb_technical_label($object['displayKind']))) .
            ' ' .
            $object['number'],
        'url' => $url . '#' . rawurlencode($target['target']),
    ];
}
function mbb_collections_references(array $edges, array $selected, array &$outside): array
{
    global $wpdb;
    $map = [];
    foreach ($edges as $target) {
        $key = mbb_component_json($target);
        $tuple = mbb_collections_tuple($target);
        $map[$key] = ['state' => 'unavailable'];
        if (isset($selected[$tuple])) {
            $s = $selected[$tuple];
            $object = $s['objects'][$target['target']] ?? null;
            if ($object) {
                $map[$key] = mbb_collections_object(
                    $object,
                    $target,
                    $s['title'],
                    'chapters/' . $s['key'] . '.html',
                );
            }
            continue;
        }
        if (!array_key_exists($tuple, $outside)) {
            if (count($outside) >= MBB_COLLECTION_LIMITS['externalDocuments']) {
                mbb_collections_fail('collection_quota', 413);
            }
            $outside[$tuple] = null;
            $control = mbb_references_control();
            if (!$control || $control['state'] !== 'ready') {
                continue;
            }
            $t = mbb_references_tables();
            $row = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT post_id,pair_hash FROM {$t['claims']} WHERE generation=%d AND namespace_key=%s AND document_key=%s",
                    $control['active_generation'],
                    $target['namespace'],
                    $target['document'],
                ),
                ARRAY_A,
            );
            if ($row) {
                mbb_references_fresh_user();
                $p = mbb_references_fresh_post((int) $row['post_id']);
                // Test public scope before conversion. Author-readable private content is never resolved here.
                if (
                    $p &&
                    $p->post_status === 'publish' &&
                    $p->post_password === '' &&
                    mbb_references_readable($p)
                ) {
                    $s = mbb_references_snapshot((int) $p->ID);
                    if (
                        $s['projection']['identity'] === [
                            'namespace' => $target['namespace'],
                            'document' => $target['document'],
                        ] &&
                        $s['hash'] === $row['pair_hash']
                    ) {
                        $outside[$tuple] = [
                            'stamp' => mbb_collections_stamp($s),
                            'objects' => $s['projection']['objects'],
                        ];
                    }
                    $GLOBALS['mbb_reference_pairs'] = [];
                    unset($s);
                }
            }
        }
        if ($s = $outside[$tuple]) {
            $object = $s['objects'][$target['target']] ?? null;
            if ($object) {
                $map[$key] = mbb_collections_object(
                    $object,
                    $target,
                    $s['stamp']['title'],
                    $s['stamp']['url'],
                );
            }
        }
    }
    $out = [];
    foreach ($edges as $target) {
        $out[] = ['target' => $target, 'resolved' => $map[mbb_component_json($target)]];
    }
    return $out;
}
function mbb_collections_components(string $serialized): array
{
    if (!mbb_component_document_within_budget($serialized)) {
        mbb_collections_fail('collection_quota', 413);
    }
    $items = [];
    foreach (mbb_component_descriptors($serialized) as $id => $a) {
        $p = mbb_component_provider($a->component, $a->componentVersion);
        if (!empty($p['integrityChanged'])) {
            mbb_collections_fail('collection_changed');
        }
        $sha = null;
        $identity = null;
        $group = null;
        $status = $p['status'] ?? 'missing';
        if ($status === 'available') {
            $file = $p['resource']['file'];
            if (
                !is_file($file) ||
                is_link($file) ||
                filesize($file) > 524288 ||
                !hash_equals($p['resource']['sha256'], (string) hash_file('sha256', $file))
            ) {
                mbb_collections_fail('collection_changed');
            }
            $sha = $p['resource']['sha256'];
            if (($p['protocolVersion'] ?? 1) === 2) {
                try {
                    $checked = mbb_component_v2_check($p);
                    $identity = mbb_component_identity($p);
                    $group = [
                        'manifestSha256' => $checked['plan']['manifestSha256'],
                        'groupSha256' => $checked['plan']['groupSha256'],
                        'resources' => array_map(
                            static fn($r) => array_diff_key($r, ['file' => true]),
                            $checked['plan']['resources'],
                        ),
                    ];
                } catch (Throwable) {
                    mbb_collections_fail('collection_changed');
                }
            }
        }
        $items[] = [
            'id' => $id,
            'component' => $a->component,
            'version' => $a->componentVersion,
            'paramsSha256' => hash(
                'sha256',
                mbb_component_json(
                    in_array(
                        $a->params->format ?? null,
                        ['relation-map/v2', 'relation-map/v3', 'knowledge-map/v1'],
                        true,
                    )
                        ? (($a->params->format ?? null) === 'relation-map/v3'
                            ? array_intersect_key(
                                mbb_relation_map_v2_view($a->params, 'publication:' . $id),
                                array_flip(['map', 'display', 'edgeIds']),
                            )
                            : mbb_relation_map_v2_view($a->params, 'publication:' . $id)['map'])
                        : $a->params,
                ),
            ),
            'resourceSha256' => $sha,
            ...$identity !== null
                ? ['componentIdentity' => $identity, 'resourceGroup' => $group]
                : [],
            ...isset($p['executionProfile']) ? ['executionProfile' => $p['executionProfile']] : [],
            'status' => $status,
            'representation' => 'author-static-fallback',
            'projectionFingerprint' => function_exists('mbb_component_projection_fingerprint')
                ? mbb_component_projection_fingerprint($a->component, $a->componentVersion)
                : null,
        ];
    }
    return $items;
}
function mbb_collections_media(array $s): array
{
    // Clear both attachment objects and metadata even when a preceding chapter deduplicates bytes.
    $ids = get_posts([
        'post_type' => 'attachment',
        'post_status' => 'inherit',
        'post_parent' => $s['post']->ID,
        'posts_per_page' => 33,
        'fields' => 'ids',
        'no_found_rows' => true,
        'orderby' => 'ID',
        'order' => 'ASC',
    ]);
    foreach ($ids as $id) {
        clean_post_cache($id);
        wp_cache_delete($id, 'post_meta');
    }
    $plan = mbb_export_plan($s, 'collection-media', [], true);
    foreach ($plan['retainedImages'] as $item) {
        if (!mbb_static_export_external_url($item['url'])) {
            mbb_collections_fail('collection_media', 422);
        }
    }
    return $plan;
}
function mbb_collections_cover(int $id, array $selectedIds): array
{
    mbb_references_fresh_user();
    $p = mbb_references_fresh_post($id);
    if (
        !$p ||
        $p->post_type !== 'attachment' ||
        !current_user_can('edit_post', $id) ||
        !current_user_can('read_post', $id) ||
        ($p->post_parent && !in_array((int) $p->post_parent, $selectedIds, true))
    ) {
        mbb_collections_fail('collection_unavailable', 404);
    }
    $file = get_attached_file($id, true);
    if (!is_string($file)) {
        mbb_collections_fail('collection_media', 422);
    }
    $file = mbb_export_media_file($file);
    $bytes = filesize($file);
    if (!is_int($bytes) || $bytes < 1 || $bytes > MBB_COLLECTION_LIMITS['imageBytes']) {
        mbb_collections_fail('collection_quota', 413);
    }
    $image = mbb_resource_image($file, basename($file));
    $sha = hash_file('sha256', $file);
    $ext = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
    ][$image['mime']];
    return [
        'file' => $file,
        'id' => $id,
        'resource' =>
            ['path' => 'resources/' . $sha . '.' . $ext, 'sha256' => $sha, 'bytes' => $bytes] +
            $image,
    ];
}
function mbb_collections_body(
    string $serialized,
    array $map,
    array $mappings,
    array $retained,
    array $numbering = [],
): string {
    // Relative internal references are introduced only after the existing safe renderer has
    // validated every author-provided URL. Never relax its URL admission globally.
    $internal = [];
    foreach ($map as &$item) {
        $value = &$item['resolved'];
        if (
            ($value['state'] ?? '') === 'available' &&
            str_starts_with($value['url'], 'chapters/')
        ) {
            $placeholder = '#mbb-collection-' . hash('sha256', $value['url']);
            $internal[$placeholder] = $value['url'];
            $value['url'] = $placeholder;
        }
    }
    unset($value, $item);
    $body = mbb_static_export_body($serialized, $map, $numbering);
    [$doc, $xpath, $root] = mbb_static_export_fragment($body);
    $images = [];
    foreach ($mappings as $mapping) {
        $images[$mapping['from']] = 'resources/' . basename($mapping['to']);
    }
    $external = array_fill_keys(array_column($retained, 'url'), true);
    foreach (iterator_to_array($xpath->query('.//img', $root)) as $n) {
        $src = $n->getAttribute('src');
        if (isset($images[$src])) {
            $n->setAttribute('src', $images[$src]);
        } elseif (isset($external[$src]) && mbb_static_export_external_url($src)) {
            $link = $doc->createElement('a');
            $link->setAttribute('href', $src);
            $link->setAttribute('rel', 'noreferrer');
            $link->appendChild($doc->createTextNode($n->getAttribute('alt') ?: $src));
            if ($n->parentNode->nodeName === 'a') {
                $n->parentNode->parentNode->insertBefore($link, $n->parentNode->nextSibling);
                $n->parentNode->removeChild($n);
            } else {
                $n->parentNode->replaceChild($link, $n);
            }
        } else {
            mbb_collections_fail('collection_media', 422);
        }
    }
    foreach ($xpath->query('.//a[@href]', $root) as $n) {
        if (isset($internal[$n->getAttribute('href')])) {
            $n->setAttribute('href', $internal[$n->getAttribute('href')]);
        }
    }
    $out = '';
    foreach ($root->childNodes as $n) {
        $out .= $doc->saveHTML($n);
    }
    if (strlen($out) > MBB_COLLECTION_LIMITS['articleExportBytes']) {
        mbb_collections_fail('collection_quota', 413);
    }
    return $out;
}
function mbb_collections_write(string $path, string $bytes): void
{
    if (is_link($path) || file_exists($path)) {
        mbb_collections_fail('collection_storage', 503);
    }
    $handle = @fopen($path, 'xb');
    if (!$handle) {
        mbb_collections_fail('collection_storage', 503);
    }
    try {
        if (fwrite($handle, $bytes) !== strlen($bytes) || !fflush($handle) || !chmod($path, 0600)) {
            mbb_collections_fail('collection_storage', 503);
        }
    } finally {
        fclose($handle);
    }
}
/** Build one chapter at a time; $directory=null performs the identical verification without writes. */
function mbb_collections_snapshot(array $config, string $adapter, ?string $directory = null): array
{
    $owner = mbb_collections_owner();
    $session = mbb_collections_session();
    if (!$config['chapters']) {
        mbb_collections_fail('collection_empty', 422);
    }
    mbb_collections_config($config);
    if (!isset($GLOBALS['mbb_publication_adapters'][$adapter])) {
        mbb_collections_fail('collection_adapter', 503);
    }
    if (
        !in_array(
            $config['schema'],
            $GLOBALS['mbb_publication_adapters'][$adapter]['collectionSchemas'],
            true,
        )
    ) {
        mbb_collections_fail('collection_schema', 422);
    }
    $renderer = mbb_collections_renderer($adapter);
    $layout = mbb_collections_chapter_layout($config);
    $numbered = [];
    $selected = [];
    $stamps = [];
    $chapters = [];
    $references = 0;
    $projectionRemaining = 262144;
    foreach ($config['chapters'] as $chapter) {
        $s = mbb_collections_post($chapter['post_id'], $config['privateOptIn']);
        $stamps[$chapter['key']] = mbb_collections_stamp($s);
        $numbered[$chapter['key']] = mbb_collections_number_objects(
            $s['projection']['objects'],
            ($config['numbering'] ?? 'article') === 'chapter'
                ? $layout[$chapter['key']]['number']
                : null,
        );
        if ($identity = $s['projection']['identity']) {
            $tuple = mbb_collections_tuple($identity);
            if (isset($selected[$tuple])) {
                mbb_collections_fail('collection_identity', 409);
            }
            $selected[$tuple] = [
                'key' => $chapter['key'],
                'title' => $s['post']->post_title,
                'objects' => $numbered[$chapter['key']]['objects'],
            ];
        }
        $references += count($s['projection']['edges']);
        if ($references > MBB_COLLECTION_LIMITS['references']) {
            mbb_collections_fail('collection_quota', 413);
        }
        unset($s);
    }
    $relationStamps = [];
    $outside = [];
    $resources = [];
    $total = 0;
    $assetBytes = 0;
    $assets = [];
    $addResource = function (array $resource, string $file, int $id, bool $edit = false) use (
        &$resources,
        &$total,
        &$assetBytes,
        &$assets,
        $directory,
    ) {
        $path = $resource['path'];
        $assets[] = [
            'id' => $id,
            'file' => $file,
            'sha256' => $resource['sha256'],
            'bytes' => $resource['bytes'],
            'edit' => $edit,
            'parent' => (int) get_post_field('post_parent', $id),
            'binding' => hash(
                'sha256',
                mbb_collections_json([
                    get_post_meta($id, '_wp_attached_file', true),
                    get_post_meta($id, '_wp_attachment_metadata', true),
                ]),
            ),
        ];
        if (isset($resources[$path])) {
            return;
        }
        $assetBytes += $resource['bytes'];
        $total += $resource['bytes'];
        if (
            count($resources) >= MBB_COLLECTION_LIMITS['resources'] ||
            $assetBytes > MBB_COLLECTION_LIMITS['resourceBytes'] ||
            $total > MBB_COLLECTION_LIMITS['artifactBytes']
        ) {
            mbb_collections_fail('collection_quota', 413);
        }
        $resources[$path] = $resource;
        if ($directory !== null) {
            $input = @fopen($file, 'rb');
            $output = @fopen($directory . '/' . basename($path), 'xb');
            if (!$input || !$output) {
                if ($input) {
                    fclose($input);
                }
                if ($output) {
                    fclose($output);
                }
                mbb_collections_fail('collection_storage', 503);
            }
            try {
                $written = stream_copy_to_stream($input, $output, $resource['bytes'] + 1);
            } finally {
                fclose($input);
                fclose($output);
            }
            chmod($directory . '/' . basename($path), 0600);
            if (
                $written !== $resource['bytes'] ||
                !hash_equals(
                    $resource['sha256'],
                    (string) hash_file('sha256', $directory . '/' . basename($path)),
                )
            ) {
                mbb_collections_fail('collection_changed');
            }
        }
    };
    foreach ($config['chapters'] as $chapter) {
        $s = mbb_collections_post($chapter['post_id'], $config['privateOptIn']);
        if (mbb_collections_stamp($s) !== $stamps[$chapter['key']]) {
            mbb_collections_fail('collection_changed');
        }
        $relationStamps[(int) $s['post']->ID] = mbb_controlled_map_stamp(
            $s['document']['serialized'],
        );
        $map = mbb_collections_references($s['projection']['edges'], $selected, $outside);
        $plan = mbb_collections_media($s);
        foreach ($plan['resources'] as $r) {
            $file = $plan['files'][$r['path']];
            $r['path'] = 'resources/' . basename($r['path']);
            $addResource($r, $file['file'], $file['id']);
        }
        $body = mbb_collections_body(
            $s['document']['serialized'],
            $map,
            $plan['mappings'],
            $plan['retainedImages'],
            $numbered[$chapter['key']]['numbers'],
        );
        $total += strlen($body);
        if ($total > MBB_COLLECTION_LIMITS['artifactBytes']) {
            mbb_collections_fail('collection_quota', 413);
        }
        $chapters[] = [
            'key' => $chapter['key'],
            'path' => 'chapters/' . $chapter['key'] . '.html',
            'title' => $s['post']->post_title,
            'scope' => $s['post']->post_status === 'publish' ? 'public' : 'selected-private',
            'documentId' => $s['document']['documentId'],
            'identity' => $s['projection']['identity'],
            'sourceSha256' => hash('sha256', $s['document']['source']),
            'serializedSha256' => hash('sha256', $s['document']['serialized']),
            'bodyBytes' => strlen($body),
            'bodySha256' => hash('sha256', $body),
            'objects' => array_values($numbered[$chapter['key']]['objects']),
            'references' => $map,
            'components' => mbb_collections_components($s['document']['serialized']),
            ...$config['schema'] === 2
                ? $layout[$chapter['key']] + [
                        'numbering' => [
                            'mode' => $config['numbering'],
                            'applied' => array_keys($numbered[$chapter['key']]['numbers']),
                            'retained' => $numbered[$chapter['key']]['retained'],
                        ],
                    ]
                : [],
            'projectionPlan' => function_exists('mbb_component_projection_wire')
                ? mbb_component_projection_wire(
                    $s['document']['serialized'],
                    $config['lang'],
                    $projectionRemaining,
                )
                : null,
        ];
        if ($directory !== null) {
            mbb_collections_write($directory . '/' . $chapter['key'] . '.html', $body);
        }
        unset($s, $plan, $body);
    }
    $cover = null;
    if ($config['cover'] !== null) {
        $c = mbb_collections_cover($config['cover'], array_column($config['chapters'], 'post_id'));
        $addResource($c['resource'], $c['file'], $c['id'], true);
        $cover = $c['resource']['path'];
    }
    $css = mbb_static_export_styles();
    $total += strlen($css);
    $manifest = [
        'schema' => $config['schema'],
        ...$config['schema'] === 2
            ? array_intersect_key(
                $config,
                array_flip(['authors', 'edition', 'versionStatement', 'numbering']),
            )
            : [],
        'kind' => 'markbridge-publication-snapshot',
        'title' => $config['title'],
        'lang' => $config['lang'],
        'rights' => $config['rights'],
        'privateOptIn' => $config['privateOptIn'],
        'cover' => $cover,
        'renderer' => $renderer,
        'styles' => [
            'path' => 'styles/reading.css',
            'bytes' => strlen($css),
            'sha256' => hash('sha256', $css),
        ],
        'chapters' => $chapters,
        'resources' => array_values($resources),
    ];
    $json = mbb_collections_json($manifest);
    $total += strlen($json);
    if ($total > MBB_COLLECTION_LIMITS['artifactBytes']) {
        mbb_collections_fail('collection_quota', 413);
    }
    if ($directory !== null) {
        mbb_collections_write($directory . '/manifest.json', $json);
        mbb_collections_write($directory . '/reading.css', $css);
    }
    $dependencies = array_values(array_map(fn($v) => $v['stamp'], array_filter($outside)));
    $result = [
        'manifest' => $manifest,
        'sha256' => hash('sha256', $json),
        'bytes' => $total,
        'stamps' => $stamps,
        'outside' => $dependencies,
        'relationStamps' => $relationStamps,
        'assets' => $assets,
        'componentChecks' => array_merge(...array_column($chapters, 'components')),
        'owner' => $owner,
        'session' => $session,
        'renderer' => $renderer,
    ];
    mbb_component_publication_budget($result['componentChecks']);
    mbb_collections_final($result, $config, $adapter);
    return $result;
}
function mbb_collections_final(array $snapshot, array $config, string $adapter): void
{
    mbb_collections_owner($snapshot['owner']);
    if (
        $snapshot['session'] !== mbb_collections_session() ||
        $snapshot['renderer'] !== mbb_collections_renderer($adapter)
    ) {
        mbb_collections_fail('collection_changed');
    }
    foreach ($snapshot['stamps'] as $stamp) {
        if (!mbb_collections_final_stamp($stamp, true, $config['privateOptIn'])) {
            mbb_collections_fail('collection_changed');
        }
    }
    foreach ($snapshot['relationStamps'] ?? [] as $id => $stamp) {
        $post = mbb_references_fresh_post((int) $id);
        if (!$post || !hash_equals($stamp, mbb_controlled_map_stamp($post->post_content))) {
            mbb_collections_fail('collection_changed');
        }
    }
    foreach ($snapshot['outside'] as $stamp) {
        if (!mbb_collections_final_stamp($stamp, false, false)) {
            mbb_collections_fail('collection_changed');
        }
    }
    foreach ($snapshot['assets'] as $asset) {
        mbb_references_fresh_user();
        $p = mbb_references_fresh_post($asset['id']);
        if (
            !$p ||
            $p->post_type !== 'attachment' ||
            !current_user_can('read_post', $p->ID) ||
            ($asset['edit'] && !current_user_can('edit_post', $p->ID)) ||
            (int) $p->post_parent !== $asset['parent'] ||
            hash(
                'sha256',
                mbb_collections_json([
                    get_post_meta($p->ID, '_wp_attached_file', true),
                    get_post_meta($p->ID, '_wp_attachment_metadata', true),
                ]),
            ) !== $asset['binding'] ||
            !is_file($asset['file']) ||
            filesize($asset['file']) !== $asset['bytes'] ||
            !hash_equals(
                $asset['sha256'],
                (string) hash_file('sha256', mbb_export_media_file($asset['file'])),
            )
        ) {
            mbb_collections_fail('collection_changed');
        }
    }
    foreach ($snapshot['componentChecks'] as $component) {
        $p = mbb_component_provider($component['component'], $component['version']);
        if (
            ($component['projectionFingerprint'] ?? null) !==
            (function_exists('mbb_component_projection_fingerprint')
                ? mbb_component_projection_fingerprint(
                    $component['component'],
                    $component['version'],
                )
                : null)
        ) {
            mbb_collections_fail('collection_changed');
        }
        if (($component['componentIdentity'] ?? null) !== null) {
            try {
                mbb_component_v2_check($p);
                if (
                    !hash_equals($component['componentIdentity'], mbb_component_identity($p)) ||
                    ($component['executionProfile'] ?? null) !== ($p['executionProfile'] ?? null)
                ) {
                    throw new RuntimeException('component_changed');
                }
            } catch (Throwable) {
                mbb_collections_fail('collection_changed');
            }
        }
        if (($p['status'] ?? 'missing') !== $component['status']) {
            mbb_collections_fail('collection_changed');
        }
        if (
            $component['status'] === 'available' &&
            (!is_file($p['resource']['file']) ||
                is_link($p['resource']['file']) ||
                !hash_equals(
                    $component['resourceSha256'],
                    (string) hash_file('sha256', $p['resource']['file']),
                ))
        ) {
            mbb_collections_fail('collection_changed');
        }
    }
    // Later attachment checks may invoke capability filters. Recheck every source immediately before return.
    foreach ($snapshot['stamps'] as $stamp) {
        if (!mbb_collections_final_stamp($stamp, true, $config['privateOptIn'])) {
            mbb_collections_fail('collection_changed');
        }
    }
    foreach ($snapshot['relationStamps'] ?? [] as $id => $stamp) {
        $post = mbb_references_fresh_post((int) $id);
        if (!$post || !hash_equals($stamp, mbb_controlled_map_stamp($post->post_content))) {
            mbb_collections_fail('collection_changed');
        }
    }
    foreach ($snapshot['outside'] as $stamp) {
        if (!mbb_collections_final_stamp($stamp, false, false)) {
            mbb_collections_fail('collection_changed');
        }
    }
    mbb_collections_owner($snapshot['owner']);
}
function mbb_collections_snapshot_zip(array $manifest, callable $read, string $output): void
{
    $zip = new ZipArchive();
    if ($zip->open($output, ZipArchive::CREATE | ZipArchive::EXCL) !== true) {
        mbb_collections_fail('collection_storage', 503);
    }
    try {
        $paths = [
            'manifest.json',
            'styles/reading.css',
            ...array_column($manifest['chapters'], 'path'),
            ...array_column($manifest['resources'], 'path'),
        ];
        foreach ($paths as $path) {
            $input = $read($path);
            if (!$zip->addFile($input, $path)) {
                mbb_collections_fail('collection_storage', 503);
            }
            $zip->setMtimeName($path, 315532800);
            $zip->setExternalAttributesName($path, ZipArchive::OPSYS_UNIX, 0100600 << 16);
        }
    } finally {
        if (!$zip->close()) {
            mbb_collections_fail('collection_storage', 503);
        }
    }
    if (!chmod($output, 0600) || filesize($output) > MBB_COLLECTION_LIMITS['artifactBytes']) {
        mbb_collections_fail('collection_quota', 413);
    }
}
mbb_register_publication_adapter('snapshot-v1', [
    'collectionSchemas' => [1, 2],
    'contract' => 'mbb-publication-adapter/v1',
    'version' => '1.0.0',
    'fingerprint' => hash_file('sha256', __FILE__),
    'title' => 'Immutable publication snapshot',
    'extension' => 'zip',
    'mime' => 'application/zip',
    'build' => 'mbb_collections_snapshot_zip',
]);

add_action(
    'init',
    static function () {
        do_action('markbridge_register_publication_adapters');
    },
    12,
);
