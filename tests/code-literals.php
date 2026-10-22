<?php
// Real WordPress token, block and shortcode libraries; synthetic context, no bootstrap/DB.
$root = getenv('MARKBRIDGE_WORDPRESS_SOURCE') ?: getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
if (!$root || !is_file($root . '/wp-includes/shortcodes.php')) {
    throw new RuntimeException('Set a read-only WordPress 7.1 source root.');
}
foreach (['compat.php', 'plugin.php', 'utf8.php'] as $file) {
    require_once $root . '/wp-includes/' . $file;
}
spl_autoload_register(static function ($class) use ($root) {
    $name = 'class-' . strtolower(str_replace('_', '-', $class)) . '.php';
    foreach (['wp-includes/', 'wp-includes/html-api/'] as $dir) {
        if (is_file($root . '/' . $dir . $name)) {
            require_once $root . '/' . $dir . $name;
            return;
        }
    }
});
// Only site context/charset are synthetic. Parsing, shortcode dispatch and escaping are core.
function wp_allowed_protocols()
{
    return ['http', 'https'];
}
function is_utf8_charset()
{
    return true;
}
function _canonical_charset($charset)
{
    return 'UTF-8';
}
function get_option($name, $default = false)
{
    return $name === 'blog_charset' ? 'UTF-8' : $default;
}
function is_admin()
{
    return true;
} // Avoid asset enqueue in the isolated render callback.
function get_the_ID()
{
    return 7;
}
function mbb_managed($id)
{
    return $id === 7 && $GLOBALS['literal_managed'];
}
foreach (['formatting.php', 'kses.php', 'shortcodes.php'] as $file) {
    require_once $root . '/wp-includes/' . $file;
}
require dirname(__DIR__) . '/plugin/components.php';
require dirname(__DIR__) . '/plugin/teaching.php';
require dirname(__DIR__) . '/plugin/code-literals.php';
require dirname(__DIR__) . '/plugin/includes/php-converter/Worker.php';
$GLOBALS['literal_managed'] = true;
$calls = 0;
add_shortcode('mbb_literal_fixture', static function () use (&$calls) {
    ++$calls;
    return '<mark class="shortcode-result">Normal shortcode</mark>';
});
function literal_assert($ok, $label)
{
    if (!$ok) {
        throw new RuntimeException($label);
    }
}
function literal_render(array $blocks): string
{
    $html = '';
    foreach ($blocks as $block) {
        $child = 0;
        $body = '';
        foreach ($block['innerContent'] as $chunk) {
            $body .= $chunk ?? literal_render([$block['innerBlocks'][$child++]]);
        }
        $html .= apply_filters('render_block', $body, $block);
    }
    return $html;
}
$token = '[mbb_literal_fixture]';
$code = 'const value = "' . $token . '";' . "\n";
$config = [
    'defaultTab' => 'first',
    'tabs' => [
        ['id' => 'first', 'title' => 'JavaScript', 'language' => 'javascript', 'code' => $code],
        [
            'id' => 'second',
            'title' => 'Python',
            'language' => 'python',
            'code' => "print('" . $token . "')\n",
        ],
    ],
];
$json = mbb_code_tabs_config_json($config);
literal_assert(json_decode($json, true) === $config, 'Derived tabs JSON changed its configuration');
literal_assert(
    str_contains($json, '"tabs":[') && str_contains($json, '\u005bmbb_literal_fixture]'),
    'JSON array syntax/string escape changed',
);
$escape = static fn($s) => htmlspecialchars($s, ENT_NOQUOTES | ENT_HTML5, 'UTF-8');
$tabs = '<div id="literal-tabs" class="wp-block-mbb-code-tabs">';
foreach ($config['tabs'] as $tab) {
    $tabs .=
        '<div class="mbb-code-tab" id="' .
        $tab['id'] .
        '"><p class="mbb-code-tab-title">' .
        $tab['title'] .
        '</p><pre><code class="language-' .
        $tab['language'] .
        '">' .
        $escape($tab['code']) .
        '</code></pre></div>';
}
$tabs .= '</div>';
$tabs = apply_filters('render_block', $tabs, ['blockName' => 'mbb/code-tabs', 'attrs' => $config]);
$source =
    $token .
    "\n\nInline `" .
    $token .
    "`.\n\n```javascript\n" .
    $code .
    "```\n\n:::mbb:v1 preformatted " .
    json_encode(['text' => $token]) .
    "\n:::mbb:end\n";
