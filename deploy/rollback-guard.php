<?php
/** Keep new Markdown drafts read-only if the editor bridge is rolled back. */
if (!defined('ABSPATH')) {
    exit();
}
add_filter(
    'wp_insert_post_empty_content',
    function ($empty, $data) {
        if (!empty($GLOBALS['mbb_paired_save'])) {
            return $empty;
        }
        $id = absint($data['ID'] ?? 0);
        $parent = absint($data['post_parent'] ?? 0);
        if (
            ($id && get_post_meta($id, '_mbb_origin', true) === 'markdown_import') ||
            (($data['post_type'] ?? '') === 'revision' &&
                $parent &&
                get_post_meta($parent, '_mbb_origin', true) === 'markdown_import')
        ) {
            return true;
        }
        return $empty;
    },
    1,
    2,
);
add_action('admin_notices', function () {
    if (function_exists('mbb_permission')) {
        return;
    }
    $id = absint($_GET['post'] ?? 0);
    if ($id && get_post_meta($id, '_mbb_origin', true) === 'markdown_import') {
        echo '<div class="notice notice-warning"><p>此文档的双格式编辑插件暂不可用，已保护为只读。请恢复插件后再编辑。</p></div>';
    }
});
