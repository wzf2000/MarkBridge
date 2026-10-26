<?php
// Pure receipt and optimistic baseline model. Not a WordPress permission integration pass.
function add_action(...$args) {}
function add_filter(...$args) {}
function mbb_t($s)
{
    return $s;
}
function wp_salt($s)
{
    return 'synthetic-secret';
}
function get_current_user_id()
{
    return $GLOBALS['actor'];
}
function get_current_blog_id()
{
    return 1;
}
function mbb_resource_site()
{
    return 'synthetic-site';
}
function wp_get_session_token()
{
    return $GLOBALS['session'];
}
function mbb_component_json($v)
{
    return json_encode($v);
}
function mbb_references_fresh_user() {}
function mbb_references_fresh_post($id) {}
function mbb_references_projection($s)
{
    return ['identity' => null];
}
function mbb_binding_projection($p)
{
    return 'binding';
}
function get_post($id)
{
    return (object) ['ID' => $id];
}
function mbb_merge_current($id, $expected)
{
    if (!$GLOBALS['allowed'] || $expected !== $GLOBALS['snapshot']['expected']) {
        throw new RuntimeException('denied');
    }
    return $GLOBALS['snapshot'];
}
function mbb_merge_assert_current($s, $id) {}
function mbb_component_descriptors($s)
{
    return $GLOBALS['descriptors'];
}
function mbb_component_provider($id, $v)
{
    return $GLOBALS['provider'];
}
function markbridge_teaching_component_fingerprint($id, $p)
{
    return hash('sha256', json_encode($p));
}
function mbb_component_projection_fingerprint($id, $v)
{
    return 'projection';
}
function mbb_preview($r)
{
    $GLOBALS['previews']++;
    return [
        'before' => $GLOBALS['snapshot']['document']['source'],
        'html' => '<p>safe</p>',
        'document' => ['serialized' => 'blocks-next', 'source' => $r['source']],
    ];
}
function mbb_error($code, $message, $status = 409)
{
    return new WP_Error($code, $status);
}
function is_wp_error($v)
{
    return $v instanceof WP_Error;
}
class WP_Error
{
    public function __construct(public string $code, public int $status = 409) {}
}
class WP_REST_Request extends ArrayObject
{
    public function __construct(...$args)
    {
        parent::__construct([]);
    }
    private string $body = '';
    private string $contentType = '';
    public function set_body(string $body)
    {
        $this->body = $body;
    }
    public function get_body()
    {
        return $this->body;
    }
    public function set_header($key, $value)
    {
        $this->contentType = $value;
    }
    public function is_json_content_type()
    {
        return $this->contentType === 'application/json';
    }
    public function set_param($k, $v)
    {
        $this[$k] = $v;
    }
}
class WP_REST_Response
{
    public function __construct(public $data) {}
    public function header(...$args) {}
}
require __DIR__ . '/../plugin/document-candidates.php';
function dc_assert($v, $message)
{
    if (!$v) {
        throw new RuntimeException($message);
    }
}
function dc_raw_request(
    string $body,
    bool $preview = false,
    array $overrides = [],
    string $type = 'application/json',
) {
    $request = new WP_REST_Request();
    $request->set_body($body);
    $request->set_header('Content-Type', $type);
    foreach ($overrides as $key => $value) {
        $request->set_param($key, $value);
    }
    return mbb_document_tools_request($request, $preview);
}
function dc_request(array $data, bool $preview)
{
    return dc_raw_request(json_encode($data, JSON_THROW_ON_ERROR), $preview);
}
$GLOBALS['actor'] = 7;
$GLOBALS['session'] = 'session-a';
$GLOBALS['allowed'] = true;
$GLOBALS['descriptors'] = [];
$GLOBALS['previews'] = 0;
$GLOBALS['snapshot'] = [
    'expected' => str_repeat('a', 64),
    'source_managed' => false,
    'document' => [
        'documentId' => 'TestDoc',
        'source' => "\xef\xbb\xbfA\r\n",
        'serialized' => 'blocks',
    ],
];
$input = ['post_id' => 1, 'expected' => $GLOBALS['snapshot']['expected']];
$capture = dc_request($input, false);
dc_assert($capture instanceof WP_REST_Response, 'capture');
$d = $capture->data;
dc_assert($d['source'] === "\xef\xbb\xbfA\r\n", 'exact original bytes');
$claims = mbb_document_tools_verify($d['receipt']);
dc_assert(
    !str_contains(json_encode($claims), 'blocks') && !str_contains(json_encode($claims), 'A\\r'),
    'receipt has no body',
);
$preview = $input + ['receipt' => $d['receipt'], 'source' => 'B'];
dc_assert(dc_request($preview, true) instanceof WP_REST_Response, 'preview');
$GLOBALS['session'] = 'session-b';
dc_assert(is_wp_error(dc_request($preview, true)), 'session invalidated');
$GLOBALS['session'] = 'session-a';
$GLOBALS['allowed'] = false;
dc_assert(is_wp_error(dc_request($preview, true)), 'permission invalidated');
$GLOBALS['allowed'] = true;
$GLOBALS['snapshot']['document']['source'] = 'changed';
dc_assert(is_wp_error(dc_request($preview, true)), 'body invalidated');
$GLOBALS['snapshot']['document']['source'] = "\xef\xbb\xbfA\r\n";
$expired = $claims;
$expired['expires'] = time() - 1;
dc_assert(
    is_wp_error(
        dc_request(
            array_replace($preview, ['receipt' => mbb_document_tools_receipt($expired)]),
            true,
        ),
    ),
    'expired',
);
dc_assert(
    is_wp_error(dc_request(array_replace($preview, ['receipt' => $d['receipt'] . 'x']), true)),
    'tampered',
);
dc_assert(
    is_wp_error(dc_request(array_replace($preview, ['source' => str_repeat('x', 262145)]), true)),
    'source budget',
);
$GLOBALS['descriptors'] = [(object) ['component' => 'test', 'componentVersion' => '1.0.0']];
$GLOBALS['provider'] = [
    'status' => 'available',
    'resource' => ['file' => __FILE__, 'sha256' => hash_file('sha256', __FILE__)],
];
$withPin = dc_request($input, false);
dc_assert($withPin instanceof WP_REST_Response, 'pinned capture');
$GLOBALS['provider']['schema'] = ['changed' => true];
dc_assert(
    is_wp_error(
        dc_request(array_replace($preview, ['receipt' => $withPin->data['receipt']]), true),
    ),
    'original provider pin changed',
);
$GLOBALS['provider']['resource']['sha256'] = str_repeat('0', 64);
dc_assert(is_wp_error(dc_request($input, false)), 'actual resource mismatch');
$GLOBALS['descriptors'] = [];
foreach (
    [
        json_encode($input + ['unknown' => true]),
        json_encode($input + ['source' => 'capture cannot accept a body']),
        '[]',
        '{}',
        'null',
        '"scalar"',
        '{',
        json_encode(array_replace($input, ['post_id' => '1'])),
        json_encode(array_replace($input, ['expected' => []])),
        '{"post_id":1,"expected":"' . $input['expected'] . '","post_id":1}',
        '{"post_id":{"nested":["ignored"]},"expected":"' . $input['expected'] . '","post_id":1}',
        '{"post_id":1,"expected":"' . $input['expected'] . '","post\\u005fid":1}',
        '{"post_id":1,"expected":"' . $input['expected'] . '","source":"' . "\xff" . '"}',
    ]
    as $raw
) {
    $error = dc_raw_request($raw);
    dc_assert(
        $error instanceof WP_Error && $error->status === 422,
        'invalid raw capture must be 422',
    );
}
$error = dc_raw_request(json_encode($preview + ['resource_import' => []]), true);
dc_assert($error instanceof WP_Error && $error->status === 422, 'unknown preview field');
$error = dc_raw_request(
    'post_id=1&expected=' . $input['expected'],
    false,
    $input,
    'application/x-www-form-urlencoded',
);
dc_assert($error instanceof WP_Error && $error->status === 422, 'form body rejected');
$override = dc_raw_request(json_encode($input), false, [
    'post_id' => 999,
    'expected' => 'query-override',
    'source' => 'query-source',
]);
dc_assert(
    $override instanceof WP_REST_Response &&
        $override->data['source'] === $GLOBALS['snapshot']['document']['source'],
    'query parameters cannot override JSON',
);
$previewOverride = dc_raw_request(json_encode($preview), true, [
    'post_id' => 999,
    'expected' => 'override',
    'source' => 'override',
]);
dc_assert(
    $previewOverride instanceof WP_REST_Response &&
        $previewOverride->data['document']['source'] === 'B',
    'preview uses only JSON',
);
$quoted = dc_request(
    array_replace($preview, ['source' => '{"source":"a", "source":"b"} \\ \" quoted']),
    true,
);
dc_assert(
    $quoted instanceof WP_REST_Response,
    'keys inside source text are not top-level duplicates',
);
$maxSource = str_repeat("\x01", 262144);
$maxRequest = $preview;
$maxRequest['source'] = $maxSource;
dc_assert(strlen(json_encode($maxRequest)) > 1572864, 'worst-case source escaping fixture');
dc_assert(
    dc_request($maxRequest, true) instanceof WP_REST_Response,
    'maximum escaped source fits raw budget',
);
$maxRequest['receipt'] = str_repeat("\x01", 8192);
$maxEscaped = dc_request($maxRequest, true);
dc_assert(
    $maxEscaped instanceof WP_Error && $maxEscaped->status === 409,
    'full escaped source and receipt fit protocol budget before receipt verification',
);
$rawOverflow = dc_raw_request(json_encode($input) . str_repeat(' ', 4097));
dc_assert($rawOverflow instanceof WP_Error && $rawOverflow->status === 422, 'raw capture budget');
$oversizedReceipt = dc_request(array_replace($preview, ['receipt' => str_repeat('x', 8193)]), true);
dc_assert(
    $oversizedReceipt instanceof WP_Error && $oversizedReceipt->status === 409,
    'invalid receipt remains 409',
);
$stale = dc_request(array_replace($preview, ['expected' => str_repeat('b', 64)]), true);
dc_assert($stale instanceof WP_Error && $stale->status === 409, 'stale expected remains 409');
$beforeInvalid = $GLOBALS['previews'];
$error = dc_raw_request(
    '{"post_id":1,"expected":"' .
        $input['expected'] .
        '","receipt":"x","source":"a","sour\\u0063e":"b"}',
    true,
);
dc_assert(
    $error instanceof WP_Error && $error->status === 422 && $GLOBALS['previews'] === $beforeInvalid,
    'escaped duplicate preview source rejected before preparation',
);
echo "document-candidates receipt and closed JSON model passed\n";
