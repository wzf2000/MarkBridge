<?php
// Read-only core-library check: no WordPress bootstrap, database, login or article writes.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
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
require $root . '/wp-includes/compat.php';
require $root . '/wp-includes/plugin.php';
require $root . '/wp-includes/formatting.php';
// Keep the protocol list restricted in this read-only core-library harness.
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
$adapters = json_decode(
    file_get_contents(__DIR__ . '/fixtures/block-adapters.json'),
    true,
    512,
    JSON_THROW_ON_ERROR,
);
foreach ($adapters['descriptors'] as $descriptor) {
    if (!mbb_register_block_adapter($descriptor)) {
        throw new RuntimeException('Synthetic static adapter registration failed.');
    }
}
$fixtures = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
foreach ($fixtures['accepted'] as $markup) {
    $blocks = (new WP_Block_Parser())->parse($markup);
    if (!mbb_html_allowed($blocks)) {
        throw new RuntimeException('Native group rejected by actual core parser/KSES policy.');
    }
}
foreach ($fixtures['rejected'] as $markup) {
    $blocks = (new WP_Block_Parser())->parse($markup);
    if (mbb_html_allowed($blocks)) {
        throw new RuntimeException('Unsafe/unknown nested content passed group server policy.');
    }
}
echo count($fixtures['accepted']) .
    ' native group shells and ' .
    count($fixtures['rejected']) .
    " server policy refusals passed actual core parser/KSES.\n";
