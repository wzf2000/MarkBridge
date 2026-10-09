<?php
// Backend and Node directory are one atomic option; legacy settings remain untouched.
const MBB_CONVERTER_OPTION = 'mbb_converter_settings';

function mbb_converter_settings()
{
    $missing = new stdClass();
    $settings = get_option(MBB_CONVERTER_OPTION, $missing);
    if ($settings === $missing) {
        return null;
    }
    if (
        !is_array($settings) ||
        count($settings) !== 2 ||
        array_diff_key($settings, ['backend' => true, 'runtime_path' => true]) ||
        !in_array($settings['backend'] ?? null, ['php', 'node'], true) ||
        !is_string($settings['runtime_path'] ?? null) ||
        str_contains($settings['runtime_path'], "\0")
    ) {
        return false;
    }
    return $settings;
}

function mbb_converter_settings_save()
{
    if (!current_user_can('manage_options')) {
        wp_die('无权修改 MarkBridge 转换方案。', '', ['response' => 403]);
    }
    check_admin_referer('mbb_converter_save');
    $result = 'managed';
    if (!defined('MARKBRIDGE_CONVERTER_BACKEND')) {
        $input = wp_unslash($_POST['converter'] ?? null);
        $result = 'rejected';
        if (
            is_array($input) &&
            count($input) === 2 &&
            !array_diff_key($input, ['backend' => true, 'runtime_path' => true]) &&
            in_array($input['backend'] ?? null, ['php', 'node'], true) &&
            is_string($input['runtime_path'] ?? null)
        ) {
            $configuration = mbb_runtime_configuration();
            $backend = $input['backend'];
            $diagnostics =
                $backend === 'php'
                    ? mbb_php_converter_diagnostics(true)
                    : mbb_runtime_diagnostics(
                        $configuration['managed'] ? $configuration['path'] : $input['runtime_path'],
                        true,
                    );
            if ($diagnostics['ok']) {
                $settings = [
                    'backend' => $backend,
                    'runtime_path' =>
                        $backend === 'php' ? $configuration['path'] : $diagnostics['path'],
                ];
                // Re-read persisted state before reporting success, including unchanged choices.
                if (mbb_converter_settings() !== $settings) {
                    update_option(MBB_CONVERTER_OPTION, $settings, false);
                }
                $result = mbb_converter_settings() === $settings ? 'updated' : 'save-failed';
            } else {
                set_transient(
                    'mbb_converter_diagnostics_' . get_current_user_id(),
                    ['backend' => $backend, 'diagnostics' => $diagnostics],
                    MINUTE_IN_SECONDS * 5,
                );
            }
        }
    }
    wp_safe_redirect(admin_url('options-general.php?page=markbridge&mbb-converter=' . $result));
    exit();
}
add_action('admin_post_mbb_converter_save', 'mbb_converter_settings_save');

function mbb_converter_settings_form()
{
    $backend = mbb_converter_backend();
    $configuration = mbb_runtime_configuration();
    $managed = defined('MARKBRIDGE_CONVERTER_BACKEND');
    $result = is_string($_GET['mbb-converter'] ?? null) ? $_GET['mbb-converter'] : '';
    $notices = [
        'updated' => ['success', '转换方案已经验证并应用。'],
        'rejected' => ['error', '候选转换方案未通过验证，原设置保持不变。'],
        'save-failed' => ['error', '转换方案未能保存，请检查数据库状态；未报告切换成功。'],
        'managed' => ['info', '转换方案由服务器常量管理，数据库设置未更改。'],
    ];
    echo '<h2>转换方案</h2>';
    if (isset($notices[$result])) {
        [$class, $message] = $notices[$result];
        echo '<div class="notice notice-' . $class . '"><p>' . esc_html($message) . '</p></div>';
    }
    if ($backend !== 'php' && $backend !== 'node') {
        echo '<p>当前转换配置无效，转换将明确拒绝；不会自动选择其他引擎。</p>';
    }
    echo '<p>新安装默认 PHP。Node 需先在服务器准备匹配的私有运行环境；验证通过才应用。切换不改写正文，失败不会自动回退。</p>';
    echo '<form action="' . esc_url(admin_url('admin-post.php')) . '" method="post">';
    echo '<input type="hidden" name="action" value="mbb_converter_save">';
    wp_nonce_field('mbb_converter_save');
    echo '<fieldset' . ($managed ? ' disabled' : '') . '>';
    foreach (
        ['php' => 'PHP（内置，无需 Node 目录）', 'node' => 'Node（服务器私有运行环境）']
        as $value => $label
    ) {
        echo '<p><label><input type="radio" name="converter[backend]" value="' .
            $value .
            '"' .
            ($backend === $value ? ' checked' : '') .
            '> ' .
            esc_html($label) .
            '</label></p>';
    }
    echo '<p><label for="mbb-converter-path">Node 私有目录</label> ';
    echo '<input id="mbb-converter-path" class="regular-text code" name="converter[runtime_path]" value="' .
        esc_attr($configuration['path']) .
        '"' .
        ($configuration['managed'] ? ' readonly' : '') .
        '></p>';
    if ($configuration['managed']) {
        echo '<p class="description">MARKBRIDGE_RUNTIME 由服务器管理，只覆盖 Node 目录；无效常量不会回退数据库目录。</p>';
    }
    echo '<p class="description">选择 PHP 会保留当前有效 Node 目录，便于之后切回；不使用本次输入的目录。</p>';
    submit_button('验证并应用转换方案');
    echo '</fieldset></form>';
    if ($managed) {
        echo '<p>MARKBRIDGE_CONVERTER_BACKEND 已定义，转换方案由服务器管理；后台不能覆盖。</p>';
    }
    echo '<p><a href="https://github.com/wzf2000/MarkBridge/wiki/Runtime">Node 环境准备与配置说明</a></p>';
}

function mbb_converter_candidate_diagnostics($backend, $diagnostics)
{
    echo '<h2>未应用的候选方案诊断：' . esc_html($backend) . '</h2>';
    echo '<p>以下结果来自失败候选，不代表当前生效方案。</p><table class="widefat striped"><tbody>';
    foreach ($diagnostics['checks'] as $check) {
        echo '<tr><th>' .
            esc_html($check['label']) .
            '</th><td>' .
            ($check['ok'] ? '通过' : '失败') .
            '</td><td>' .
            esc_html($check['message']) .
            '</td></tr>';
    }
    echo '</tbody></table>';
}
