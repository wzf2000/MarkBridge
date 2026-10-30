<?php
/** Current-request article resolution. No viewer-dependent result is cached. */
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}
require_once __DIR__ . '/knowledge-map.php';
require_once __DIR__ . '/relation-map-v3.php';
function mbb_relation_map_article(stdClass $target): ?array
{
    if (!mbb_relation_map_v2_target($target) || !function_exists('mbb_references_control')) {
        return null;
    }
    global $wpdb;
    try {
        mbb_references_fresh_user();
        $control = mbb_references_control();
        if (!$control || $control['state'] !== 'ready') {
            return null;
        }
        $claim = null;
        if ($target->kind === 'document') {
            $tables = mbb_references_tables();
            $claim = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT post_id,pair_hash FROM {$tables['claims']} WHERE generation=%d AND namespace_key=%s AND document_key=%s",
                    $control['active_generation'],
                    $target->namespace,
                    $target->document,
                ),
                ARRAY_A,
            );
            if (!$claim) {
                return null;
            }
            $id = (int) $claim['post_id'];
        } else {
            if (!hash_equals($control['site_namespace'], $target->site)) {
                return null;
            }
            // Count all owners before permissions, including trash and inaccessible duplicates.
            $owners = $wpdb->get_col(
                $wpdb->prepare(
                    "SELECT DISTINCT post_id FROM {$wpdb->postmeta} WHERE meta_key IN ('_mbb_document_id','_mbb_fixture_id') AND BINARY meta_value=BINARY %s ORDER BY post_id LIMIT 2",
                    $target->documentId,
                ),
            );
            if (count($owners) !== 1) {
                return null;
            }
            $id = (int) $owners[0];
        }
        $snapshot = mbb_references_snapshot($id);
        if (
            $claim &&
            (!hash_equals($claim['pair_hash'], $snapshot['hash']) ||
                $snapshot['projection']['identity'] !== [
                    'namespace' => $target->namespace,
                    'document' => $target->document,
                ])
        ) {
            return null;
        }
        if (!$claim && mbb_id($id) !== $target->documentId) {
            return null;
        }
        if (!mbb_references_final($id, $snapshot['hash'])) {
            return null;
        }
        unset($snapshot['document'], $snapshot['projection']);
        return $snapshot;
    } catch (Throwable) {
        return null;
    }
}
function mbb_relation_map_private_headers(): void
{
    $GLOBALS['mbb_relation_map_private_rendered'] = true;
    if (!headers_sent()) {
        header('Cache-Control: private, no-store, max-age=0');
        header('Vary: Cookie', false);
    }
    if (!defined('DONOTCACHEPAGE')) {
        define('DONOTCACHEPAGE', true);
    }
}
/** Closed, viewer-safe v1 drawing data; no author targets or semantic IDs cross this boundary. */
function mbb_relation_map_v2_view(mixed $params, string $context): array
{
    mbb_relation_map_private_headers();
    $empty = [
        'map' => null,
        'dependencies' => [],
        'edgeIds' => [],
        'display' => ['mobileStart' => null],
    ];
    if (
        !(($params->format ?? null) === 'knowledge-map/v1'
            ? mbb_knowledge_map_valid($params)
            : (($params->format ?? null) === 'relation-map/v3'
                ? mbb_relation_map_v3_valid($params)
                : mbb_relation_map_v2_valid($params)))
    ) {
        return $empty;
    }
    $resolved = [];
    foreach ($params->nodes as $node) {
        $snapshot = mbb_controlled_map_snapshot($node->target);
        if ($snapshot) {
            $resolved[$node->id] = [$node, $snapshot];
        }
    }
    // Recheck every dependency after all work; stale results never survive a mixed snapshot.
    foreach ($resolved as $id => [$node, $snapshot]) {
        $fresh = mbb_controlled_map_snapshot($node->target);
        if (
            !$fresh ||
            $fresh['post']->ID !== $snapshot['post']->ID ||
            !hash_equals($fresh['hash'], $snapshot['hash'])
        ) {
            unset($resolved[$id]);
        }
    }
    $opaque = static fn($kind, $id) => $kind .
        '_' .
        substr(hash_hmac('sha256', $context . '\0' . $kind . '\0' . $id, wp_salt('auth')), 0, 32);
    $groups = [];
    $nodes = [];
    $edges = [];
    $dependencies = [];
    $edgeIds = [];
    foreach ($resolved as [$node, $snapshot]) {
        $post = $snapshot['post'];
        $url =
            $post->post_status === 'publish' ? get_permalink($post) : get_preview_post_link($post);
        $url .= $snapshot['fragment'] ?? '';
        if (!mbb_relation_map_url($url)) {
            continue;
        }
        $next = (object) [
            'id' => $opaque('n', $node->id),
            'group' => $opaque('g', $node->group),
            'title' =>
                ($params->format === 'knowledge-map/v1'
                    ? mbb_knowledge_map_role($node->role)
                    : '') . $node->title,
            'url' => $url,
        ];
        if (isset($node->description)) {
            $next->description = $node->description;
        }
        $nodes[$node->id] = $next;
        $dependencies[] = ['post_id' => (int) $post->ID, 'hash' => $snapshot['hash']];
    }
    foreach ($params->groups as $g) {
        if (array_filter($nodes, static fn($n) => $n->group === $opaque('g', $g->id))) {
            $groups[] = (object) ['id' => $opaque('g', $g->id), 'title' => $g->title];
        }
    }
    foreach ($params->edges as $edge) {
        if (isset($nodes[$edge->from], $nodes[$edge->to])) {
            $next = (object) [
                'from' => $nodes[$edge->from]->id,
                'to' => $nodes[$edge->to]->id,
                'kind' =>
                    $params->format === 'knowledge-map/v1'
                        ? [
                            'prerequisite' => 'recommended',
                            'explains' => 'compare',
                            'practises' => 'optimization',
                        ][$edge->kind]
                        : $edge->kind,
            ];
            if (isset($edge->why)) {
                $next->why = $edge->why;
            }
            $edges[] = $next;
            $edgeIds[] = $opaque('e', $edge->id);
        }
    }
    if (!$nodes) {
        return $empty;
    }
    $map = (object) [
        'format' => 'relation-map/v1',
        'title' => $params->title,
        'groups' => $groups,
        'nodes' => array_values($nodes),
        'edges' => $edges,
    ];
    if (!mbb_relation_map_valid($map, $params->format === 'relation-map/v3' ? 65536 : 16384)) {
        return $empty;
    }
    $display = ['mobileStart' => null];
    if ($params->format === 'relation-map/v3') {
        $hint = $params->display->mobileStart;
        // Only final emitted nodes establish visibility, never the first resolver pass.
        if ($hint->kind === 'node' && isset($nodes[$hint->id])) {
            $display['mobileStart'] = ['kind' => 'node', 'id' => $nodes[$hint->id]->id];
        } elseif (
            $hint->kind === 'group' &&
            array_filter($nodes, static fn($n) => $n->group === $opaque('g', $hint->id))
        ) {
            $display['mobileStart'] = ['kind' => 'group', 'id' => $opaque('g', $hint->id)];
        }
    }
    return [
        'map' => $map,
        'dependencies' => $dependencies,
        'edgeIds' => $edgeIds,
        'display' => $display,
    ];
}
/** Render from fresh server-only author attributes, including when the provider is missing. */
function mbb_relation_map_v2_render(string $html, array $attrs): string
{
    $params = json_decode(mbb_component_json($attrs['params'] ?? null));
    $view = mbb_relation_map_v2_view($params, (string) get_the_ID() . ':' . ($attrs['id'] ?? ''));
    $doc = new DOMDocument('1.0', 'UTF-8');
    $old = libxml_use_internal_errors(true);
    try {
        $doc->loadHTML('<?xml encoding="utf-8"?>' . $html, LIBXML_NONET);
        $xp = new DOMXPath($doc);
        foreach (
            iterator_to_array(
                $xp->query(
                    '//*[contains(concat(" ",normalize-space(@class)," ")," mbb-component-params ")]',
                ),
            )
            as $carrier
        ) {
            $carrier->parentNode->removeChild($carrier);
        }
        $body = '';
        foreach (
            $xp->query(
                '//*[contains(concat(" ",normalize-space(@class)," ")," wp-block-mbb-component ")]/div[contains(concat(" ",normalize-space(@class)," ")," mbb-teaching-body ")]',
            )
            as $n
        ) {
            foreach ($n->childNodes as $child) {
                $body .= $doc->saveHTML($child);
            }
            break;
        }
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($old);
    }
    $static =
        $view['map'] && count($view['map']->nodes) === count($params->nodes)
            ? ''
            : '<p data-mbb-generated="" data-mbb-relation-notice="">' .
                esc_html(mbb_t('Some articles may be unavailable.')) .
                '</p>';
    $config = [
        'reader' =>
            $params->format === 'knowledge-map/v1'
                ? 'knowledge-map/public-v1'
                : ($params->format === 'relation-map/v3'
                    ? 'relation-map/public-v3'
                    : 'relation-map/public-v2'),
        'publicView' => $view['map'],
        'edgeIds' => $view['edgeIds'],
        ...$params->format === 'relation-map/v3' ? ['display' => $view['display']] : [],
        'status' => 'unavailable',
    ];
    if ($view['map']) {
        $out = new DOMDocument('1.0', 'UTF-8');
        $root = $out->createElement('section');
        $root->setAttribute('class', 'mbb-projection');
        $root->setAttribute('data-mbb-generated', '');
        $out->appendChild($root);
        mbb_relation_map_append(
            $out,
            $root,
            mbb_relation_map_envelope(
                $view['map'],
                determine_locale(),
                $params->format === 'relation-map/v3' ? 65536 : 16384,
            ),
            $params->format === 'knowledge-map/v1' ? 'knowledge-map/v1' : null,
            $params->format === 'relation-map/v3' ? $view['edgeIds'] : [],
            $params->format === 'relation-map/v3' ? 65536 : 16384,
        );
        $static .= $out->saveHTML($root);
        $provider = mbb_component_provider(
            $attrs['component'] ?? '',
            $attrs['componentVersion'] ?? '',
        );
        if (
            ($provider['readerMode'] ?? null) === $params->format &&
            ($provider['status'] ?? null) === 'available'
        ) {
            $config['status'] = 'available';
        }
    }
    return '<div class="wp-block-mbb-component" id="' .
        esc_attr($attrs['id'] ?? '') .
        '" data-mbb-teaching="component" data-mbb-teaching-config="' .
        esc_attr(mbb_component_json($config)) .
        '">' .
        $static .
        '<div class="mbb-teaching-body">' .
        $body .
        '</div></div>';
}
/** Non-public fingerprint for prepared exports. Re-resolves permissions, identity and pairs. */
function mbb_relation_map_v2_stamp(string $serialized): string
{
    // Plain saved documents need no component registry. Inspect the block marker,
    // never the raw format value: valid JSON may escape its slash or Unicode.
    if (!preg_match('/<!--\s*wp:mbb\/component(?:\s|-->)/', $serialized)) {
        return hash('sha256', mbb_component_json([]));
    }
    if (!function_exists('mbb_component_descriptors')) {
        throw new RuntimeException('relation_map_component_registry');
    }
    $parts = [];
    foreach (mbb_component_descriptors($serialized) as $id => $attrs) {
        if (
            in_array($attrs->params->format ?? null, ['relation-map/v2', 'relation-map/v3'], true)
        ) {
            $parts[$id] = mbb_relation_map_v2_view($attrs->params, 'export:' . $id);
        }
    }
    return hash('sha256', mbb_component_json($parts));
}
function mbb_relation_map_article_search($request)
{
    try {
        if ($request->get_method() === 'POST') {
            $input = $request->get_json_params();
            if (
                strlen((string) $request->get_body()) > 2048 ||
                !is_array($input) ||
                array_keys($input) !== ['target']
            ) {
                return mbb_error(
                    'reference_input',
                    mbb_t('The reference operation input is invalid.'),
                    422,
                );
            }
            $target = json_decode(wp_json_encode($input['target']));
            $snapshot = $target instanceof stdClass ? mbb_relation_map_article($target) : null;
            if (!$snapshot) {
                return ['state' => 'unavailable'];
            }
            $fresh = mbb_relation_map_article($target);
            if (
                !$fresh ||
                (int) $fresh['post']->ID !== (int) $snapshot['post']->ID ||
                !hash_equals($snapshot['hash'], $fresh['hash'])
            ) {
                return ['state' => 'unavailable'];
            }
            return ['state' => 'available', 'title' => $fresh['post']->post_title];
        }
        $q = $request['q'] ?? '';
        if (!is_string($q) || strlen($q) > 200) {
            return mbb_error(
                'reference_input',
                mbb_t('The reference operation input is invalid.'),
                422,
            );
        }
        $control = mbb_references_control();
        if (!$control || $control['state'] !== 'ready') {
            return ['state' => 'unavailable', 'items' => []];
        }
        $query = new WP_Query([
            'post_type' => ['post', 'page'],
            'post_status' => 'any',
            'posts_per_page' => 200,
            'orderby' => 'ID',
            'order' => 'ASC',
            'fields' => 'ids',
            'no_found_rows' => true,
            's' => $q,
            'meta_key' => '_mbb_origin',
            'meta_value' => 'markdown_import',
        ]);
        $items = [];
        foreach ($query->posts as $id) {
            try {
                $snapshot = mbb_references_snapshot((int) $id);
                $identity = $snapshot['projection']['identity'];
                $target = $identity
                    ? (object) (['kind' => 'document'] + $identity)
                    : (object) [
                        'kind' => 'local-document',
                        'site' => $control['site_namespace'],
                        'documentId' => mbb_id($id),
                    ];
                $fresh = mbb_relation_map_article($target);
                if (!$fresh || !hash_equals($fresh['hash'], $snapshot['hash'])) {
                    continue;
                }
                $items[] = [
                    'target' => $target,
                    'title' => $fresh['post']->post_title,
                    '_hash' => $fresh['hash'],
                    '_post' => (int) $fresh['post']->ID,
                ];
                if (count($items) === 20) {
                    break;
                }
            } catch (Throwable) {
                continue;
            }
        }
        $freshItems = [];
        foreach ($items as $item) {
            $fresh = mbb_relation_map_article($item['target']);
            if (
                $fresh &&
                (int) $fresh['post']->ID === $item['_post'] &&
                hash_equals($fresh['hash'], $item['_hash'])
            ) {
                $freshItems[] = [
                    'target' => $item['target'],
                    'title' => $fresh['post']->post_title,
                ];
            }
        }
        $items = $freshItems;
        return [
            'state' => 'ready',
            'items' => array_map(
                static fn($item) => array_diff_key($item, ['_hash' => true, '_post' => true]),
                $items,
            ),
        ];
    } catch (Throwable) {
        return ['state' => 'unavailable', 'items' => []];
    }
}
if (function_exists('add_action')) {
    add_action('rest_api_init', static function () {
        register_rest_route('mbb/v1', '/references/articles', [
            'methods' => ['GET', 'POST'],
            'permission_callback' => 'mbb_references_permission',
            'callback' => static fn($r) => mbb_references_private(
                mbb_relation_map_article_search($r),
            ),
        ]);
    });
}
if (function_exists('add_action')) {
    add_action(
        'template_redirect',
        static function () {
            global $wp_query;
            foreach ($wp_query->posts ?? [] as $post) {
                if (
                    is_object($post) &&
                    (str_contains($post->post_content ?? '', 'relation-map') ||
                        str_contains($post->post_content ?? '', 'knowledge-map'))
                ) {
                    mbb_relation_map_private_headers();
                    break;
                }
            }
        },
        0,
    );
}
if (function_exists('add_filter')) {
    add_filter('rest_post_dispatch', static function ($response) {
        if (
            $response instanceof WP_REST_Response &&
            !empty($GLOBALS['mbb_relation_map_private_rendered'])
        ) {
            $response->header('Cache-Control', 'private, no-store, max-age=0');
            $response->header('Vary', 'Cookie');
        }
        return $response;
    });
}

