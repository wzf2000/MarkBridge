<?php
/**
 * Plugin Name: MarkBridge Fixed Resource v2 Test Provider
 * Description: Synthetic local-only fixed public resources and typed static projection.
 * Version: 0.1.0
 * License: GPL-3.0-or-later
 */
if (!defined('ABSPATH')) {
    exit();
}
// This test plugin cannot register on a normal/public installation.
if (
    !defined('MARKBRIDGE_TEST_RESOURCE_V2') ||
    MARKBRIDGE_TEST_RESOURCE_V2 !== true ||
    wp_get_environment_type() !== 'local' ||
    !in_array(parse_url(home_url(), PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true)
) {
    return;
}
function mbb_test_resource_v2_projection($params, $context): array
{
    $data = json_decode(
        markbridge_teaching_resource_bytes('public-resources-fixture', '0.1.0', 'data'),
        true,
        8,
        JSON_THROW_ON_ERROR,
    );
    return [
        'schema' => 1,
        'tree' => [
            [
                'tag' => 'p',
                'attrs' => (object) [],
                'children' => [
                    'Fixed public data; no running payload is needed for this projection.',
                ],
            ],
            [
                'tag' => 'table',
                'attrs' => (object) [],
                'children' => [
                    [
                        'tag' => 'caption',
                        'attrs' => (object) [],
                        'children' => ['Public resource semantics'],
                    ],
                    [
                        'tag' => 'thead',
                        'attrs' => (object) [],
                        'children' => [
                            [
                                'tag' => 'tr',
                                'attrs' => (object) [],
                                'children' => [
                                    [
                                        'tag' => 'th',
                                        'attrs' => ['scope' => 'col'],
                                        'children' => ['Item'],
                                    ],
                                    [
                                        'tag' => 'th',
                                        'attrs' => ['scope' => 'col'],
                                        'children' => ['Value'],
                                    ],
                                ],
                            ],
                        ],
                    ],
                    [
                        'tag' => 'tbody',
                        'attrs' => (object) [],
                        'children' => [
                            [
                                'tag' => 'tr',
                                'attrs' => (object) [],
                                'children' => [
                                    [
                                        'tag' => 'td',
                                        'attrs' => (object) [],
                                        'children' => ['Sample A'],
                                    ],
                                    [
                                        'tag' => 'td',
                                        'attrs' => (object) [],
                                        'children' => [(string) $data['value']],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ];
}
add_action('markbridge_register_teaching_components', static function () {
    if (
        !function_exists('markbridge_teaching_supports_resource_groups') ||
        !markbridge_teaching_supports_resource_groups()
    ) {
        return;
    }
    $manifest = __DIR__ . '/assets/0.1.0/manifest.json';
    markbridge_register_teaching_component('public-resources-fixture', [
        'version' => '0.1.0',
        'title' => 'Fixed public resource fixture',
        'protocolVersion' => 2,
        'minMarkBridge' => '3.2.0-rc.2',
        'schema' => [
            'type' => 'object',
            'properties' => ['text' => ['type' => 'string']],
            'additionalProperties' => false,
        ],
        'defaults' => (object) [],
        'budgets' => [
            'resourceBytes' => 524288,
            'startupMs' => 5000,
            'wallMs' => 2000,
            'traceFrames' => 8192,
            'traceBytes' => 524288,
        ],
        'resource' => [
            'file' => __DIR__ . '/frame.html',
            'url' => plugins_url('frame.html', __FILE__),
            'sha256' => '229f0796c04723343698d30b8b939027ccc3636794ba3eb3c6962b8ed2b56e8c',
        ],
        'resources' => [
            'file' => $manifest,
            'url' => plugins_url('assets/0.1.0/manifest.json', __FILE__),
            'sha256' => '71c1bff07f7fefa311d5814984f3c88df7fc4e0a55760110bbce6c137ae003ea',
        ],
    ]);
    mbb_register_component_projection('public-resources-fixture', '0.1.0', [
        'contract' => 'mbb-component-projection/v1',
        'version' => '0.1.0',
        'render' => 'mbb_test_resource_v2_projection',
        'files' => [['file' => __FILE__, 'sha256' => hash_file('sha256', __FILE__)]],
    ]);
});
