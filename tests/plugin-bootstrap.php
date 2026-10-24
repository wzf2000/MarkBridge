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
define('WP_PLUGIN_DIR', __DIR__ . '/fixtures');
define('WP_PLUGIN_URL', 'http://bootstrap.invalid/plugins');
define('WPMU_PLUGIN_URL', 'http://bootstrap.invalid/mu-plugins');
define('WPMU_PLUGIN_DIR', dirname(__DIR__) . '/no-mu-plugins');
$plugin = realpath($argv[2] ?? dirname(__DIR__) . '/plugin');
if (!$plugin || !is_file($plugin . '/markdown-block-bridge.php')) {
    throw new RuntimeException('Pass the candidate plugin directory.');
}
$GLOBALS['wp_plugin_paths'] = [];
require $root . '/wp-includes/plugin.php';
require $root . '/wp-includes/functions.php';
require $root . '/wp-includes/load.php';
require $root . '/wp-includes/link-template.php';
require $root . '/wp-includes/class-wpdb.php';
add_filter(
    'pre_option',
    static function ($pre, $name) {
        if ($name === 'siteurl') {
            return 'http://bootstrap.invalid';
        }
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
// Use the actual request class, including its unset-body null default, rather than a transport mock.
require $root . '/wp-includes/rest-api/class-wp-rest-request.php';
$registry = mbb_component_registry();
$fixtureRoot = __DIR__ . '/fixtures/resource-v2-provider';
$digest = '229f0796c04723343698d30b8b939027ccc3636794ba3eb3c6962b8ed2b56e8c';
$fixture = [
    'version' => '0.1.0',
    'title' => 'Actual REST request fixture',
    'schema' => ['type' => 'object', 'properties' => [], 'additionalProperties' => false],
    'defaults' => (object) [],
    'protocolVersion' => 2,
    'minMarkBridge' => '3.2.0-rc.1',
    'budgets' => mbb_component_budget_limits(),
    'resource' => [
        'file' => $fixtureRoot . '/frame.html',
        'url' => plugins_url('frame.html', $fixtureRoot . '/frame.html'),
        'sha256' => $digest,
    ],
    'resources' => [
        'file' => $fixtureRoot . '/assets/0.1.0/manifest.json',
        'url' => plugins_url('manifest.json', $fixtureRoot . '/assets/0.1.0/manifest.json'),
        'sha256' => '71c1bff07f7fefa311d5814984f3c88df7fc4e0a55760110bbce6c137ae003ea',
    ],
];
try {
    if (
        !markbridge_register_teaching_component('request-fixture', $fixture) ||
        mbb_component_provider('request-fixture', '0.1.0')['status'] !== 'available'
    ) {
        throw new RuntimeException('The real REST request fixture must pass full v2 registration.');
    }
    foreach ([null, '', 'x'] as $body) {
        $request = new WP_REST_Request(
            'GET',
            '/mbb/v2/component-frame/request-fixture/0.1.0/' . $digest,
        );
        $request->set_url_params([
            'component' => 'request-fixture',
            'version' => '0.1.0',
            'digest' => $digest,
        ]);
        if ($body !== null) {
            $request->set_body($body);
        }
        if (
            $request->get_body() !== $body ||
            (mbb_component_frame_provider($request) !== null) !== ($body !== 'x')
        ) {
            throw new RuntimeException('Actual core REST empty/nonempty body contract failed.');
        }
    }
} finally {
    $GLOBALS['mbb_components'] = $registry;
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
