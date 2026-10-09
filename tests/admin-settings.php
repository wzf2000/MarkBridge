<?php
// Exercise the real settings handlers and presentation callbacks with isolated WP stubs.
define('ABSPATH', __DIR__);
$options = [
    'mbb_runtime_path' => '/synthetic/private/node',
    'markbridge_emoji_active' => 'synthetic-pack',
    'markbridge_emoji_packs' => ['synthetic-pack' => ['name' => 'Synthetic']],
];
$actions = $filters = $scripts = $styles = $inline = [];
$can_manage = true;
$nonce_ok = true;
$database_ok = true;
class MbbSettingsStop extends RuntimeException {}
function add_action($name, $callback, $priority = 10)
{
    $GLOBALS['actions'][$name][] = $callback;
}
function add_filter($name, $callback, $priority = 10)
{
    $GLOBALS['filters'][$name][] = $callback;
}
function remove_filter($name, $callback, $priority = 10) {}
function plugin_basename($file)
{
    return basename(dirname($file)) . '/' . basename($file);
}
function get_option($name, $default = false)
{
    return $GLOBALS['options'][$name] ?? $default;
}
function update_option($name, $value, $autoload = null)
{
    if (!$GLOBALS['database_ok']) {
        return false;
    }
    $GLOBALS['options'][$name] = $value;
    return true;
}
function current_user_can($capability)
{
    return $capability === 'manage_options' && $GLOBALS['can_manage'];
}
function wp_die($message, $title = '', $args = [])
{
    throw new MbbSettingsStop('denied:' . ($args['response'] ?? 0));
}
function check_admin_referer($action)
{
    if ($action !== 'mbb_display_save' || !$GLOBALS['nonce_ok']) {
        throw new MbbSettingsStop('nonce');
    }
}
function wp_unslash($value)
{
    return $value;
}
function admin_url($path)
{
    return '/wp-admin/' . $path;
}
function wp_safe_redirect($url)
{
    throw new MbbSettingsStop($url);
}
function esc_url($value)
{
    return htmlspecialchars($value, ENT_QUOTES);
}
function esc_html($value)
{
    return htmlspecialchars($value, ENT_QUOTES);
}
function esc_attr($value)
{
    return htmlspecialchars($value, ENT_QUOTES);
}
function selected($value, $expected, $echo = true)
{
    return $value === $expected ? 'selected' : '';
}
function wp_nonce_field($action)
{
    echo '<input name="_wpnonce" value="synthetic">';
}
function submit_button($text)
{
    echo '<button>' . esc_html($text) . '</button>';
}
function get_file_data($file, $headers)
{
    return ['version' => 'synthetic-version'];
}
function plugins_url($path, $file)
{
    return '/plugin/' . $path;
}
function wp_enqueue_script($handle, $url, $deps = [], $version = null, $footer = false)
{
    $GLOBALS['scripts'][$handle] = $deps;
}
function wp_enqueue_style($handle, $url, $deps = [], $version = null)
{
    $GLOBALS['styles'][] = $handle;
}
function wp_add_inline_script($handle, $script, $position = 'after') {}
function wp_add_inline_style($handle, $css)
{
    $GLOBALS['inline'][] = $handle;
}
function wp_localize_script($handle, $name, $value) {}
function wp_json_encode($value)
{
    return json_encode($value);
}
function mbb_asset($name)
{
    return $name;
}
function mbb_emoji_config()
{
    return [];
}

