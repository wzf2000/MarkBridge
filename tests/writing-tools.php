<?php
// Pure same-source template instantiation and both conversion paths; no WordPress DB.
require dirname(__DIR__) . '/plugin/writing-patterns.php';
require dirname(__DIR__) . '/plugin/includes/php-converter/Worker.php';
function writing_assert($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
$first = mbb_instantiate_writing_pattern('lesson', 'first-pattern');
$second = mbb_instantiate_writing_pattern('lesson', 'second-pattern');
$source = $first . "\n" . $second;
writing_assert(!str_contains($source, '{{instance}}'), 'template tokens instantiated');
foreach (['first-pattern', 'second-pattern'] as $id) {
    writing_assert(str_contains($source, '"id":"' . $id . '-equation"'), 'independent equation ID');
    writing_assert(
        str_contains($source, 'data-mbb-target="' . $id . '-equation"'),
        'internal reference mapped',
    );
}
$pair = \MarkBridge\Probe\Worker::convert([
    'mode' => 'markdown',
    'source' => $source,
    'documentId' => 'writing-pattern',
]);
writing_assert($pair['ok'], json_encode($pair));
$doc = $pair['document'];
writing_assert(
    \MarkBridge\Probe\Worker::convert([
        'mode' => 'paired_restore',
        'source' => $source,
        'serialized' => $doc['serialized'],
        'documentId' => 'writing-pattern',
    ])['ok'],
    'paired reopen',
);
$native = \MarkBridge\Probe\Worker::convert([
    'mode' => 'blocks',
    'serialized' => $doc['serialized'],
    'documentId' => 'writing-pattern',
    'base' => $doc,
]);
writing_assert($native['ok'], json_encode($native));
writing_assert(
    $native['document']['serialized'] === $doc['serialized'],
    'native conversion retains paired structure',
);
echo "Writing pattern independent identities and PHP native/Markdown conversion OK\n";
