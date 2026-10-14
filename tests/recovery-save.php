<?php
// Internal REST checks in an explicitly identified, disposable WordPress lab only.
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
    throw new RuntimeException(
        'Recovery save checks require the explicitly identified local synthetic lab.',
    );
}
function recovery_save_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function recovery_save_request($route, $params, $method = 'POST')
{
    $request = new WP_REST_Request($method, '/mbb/v1/' . $route);
    foreach ($params as $key => $value) {
        $request->set_param($key, $value);
    }
    return rest_do_request($request);
}
$previous = get_current_user_id();
$suffix = substr(hash('sha256', uniqid('', true)), 0, 10);
$author = 0;
$ids = [];
try {
    $author = wp_insert_user([
        'user_login' => 'recovery-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    recovery_save_assert(!is_wp_error($author), 'Synthetic author creation failed');
    wp_set_current_user($author);
    $context = recovery_save_request(
        'recovery-context',
        ['post_id' => 0, 'new_key' => str_repeat('a', 32)],
        'GET',
    );
    recovery_save_assert(
        $context->get_status() === 200 && $context->get_data()['newKey'] === str_repeat('a', 32),
        'New draft context refused its stable identity',
    );
    recovery_save_assert(
        !str_contains(wp_json_encode($context->get_data()), WP_PLUGIN_DIR) &&
            !isset($context->get_data()['document']),
        'Recovery context exposed a private path or body',
    );
    $source = "# Synthetic native recovery\n\nA private local candidate.\n";
    $docId = 'RECOVERY_' . $suffix;
    $document = mbb_convert(['mode' => 'markdown', 'source' => $source, 'documentId' => $docId]);
    recovery_save_assert(!is_wp_error($document), 'Actual candidate converter unavailable');
    $original = serialize_blocks(parse_blocks($document['serialized']));
    recovery_save_assert(
        $original === $document['serialized'],
        'Real WordPress serialization changed the canonical native fixture',
    );
    $candidate = [
        'post_id' => 0,
        'mode' => 'markdown',
        'source' => $source,
        'new_blocks_original' => $original,
        'documentId' => $docId,
        'title' => 'Synthetic native recovery',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $preview = recovery_save_request('preview', $candidate);
    recovery_save_assert(
        $preview->get_status() === 200,
        'Real new-native preparation failed: ' . wp_json_encode($preview->get_data()),
    );
    foreach (
        [
            'shape' =>
                $original . '\n<!-- wp:paragraph --><p>unrepresented</p><!-- /wp:paragraph -->',
            'html' => '<script>unsafe()</script>',
            'budget' => str_repeat('x', 262145),
            'type' => [],
        ]
        as $case => $bad
    ) {
        $badRequest = array_replace($candidate, [
            'documentId' => 'BAD_' . $case . '_' . $suffix,
            'new_blocks_original' => $bad,
        ]);
        $refused = recovery_save_request('save', $badRequest);
        recovery_save_assert(
            $refused->get_status() === 422 &&
                ($refused->get_data()['code'] ?? '') === 'recovery_shape',
            'Invalid native shape/type/HTML/budget admitted: ' .
                $case .
                '/' .
                wp_json_encode($refused->get_data()),
        );
    }
    $untrusted = recovery_save_request(
        'preview',
        array_replace($candidate, [
            'mode' => 'blocks',
            'source' => null,
            'serialized' => $original,
        ]),
    );
    recovery_save_assert(
        $untrusted->get_status() === 422,
        'Existing-base requirement was bypassed for a new blocks document',
    );
    $created = recovery_save_request('save', $candidate);
    recovery_save_assert(
        $created->get_status() === 200,
        'First actual paired creation failed: ' . wp_json_encode($created->get_data()),
    );
    $id = (int) $created->get_data()['post_id'];
    $ids[] = $id;
    $post = get_post($id);
    recovery_save_assert(
        mbb_managed($id) &&
            $post->post_status === 'draft' &&
            $post->post_content === $original &&
            $post->post_content_filtered === $source,
        'New native recovery created an unpaired/native or published post',
    );
    $reopened = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $post->post_content_filtered,
        'serialized' => $post->post_content,
        'documentId' => mbb_id($id),
    ]);
    recovery_save_assert(
        !is_wp_error($reopened) && $reopened['source'] === $source,
        'Created native recovery pair could not reopen',
    );
    $fresh = recovery_save_request('recovery-context', ['post_id' => $id], 'GET');
    recovery_save_assert(
        $fresh->get_status() === 200 && $fresh->get_data()['newKey'] === null,
        'Created managed post context failed',
    );
    wp_trash_post($id);
    $inactive = recovery_save_request('recovery-context', ['post_id' => $id], 'GET');
    recovery_save_assert(
        $inactive->get_status() === 409 && ($inactive->get_data()['code'] ?? '') === 'inactive',
        'Trashed post admitted local persistence/restoration',
    );
    wp_untrash_post($id);
    recovery_save_assert(
        recovery_save_request('recovery-context', ['post_id' => $id], 'GET')->get_status() === 200,
        'Normal WordPress untrash did not restore context permission',
    );
    wp_set_current_user(0);
    recovery_save_assert(
        recovery_save_request('recovery-context', ['post_id' => $id], 'GET')->get_status() === 401,
        'Expired authentication admitted recovery context',
    );
    echo 'Recovery ' .
        mbb_converter_backend() .
        " actual WordPress new-native preparation, closed rejection, first paired draft creation/reopen, inactive and authentication checks passed.\n";
} finally {
    wp_set_current_user($previous);
    foreach ($ids as $id) {
        wp_delete_post($id, true);
    }
    if ($author && !is_wp_error($author)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($author);
    }
}
