<?php

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

require_once __DIR__ . '/i18n.php';
// Runtime configuration, compatibility checks and administrator-only diagnostics.
require_once __DIR__ . '/conversion-backends.php';

const MBB_RUNTIME_OPTION = 'mbb_runtime_path';
const MBB_RUNTIME_MANIFEST_VERSION = 1;

function mbb_runtime_normalize_path($path)
{
    if (!is_string($path)) {
        return '';
    }
    $path = trim($path);
    if ($path === '' || strpos($path, "\0") !== false) {
        return '';
    }
    $real = realpath($path);
    return $real === false ? rtrim($path, '/\\') : rtrim($real, '/\\');
}

function mbb_runtime_configuration()
{
    if (defined('MARKBRIDGE_RUNTIME')) {
        return [
            'source' => 'constant',
            'path' => mbb_runtime_normalize_path(MARKBRIDGE_RUNTIME),
            'managed' => true,
        ];
    }
    $settings = mbb_converter_settings();
    if ($settings !== null) {
        return [
            'source' => $settings === false ? 'invalid' : 'database',
            'path' =>
                $settings === false ? '' : mbb_runtime_normalize_path($settings['runtime_path']),
            'managed' => false,
        ];
    }
    $path = mbb_runtime_normalize_path(get_option(MBB_RUNTIME_OPTION, ''));
    return [
        'source' => $path === '' ? 'unconfigured' : 'database',
        'path' => $path,
        'managed' => false,
    ];
}

function mbb_runtime()
{
    return mbb_runtime_configuration()['path'];
}

function mbb_runtime_path_inside($path, $parent)
{
    $path = rtrim(wp_normalize_path($path), '/');
    $parent = rtrim(wp_normalize_path($parent), '/');
    return $parent !== '' && ($path === $parent || str_starts_with($path . '/', $parent . '/'));
}

function mbb_runtime_public_roots()
{
    $roots = [ABSPATH];
    if (!empty($_SERVER['DOCUMENT_ROOT'])) {
        $roots[] = $_SERVER['DOCUMENT_ROOT'];
    }
    if (defined('WP_CONTENT_DIR')) {
        $roots[] = WP_CONTENT_DIR;
    }
    $uploads = wp_upload_dir(null, false);
    if (empty($uploads['error']) && !empty($uploads['basedir'])) {
        $roots[] = $uploads['basedir'];
    }
    return array_values(array_unique(array_filter(array_map('realpath', $roots))));
}

function mbb_runtime_check($code, $label, $ok, $message)
{
    return compact('code', 'label', 'ok', 'message');
}

function mbb_runtime_hash($algorithm, $path)
{
    return is_readable($path) ? (@hash_file($algorithm, $path) ?: '') : '';
}

function mbb_runtime_manifest($runtime)
{
    $path = $runtime . '/manifest.json';
    if (!is_readable($path)) {
        return null;
    }
    $manifest = json_decode(file_get_contents($path), true);
    return is_array($manifest) ? $manifest : null;
}

