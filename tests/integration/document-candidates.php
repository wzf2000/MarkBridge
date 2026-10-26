<?php
// Real REST/WordPress check. The caller must own this explicitly selected local lab.
if (PHP_SAPI !== 'cli') {
    exit();
}
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
if (
    !$root ||
    !$home ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    realpath(ABSPATH) !== realpath($root) ||
    rtrim(home_url(), '/') !== rtrim($home, '/') ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Document candidates require the explicitly owned local lab.');
}
function dc_wp_assert($value, string $message): void
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function dc_wp_raw_request(string $route, string $body)
{
    $request = new WP_REST_Request('POST', '/mbb/v1/' . $route);
    $request->set_header('Content-Type', 'application/json');
    $request->set_body($body);
    return rest_do_request($request);
}
function dc_wp_request(string $route, array $data)
{
    return dc_wp_raw_request($route, wp_json_encode($data));
}
$previous = get_current_user_id();
$user = $id = 0;
$sourceFile = null;
$sourceFilter = null;
try {
    $suffix = bin2hex(random_bytes(6));
    $user = wp_insert_user([
        'user_login' => 'candidate-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    dc_wp_assert(!is_wp_error($user), 'Synthetic user failed');
    wp_set_current_user($user);
    $source = "# Original\r\n\r\nExact source bytes.\r\n";
    $created = dc_wp_request('save', [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'Candidate' . $suffix,
        'title' => 'Candidate synthetic',
        'source' => $source,
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    dc_wp_assert($created->get_status() === 200, 'Initial ordinary save failed');
    $id = (int) $created->get_data()['post_id'];
    $input = ['post_id' => $id, 'expected' => mbb_token(get_post($id))];
    $original = mbb_document(get_post($id));
    $capture = dc_wp_request('document-tools/capture', $input);
    dc_wp_assert($capture->get_status() === 200, 'Capture failed');
    $captured = $capture->get_data();
    dc_wp_assert(
        $captured['source'] === $source && $captured['identity'] === null,
        'Capture normalized original',
    );
    $previewInput = $input + ['receipt' => $captured['receipt'], 'source' => "# Changed\r\n"];
    $preview = dc_wp_request('document-tools/preview', $previewInput);
    dc_wp_assert($preview->get_status() === 200, 'Candidate preview failed');
    dc_wp_assert(mbb_document(get_post($id)) === $original, 'Preview wrote body');
    $unknown = dc_wp_request('document-tools/preview', $previewInput + ['resource_import' => []]);
    dc_wp_assert($unknown->get_status() === 422, 'Unknown preview field must be 422');
    $captureBody = dc_wp_request(
        'document-tools/capture',
        $input + ['source' => 'Unexpected body'],
    );
    dc_wp_assert($captureBody->get_status() === 422, 'Capture source must be 422');
    foreach (['{', '{"post_id":' . $id . ',"source":"' . "\xff" . '"}'] as $raw) {
        $malformed = dc_wp_raw_request('document-tools/capture', $raw);
        dc_wp_assert(
            $malformed->get_status() === 400,
            'WordPress must retain its native invalid JSON/UTF-8 400',
        );
    }
    dc_wp_assert(mbb_document(get_post($id)) === $original, 'Malformed requests wrote body');
    dc_wp_assert(
        str_contains($preview->get_headers()['Cache-Control'] ?? '', 'no-store'),
        'Private cache headers missing',
    );
    $tampered = dc_wp_request(
        'document-tools/preview',
        array_replace($previewInput, ['receipt' => $captured['receipt'] . 'x']),
    );
    dc_wp_assert($tampered->get_status() === 409, 'Tampered receipt must retain 409');
    wp_set_current_user(0);
    dc_wp_assert(
        dc_wp_request('document-tools/preview', $previewInput)->get_status() === 403,
        'Anonymous preview must retain permission callback 403',
    );
    wp_set_current_user($user);
    $metadataSave = dc_wp_request(
        'save',
        $input + [
            'mode' => 'markdown',
            'source' => $source,
            'title' => 'Concurrent metadata change',
            'post_status' => 'draft',
            'featured_media' => 0,
        ],
    );
    dc_wp_assert($metadataSave->get_status() === 200, 'Ordinary metadata save failed');
    dc_wp_assert(
        dc_wp_request('document-tools/preview', $previewInput)->get_status() === 409,
        'Stale expected must retain 409',
    );
    $fresh = ['post_id' => $id, 'expected' => mbb_token(get_post($id))];
    $again = dc_wp_request('document-tools/capture', $fresh);
    dc_wp_assert($again->get_status() === 200, 'Fresh capture after saved metadata change failed');
    update_post_meta($id, '_mbb_source_managed', 'file');
    $unbound = dc_wp_request('document-tools/capture', [
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
    ]);
    dc_wp_assert($unbound->get_status() !== 200, 'Unbound file source accepted');
    $sourceFile = tempnam(sys_get_temp_dir(), 'mbb-candidate-');
    dc_wp_assert(
        is_string($sourceFile) && file_put_contents($sourceFile, $source) === strlen($source),
        'Synthetic source file failed',
    );
    $sourceFilter = static fn($value, $post) => (int) $post->ID === $id ? $sourceFile : $value;
    add_filter('mbb_source_write_target', $sourceFilter, 10, 2);
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($sourceFile)));
    $fileInput = ['post_id' => $id, 'expected' => mbb_token(get_post($id))];
    $fileCapture = dc_wp_request('document-tools/capture', $fileInput);
    dc_wp_assert($fileCapture->get_status() === 200, 'Writable bound source capture failed');
    $filePreview = $fileInput + [
        'receipt' => $fileCapture->get_data()['receipt'],
        'source' => "# Changed\r\n",
    ];
    dc_wp_assert(
        dc_wp_request('document-tools/preview', $filePreview)->get_status() === 200,
        'Writable file preview failed',
    );
    dc_wp_assert(file_get_contents($sourceFile) === $source, 'Preview wrote source file');
    file_put_contents($sourceFile, $source . 'External edit');
    dc_wp_assert(
        dc_wp_request('document-tools/preview', $filePreview)->get_status() !== 200,
        'Changed actual source accepted',
    );
    file_put_contents($sourceFile, $source);
    $fileCapture = dc_wp_request('document-tools/capture', $fileInput);
    dc_wp_assert($fileCapture->get_status() === 200, 'Recapture restored file failed');
    $replacement = tempnam(sys_get_temp_dir(), 'mbb-candidate-replacement-');
    file_put_contents($replacement, $source);
    rename($replacement, $sourceFile);
    dc_wp_assert(
        dc_wp_request(
            'document-tools/preview',
            array_replace($filePreview, ['receipt' => $fileCapture->get_data()['receipt']]),
        )->get_status() !== 200,
        'Same-byte file replacement accepted old fingerprint',
    );
    delete_post_meta($id, '_mbb_source_managed');
    dc_wp_assert(mbb_document(get_post($id)) === $original, 'Read-only operations changed body');
    echo "document candidate real REST checks passed\n";
} finally {
    if ($sourceFilter) {
        remove_filter('mbb_source_write_target', $sourceFilter, 10);
    }
    if ($sourceFile && is_file($sourceFile)) {
        unlink($sourceFile);
    }
    wp_set_current_user($previous);
    if ($id) {
        wp_delete_post($id, true);
    }
    if ($user && !is_wp_error($user)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
}
