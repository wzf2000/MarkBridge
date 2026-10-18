<?php
// Actual core parser/serializer/KSES; only local data, no WordPress bootstrap/database.
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
if (!$root || !is_file($root . '/wp-includes/blocks.php')) {
    throw new RuntimeException('Set the read-only WordPress core root.');
}
function add_filter(...$args) {}
function add_action(...$args) {}
function apply_filters($name, $value, ...$args)
{
    return $value;
}
function wp_json_encode($value, $flags = 0)
{
    return json_encode($value, $flags);
}
function wp_allowed_protocols()
{
    return ['http', 'https'];
}
foreach (
    [
        'class-wp-block-parser-block.php',
        'class-wp-block-parser-frame.php',
        'class-wp-block-parser.php',
        'blocks.php',
        'kses.php',
    ]
    as $file
) {
    require_once $root . '/wp-includes/' . $file;
}
foreach (['span', 'text-replacement', 'attribute-token', 'decoder', 'tag-processor'] as $name) {
    require_once $root . '/wp-includes/html-api/class-wp-html-' . $name . '.php';
}
require dirname(__DIR__) . '/plugin/native-rest-save.php';
require dirname(__DIR__) . '/plugin/includes/php-converter/Worker.php';
function native_comment_check($ok, $label)
{
    if (!$ok) {
        throw new RuntimeException($label);
    }
}
function native_comment_convert(array $request): array
{
    return \MarkBridge\Probe\Worker::convert($request);
}
function native_comment_source(mixed $params, int $version): string
{
    $attrs = [
        'id' => 'sample',
        'component' => 'fixture',
        'componentVersion' => '0.1.0',
        'params' => $params,
    ];
    $body = 'Original text.';
    if ($version === 2) {
        $attrs['activity'] = [
            'schema' => 1,
            'prompt' => 'question',
            'options' => [],
            'hints' => ['hint'],
            'feedback' => ['correct' => 'yes', 'incorrect' => 'no'],
            'explanation' => 'solution',
        ];
        $body = '';
        foreach (['question', 'hint', 'yes', 'no', 'solution'] as $id) {
            $body .=
                ':::mbb:v1 collapse ' .
                json_encode(['id' => $id, 'title' => $id, 'open' => $id === 'question']) .
                "\n\nOriginal text.\n\n:::mbb:end\n\n";
        }
    }
    return ':::mbb:v' .
        $version .
        ' component ' .
        json_encode($attrs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) .
        "\n\n" .
        $body .
        "\n\n:::mbb:end\n";
}
$cases = [];
foreach (
    [
        ['fraction-v1', (object) ['answer' => 0.1, 'tolerance' => 1e-8, 'integer' => false], 1],
        ['empty-v1', new stdClass(), 1],
        [
            'nested-v1',
            (object) [
                'empty' => new stdClass(),
                'array' => [],
                'nested' => [(object) ['inner' => new stdClass()], []],
            ],
            1,
        ],
        ['fraction-v2', (object) ['answer' => 0.1, 'tolerance' => 1e-8, 'integer' => false], 2],
        ['nested-components', new stdClass(), 1],
    ]
    as [$name, $params, $version]
) {
    $source = native_comment_source($params, $version);
    if ($name === 'nested-components') {
        $inner = native_comment_source(
            (object) ['answer' => 0.1, 'tolerance' => 1e-8, 'integer' => false],
            1,
        );
        $inner = str_replace('"id":"sample"', '"id":"inner"', $inner);
        $position = strrpos($source, ':::mbb:end');
        $source = substr($source, 0, $position) . $inner . "\n" . substr($source, $position);
    }
    $documentId = 'NativeComment-' . $name;
    $base = native_comment_convert([
        'mode' => 'markdown',
        'source' => $source,
        'documentId' => $documentId,
    ]);
    $candidate = native_comment_convert([
        'mode' => 'markdown',
        'source' => str_replace('Original text.', 'Edited text.', $source),
        'documentId' => $documentId,
    ]);
    native_comment_check($base['ok'] && $candidate['ok'], 'fixture import ' . $name);
    $incoming = $candidate['document']['serialized'];
    $prepared = serialize_blocks(parse_blocks($incoming));
    native_comment_check(
        $prepared !== $incoming,
        'real core projection must change fixture ' . $name,
    );
    $raw = native_comment_convert([
        'mode' => 'blocks',
        'base' => $base['document'],
        'serialized' => $prepared,
        'documentId' => $documentId,
    ]);
    native_comment_check(
        !$raw['ok'],
        'original core projection must reproduce strict refusal ' . $name,
    );
    $repaired = mbb_native_component_comment_bytes($prepared, $incoming);
    native_comment_check(
        $repaired === $incoming,
        'exact original component comment restored ' . $name,
    );
    $converted = native_comment_convert([
        'mode' => 'blocks',
        'base' => $base['document'],
        'serialized' => $repaired,
        'documentId' => $documentId,
    ]);
    native_comment_check($converted['ok'], 'strict conversion after native-only repair ' . $name);
    $cases[] = [
        'name' => $name,
        'source' => $source,
        'base' => $base['document'],
        'incoming' => $incoming,
        'prepared' => $prepared,
        'repaired' => $repaired,
        'documentId' => $documentId,
    ];
}
// A canonical native request at exactly 256 KiB must survive a slightly larger
// temporary PHP exponent spelling; this does not raise the saved-pair limit.
$small = native_comment_source(
    (object) ['answer' => 0.1, 'tolerance' => 1e-8, 'integer' => false],
    1,
);
$probe = native_comment_convert([
    'mode' => 'markdown',
    'source' => $small,
    'documentId' => 'NativeComment-cap',
]);
$padding = 262144 - strlen($probe['document']['serialized']);
$source = str_replace('Original text.', 'Original text. ' . str_repeat('x', $padding - 1), $small);
$base = native_comment_convert([
    'mode' => 'markdown',
    'source' => $source,
    'documentId' => 'NativeComment-cap',
]);
$candidate = native_comment_convert([
    'mode' => 'markdown',
    'source' => str_replace('Original', 'Modified', $source),
    'documentId' => 'NativeComment-cap',
]);
native_comment_check($base['ok'] && $candidate['ok'], 'near-limit valid source/pair');
$incoming = $candidate['document']['serialized'];
$prepared = serialize_blocks(parse_blocks($incoming));
native_comment_check(
    strlen($incoming) === 262144 && strlen($prepared) > 262144 && strlen($source) <= 262144,
    'temporary projection crosses saved byte limit',
);
$repaired = mbb_native_component_comment_bytes($prepared, $incoming);
native_comment_check(
    $repaired === $incoming,
    'temporary byte expansion must not reject a valid boundary pair',
);
$converted = native_comment_convert([
    'mode' => 'blocks',
    'base' => $base['document'],
    'serialized' => $repaired,
    'documentId' => 'NativeComment-cap',
]);
native_comment_check($converted['ok'], 'final boundary pair remains within converter budget');
$cases[] = [
    'name' => 'near-cap',
    'source' => $source,
    'base' => $base['document'],
    'incoming' => $incoming,
    'prepared' => $prepared,
    'repaired' => $repaired,
    'documentId' => 'NativeComment-cap',
    'edit' => 'Modified text',
];
$nested = $cases[4];
$changed = parse_blocks($nested['prepared']);
$changed[0]['innerBlocks'][1]['attrs']['params']['answer'] = 0.2;
$changed = serialize_blocks($changed);
native_comment_check(
    mbb_native_component_comment_bytes($changed, $nested['incoming']) === $changed,
    'changed nested subtree must not restore either ancestor or child',
);
native_comment_check(
    mbb_native_component_comment_bytes(str_repeat('x', 1500001), $nested['incoming']) ===
        str_repeat('x', 1500001),
    'serialized byte budget retains rejection boundary',
);
$nodes = str_repeat('<!-- wp:paragraph /-->', 10001);
native_comment_check(
    mbb_native_component_comment_bytes($nodes, $nested['incoming']) === $nodes,
    'opening block count avoids oversized scratch trees',
);
$c = $cases[3];
$incoming = $c['incoming'];
$prepared = $c['prepared'];
$blocks = parse_blocks($prepared);
foreach (['value', 'metadata', 'type', 'structure'] as $change) {
    $changed = $blocks;
    if ($change === 'value') {
        $changed[0]['attrs']['params']['answer'] = 0.2;
    }
    if ($change === 'metadata') {
        $changed[0]['attrs']['metadata'] = ['ignoredHookedBlocks' => ['example/extra']];
    }
    if ($change === 'type') {
        $changed[0]['attrs']['params']['answer'] = '0.1';
    }
    if ($change === 'structure') {
        array_pop($changed[0]['innerBlocks']);
    }
    // Keep the core tree internally consistent when removing a child.
    if ($change === 'structure') {
        $position = array_search(null, array_reverse($changed[0]['innerContent'], true), true);
        if ($position !== false) {
            unset($changed[0]['innerContent'][$position]);
        }
        $changed[0]['innerContent'] = array_values($changed[0]['innerContent']);
    }
    $serialized = serialize_blocks($changed);
    native_comment_check(
        mbb_native_component_comment_bytes($serialized, $incoming) === $serialized,
        'actual ' . $change . ' must not be restored',
    );
}
$wrapped = '<!-- wp:group --><div class="wp-block-group">' . $prepared . '</div><!-- /wp:group -->';
$wrapped = serialize_blocks(parse_blocks($wrapped));
native_comment_check(
    mbb_native_component_comment_bytes($wrapped, $incoming) === $wrapped,
    'changed enclosing structure must not restore',
);
foreach (['duplicate-id', 'duplicate-json', 'malformed-json'] as $bad) {
    $original = $incoming;
    if ($bad === 'duplicate-id') {
        $original .= "\n\n" . $incoming;
    }
    if ($bad === 'duplicate-json') {
        $original = preg_replace('/"id":"sample"/', '"id":"sample","id":"sample"', $original, 1);
    }
    if ($bad === 'malformed-json') {
        $original = preg_replace('/"id":"sample"/', '"id":"sample",', $original, 1);
    }
    $projected = serialize_blocks(parse_blocks($original));
    $repaired = mbb_native_component_comment_bytes($projected, $original);
    if ($bad === 'duplicate-id') {
        native_comment_check($repaired === $projected, 'duplicate instance must not restore');
    }
    $result = native_comment_convert([
        'mode' => 'blocks',
        'base' => $c['base'],
        'serialized' => $repaired,
        'documentId' => $c['documentId'],
    ]);
    native_comment_check(!$result['ok'], 'strict parser must still refuse ' . $bad);
}
$unsafe = str_replace('<p>Edited text.</p>', '<p onclick="alert(1)">Edited text.</p>', $incoming);
native_comment_check($unsafe !== $incoming, 'unsafe fixture differs');
$filtered = wp_kses_post(serialize_blocks(parse_blocks($unsafe)));
native_comment_check(!str_contains($filtered, 'onclick'), 'real KSES removes unsafe attribute');
$repaired = mbb_native_component_comment_bytes($filtered, $unsafe);
native_comment_check(
    $repaired === $filtered && !str_contains($repaired, 'onclick'),
    'native comment repair cannot revive KSES HTML',
);
// Noncanonical prepared JSON must not be hidden by parse/serialize normalization.
$duplicatePrepared = preg_replace('/"id":"sample"/', '"id":"sample","id":"sample"', $prepared, 1);
native_comment_check(
    mbb_native_component_comment_bytes($duplicatePrepared, $incoming) === $duplicatePrepared,
    'prepared duplicate JSON preserved for strict rejection',
);
if (in_array('--json', $argv, true)) {
    echo json_encode($cases, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} else {
    echo "Actual core component comment projection: fractions, empty/nested objects, exact correspondence, semantic/metadata/type/structure changes, strict duplicate/malformed rejection and KSES safety passed.\n";
}
