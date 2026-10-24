<?php
/** Current-request article resolution. No viewer-dependent result is cached. */
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}
require_once __DIR__ . '/relation-map-v2.php';
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
    $empty = ['map' => null, 'dependencies' => [], 'edgeIds' => []];
    if (!mbb_relation_map_v2_valid($params)) {
        return $empty;
    }
    $resolved = [];
    foreach ($params->nodes as $node) {
        $snapshot = mbb_relation_map_article($node->target);
        if ($snapshot) {
            $resolved[$node->id] = [$node, $snapshot];
        }
    }
    // Recheck every dependency after all work; stale results never survive a mixed snapshot.
    foreach ($resolved as $id => [$node, $snapshot]) {
        $fresh = mbb_relation_map_article($node->target);
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
        if (!mbb_relation_map_url($url)) {
            continue;
        }
        $next = (object) [
            'id' => $opaque('n', $node->id),
            'group' => $opaque('g', $node->group),
            'title' => $node->title,
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
                'kind' => $edge->kind,
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
    if (!mbb_relation_map_valid($map)) {
        return $empty;
    }
    return ['map' => $map, 'dependencies' => $dependencies, 'edgeIds' => $edgeIds];
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
        '<p data-mbb-generated="" data-mbb-relation-notice="">' .
        esc_html(mbb_t('Some articles may be unavailable.')) .
        '</p>';
    $config = [
        'reader' => 'relation-map/public-v2',
        'publicView' => $view['map'],
        'edgeIds' => $view['edgeIds'],
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
            mbb_relation_map_envelope($view['map'], determine_locale()),
        );
        $static .= $out->saveHTML($root);
        $provider = mbb_component_provider(
            $attrs['component'] ?? '',
            $attrs['componentVersion'] ?? '',
        );
        if (
            ($provider['readerMode'] ?? null) === 'relation-map/v2' &&
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
    $parts = [];
    foreach (mbb_component_descriptors($serialized) as $id => $attrs) {
        if (($attrs->params->format ?? null) === 'relation-map/v2') {
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
                if (is_object($post) && str_contains($post->post_content ?? '', 'relation-map')) {
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
                if (str_contains($post->post_content ?? '', 'relation-map')) {
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
