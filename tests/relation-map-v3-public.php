<?php
require dirname(__DIR__) . '/plugin/relation-map.php';
$input = json_decode(stream_get_contents(STDIN), false, 32, JSON_THROW_ON_ERROR);
$doc = new DOMDocument('1.0', 'UTF-8');
$root = $doc->createElement('section');
$doc->appendChild($root);
mbb_relation_map_append(
    $doc,
    $root,
    mbb_relation_map_envelope($input->map, 'en', 65536),
    null,
    $input->edgeIds,
    65536,
);
$xp = new DOMXPath($doc);
$badIdsRejected = false;
try {
    mbb_relation_map_append(
        $doc,
        $root,
        mbb_relation_map_envelope($input->map, 'en', 65536),
        null,
        [],
        65536,
    );
} catch (Throwable) {
    $badIdsRejected = true;
}
echo json_encode([
    'legacy' => mbb_relation_map_valid($input->map),
    'public' => mbb_relation_map_valid($input->map, 65536),
    'staticEdges' => $xp->query('//*[@data-mbb-edge-id]')->length,
    'oversized' => mbb_relation_map_valid($input->oversized, 65536),
    'badIdsRejected' => $badIdsRejected,
]);
