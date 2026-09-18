<?php
// WP-CLI integration check: wp eval-file tests/runtime-diagnostics-wp.php <runtime> <pass|fail>.
if (!defined('WP_CLI') || !WP_CLI) {
    exit();
}
if (empty($args[0]) || !in_array($args[1] ?? '', ['pass', 'fail'], true)) {
    WP_CLI::error('Usage: wp eval-file tests/runtime-diagnostics-wp.php <runtime> <pass|fail>');
}
define('MARKBRIDGE_RUNTIME', $args[0]);
require_once __DIR__ . '/../plugin/includes/runtime-settings.php';

function mbb_error($code, $message, $status = 409)
{
    return new WP_Error($code, $message, ['status' => $status]);
}

$diagnostics = mbb_runtime_diagnostics(null, ($args[1] ?? '') === 'pass');
$failed = array_values(
    array_map(
        fn($check) => $check['code'],
        array_filter($diagnostics['checks'], fn($check) => !$check['ok']),
    ),
);
WP_CLI::log(
    wp_json_encode([
        'ok' => $diagnostics['ok'],
        'source' => mbb_runtime_configuration()['source'],
        'failed' => $failed,
    ]),
);
$expected = ($args[1] ?? '') === 'pass';
if ($diagnostics['ok'] !== $expected) {
    WP_CLI::error('Runtime diagnostic result did not match expectation.');
}
