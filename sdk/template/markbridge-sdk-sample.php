<?php
/**
 * Plugin Name: MarkBridge SDK Bounded Sum Sample
 * Description: Minimal trusted provider scaffold with monotonic execution deadlines.
 * Version: 0.1.0
 * Requires PHP: 8.2
 * License: GPL-3.0-or-later
 */
if (!defined('ABSPATH')) {
    exit();
}
add_action('markbridge_register_teaching_components', static function () {
    if (!function_exists('markbridge_register_teaching_component')) {
        return;
    }
    $m = json_decode(file_get_contents(__DIR__ . '/manifest.json'), true, 8, JSON_THROW_ON_ERROR);
    if (!preg_match('/\Asum-[a-f0-9]{12}\.html\.txt\z/D', $m['file'] ?? '')) {
        return;
    }
    markbridge_register_teaching_component('sdk-bounded-sum', [
        'version' => '0.1.0',
        'protocolVersion' => 1,
        'minMarkBridge' => '2.9.0-dev.1',
        'title' => 'SDK bounded sum',
        'budgets' => [
            'resourceBytes' => 524288,
            'startupMs' => 5000,
            'wallMs' => 2000,
            'traceFrames' => 8192,
            'traceBytes' => 524288,
        ],
        'schema' => [
            'type' => 'object',
            'required' => ['values'],
            'additionalProperties' => false,
            'properties' => [
                'values' => [
                    'type' => 'array',
                    'minItems' => 1,
                    'maxItems' => 32,
                    'items' => ['type' => 'integer', 'minimum' => -1000, 'maximum' => 1000],
                ],
            ],
        ],
        'defaults' => (object) ['values' => [1, 2, 3]],
        'resource' => [
            'file' => __DIR__ . '/assets/' . $m['file'],
            'url' => plugins_url('assets/' . $m['file'], __FILE__),
            'sha256' => $m['sha256'],
        ],
    ]);
});
add_action('markbridge_register_extensions', static function () {
    if (function_exists('mbb_register_extension_manifest')) {
        mbb_register_extension_manifest('sdk-bounded-sum', [
            'version' => '0.1.0',
            'title' => 'SDK bounded sum',
            'minMarkBridge' => '2.9.0-dev.1',
            'capabilities' => ['components'],
        ]);
    }
});
