<?php
// Run only via WP-CLI against an explicitly identified disposable local installation.
if (PHP_SAPI !== 'cli' || !defined('WP_CLI') || !WP_CLI) {
    exit(1);
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
    throw new RuntimeException('Native group saves require an explicitly identified local lab.');
}
if (!function_exists('mbb_native_rest_update')) {
    throw new RuntimeException('The candidate plugin is required.');
}
function ngs_assert($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function ngs_call($route, $params)
{
    $request = new WP_REST_Request('POST', $route);
    foreach ($params as $key => $value) {
        $request->set_param($key, $value);
    }
    return rest_do_request($request);
}
function ngs_ok($response, $label)
{
    ngs_assert(
        $response->get_status() === 200,
        $label . ': ' . wp_json_encode($response->get_data()),
    );
    return $response->get_data();
}
$previous = get_current_user_id();
$user = $id = $comment = 0;
try {
    $user = wp_insert_user([
        'user_login' => 'native-group-' . bin2hex(random_bytes(6)),
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    ngs_assert(!is_wp_error($user), 'Could not create the synthetic author.');
    wp_set_current_user($user);
    $source =
        ":::mbb:v1 group {\"tagName\":\"section\",\"anchor\":\"native-group\",\"className\":\"native-group-fixture\",\"ariaLabel\":\"Group fixture\",\"layout\":{\"type\":\"constrained\"}}\n\nGroup original paragraph.\n\n\$x^2$.\n\n```js\nconst x = 1;\n```\n\n:::mbb:v1 details {\"summary\":\"Group details\"}\n\nNested explanation.\n\n:::mbb:end\n\n:::mbb:end\n";
    $request = [
        'post_id' => 0,
        'documentId' => 'NativeGroup' . bin2hex(random_bytes(5)),
        'mode' => 'markdown',
        'source' => $source,
        'title' => 'Synthetic native group',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $preview = ngs_ok(ngs_call('/mbb/v1/preview', $request), 'Group preview');
    $request['adapter_digest'] = $preview['adapter_digest'];
    $saved = ngs_ok(ngs_call('/mbb/v1/save', $request), 'Group save');
    $id = (int) $saved['post_id'];
    $revision = (int) $saved['saved_revision'];
    $baseline = get_post($id)->post_content;
    ngs_assert(parse_blocks($baseline)[0]['blockName'] === 'core/group', 'Group identity lost.');
    ngs_assert(!str_contains($baseline, 'is-layout-'), 'Invented render-time layout classes.');
    ngs_assert(get_post($id)->post_content_filtered === $source, 'Original source changed.');
    $reopened = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $source,
        'serialized' => $baseline,
        'documentId' => mbb_id($id),
    ]);
    ngs_assert(
        !is_wp_error($reopened) && $reopened['serialized'] === $baseline,
        'Exact group pair could not reopen.',
    );
    $comment = wp_insert_comment([
        'comment_post_ID' => $id,
        'comment_content' => 'Synthetic group comment',
        'comment_approved' => 1,
    ]);
    update_post_meta($id, '_native_group_fixture_note', 'Synthetic private note');
    $edited = str_replace('Group original paragraph.', 'Group edited paragraph.', $baseline);
    ngs_ok(
        ngs_call('/wp/v2/posts/' . $id, [
            'content' => $edited,
            'mbb_expected' => mbb_token(get_post($id)),
        ]),
        'Native group edit',
    );
    $editedSource = get_post($id)->post_content_filtered;
    ngs_assert(get_post($id)->post_content === $edited, 'Native edit changed saved HTML.');
    ngs_assert($editedSource !== $source, 'Native edit did not update Markdown.');
    // Markdown may escape punctuation; compare the imported content and exact pair instead.
    $reimported = mbb_convert([
        'mode' => 'markdown',
        'source' => $editedSource,
        'documentId' => mbb_id($id),
    ]);
    ngs_assert(
        !is_wp_error($reimported) && $reimported['serialized'] === $edited,
        'Native edit Markdown did not reimport to the saved HTML.',
    );
    $editedPair = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $editedSource,
        'serialized' => $edited,
        'documentId' => mbb_id($id),
    ]);
    ngs_assert(
        !is_wp_error($editedPair) &&
            $editedPair['source'] === $editedSource &&
            $editedPair['serialized'] === $edited,
        'Native edit did not preserve an exact pair.',
    );
    $bad = str_replace(
        '"layout":{"type":"constrained"}',
        '"layout":{"type":"constrained"},"metadata":{"bindings":{}}',
        $edited,
    );
    ngs_assert($bad !== $edited, 'Could not form the rejected raw-attribute fixture.');
    $rejected = ngs_call('/wp/v2/posts/' . $id, [
        'content' => $bad,
        'mbb_expected' => mbb_token(get_post($id)),
    ]);
    ngs_assert(
        $rejected->get_status() >= 400 &&
            get_post($id)->post_content === $edited &&
            get_post($id)->post_content_filtered === $editedSource,
        'Unsupported raw attributes changed the saved pair.',
    );
    $restore = [
        'post_id' => $id,
        'mode' => 'restore',
        'expected' => mbb_token(get_post($id)),
        'revision_id' => $revision,
        'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
    ];
    $review = ngs_ok(ngs_call('/mbb/v1/preview', $restore), 'Group revision preview');
    $restore['adapter_digest'] = $review['adapter_digest'];
    ngs_ok(ngs_call('/mbb/v1/save', $restore), 'Group revision restore');
    ngs_assert(
        get_post($id)->post_content === $baseline &&
            get_post($id)->post_content_filtered === $source,
        'Revision did not restore the exact group pair.',
    );
    ngs_assert(
        get_comment($comment) !== null &&
            get_post_meta($id, '_native_group_fixture_note', true) === 'Synthetic private note',
        'Comment/private note changed.',
    );
    echo "Guarded native group paired save, reopen, native edit, raw-attribute refusal and revision checks passed.\n";
} finally {
    if ($id) {
        wp_delete_post($id, true);
    }
    if (is_int($user) && $user > 0) {
        if (!function_exists('wp_delete_user')) {
            require_once ABSPATH . 'wp-admin/includes/user.php';
        }
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
}
