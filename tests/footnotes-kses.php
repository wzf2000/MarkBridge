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
require __DIR__ . '/../plugin/footnotes.php';
$fixtures = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
foreach ($fixtures as $markup) {
    $blocks = (new WP_Block_Parser())->parse($markup);
    if (!mbb_html_allowed($blocks)) {
        throw new RuntimeException('Footnotes rejected by real WordPress KSES/allowlist.');
    }
    $html = preg_replace('/<!--.*?-->/s', '', $markup);
    $rendered = mbb_render_footnotes($html);
    if (!str_contains($rendered, 'href="#') || $rendered === $html) {
        throw new RuntimeException('Footnotes must provide real navigation anchors.');
    }
    if (mbb_render_footnotes($rendered) !== $rendered) {
        throw new RuntimeException('Repeated rendering must be idempotent.');
    }
    $second = mbb_render_footnotes($html);
    preg_match_all('/\bid="([^"]+)"/', $rendered, $first_ids);
    preg_match_all('/\bid="([^"]+)"/', $second, $second_ids);
    if (array_intersect($first_ids[1], $second_ids[1])) {
        throw new RuntimeException('Repeated documents must not share generated anchor IDs.');
    }
}
echo count($fixtures) .
    " footnote fixtures passed actual KSES, rendering and document isolation.\n";
