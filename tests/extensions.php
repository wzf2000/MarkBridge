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
