<?php
// Complete plugin entry against actual core libraries, without wp-load/settings/config or a database.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
$root = realpath($argv[1] ?? getenv('MARKBRIDGE_WORDPRESS_SOURCE') ?: '');
if (
    !$root ||
    !is_file($root . '/wp-includes/plugin.php') ||
    !is_file($root . '/wp-includes/functions.php')
) {
    throw new RuntimeException('Pass a read-only WordPress source tree.');
}
define('ABSPATH', $root . '/');
define('WPINC', 'wp-includes');
define('WP_PLUGIN_DIR', dirname(__DIR__));
define('WPMU_PLUGIN_DIR', dirname(__DIR__) . '/no-mu-plugins');
$plugin = realpath($argv[2] ?? dirname(__DIR__) . '/plugin');
if (!$plugin || !is_file($plugin . '/markdown-block-bridge.php')) {
    throw new RuntimeException('Pass the candidate plugin directory.');
}
$GLOBALS['wp_plugin_paths'] = [];
require $root . '/wp-includes/plugin.php';
require $root . '/wp-includes/functions.php';
require $root . '/wp-includes/class-wpdb.php';
add_filter(
    'pre_option',
    static function ($pre, $name) {
        if ($name !== 'active_plugins') {
            throw new RuntimeException('Unexpected option access during plugin entry: ' . $name);
        }
        return [];
    },
    PHP_INT_MAX,
    2,
);
require $plugin . '/markdown-block-bridge.php';
foreach (
    [
        'mbb_resource_file',
        'mbb_component_resource_file',
        'mbb_component_resource_json',
        'mbb_component_resource_manifest',
        'mbb_component_resource_group',
        'mbb_native_rest_update',
        'mbb_collections_final',
    ]
    as $name
) {
    if (!function_exists($name)) {
        throw new RuntimeException('Complete entry omitted ' . $name);
    }
}
foreach (['MBB_Reference_DB', 'MBB_Backup_DB'] as $name) {
    if (!class_exists($name, false)) {
        throw new RuntimeException('Complete entry omitted database subclass ' . $name);
    }
}
if (isset($GLOBALS['wpdb'])) {
    throw new RuntimeException('The read-only bootstrap must not create a database object.');
}
foreach (get_included_files() as $file) {
    if (in_array(basename($file), ['wp-load.php', 'wp-settings.php', 'wp-config.php'], true)) {
        throw new RuntimeException('Site bootstrap is forbidden in this read-only test.');
    }
}
echo "Complete Main plugin entry with actual WordPress hooks/functions/classes passed; no site bootstrap or database.\n";
