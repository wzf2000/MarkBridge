<?php
// Extends the existing pure saved-pair/receipt model; no WordPress or database writes.
require __DIR__ . '/document-candidates.php';
function current_user_can(...$args)
{
    return $GLOBALS['allowed'];
}
function mbb_managed($id)
{
    return true;
}
function get_post_meta($id, $key, $single)
{
    return '';
}
function mbb_candidate($r)
{
    return [
        'document' => [
            'source' => $r['source'],
            'serialized' => 'candidate-blocks',
            'documentId' => 'TestDoc',
        ],
    ];
}
function mbb_convert($input)
{
    return $GLOBALS['native_verified'] ?? $input['base'];
}
require __DIR__ . '/../plugin/native-document-candidate.php';
function native_request($candidate, $expected = null)
{
    $r = new WP_REST_Request();
    $r->set_header('Content-Type', 'application/json');
    $r->set_body(
        json_encode([
            'mbb_expected' => $expected ?? $GLOBALS['snapshot']['expected'],
            'mbb_document_candidate' => $candidate,
        ]),
    );
    return $r;
}
$source = "\xef\xbb\xbfnative-literal-marker\r\n";
$proof = ['schema' => 1, 'sourceBase64' => base64_encode($source), 'receipt' => $d['receipt']];
$request = native_request($proof);
$exact = mbb_native_document_open($request, 1, $input['expected']);
dc_assert(is_array($exact) && $exact['source'] === $source, 'native exact-source open');
$review = new WP_REST_Request();
$candidate = mbb_native_document_candidate($review, 'actual native blocks', $exact);
dc_assert(
    is_array($candidate) && $candidate['document']['source'] === $source,
    'native candidate source preserved',
);
dc_assert(mbb_native_document_final($exact, 1) === true, 'native final unchanged authority');
$GLOBALS['native_verified'] = ['source' => 'normalized source', 'serialized' => 'candidate-blocks'];
dc_assert(
    is_wp_error(mbb_native_document_candidate($review, 'changed native blocks', $exact)),
    'no canonical fallback on mismatch',
);
unset($GLOBALS['native_verified']);
foreach (
    [
        array_merge($proof, ['extra' => 1]),
        array_replace($proof, ['schema' => '1']),
        array_replace($proof, ['sourceBase64' => base64_encode(str_repeat('x', 262145))]),
        array_replace($proof, ['sourceBase64' => base64_encode("\xff")]),
    ]
    as $invalid
) {
    $rejected = mbb_native_document_open(native_request($invalid), 1, $input['expected']);
    dc_assert(
        $rejected instanceof WP_Error && $rejected->status === 422,
        'native closed payload/type/source budget',
    );
}
$duplicate = native_request($proof);
$duplicate->set_body(
    '{"mbb_expected":"' .
        $input['expected'] .
        '","mbb_document_candidate":{"schema":1,"sourceBase64":"QQ==","receipt":"x","sourceB\\u0061se64":"Qg=="}}',
);
dc_assert(
    mbb_native_document_open($duplicate, 1, $input['expected'])->status === 422,
    'escaped duplicate native payload field',
);
$oversized = native_request($proof);
$oversized->set_body(str_repeat(' ', 1500001));
dc_assert(
    mbb_native_document_open($oversized, 1, $input['expected'])->status === 422,
    'native raw body budget',
);
$expired = $claims;
$expired['expires'] = time() - 1;
dc_assert(
    mbb_native_document_open(
        native_request(array_replace($proof, ['receipt' => mbb_document_tools_receipt($expired)])),
        1,
        $input['expected'],
    )->status === 409,
    'native expiry never falls back',
);
$expiredExact = $exact;
$expiredExact['claims']['expires'] = time() - 1;
dc_assert(
    mbb_native_document_final($expiredExact, 1)->status === 409,
    'receipt expires during native transaction',
);
$GLOBALS['snapshot']['document']['source'] = 'external baseline change';
dc_assert(
    mbb_native_document_open($request, 1, $input['expected'])->status === 409,
    'external baseline invalidates native attachment',
);
$GLOBALS['snapshot']['document']['source'] = "\xef\xbb\xbfA\r\n";
$GLOBALS['allowed'] = false;
dc_assert(mbb_native_document_final($exact, 1)->status === 403, 'native final permission lost');
$GLOBALS['allowed'] = true;
$GLOBALS['model_binding'] = 'changed';
dc_assert(mbb_native_document_final($exact, 1)->status === 409, 'native source binding changed');
unset($GLOBALS['model_binding']);
$GLOBALS['model_identity'] = ['namespace' => 'other', 'document' => 'other'];
dc_assert(
    mbb_native_document_candidate($review, 'native blocks', $exact)->status === 422,
    'native candidate identity change rejected',
);
unset($GLOBALS['model_identity']);
$GLOBALS['descriptors'] = [(object) ['component' => 'test', 'componentVersion' => '1.0.0']];
$GLOBALS['provider'] = [
    'status' => 'available',
    'resource' => ['file' => __FILE__, 'sha256' => hash_file('sha256', __FILE__)],
];
dc_assert(
    mbb_native_document_final($exact, 1)->status === 409,
    'original exact pins changed before native commit',
);
echo "native exact-source receipt model passed\n";
