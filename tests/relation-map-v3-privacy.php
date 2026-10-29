<?php
/** Reuse the explicit fake authority from the v2 regression; no real database. */
ob_start();
require __DIR__ . '/relation-map-privacy.php';
ob_end_clean();
$GLOBALS['privacy_authorized'] = true;
$GLOBALS['privacy_owners'] = [2];
$p->format = 'relation-map/v3';
$p->groups[] = (object) ['id' => 'private-group-canary', 'title' => 'PRIVATE_GROUP_CANARY'];
$p->nodes[1]->group = 'private-group-canary';
$p->display = (object) ['mobileStart' => (object) ['kind' => 'node', 'id' => 'private-semantic']];
$attrs['componentVersion'] = '0.3.0';
$attrs['params'] = $p;
$view = mbb_relation_map_v2_view($p, 'controlled-v3');
privacy_check(
    mbb_relation_map_v3_public_display($view['display'], $view['map']),
    'authorized opaque display',
);
privacy_check(
    $view['display']['mobileStart']['id'] === $view['map']->nodes[1]->id,
    'node hint follows emitted node',
);
privacy_check($view['edgeIds'][0] !== 'edge-semantic', 'edge identity is opaque');
$early = mbb_relation_map_v2_render($body, json_decode(mbb_component_json($attrs), true));
$source = mbb_component_json(['map' => $attrs]);
$block = '<!-- wp:mbb/component ' . mbb_component_json($attrs) . ' -->';
$stamp = mbb_relation_map_v2_stamp($block);
$GLOBALS['privacy_authorized'] = false;
$view = mbb_relation_map_v2_view($p, 'controlled-v3');
privacy_check(
    $view['display']['mobileStart'] === null,
    'revoked hint falls back without semantic ID',
);
privacy_check(
    count($view['map']->nodes) === 1 && count($view['map']->groups) === 1 && !$view['edgeIds'],
    'revoked node/group/edges removed together',
);
privacy_check(mbb_relation_map_v2_stamp($block) !== $stamp, 'v3 stamp responds to revocation');
$final = mbb_component_static_document($early, $source, 'en');
foreach (
    [
        'PRIVATE_NODE_CANARY',
        'PRIVATE_GROUP_CANARY',
        'PRIVATE_DESCRIPTION_CANARY',
        'PRIVATE_WHY_CANARY',
        'private-semantic',
        'private-group-canary',
        'edge-semantic',
        '123:旧文档',
    ]
    as $secret
) {
    privacy_check(!str_contains($final, $secret), 'v3 final removes ' . $secret);
}
privacy_check(str_contains($final, 'relation-map/public-v3'), 'final v3 public envelope');
$p->display->mobileStart = (object) ['kind' => 'group', 'id' => 'private-group-canary'];
$view = mbb_relation_map_v2_view($p, 'controlled-v3');
privacy_check($view['display']['mobileStart'] === null, 'hidden group hint fallback');
$GLOBALS['privacy_authorized'] = true;
$view = mbb_relation_map_v2_view($p, 'controlled-v3');
privacy_check(
    mbb_relation_map_v3_public_display($view['display'], $view['map']),
    'visible group opaque hint',
);
$changed = clone $p;
$changed->display = (object) ['mobileStart' => (object) ['kind' => 'auto', 'id' => '']];
privacy_check(
    mbb_component_json(mbb_relation_map_v2_view($changed, 'controlled-v3')) !==
        mbb_component_json($view),
    'display affects complete public projection fingerprint',
);
echo "v3 display and edge identities respect final authorization, static output and export stamps.\n";
// A legal small author graph can expand beyond 16KiB after opaque public identities.
$dense = (object) [
    'format' => 'relation-map/v3',
    'title' => 'Dense public map',
    'groups' => [(object) ['id' => 'dense-group', 'title' => 'Group']],
    'nodes' => [],
    'edges' => [],
    'display' => (object) ['mobileStart' => (object) ['kind' => 'auto', 'id' => '']],
];
for ($i = 0; $i < 16; $i++) {
    $dense->nodes[] = (object) [
        'id' => 'n' . $i,
        'group' => 'dense-group',
        'title' => 'Article ' . $i,
        'description' => 'Reader details for this article and its relationship.',
        'target' => clone $p->nodes[0]->target,
    ];
}
for ($from = 0; $from < 16 && count($dense->edges) < 128; $from++) {
    for ($to = 0; $to < 16 && count($dense->edges) < 128; $to++) {
        if ($from !== $to) {
            $dense->edges[] = (object) [
                'id' => 'e' . count($dense->edges),
                'from' => 'n' . $from,
                'to' => 'n' . $to,
                'kind' => 'recommended',
            ];
        }
    }
}
privacy_check(mbb_relation_map_v3_valid($dense), 'dense legal author contract');
$denseView = mbb_relation_map_v2_view($dense, 'dense-public');
privacy_check(
    $denseView['map'] !== null && count($denseView['map']->edges) === 128,
    'dense public map survives HMAC expansion',
);
privacy_check(
    strlen(mbb_component_json($denseView['map'])) > 16384 &&
        !mbb_relation_map_valid($denseView['map']),
    'dense public map is above the unchanged legacy bound',
);
$attrs['params'] = $dense;
$source = mbb_component_json(['map' => $attrs]);
$early = mbb_relation_map_v2_render($body, json_decode(mbb_component_json($attrs), true));
$final = mbb_component_static_document($early, $source, 'en');
$doc = new DOMDocument();
@$doc->loadHTML($final);
$xp = new DOMXPath($doc);
privacy_check(
    $xp->query('//*[@data-mbb-edge-id]')->length === 128,
    'final dense no-script projection preserves every edge identity',
);
echo "Dense 128-edge v3 author graph survives current-request HMAC projection and complete final fallback above legacy 16KiB.\n";
