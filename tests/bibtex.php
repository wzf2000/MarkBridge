<?php
// Optional read-only validator from an explicitly selected prepared converter.
if (($validator = getenv('MARKBRIDGE_TEST_PHP_CONVERTER')) !== false && $validator !== '') {
    require_once $validator;
}
require dirname(__DIR__) . '/plugin/bibtex.php';
function bibtex_result(string $source): array
{
    try {
        return ['entries' => mbb_bibtex_parse($source)];
    } catch (Throwable $e) {
        return ['error' => $e->errorCode ?? 'ERROR'];
    }
}
$fixture = json_decode(
    file_get_contents(__DIR__ . '/fixtures/bibtex.json'),
    true,
    64,
    JSON_THROW_ON_ERROR,
);
$results = [];
foreach ($fixture['cases'] as $case) {
    $r = bibtex_result($case['input']);
    $results[$case['name']] = $r;
    if (isset($case['entries']) && ($r['entries'] ?? null) !== $case['entries']) {
        throw new RuntimeException('PHP mapping differs: ' . $case['name'] . ':' . json_encode($r));
    }
    if (isset($case['reject']) && !isset($r['error'])) {
        throw new RuntimeException('PHP accepted: ' . $case['name']);
    }
}
foreach (
    [
        str_repeat(' ', 65537),
        implode('', array_map(fn($i) => '@misc{A' . $i . ',title={A}}', range(0, 64))),
        '@misc{A,title={' . str_repeat('{', 17) . 'A' . str_repeat('}', 17) . '}}',
        "\xff",
    ]
    as $source
) {
    if (!isset(bibtex_result($source)['error'])) {
        throw new RuntimeException('PHP accepted input outside limits');
    }
}
if (
    count(
        mbb_bibtex_parse(
            implode('', array_map(fn($i) => '@misc{A' . $i . ',title={A}}', range(0, 63))),
        ),
    ) !== 64
) {
    throw new RuntimeException('PHP 64-entry boundary failed');
}
$a = mbb_bibtex_parse('@misc{A,title={A}}');
$b = mbb_bibtex_parse('@misc{B,title={B}}');
if (count(mbb_bibtex_candidate($a, $b, 'merge', ['A'])) !== 2) {
    throw new RuntimeException('PHP merge failed');
}
if (mbb_bibtex_candidate($a, $b, 'replace', []) !== $b) {
    throw new RuntimeException('PHP replacement failed');
}
foreach ([[$a, $a, 'merge', []], [$a, $b, 'replace', ['A']], [$a, $b, 'unknown', []]] as $args) {
    try {
        mbb_bibtex_candidate(...$args);
        throw new LogicException('Unsafe candidate accepted');
    } catch (Throwable $e) {
        if ($e instanceof LogicException) {
            throw $e;
        }
    }
}
if (($argv[1] ?? '') === '--json') {
    echo json_encode($results, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    return;
}
echo 'BibTeX PHP: ' .
    count($fixture['cases']) .
    " shared cases, budgets and explicit candidate safety passed\n";
