<?php
require dirname(__DIR__) . '/plugin/projections.php';
require dirname(__DIR__) . '/sdk/examples/chart-static/model.php';
$p = (object) [
    'kind' => 'line',
    'title' => '有界图表 · 完整数据',
    'x' => (object) ['label' => '时间', 'unit' => 's'],
    'y' => (object) ['label' => '距离', 'unit' => 'm'],
    'series' => [(object) ['label' => '第一组'], (object) ['label' => '第二组']],
    'rows' => [
        (object) ['x' => 0, 'values' => [-2, 3]],
        (object) ['x' => 1, 'values' => [3, 1]],
        (object) ['x' => 2, 'values' => [5, 2]],
    ],
];
$v = mbb_sdk_chart_projection($p, ['locale' => 'zh_CN']);
mbb_projection_tree($v);
$v['tree'] = array_map('mbb_projection_normalize', $v['tree']);
echo mbb_projection_json($v);
