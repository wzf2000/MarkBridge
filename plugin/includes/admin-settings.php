<?php
require_once __DIR__ . '/i18n.php';
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

function mbb_math_configuration()
{
    // Generic script configuration must retain booleans, unlike localized strings.
    return wp_json_encode([
        'front' => !is_admin(),
        'reader' => mbb_display_preferences()['math_reader'],
    ]);
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
        wp_die(mbb_t('You cannot change MarkBridge settings.'), '', ['response' => 403]);
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
            '<a href="' .
                esc_url(admin_url('options-general.php?page=markbridge')) .
                mbb_t('">Settings</a>'),
        );
    }
    $links[] = mbb_t('<a href="https://github.com/wzf2000/MarkBridge/wiki">Documentation</a>');
    $links[] = mbb_t('<a href="https://github.com/wzf2000/MarkBridge/issues">Report an issue</a>');
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
    echo mbb_t('<h2>Overview and getting started</h2><p>Version: ') .
        esc_html($headers['version']) .
        mbb_t(' · Conversion backend: ') .
        esc_html(is_string($backend) ? $backend : 'invalid') .
        ' · ' .
        ($diagnostics['ok']
            ? mbb_t('The conversion runtime is ready')
            : mbb_t('The conversion runtime needs attention. See the diagnostics below')) .
        '</p>';
    echo mbb_t(
        '<p>A basic installation uses bundled PHP and needs no server directory configuration. Existing Node configuration is preserved during upgrades. Administrators can verify and select a backend below.</p>',
    );
    echo '<p>';
    if (current_user_can('edit_posts')) {
        echo '<a class="button button-primary" href="' .
            esc_url(admin_url('post-new.php')) .
            mbb_t('">New article</a> ');
        echo '<a class="button" href="' .
            esc_url(admin_url('tools.php?page=mbb-editor')) .
            mbb_t('">Upload Markdown</a> ');
    }
    echo mbb_t(
        '<a href="https://github.com/wzf2000/MarkBridge/wiki/Getting-Started">Quick start</a> · ',
    );
    echo mbb_t('<a href="https://github.com/wzf2000/MarkBridge/wiki">Documentation</a> · ');
    echo mbb_t('<a href="https://github.com/wzf2000/MarkBridge/issues">Report an issue</a></p>');
}

function mbb_admin_settings_preferences()
{
    $preferences = mbb_display_preferences();
    $result = $_GET['mbb-display'] ?? '';
    if ($result === 'updated') {
        echo mbb_t('<div class="notice notice-success"><p>Display settings saved.</p></div>');
    } elseif ($result === 'rejected') {
        echo mbb_t(
            '<div class="notice notice-error"><p>Display settings contain invalid values. Original settings are unchanged.</p></div>',
        );
    } elseif ($result === 'save-failed') {
        echo mbb_t(
            '<div class="notice notice-error"><p>Display settings could not be saved. Check the database state.</p></div>',
        );
    }
    echo '<form action="' . esc_url(admin_url('admin-post.php')) . '" method="post">';
    echo '<input type="hidden" name="action" value="mbb_display_save">';
    wp_nonce_field('mbb_display_save');
    echo mbb_t(
        '<h2>Editing experience</h2><p><label for="mbb-source-font-size">Markdown source font size</label> ',
    );
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
    echo mbb_t(
        '</select></p><p class="description">Only adjusts the Markdown editing window, not body or frontend fonts. Refresh an already open editing window.</p>',
    );
    echo mbb_t('<h2>Formula and code display</h2><table class="form-table"><tbody>');
    foreach (
        [
            'math_reader' => [
                mbb_t('Formula reading tools'),
                mbb_t(
                    'Click a formula to enlarge it or copy TeX. Disabling this only removes frontend interactions; formula layout and editor previews remain available.',
                ),
            ],
            'code_line_numbers' => [
                mbb_t('Code line numbers'),
                mbb_t('Show line numbers beside frontend code blocks.'),
            ],
            'code_copy' => [
                mbb_t('Code copy button'),
                mbb_t(
                    'Show copy buttons in frontend code toolbars. Highlighting and language labels remain available.',
                ),
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
        foreach (['1' => mbb_t('Enabled'), '0' => mbb_t('Close')] as $value => $text) {
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
    submit_button(mbb_t('Save display settings'));
    echo mbb_t(
        '</form><h2>Optional image resources</h2><p>Unicode emoji are used by default. Administrators may import image packs; basic installation requires no resource downloads.</p>',
    );
    echo '<p><a class="button" href="' .
        esc_url(admin_url('options-general.php?page=markbridge-emoji')) .
        mbb_t('">Manage image emoji packs</a> ');
    echo mbb_t(
        '<a href="https://github.com/wzf2000/MarkBridge/wiki/Emoji-Packs">Image pack guide</a></p>',
    );
}
