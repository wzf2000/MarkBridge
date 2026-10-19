<?php
/**
 * Plugin Name: MarkBridge
 * Plugin URI: https://github.com/wzf2000/MarkBridge
 * Author: wzf2000
 * Author URI: https://github.com/wzf2000
 * Version: 3.0.0
 * License: GPL-3.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-3.0.html
 * Requires at least: 7.1
 * Requires PHP: 8.2
 * Domain Path: /languages
 * Text Domain: markbridge
 * Description: Markdown and block editing with paired revisions and local math rendering; capability-scoped author publishing.
 */
if (!defined('ABSPATH')) {
    exit();
}
require_once __DIR__ . '/includes/i18n.php';
mbb_i18n_register();
require_once __DIR__ . '/includes/runtime-settings.php';
require_once __DIR__ . '/includes/admin-settings.php';
require_once __DIR__ . '/block-adapters.php';
require_once __DIR__ . '/native-media.php';
require_once __DIR__ . '/components.php';
require_once __DIR__ . '/teaching.php';
require_once __DIR__ . '/diagnostics.php';

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
    mbb_register_diagnostics();
    wp_register_script(
        'mbb-math-explorer',
        plugins_url(mbb_asset('math-explorer.js'), __FILE__),
        ['mbb-i18n'],
        substr(hash_file('sha256', __DIR__ . '/math-explorer.js'), 0, 12),
        true,
    );
    wp_register_script(
        'mbb-math',
        plugins_url(mbb_asset('math.js'), __FILE__),
        ['mbb-diagnostics', 'mbb-math-explorer'],
        substr(hash_file('sha256', __DIR__ . '/math.js'), 0, 12),
        true,
    );
    wp_add_inline_script(
        'mbb-math',
        'window.MBB_MATH_CONFIG = ' . mbb_math_configuration() . ';',
        'before',
    );
});
add_action('wp_enqueue_scripts', function () {
    if (
        is_singular() &&
        get_post_meta(get_queried_object_id(), '_mbb_origin', true) === 'markdown_import'
    ) {
        mbb_enqueue_diagnostics();
        wp_enqueue_script('mbb-math');
        wp_enqueue_script(
            'mbb-media-presentation',
            plugins_url(mbb_asset('media-presentation.js'), __FILE__),
            ['mbb-i18n'],
            substr(hash_file('sha256', __DIR__ . '/media-presentation.js'), 0, 12),
            true,
        );
    }
});
function mbb_enqueue_kernel(bool $converterOnly = false): void
{
    mbb_enqueue_diagnostics();
    $file = __DIR__ . '/kernel.js';
    wp_enqueue_script(
        'mbb-kernel',
        plugins_url(mbb_asset('kernel.js'), __FILE__),
        [
            'wp-blocks',
            'wp-block-editor',
            'wp-element',
            'wp-components',
            'wp-data',
            'wp-rich-text',
            'wp-hooks',
            'mbb-math',
            ...$converterOnly ? [] : ['mbb-components'],
        ],
        substr(hash_file('sha256', $file), 0, 12),
        true,
    );
    if ($converterOnly) {
        wp_add_inline_script('mbb-kernel', 'window.MBB_CONVERTER_ONLY=true;', 'before');
    }
    mbb_enqueue_block_adapter_snapshot();
}
add_action('enqueue_block_editor_assets', function () {
    $newPost =
        basename($_SERVER['PHP_SELF'] ?? '') === 'post-new.php' && current_user_can('edit_posts');
    if (!mbb_managed(absint($_GET['post'] ?? 0)) && !$newPost) {
        return;
    }
    mbb_enqueue_kernel($newPost);
});
add_filter(
    'allowed_block_types_all',
    function ($allowed, $context) {
        $id = absint($context->post->ID ?? 0);
        if (!$id || !mbb_managed($id) || $allowed === false) {
            return $allowed;
        }
        if ($allowed === true) {
            $allowed = array_keys(WP_Block_Type_Registry::get_instance()->get_all_registered());
        }
        return array_values(array_diff($allowed, ['core/math']));
    },
    20,
    2,
);
add_action('init', function () {
    // Editor-only instance factory: PHP registration keeps the managed inserter allowlist exact.
    // The converter deliberately rejects this block until the editor has expanded it.
    register_block_type('mbb/writing-pattern', [
        'api_version' => 3,
        'attributes' => ['pattern' => ['type' => 'string']],
        'supports' => ['inserter' => false, 'html' => false, 'reusable' => false],
    ]);
    register_block_type('mbb/list', [
        'api_version' => 3,
        'attributes' => [
            'ordered' => ['type' => 'boolean', 'default' => false],
            'start' => ['type' => 'number', 'default' => 1],
        ],
    ]);
    register_block_type('mbb/list-item', ['api_version' => 3]);
    register_block_type('mbb/task-item', [
        'api_version' => 3,
        'attributes' => [
            'content' => ['type' => 'string', 'default' => ''],
            'checked' => ['type' => 'boolean', 'default' => false],
        ],
    ]);
    register_block_type('mbb/footnotes', ['api_version' => 3]);
    register_block_type('mbb/footnote', [
        'api_version' => 3,
        'attributes' => ['label' => ['type' => 'string', 'default' => '']],
    ]);
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
require_once __DIR__ . '/footnotes.php';
require_once __DIR__ . '/technical.php';
require_once __DIR__ . '/references.php';
require_once __DIR__ . '/collections.php';
require_once __DIR__ . '/extensions.php';
require_once __DIR__ . '/bibtex.php';
require_once __DIR__ . '/csl.php';
require_once __DIR__ . '/batch-import.php';

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
            ? '<div class="mbb-document tex2jax_ignore" data-mbb-content-view>' . $html . '</div>'
            : $html;
    },
    30,
);
add_action('enqueue_block_assets', function () {
    if (is_admin() || mbb_managed(get_queried_object_id())) {
        wp_enqueue_style(
            'mbb-media-presentation',
            plugins_url(mbb_asset('media-presentation.css'), __FILE__),
            [],
            substr(hash_file('sha256', __DIR__ . '/media-presentation.css'), 0, 12),
        );
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

add_action('init', static function () {
    if (!function_exists('register_block_pattern')) {
        return;
    }
    register_block_pattern_category('markbridge-writing', ['label' => mbb_t('Technical writing')]);
    foreach (json_decode(file_get_contents(__DIR__ . '/writing-patterns.json'), true) as $pattern) {
        register_block_pattern('markbridge/' . $pattern['id'], [
            'title' => mbb_t($pattern['title']),
            'categories' => ['markbridge-writing'],
            'content' => $pattern['content'],
            'inserter' => true,
        ]);
    }
});

require_once __DIR__ . '/writing-patterns.php';