function mbb_runtime_node_version($runtime)
{
    if (
        !is_executable($runtime . '/node/bin/node') ||
        !is_executable('/usr/bin/timeout') ||
        !is_executable('/usr/bin/bwrap')
    ) {
        return '';
    }
    $pipes = [];
    $command = array_merge(array_slice(mbb_runtime_command($runtime), 0, -2), ['--version']);
    $process = proc_open($command, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
    if (!is_resource($process)) {
        return '';
    }
    fclose($pipes[0]);
    $version = trim(stream_get_contents($pipes[1]));
    fclose($pipes[1]);
    stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    return proc_close($process) === 0 ? $version : '';
}

function mbb_runtime_quick_status()
{
    if (mbb_converter_backend() === 'php') {
        return mbb_php_converter_diagnostics()['ok'];
    }
    if (mbb_converter_backend() !== 'node') {
        return false;
    }
    $runtime = mbb_runtime();
    if ($runtime === '' || !is_dir($runtime)) {
        return false;
    }
    foreach (mbb_runtime_public_roots() as $root) {
        if (mbb_runtime_path_inside($runtime, $root)) {
            return false;
        }
    }
    return is_readable($runtime . '/manifest.json') &&
        is_readable($runtime . '/worker.cjs') &&
        is_executable($runtime . '/node/bin/node') &&
        is_executable('/usr/bin/timeout') &&
        is_executable('/usr/bin/bwrap');
}

function mbb_runtime_diagnostics($candidate = null, $smoke = false)
{
    if ($candidate === null && mbb_converter_backend() === 'php') {
        return mbb_php_converter_diagnostics($smoke);
    }
    if ($candidate === null && mbb_converter_backend() !== 'node') {
        return [
            'ok' => false,
            'path' => '',
            'checks' => [
                mbb_runtime_check(
                    'backend',
                    mbb_t('Conversion backend'),
                    false,
                    mbb_t(
                        'The conversion backend configuration is invalid. No other backend will be used as a fallback.',
                    ),
                ),
            ],
        ];
    }
    $runtime = mbb_runtime_normalize_path($candidate === null ? mbb_runtime() : $candidate);
    $checks = [];
    $add = static function ($code, $label, $ok, $message) use (&$checks) {
        $checks[] = mbb_runtime_check($code, $label, (bool) $ok, $message);
    };
    if ($runtime === '') {
        $add(
            'path',
            mbb_t('Runtime directory'),
            false,
            mbb_t('No runtime directory is configured.'),
        );
        return ['ok' => false, 'path' => '', 'checks' => $checks];
    }
    $exists = is_dir($runtime);
    $add(
        'path',
        mbb_t('Runtime directory'),
        $exists,
        $exists ? mbb_t('The directory exists.') : mbb_t('The directory does not exist.'),
    );
    if (!$exists) {
        return ['ok' => false, 'path' => $runtime, 'checks' => $checks];
    }
    $public = false;
    foreach (mbb_runtime_public_roots() as $root) {
        if (mbb_runtime_path_inside($runtime, $root)) {
            $public = true;
            break;
        }
    }
    $add(
        'private_path',
        mbb_t('Directory isolation'),
        !$public,
        $public
            ? mbb_t(
                'The runtime directory must not be inside WordPress or a public uploads directory.',
            )
            : mbb_t('The runtime directory is outside public directories.'),
    );
    if ($public) {
        return ['ok' => false, 'path' => $runtime, 'checks' => $checks];
    }
    $readable = is_readable($runtime) && is_readable($runtime . '/worker.cjs');
    $add(
        'permissions',
        mbb_t('Read permissions'),
        $readable,
        $readable
            ? mbb_t('The PHP process can read runtime files.')
            : mbb_t('The PHP process cannot read the runtime directory or worker.cjs.'),
    );
    $manifest = mbb_runtime_manifest($runtime);
    $manifest_ok =
        is_array($manifest) &&
        ($manifest['format'] ?? null) === MBB_RUNTIME_MANIFEST_VERSION &&
        is_string($manifest['node'] ?? null) &&
        !empty($manifest['core_sha256']) &&
        is_array($manifest['core_sha256']);
    $add(
        'manifest',
        mbb_t('Runtime manifest'),
        $manifest_ok,
        $manifest_ok
            ? mbb_t('The manifest format is valid.')
            : mbb_t('manifest.json is missing, damaged, or has an unsupported version.'),
    );
    if (!is_callable('proc_open')) {
        $add(
            'process',
            mbb_t('Process execution'),
            false,
            mbb_t('PHP proc_open is unavailable; isolated conversion cannot run.'),
        );
        return ['ok' => false, 'path' => $runtime, 'checks' => $checks];
    }
    $node = $runtime . '/node/bin/node';
    $node_version = mbb_runtime_node_version($runtime);
    $node_major = (int) explode('.', ltrim($node_version, 'v'))[0];
    $node_ok =
        $node_version !== '' &&
        version_compare(ltrim($node_version, 'v'), '24.15.0', '>=') &&
        (!$manifest_ok || hash_equals((string) $manifest['node'], $node_version));
    $add(
        'node',
        'Node.js',
        $node_ok,
        $node_ok
            ? mbb_t('The private Node.js version matches and is executable.')
            : mbb_t('Private Node.js is missing, outdated, or does not match the manifest.'),
    );
    foreach (
        ['/usr/bin/timeout' => 'timeout', '/usr/bin/bwrap' => 'bubblewrap']
        as $path => $name
    ) {
        $add(
            $name,
            $name,
            is_executable($path),
            is_executable($path)
                ? $name . mbb_t(' is executable.')
                : $name . mbb_t(' is missing or not executable.'),
        );
    }
    if ($manifest_ok) {
        $same_wordpress =
            isset($manifest['wordpress']) &&
            hash_equals((string) $manifest['wordpress'], (string) get_bloginfo('version'));
        $add(
            'wordpress',
            mbb_t('WordPress version'),
            $same_wordpress,
            $same_wordpress
                ? mbb_t('The version matches.')
                : mbb_t('The runtime does not match the current WordPress version.'),
        );
        $core_ok = true;
        foreach ($manifest['core_sha256'] as $name => $expected) {
            if (
                !is_string($name) ||
                !str_starts_with($name, '/wp-includes/js/') ||
                str_contains($name, '..')
            ) {
                $core_ok = false;
                break;
            }
            $source = ABSPATH . ltrim($name, '/');
            $snapshot = $runtime . '/site/' . ltrim($name, '/');
            if (
                !is_file($source) ||
                !is_file($snapshot) ||
                !hash_equals((string) $expected, mbb_runtime_hash('sha256', $source)) ||
                !hash_equals((string) $expected, mbb_runtime_hash('sha256', $snapshot))
            ) {
                $core_ok = false;
                break;
            }
        }
        $add(
            'wordpress_core',
            mbb_t('WordPress core scripts'),
            $core_ok,
            $core_ok
                ? mbb_t('The core script snapshot matches.')
                : mbb_t('The core script snapshot differs. Rebuild the runtime.'),
        );
        $kernel_snapshot = $runtime . '/site/wp-content/plugins/markdown-block-bridge/kernel.js';
        $kernel_ok =
            isset($manifest['kernel_sha256']) &&
            is_file(__DIR__ . '/../kernel.js') &&
            is_file($kernel_snapshot);
        $kernel_ok =
            $kernel_ok &&
            hash_equals(
                (string) $manifest['kernel_sha256'],
                mbb_runtime_hash('sha256', __DIR__ . '/../kernel.js'),
            ) &&
            hash_equals(
                (string) $manifest['kernel_sha256'],
                mbb_runtime_hash('sha256', $kernel_snapshot),
            );
        $add(
            'kernel',
            mbb_t('Conversion kernel'),
            $kernel_ok,
            $kernel_ok
                ? mbb_t('The conversion kernel matches.')
                : mbb_t('The conversion kernel differs from the plugin. Rebuild the runtime.'),
        );
        $worker_ok =
            isset($manifest['worker_sha256']) &&
            is_file(__DIR__ . '/../worker.cjs') &&
            is_file($runtime . '/worker.cjs');
        $worker_ok =
            $worker_ok &&
            hash_equals(
                (string) $manifest['worker_sha256'],
                mbb_runtime_hash('sha256', __DIR__ . '/../worker.cjs'),
            ) &&
            hash_equals(
                (string) $manifest['worker_sha256'],
                mbb_runtime_hash('sha256', $runtime . '/worker.cjs'),
            );
        $add(
            'worker',
            mbb_t('Conversion worker'),
            $worker_ok,
            $worker_ok
                ? mbb_t('The conversion worker matches.')
                : mbb_t('worker.cjs differs from the plugin or manifest.'),
        );
        $contract = json_decode(@file_get_contents(__DIR__ . '/../runtime-contract.json'), true);
        $bootstrap = $runtime . '/run/worker-bootstrap.html';
        $bootstrap_ok =
            is_file($bootstrap) &&
            is_string($manifest['bootstrap_sha256'] ?? null) &&
            hash_equals($manifest['bootstrap_sha256'], mbb_runtime_hash('sha256', $bootstrap));
        $add(
            'bootstrap',
            mbb_t('Conversion startup snapshot'),
            $bootstrap_ok,
            $bootstrap_ok
                ? mbb_t('The startup snapshot matches.')
                : mbb_t('The startup snapshot changed. Rebuild the runtime.'),
        );
        $files_ok =
            is_array($manifest['runtime_sha256'] ?? null) &&
            is_array($contract) &&
            $manifest['runtime_sha256'] == $contract &&
            count($manifest['runtime_sha256']) === 2 &&
            !array_diff(
                ['package.json', 'package-lock.json'],
                array_keys($manifest['runtime_sha256']),
            );
        foreach (
            is_array($manifest['runtime_sha256'] ?? null) ? $manifest['runtime_sha256'] : []
            as $name => $expected
        ) {
            if (!in_array($name, ['package.json', 'package-lock.json'], true)) {
                $files_ok = false;
                break;
            }
            $path = $runtime . '/' . $name;
            if (
                !is_file($path) ||
                !hash_equals((string) $expected, mbb_runtime_hash('sha256', $path))
            ) {
                $files_ok = false;
                break;
            }
        }
        $add(
            'dependencies',
            mbb_t('Runtime dependencies'),
            $files_ok,
            $files_ok
                ? mbb_t('The dependency lockfile matches.')
                : mbb_t('The dependency lockfile differs.'),
        );
    }
    $ok = !in_array(false, array_column($checks, 'ok'), true);
    if ($ok && $smoke) {
        $result = mbb_run_worker(
            [
                'mode' => 'markdown',
                'source' => "# Runtime check\n\nHello **blocks**.\n",
                'documentId' => 'runtime-check',
            ],
            $runtime,
        );
        $smoke_ok = !is_wp_error($result) && !empty($result['ok']);
        $add(
            'conversion',
            mbb_t('Isolated conversion'),
            $smoke_ok,
            $smoke_ok
                ? mbb_t('Isolated conversion passed.')
                : mbb_t('Isolated conversion failed. The configuration was not switched.'),
        );
        $ok = $smoke_ok;
    }
    return ['ok' => $ok, 'path' => $runtime, 'checks' => $checks];
}

function mbb_runtime_command($runtime)
{
    $worker_root = '/opt/markbridge-runtime';
    return [
        '/usr/bin/timeout',
        '25',
        '/usr/bin/env',
        '-i',
        'PATH=/usr/bin:/bin',
        'HOME=/tmp',
        '/usr/bin/bwrap',
        '--unshare-all',
        '--die-with-parent',
        '--new-session',
        '--ro-bind',
        '/usr',
        '/usr',
        '--ro-bind',
        '/lib',
        '/lib',
        '--ro-bind',
        '/lib64',
        '/lib64',
        '--ro-bind',
        $runtime,
        $worker_root,
        '--proc',
        '/proc',
        '--dev',
        '/dev',
        '--tmpfs',
        '/tmp',
        '--setenv',
        'HOME',
        '/tmp',
        '--chdir',
        '/tmp',
        $worker_root . '/node/bin/node',
        $worker_root . '/worker.cjs',
        $worker_root,
    ];
}

function mbb_runtime_lock()
{
    $path = sys_get_temp_dir() . '/mbb-converter-' . hash('sha256', ABSPATH) . '.lock';
    if (is_link($path) || (file_exists($path) && !is_file($path))) {
        return false;
    }
    // flock does not require a writable descriptor on supported Linux hosts.
    // The lock contains no data; CLI and PHP may have different OS identities.
    $lock = @fopen($path, 'r');
    if (!$lock && !file_exists($path)) {
        $lock = @fopen($path, 'x');
        if ($lock) {
            chmod($path, 0644);
        } else {
            $lock = !is_link($path) ? @fopen($path, 'r') : false;
        }
    }
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        if ($lock) {
            fclose($lock);
        }
        return false;
    }
    return $lock;
}

