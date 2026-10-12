<?php
define('ABSPATH', __DIR__);
class WP_Error
{
    public function __construct(public $code, public $message, public $data) {}
}
require __DIR__ . '/../plugin/includes/conversion-errors.php';
function assert_position($condition)
{
    if (!$condition) {
        throw new RuntimeException('Conversion diagnostic boundary failed');
    }
}
assert_position(
    mbb_conversion_position('line:3') === ['kind' => 'source', 'line' => 3, 'scope' => 'block'],
);
assert_position(
    mbb_conversion_location_label(mbb_conversion_position('blocks[1][2].attributes.align')) ===
        '第 2 → 3 个区块，属性 align',
);
assert_position(
    mbb_conversion_position('serialized:7') === ['kind' => 'serialized', 'offset' => 7],
);
foreach (
    [
        '/srv/private/source.md',
        'line:0',
        'blocks[0].attributes.<private>',
        str_repeat('blocks[0]', 100),
    ]
    as $untrusted
) {
    assert_position(mbb_conversion_position($untrusted) === []);
}
foreach (
    [
        'UNSUPPORTED_BLOCK',
        'ROUNDTRIP',
        'FOOTNOTE_MISSING',
        'UNCLOSED_MATH',
        'UNSAFE_URL',
        'INPUT_LIMIT',
    ]
    as $code
) {
    $hint = mbb_conversion_hint($code);
    assert_position(
        $hint !== '' && !str_contains($hint, 'https:') && !str_contains($hint, '/srv/'),
    );
}

$failure = mbb_conversion_failure([
    'code' => 'BLOCK_ATTRIBUTES',
    'message' => 'Unsupported attribute',
    'location' => 'blocks[1].attributes.align',
]);
assert_position($failure->code === 'BLOCK_ATTRIBUTES' && $failure->data['status'] === 422);
assert_position($failure->data['conversion_code'] === 'BLOCK_ATTRIBUTES');
assert_position(
    $failure->data['position'] === ['kind' => 'block', 'path' => [1], 'attribute' => 'align'],
);
assert_position(str_contains($failure->message, '第 2 个区块，属性 align'));
$failure = mbb_conversion_failure([
    'code' => '/srv/private',
    'message' => 'Generic failure',
    'location' => '/srv/private',
]);
assert_position(
    $failure->data['conversion_code'] === 'CONVERSION' &&
        $failure->data['location'] === '' &&
        $failure->data['position'] === [],
);

foreach (['UNSUPPORTED_BLOCK', 'INPUT_LIMIT', 'FOOTNOTE_MISSING', 'CONVERSION'] as $code) {
    $failure = mbb_conversion_failure(['code' => $code]);
    assert_position($failure->code === $code && $failure->data['conversion_code'] === $code);
}
foreach (
    [
        [],
        ['code' => null],
        ['code' => '/srv/private'],
        ['code' => 'lowercase'],
        ['code' => 7],
        ['code' => str_repeat('A', 65)],
    ]
    as $result
) {
    $failure = mbb_conversion_failure($result);
    assert_position(
        $failure->code === 'conversion' && $failure->data['conversion_code'] === 'CONVERSION',
    );
}
echo "Public error coordinates, hints and worker error-code compatibility passed.\n";
