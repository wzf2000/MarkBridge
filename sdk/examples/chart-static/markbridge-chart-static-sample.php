<?php
/**
 * Plugin Name: MarkBridge SDK Chart Static Sample
 * Description: Trusted typed-tree bridge for the frozen small-data chart research provider.
 * Version: 0.1.0
 * Requires PHP: 8.2
 * License: GPL-3.0-or-later
 */
if (!defined('ABSPATH')) {
    exit();
}
require_once __DIR__ . '/model.php';
add_action(
    'init',
    static function () {
        if (!function_exists('mbb_register_component_projection')) {
            return;
        }
        $files = [];
        foreach ([__FILE__, __DIR__ . '/model.php'] as $file) {
            $files[] = ['file' => $file, 'sha256' => hash_file('sha256', $file)];
        }
        mbb_register_component_projection('small-data-chart', '0.0.1', [
            'contract' => 'mbb-component-projection/v1',
            'version' => '0.1.0',
            'render' => 'mbb_sdk_chart_projection',
            'files' => $files,
        ]);
    },
    30,
);
add_action('markbridge_register_extensions', static function () {
    if (function_exists('mbb_register_extension_manifest')) {
        mbb_register_extension_manifest('sdk-chart-static', [
            'version' => '0.1.0',
            'title' => 'SDK Chart Static Sample',
            'minMarkBridge' => '2.9.0-dev.1',
            'capabilities' => ['static-projection'],
        ]);
    }
});
