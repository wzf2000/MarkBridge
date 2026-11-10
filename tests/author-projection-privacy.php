<?php
/** Final author preview uses the same fresh privacy plan as frontend, never a saved projection. */
ob_start();
require __DIR__ . '/knowledge-map-privacy.php';
ob_end_clean();
function mbb_permission($request)
{
    return true;
}
function is_wp_error($value)
{
    return false;
}
function do_blocks($serialized)
{
    return $GLOBALS['author_projection_html'];
}
function mbb_render_footnotes($html)
{
    return $html;
}
function mbb_render_technical($html)
{
    return $html;
}
require dirname(__DIR__) . '/plugin/preview-navigation.php';
$GLOBALS['author_projection_html'] = $early;
$document = ['source' => 'Original source', 'serialized' => $block];
$projected = ['source' => 'Resource-projected source', 'serialized' => $block];
$before = serialize([$document, $projected]);
$preview = MBB_Author_Preview::render(null, $document, $projected);
privacy_check($preview['navigation'] === null, 'resource rewrite kept original source offsets');
foreach (
    [
        'PRIVATE_NODE_CANARY',
        'PRIVATE_DESCRIPTION_CANARY',
        'PRIVATE_WHY_CANARY',
        'RAW_CARRIER_CANARY',
        'private-semantic',
        'PRIVATE_BODY',
    ]
    as $canary
) {
    privacy_check(!str_contains($preview['html'], $canary), 'author preview leaked ' . $canary);
}
privacy_check(
    str_contains($preview['html'], 'Public') && str_contains($preview['html'], 'Author body'),
    'author preview lost readable content',
);
privacy_check(serialize([$document, $projected]) === $before, 'preview changed candidate pair');
privacy_check(!markbridge_is_author_preview(), 'author projection leaked trusted scope');
echo "Author preview final projection respects revoked reference privacy and candidate bytes.\n";
