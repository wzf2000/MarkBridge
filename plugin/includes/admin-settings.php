<?php
// Display preferences never participate in conversion or paired saving.
const MBB_DISPLAY_OPTION = 'markbridge_display_preferences';

function mbb_display_defaults()
{
    return [
        'source_font_size' => 14,
        'math_reader' => true,
        'code_line_numbers' => true,
        'code_copy' => true,
    ];
}

function mbb_display_preferences()
{
    $preferences = mbb_display_defaults();
    $stored = get_option(MBB_DISPLAY_OPTION, []);
    if (!is_array($stored)) {
        return $preferences;
    }
    foreach ($preferences as $key => $default) {
        $value = $stored[$key] ?? null;
        if ($key === 'source_font_size' ? in_array($value, [14, 16, 18], true) : is_bool($value)) {
            $preferences[$key] = $value;
        }
    }
    return $preferences;
}

function mbb_display_parse_submission($input)
{
    $defaults = mbb_display_defaults();
    if (
        !is_array($input) ||
        count($input) !== count($defaults) ||
        array_diff_key($input, $defaults)
    ) {
        return false;
    }
    $parsed = [];
    foreach ($defaults as $key => $default) {
        $value = $input[$key] ?? null;
        $allowed = $key === 'source_font_size' ? ['14', '16', '18'] : ['0', '1'];
        if (!in_array($value, $allowed, true)) {
            return false;
        }
        $parsed[$key] = $key === 'source_font_size' ? (int) $value : $value === '1';
    }
    return $parsed;
}

function mbb_display_settings_save()
{
    if (!current_user_can('manage_options')) {
        wp_die('无权修改 MarkBridge 设置。', '', ['response' => 403]);
    }
    check_admin_referer('mbb_display_save');
    $preferences = mbb_display_parse_submission(wp_unslash($_POST['preferences'] ?? null));
    $result = 'rejected';
    if ($preferences !== false) {
        $result =
            get_option(MBB_DISPLAY_OPTION, null) === $preferences ||
            update_option(MBB_DISPLAY_OPTION, $preferences, false)
                ? 'updated'
                : 'save-failed';
    }
    wp_safe_redirect(admin_url('options-general.php?page=markbridge&mbb-display=' . $result));
    exit();
}
add_action('admin_post_mbb_display_save', 'mbb_display_settings_save');

function mbb_plugin_action_links($links)
{
    if (current_user_can('manage_options')) {
        array_unshift(
            $links,
            '<a href="' . esc_url(admin_url('options-general.php?page=markbridge')) . '">设置</a>',
        );
    }
    $links[] = '<a href="https://github.com/wzf2000/MarkBridge/wiki">使用文档</a>';
    $links[] = '<a href="https://github.com/wzf2000/MarkBridge/issues">反馈问题</a>';
    return $links;
}
add_filter(
    'plugin_action_links_' . plugin_basename(dirname(__DIR__) . '/markdown-block-bridge.php'),
    'mbb_plugin_action_links',
);

function mbb_admin_settings_overview($backend, $diagnostics)
{
    $headers = get_file_data(dirname(__DIR__) . '/markdown-block-bridge.php', [
        'version' => 'Version',
    ]);
    echo '<h2>概览与开始使用</h2><p>版本：' .
        esc_html($headers['version']) .
        ' · 转换后端：' .
        esc_html(is_string($backend) ? $backend : 'invalid') .
        ' · ' .
        ($diagnostics['ok'] ? '转换环境就绪' : '转换环境需要检查，请查看下方诊断') .
        '</p>';
    echo '<p>基础安装使用内置 PHP，无需填写服务器路径。已有 Node 配置升级后继续沿用；更换后端由服务器管理员显式配置。</p>';
    echo '<p>';
    if (current_user_can('edit_posts')) {
        echo '<a class="button button-primary" href="' .
            esc_url(admin_url('post-new.php')) .
            '">新建文章</a> ';
        echo '<a class="button" href="' .
            esc_url(admin_url('tools.php?page=mbb-editor')) .
            '">上传 Markdown</a> ';
    }
    echo '<a href="https://github.com/wzf2000/MarkBridge/wiki/Getting-Started">快速开始</a> · ';
    echo '<a href="https://github.com/wzf2000/MarkBridge/wiki">使用文档</a> · ';
    echo '<a href="https://github.com/wzf2000/MarkBridge/issues">反馈问题</a></p>';
}

function mbb_admin_settings_preferences()
{
    $preferences = mbb_display_preferences();
    $result = $_GET['mbb-display'] ?? '';
    if ($result === 'updated') {
        echo '<div class="notice notice-success"><p>显示设置已保存。</p></div>';
    } elseif ($result === 'rejected') {
        echo '<div class="notice notice-error"><p>显示设置含无效值，原设置保持不变。</p></div>';
    } elseif ($result === 'save-failed') {
        echo '<div class="notice notice-error"><p>显示设置未能保存，请检查数据库状态。</p></div>';
    }
    echo '<form action="' . esc_url(admin_url('admin-post.php')) . '" method="post">';
    echo '<input type="hidden" name="action" value="mbb_display_save">';
    wp_nonce_field('mbb_display_save');
    echo '<h2>编辑体验</h2><p><label for="mbb-source-font-size">Markdown 源码字号</label> ';
    echo '<select id="mbb-source-font-size" name="preferences[source_font_size]">';
    foreach ([14, 16, 18] as $size) {
        echo '<option value="' .
            $size .
            '" ' .
            selected($preferences['source_font_size'], $size, false) .
            '>' .
            $size .
            ' px</option>';
    }
    echo '</select></p><p class="description">仅调整 Markdown 编辑窗口，不改变正文或前台字体。已打开的编辑窗口需刷新。</p>';
    echo '<h2>公式与代码显示</h2><table class="form-table"><tbody>';
    foreach (
        [
            'math_reader' => [
                '公式阅读工具',
                '点击公式可放大、复制 TeX。关闭仅取消前台阅读交互，公式排版与编辑预览继续工作。',
            ],
            'code_line_numbers' => ['代码行号', '在前台代码块旁显示行号。'],
            'code_copy' => [
                '代码复制按钮',
                '在前台代码工具栏中显示复制按钮；代码高亮与语言标签继续工作。',
            ],
        ]
        as $key => [$label, $description]
    ) {
        echo '<tr><th><label for="mbb-' .
            esc_attr($key) .
            '">' .
            esc_html($label) .
            '</label></th><td>';
        echo '<select id="mbb-' . esc_attr($key) . '" name="preferences[' . esc_attr($key) . ']">';
        foreach (['1' => '开启', '0' => '关闭'] as $value => $text) {
            echo '<option value="' .
                $value .
                '" ' .
                selected((int) $preferences[$key], (int) $value, false) .
                '>' .
                $text .
                '</option>';
        }
        echo '</select><p class="description">' . esc_html($description) . '</p></td></tr>';
    }
    echo '</tbody></table>';
    submit_button('保存显示设置');
    echo '</form><h2>可选图片资源</h2><p>默认使用 Unicode 表情。图片包由管理员导入，基础安装不需要下载资源。</p>';
    echo '<p><a class="button" href="' .
        esc_url(admin_url('options-general.php?page=markbridge-emoji')) .
        '">管理图片表情包</a> ';
    echo '<a href="https://github.com/wzf2000/MarkBridge/wiki/Emoji-Packs">图片包说明</a></p>';
}