require __DIR__ . '/../plugin/includes/admin-settings.php';
require __DIR__ . '/../plugin/presentation.php';
function mbb_settings_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function mbb_settings_submit($values)
{
    $_POST = ['preferences' => $values];
    try {
        mbb_display_settings_save();
    } catch (MbbSettingsStop $stop) {
        return $stop->getMessage();
    }
    throw new RuntimeException('Settings handler did not terminate');
}
$baseline = $options;
mbb_settings_assert(mbb_display_preferences() === mbb_display_defaults(), 'Fresh defaults changed');
$valid = [
    'source_font_size' => '18',
    'math_reader' => '0',
    'code_line_numbers' => '0',
    'code_copy' => '0',
];
$can_manage = false;
mbb_settings_assert(
    mbb_settings_submit($valid) === 'denied:403' && $options === $baseline,
    'Author wrote settings',
);
$can_manage = true;
$nonce_ok = false;
mbb_settings_assert(
    mbb_settings_submit($valid) === 'nonce' && $options === $baseline,
    'Invalid nonce wrote settings',
);
$nonce_ok = true;
foreach (
    [
        null,
        [],
        $valid + ['backend' => 'php'],
        array_replace($valid, ['source_font_size' => '15']),
        array_replace($valid, ['math_reader' => 'yes']),
        array_replace($valid, ['code_copy' => ['1']]),
    ]
    as $invalid
) {
    mbb_settings_assert(
        str_contains(mbb_settings_submit($invalid), 'rejected') && $options === $baseline,
        'Invalid input changed options',
    );
}
mbb_settings_assert(str_contains(mbb_settings_submit($valid), 'updated'), 'Valid settings failed');
mbb_settings_assert(
    mbb_display_preferences() === [
        'source_font_size' => 18,
        'math_reader' => false,
        'code_line_numbers' => false,
        'code_copy' => false,
    ],
    'Values not persisted',
);
mbb_settings_assert(
    array_diff_key($options, [MBB_DISPLAY_OPTION => true]) === $baseline,
    'Legacy options changed',
);
mbb_settings_assert(
    str_contains(mbb_settings_submit($valid), 'updated'),
    'Unchanged settings reported failure',
);
$saved = $options;
$database_ok = false;
mbb_settings_assert(
    str_contains(
        mbb_settings_submit(array_replace($valid, ['source_font_size' => '16'])),
        'save-failed',
    ) && $options === $saved,
    'DB failure reported success',
);
$database_ok = true;
$options[MBB_DISPLAY_OPTION] = [
    'source_font_size' => '18',
    'math_reader' => '0',
    'code_copy' => [],
    'unknown' => true,
];
mbb_settings_assert(
    mbb_display_preferences() === mbb_display_defaults(),
    'Invalid stored types became preferences',
);
$options[MBB_DISPLAY_OPTION] = [
    'source_font_size' => 16,
    'math_reader' => '0',
    'code_copy' => false,
    'unknown' => true,
];
$corrupt_snapshot = $options;
mbb_settings_assert(
    mbb_display_preferences() === [
        'source_font_size' => 16,
        'math_reader' => true,
        'code_line_numbers' => true,
        'code_copy' => false,
    ] && $options === $corrupt_snapshot,
    'Mixed stored corruption did not fall back without writing',
);

foreach (
    [[true, true], [false, false], [true, false], [false, true]]
    as [$line_enabled, $copy_enabled]
) {
    $options[MBB_DISPLAY_OPTION] = [
        'source_font_size' => 14,
        'math_reader' => true,
        'code_line_numbers' => $line_enabled,
        'code_copy' => $copy_enabled,
    ];
    $scripts = $styles = $inline = [];
    foreach ($actions['wp_enqueue_scripts'] as $callback) {
        $callback();
    }
    mbb_settings_assert(
        isset($scripts['prism-plugin-line-numbers']) === $line_enabled,
        'Line number script did not follow setting',
    );
    mbb_settings_assert(
        in_array('prism-plugin-line-numbers', $styles, true) === $line_enabled,
        'Line number CSS did not follow setting',
    );
    mbb_settings_assert(
        in_array('prism-plugin-line-numbers', $inline, true) === $line_enabled,
        'Line number padding survived disabling',
    );
    mbb_settings_assert(
        isset($scripts['prism-plugin-copy-to-clipboard']) === $copy_enabled &&
            isset($scripts['copy-clipboard']) === $copy_enabled,
        'Copy scripts did not follow setting',
    );
    mbb_settings_assert(
        isset(
            $scripts['prism-core-js'],
            $scripts['prism-plugin-toolbar'],
            $scripts['prism-plugin-show-language'],
        ),
        'Core highlighting/language was disabled',
    );
    $classes = ['theme-class'];
    foreach ($filters['body_class'] as $callback) {
        $classes = $callback($classes);
    }
    mbb_settings_assert(
        in_array('line-numbers', $classes, true) === $line_enabled &&
            in_array('theme-class', $classes, true),
        'Body class setting changed theme classes',
    );
}
$can_manage = true;
mbb_settings_assert(
    str_contains(implode('', mbb_plugin_action_links(['existing'])), 'page=markbridge'),
    'Admin settings link missing',
);
$can_manage = false;
$links = implode('', mbb_plugin_action_links(['existing']));
mbb_settings_assert(
    !str_contains($links, 'page=markbridge') &&
        str_contains($links, '/wiki') &&
        str_contains($links, '/issues'),
    'Author links violated scope',
);
ob_start();
mbb_admin_settings_overview('php', ['ok' => true, 'path' => '/synthetic/private/secret']);
mbb_admin_settings_preferences();
$html = ob_get_clean();
mbb_settings_assert(
    str_contains($html, 'synthetic-version') &&
        str_contains($html, 'preferences[source_font_size]') &&
        str_contains($html, 'page=markbridge-emoji') &&
        !str_contains($html, '/synthetic/private'),
    'Overview/preferences rendering mismatch',
);
mbb_settings_assert(
    array_diff_key($options, [MBB_DISPLAY_OPTION => true]) === $baseline,
    'Rendering wrote legacy options',
);
echo "Settings defaults, capability, nonce, strict input, persistence, failure, legacy options, links and real presentation effects passed.\n";
