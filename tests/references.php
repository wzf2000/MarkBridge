<?php
// Structural transformations use the actual core parser/serializer; no database or WordPress writes.
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
if (!$root || !is_file($root . '/wp-includes/blocks.php')) {
    throw new RuntimeException('Set MARKBRIDGE_TEST_WORDPRESS_ROOT to the isolated core checkout.');
}
define('ABSPATH', $root . '/');
foreach (['block', 'frame'] as $name) {
    require $root . '/wp-includes/class-wp-block-parser-' . $name . '.php';
}
require $root . '/wp-includes/class-wp-block-parser.php';
require $root . '/wp-includes/blocks.php';
function apply_filters($hook, $value, ...$args)
{
    return $value;
}
function wp_json_encode($value, $flags = 0, $depth = 512)
{
    return json_encode($value, $flags, $depth);
}
function is_wp_error($value)
{
    return false;
}
require dirname(__DIR__) . '/plugin/includes/php-converter/Worker.php';
require dirname(__DIR__) . '/plugin/references-data.php';
function mbb_convert($request)
{
    $value = \MarkBridge\Probe\Worker::convert($request);
    if (!$value['ok']) {
        throw new RuntimeException(json_encode($value));
    }
    return $value['document'];
}
function reference_model_assert($condition, $label)
{
    if (!$condition) {
        throw new RuntimeException($label);
    }
}
$a = ['namespace' => 'S_' . str_repeat('a', 32), 'document' => 'D_' . str_repeat('a', 32)];
$b = ['namespace' => 'S_' . str_repeat('b', 32), 'document' => 'D_' . str_repeat('b', 32)];
$x = ['namespace' => 'S_' . str_repeat('c', 32), 'document' => 'D_' . str_repeat('c', 32)];
$y = ['namespace' => 'S_' . str_repeat('d', 32), 'document' => 'D_' . str_repeat('d', 32)];
$external = ['namespace' => 'S_' . str_repeat('e', 32), 'document' => 'D_' . str_repeat('e', 32)];
$mark = static fn($tuple) => mbb_references_marker(
    $tuple + ['target' => 'eq-one', 'kind' => 'equation'],
);
$literal = "```html\n" . $mark($a) . "\n```\n";
$source =
    "---\r\nmarkbridge: 1\r\ntitle: \"Proposal\"\r\n---\r\n\r\n" .
    $mark($a) .
    ' ' .
    $mark($b) .
    ' ' .
    $mark($external) .
    "\n\n" .
    $literal .
    "\nLast[^last].\n\n[^last]: Final footnote.\n";
$enabled = mbb_references_insert_identity($source, $a);
reference_model_assert(
    str_starts_with($enabled, "---\r\nmarkbridge: 1\r\ntitle: \"Proposal\"\r\n---\r\n"),
    'raw FrontMatter retained',
);
reference_model_assert(str_ends_with($enabled, "[^last]: Final footnote.\n"), 'footnotes last');
$mapped = mbb_references_replace_tuples($enabled, [
    ['before' => $a, 'after' => $x],
    ['before' => $b, 'after' => $y],
]);
$projection = mbb_references_projection(
    mbb_convert(['mode' => 'markdown', 'source' => $mapped, 'documentId' => 'REFERENCE_MODEL'])[
        'serialized'
    ],
);
reference_model_assert(
    $projection['identity'] === $x,
    'union map does not overwrite identity with last tuple',
);
reference_model_assert(
    $projection['edges'] == [
        $x + ['target' => 'eq-one', 'kind' => 'equation'],
        $y + ['target' => 'eq-one', 'kind' => 'equation'],
        $external + ['target' => 'eq-one', 'kind' => 'equation'],
    ],
    'internal copied set remapped, external retained',
);
reference_model_assert(str_contains($mapped, $literal), 'literal code exact');
reference_model_assert(
    (bool) preg_match('/\[\^last\]: Final footnote\\\\?\.\s*$/D', $mapped),
    'mapped footnotes last',
);
// Mapping a reference to another copied document never changes this document's own identity.
$other = mbb_references_replace_tuple($enabled, $b, $y);
reference_model_assert(
    mbb_references_projection(
        mbb_convert(['mode' => 'markdown', 'source' => $other, 'documentId' => 'REFERENCE_MODEL'])[
            'serialized'
        ],
    )['identity'] === $a,
    'unmatched identity retained',
);
echo "Reference union-copy mapping, raw header, end footnotes, external targets and literal code passed with actual core parser/serializer.\n";