if (function_exists('add_filter')) {
    foreach (['post', 'page'] as $type) {
        add_filter(
            'rest_prepare_' . $type,
            static function ($response, $post) {
                if (
                    str_contains($post->post_content ?? '', 'relation-map') ||
                    str_contains($post->post_content ?? '', 'knowledge-map')
                ) {
                    mbb_relation_map_private_headers();
                    $response->header('Cache-Control', 'private, no-store, max-age=0');
                    $response->header('Vary', 'Cookie');
                }
                return $response;
            },
            10,
            2,
        );
    }
}

function mbb_controlled_map_stamp(string $serialized): string
{
    $legacy = mbb_relation_map_v2_stamp($serialized);
    if (!preg_match('/<!--\s*wp:mbb\/component(?:\s|-->)/', $serialized)) {
        return $legacy;
    }
    $parts = [];
    foreach (mbb_component_descriptors($serialized) as $id => $attrs) {
        if (($attrs->params->format ?? null) === 'knowledge-map/v1') {
            $parts[$id] = mbb_relation_map_v2_view($attrs->params, 'export:' . $id);
        }
    }
    return $parts ? hash('sha256', mbb_component_json([$legacy, $parts])) : $legacy;
}
function mbb_knowledge_map_role(string $role): string
{
    $zh = str_starts_with(function_exists('determine_locale') ? determine_locale() : 'en', 'zh');
    return ($zh
        ? ['concept' => '[概念] ', 'reading' => '[阅读] ', 'practice' => '[练习] ']
        : [
            'concept' => '[Concept] ',
            'reading' => '[Reading] ',
            'practice' => '[Practice] ',
        ])[$role];
}
/** Normalize a fresh reference result into the existing permission-stamped snapshot shape. */
function mbb_controlled_map_snapshot(stdClass $target): ?array
{
    if (mbb_relation_map_v2_target($target)) {
        return mbb_relation_map_article($target);
    }
    if (!mbb_knowledge_map_target($target) || !function_exists('mbb_references_resolve')) {
        return null;
    }
    try {
        $resolved = mbb_references_resolve((array) $target);
        if (($resolved['state'] ?? null) !== 'available') {
            return null;
        }
        $s = mbb_references_snapshot($resolved['post_id']);
        $object = $s['projection']['objects'][$target->target] ?? null;
        if (
            !mbb_controlled_map_native_object(
                $s['post']->post_content,
                $target->target,
                $target->kind,
            ) ||
            !$object ||
            $object['kind'] !== $target->kind ||
            !hash_equals($resolved['pair_hash'], $s['hash']) ||
            !mbb_references_final($resolved['post_id'], $s['hash'])
        ) {
            return null;
        }
        $s['fragment'] = '#' . rawurlencode($target->target);
        return $s;
    } catch (Throwable) {
        return null;
    }
}
/** Trusted server API. It never grants anonymous access to the reference registry. */
function markbridge_resolve_document_target(stdClass $target, bool $edit = false): array
{
    $none = ['state' => 'unavailable'];
    $s = mbb_relation_map_article($target);
    if (!$s) {
        return $none;
    }
    $id = (int) $s['post']->ID;
    mbb_references_fresh_user();
    if ($edit && !current_user_can('edit_post', $id)) {
        return $none;
    }
    $fresh = mbb_relation_map_article($target);
    if (
        !$fresh ||
        (int) $fresh['post']->ID !== $id ||
        !hash_equals($s['hash'], $fresh['hash']) ||
        ($edit && !current_user_can('edit_post', $id))
    ) {
        return $none;
    }
    $url =
        $fresh['post']->post_status === 'publish'
            ? get_permalink($fresh['post'])
            : get_preview_post_link($fresh['post']);
    if (!mbb_relation_map_url($url)) {
        return $none;
    }
    return [
        'state' => 'available',
        'post_id' => $id,
        'title' => $fresh['post']->post_title,
        'url' => $url,
        'hash' => $fresh['hash'],
        'expected' => $fresh['expected'],
    ];
}
function markbridge_document_target_for_post(int $id, bool $edit = false): ?stdClass
{
    try {
        $s = mbb_references_snapshot($id, $edit);
        $control = mbb_references_control();
        if (!$control || $control['state'] !== 'ready') {
            return null;
        }
        $identity = $s['projection']['identity'];
        $target = $identity
            ? (object) (['kind' => 'document'] + $identity)
            : (object) [
                'kind' => 'local-document',
                'site' => $control['site_namespace'],
                'documentId' => mbb_id($id),
            ];
        $resolved = markbridge_resolve_document_target($target, $edit);
        return ($resolved['state'] ?? '') === 'available' &&
            $resolved['post_id'] === $id &&
            hash_equals($resolved['hash'], $s['hash'])
            ? $target
            : null;
    } catch (Throwable) {
        return null;
    }
}

/** A teaching activity is an envelope-v2 component, never an algorithm or replay alias. */
function mbb_controlled_map_native_object(string $serialized, string $id, string $kind): bool
{
    $matches = 0;
    $walk = function (array $blocks) use (&$walk, &$matches, $id, $kind): void {
        foreach ($blocks as $block) {
            $a = $block['attrs'] ?? [];
            if (
                ($a['id'] ?? null) === $id &&
                (($kind === 'step' && $block['blockName'] === 'mbb/step') ||
                    ($kind === 'activity' &&
                        $block['blockName'] === 'mbb/component' &&
                        ($a['version'] ?? null) === 2))
            ) {
                $matches++;
            }
            $walk($block['innerBlocks'] ?? []);
        }
    };
    $walk(parse_blocks($serialized));
    return $matches === 1;
}
