<?php
// Only the newly installed synthetic local WordPress is eligible for selection.
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
$backend = $args[0] ?? '';
$runtime = getenv('MARKBRIDGE_TEST_RUNTIME');
if (
    !$root ||
    !$home ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    realpath(ABSPATH) !== realpath($root) ||
    rtrim(home_url(), '/') !== rtrim($home, '/') ||
    wp_get_environment_type() !== 'local' ||
    !in_array($backend, ['php', 'node'], true) ||
    !is_string($runtime) ||
    !is_dir($runtime)
) {
    throw new RuntimeException('Backend test requires the explicit synthetic local installation.');
}
$diagnostics =
    $backend === 'php'
        ? mbb_php_converter_diagnostics(true)
        : mbb_runtime_diagnostics($runtime, true);
if (!$diagnostics['ok']) {
    $failed = array_column(
        array_filter($diagnostics['checks'], static fn($c) => !$c['ok']),
        'code',
    );
    throw new RuntimeException('Backend diagnostics rejected: ' . implode(', ', $failed));
}
$settings = ['backend' => $backend, 'runtime_path' => $runtime];
update_option(MBB_CONVERTER_OPTION, $settings, false);
if (mbb_converter_settings() !== $settings) {
    throw new RuntimeException('Backend setting did not persist.');
}
echo 'Verified and selected synthetic backend: ' . $backend . PHP_EOL;
