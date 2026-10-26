<?php
// Reuse the actual controlled-map DOM/authority fixture; no WordPress write is performed.
require __DIR__ . '/relation-map-privacy.php';
$GLOBALS['privacy_owners'] = [2];
$GLOBALS['privacy_authorized'] = true;
$p->format = 'knowledge-map/v1';
$p->nodes[0]->role = 'concept';
$p->nodes[1]->role = 'practice';
$p->edges[0]->kind = 'explains';
$attrs['params'] = $p;
$attrs['component'] = 'knowledge-map';
$attrs['componentVersion'] = '0.1.0';
$source = mbb_component_json(['map' => $attrs]);
$block = '<!-- wp:mbb/component ' . mbb_component_json($attrs) . ' -->';
$legacy = mbb_relation_map_v2_stamp($block);
$stamp = mbb_controlled_map_stamp($block);
privacy_check($legacy !== $stamp, 'new format has separate controlled stamp');
$early = mbb_relation_map_v2_render($body, json_decode(mbb_component_json($attrs), true));
privacy_check(
    !str_contains($early, 'data-mbb-relation-notice'),
    'complete knowledge map has no unavailable notice',
);
privacy_check(
    str_contains($early, 'Explanation relationship') || str_contains($early, 'Explanation'),
    'knowledge static semantics',
);
privacy_check(
    !str_contains($early, 'Compare ideas'),
    'knowledge never receives old relationship legend',
);
privacy_check(str_contains($early, 'knowledge-map/public-v1'), 'new native reader branch');
$complete = mbb_component_static_document($early, $source, 'en');
privacy_check(
    !str_contains($complete, 'data-mbb-relation-notice'),
    'fresh complete knowledge projection has no unavailable notice',
);
foreach (['knowledge-map/v1', 'knowledge-map\\/v1', 'knowledge-map\\u002fv1'] as $format) {
    $escaped = str_replace('knowledge-map/v1', $format, $block);
    privacy_check(mbb_controlled_map_stamp($escaped) === $stamp, 'escaped knowledge format stamp');
}
$GLOBALS['privacy_authorized'] = false;
$final = mbb_component_static_document($early, $source, 'en');
privacy_check(
    str_contains($final, 'data-mbb-relation-notice'),
    'filtered knowledge map retains neutral notice',
);
foreach (
    [
        'PRIVATE_NODE_CANARY',
        'PRIVATE_DESCRIPTION_CANARY',
        'PRIVATE_WHY_CANARY',
        '123:旧文档',
        'RAW_CARRIER_CANARY',
        'private-semantic',
    ]
    as $canary
) {
    privacy_check(!str_contains($final, $canary), 'knowledge final filtering: ' . $canary);
}
privacy_check(mbb_controlled_map_stamp($block) !== $stamp, 'knowledge final revocation stamp');
privacy_check(
    str_contains($final, 'Author body') && str_contains($final, 'Public'),
    'knowledge surviving static body',
);
echo "Knowledge-map final privacy, static semantics and permission stamps passed.\n";
