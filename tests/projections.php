<?php
/** Pure data/DOM tests. No WordPress, DB or external requests. */
require dirname(__DIR__) . '/plugin/projections.php';
function check($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function mbb_component_json($v)
{
    return mbb_projection_json($v);
}
$cases = json_decode(
    file_get_contents(__DIR__ . '/fixtures/projections.json'),
    true,
    64,
    JSON_THROW_ON_ERROR,
);
foreach ($cases as $case) {
    $accepted = true;
    try {
        mbb_projection_tree($case['value']);
    } catch (Throwable) {
        $accepted = false;
    }
    check($accepted === $case['valid'], $case['name']);
}
if (($argv[1] ?? '') === '--cases') {
    echo mbb_projection_json(
        json_decode(file_get_contents(__DIR__ . '/fixtures/projections.json')),
    );
    exit();
}
$tree = [
    'schema' => 1,
    'tree' => [
        [
            'tag' => 'svg',
            'attrs' => [
                'viewBox' => [0, 0, 300, 100],
                'role' => 'img',
                'labelledby' => ['caption'],
            ],
            'children' => [
                [
                    'tag' => 'title',
                    'key' => 'caption',
                    'attrs' => (object) [],
                    'children' => ['中文😀'],
                ],
                [
                    'tag' => 'circle',
                    'attrs' => ['cx' => 1e-8, 'cy' => 20, 'r' => 1],
                    'children' => [],
                ],
            ],
        ],
    ],
];
$items = [];
foreach (['first', 'second'] as $id) {
    $items[] = [
        'target' => $id,
        'state' => 'available',
        'params' => (object) [],
        'projection' => $tree,
    ];
}
libxml_use_internal_errors(true);
$doc = new DOMDocument();
$doc->loadHTML(
    '<main><p id="mbb-proj-caption">Original</p><p id="mbb-proj-1-caption">Original 2</p><section id="first"></section><section id="second"></section></main>',
);
$root = $doc->getElementsByTagName('main')->item(0);
mbb_projection_insert($doc, $root, $items);
$xp = new DOMXPath($doc);
$ids = [];
foreach ($xp->query('//*[@id]') as $n) {
    check(!isset($ids[$n->getAttribute('id')]), 'unique IDs');
    $ids[$n->getAttribute('id')] = true;
}
foreach ($xp->query('//*[@aria-labelledby]') as $n) {
    check(isset($ids[$n->getAttribute('aria-labelledby')]), 'local IDREF');
}
$copy = new DOMDocument();
$copy->loadHTML('<main><section id="first"></section></main>');
mbb_projection_insert($copy, $copy->getElementsByTagName('main')->item(0), [$items[0]]);
check($copy->getElementsByTagName('svg')->length === 1, 'independent document budget');
require dirname(__DIR__) . '/sdk/examples/chart-static/model.php';
$p = (object) [
    'kind' => 'bar',
    'title' => '完整图表',
    'x' => (object) ['label' => '时间', 'unit' => 's'],
    'y' => (object) ['label' => '距离', 'unit' => 'm'],
    'series' => [(object) ['label' => 'A']],
    'rows' => [(object) ['x' => 0, 'values' => [-2]], (object) ['x' => 1, 'values' => [3]]],
];
$v = mbb_sdk_chart_projection($p, ['locale' => 'zh_CN']);
mbb_projection_tree($v);
check(str_contains(mbb_projection_json($v), '完整图表'), 'sample Unicode');
check(
    mbb_register_component_projection('small-data-chart', '0.0.1', [
        'contract' => 'mbb-component-projection/v1',
        'version' => '0.1.0',
        'render' => 'mbb_sdk_chart_projection',
        'files' => [
            [
                'file' => realpath(dirname(__DIR__) . '/sdk/examples/chart-static/model.php'),
                'sha256' => hash_file(
                    'sha256',
                    dirname(__DIR__) . '/sdk/examples/chart-static/model.php',
                ),
            ],
        ],
    ]),
    'trusted callback registration',
);
check(
    mbb_component_projection_fingerprint('small-data-chart', '0.0.1') !== null,
    'fresh fingerprint',
);
check(
    !mbb_register_component_projection('bad', '0.0.1', [
        'contract' => 'mbb-component-projection/v1',
        'version' => '0.1.0',
        'render' => 'mbb_sdk_chart_projection',
        'files' => [['file' => realpath(__FILE__), 'sha256' => hash_file('sha256', __FILE__)]],
    ]),
    'callback file required',
);
echo "Typed projection PHP: shared cases, collisions, repeated document, sample, real-file fingerprint passed\n";
