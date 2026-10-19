<?php
require dirname(__DIR__) . '/plugin/projections.php';
function mbb_component_json($v)
{
    return mbb_projection_json($v);
}
function mbb_component_schema(...$v)
{
    return true;
}
function mbb_component_domain_valid(...$v)
{
    return true;
}
function mbb_component_provider($id, $v)
{
    return $id === 'missing' ? null : ['status' => 'available', 'schema' => []];
}
function mbb_component_descriptors($source)
{
    return json_decode($source);
}
function sdk_budget_renderer($p, $context)
{
    if ($p->throw ?? false) {
        throw new RuntimeException('renderer');
    }
    return ['schema' => 1, 'tree' => array_fill(0, 500, str_repeat('中', 65))];
}
if (($argv[1] ?? '') === '--memory') {
    ini_set('memory_limit', '128M');
    require dirname(__DIR__) . '/sdk/examples/chart-static/model.php';
    function sdk_dense_renderer($p, $context)
    {
        return mbb_sdk_chart_projection($p, $context);
    }
    $files = [];
    foreach ([__FILE__, dirname(__DIR__) . '/sdk/examples/chart-static/model.php'] as $file) {
        $files[] = ['file' => realpath($file), 'sha256' => hash_file('sha256', $file)];
    }
    mbb_register_component_projection('dense', '1.0.0', [
        'contract' => 'mbb-component-projection/v1',
        'version' => '1.0.0',
        'render' => 'sdk_dense_renderer',
        'files' => $files,
    ]);
    $p = (object) [
        'kind' => 'line',
        'title' => 'Dense chart',
        'x' => (object) ['label' => 'x', 'unit' => 's'],
        'y' => (object) ['label' => 'y', 'unit' => 'm'],
        'series' => array_fill(0, 4, (object) ['label' => 'series']),
        'rows' => [],
    ];
    for ($i = 0; $i < 64; $i++) {
        $p->rows[] = (object) ['x' => $i, 'values' => [$i, -$i, $i / 2, $i / 3]];
    }
    $source = [];
    for ($j = 0; $j < 4; $j++) {
        $source[] = (object) [
            'id' => 'chart-' . $j,
            'component' => 'dense',
            'componentVersion' => '1.0.0',
            'params' => $p,
        ];
    }
    $raw = json_encode($source, JSON_THROW_ON_ERROR);
    $remaining = 262144;
    $chapters = [];
    $states = [];
    for ($i = 0; $i < 10; $i++) {
        $wire = mbb_component_projection_wire($raw, 'en', $remaining);
        if (
            $wire['bytes'] !== strlen($wire['data']) ||
            !hash_equals($wire['sha256'], hash('sha256', $wire['data']))
        ) {
            throw new RuntimeException('wire');
        }
        foreach (json_decode($wire['data']) as $item) {
            $states[] = $item->state;
        }
        $chapters[] = ['projectionPlan' => $wire];
    }
    $json = json_encode($chapters, JSON_THROW_ON_ERROR);
    $counts = array_count_values($states);
    $oneTree = mbb_sdk_chart_projection($p, ['locale' => 'en']);
    $oneTree['tree'] = array_map('mbb_projection_normalize', $oneTree['tree']);
    $complete = intdiv(262144, strlen(mbb_projection_json($oneTree)));
    if (
        ($counts['available'] ?? 0) !== $complete ||
        ($counts['unavailable'] ?? 0) !== 40 - $complete
    ) {
        throw new RuntimeException('Shared book budget');
    }
    $single = mbb_component_projection_plan($raw, 'en');
    if (count(array_filter($single, fn($v) => $v['state'] === 'available')) !== 4) {
        throw new RuntimeException('Ordinary complete diagrams');
    }
    echo json_encode([
        'php' => PHP_VERSION,
        'memoryLimit' => ini_get('memory_limit'),
        'chapters' => 10,
        'charts' => 40,
        'rows' => 64,
        'series' => 4,
        'states' => $counts,
        'remainingBytes' => $remaining,
        'manifestBytes' => strlen($json),
        'peakBytes' => memory_get_peak_usage(true),
    ]) . "\n";
    exit();
}
$d = [
    'contract' => 'mbb-component-projection/v1',
    'version' => '1.0.0',
    'render' => 'sdk_budget_renderer',
    'files' => [['file' => realpath(__FILE__), 'sha256' => hash_file('sha256', __FILE__)]],
];
if (!mbb_register_component_projection('budget', '1.0.0', $d)) {
    throw new RuntimeException('register');
}
$source = [];
for ($i = 0; $i < 10; $i++) {
    $source[] = (object) [
        'id' => 'item' . $i,
        'component' => 'budget',
        'componentVersion' => '1.0.0',
        'params' => (object) [],
    ];
}
$one = mbb_component_projection_plan(json_encode($source));
$two = mbb_component_projection_plan(json_encode($source));
if (mbb_projection_json($one) !== mbb_projection_json($two)) {
    throw new RuntimeException('Global budget leaked across document calls');
}
$states = array_count_values(array_column($one, 'state'));
if (($states['available'] ?? 0) !== 5 || ($states['unavailable'] ?? 0) !== 5) {
    throw new RuntimeException('Aggregate UTF8 bytes');
}
foreach (['legacy', 'missing', 'budget'] as $id) {
    $p = mbb_component_projection_plan(
        json_encode([
            (object) [
                'id' => 'item',
                'component' => $id,
                'componentVersion' => '1.0.0',
                'params' => (object) ['throw' => true],
            ],
        ]),
    );
    $expected = $id === 'legacy' ? 'author-fallback' : 'unavailable';
    if ($p[0]['state'] !== $expected) {
        throw new RuntimeException('Fallback state ' . $id);
    }
}
$file = tempnam(sys_get_temp_dir(), 'mbb-renderer-');
try {
    file_put_contents(
        $file,
        "<?php function sdk_temp_renderer(\$p,\$context){return ['schema'=>1,'tree'=>[]];}",
    );
    require $file;
    $f = realpath($file);
    if (
        !mbb_register_component_projection('temp', '1.0.0', [
            'contract' => 'mbb-component-projection/v1',
            'version' => '1.0.0',
            'render' => 'sdk_temp_renderer',
            'files' => [['file' => $f, 'sha256' => hash_file('sha256', $f)]],
        ])
    ) {
        throw new RuntimeException('temp register');
    }
    file_put_contents($file, "\n// changed", FILE_APPEND);
    if (mbb_component_projection_fingerprint('temp', '1.0.0') !== null) {
        throw new RuntimeException('Stale callback accepted');
    }
} finally {
    unlink($file);
}
foreach (
    [
        ['schema' => 1, 'tree' => [str_repeat('😀', 5000)]],
        ['schema' => 1, 'tree' => array_fill(0, 4097, 'x')],
        ['schema' => 1, 'tree' => array_fill(0, 10, str_repeat('x', 16384))],
    ]
    as $bad
) {
    try {
        mbb_projection_tree($bad);
        throw new LogicException('Budget admitted');
    } catch (RuntimeException $e) {
        if ($e instanceof LogicException) {
            throw $e;
        }
    }
}
// Reader fallback must not print parameter JSON or leave an empty legacy wrapper gap.
foreach (['author-fallback', 'unavailable'] as $state) {
    $doc = new DOMDocument('1.0', 'UTF-8');
    $doc->loadHTML(
        '<div id="root"><div id="fallback"><p>Complete authored explanation.</p></div></div>',
    );
    mbb_projection_insert($doc, $doc->getElementById('root'), [
        [
            'target' => 'fallback',
            'state' => $state,
            'projection' => null,
            'params' => (object) ['sentinel' => 'DO_NOT_PRINT'],
        ],
    ]);
    $html = $doc->saveHTML();
    if (
        !str_contains($html, 'Complete authored explanation.') ||
        str_contains($html, 'DO_NOT_PRINT') ||
        ($state === 'author-fallback' && str_contains($html, 'class="mbb-projection"'))
    ) {
        throw new RuntimeException('reader_fallback');
    }
}
echo "Projection planning: aggregate/reset, quiet legacy fallback, missing/error fallback, real changed callback file and hard budgets passed\n";
