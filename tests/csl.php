<?php
require dirname(__DIR__) . '/plugin/csl.php';
mbb_csl_library();
use MarkBridge\Probe\Bibliography;
$fixture = json_decode(
    file_get_contents(__DIR__ . '/fixtures/csl.json'),
    true,
    64,
    JSON_THROW_ON_ERROR,
);
$results = [];
foreach ($fixture['cases'] as $c) {
    try {
        $report = mbb_csl_parse($c['input'], $c['keyMap'] ?? []);
        $result = [
            'report' => $report,
            'projection' => array_map(Bibliography::projection(...), $report['entries']),
            'export' => mbb_csl_export($report['entries']),
        ];
    } catch (Throwable $e) {
        $result = ['error' => $e->errorCode ?? 'ERROR'];
    }
    if (!empty($c['reject']) && !isset($result['error'])) {
        throw new RuntimeException('Accepted invalid fixture: ' . $c['name']);
    }
    if (empty($c['reject']) && isset($result['error'])) {
        throw new RuntimeException(
            'Rejected valid fixture: ' . $c['name'] . ':' . json_encode($result),
        );
    }
    $results[$c['name']] = $result;
}
$a = mbb_csl_parse('[{"id":"A","type":"book","title":"A"}]');
$b = mbb_csl_parse('[{"id":"B","type":"book","title":"B","abstract":"Not retained"}]');
foreach (
    [
        [$a['entries'], $b, 'merge', [], false, true],
        [$a['entries'], $a, 'merge', [], true, true],
        [$a['entries'], $b, 'replace', ['A'], true, true],
    ]
    as $args
) {
    try {
        mbb_csl_candidate(...$args);
        throw new LogicException('Unsafe candidate accepted');
    } catch (LogicException $e) {
        throw $e;
    } catch (Throwable) {
    }
}
if (count(mbb_csl_candidate($a['entries'], $b, 'merge', [], true, true)) !== 2) {
    throw new RuntimeException('Explicit loss acknowledgement failed');
}
foreach (
    [
        str_repeat(' ', 65537),
        '[' . str_repeat('[', 17) . '0' . str_repeat(']', 17) . ']',
        json_encode(array_fill(0, 65, ['id' => 'A', 'type' => 'book', 'title' => 'T'])),
    ]
    as $input
) {
    try {
        mbb_csl_parse($input);
        throw new LogicException('Budget accepted');
    } catch (LogicException $e) {
        throw $e;
    } catch (Throwable) {
    }
}
$old = [
    [
        'key' => 'Old',
        'authors' => ['Ludwig van Beethoven', '研究机构'],
        'title' => 'T',
        'year' => 'Spring 2026',
        'source' => 'Legacy literal source',
        'url' => '',
    ],
];
$new = Bibliography::migrate($old);
if (
    $new[0]['authors'] !== [['literal' => 'Ludwig van Beethoven'], ['literal' => '研究机构']] ||
    $new[0]['source'] !== $old[0]['source'] ||
    $new[0]['issued'] !== ['literal' => 'Spring 2026']
) {
    throw new RuntimeException('Migration guessed or lost legacy data');
}
echo in_array('--json', $argv ?? [], true)
    ? json_encode($results, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    : "Bounded CSL-JSON subset, explicit losses, key conflicts, date/name validation and literal migration passed.\n";
