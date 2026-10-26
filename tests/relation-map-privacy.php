<?php
/** Pure server/DOM regression, with explicit fake reference authority; not a WordPress save test. */
define('ARRAY_A', 'ARRAY_A');
function add_action(...$args) {}
function add_filter($hook, $callback, ...$args)
{
    $GLOBALS['privacy_filters'][$hook][] = $callback;
}
function mbb_component_json($v)
{
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
function mbb_component_equal($a, $b)
{
    return mbb_component_json($a) === mbb_component_json($b);
}
function mbb_component_descriptors($s)
{
    if (str_starts_with($s, '<!-- wp:mbb/component ')) {
        preg_match_all('/<!-- wp:mbb\/component (\{[\s\S]*?\}) -->/', $s, $matches);
        $result = [];
        foreach ($matches[1] as $raw) {
            $attrs = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
            $result[$attrs->id] = $attrs;
        }
        return $result;
    }
    return json_decode($s);
}
function mbb_component_provider(...$args)
{
    return ['status' => 'available', 'readerMode' => 'relation-map/v2'];
}
function markbridge_teaching_component_fingerprint(...$args)
{
    return str_repeat('a', 64);
}
function mbb_references_control()
{
    return [
        'state' => 'ready',
        'active_generation' => 1,
        'site_namespace' => 'S_' . str_repeat('a', 32),
    ];
}
function mbb_references_tables()
{
    return ['claims' => 'claims'];
}
function mbb_references_fresh_user() {}
function mbb_references_snapshot($id)
{
    if ($id === 2 && !$GLOBALS['privacy_authorized']) {
        throw new RuntimeException('unavailable');
    }
    return [
        'post' => (object) [
            'ID' => $id,
            'post_status' => $id === 2 ? 'private' : 'publish',
            'post_title' => 'Article',
        ],
        'hash' => 'hash' . $id,
        'document' => ['source' => 'PRIVATE_BODY'],
        'projection' => [
            'identity' => [
                'namespace' => 'S_' . str_repeat('a', 32),
                'document' => 'D_' . str_repeat('b', 32),
            ],
        ],
    ];
}
function mbb_references_final($id, $hash, ...$args)
{
    return ($id !== 2 || $GLOBALS['privacy_authorized']) && $hash === 'hash' . $id;
}
function mbb_id($id)
{
    return '123:旧文档';
}
function get_permalink($p)
{
    return 'https://example.test/?p=' . $p->ID;
}
function get_preview_post_link($p)
{
    return 'https://example.test/?preview=' . $p->ID;
}
function get_the_ID()
{
    return 42;
}
function wp_salt($v)
{
    return 'fixture-only-hmac-secret';
}
function mbb_t($s)
{
    return $s;
}
function determine_locale()
{
    return 'en';
}
function esc_html($s)
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}
function esc_attr($s)
{
    return esc_html($s);
}
class WP_REST_Response
{
    public $headers = [];
    function header($k, $v)
    {
        $this->headers[$k] = $v;
    }
}
class PrivacyDB
{
    public $postmeta = 'meta';
    function prepare($q, ...$a)
    {
        return [$q, $a];
    }
    function get_row(...$args)
    {
        return ['post_id' => 1, 'pair_hash' => 'hash1'];
    }
    function get_col(...$args)
    {
        return $GLOBALS['privacy_owners'];
    }
}
$GLOBALS['wpdb'] = new PrivacyDB();
$GLOBALS['privacy_owners'] = [2];
$GLOBALS['privacy_authorized'] = true;
require dirname(__DIR__) . '/plugin/projections.php';
function privacy_check($ok, $name)
{
    if (!$ok) {
        throw new RuntimeException($name);
    }
}
$p = (object) [
    'format' => 'relation-map/v2',
    'title' => 'Map',
    'groups' => [(object) ['id' => 'group-semantic', 'title' => 'Group']],
    'nodes' => [
        (object) [
            'id' => 'public-semantic',
            'group' => 'group-semantic',
            'title' => 'Public',
            'target' => (object) [
                'kind' => 'document',
                'namespace' => 'S_' . str_repeat('a', 32),
                'document' => 'D_' . str_repeat('b', 32),
            ],
        ],
        (object) [
            'id' => 'private-semantic',
            'group' => 'group-semantic',
            'title' => 'PRIVATE_NODE_CANARY',
            'description' => 'PRIVATE_DESCRIPTION_CANARY',
            'target' => (object) [
                'kind' => 'local-document',
                'site' => 'S_' . str_repeat('a', 32),
                'documentId' => '123:旧文档',
            ],
        ],
    ],
    'edges' => [
        (object) [
            'id' => 'edge-semantic',
            'from' => 'public-semantic',
            'to' => 'private-semantic',
            'kind' => 'compare',
            'why' => 'PRIVATE_WHY_CANARY',
        ],
    ],
];
$attrs = [
    'id' => 'map',
    'component' => 'navigation-map',
    'componentVersion' => '0.2.0',
    'params' => $p,
];
$source = mbb_component_json(['map' => $attrs]);
// All legal JSON spellings must bind the same controlled targets and revoke together.
$canonicalBlock = '<!-- wp:mbb/component ' . mbb_component_json($attrs) . ' -->';
$stamp = mbb_relation_map_v2_stamp($canonicalBlock);
foreach (
    ['relation-map/v2', 'relation-map\\/v2', 'relation-map\\u002fv2', 'relation-map/v\\u0032']
    as $format
) {
    $escaped = str_replace('relation-map/v2', $format, $canonicalBlock);
    privacy_check(
        mbb_relation_map_v2_stamp($escaped) === $stamp,
        'escaped format same dependencies',
    );
    $GLOBALS['privacy_authorized'] = false;
    privacy_check(
        mbb_relation_map_v2_stamp($escaped) !== $stamp,
        'escaped format revocation changes stamp',
    );
    $GLOBALS['privacy_authorized'] = true;
}

