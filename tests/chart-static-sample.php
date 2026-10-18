<?php
require dirname(__DIR__) . '/plugin/projections.php';
require dirname(__DIR__) . '/sdk/examples/chart-static/model.php';
function chart_assert($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
$p = (object) [
    'kind' => 'bar',
    'title' => '稀疏 x 正负对照',
    'x' => (object) ['label' => 'x', 'unit' => 's'],
    'y' => (object) ['label' => '响应', 'unit' => 'm'],
    'series' => [(object) ['label' => 'A'], (object) ['label' => 'B']],
    'rows' => [
        (object) ['x' => 0, 'values' => [-3, 2]],
        (object) ['x' => 1, 'values' => [4, -1]],
        (object) ['x' => 100, 'values' => [2, 3]],
    ],
];
$bar = mbb_sdk_chart_projection($p, ['locale' => 'zh_CN']);
mbb_projection_tree($bar);
$nodes = $bar['tree'][0]['children'][1]['children'];
$rects = array_values(array_filter($nodes, fn($n) => $n['tag'] === 'rect'));
chart_assert(count($rects) === 6, 'all bars retained');
$a = array_map(fn($r) => get_object_vars($r['attrs']), $rects);
chart_assert(
    abs($a[1]['x'] - $a[0]['x'] - ($a[2]['x'] - $a[1]['x'])) < 1e-9,
    'bar groups must follow row order at equal spacing',
);
chart_assert(
    abs($a[4]['x'] - $a[3]['x'] - ($a[5]['x'] - $a[4]['x'])) < 1e-9,
    'second series equal spacing',
);
chart_assert(
    $a[0]['y'] > $a[1]['y'] && $a[0]['height'] > 0 && $a[1]['height'] > 0,
    'positive and negative bars retain zero baseline',
);
$p->kind = 'line';
$line = mbb_sdk_chart_projection($p, ['locale' => 'en']);
mbb_projection_tree($line);
$nodes = $line['tree'][0]['children'][1]['children'];
$polys = array_values(array_filter($nodes, fn($n) => $n['tag'] === 'polyline'));
$points = $polys[0]['attrs']->points;
chart_assert(
    abs(($points[1][0] - $points[0][0]) * 100 - ($points[2][0] - $points[0][0])) < 1e-9,
    'line retains numeric x proportion',
);
chart_assert($p->rows[2]->x === 100 && $p->rows[0]->values[0] === -3, 'params unchanged');
echo "SDK sample sparse-x bar row groups / sign baseline and line numeric geometry passed\n";