$source .= "\n\n";
$source .= ':::mbb:v1 native-code ' . json_encode(['text' => $token]) . "\n:::mbb:end\n";
$converted = \MarkBridge\Probe\Worker::convert([
    'mode' => 'markdown',
    'source' => $source,
    'documentId' => 'literal-fixture',
]);
literal_assert($converted['ok'], json_encode($converted));
$stored = $converted['document']['serialized'];
$blocks = (new WP_Block_Parser())->parse($stored);
$html =
    literal_render($blocks) .
    $tabs .
    '<div class="wp-block-mbb-code-compare"><pre><code class="language-javascript">' .
    $escape($code) .
    '</code></pre><pre><code>' .
    $token .
    '</code></pre></div>';
$protected = apply_filters('the_content', $html);
literal_assert(
    mbb_code_literal_html($protected) === $protected,
    'Literal projection is not idempotent',
);
$rendered = do_shortcode($protected);
literal_assert($calls === 1, 'Code/config invoked shortcode, or normal paragraph stopped working');
literal_assert(
    substr_count($rendered, 'shortcode-result') === 1,
    'Ordinary shortcode output changed',
);
literal_assert(
    $stored === $converted['document']['serialized'] &&
        $source === $converted['document']['source'],
    'Reading changed the saved pair',
);
// An unprotected tabs attribute really does execute, even if the body was already protected.
$calls = 0;
$unsafe =
    '<div data-mbb-teaching-config="' .
    esc_attr(mbb_component_json($config)) .
    '"><pre><code>&#91;mbb_literal_fixture]</code></pre></div>';
do_shortcode($unsafe);
literal_assert($calls === 2, 'Core shortcode attribute regression fixture did not execute');
$calls = 0;
$GLOBALS['literal_managed'] = false;
literal_assert(apply_filters('the_content', $html) === $html, 'Non-managed article changed');
do_shortcode('<code>' . $token . '</code>');
literal_assert($calls === 1, 'Non-managed shortcode behavior changed');
$GLOBALS['literal_managed'] = true;
foreach (
    [
        [
            '<pre><code>  ' . $token . "\n\t</code>tail" . $token . '</pre><p>' . $token . '</p>',
            '<pre><code>  &#91;mbb_literal_fixture]' .
            "\n\t</code>tail&#91;mbb_literal_fixture]</pre><p>" .
            $token .
            '</p>',
        ],
        [
            '<code title=">[attr]">' . $token . '</code>',
            '<code title=">[attr]">&#91;mbb_literal_fixture]</code>',
        ],
        ['<code>&#91;x] &#x5B;x] &lbrack;x]</code>', '<code>&#91;x] &#x5B;x] &lbrack;x]</code>'],
        [
            '<!-- <pre>[comment]</pre> --><code-x>[outside]</code-x><script>"<code>[script]</code>"</script><style>/*[style]*/</style>',
            '<!-- <pre>[comment]</pre> --><code-x>[outside]</code-x><script>"<code>[script]</code>"</script><style>/*[style]*/</style>',
        ],
        [
            '<pre><script>[script]</script><style>[style]</style>' . $token . '</pre>',
            '<pre><script>[script]</script><style>[style]</style>&#91;mbb_literal_fixture]</pre>',
        ],
        ['<pre>' . $token, '<pre>&#91;mbb_literal_fixture]'],
        ['<pre>[text]<span title="[opaque]', '<pre>&#91;text]<span title="[opaque]'],
        [
            str_repeat('<code>', 64) . $token . str_repeat('</code>', 64) . '<p>[outside]</p>',
            str_repeat('<code>', 64) .
            '&#91;mbb_literal_fixture]' .
            str_repeat('</code>', 64) .
            '<p>[outside]</p>',
        ],
        [
            '<pre>' . str_repeat('[x] ', 65536) . '</pre>',
            '<pre>' . str_repeat('&#91;x] ', 65536) . '</pre>',
        ],
    ]
    as [$before, $after]
) {
    literal_assert(
        mbb_code_literal_html($before) === $after,
        'Token projection changed non-text bytes or nesting',
    );
    literal_assert(mbb_code_literal_html($after) === $after, 'Repeated projection changed bytes');
    literal_assert(strlen($after) <= strlen($before) * 5, 'Projection expansion exceeded bound');
}
// Quoted/backslash strings remain valid data; array delimiters are not escaped.
$quoted = ['tabs' => [['code' => "\\\"[mbb_literal_fixture]\\u005b", 'title' => '[[name]]']]];
literal_assert(
    json_decode(mbb_code_tabs_config_json($quoted), true) === $quoted,
    'JSON quoted/backslash text changed',
);
if (in_array('--fixture', $argv, true)) {
    echo json_encode(
        ['html' => $rendered, 'code' => $code],
        JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
    );
} else {
    echo "Real core block/token/shortcode projection, tabs attribute execution, managed scope, nesting/bounds and exact source preservation passed.\n";
}
