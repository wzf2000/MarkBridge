<?php
if (!defined('ABSPATH')) {
    exit();
}
// Independent, pinned presentation assets. This module does not load the former editor.
add_action(
    'wp_enqueue_scripts',
    function () {
        $base = plugins_url('vendor/', __FILE__);
        wp_enqueue_style(
            'prism-theme-style',
            $base . 'prism/themes/prism-solarizedlight.css',
            [],
            '1.15.0',
        );
        wp_enqueue_script(
            'prism-core-js',
            $base . 'prism/components/prism-core.min.js',
            [],
            '1.15.0',
            true,
        );
        wp_add_inline_script(
            'prism-core-js',
            'Prism.languages.text=Prism.languages.plaintext=Prism.languages.plain={};Prism.languages.sh=Prism.languages.shell={};',
            'after',
        );
        foreach (
            ['toolbar', 'line-numbers', 'show-language', 'copy-to-clipboard', 'autoloader']
            as $part
        ) {
            $deps = ['prism-core-js'];
            if (in_array($part, ['show-language', 'copy-to-clipboard'])) {
                $deps[] = 'prism-plugin-toolbar';
            }
            if ($part === 'copy-to-clipboard') {
                $deps[] = 'copy-clipboard';
            }
            wp_enqueue_script(
                'prism-plugin-' . $part,
                $base . 'prism/plugins/' . $part . '/prism-' . $part . '.min.js',
                $deps,
                '1.15.0',
                true,
            );
            if (in_array($part, ['toolbar', 'line-numbers'])) {
                wp_enqueue_style(
                    'prism-plugin-' . $part,
                    $base . 'prism/plugins/' . $part . '/prism-' . $part . '.css',
                    [],
                    '1.15.0',
                );
            }
        }
        wp_enqueue_script(
            'copy-clipboard',
            $base . 'clipboard/clipboard.min.js',
            [],
            '2.0.1',
            true,
        );
        wp_add_inline_script(
            'prism-plugin-autoloader',
            'Prism.plugins.autoloader.languages_path=' .
                wp_json_encode($base . 'prism/components/') .
                ';',
            'after',
        );
        wp_enqueue_script(
            'markbridge-emoji',
            plugins_url(mbb_asset('emoji.js'), __FILE__),
            [],
            '1.0.1',
            true,
        );
        wp_localize_script('markbridge-emoji', 'MBB_EMOJI_IMAGES', mbb_emoji_config());
    },
    9,
);
add_filter('body_class', static function ($classes) {
    $classes[] = 'line-numbers';
    return $classes;
});
// Render task markers without altering literal code, scripts or stored text.
function mbb_task_markers($html)
{
    return preg_replace_callback(
        '~(<(?:pre|code|script|style|textarea)\\b[^>]*>.*?</(?:pre|code|script|style|textarea)\\s*>)|(<(?:p|li)\\b[^>]*>\\s*)\\[([ xX])\\]\\s+~is',
        static function ($m) {
            if (!empty($m[1])) {
                return $m[1];
            }
            return $m[2] .
                '<input type="checkbox" class="task-list-item-checkbox" disabled' .
                (strtolower($m[3]) === 'x' ? ' checked' : '') .
                ' /> ';
        },
        $html,
    );
}
add_filter('the_content', 'mbb_task_markers', 10);
// Comment KSES strips list wrappers; run after WordPress restores paragraphs.
add_filter('comment_text', 'mbb_task_markers', 40);

// Preserve named shortcodes until the selected front-end renderer runs.
// Keep WordPress handling of ASCII faces and its existing HTML/code exclusions.
function mbb_convert_smilies($text)
{
    global $wpsmiliestrans;
    if (!is_array($wpsmiliestrans)) {
        return convert_smilies($text);
    }
    $original = $wpsmiliestrans;
    try {
        foreach ($wpsmiliestrans as $code => $replacement) {
            if (preg_match('/\A:[a-zA-Z0-9_+\-]+:\z/D', $code)) {
                $wpsmiliestrans[$code] = $code;
            }
        }
        return convert_smilies($text);
    } finally {
        $wpsmiliestrans = $original;
    }
}
foreach (['the_content', 'comment_text'] as $hook) {
    remove_filter($hook, 'convert_smilies', 20);
    add_filter($hook, 'mbb_convert_smilies', 20);
}
