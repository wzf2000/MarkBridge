<?php
// Execute only the public asset registration callback with isolated WordPress stubs.
define('ABSPATH', __DIR__);
$actions = [];
$styles = [];
$inline = [];
$scripts = [];
$script_inline = [];
function add_action($name, $callback, $priority = 10)
{
    $GLOBALS['actions'][$name][] = $callback;
}
function add_filter($name, $callback, $priority = 10) {}
function remove_filter($name, $callback, $priority = 10) {}
function plugins_url($path, $file)
{
    return '/plugin/' . $path;
}
function wp_enqueue_style($handle, $url, $deps = [], $version = null)
{
    $GLOBALS['styles'][] = $url;
}
function wp_add_inline_style($handle, $css)
{
    $GLOBALS['inline'][] = $css;
}
function wp_script_is($handle, $status = 'enqueued')
{
    return isset($GLOBALS['scripts'][$handle]);
}
function wp_enqueue_script($handle, $url, $deps = [], $version = null, $footer = false)
{
    $GLOBALS['scripts'][$handle] = ['handle' => $handle, 'url' => $url, 'deps' => $deps];
}
function wp_add_inline_script($handle, $script, $position = 'after')
{
    $GLOBALS['script_inline'][$handle][$position][] = $script;
}
function wp_localize_script($handle, $name, $value)
{
    foreach ($value as &$item) {
        if (is_scalar($item)) {
            $item = (string) $item;
        }
    }
    unset($item);
    wp_add_inline_script($handle, 'window.' . $name . '=' . json_encode($value) . ';', 'before');
}
function is_admin()
{
    return false;
}
function wp_json_encode($value)
{
    return json_encode($value);
}
function plugin_basename($file)
{
    return basename(dirname($file)) . '/' . basename($file);
}
function get_option($name, $default = false)
{
    $mode = $GLOBALS['argv'][1] ?? '';
    return $name === 'markbridge_display_preferences' &&
        in_array($mode, ['disabled', 'reader-disabled', 'empty-disabled'], true)
        ? [
            'source_font_size' => 18,
            'math_reader' => false,
            'code_line_numbers' => !in_array($mode, ['disabled', 'empty-disabled'], true),
            'code_copy' => !in_array($mode, ['disabled', 'empty-disabled'], true),
        ]
        : $default;
}
function mbb_asset($name)
{
    return $name;
}
function mbb_emoji_config()
{
    return [];
}
$plugin = getenv('MARKBRIDGE_TEST_PLUGIN_ROOT') ?: __DIR__ . '/../../plugin';
require $plugin . '/includes/admin-settings.php';
require $plugin . '/components.php';
if (($GLOBALS['argv'][1] ?? '') === 'empty-component') {
    $raw = file_get_contents(__DIR__ . '/fixtures/component.html');
    $GLOBALS['mbb_components']['fixture'] = [
        'id' => 'fixture',
        'version' => '0.1.0',
        'title' => 'Fixed fixture',
        'status' => 'available',
        'protocolVersion' => 1,
        'minMarkBridge' => '1.9.0-dev.1',
        'schema' => ['type' => 'object', 'properties' => [], 'additionalProperties' => false],
        'defaults' => (object) [],
        'budgets' => mbb_component_budget_limits(),
        'resource' => ['url' => '/component-fixture.html', 'sha256' => hash('sha256', $raw)],
    ];
}
require $plugin . '/presentation.php';
foreach ($actions['wp_enqueue_scripts'] as $callback) {
    $callback();
}
// Match the ordinary code/emoji fixture; dynamic-only tests remove its heavy assets.
if (!str_starts_with($GLOBALS['argv'][1] ?? '', 'empty')) {
    mbb_detect_presentation(
        '<pre><code class="language-javascript">const n=1;</code></pre><p>:smile:</p>',
    );
}
$ordered = [];
$emit = function ($handle) use (&$emit, &$ordered, $scripts, $script_inline) {
    if (isset($ordered[$handle])) {
        return;
    }
    foreach ($scripts[$handle]['deps'] as $dependency) {
        $emit($dependency);
    }
    $ordered[$handle] = $scripts[$handle] + ['inline' => $script_inline[$handle] ?? []];
};
foreach (array_keys($scripts) as $handle) {
    $emit($handle);
}
echo json_encode([
    'styles' => $styles,
    'inline' => $inline,
    'scripts' => array_values($ordered),
    'math_config' => mbb_math_configuration(),
]);
