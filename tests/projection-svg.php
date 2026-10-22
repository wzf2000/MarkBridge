<?php
/** Formal PHP static-document projection pipeline; no WordPress bootstrap/DB/network. */
require dirname(__DIR__) . '/plugin/projections.php';
require dirname(__DIR__) . '/sdk/examples/chart-static/model.php';
function psvg_check($ok, $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function mbb_component_json($v)
{
    return mbb_projection_json($v);
}
function mbb_component_provider(...$args)
{
    return ['status' => 'available', 'schema' => []];
}
function mbb_component_schema(...$args)
{
    return true;
}
function mbb_component_domain_valid(...$args)
{
    return true;
}
function mbb_component_descriptors($serialized)
{
    $out = [];
    foreach (['chart-a', 'chart-b', 'plain', 'broken', 'legacy'] as $id) {
        $out[$id] = (object) [
            'id' => $id,
            'component' => $id,
            'componentVersion' => '0.1.0',
            'params' => (object) [],
        ];
    }
    return $out;
}
function psvg_render($params, $context): array
{
    $chart = mbb_sdk_chart_projection(
        (object) [
            'kind' => 'line',
            'title' => '静态命名空间图表',
            'x' => (object) ['label' => '时间', 'unit' => 's'],
            'y' => (object) ['label' => '距离', 'unit' => 'm'],
            'series' => [(object) ['label' => 'A'], (object) ['label' => 'B']],
            'rows' => [
                (object) ['x' => 0, 'values' => [-2, 3]],
                (object) ['x' => 1, 'values' => [3, 1]],
                (object) ['x' => 2, 'values' => [5, 2]],
            ],
        ],
        $context,
    );
    $svg = &$chart['tree'][0]['children'][1];
    $shapes = [];
    $labels = [];
    $marker = 0;
    foreach ($svg['children'] as $node) {
        if (in_array($node['tag'], ['title', 'desc'], true)) {
            $labels[] = $node;
        } else {
            if ($node['tag'] === 'circle' || $node['tag'] === 'rect') {
                $node['key'] = 'marker-point-' . $marker++;
            }
            $shapes[] = $node;
        }
    }
    $svg['children'] = [...$labels, ['tag' => 'g', 'attrs' => (object) [], 'children' => $shapes]];
    return $chart;
}
function psvg_plain($params, $context): array
{
    return [
        'schema' => 1,
        'tree' => [['tag' => 'p', 'attrs' => (object) [], 'children' => ['Plain derived view']]],
    ];
}
function psvg_broken($params, $context): array
{
    return [
        'schema' => 1,
        'tree' => [['tag' => 'script', 'attrs' => (object) [], 'children' => ['rejected']]],
    ];
}
foreach (
    [
        'chart-a' => 'psvg_render',
        'chart-b' => 'psvg_render',
        'plain' => 'psvg_plain',
        'broken' => 'psvg_broken',
    ]
    as $id => $render
) {
    psvg_check(
        mbb_register_component_projection($id, '0.1.0', [
            'contract' => 'mbb-component-projection/v1',
            'version' => '0.1.0',
            'render' => $render,
            'files' => [
                ['file' => __FILE__, 'sha256' => hash_file('sha256', __FILE__)],
                [
                    'file' => dirname(__DIR__) . '/sdk/examples/chart-static/model.php',
                    'sha256' => hash_file(
                        'sha256',
                        dirname(__DIR__) . '/sdk/examples/chart-static/model.php',
                    ),
                ],
            ],
        ]),
        'Fixture projection registration',
    );
}
$body =
    '<p id="mbb-proj-chart-title">Author anchor</p><p id="mbb-proj-chart-description">Author description anchor</p>';
foreach (array_keys(mbb_component_descriptors('')) as $id) {
    $body .= '<section id="' . $id . '"><p>Author fallback ' . $id . '</p></section>';
}
$html = mbb_component_static_document($body, '', 'zh_CN');
if (in_array('--html', $argv, true)) {
    echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.7 system-ui;margin:16px}article{max-width:800px;margin:auto}' .
        file_get_contents(dirname(__DIR__) . '/plugin/projections.css') .
        '</style></head><body><article>' .
        $html .
        '</article></body></html>';
    return;
}
psvg_check(
    !str_contains($html, 'default:') && str_contains($html, '<svg'),
    'Serialized SVG must retain canonical names, not default: aliases',
);
$doc = new DOMDocument();
$old = libxml_use_internal_errors(true);
$doc->loadHTML('<?xml encoding="UTF-8">' . $html);
libxml_clear_errors();
libxml_use_internal_errors($old);
$xp = new DOMXPath($doc);
psvg_check($xp->query('//svg')->length === 2, 'Both SVG roots survive HTML reparse');
psvg_check(
    $xp->query('//svg//polyline')->length === 4 && $xp->query('//svg//circle[@id]')->length >= 6,
    'Geometry and marker shapes survive HTML reparse',
);
psvg_check(
    $xp->query('//svg/title')->length === 2 && $xp->query('//svg/desc')->length === 2,
    'SVG title/desc retained',
);
$ids = [];
foreach ($xp->query('//*[@id]') as $node) {
    psvg_check(!isset($ids[$node->getAttribute('id')]), 'Unique projection and author IDs');
    $ids[$node->getAttribute('id')] = true;
}
foreach ($xp->query('//svg[@aria-labelledby]') as $node) {
    foreach (explode(' ', $node->getAttribute('aria-labelledby')) as $id) {
        psvg_check(isset($ids[$id]), 'Local aria reference');
    }
}
psvg_check(
    str_contains($html, 'Plain derived view') &&
        str_contains($html, 'Author fallback broken') &&
        str_contains($html, 'Static view unavailable.') &&
        !str_contains($html, '<script'),
    'Plain projection and failure fallback preserve author text',
);
psvg_check(
    $xp->query('//*[@id="legacy"]/*[@class="mbb-projection"]')->length === 0,
    'Legacy author-only fallback leaves no empty wrapper',
);
// Invalid typed data after an already inserted valid projection must not leak partial geometry.
$direct = new DOMDocument();
$direct->loadHTML('<main><section id="budget"><p>Author budget fallback</p></section></main>');
$over = [
    'schema' => 1,
    'tree' => array_fill(0, 30, [
        'tag' => 'p',
        'attrs' => (object) [],
        'children' => [str_repeat('&', 1024)],
    ]),
];
mbb_projection_insert($direct, $direct->getElementsByTagName('main')->item(0), [
    ['target' => 'budget', 'state' => 'available', 'projection' => $over],
]);
psvg_check(
    !str_contains($direct->saveHTML(), str_repeat('&amp;', 1024)) &&
        str_contains($direct->saveHTML(), 'Author budget fallback'),
    'Output budget failure clears partial derived tree',
);
$aggregate = new DOMDocument();
$aggregate->loadHTML(
    '<main>' .
        implode(
            '',
            array_map(
                static fn($i) => '<section id="aggregate-' .
                    $i .
                    '"><p>Author ' .
                    $i .
                    '</p></section>',
                range(0, 4),
            ),
        ) .
        '</main>',
);
$bounded = [
    'schema' => 1,
    'tree' => array_fill(0, 24, [
        'tag' => 'p',
        'attrs' => (object) [],
        'children' => [str_repeat('&', 1024)],
    ]),
];
mbb_projection_insert(
    $aggregate,
    $aggregate->getElementsByTagName('main')->item(0),
    array_map(
        static fn($i) => [
            'target' => 'aggregate-' . $i,
            'state' => 'available',
            'projection' => $bounded,
        ],
        range(0, 4),
    ),
);
$ax = new DOMXPath($aggregate);
psvg_check(
    $ax->query('//*[@id="aggregate-0"]//*[@class="mbb-projection"]/p')->length === 24 &&
        $ax->query('//*[@id="aggregate-4"]//*[@class="mbb-projection"]/p')->length === 1 &&
        str_contains($aggregate->saveHTML(), 'Author 4'),
    'Aggregate output byte budget preserves prior projections and final author fallback',
);
echo "PHP formal static-document SVG serialization/geometry/markers/title/desc/IDs/aria, plain projection and failure/budget fallback passed.\n";
