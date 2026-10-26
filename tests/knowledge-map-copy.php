<?php
// Structural identity-copy contract; no database or article writes.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
require __DIR__ . '/../plugin/references-data.php';
function parse_blocks($serialized)
{
    return json_decode($serialized, true);
}
function serialize_blocks($blocks)
{
    return json_encode($blocks);
}
function is_wp_error($value)
{
    return false;
}
function mbb_convert($input)
{
    return $input['mode'] === 'markdown'
        ? ['serialized' => $input['source'], 'documentId' => 'ReferenceCandidate']
        : ['source' => $input['serialized']];
}
$old = ['namespace' => 'S_' . str_repeat('a', 32), 'document' => 'D_' . str_repeat('b', 32)];
$new = ['namespace' => 'S_' . str_repeat('c', 32), 'document' => 'D_' . str_repeat('d', 32)];
$nodes = [];
foreach (['document', 'step', 'activity'] as $kind) {
    $nodes[] = [
        'target' => ['kind' => $kind] + $old + ($kind === 'document' ? [] : ['target' => 'stable']),
    ];
}
$nodes[] = [
    'target' => [
        'kind' => 'local-document',
        'site' => $old['namespace'],
        'documentId' => 'old-local-id',
    ],
];
$serialized = json_encode([
    [
        'blockName' => 'mbb/component',
        'attrs' => ['params' => ['format' => 'knowledge-map/v1', 'nodes' => $nodes]],
        'innerContent' => [],
        'innerBlocks' => [],
    ],
]);
$copy = json_decode(mbb_references_replace_tuple($serialized, $old, $new), true);
foreach (array_slice($copy[0]['attrs']['params']['nodes'], 0, 3) as $i => $node) {
    if (
        $node['target']['namespace'] !== $new['namespace'] ||
        $node['target']['document'] !== $new['document'] ||
        $node['target']['kind'] !== $nodes[$i]['target']['kind'] ||
        ($node['target']['target'] ?? null) !== ($nodes[$i]['target']['target'] ?? null)
    ) {
        throw new RuntimeException('portable tuple copy');
    }
}
if ($copy[0]['attrs']['params']['nodes'][3] !== $nodes[3]) {
    throw new RuntimeException('local identity must remain local');
}
echo "Knowledge-map identity tuple copy passed.\n";
