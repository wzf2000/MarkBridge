<?php
/** Runnable synthetic indexed provider; load after the main plugin in a local fixture only. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function mbb_sdk_indexed_definition(string $version, string $file, string $expectedSha256): array
{
    return [
        'version' => $version,
        'title' => 'Indexed counter ' . $version,
        'protocolVersion' => 1,
        'minMarkBridge' => '3.4.0-rc.1',
        'schema' => [
            'type' => 'object',
            'additionalProperties' => false,
            'required' => ['n'],
            'properties' => ['n' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 10]],
        ],
        'defaults' => ['n' => 1],
        'resource' => [
            'file' => $file,
            'url' => plugins_url(basename($file), $file),
            'sha256' => $expectedSha256,
        ],
        'budgets' => mbb_component_budget_limits(),
    ];
}
function mbb_sdk_register_indexed(string $file, string $expectedSha256, int $count = 40): bool
{
    $versions = [];
    for ($i = 0; $i < $count; $i++) {
        $version = '1.' . $i . '.0';
        $p = mbb_sdk_indexed_definition($version, $file, $expectedSha256);
        $versions[] = [
            'version' => $version,
            'title' => $p['title'],
            'fingerprint' => markbridge_teaching_component_fingerprint('sdk-indexed-counter', $p),
        ];
    }
    return markbridge_register_teaching_component_catalog(
        'sdk-indexed-counter',
        [
            'title' => 'Indexed counters',
            'defaultVersion' => '1.0.0',
            'versions' => $versions,
        ],
        static function (string $id, string $version) use ($file, $expectedSha256) {
            return mbb_sdk_indexed_definition($version, $file, $expectedSha256);
        },
    );
}
