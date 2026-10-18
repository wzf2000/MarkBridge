<?php
/** Read-only real WordPress password form/hash plus the actual projection filter. No DB. */
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
if (!$root || !is_file($root . '/wp-includes/post-template.php')) {
    throw new RuntimeException('Set MARKBRIDGE_TEST_WORDPRESS_ROOT to a local core checkout');
}
define('ABSPATH', $root . '/');
define('WPINC', 'wp-includes');
define('COOKIEHASH', 'sdk-model');
$GLOBALS['post'] = (object) [
    'ID' => 7,
    'post_password' => 'secret',
    'post_content' => '<!-- wp:mbb/component {"id":"demo"} -->',
    'post_title' => 'Private',
];
$GLOBALS['calls'] = 0;
$GLOBALS['revoked'] = false;
function get_post($id = null)
{
    return $GLOBALS['post'];
}
function apply_filters($name, $value, ...$args)
{
    return $value;
}
function add_filter($name, $fn, ...$args)
{
    $GLOBALS['hooks'][$name] = $fn;
}
function esc_attr($s)
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function esc_url($s)
{
    return esc_attr($s);
}
function esc_html($s)
{
    return esc_attr($s);
}
function __($s)
{
    return $s;
}
function esc_attr_x($s, ...$args)
{
    return esc_attr($s);
}
function site_url($p, ...$args)
{
    return 'http://sdk-model.invalid/' . $p;
}
function get_permalink($id)
{
    return 'http://sdk-model.invalid/?p=' . $id;
}
function wp_get_raw_referer()
{
    return false;
}
function wp_is_block_theme()
{
    return false;
}
function wp_unslash($s)
{
    return $s;
}
function mbb_managed($id)
{
    return true;
}
function mbb_token($p)
{
    return hash('sha256', $p->post_content . $p->post_password);
}
function mbb_t($s)
{
    return $s;
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
function mbb_references_fresh_user() {}
function clean_post_cache($id) {}
function mbb_references_readable($p)
{
    return !$GLOBALS['revoked'] && !post_password_required($p);
}
require $root . '/wp-includes/post-template.php';
require $root . '/wp-includes/class-phpass.php';
require dirname(__DIR__) . '/plugin/projections.php';
function sdk_password_renderer($p, $context)
{
    $GLOBALS['calls']++;
    if ($GLOBALS['revokeDuring'] ?? false) {
        $GLOBALS['revoked'] = true;
    }
    return [
        'schema' => 1,
        'tree' => [['tag' => 'p', 'attrs' => (object) [], 'children' => ['Derived view']]],
    ];
}
mbb_register_component_projection('example', '1.0.0', [
    'contract' => 'mbb-component-projection/v1',
    'version' => '1.0.0',
    'render' => 'sdk_password_renderer',
    'files' => [['file' => realpath(__FILE__), 'sha256' => hash_file('sha256', __FILE__)]],
]);
$filter = $GLOBALS['hooks']['the_content'];
$form = get_the_password_form(7);
if (($argv[1] ?? '') === '--form') {
    echo $form;
    exit();
}
if (($argv[1] ?? '') === '--formatted') {
    $form = stream_get_contents(STDIN);
}
if ($filter($form) !== $form || $GLOBALS['calls'] !== 0) {
    throw new RuntimeException('Native password form lost');
}
$body = '<section id="demo"><p>PRIVATE_BODY</p></section>';
if (str_contains($filter($body), 'PRIVATE_BODY') || $GLOBALS['calls'] !== 0) {
    throw new RuntimeException('Locked raw body escaped guard');
}
if (str_contains($filter($form . $body), 'PRIVATE_BODY')) {
    throw new RuntimeException('Form plus real body bypass');
}
$_COOKIE['wp-postpass_' . COOKIEHASH] = (new PasswordHash(8, true))->HashPassword('secret');
$out = $filter($body);
if (
    !str_contains($out, 'Derived view') ||
    !str_contains($out, 'PRIVATE_BODY') ||
    $GLOBALS['calls'] !== 1
) {
    throw new RuntimeException(
        'Unlocked view missing: ' .
            json_encode([
                'html' => $out,
                'calls' => $GLOBALS['calls'],
                'required' => post_password_required(),
                'prefix' => substr($_COOKIE['wp-postpass_' . COOKIEHASH], 0, 4),
            ]),
    );
}
$GLOBALS['revokeDuring'] = true;
$out = $filter($body);
if (str_contains($out, 'PRIVATE_BODY') || str_contains($out, 'Derived view')) {
    throw new RuntimeException('Late revoke leaked body');
}
echo "Real core password form preserved; locked raw/form+body denied; valid cookie derives; late revoke blocks all body passed\n";