function mbb_run_worker($input, $runtime = null)
{
    if (!is_callable('proc_open')) {
        return mbb_error(
            'worker',
            mbb_t(
                'PHP process execution is unavailable. Node conversion did not run; original content was not written.',
            ),
            503,
        );
    }
    $runtime = $runtime ?? mbb_runtime();
    $lock = mbb_runtime_lock();
    if (!$lock) {
        return mbb_error(
            'busy',
            mbb_t(
                'The converter is processing another request or the shared lock is unreadable. Try later and check permissions.',
            ),
            409,
        );
    }
    try {
        $pipes = [];
        $process = proc_open(
            mbb_runtime_command($runtime),
            [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']],
            $pipes,
        );
        if (!is_resource($process)) {
            return mbb_error('worker', mbb_t('The conversion service is unavailable.'), 503);
        }
        fwrite($pipes[0], wp_json_encode($input));
        fclose($pipes[0]);
        $output = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        stream_get_contents($pipes[2]);
        fclose($pipes[2]);
        $exit = proc_close($process);
        $result = json_decode($output, true);
        if ($exit !== 0 || !is_array($result)) {
            return mbb_error(
                'worker',
                mbb_t('The conversion service did not complete. Original content was not written.'),
                503,
            );
        }
        return $result;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function mbb_runtime_admin_notice()
{
    if (!current_user_can('manage_options')) {
        return;
    }
    if (!mbb_runtime_quick_status()) {
        $url = admin_url('options-general.php?page=markbridge');
        echo '<div class="notice notice-warning"><p>';
        echo wp_kses_post(
            mbb_t('MarkBridge: the conversion runtime is unavailable. <a href="') .
                esc_url($url) .
                mbb_t('">View settings and diagnostics</a>.'),
        );
        echo '</p></div>';
    }
}
add_action('admin_notices', 'mbb_runtime_admin_notice');

function mbb_runtime_settings_menu()
{
    add_options_page(
        'MarkBridge',
        'MarkBridge',
        'manage_options',
        'markbridge',
        'mbb_runtime_settings_page',
    );
}
add_action('admin_menu', 'mbb_runtime_settings_menu');

function mbb_runtime_settings_save()
{
    if (!current_user_can('manage_options')) {
        wp_die(mbb_t('You cannot change MarkBridge settings.'), '', ['response' => 403]);
    }
    check_admin_referer('mbb_runtime_save');
    if (
        defined('MARKBRIDGE_RUNTIME') ||
        mbb_converter_backend() !== 'node' ||
        mbb_converter_settings() === false ||
        (is_array(mbb_converter_settings()) && mbb_converter_settings()['backend'] !== 'node')
    ) {
        wp_safe_redirect(admin_url('options-general.php?page=markbridge&mbb-runtime=managed'));
        exit();
    }
    $candidate = mbb_runtime_normalize_path(wp_unslash($_POST['runtime_path'] ?? ''));
    $diagnostics = mbb_runtime_diagnostics($candidate, true);
    if ($diagnostics['ok']) {
        $settings = mbb_converter_settings();
        if (is_array($settings)) {
            $settings['runtime_path'] = $diagnostics['path'];
            if (mbb_converter_settings() !== $settings) {
                update_option(MBB_CONVERTER_OPTION, $settings, false);
            }
            $result = mbb_converter_settings() === $settings ? 'updated' : 'save-failed';
        } else {
            $result =
                get_option(MBB_RUNTIME_OPTION, '') === $diagnostics['path'] ||
                update_option(MBB_RUNTIME_OPTION, $diagnostics['path'], false)
                    ? 'updated'
                    : 'save-failed';
        }
    } else {
        set_transient(
            'mbb_runtime_diagnostics_' . get_current_user_id(),
            $diagnostics,
            MINUTE_IN_SECONDS * 5,
        );
        $result = 'rejected';
    }
    wp_safe_redirect(admin_url('options-general.php?page=markbridge&mbb-runtime=' . $result));
    exit();
}
add_action('admin_post_mbb_runtime_save', 'mbb_runtime_settings_save');

function mbb_runtime_settings_page()
{
    if (!current_user_can('manage_options')) {
        wp_die(mbb_t('You cannot view MarkBridge settings.'), '', ['response' => 403]);
    }
    $tabs = mbb_admin_settings_tabs();
    $tab = is_string($_GET['tab'] ?? null) ? $_GET['tab'] : 'general';
    if (!isset($tabs[$tab])) {
        $tab = 'general';
    }
    echo '<div class="wrap mbb-settings"><h1>MarkBridge</h1>';
    mbb_admin_settings_navigation($tab);
    if ($tab !== 'general') {
        call_user_func($tabs[$tab]['render'], true);
        echo '</div>';
        return;
    }
    $configuration = mbb_runtime_configuration();
    $backend = mbb_converter_backend();
    // The overview always describes the active engine, never a rejected candidate.
    $diagnostics = mbb_runtime_diagnostics(null, true);
    $candidate = get_transient('mbb_converter_diagnostics_' . get_current_user_id());
    delete_transient('mbb_converter_diagnostics_' . get_current_user_id());
    $legacy_candidate = get_transient('mbb_runtime_diagnostics_' . get_current_user_id());
    delete_transient('mbb_runtime_diagnostics_' . get_current_user_id());
    mbb_admin_settings_overview($backend, $diagnostics);
    mbb_admin_settings_preferences();
    mbb_converter_settings_form();
    if (($_GET['mbb-runtime'] ?? '') === 'updated') {
        echo mbb_t(
            '<div class="notice notice-success"><p>The runtime was verified and enabled.</p></div>',
        );
    } elseif (($_GET['mbb-runtime'] ?? '') === 'save-failed') {
        echo mbb_t(
            '<div class="notice notice-error"><p>The database configuration could not be saved. Check the database state. No successful switch was reported.</p></div>',
        );
    } elseif (($_GET['mbb-runtime'] ?? '') === 'rejected') {
        echo mbb_t(
            '<div class="notice notice-error"><p>The proposed runtime failed verification. Original settings are unchanged.</p></div>',
        );
    } elseif (($_GET['mbb-runtime'] ?? '') === 'managed') {
        echo mbb_t(
            '<div class="notice notice-info"><p>This runtime directory endpoint cannot currently change configuration. Refresh the page and use the conversion backend settings. Server-managed directories cannot be overridden.</p></div>',
        );
    }
    $needs_attention =
        !$diagnostics['ok'] ||
        is_array($candidate) ||
        is_array($legacy_candidate) ||
        in_array($_GET['mbb-runtime'] ?? '', ['rejected', 'save-failed'], true) ||
        in_array($_GET['mbb-converter'] ?? '', ['rejected', 'save-failed'], true);
    echo '<details class="mbb-settings-advanced"' . ($needs_attention ? ' open' : '') . '>';
    echo '<summary>' .
        esc_html(mbb_t('Compatibility and advanced runtime settings')) .
        '</summary>';
    echo mbb_t('<p>Current backend: ') .
        esc_html(is_string($backend) ? $backend : 'invalid') .
        '</p>';
    if ($backend === 'node') {
        echo mbb_t('<p>Active configuration source: ') .
            esc_html($configuration['source']) .
            '</p>';
        echo '<form action="' . esc_url(admin_url('admin-post.php')) . '" method="post">';
        echo '<input type="hidden" name="action" value="mbb_runtime_save">';
        wp_nonce_field('mbb_runtime_save');
        echo mbb_t('<label for="mbb-runtime-path">Private server directory</label> ');
        echo '<input id="mbb-runtime-path" class="regular-text code" name="runtime_path" value="' .
            esc_attr($configuration['path']) .
            '"' .
            ($configuration['managed'] ? ' disabled' : '') .
            '>';
        if ($configuration['managed']) {
            echo mbb_t(
                '<p class="description">MARKBRIDGE_RUNTIME is defined. An invalid constant does not fall back to database settings.</p>',
            );
        }
        submit_button(
            mbb_t('Verify and save Node directory'),
            'primary',
            'submit',
            true,
            $configuration['managed'] ? ['disabled' => true] : [],
        );
        echo '</form>';
    } else {
        echo mbb_t(
            '<p>Select the engine in the conversion backend settings above. PHP requires no private Node directory, and failures do not fall back to another backend.</p>',
        );
    }
    echo mbb_t('<h2>Diagnostics</h2><table class="widefat striped"><tbody>');
    foreach ($diagnostics['checks'] as $check) {
        echo '<tr><th>' . esc_html($check['label']) . '</th><td>';
        echo esc_html($check['ok'] ? mbb_t('Passed') : mbb_t('Failed'));
        echo '</td><td>' . esc_html($check['message']) . '</td></tr>';
    }
    echo '</tbody></table>';
    if (is_array($candidate) && is_array($candidate['diagnostics'] ?? null)) {
        mbb_converter_candidate_diagnostics($candidate['backend'], $candidate['diagnostics']);
    }
    if (is_array($legacy_candidate)) {
        mbb_converter_candidate_diagnostics('node', $legacy_candidate);
    }
    echo '</details>';
    do_action('mbb_settings_page', $configuration, $diagnostics);
    echo '</div>';
}