$body =
    '<div class="wp-block-mbb-component" id="map"><div class="mbb-teaching-body"><p>Author body</p><p class="mbb-component-params">RAW_CARRIER_CANARY</p></div></div>';
$early = mbb_relation_map_v2_render($body, json_decode(mbb_component_json($attrs), true));
privacy_check(str_contains($early, 'PRIVATE_NODE_CANARY'), 'authorized initial view');
privacy_check(
    !str_contains($early, 'data-mbb-relation-notice'),
    'complete authorized view has no unavailable notice',
);
privacy_check(!str_contains($early, 'RAW_CARRIER_CANARY'), 'old carrier removed');
$complete = mbb_component_static_document($early, $source, 'en');
privacy_check(
    !str_contains($complete, 'data-mbb-relation-notice'),
    'fresh complete final projection has no unavailable notice',
);
$lean = mbb_relation_map_article($p->nodes[1]->target);
privacy_check(!isset($lean['document'], $lean['projection']), 'resolver retains no complete body');
$GLOBALS['privacy_authorized'] = false;
$final = mbb_component_static_document($early, $source, 'en');
privacy_check(
    str_contains($final, 'data-mbb-relation-notice'),
    'partially unavailable view retains neutral notice',
);
foreach (
    [
        'PRIVATE_NODE_CANARY',
        'PRIVATE_DESCRIPTION_CANARY',
        'PRIVATE_WHY_CANARY',
        '123:旧文档',
        'private-semantic',
        'edge-semantic',
        'RAW_CARRIER_CANARY',
    ]
    as $canary
) {
    privacy_check(!str_contains($final, $canary), 'final server output removed ' . $canary);
}
privacy_check(
    str_contains($final, 'Author body') && str_contains($final, 'Public'),
    'surviving body and links',
);
$GLOBALS['privacy_authorized'] = true;
$GLOBALS['privacy_owners'] = [2, 3];
$duplicate = mbb_component_static_document($early, $source, 'en');
privacy_check(
    !str_contains($duplicate, 'PRIVATE_NODE_CANARY') &&
        !str_contains($duplicate, 'PRIVATE_WHY_CANARY'),
    'inaccessible duplicate invalidates old data and static links',
);
// Collection items lose individual headers; the request marker must protect the whole response.
$GLOBALS['mbb_relation_map_private_rendered'] = false;
$r = new WP_REST_Response();
foreach ($GLOBALS['privacy_filters']['rest_prepare_post'] as $callback) {
    $r = $callback($r, (object) ['post_content' => 'relation-map/v2']);
}
$collection = new WP_REST_Response();
foreach ($GLOBALS['privacy_filters']['rest_post_dispatch'] as $callback) {
    $collection = $callback($collection);
}
privacy_check(
    str_contains($collection->headers['Cache-Control'] ?? '', 'no-store') &&
        ($collection->headers['Vary'] ?? '') === 'Cookie',
    'trimmed collection retains private headers',
);
echo "Controlled-map privacy: fresh final DOM+publicView, hidden node/why/target, duplicate owner, lean resolver and trimmed REST collection cache regression passed.\n";
