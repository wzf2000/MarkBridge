<?php
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function mbb_collections_page(): void
{
    if (!current_user_can('edit_posts')) {
        return;
    }
    echo '<div class="wrap mbb-collections"><h1>' .
        esc_html(mbb_t('Collections')) .
        '</h1><p>' .
        esc_html(
            mbb_t(
                'Arrange references to saved articles, then prepare an immutable snapshot. Collection configuration is not a second article body.',
            ),
        ) .
        '</p><p><a href="' .
        esc_url(admin_url('tools.php?page=mbb-editor')) .
        '">' .
        esc_html(mbb_t('Markdown editing bridge')) .
        '</a></p>';
    do_action('markbridge_collections_configuration_sources');
    echo '<div id="mbb-collections" aria-live="polite"></div></div>';
}
add_action('admin_enqueue_scripts', static function ($hook) {
    if (
        $hook !== 'tools_page_mbb-editor' ||
        ($_GET['view'] ?? '') !== 'collections' ||
        !current_user_can('edit_posts')
    ) {
        return;
    }
    wp_enqueue_script(
        'mbb-collections',
        plugins_url(mbb_asset('collections-ui.js'), __FILE__),
        ['mbb-i18n'],
        null,
        true,
    );
    wp_enqueue_style(
        'mbb-collections',
        plugins_url(mbb_asset('collections-ui.css'), __FILE__),
        [],
        null,
    );
    wp_add_inline_script(
        'mbb-collections',
        'window.MBB_COLLECTIONS=' .
            wp_json_encode([
                'url' => rest_url('mbb/v1/collections'),
                'nonce' => wp_create_nonce('wp_rest'),
                'lang' => str_replace('_', '-', get_locale()),
                'collectionSchemas' => markbridge_publication_collection_schemas(),
            ]) .
            ';',
        'before',
    );
});
