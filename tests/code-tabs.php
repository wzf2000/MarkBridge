<?php
// Pure conversion contracts; no WordPress DB/content access.
require dirname(__DIR__) . '/plugin/includes/php-converter/Worker.php';
function ct_assert($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
$fixtures = json_decode(
    file_get_contents(__DIR__ . '/fixtures/code-tabs.json'),
    true,
    32,
    JSON_THROW_ON_ERROR,
);
foreach ($fixtures as $i => $fixture) {
    $doc = \MarkBridge\Probe\Worker::convert([
        'mode' => 'markdown',
        'source' => $fixture['source'],
        'documentId' => 'php-tabs-' . $i,
    ]);
    ct_assert($doc['ok'], json_encode($doc));
    $doc = $doc['document'];
    ct_assert(
        \MarkBridge\Probe\Worker::convert([
            'mode' => 'paired_restore',
            'source' => $fixture['source'],
            'serialized' => $doc['serialized'],
            'documentId' => $doc['documentId'],
        ])['ok'],
        'Original paired restore failed',
    );
    preg_match('/<!-- wp:mbb\/code-tabs (\{.*?\}) -->/s', $doc['serialized'], $match);
    $attrs = json_decode($match[1], true, 32, JSON_THROW_ON_ERROR);
    ct_assert(count($attrs['tabs']) === count($fixture['tabs']), 'Version count changed');
    foreach ($fixture['tabs'] as $index => $tab) {
        foreach ($tab as $key => $value) {
            ct_assert(
                $attrs['tabs'][$index][$key] === $value,
                'Original ' . $key . ' bytes changed',
            );
        }
    }
    ct_assert(
        \MarkBridge\Probe\Worker::convert([
            'mode' => 'markdown',
            'source' => $doc['source'],
            'documentId' => $doc['documentId'],
        ])['document']['serialized'] === $doc['serialized'],
        'Canonical reimport changed code',
    );
}
echo "Code tabs PHP exact paired conversion contracts passed.\n";
