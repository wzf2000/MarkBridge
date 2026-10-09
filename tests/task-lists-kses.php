<?php
// Read-only core-library check: no WordPress bootstrap, database, login or article writes.
$root = rtrim($argv[1] ?? '', '/');
if (!$root || !is_file($root . '/wp-includes/kses.php')) {
    throw new RuntimeException('Pass a WordPress source tree.');
}
define('ABSPATH', $root . '/');
define('WPINC', 'wp-includes');
spl_autoload_register(static function ($class) use ($root) {
    if (!preg_match('/^WP_[A-Za-z_]+$/', $class)) {
        return;
    }
    $name = 'class-' . strtolower(str_replace('_', '-', $class)) . '.php';
    foreach (['wp-includes/', 'wp-includes/html-api/'] as $dir) {
        if (is_file($root . '/' . $dir . $name)) {
            require_once $root . '/' . $dir . $name;
            return;
        }
    }
});
require $root . '/wp-includes/plugin.php';
require $root . '/wp-includes/formatting.php';
// Fixtures contain no URLs; the protocol list is deliberately restricted in this harness.
function wp_allowed_protocols()
{
    return ['http', 'https', 'mailto'];
}
foreach (
    [
        'html5-named-character-references',
        'class-wp-html-attribute-token',
        'class-wp-html-span',
        'class-wp-html-doctype-info',
        'class-wp-html-text-replacement',
        'class-wp-html-decoder',
        'class-wp-html-tag-processor',
    ]
    as $library
) {
    require_once $root . '/wp-includes/html-api/' . $library . '.php';
}
require $root . '/wp-includes/kses.php';
require $root . '/wp-includes/class-wp-block-parser-block.php';
require $root . '/wp-includes/class-wp-block-parser-frame.php';
require $root . '/wp-includes/class-wp-block-parser.php';
require __DIR__ . '/../plugin/editor-bridge.php';
function mbb_display_preferences()
{
    return [
        'source_font_size' => 14,
        'math_reader' => true,
        'code_line_numbers' => true,
        'code_copy' => true,
    ];
}
require __DIR__ . '/../plugin/presentation.php';
$fixtures = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
foreach ($fixtures as $markup) {
    $blocks = (new WP_Block_Parser())->parse($markup);
    if (!mbb_html_allowed($blocks)) {
        throw new RuntimeException('Task markup was rejected by the real core KSES boundary.');
    }
    if (strpos($markup, '<input') !== false) {
        throw new RuntimeException('Task controls must not need input HTML in storage.');
    }
}
if (has_filter('render_block_mbb/task-item', 'mbb_content_task_markers') === false) {
    throw new RuntimeException('Task rendering must apply to direct do_blocks previews.');
}
$task =
    '<li class="wp-block-mbb-task-item"><p>[x] <span>done</span></p></li>' .
    '<li class="wp-block-mbb-task-item"><p>[ ] <span>todo</span></p></li>';
$rendered = apply_filters('render_block_mbb/task-item', $task);
if (
    substr_count($rendered, '<input type="checkbox"') !== 2 ||
    substr_count($rendered, ' disabled checked') !== 1 ||
    substr_count($rendered, ' disabled />') !== 1 ||
    mbb_content_task_markers($rendered) !== $rendered
) {
    throw new RuntimeException('Task display must be read-only and idempotent.');
}
$literal =
    '<li class="wp-block-mbb-list-item"><p>[x] escaped literal</p></li>' .
    '<li>[ ] plain literal</li><pre>[x] code</pre>';
if (mbb_content_task_markers($literal) !== $literal) {
    throw new RuntimeException('Ordinary list and code markers must remain literal.');
}
$comment = '<p>[x] comment task</p><code>[ ] literal</code>';
if (
    substr_count(mbb_task_markers($comment), '<input type="checkbox"') !== 1 ||
    strpos(mbb_task_markers($comment), '<code>[ ] literal</code>') === false
) {
    throw new RuntimeException('Existing comment task display must retain its code boundary.');
}
echo count($fixtures) . " task fixtures passed real WordPress KSES and plugin block allowlist.\n";
