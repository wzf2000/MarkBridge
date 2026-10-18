<?php
/** Raw request shape tests, without WordPress authentication/storage. */
function add_action(...$args) {}
function add_filter(...$args) {}
require dirname(__DIR__) . '/plugin/projections.php';
require dirname(__DIR__) . '/plugin/extensions.php';
foreach (['{"post_ids":[1,2]}', '{"post_ids":[999]}'] as $raw) {
    if (!mbb_extensions_usage_ids($raw)) {
        throw new RuntimeException('Valid IDs rejected');
    }
}
foreach (
    [
        '{}',
        '{"post_ids":[]}',
        '{"post_ids":{"0":836}}',
        '{"post_ids":[1],"post_ids":[2]}',
        '{"post_ids":[1],"extra":1}',
        '{"post_ids":[true]}',
        '{"post_ids":[1.0]}',
        '{"post_ids":[-1]}',
        '{"post_ids":["1"]}',
        '{"post_ids":[1,1]}',
        '{"post_ids":' . json_encode(range(1, 51)) . '}',
    ]
    as $raw
) {
    try {
        mbb_extensions_usage_ids($raw);
        throw new LogicException('Invalid raw request admitted: ' . $raw);
    } catch (InvalidArgumentException) {
    }
}
if (
    !mbb_register_extension_manifest('sample', [
        'version' => '0.1.0',
        'title' => 'Sample',
        'minMarkBridge' => '2.9.0-dev.1',
        'capabilities' => ['components'],
    ])
) {
    throw new RuntimeException('manifest');
}
if (
    mbb_register_extension_manifest('sample', [
        'version' => '0.1.0',
        'title' => 'Duplicate',
        'minMarkBridge' => '2.9.0-dev.1',
        'capabilities' => [],
    ])
) {
    throw new RuntimeException('override');
}
echo "Extension raw JSON and closed manifest contracts passed\n";

// Catalog status uses the same real plugin header and PHP comparison as components.
function mbb_references_fresh_user() {}
function get_current_user_id()
{
    return 1;
}
function current_user_can($cap)
{
    return true;
}
function mbb_component_registry()
{
    return [];
}
class WP_REST_Response
{
    public function __construct(public $data, public $status) {}
    public function header(...$args) {}
}
preg_match(
    '/^ \* Version: ([^ \r\n]+)/m',
    file_get_contents(dirname(__DIR__) . '/plugin/markdown-block-bridge.php'),
    $header,
);
$current = $header[1];
$base = explode('-', $current)[0];
$rc = (int) substr(strrchr($current, '.'), 1);
foreach (
    [
        $base . '-dev.1',
        '1.9.0',
        $base . '-rc.' . max(1, $rc - 1),
        $current,
        $base . '-rc.' . ($rc + 1),
        $base,
        '99.0.0-rc.1',
    ]
    as $i => $floor
) {
    $id = 'floor-' . $i;
    if (
        !mbb_register_extension_manifest($id, [
            'version' => '0.1.0',
            'title' => 'Floor test',
            'minMarkBridge' => $floor,
            'capabilities' => [],
        ])
    ) {
        throw new RuntimeException('RC floor registration');
    }
    $expected = version_compare($current, $floor, '<') ? 'version-incompatible' : 'available';
    if (mbb_extensions_catalog()->data['extensions'][$id]['status'] !== $expected) {
        throw new RuntimeException('RC catalog status');
    }
}
foreach (
    [
        '2.9.0-rc',
        '2.9.0-rc.x',
        '2.9.0-rc.1.extra',
        '2.9.0-beta.1',
        '2.9.0-RC.1',
        '2.9.0+meta',
        "2.9.0-rc.1\n",
    ]
    as $floor
) {
    if (
        mbb_register_extension_manifest('bad-floor', [
            'version' => '0.1.0',
            'title' => 'Bad',
            'minMarkBridge' => $floor,
            'capabilities' => [],
        ])
    ) {
        throw new RuntimeException('Unknown minimum suffix accepted');
    }
}
echo "Minimum stable/dev/RC registration and real catalog version comparison passed\n";
