<?php
/** Actual core preview-date branch and token, with isolated in-memory post/storage stubs. No DB. */
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
if (!$root || !is_file($root . '/wp-includes/class-wp-query.php')) {
    throw new RuntimeException('Set MARKBRIDGE_TEST_WORDPRESS_ROOT to a local core checkout');
}
require $root . '/wp-includes/class-wp-post.php';
require $root . '/wp-includes/class-wp-query.php';
$querySource = file_get_contents($root . '/wp-includes/class-wp-query.php');
$pattern = <<<'REGEX'
~if \( 'future' !== \$status \) \{\s*\$this->posts\[0\]->post_date = current_time\( 'mysql' \);\s*\}~
REGEX;
if (preg_match_all($pattern, $querySource, $matches) !== 1) {
    throw new RuntimeException('Verified core preview date branch changed');
}
$corePreviewDate = $matches[0][0];
// Execute the exact product token function, rather than a weaker test-only fingerprint.
$bridge = file_get_contents(dirname(__DIR__) . '/plugin/editor-bridge.php');
$start = strpos($bridge, 'function mbb_token(');
$end = strpos($bridge, 'function mbb_document(', $start);
eval(substr($bridge, $start, $end - $start));
function add_filter($name, $callback, ...$args)
{
    $GLOBALS['hooks'][$name] = $callback;
}
function get_post($id = null)
{
    return $id === null ? $GLOBALS['post'] : clone $GLOBALS['saved'];
}
function clean_post_cache($id) {}
function mbb_managed($id)
{
    return true;
}
function mbb_references_fresh_user() {}
function mbb_references_readable($p)
{
    return $GLOBALS['readable'];
}
function current_user_can(...$args)
{
    return $GLOBALS['canEdit'];
}
function is_preview()
{
    return $GLOBALS['preview'];
}
function current_time($type)
{
    return '2026-10-17 22:30:00';
}
function esc_html($s)
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function mbb_t($s)
{
    return $s;
}
function wp_json_encode($v)
{
    return json_encode($v, JSON_THROW_ON_ERROR);
}
function get_object_taxonomies(...$args)
{
    return [];
}
function get_registered_meta_keys(...$args)
{
    return ['sample' => ['show_in_rest' => true, 'single' => true]];
}
function get_post_meta(...$args)
{
    return $GLOBALS['meta'];
}
function mbb_id($id)
{
    return 'preview-test';
}
function get_post_thumbnail_id($id)
{
    return 0;
}
function get_page_template_slug($id)
{
    return '';
}
function is_sticky($id)
{
    return false;
}
function mbb_binding_projection($p)
{
    return 'fixed-binding';
}
function mbb_component_json($v)
{
    return mbb_projection_json($v);
}
function mbb_component_schema(...$args)
{
    return true;
}
function mbb_component_domain_valid(...$args)
{
    return true;
}
function mbb_component_provider(...$args)
{
    return ['status' => 'available', 'schema' => []];
}
function mbb_component_descriptors($source)
{
    return [
        'demo' => (object) [
            'id' => 'demo',
            'component' => 'example',
            'componentVersion' => '1.0.0',
            'params' => (object) [],
        ],
    ];
}
require dirname(__DIR__) . '/plugin/projections.php';
function preview_renderer($params, $context)
{
    $GLOBALS['calls']++;
    $GLOBALS['during']();
    return [
        'schema' => 1,
        'tree' => [['tag' => 'p', 'attrs' => (object) [], 'children' => ['Derived view']]],
    ];
}
mbb_register_component_projection('example', '1.0.0', [
    'contract' => 'mbb-component-projection/v1',
    'version' => '1.0.0',
    'render' => 'preview_renderer',
    'files' => [['file' => realpath(__FILE__), 'sha256' => hash_file('sha256', __FILE__)]],
]);
function reset_preview(string $status = 'draft'): void
{
    global $corePreviewDate;
    $GLOBALS['saved'] = new WP_Post(
        (object) [
            'ID' => 7,
            'post_type' => 'post',
            'post_status' => $status,
            'post_content' => '<!-- wp:mbb/component {"id":"demo"} -->',
            'post_content_filtered' => 'Canonical source',
            'post_title' => 'Original',
            'post_date' => '2026-10-01 10:00:00',
        ],
    );
    $GLOBALS['preview'] = true;
    $GLOBALS['canEdit'] = true;
    $GLOBALS['readable'] = true;
    $GLOBALS['meta'] = 'original';
    $GLOBALS['calls'] = 0;
    $GLOBALS['during'] = static function () {};
    $query = new WP_Query();
    $query->posts = [clone $GLOBALS['saved']];
    (function () use ($status, $corePreviewDate) {
        eval($corePreviewDate);
    })->call($query);
    $GLOBALS['post'] = $query->posts[0];
}
function run_preview(bool $ok, string $label): void
{
    $view = clone $GLOBALS['post'];
    $saved = clone $GLOBALS['saved'];
    $out = $GLOBALS['hooks']['the_content']('<section id="demo"><p>AUTHOR_BODY</p></section>');
    if (str_contains($out, 'Derived view') !== $ok || str_contains($out, 'AUTHOR_BODY') !== $ok) {
        throw new RuntimeException($label);
    }
    if ($GLOBALS['post'] != $view) {
        throw new RuntimeException('Global preview object mutated');
    }
    if ($ok && $GLOBALS['saved'] != $saved) {
        throw new RuntimeException('Persisted object mutated');
    }
}
foreach (['draft', 'pending'] as $status) {
    reset_preview($status);
    if ($GLOBALS['post']->post_date === $GLOBALS['saved']->post_date) {
        throw new RuntimeException('Core did not project the draft date');
    }
    run_preview(true, $status . ' actual core projected date');
}
reset_preview();
$GLOBALS['canEdit'] = false;
run_preview(false, 'Unauthorized date normalization');
reset_preview();
$GLOBALS['preview'] = false;
run_preview(false, 'Not a preview');
reset_preview('publish');
run_preview(false, 'Published date mismatch');
foreach (
    [
        'post_content',
        'post_content_filtered',
        'post_title',
        'post_excerpt',
        'post_author',
        'post_status',
        'post_password',
        'post_date_gmt',
    ]
    as $key
) {
    reset_preview();
    $GLOBALS['post']->$key =
        $key === 'post_content' ? $GLOBALS['post']->$key . 'changed' : 'different';
    run_preview(false, 'View/autosave field ' . $key);
    if ($GLOBALS['calls']) {
        throw new RuntimeException('Invalid view reached renderer');
    }
}
foreach (['post_content', 'post_title', 'post_status', 'post_date'] as $key) {
    reset_preview();
    $GLOBALS['during'] = static function () use ($key) {
        $GLOBALS['saved']->$key = 'changed';
    };
    run_preview(false, 'Late persisted mutation ' . $key);
}
reset_preview();
$GLOBALS['during'] = static function () {
    $GLOBALS['meta'] = 'changed';
};
run_preview(false, 'Late metadata mutation');
reset_preview();
$GLOBALS['during'] = static function () {
    $GLOBALS['readable'] = false;
};
run_preview(false, 'Late permission revoke');
echo "Actual core preview date and product token: authorized draft/pending only, untouched global/storage, all other view fields and late data/meta/permission changes rejected\n";
