<?php
/**
 * Plugin Name: MarkBridge
 * Version: 1.0.6
 * License: GPL-3.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-3.0.html
 * Requires at least: 7.1
 * Requires PHP: 8.2
 * Text Domain: markbridge
 * Description: Markdown and block editing with paired revisions and local math rendering; capability-scoped author publishing.
 */
if (!defined('ABSPATH')) {
    exit();
}
require_once __DIR__ . '/includes/runtime-settings.php';

function mbb_is_lab()
{
    return false;
}
function mbb_asset($file)
{
    static $map;
    if ($map === null) {
        $map = json_decode(file_get_contents(__DIR__ . '/assets.json'), true);
    }
    return $map[$file] ?? $file;
}
add_action('init', function () {
    wp_register_script(
        'mbb-math',
        set_url_scheme(plugins_url(mbb_asset('math.js'), __FILE__), 'https'),
        [],
        substr(hash_file('sha256', __DIR__ . '/math.js'), 0, 12),
        true,
    );
    wp_localize_script('mbb-math', 'MBB_MATH_CONFIG', ['front' => !is_admin()]);
});
add_action('wp_enqueue_scripts', function () {
    if (
        is_singular() &&
        get_post_meta(get_queried_object_id(), '_mbb_origin', true) === 'markdown_import'
    ) {
        wp_enqueue_script('mbb-math');
    }
});
add_action('enqueue_block_editor_assets', function () {
    if (!mbb_managed(absint($_GET['post'] ?? 0))) {
        return;
    }
    $file = __DIR__ . '/kernel.js';
    wp_enqueue_script(
        'mbb-kernel',
        plugins_url(mbb_asset('kernel.js'), __FILE__),
        [
            'wp-blocks',
            'wp-block-editor',
            'wp-element',
            'wp-components',
            'wp-rich-text',
            'wp-hooks',
            'mbb-math',
        ],
        substr(hash_file('sha256', $file), 0, 12),
        true,
    );
});
add_action('init', function () {
    register_block_type('mbb/list', [
        'api_version' => 3,
        'attributes' => [
            'ordered' => ['type' => 'boolean', 'default' => false],
            'start' => ['type' => 'number', 'default' => 1],
        ],
    ]);
    register_block_type('mbb/list-item', ['api_version' => 3]);
    register_block_type('mbb/math', [
        'api_version' => 3,
        'attributes' => ['tex' => ['type' => 'string', 'default' => '']],
    ]);
    register_block_type('mbb/code', [
        'api_version' => 3,
        'attributes' => [
            'code' => ['type' => 'string', 'default' => ''],
            'language' => ['type' => 'string', 'default' => ''],
        ],
    ]);
});
// Keep inline TeX untouched by WordPress typography during source-only previews.
// This does not load MathJax or alter stored block markup.
add_filter('render_block', function ($html) {
    if (get_post_meta(get_the_ID(), '_mbb_origin', true) !== 'markdown_import') {
        return $html;
    }
    return preg_replace(
        '~(<span\b[^>]*\bclass="mbb-math"[^>]*>)([^<]*)(</span>)~',
        '$1<code>$2</code>$3',
        $html,
    );
});
require_once __DIR__ . '/source-sync.php';
require_once __DIR__ . '/publication.php';
require_once __DIR__ . '/editor-bridge.php';

require_once __DIR__ . '/revisions.php';

require_once __DIR__ . '/compatibility.php';

require_once __DIR__ . '/emoji-packs.php';

add_filter('body_class', function ($classes) {
    if (is_singular() && mbb_managed(get_queried_object_id())) {
        $classes[] = 'mbb-reading';
    }
    return $classes;
});
add_filter(
    'the_content',
    function ($html) {
        return is_singular() && mbb_managed(get_the_ID())
            ? '<div class="mbb-document tex2jax_ignore">' . $html . '</div>'
            : $html;
    },
    30,
);
add_action('enqueue_block_assets', function () {
    if (is_admin() || mbb_managed(get_queried_object_id())) {
        wp_enqueue_style(
            'mbb-math',
            plugins_url(mbb_asset('math.css'), __FILE__),
            [],
            substr(hash_file('sha256', __DIR__ . '/math.css'), 0, 12),
        );
    }
});

// During retirement staging the old plugin remains the sole presentation/comment owner.
if (!in_array('wp-editormd/wp-editormd.php', get_option('active_plugins', []), true)) {
    require_once __DIR__ . '/presentation.php';
    require_once __DIR__ . '/comments.php';
}
