<?php
// Keep legacy callbacks in their original position; bypass only our paired write scope.
add_action('wp_loaded', function () {
    global $wp_filter;
    foreach (
        ['wp_insert_post_data', 'content_save_pre', 'wp_insert_post', 'wp_restore_post_revision']
        as $tag
    ) {
        if (empty($wp_filter[$tag])) {
            continue;
        }
        foreach ($wp_filter[$tag]->callbacks as $priority => $callbacks) {
            foreach ($callbacks as $key => $entry) {
                $fn = $entry['function'];
                if (
                    !is_array($fn) ||
                    !is_object($fn[0]) ||
                    !str_ends_with(get_class($fn[0]), 'WPComMarkdown')
                ) {
                    continue;
                }
                $wp_filter[$tag]->callbacks[$priority][$key]['function'] = function (...$args) use (
                    $fn,
                ) {
                    return !empty($GLOBALS['mbb_paired_save']) || mbb_native_save_context()
                        ? $args[0] ?? null
                        : call_user_func_array($fn, $args);
                };
            }
        }
    }
});
add_filter(
    'use_block_editor_for_post',
    function ($use, $post) {
        return mbb_managed($post->ID) || mbb_native_document($post->ID) ? true : $use;
    },
    100,
    2,
);
add_action(
    'enqueue_block_editor_assets',
    function () {
        if (mbb_managed(absint($_GET['post'] ?? 0))) {
            wp_dequeue_script('MathJax');
            wp_dequeue_script('mathjax-display');
        }
    },
    100,
);

// Gutenberg may execute classic meta-box hooks after its asset enqueue phase.
// Remove only Editor.md UI callbacks for documents using the paired editor.
add_action('current_screen', function ($screen) {
    if (
        $screen->base !== 'post' ||
        !(
            mbb_managed(absint($_GET['post'] ?? 0)) ||
            mbb_native_document(absint($_GET['post'] ?? 0))
        )
    ) {
        return;
    }
    global $wp_filter;
    foreach (['edit_page_form', 'edit_form_advanced'] as $tag) {
        foreach ($wp_filter[$tag]->callbacks ?? [] as $priority => $callbacks) {
            foreach ($callbacks as $entry) {
                $fn = $entry['function'];
                if (
                    is_array($fn) &&
                    is_object($fn[0]) &&
                    get_class($fn[0]) === 'EditormdAdmin\\Controller' &&
                    in_array($fn[1], ['enqueue_styles', 'enqueue_scripts'], true)
                ) {
                    remove_action($tag, $fn, $priority);
                }
            }
        }
    }
});

// Gutenberg collects frontend footer hooks into its canvas without legacy assets.
add_action(
    'current_screen',
    function ($screen) {
        if (
            $screen->base !== 'post' ||
            !(
                mbb_managed(absint($_GET['post'] ?? 0)) ||
                mbb_native_document(absint($_GET['post'] ?? 0))
            )
        ) {
            return;
        }
        global $wp_filter;
        foreach (
            $wp_filter['wp_print_footer_scripts']->callbacks ?? []
            as $priority => $callbacks
        ) {
            foreach ($callbacks as $entry) {
                $fn = $entry['function'];
                if (
                    is_array($fn) &&
                    is_object($fn[0]) &&
                    str_starts_with(get_class($fn[0]), 'EditormdApp' . chr(92))
                ) {
                    remove_action('wp_print_footer_scripts', $fn, $priority);
                }
            }
        }
    },
    100,
);

// Explicit native documents keep core REST saving; no Markdown conversion or dual-format toolbar.
function mbb_native_document($id)
{
    return $id && get_post_meta($id, '_mbb_native_editor', true) === '1';
}
function mbb_native_save_context()
{
    return !empty($GLOBALS['mbb_native_rest']) ||
        mbb_native_document(absint($_POST['post_ID'] ?? 0)) ||
        (isset($_GET['revision']) &&
            mbb_native_document((int) wp_get_post_parent_id(absint($_GET['revision']))));
}
add_filter(
    'rest_pre_dispatch',
    function ($result, $server, $request) {
        $GLOBALS['mbb_native_rest'] = false;
        if (
            preg_match(
                '~^/wp/v2/(?:posts|pages)/(\d+)(?:/autosaves(?:/\d+)?|/revisions(?:/\d+)?)?/?$~',
                $request->get_route(),
                $m,
            )
        ) {
            $GLOBALS['mbb_native_rest'] = mbb_native_document((int) $m[1]);
        }
        return $result;
    },
    1,
    3,
);
add_filter(
    'rest_post_dispatch',
    function ($result) {
        $GLOBALS['mbb_native_rest'] = false;
        return $result;
    },
    999,
);
