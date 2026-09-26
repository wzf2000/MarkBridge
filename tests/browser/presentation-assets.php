<?php
// Execute only the public asset registration callback with isolated WordPress stubs.
define('ABSPATH', __DIR__);
$actions = [];
$styles = [];
$inline = [];
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
function wp_enqueue_script($handle, $url, $deps = [], $version = null, $footer = false) {}
function wp_add_inline_script($handle, $script, $position = 'after') {}
function wp_localize_script($handle, $name, $value) {}
function wp_json_encode($value)
{
    return json_encode($value);
}
function mbb_asset($name)
{
    return $name;
}
function mbb_emoji_config()
{
    return [];
}
require __DIR__ . '/../../plugin/presentation.php';
foreach ($actions['wp_enqueue_scripts'] as $callback) {
    $callback();
}
echo json_encode(['styles' => $styles, 'inline' => $inline]);
