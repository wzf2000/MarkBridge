<?php
// Pure publication metadata and derived numbering. No database, build artifacts or network.
define('ABSPATH', __DIR__ . '/');
function add_action(...$args) {}
function add_filter(...$args) {}
function register_activation_hook(...$args) {}
function mbb_t($text)
{
    return $text;
}
function wp_json_encode($value)
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
require dirname(__DIR__) . '/plugin/technical.php';
require dirname(__DIR__) . '/plugin/static-export.php';
require dirname(__DIR__) . '/plugin/references.php';
require dirname(__DIR__) . '/plugin/collections-snapshot.php';
function schema_assert($condition, $label)
{
    if (!$condition) {
        throw new RuntimeException($label);
    }
}
function schema_rejects($work)
{
    try {
        $work();
    } catch (Throwable $e) {
        return;
    }
    throw new RuntimeException('Expected explicit refusal');
}
$first = 'C_' . str_repeat('a', 32);
$legacy = [
    'schema' => 1,
    'title' => 'Original',
    'lang' => 'en-US',
    'rights' => '',
    'cover' => null,
    'privateOptIn' => false,
    'chapters' => [['key' => $first, 'post_id' => 1]],
];
schema_assert(mbb_collections_config($legacy) === $legacy, 'legacy configuration unchanged');
$new = $legacy + [
    'authors' => ['作者甲', 'Author B'],
    'edition' => '第一版',
    'versionStatement' => '2026 review',
    'numbering' => 'chapter',
];
$new['schema'] = 2;
$new['chapters'][0]['role'] = 'body';
schema_assert(mbb_collections_config($new) === $new, 'explicit new schema roundtrips');
foreach (
    [
        'authors' => array_fill(0, 9, 'Author'),
        'edition' => str_repeat('中', 67),
        'versionStatement' => str_repeat('x', 1001),
        'numbering' => 'guess',
        'unknown' => true,
    ]
    as $key => $bad
) {
    $candidate = $new;
    $candidate[$key] = $bad;
    schema_rejects(fn() => mbb_collections_config($candidate));
}
$candidate = $new;
$candidate['authors'] = [''];
schema_rejects(fn() => mbb_collections_config($candidate));
$candidate = $new;
$candidate['chapters'][0]['role'] = 'chapter';
schema_rejects(fn() => mbb_collections_config($candidate));
$candidate = $legacy;
$candidate['authors'] = [];
schema_rejects(fn() => mbb_collections_config($candidate));
foreach (['preface', 'body', 'appendix', 'body', 'appendix'] as $i => $role) {
    $new['chapters'][$i] = [
        'key' => 'C_' . str_repeat((string) $i, 32),
        'post_id' => $i + 1,
        'role' => $role,
    ];
}
$layout = array_values(mbb_collections_chapter_layout($new));
schema_assert(
    array_column($layout, 'number') === [null, '1', 'A', '2', 'B'],
    'role counters do not mix prefaces/body/appendices',
);
$descriptor = [
    'contract' => 'mbb-publication-adapter/v1',
    'version' => '1.0.0',
    'fingerprint' => str_repeat('a', 64),
    'title' => 'Legacy',
    'extension' => 'zip',
    'mime' => 'application/zip',
    'build' => static function () {},
];
schema_assert(
    mbb_register_publication_adapter('legacy-model', $descriptor),
    'legacy adapter registration',
);
schema_assert(
    $GLOBALS['mbb_publication_adapters']['legacy-model']['collectionSchemas'] === [1],
    'old provider supports only schema one',
);
foreach ([null, [], [1, 1], ['2'], [1, 2, 3], [3]] as $bad) {
    schema_assert(
        !mbb_register_publication_adapter(
            'invalid-model',
            $descriptor + ['collectionSchemas' => $bad],
        ),
        'invalid provider schema list rejected',
    );
}
schema_assert(
    mbb_register_publication_adapter('new-model', $descriptor + ['collectionSchemas' => [1, 2]]),
    'new adapter',
);
$objects = [];
foreach (
    ['equation', 'figure', 'table', 'listing', 'definition', 'theorem', 'proof', 'step', 'activity']
    as $i => $kind
) {
    $objects['obj' . $i] = [
        'id' => 'obj' . $i,
        'kind' => in_array($kind, ['definition', 'theorem', 'proof']) ? 'statement' : $kind,
        'displayKind' => $kind,
        'number' => 1,
        'title' => 'Title',
    ];
}
$numbered = mbb_collections_number_objects($objects, 'A');
schema_assert(
    count($numbered['numbers']) === 7 && count($numbered['retained']) === 2,
    'bounded native numbering scope',
);
schema_assert(
    $numbered['objects']['obj0']['number'] === 'A.1' &&
        $numbered['objects']['obj7']['number'] === 1,
    'projection objects match native numbering and retained steps',
);
$html =
    '<figure id="eq" class="mbb-technical-object" data-mbb-object-kind="equation"><div class="mbb-technical-body">x</div><figcaption class="mbb-technical-caption">Equation title</figcaption></figure><p><span class="mbb-xref" data-mbb-target="eq" data-mbb-version="1">[eq]</span><a href="#eq">Author-selected words 42</a></p>';
