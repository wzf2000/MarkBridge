<?php
/** Pure shared-fixture tests and a stdin adapter for Node/PHP parity. */
require dirname(__DIR__) . '/plugin/source-navigation.php';
if (($argv[1] ?? '') === '--map') {
    $input = json_decode(stream_get_contents(STDIN), true, 64, JSON_THROW_ON_ERROR);
    echo json_encode(
        mbb_source_navigation($input['source'], $input['blocks']),
        JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE,
    );
    exit();
}
$fixtures = json_decode(
    file_get_contents(__DIR__ . '/fixtures/source-navigation.json'),
    true,
    64,
    JSON_THROW_ON_ERROR,
);
$count = 0;
foreach ($fixtures['cases'] as $case) {
    $before = json_encode($case['blocks']);
    $actual = mbb_source_navigation($case['source'], $case['blocks']);
    if ($actual !== $case['expected']) {
        throw new RuntimeException(
            $case['id'] . ': ' . json_encode($actual, JSON_UNESCAPED_UNICODE),
        );
    }
    if ($before !== json_encode($case['blocks'])) {
        throw new RuntimeException('Input mutation');
    }
    $count++;
}
$manySource = implode("\n\n", array_fill(0, 2050, 'Text.')) . "\n";
$manyBlocks = array_fill(0, 2050, ['blockName' => 'core/paragraph']);
$capped = mbb_source_navigation($manySource, $manyBlocks);
if (
    count($capped['ranges']) !== 2048 ||
    $capped['ranges'][2047]['id'] !== 'r2047' ||
    !in_array('structure-limit', array_column($capped['unmapped'], 'reason'), true)
) {
    throw new RuntimeException('Response range budget');
}
$invalid = mbb_source_navigation("bad\0source", []);
if ($invalid['ranges'] || $invalid['unmapped'][0]['reason'] !== 'invalid-input') {
    throw new RuntimeException('Invalid input must fail without a mapping');
}
echo "Source navigation PHP: $count shared fixtures passed\n";
