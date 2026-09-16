<?php
// Runtime configuration, compatibility checks and administrator-only diagnostics.

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
    $runtime = mbb_runtime_normalize_path($candidate === null ? mbb_runtime() : $candidate);
    $checks = [];
    $add = static function ($code, $label, $ok, $message) use (&$checks) {
        $checks[] = mbb_runtime_check($code, $label, (bool) $ok, $message);
    };
    if ($runtime === '') {
        $add('path', '运行目录', false, '尚未配置运行目录。');
        return ['ok' => false, 'path' => '', 'checks' => $checks];
    }
    $exists = is_dir($runtime);
    $add('path', '运行目录', $exists, $exists ? '目录存在。' : '目录不存在。');
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
        '目录隔离',
        !$public,
        $public ? '运行目录不能位于 WordPress 或上传公共目录内。' : '运行目录位于公共目录之外。',
    );
    if ($public) {
        return ['ok' => false, 'path' => $runtime, 'checks' => $checks];
    }
    $readable = is_readable($runtime) && is_readable($runtime . '/worker.cjs');
    $add(
        'permissions',
        '读取权限',
        $readable,
        $readable ? 'PHP 进程可读取运行文件。' : 'PHP 进程无法读取运行目录或 worker.cjs。',
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
        '运行清单',
        $manifest_ok,
        $manifest_ok ? '清单格式有效。' : 'manifest.json 缺失、损坏或版本不受支持。',
    );
    if (!is_callable('proc_open')) {
        $add('process', '进程执行', false, 'PHP proc_open 不可用，无法执行隔离转换。');
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
            ? '私有 Node.js 版本匹配且可执行。'
            : '私有 Node.js 缺失、版本过低或与清单不匹配。',
    );
    foreach (
        ['/usr/bin/timeout' => 'timeout', '/usr/bin/bwrap' => 'bubblewrap']
        as $path => $name
    ) {
        $add(
            $name,
            $name,
            is_executable($path),
            is_executable($path) ? $name . ' 可执行。' : $name . ' 缺失或不可执行。',
        );
    }
    if ($manifest_ok) {
        $same_wordpress =
            isset($manifest['wordpress']) &&
            hash_equals((string) $manifest['wordpress'], (string) get_bloginfo('version'));
        $add(
            'wordpress',
            'WordPress 版本',
            $same_wordpress,
            $same_wordpress ? '版本匹配。' : '运行环境与当前 WordPress 版本不匹配。',
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
            'WordPress 核心脚本',
            $core_ok,
            $core_ok ? '核心脚本快照匹配。' : '核心脚本快照不匹配，请重建运行环境。',
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
            '转换内核',
            $kernel_ok,
            $kernel_ok ? '转换内核匹配。' : '转换内核与插件不匹配，请重建运行环境。',
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
            '转换进程',
            $worker_ok,
            $worker_ok ? '转换进程匹配。' : 'worker.cjs 与插件或清单不匹配。',
        );
        $contract = json_decode(@file_get_contents(__DIR__ . '/../runtime-contract.json'), true);
        $bootstrap = $runtime . '/run/worker-bootstrap.html';
        $bootstrap_ok =
            is_file($bootstrap) &&
            is_string($manifest['bootstrap_sha256'] ?? null) &&
            hash_equals($manifest['bootstrap_sha256'], mbb_runtime_hash('sha256', $bootstrap));
        $add(
            'bootstrap',
            '转换启动快照',
            $bootstrap_ok,
            $bootstrap_ok ? '启动快照匹配。' : '启动快照已变化，请重建运行环境。',
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
            '运行依赖',
            $files_ok,
            $files_ok ? '依赖锁定文件匹配。' : '运行依赖锁定文件不匹配。',
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
            '隔离转换',
            $smoke_ok,
            $smoke_ok ? '隔离转换通过。' : '隔离转换失败，配置未切换。',
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
    $runtime = $runtime ?? mbb_runtime();
    $lock = mbb_runtime_lock();
    if (!$lock) {
        return mbb_error(
            'busy',
            '转换服务正在处理另一请求，或共享锁不可读，请稍后重试并检查权限。',
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
            return mbb_error('worker', '转换服务不可用。', 503);
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
            return mbb_error('worker', '转换服务未完成，原内容未写入。', 503);
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
            'MarkBridge：转换运行环境不可用。<a href="' . esc_url($url) . '">查看设置与诊断</a>。',
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
        wp_die('无权修改 MarkBridge 设置。', '', ['response' => 403]);
    }
    check_admin_referer('mbb_runtime_save');
    if (defined('MARKBRIDGE_RUNTIME')) {
        wp_safe_redirect(admin_url('options-general.php?page=markbridge&mbb-runtime=managed'));
        exit();
    }
    $candidate = mbb_runtime_normalize_path(wp_unslash($_POST['runtime_path'] ?? ''));
    $diagnostics = mbb_runtime_diagnostics($candidate, true);
    if ($diagnostics['ok']) {
        $result =
            get_option(MBB_RUNTIME_OPTION, '') === $diagnostics['path'] ||
            update_option(MBB_RUNTIME_OPTION, $diagnostics['path'], false)
                ? 'updated'
                : 'save-failed';
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
        wp_die('无权查看 MarkBridge 设置。', '', ['response' => 403]);
    }
    $configuration = mbb_runtime_configuration();
    $diagnostics = get_transient('mbb_runtime_diagnostics_' . get_current_user_id());
    if (!is_array($diagnostics)) {
        $diagnostics = mbb_runtime_diagnostics(null, true);
    } else {
        delete_transient('mbb_runtime_diagnostics_' . get_current_user_id());
    }
    echo '<div class="wrap"><h1>MarkBridge</h1>';
    if (($_GET['mbb-runtime'] ?? '') === 'updated') {
        echo '<div class="notice notice-success"><p>运行环境已经验证并启用。</p></div>';
    } elseif (($_GET['mbb-runtime'] ?? '') === 'save-failed') {
        echo '<div class="notice notice-error"><p>无法保存数据库配置，请检查数据库状态；未报告切换成功。</p></div>';
    } elseif (($_GET['mbb-runtime'] ?? '') === 'rejected') {
        echo '<div class="notice notice-error"><p>候选运行环境未通过验证，原设置保持不变。</p></div>';
    } elseif (($_GET['mbb-runtime'] ?? '') === 'managed') {
        echo '<div class="notice notice-info"><p>运行环境由服务器常量管理，数据库设置未更改。</p></div>';
    }
    echo '<h2>转换运行环境</h2><p>有效配置来源：' . esc_html($configuration['source']) . '</p>';
    echo '<form action="' . esc_url(admin_url('admin-post.php')) . '" method="post">';
    echo '<input type="hidden" name="action" value="mbb_runtime_save">';
    wp_nonce_field('mbb_runtime_save');
    echo '<label for="mbb-runtime-path">服务器私有目录</label> ';
    echo '<input id="mbb-runtime-path" class="regular-text code" name="runtime_path" value="' .
        esc_attr($configuration['path']) .
        '"' .
        ($configuration['managed'] ? ' disabled' : '') .
        '>';
    if ($configuration['managed']) {
        echo '<p class="description">MARKBRIDGE_RUNTIME 已定义；常量无效时不会回退数据库设置。</p>';
    }
    submit_button(
        '验证并保存',
        'primary',
        'submit',
        true,
        $configuration['managed'] ? ['disabled' => true] : [],
    );
    echo '</form><h2>诊断</h2><table class="widefat striped"><tbody>';
    foreach ($diagnostics['checks'] as $check) {
        echo '<tr><th>' . esc_html($check['label']) . '</th><td>';
        echo $check['ok'] ? '通过' : '失败';
        echo '</td><td>' . esc_html($check['message']) . '</td></tr>';
    }
    echo '</tbody></table>';
    do_action('mbb_settings_page', $configuration, $diagnostics);
    echo '</div>';
}
