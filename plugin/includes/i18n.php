<?php

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

// Standalone model tests and pure conversions keep the English fallback.
function mbb_t(string $message): string
{
    if (!function_exists('__')) {
        return $message;
    }
    $switched = false;
    if (
        function_exists('get_user_locale') &&
        function_exists('switch_to_locale') &&
        ((function_exists('is_admin') && is_admin()) ||
            (defined('REST_REQUEST') && REST_REQUEST) ||
            (defined('WP_CLI') && WP_CLI))
    ) {
        $locale = get_user_locale();
        if (function_exists('get_locale') && $locale !== get_locale()) {
            $switched = switch_to_locale($locale);
        }
    }
    try {
        // phpcs:ignore WordPress.WP.I18n.NonSingularStringLiteralText -- Shared project msgids are extracted and validated by build-localization; diagnostics require this variable boundary.
        $translated = __($message, 'markbridge');
        return mbb_safe_translation($message, $translated) ? $translated : $message;
    } finally {
        if ($switched) {
            restore_previous_locale();
        }
    }
}

function mbb_safe_translation(string $source, $translated): bool
{
    if (
        !is_string($translated) ||
        strlen($translated) > 32768 ||
        preg_match('//u', $translated) !== 1 ||
        preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f]/', $translated)
    ) {
        return false;
    }
    $placeholders = static function ($text) {
        preg_match_all('/%(?:[0-9]+\$)?[a-zA-Z%]|%[0-9]+\$?|%/', $text, $parts);
        sort($parts[0]);
        return $parts[0];
    };
    if ($placeholders($source) !== $placeholders($translated)) {
        return false;
    }
    $shape = static function ($text) {
        $tags = [];
        $length = strlen($text);
        for ($offset = 0; $offset < $length; $offset++) {
            if ($text[$offset] !== '<') {
                continue;
            }
            $start = $offset;
            $quote = null;
            for ($offset++; $offset < $length; $offset++) {
                $character = $text[$offset];
                if ($quote !== null) {
                    if ($character === $quote) {
                        $quote = null;
                    }
                } elseif ($character === "'" || $character === '"') {
                    $quote = $character;
                } elseif ($character === '>') {
                    break;
                } elseif ($character === '<') {
                    return null;
                }
            }
            // Preserve even incomplete tags/attributes at the message boundary byte for byte.
            $tags[] = substr($text, $start, min($offset + 1, $length) - $start);
        }
        preg_match('/^[\'"]?>/', $text, $boundary);
        return [$tags, $boundary[0] ?? ''];
    };
    return $shape($source) !== null && $shape($source) === $shape($translated);
}

function mbb_i18n_scripts(): void
{
    if (!function_exists('wp_scripts')) {
        return;
    }
    $scripts = wp_scripts();
    if (!isset($scripts->registered['mbb-i18n'])) {
        wp_register_script(
            'mbb-i18n',
            plugins_url(mbb_asset('i18n.js'), dirname(__DIR__) . '/markdown-block-bridge.php'),
            ['wp-i18n'],
            substr(hash_file('sha256', __DIR__ . '/../i18n.js'), 0, 12),
            true,
        );
        $locale =
            function_exists('is_admin') && is_admin() && function_exists('get_user_locale')
                ? get_user_locale()
                : (function_exists('get_locale')
                    ? get_locale()
                    : 'en_US');
        wp_add_inline_script(
            'mbb-i18n',
            'window.MBB_UI_LOCALE=' . json_encode($locale === 'zh_CN' ? 'zh_CN' : 'en_US') . ';',
            'before',
        );
    }
    foreach ($scripts->registered as $handle => $script) {
        if (!str_starts_with($handle, 'mbb-')) {
            continue;
        }
        if ($handle !== 'mbb-i18n') {
            $script->deps = array_values(array_unique([...$script->deps, 'mbb-i18n']));
        }
        wp_set_script_translations($handle, 'markbridge', __DIR__ . '/../languages');
    }
}
function mbb_i18n_register(): void
{
    add_action('init', static function () {
        load_plugin_textdomain('markbridge', false, basename(dirname(__DIR__)) . '/languages');
    });
    foreach (
        [
            'wp_enqueue_scripts',
            'admin_enqueue_scripts',
            'enqueue_block_editor_assets',
            'wp_print_scripts',
            'wp_print_footer_scripts',
        ]
        as $hook
    ) {
        add_action($hook, 'mbb_i18n_scripts', str_starts_with($hook, 'wp_print') ? 0 : PHP_INT_MAX);
    }
}
