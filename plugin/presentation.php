<?php
if (!defined('ABSPATH')) {
    exit();
}
// Independent, pinned presentation assets. This module does not load the former editor.
function mbb_code_line_number_css()
{
    return '.mbb-reading .mbb-document pre.wp-block-mbb-code.line-numbers{padding-left:5em!important}' .
        'pre.wp-block-mbb-code.line-numbers>code{display:block;font-size:inherit;line-height:inherit}';
}
function mbb_enqueue_code_assets()
{
    if (wp_script_is('prism-core-js', 'enqueued')) {
        return;
    }
    $preferences = mbb_display_preferences();
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
        'window.Prism=window.Prism||{};Prism.manual=true;',
        'before',
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
        if (
            ($part === 'line-numbers' && !$preferences['code_line_numbers']) ||
            ($part === 'copy-to-clipboard' && !$preferences['code_copy'])
        ) {
            continue;
        }
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
    if ($preferences['code_line_numbers']) {
        wp_add_inline_style('prism-plugin-line-numbers', mbb_code_line_number_css());
    }
    if ($preferences['code_copy']) {
        wp_enqueue_script(
            'copy-clipboard',
            $base . 'clipboard/clipboard.min.js',
            [],
            '2.0.1',
            true,
        );
    }
    wp_add_inline_script(
        'prism-plugin-autoloader',
        'Prism.plugins.autoloader.languages_path=' .
            wp_json_encode($base . 'prism/components/') .
            ';',
        'after',
    );
}

function mbb_enqueue_emoji_assets()
{
    if (wp_script_is('markbridge-emoji', 'enqueued')) {
        return;
    }
    wp_enqueue_script(
        'markbridge-emoji',
        plugins_url(mbb_asset('emoji.js'), __FILE__),
        [],
        '1.0.1',
        true,
    );
    wp_localize_script('markbridge-emoji', 'MBB_EMOJI_IMAGES', mbb_emoji_config());
}