$mapped = ['eq' => ['kind' => 'equation', 'number' => 'A.1']];
$out = mbb_render_technical($html, $mapped);
schema_assert(
    str_contains($out, 'Equation A.1. ') && str_contains($out, '>Equation A.1</a>'),
    'heading and automatic local reference share exact number',
);
schema_assert(
    str_contains($out, '<a href="#eq">Author-selected words 42</a>') &&
        str_contains($out, 'id="eq"'),
    'authored anchor text and object ID unchanged',
);
$static = mbb_static_export_body($html, [], $mapped);
schema_assert(
    str_contains($static, 'Equation A.1') && str_contains($static, 'Author-selected words 42'),
    'static export consumes exact same explicit numbering map',
);
schema_assert(
    str_contains(mbb_render_technical($html), 'Equation 1. ') &&
        !str_contains($html, 'Equation A.1'),
    'ordinary rendering/source unaffected',
);
$object = $objects['obj0'];
$object['number'] = 'A.1';
$resolved = mbb_collections_object(
    $object,
    ['kind' => 'equation', 'target' => 'obj0'],
    'Appendix',
    'chapters/chapter.html',
);
schema_assert(
    $resolved['label'] === 'Equation A.1',
    'cross-chapter automatic label matches object metadata',
);
$target = [
    'namespace' => 'S_' . str_repeat('a', 32),
    'document' => 'D_' . str_repeat('b', 32),
    'target' => 'obj0',
    'kind' => 'equation',
];
$cross =
    '<span class="mbb-xref" data-mbb-version="2" data-mbb-namespace="' .
    $target['namespace'] .
    '" data-mbb-document="' .
    $target['document'] .
    '" data-mbb-target="obj0" data-mbb-kind="equation">[obj0]</span>';
$mappedBody = mbb_collections_body(
    $html . $cross,
    [['target' => $target, 'resolved' => $resolved]],
    [],
    [],
    $mapped,
);
schema_assert(
    str_contains($mappedBody, '>Equation A.1</a>') &&
        str_contains($mappedBody, 'chapters/chapter.html#obj0') &&
        str_contains($mappedBody, 'Author-selected words 42'),
    'real collection static pipeline keeps mapped cross labels and authored anchors',
);
schema_rejects(
    fn() => mbb_render_technical($html, ['missing' => ['kind' => 'equation', 'number' => '1.1']]),
);
schema_rejects(
    fn() => mbb_render_technical($html, ['eq' => ['kind' => 'figure', 'number' => '1.1']]),
);
echo "Collections schema 1/2, closed metadata, provider capability and native/local/cross-chapter numbering passed\n";
