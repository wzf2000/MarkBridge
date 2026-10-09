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
        in_array($mode, ['disabled', 'reader-disabled'], true)
        ? [
            'source_font_size' => 18,
            'math_reader' => false,
            'code_line_numbers' => $mode !== 'disabled',
            'code_copy' => $mode !== 'disabled',
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
require __DIR__ . '/../../plugin/includes/admin-settings.php';
require __DIR__ . '/../../plugin/presentation.php';
foreach ($actions['wp_enqueue_scripts'] as $callback) {
    $callback();
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