function mbb_enqueue_footnote_assets()
{
    wp_enqueue_style(
        'mbb-footnotes',
        plugins_url(mbb_asset('footnotes.css'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/footnotes.css'), 0, 12),
    );
}

function mbb_code_languages()
{
    static $languages = null;
    if ($languages !== null) {
        return $languages;
    }
    $languages = ['text', 'plain', 'plaintext', 'none'];
    $components = json_decode(file_get_contents(__DIR__ . '/vendor/prism/components.json'), true);
    foreach ($components['languages'] ?? [] as $id => $entry) {
        if (
            !preg_match('/^[a-z0-9_-]{1,64}$/D', $id) ||
            !is_file(__DIR__ . '/vendor/prism/components/prism-' . $id . '.min.js')
        ) {
            continue;
        }
        $languages[] = $id;
        foreach ((array) ($entry['alias'] ?? []) as $alias) {
            if (is_string($alias) && preg_match('/^[a-z0-9_+-]{1,64}$/D', $alias)) {
                $languages[] = $alias;
            }
        }
    }
    return array_values(array_unique($languages));
}
function mbb_detect_presentation($html)
{
    if (is_admin() || !is_string($html)) {
        return $html;
    }
    // Inspect real markup; formulas are pre/code too, but do not need Prism.
    $without_math = preg_replace(
        '~<pre\b[^>]*class=["\'][^"\']*\bwp-block-mbb-math\b[^"\']*["\'][^>]*>[\s\S]*?</pre\s*>~i',
        '',
        $html,
    );
    if (preg_match('~<pre\b[^>]*>\s*<code\b~i', $without_math)) {
        mbb_enqueue_code_assets();
    }
    if (
        preg_match(
            '~<(?:span|sup|section)\b[^>]*class=["\'][^"\']*\b(?:mbb-footnote-ref|mbb-footnotes)\b~i',
            $html,
        )
    ) {
        mbb_enqueue_footnote_assets();
    }
    $text = preg_replace('~<(pre|code|script|style|textarea)\b[^>]*>[\s\S]*?</\1\s*>~i', '', $html);
    if (preg_match('/:[a-zA-Z0-9_+\-]+:/', strip_tags($text))) {
        mbb_enqueue_emoji_assets();
    }
    return $html;
}
add_filter('render_block', 'mbb_detect_presentation', 99);
add_filter('the_content', 'mbb_detect_presentation', 99);
add_filter('comment_text', 'mbb_detect_presentation', 99);

add_action(
    'wp_enqueue_scripts',
    function () {
        $preferences = mbb_display_preferences();
        $base = plugins_url('vendor/', __FILE__);
        $scripts = [
            $base . 'prism/components/prism-core.min.js',
            $base . 'prism/plugins/toolbar/prism-toolbar.min.js',
        ];
        $styles = [
            $base . 'prism/themes/prism-solarizedlight.css',
            $base . 'prism/plugins/toolbar/prism-toolbar.css',
            plugins_url(mbb_asset('code-display.css'), __FILE__),
        ];
        if ($preferences['code_line_numbers']) {
            $scripts[] = $base . 'prism/plugins/line-numbers/prism-line-numbers.min.js';
            $styles[] = $base . 'prism/plugins/line-numbers/prism-line-numbers.css';
        }
        $scripts[] = $base . 'prism/plugins/show-language/prism-show-language.min.js';
        if ($preferences['code_copy']) {
            $scripts[] = $base . 'clipboard/clipboard.min.js';
            $scripts[] = $base . 'prism/plugins/copy-to-clipboard/prism-copy-to-clipboard.min.js';
        }
        $scripts[] = $base . 'prism/plugins/autoloader/prism-autoloader.min.js';
        wp_enqueue_script(
            'mbb-presentation-loader',
            plugins_url(mbb_asset('presentation-loader.js'), __FILE__),
            [],
            substr(hash_file('sha256', __DIR__ . '/presentation-loader.js'), 0, 12),
            true,
        );
        wp_add_inline_script(
            'mbb-presentation-loader',
            'window.MBBComponents=' .
                mbb_component_json(
                    mbb_component_available(),
                    JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT,
                ) .
                ';',
            'before',
        );
        wp_add_inline_script(
            'mbb-presentation-loader',
            'window.MBB_PRESENTATION=' .
                wp_json_encode([
                    'codeScripts' => $scripts,
                    'codeStyles' => $styles,
                    'languages' => $base . 'prism/components/',
                    'codeLanguages' => mbb_code_languages(),
                    'lineNumbers' => $preferences['code_line_numbers'],
                    'lineNumberStyle' => $preferences['code_line_numbers']
                        ? mbb_code_line_number_css()
                        : '',
                    'emoji' => plugins_url(mbb_asset('emoji.js'), __FILE__),
                    'images' => mbb_emoji_config(),
                    'footnotes' => plugins_url(mbb_asset('footnotes.css'), __FILE__),
                    'componentScript' => plugins_url(mbb_asset('components.js'), __FILE__),
                    'teachingScript' => plugins_url(mbb_asset('teaching.js'), __FILE__),
                    'teachingStyle' => plugins_url(mbb_asset('teaching.css'), __FILE__),
                ]) .
                ';',
            'before',
        );
        // Archive and query-loop posts are all considered, not only the singular ID.
        global $wp_query;
        foreach ($wp_query->posts ?? [] as $post) {
            if (is_object($post)) {
                mbb_detect_presentation($post->post_content ?? '');
            }
        }
    },
    9,
);
// Content or comments may first render after wp_head. Print late styles before
// the footer scripts; later browser insertions use the small marker observer.
add_action(
    'wp_footer',
    function () {
        wp_print_styles([
            'prism-theme-style',
            'prism-plugin-toolbar',
            'prism-plugin-line-numbers',
            'mbb-footnotes',
            'mbb-teaching',
        ]);
    },
    5,
);
add_filter('body_class', static function ($classes) {
    if (mbb_display_preferences()['code_line_numbers']) {
        $classes[] = 'line-numbers';
    }
    return $classes;
});
// Managed task blocks carry their own state. Render only their retained marker.
function mbb_content_task_markers($html)
{
    return preg_replace_callback(
        '~(<li\b(?=[^>]*\bwp-block-mbb-task-item\b)[^>]*>\s*(?:<p\b[^>]*>\s*)?)\[([ xX])\](?=\s|<|$)\s*~i',
        static function ($m) {
            return $m[1] .
                '<input type="checkbox" class="task-list-item-checkbox" disabled' .
                (strtolower($m[2]) === 'x' ? ' checked' : '') .
                ' /> ';
        },
        $html,
    );
}
add_filter('the_content', 'mbb_content_task_markers', 10);
add_filter('render_block_mbb/task-item', 'mbb_content_task_markers', 10);

// Comments retain the existing plain-text marker behavior, outside literal code.
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
