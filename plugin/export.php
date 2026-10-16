<?php

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

require_once __DIR__ . '/includes/i18n.php';
// Read-only saved-document export. No source-file reads and no article writes.
require_once __DIR__ . '/includes/php-converter/ResourceImages.php';
require_once __DIR__ . '/static-export.php';
use MarkBridge\Probe\ResourceImages;

function mbb_export_config(): array
{
    return [
        'schema' => 1,
        'available' => is_user_logged_in(),
        'zipAvailable' =>
            class_exists('ZipArchive') &&
            class_exists('Normalizer') &&
            function_exists('posix_geteuid'),
        'ttlSeconds' => 900,
        'maxCandidates' => 4,
        'maxDocumentBytes' => 262144,
        'maxArchiveBytes' => 8388608,
        'maxExpandedBytes' => 33554432,
        'maxImages' => 32,
        'maxReferences' => 256,
    ];
}
function mbb_export_throw(string $code, string $message): never
{
    throw new RuntimeException($code . ':' . $message);
}
function mbb_export_error(Throwable $error)
{
    $parts = explode(':', $error->getMessage(), 2);
    $code = str_starts_with($parts[0], 'export_') ? $parts[0] : 'export_failed';
    return mbb_error(
        $code,
        $code === 'export_failed'
            ? mbb_t('Export did not complete. The saved article and source file are unchanged.')
            : $parts[1] ?? mbb_t('Export did not complete'),
        in_array($code, ['export_forbidden', 'export_scope'], true)
            ? 403
            : (in_array($code, ['export_unavailable', 'export_storage'], true)
                ? 503
                : 409),
    );
}
function mbb_export_permission($r)
{
    $id = $r['post_id'] ?? null;
    if (!is_int($id) || $id < 1) {
        return mbb_error('export_id', mbb_t('Choose a saved managed article.'), 422);
    }
    if (!is_user_logged_in() || !current_user_can('edit_post', $id)) {
        return mbb_error(
            'export_forbidden',
            mbb_t('The current account cannot export this article.'),
            403,
        );
    }
    $p = get_post($id);
    if (
        !$p ||
        !mbb_managed($id) ||
        !in_array($p->post_type, ['post', 'page'], true) ||
        in_array($p->post_status, ['trash', 'auto-draft'], true)
    ) {
        return mbb_error(
            'export_inactive',
            mbb_t('Only a saved managed article that remains editable can be exported.'),
            409,
        );
    }
    if (!is_string(mbb_id($id)) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,63}$/D', mbb_id($id))) {
        return mbb_error('export_identity', mbb_t('The saved document identity is invalid'), 409);
    }
    return true;
}
function mbb_export_keys(array $data, array $keys): void
{
    $actual = array_keys($data);
    sort($actual);
    sort($keys);
    if ($actual !== $keys) {
        mbb_export_throw(
            'export_request',
            mbb_t('The export request has unknown or missing fields'),
        );
    }
}
function mbb_export_snapshot(int $id, string $expected): array
{
    clean_post_cache($id);
    $permission = mbb_export_permission(['post_id' => $id]);
    if ($permission !== true) {
        mbb_export_throw($permission->get_error_code(), $permission->get_error_message());
    }
    $p = get_post($id);
    if (!preg_match('/^[a-f0-9]{64}$/D', $expected) || !hash_equals(mbb_token($p), $expected)) {
        mbb_export_throw(
            'export_conflict',
            mbb_t('The saved article changed. Prepare the export again'),
        );
    }
    $document = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $p->post_content_filtered,
        'serialized' => $p->post_content,
        'documentId' => mbb_id($id),
    ]);
    if (is_wp_error($document)) {
        mbb_export_throw(
            'export_pair',
            mbb_t('The saved representations do not match and cannot be exported'),
        );
    }
    return ['post' => $p, 'document' => $document];
}
function mbb_export_owner(): string
{
    return hash('sha256', mbb_resource_site() . ':' . get_current_user_id());
}
function mbb_export_slot(int $index): string
{
    return '_mbb_export_v1_' . mbb_export_owner() . '_' . $index;
}
function mbb_export_drop(string $key, array $record): bool
{
    // Compare-and-delete prevents an expired slot cleanup from deleting its successor.
    global $wpdb;
    $deleted = $wpdb->query(
        $wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name=%s AND option_value=%s",
            $key,
            maybe_serialize($record),
        ),
    );
    wp_cache_delete($key, 'options');
    if ($deleted && in_array($record['format'] ?? '', ['zip', 'portable-zip'], true)) {
        try {
            mbb_export_remove($record['token']);
        } catch (Throwable $error) {
            /* Foreign or unverifiable paths are never removed. */
        }
    }
    return (bool) $deleted;
}
function mbb_export_record(?string $token = null): ?array
{
    for ($index = 0; $index < 4; $index++) {
        $key = mbb_export_slot($index);
        $record = get_option($key, null);
        if (!is_array($record)) {
            continue;
        }
        if (($record['expires'] ?? 0) <= time()) {
            mbb_export_drop($key, $record);
            continue;
        }
        if ($token !== null && hash_equals($record['token'], $token)) {
            return ['key' => $key, 'record' => $record];
        }
    }
    return null;
}
function mbb_export_store(array $record): string
{
    mbb_export_record();
    for ($index = 0; $index < 4; $index++) {
        if (add_option(mbb_export_slot($index), $record, '', false)) {
            return mbb_export_slot($index);
        }
    }
    mbb_export_throw(
        'export_quota',
        mbb_t(
            'At most four export candidates can be kept. Cancel an older candidate or wait for expiration',
        ),
    );
}
function mbb_export_receipt(array $record): string
{
    return hash_hmac('sha256', mbb_component_json($record), wp_salt('auth'));
}
function mbb_export_ready(string $key, array $old, array $record): void
{
    global $wpdb;
    $updated = $wpdb->query(
        $wpdb->prepare(
            "UPDATE {$wpdb->options} SET option_value=%s WHERE option_name=%s AND option_value=%s",
            maybe_serialize($record),
            $key,
            maybe_serialize($old),
        ),
    );
    wp_cache_delete($key, 'options');
    if ($updated !== 1) {
        mbb_export_throw('export_expired', mbb_t('Export preparation was canceled or expired'));
    }
}
function mbb_export_directory(string $token, bool $create = false): string
{
    if (!mbb_export_config()['zipAvailable']) {
        mbb_export_throw(
            'export_unavailable',
            mbb_t(
                'ZIP export requires PHP zip, intl, and POSIX. Markdown single-file export remains available',
            ),
        );
    }
    if (!preg_match('/^[a-f0-9]{64}$/D', $token)) {
        mbb_export_throw('export_scope', mbb_t('The export identity is invalid'));
    }
    $root =
        rtrim(sys_get_temp_dir(), '/') .
        '/mbb-exports-' .
        mbb_export_owner() .
        '-' .
        posix_geteuid();
    foreach ([$root, $root . '/' . $token] as $path) {
        if (!file_exists($path) && $create && !is_link($path) && !mkdir($path, 0700)) {
            mbb_export_throw(
                'export_storage',
                mbb_t('Private export staging could not be created'),
            );
        }
        mbb_resource_private_owner($path);
        if (!is_dir($path) || realpath($path) !== $path) {
            mbb_export_throw('export_storage', mbb_t('The export staging path is unsafe'));
        }
        foreach ([ABSPATH, $_SERVER['DOCUMENT_ROOT'] ?? ''] as $web) {
            $web = $web ? realpath($web) : false;
            if ($web && ($path === $web || str_starts_with($path, $web . '/'))) {
                mbb_export_throw(
                    'export_storage',
                    mbb_t('Export staging must be outside the web root'),
                );
            }
        }
        if (!chmod($path, 0700)) {
            mbb_export_throw(
                'export_storage',
                mbb_t('Export directory permissions could not be restricted'),
            );
        }
    }
    return $root . '/' . $token;
}
function mbb_export_remove(string $token): void
{
    $dir = mbb_export_directory($token);
    foreach (scandir($dir) as $name) {
        if ($name === '.' || $name === '..') {
            continue;
        }
        if ($name !== 'export.zip') {
            mbb_export_throw(
                'export_storage',
                mbb_t('The export directory contains unknown files and was not removed'),
            );
        }
        mbb_resource_private_owner($dir . '/' . $name);
        if (!is_file($dir . '/' . $name) || is_link($dir . '/' . $name)) {
            mbb_export_throw('export_storage', mbb_t('The export file is unsafe'));
        }
        if (!unlink($dir . '/' . $name)) {
            mbb_export_throw('export_storage', mbb_t('The export file could not be removed'));
        }
    }
    rmdir($dir);
}
function mbb_export_media_file(string $file): string
{
    $uploads = wp_upload_dir();
    $base = realpath($uploads['basedir']);
    $real = realpath($file);
    if (!$base || !$real || !str_starts_with($real, $base . '/') || !is_file($real)) {
        mbb_export_throw('export_file', mbb_t('Images must be regular local files within uploads'));
    }
    // Check each path component before trusting realpath; never follow a symlink alias.
    $cursor = '/';
    foreach (explode('/', ltrim($file, '/')) as $part) {
        if ($part === '' || $part === '.' || $part === '..') {
            mbb_export_throw('export_file', mbb_t('The image path is not canonical'));
        }
        $cursor = rtrim($cursor, '/') . '/' . $part;
        if (is_link($cursor)) {
            mbb_export_throw(
                'export_file',
                mbb_t('The image path must not contain symbolic links'),
            );
        }
    }
    return $real;
}
function mbb_export_plan(array $snapshot, string $format): array
{
    $document = $snapshot['document'];
    $p = $snapshot['post'];
    if ($format === 'markdown') {
        return [
            'source' => $document['source'],
            'document' => [
                'bytes' => strlen($document['source']),
                'sha256' => hash('sha256', $document['source']),
            ],
            'resources' => [],
            'retainedImages' => [],
            'mappings' => [],
            'files' => [],
            'sidecar' => '',
        ];
    }
    $images = ResourceImages::urls($document['serialized']);
    if (count($images) > 256) {
        mbb_export_throw(
            'export_references',
            mbb_t('The body may contain at most 256 distinct image references for export'),
        );
    }
    $resources = [];
    $retained = [];
    $files = [];
    $mappings = [];
    if (in_array($format, ['zip', 'portable-zip', 'html'], true)) {
        if ($format === 'zip' && function_exists('mbb_native_media_portable_admission')) {
            $admission = mbb_native_media_portable_admission($document['serialized']);
            if (is_wp_error($admission)) {
                mbb_export_throw('export_images', $admission->get_error_message());
            }
        }
        if (
            in_array($format, ['zip', 'portable-zip'], true) &&
            !mbb_export_config()['zipAvailable']
        ) {
            mbb_export_throw(
                'export_unavailable',
                mbb_t(
                    'ZIP export dependencies are unavailable. Markdown single-file export remains available',
                ),
            );
        }
        $ids = get_posts([
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'post_parent' => $p->ID,
            'post_mime_type' => ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
            'posts_per_page' => 33,
            'fields' => 'ids',
            'orderby' => 'ID',
            'order' => 'ASC',
            'no_found_rows' => true,
        ]);
        if (count($ids) > 32) {
            mbb_export_throw(
                'export_images',
                mbb_t(
                    'The article has more than 32 related images; silent truncation is not allowed',
                ),
            );
        }
        $ids = array_values(array_unique($ids));
        if (count($ids) > 32) {
            mbb_export_throw(
                'export_images',
                mbb_t('More than 32 attachments were found for verification'),
            );
        }
        $known = [];
        foreach ($ids as $id) {
            if (!current_user_can('read_post', $id) || get_post_type($id) !== 'attachment') {
                continue;
            }
            $file = get_attached_file($id, true);
            $url = wp_get_attachment_url($id);
            if (is_string($file) && is_string($url)) {
                $known[$url] = ['id' => (int) $id, 'file' => $file];
            }
            $metadata = wp_get_attachment_metadata($id);
            foreach ($metadata['sizes'] ?? [] as $size => $entry) {
                $image = wp_get_attachment_image_src($id, $size);
                if (
                    !$image ||
                    !is_string($entry['file'] ?? null) ||
                    basename($entry['file']) !== $entry['file']
                ) {
                    continue;
                }
                $known[$image[0]] = [
                    'id' => (int) $id,
                    'file' => dirname($file) . '/' . $entry['file'],
                ];
            }
        }
        foreach ($images as $url) {
            if (!isset($known[$url])) {
                $retained[] = [
                    'url' => $url,
                    'reason' => mbb_t(
                        'This URL was not verified as a readable local attachment related to this article. The URL is preserved and is not fetched',
                    ),
                ];
                continue;
            }
            $item = $known[$url];
            $file = mbb_export_media_file($item['file']);
            $bytes = filesize($file);
            if (!is_int($bytes) || $bytes < 1 || $bytes > 8388608) {
                mbb_export_throw('export_size', mbb_t('Each image is limited to 8 MiB'));
            }
            $image = mbb_resource_image($file, basename($file));
            $ext = [
                'image/png' => 'png',
                'image/jpeg' => 'jpg',
                'image/gif' => 'gif',
                'image/webp' => 'webp',
            ][$image['mime']];
            $sha = hash_file('sha256', $file);
            if (!$sha) {
                mbb_export_throw('export_file', mbb_t('The image digest could not be read'));
            }
            $path = 'images/' . $sha . '.' . $ext;
            $mappings[] = ['from' => $url, 'to' => $path];
            if (!isset($files[$path])) {
                $resources[] = array_merge(
                    ['path' => $path, 'bytes' => $bytes, 'sha256' => $sha],
                    $image,
                );
                $files[$path] = [
                    'file' => $file,
                    'id' => $item['id'],
                    'url' => $url,
                    'sha256' => $sha,
                ];
            }
        }
        if (count($resources) > 32) {
            mbb_export_throw('export_images', mbb_t('At most 32 actual images may be exported'));
        }
        if ($format === 'html') {
            if ($retained) {
                mbb_export_throw(
                    'export_images',
                    mbb_t(
                        'Static HTML requires every image to be a verified local attachment of this article',
                    ),
                );
            }
            $descriptor = mbb_static_export_descriptor($snapshot, $files, $resources, $mappings);
            $json = mbb_component_json($descriptor);
            return [
                'source' => $json,
                'preview' => $descriptor['body'],
                'document' => ['bytes' => strlen($json), 'sha256' => hash('sha256', $json)],
                'resources' => $resources,
                'retainedImages' => [],
                'mappings' => $mappings,
                'files' => $files,
                'sidecar' => '',
            ];
        }
        $projected = mbb_convert([
            'mode' => $format === 'portable-zip' ? 'portable_detach' : 'portable_images',
            'documentId' => $document['documentId'],
            'base' => $document,
            'mappings' => $mappings,
        ]);
        if (is_wp_error($projected)) {
            mbb_export_throw(
                'export_projection',
                mbb_t(
                    'Image targets cannot be changed while preserving the remaining body bytes. Choose Markdown single-file export or correct the references',
                ),
            );
        }
        if ($format === 'portable-zip' && $retained) {
            mbb_export_throw(
                'export_images',
                mbb_t(
                    'Cross-site ZIP requires every image to be a verified local attachment of this article',
                ),
            );
        }
        $source = $projected['source'];
    } else {
        $source = $document['source'];
    }
    $digest = ['bytes' => strlen($source), 'sha256' => hash('sha256', $source)];
    $metadata = mbb_frontmatter_current($p);
    $sidecar = [
        'schema' => $format === 'portable-zip' ? 2 : 1,
        'kind' => 'markbridge-portable',
        'document' => array_merge(
            [
                'path' => 'document.md',
                'representation' => 'portable',
                'originalSourceSha256' => hash('sha256', $document['source']),
            ],
            $digest,
        ),
        'resources' => $resources,
        'metadata' => array_intersect_key(
            $metadata,
            array_flip(['title', 'excerpt', 'slug', 'categories', 'tags']),
        ),
    ];
    if ($format === 'portable-zip') {
        $sidecar['mediaAssociation'] = 'create-new';
    }
    $json = mbb_component_json($sidecar);
    mbb_resource_export_sidecar($json, ['path' => 'document.md'] + $digest, $resources);
    if (
        $digest['bytes'] > 262144 ||
        strlen($json) > 262144 ||
        $digest['bytes'] + strlen($json) + array_sum(array_column($resources, 'bytes')) > 33554432
    ) {
        mbb_export_throw(
            'export_size',
            mbb_t('The uncompressed export exceeds its budget. Content was not truncated'),
        );
    }
    return [
        'source' => $source,
        'document' => $digest,
        'resources' => $resources,
        'retainedImages' => $retained,
        'mappings' => $mappings,
        'files' => $files,
        'sidecar' => $json,
    ];
}
function mbb_export_plan_digest(array $plan): string
{
    return hash(
        'sha256',
        mbb_component_json([
            $plan['document'],
            $plan['resources'],
            $plan['mappings'],
            $plan['sidecar'],
            array_map(static fn($file) => array_diff_key($file, ['file' => true]), $plan['files']),
        ]),
    );
}
function mbb_export_prepare($r)
{
    $token = null;
    $stored = false;
    $reservation = null;
    $slotKey = null;
    try {
        $data = $r->get_json_params();
        if (!is_array($data)) {
            mbb_export_throw('export_request', mbb_t('A JSON export request is required'));
        }
        mbb_export_keys($data, ['schema', 'post_id', 'expected', 'format']);
        if (
            $data['schema'] !== 1 ||
            !is_int($data['post_id']) ||
            !is_string($data['expected']) ||
            !in_array($data['format'], ['markdown', 'zip', 'portable-zip', 'html'], true)
        ) {
            mbb_export_throw('export_request', mbb_t('The export request has invalid field types'));
        }
        $snapshot = mbb_export_snapshot($data['post_id'], $data['expected']);
        $plan = mbb_export_plan($snapshot, $data['format']);
        $token = bin2hex(random_bytes(32));
        $record = [
            'schema' => 1,
            'token' => $token,
            'site' => mbb_resource_site(),
            'user' => get_current_user_id(),
            'post' => $data['post_id'],
            'documentId' => $snapshot['document']['documentId'],
            'expected' => $data['expected'],
            'format' => $data['format'],
            'expires' => time() + 900,
            'digest' => mbb_export_plan_digest($plan),
            'state' => 'ready',
        ];
        if (in_array($data['format'], ['zip', 'portable-zip'], true)) {
            $reservation = $record;
            $reservation['state'] = 'preparing';
            $slotKey = mbb_export_store($reservation);
            $dir = mbb_export_directory($token, true);
            $zip = new ZipArchive();
            if ($zip->open($dir . '/export.zip', ZipArchive::CREATE | ZipArchive::EXCL) !== true) {
                mbb_export_throw(
                    'export_storage',
                    mbb_t('The export archive could not be created'),
                );
            }
            try {
                if (
                    !$zip->addFromString('document.md', $plan['source']) ||
                    !$zip->addFromString('markbridge-export.json', $plan['sidecar'])
                ) {
                    mbb_export_throw(
                        'export_storage',
                        mbb_t('The exported body could not be written'),
                    );
                }
                foreach ($plan['files'] as $name => $file) {
                    // Read verified bytes now instead of leaving ZipArchive deferred file reads.
                    $bytes = file_get_contents($file['file']);
                    if (
                        !is_string($bytes) ||
                        !hash_equals($file['sha256'], hash('sha256', $bytes)) ||
                        !$zip->addFromString($name, $bytes)
                    ) {
                        mbb_export_throw(
                            'export_file',
                            mbb_t('An image changed during packaging. Export did not complete'),
                        );
                    }
                }
            } finally {
                if (!$zip->close()) {
                    mbb_export_throw('export_storage', mbb_t('The ZIP could not be completed'));
                }
            }
            chmod($dir . '/export.zip', 0600);
            $bytes = filesize($dir . '/export.zip');
            if (!is_int($bytes) || $bytes > 8388608) {
                mbb_export_throw(
                    'export_size',
                    mbb_t('The compressed archive is limited to 8 MiB. Images were not truncated'),
                );
            }
            $record['archive'] = [
                'bytes' => $bytes,
                'sha256' => hash_file('sha256', $dir . '/export.zip'),
            ];
        }
        $latest = mbb_export_snapshot($data['post_id'], $data['expected']);
        if (
            !hash_equals(
                $record['digest'],
                mbb_export_plan_digest(mbb_export_plan($latest, $data['format'])),
            )
        ) {
            mbb_export_throw(
                'export_changed',
                mbb_t('Resources changed during preparation. Prepare again'),
            );
        }
        if ($slotKey) {
            mbb_export_ready($slotKey, $reservation, $record);
        } else {
            mbb_export_store($record);
        }
        $stored = true;
        return [
            'schema' => 1,
            'token' => $token,
            'expiresAt' => $record['expires'],
            'format' => $record['format'],
            'document' => $plan['document'],
            'resources' => $plan['resources'],
            'retainedImages' => $plan['retainedImages'],
            'projectedSource' => $plan['preview'] ?? $plan['source'],
            'changes' => $plan['mappings'],
            'receipt' => mbb_export_receipt($record),
            'limits' => mbb_export_config(),
        ];
    } catch (Throwable $error) {
        if ($token && !$stored) {
            if ($slotKey) {
                mbb_export_drop($slotKey, $reservation);
            }
            try {
                mbb_export_remove($token);
            } catch (Throwable $cleanup) {
            }
        }
        return mbb_export_error($error);
    }
}
function mbb_export_load(string $token): array
{
    if (!is_user_logged_in() || !preg_match('/^[a-f0-9]{64}$/D', $token)) {
        mbb_export_throw(
            'export_scope',
            mbb_t('The export candidate does not belong to the current identity'),
        );
    }
    $slot = mbb_export_record($token);
    if (!$slot) {
        mbb_export_throw(
            'export_expired',
            mbb_t('The export candidate expired or was canceled. Prepare again'),
        );
    }
    if (
        ($slot['record']['site'] ?? null) !== mbb_resource_site() ||
        ($slot['record']['user'] ?? null) !== get_current_user_id() ||
        ($slot['record']['schema'] ?? null) !== 1
    ) {
        mbb_export_throw('export_scope', mbb_t('The export candidate identity does not match'));
    }
    return $slot;
}
function mbb_export_download($r)
{
    try {
        $slot = mbb_export_load($r['token']);
        $record = $slot['record'];
        if (($record['state'] ?? null) !== 'ready') {
            mbb_export_throw(
                'export_pending',
                mbb_t(
                    'The export is still preparing or was interrupted. Cancel it or wait for cleanup',
                ),
            );
        }
        $data = $r->get_json_params();
        if (!is_array($data)) {
            mbb_export_throw('export_request', mbb_t('Explicit export confirmation is required'));
        }
        mbb_export_keys($data, ['schema', 'receipt']);
        if (
            $data['schema'] !== 1 ||
            !is_string($data['receipt']) ||
            !hash_equals(mbb_export_receipt($record), $data['receipt'])
        ) {
            mbb_export_throw(
                'export_receipt',
                mbb_t('The export confirmation receipt does not match'),
            );
        }
        $snapshot = mbb_export_snapshot($record['post'], $record['expected']);
        if ($snapshot['document']['documentId'] !== $record['documentId']) {
            mbb_export_throw('export_scope', mbb_t('The article identity changed'));
        }
        $plan = mbb_export_plan($snapshot, $record['format']);
        if (!hash_equals($record['digest'], mbb_export_plan_digest($plan))) {
            mbb_export_throw(
                'export_changed',
                mbb_t('Images or export metadata changed. Prepare again'),
            );
        }
        $body = $plan['source'];
        if (in_array($record['format'], ['zip', 'portable-zip'], true)) {
            $file = mbb_export_directory($record['token']) . '/export.zip';
            mbb_resource_private_owner($file);
            if (!is_file($file) || filesize($file) !== $record['archive']['bytes']) {
                mbb_export_throw('export_changed', mbb_t('The staged archive changed'));
            }
            $body = file_get_contents($file);
            if (
                !is_string($body) ||
                !hash_equals(hash('sha256', $body), $record['archive']['sha256'])
            ) {
                mbb_export_throw(
                    'export_changed',
                    mbb_t('The staged archive digest does not match'),
                );
            }
        }
        $latest = mbb_export_snapshot($record['post'], $record['expected']);
        if (
            !hash_equals(
                $record['digest'],
                mbb_export_plan_digest(mbb_export_plan($latest, $record['format'])),
            )
        ) {
            mbb_export_throw(
                'export_changed',
                mbb_t('Resources changed during download. Prepare again'),
            );
        }
        if ($record['expires'] <= time() || !mbb_export_drop($slot['key'], $record)) {
            mbb_export_throw(
                'export_expired',
                mbb_t('The export was canceled or claimed during confirmation'),
            );
        }
        return new WP_REST_Response($body, 200, [
            'Content-Type' => in_array($record['format'], ['zip', 'portable-zip'], true)
                ? 'application/zip'
                : ($record['format'] === 'html'
                    ? 'application/json; charset=UTF-8'
                    : 'text/markdown; charset=UTF-8'),
            'Content-Disposition' =>
                'attachment; filename="markbridge-' .
                $record['documentId'] .
                (in_array($record['format'], ['zip', 'portable-zip'], true)
                    ? '.zip'
                    : ($record['format'] === 'html'
                        ? '.json'
                        : '.md')) .
                '"',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
            'X-MBB-Export' => '1',
        ]);
    } catch (Throwable $error) {
        return mbb_export_error($error);
    }
}
function mbb_export_cancel($r)
{
    try {
        $slot = mbb_export_load($r['token']);
        mbb_export_drop($slot['key'], $slot['record']);
        return ['schema' => 1, 'cancelled' => true];
    } catch (Throwable $error) {
        return mbb_export_error($error);
    }
}
add_action('rest_api_init', function () {
    register_rest_route('mbb/v1', '/export/context', [
        'methods' => 'GET',
        'permission_callback' => static function ($r) {
            if (
                !is_scalar($r['post_id']) ||
                !preg_match('/^[1-9][0-9]{0,12}$/D', (string) $r['post_id'])
            ) {
                return mbb_error('export_id', mbb_t('A valid article ID is required'), 422);
            }
            return mbb_export_permission(['post_id' => absint($r['post_id'])]);
        },
        'callback' => static function ($r) {
            try {
                $id = absint($r['post_id']);
                clean_post_cache($id);
                $snapshot = mbb_export_snapshot($id, mbb_token(get_post($id)));
                return [
                    'schema' => 1,
                    'post_id' => $id,
                    'expected' => mbb_token($snapshot['post']),
                    'documentId' => $snapshot['document']['documentId'],
                ];
            } catch (Throwable $error) {
                return mbb_export_error($error);
            }
        },
    ]);
    register_rest_route('mbb/v1', '/export/prepare', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_export_permission',
        'callback' => 'mbb_export_prepare',
    ]);
    register_rest_route('mbb/v1', '/export/(?P<token>[a-f0-9]{64})/download', [
        'methods' => 'POST',
        'permission_callback' => static fn() => is_user_logged_in(),
        'callback' => 'mbb_export_download',
    ]);
    register_rest_route('mbb/v1', '/export/(?P<token>[a-f0-9]{64})', [
        'methods' => 'DELETE',
        'permission_callback' => static fn() => is_user_logged_in(),
        'callback' => 'mbb_export_cancel',
    ]);
});
add_filter(
    'rest_pre_serve_request',
    function ($served, $result, $request, $server) {
        if (
            $served ||
            !str_starts_with($request->get_route(), '/mbb/v1/export/') ||
            !($result instanceof WP_REST_Response) ||
            ($result->get_headers()['X-MBB-Export'] ?? '') !== '1' ||
            !is_string($result->get_data())
        ) {
            return $served;
        }
        echo $result->get_data();
        return true;
    },
    10,
    4,
);
