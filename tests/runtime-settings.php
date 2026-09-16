<?php
// Focused runtime configuration and manifest compatibility checks with WordPress stubs.

$test_root = sys_get_temp_dir() . '/markbridge-runtime-settings-' . getmypid();
define('ABSPATH', $test_root . '/public/');
define('WP_CONTENT_DIR', ABSPATH . 'wp-content');
$constant_mode = ($argv[1] ?? '') === 'constant';
if ($constant_mode) {
    define('MARKBRIDGE_RUNTIME', $test_root . '/constant-runtime');
}

$GLOBALS['mbb_test_option'] = '';
function wp_unslash($value)
{
    return $value;
}
function wp_normalize_path($path)
{
    return str_replace('\\', '/', $path);
}
function get_option($name, $default = false)
{
    return $name === 'mbb_runtime_path' ? $GLOBALS['mbb_test_option'] : $default;
}
function wp_upload_dir()
{
    return ['basedir' => WP_CONTENT_DIR . '/uploads', 'error' => false];
}
function get_bloginfo($field)
{
    return $field === 'version' ? '6.9.2' : '';
}
function add_action() {}

require_once __DIR__ . '/../plugin/includes/runtime-settings.php';

function mbb_test_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function mbb_test_remove($path)
{
    if (!is_dir($path)) {
        return;
    }
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST,
    );
    foreach ($iterator as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
    rmdir($path);
}

try {
    if ($constant_mode) {
        $GLOBALS['mbb_test_option'] = $test_root . '/database-runtime';
        mbb_test_assert(mbb_runtime_configuration()['source'] === 'constant', 'constant source');
        mbb_test_assert(
            mbb_runtime() === $test_root . '/constant-runtime',
            'database setting overrode constant',
        );
        mbb_test_assert(!mbb_runtime_diagnostics()['ok'], 'invalid constant silently fell back');
        echo "Runtime constant priority check passed.\n";
        return;
    }
    mbb_test_assert(
        mbb_runtime_configuration()['source'] === 'unconfigured',
        'first install must be unconfigured',
    );
    mkdir(ABSPATH . 'wp-includes/js', 0750, true);
    mkdir(WP_CONTENT_DIR . '/uploads', 0750, true);
    file_put_contents(ABSPATH . 'wp-includes/js/example.js', 'core');
    $runtime = $test_root . '/private-runtime';
    mkdir($runtime . '/node/bin', 0750, true);
    mkdir($runtime . '/site/wp-includes/js', 0750, true);
    mkdir($runtime . '/site/wp-content/plugins/markdown-block-bridge', 0750, true);
    foreach (['package.json', 'package-lock.json'] as $name) {
        copy(__DIR__ . '/../runtime/' . $name, $runtime . '/' . $name);
    }
    mkdir($runtime . '/run');
    file_put_contents($runtime . '/run/worker-bootstrap.html', 'synthetic bootstrap');
    copy(__DIR__ . '/../plugin/worker.cjs', $runtime . '/worker.cjs');
    copy(ABSPATH . 'wp-includes/js/example.js', $runtime . '/site/wp-includes/js/example.js');
    copy(
        __DIR__ . '/../plugin/kernel.js',
        $runtime . '/site/wp-content/plugins/markdown-block-bridge/kernel.js',
    );
    file_put_contents($runtime . '/node/bin/node', "#!/usr/bin/sh\necho v24.21.0\n");
    chmod($runtime . '/node/bin/node', 0750);
    $manifest = [
        'format' => 1,
        'wordpress' => '6.9.2',
        'node' => 'v24.21.0',
        'core_sha256' => [
            '/wp-includes/js/example.js' => hash_file(
                'sha256',
                ABSPATH . 'wp-includes/js/example.js',
            ),
        ],
        'kernel_sha256' => hash_file('sha256', __DIR__ . '/../plugin/kernel.js'),
        'worker_sha256' => hash_file('sha256', __DIR__ . '/../plugin/worker.cjs'),
        'bootstrap_sha256' => hash_file('sha256', $runtime . '/run/worker-bootstrap.html'),
        'runtime_sha256' => [
            'package.json' => hash_file('sha256', $runtime . '/package.json'),
            'package-lock.json' => hash_file('sha256', $runtime . '/package-lock.json'),
        ],
    ];
    file_put_contents($runtime . '/manifest.json', json_encode($manifest));

    $GLOBALS['mbb_test_option'] = $runtime;
    mbb_test_assert(mbb_runtime_configuration()['source'] === 'database', 'database source');
    mbb_test_assert(mbb_runtime() === realpath($runtime), 'database path');
    $valid = mbb_runtime_diagnostics();
    $failed = array_column(array_filter($valid['checks'], fn($check) => !$check['ok']), 'code');
    mbb_test_assert($valid['ok'], 'valid runtime rejected: ' . implode(',', $failed));

    $public = ABSPATH . 'runtime';
    mkdir($public);
    $public_result = mbb_runtime_diagnostics($public);
    mbb_test_assert(!$public_result['ok'], 'public runtime accepted');
    mbb_test_assert(
        !array_values(
            array_filter(
                $public_result['checks'],
                fn($check) => $check['code'] === 'private_path' && $check['ok'],
            ),
        ),
        'public path check passed',
    );

    $manifest['kernel_sha256'] = str_repeat('0', 64);
    file_put_contents($runtime . '/manifest.json', json_encode($manifest));
    $mismatch = mbb_runtime_diagnostics($runtime);
    mbb_test_assert(!$mismatch['ok'], 'kernel mismatch accepted');
    mbb_test_assert(
        !array_values(
            array_filter(
                $mismatch['checks'],
                fn($check) => $check['code'] === 'kernel' && $check['ok'],
            ),
        ),
        'kernel mismatch check passed',
    );

    echo "Runtime settings checks passed.\n";
} finally {
    mbb_test_remove($test_root);
}
