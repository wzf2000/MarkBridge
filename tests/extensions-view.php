<?php
function add_action(...$args) {}
function add_filter(...$args) {}
function mbb_references_fresh_user() {}
function get_current_user_id()
{
    return 1;
}
function current_user_can(...$args)
{
    return true;
}
function mbb_t($s)
{
    $m = json_decode(file_get_contents(dirname(__DIR__) . '/plugin/languages/messages.json'), true);
    return ($GLOBALS['argv'][1] ?? '') === 'zh' ? $m[$s] ?? $s : $s;
}
function esc_html($s)
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function esc_attr($s)
{
    return esc_html($s);
}
function wp_unslash($s)
{
    return $s;
}
function wp_nonce_field($s) {}
function submit_button($s)
{
    echo '<p><button type="submit">' . esc_html($s) . '</button></p>';
}
function is_wp_error($v)
{
    return false;
}
function mbb_component_registry()
{
    return [
        [
            'id' => 'small-data-chart',
            'version' => '0.0.1',
            'title' => 'Small data chart · 中文图表',
            'status' => 'available',
            'protocolVersion' => 1,
            'minMarkBridge' => '2.2.0-dev.1',
            'resource' => ['sha256' => str_repeat('a', 64)],
        ],
    ];
}
class WP_REST_Response
{
    function __construct(public $data, public $status = 200) {}
    function header(...$args) {}
    function get_data()
    {
        return $this->data;
    }
}
require dirname(__DIR__) . '/plugin/projections.php';
require dirname(__DIR__) . '/plugin/extensions.php';
mbb_register_extension_manifest('sample', [
    'title' => 'Chart Static Sample',
    'version' => '0.1.0',
    'minMarkBridge' => '2.9.0-dev.1',
    'capabilities' => ['static-projection'],
]);
$_SERVER['REQUEST_METHOD'] = 'GET';
echo '<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><main class="wrap mbb-settings"><h1>MarkBridge</h1><nav>常规 · 显示 · 扩展</nav>';
mbb_extensions_settings_page();
echo '</main>';
