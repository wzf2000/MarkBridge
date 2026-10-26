<?php
// Self-contained catalog UI fixture; real resource ownership, no WP bootstrap.
$fixtureRoot = sys_get_temp_dir() . '/mbb-catalog-' . bin2hex(random_bytes(8));
$fixtureAssets = $fixtureRoot . '/teaching-extension/assets';
if (!mkdir($fixtureAssets, 0700, true)) {
    throw new RuntimeException('Cannot create catalog fixture');
}
$fixtureResource = $fixtureAssets . '/insertion-sort-frame.html';
file_put_contents($fixtureResource, '<!doctype html><title>Fixed catalog resource</title>');
register_shutdown_function(static function () use ($fixtureResource, $fixtureAssets, $fixtureRoot) {
    unlink($fixtureResource);
    rmdir($fixtureAssets);
    rmdir(dirname($fixtureAssets));
    rmdir($fixtureRoot);
});
define('WP_PLUGIN_DIR', $fixtureRoot);
function add_action(...$v) {}
function add_filter(...$v) {}
function mbb_references_fresh_user() {}
function get_current_user_id()
{
    return 1;
}
function current_user_can($v)
{
    return true;
}
function mbb_t($v)
{
    return $v;
}
function esc_html($v)
{
    return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
}
function esc_attr($v)
{
    return esc_html($v);
}
function wp_strip_all_tags($v)
{
    return strip_tags($v);
}
function get_plugins()
{
    return [
        'teaching-extension/markbridge-teaching-components.php' => [
            'Name' => 'Teaching Components',
        ],
    ];
}
function rest_url($path)
{
    return 'http://127.0.0.1:' .
        (getenv('MARKBRIDGE_TEST_BROWSER_PORT') ?: '8765') .
        '/wp-json/' .
        $path;
}
function wp_create_nonce($action)
{
    return 'synthetic-nonce';
}
function esc_url($url)
{
    return esc_attr($url);
}
function wp_nonce_field(...$v) {}
function submit_button($v)
{
    echo '<button>' . esc_html($v) . '</button>';
}
function is_wp_error($v)
{
    return false;
}
function mbb_component_registry()
{
    $items = [];
    foreach ([['one', '0.1.0'], ['one', '0.2.0'], ['two', '0.1.0']] as [$id, $version]) {
        $items[] = [
            'id' => $id,
            'version' => $version,
            'title' => $id === 'one' ? 'One generic player' : 'Another component',
            'status' => 'available',
            'protocolVersion' => 1,
            'minMarkBridge' => '2.9.0-rc.4',
            'resource' => [
                'file' => WP_PLUGIN_DIR . '/teaching-extension/assets/insertion-sort-frame.html',
                'sha256' => str_repeat('a', 64),
            ],
        ];
    }
    return $items;
}
class WP_REST_Response
{
    public function __construct(public $data, public $status = 200) {}
    public function header(...$v) {}
    public function get_data()
    {
        return $this->data;
    }
}
require dirname(__DIR__, 2) . '/plugin/projections.php';
require dirname(__DIR__, 2) . '/plugin/extensions.php';
$GLOBALS['mbb_extension_manifests']['teaching-components'] = [
    'title' => 'Teaching Components',
    'version' => '1.0.0',
    'minMarkBridge' => '2.9.0-rc.4',
    'capabilities' => ['components'],
];
$_SERVER['REQUEST_METHOD'] = 'GET';
ob_start();
mbb_extensions_settings_page();
$html = ob_get_clean();
if (
    substr_count($html, 'class="mbb-provider-group"') !== 1 ||
    substr_count($html, 'class="mbb-component-versions"') !== 2 ||
    str_contains($html, WP_PLUGIN_DIR)
) {
    throw new RuntimeException('Catalog grouping/owner privacy');
}
if (($argv[1] ?? '') === '--model') {
    echo "Catalog real resource ownership groups three exact versions into two types under one plugin without paths\n";
    exit();
}
echo '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.6 system-ui;margin:24px;max-width:960px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px;text-align:start}input{max-width:100%}code{overflow-wrap:anywhere}' .
    file_get_contents(dirname(__DIR__, 2) . '/plugin/settings.css') .
    '</style></head><body>' .
    $html .
    '</body></html>';
