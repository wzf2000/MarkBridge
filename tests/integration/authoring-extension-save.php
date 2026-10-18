<?php
// Explicit integration: requires Teacher node-diagram 0.1.0 and 0.2.0.
// Isolated synthetic lab only. Missing extensions fail; no checks are skipped.
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
    throw new RuntimeException('Authoring checks require the explicitly owned local lab.');
}
function authoring_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function authoring_request($route, $params)
{
    $request = new WP_REST_Request('POST', '/mbb/v1/' . $route);
    foreach ($params as $key => $value) {
        $request->set_param($key, $value);
    }
    return rest_do_request($request);
}
$previous = get_current_user_id();
$id = 0;
$user = 0;
try {
    $suffix = substr(hash('sha256', uniqid('', true)), 0, 12);
    $user = wp_insert_user([
        'user_login' => 'authoring-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    authoring_assert(!is_wp_error($user), 'Synthetic author creation failed.');
    wp_set_current_user($user);
    $old = mbb_component_provider('node-diagram', '0.1.0');
    $next = mbb_component_provider('node-diagram', '0.2.0');
    authoring_assert(
        $old && $next && $old['status'] === 'available' && $next['status'] === 'available',
        'Both exact diagram versions must be available.',
    );
    $attrs = [
        'id' => 'stable-diagram',
        'component' => 'node-diagram',
        'componentVersion' => '0.1.0',
        'params' => $old['defaults'],
    ];
    $source =
        "# 长文😀\r\n\r\n重复段落。\r\n\r\n重复段落。\r\n\r\n" .
        ':::mbb:v1 component ' .
        wp_json_encode($attrs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) .
        "\r\n\r\n静态替代。\r\n\r\n:::mbb:end\r\n";
    $payload = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'Authoring' . $suffix,
        'title' => 'Authoring synthetic draft',
        'source' => $source,
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $preview = authoring_request('preview', $payload);
    authoring_assert(
        $preview->get_status() === 200,
        'Preview failed: ' . wp_json_encode($preview->get_data()),
    );
    $view = $preview->get_data();
    authoring_assert(
        $view['navigation']['sourceSha256'] === hash('sha256', $source) &&
            count($view['navigation']['ranges']) >= 4,
        'Actual REST preview omitted the proven raw-source map.',
    );
    authoring_assert(
        !str_contains($view['document']['serialized'], 'data-mbb-preview-'),
        'Preview data leaked into canonical blocks.',
    );
    $created = authoring_request('save', $payload);
    authoring_assert(
        $created->get_status() === 200,
        'Initial save failed: ' . wp_json_encode($created->get_data()),
    );
    $data = $created->get_data();
    $id = (int) $data['post_id'];
    $revision = (int) $data['saved_revision'];
    $post = get_post($id);
    $originalSerialized = $post->post_content;
    authoring_assert(
        $post->post_status === 'draft' && $post->post_content_filtered === $source,
        'Original draft bytes changed.',
    );
    $params = json_decode(wp_json_encode($old['defaults']), true);
    foreach ($params['edges'] as $i => &$edge) {
        $edge['id'] = 'edge-' . ($i + 1);
    }
    unset($edge);
    $params['nodes'][0]['x'] += 10;
    $changed = array_replace($attrs, ['componentVersion' => '0.2.0', 'params' => $params]);
    $upgradeSource = str_replace(
        wp_json_encode($attrs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        wp_json_encode($changed, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $source,
    );
    // Generate matching attributes/fallback, then exercise the real block-mode save endpoint.
    // React attribute editing and serialization are separately checked by diagram-author.spec.cjs.
    $upgraded = mbb_convert([
        'mode' => 'markdown',
        'source' => $upgradeSource,
        'documentId' => mbb_id($id),
    ]);
    authoring_assert(!is_wp_error($upgraded), 'Diagram upgrade did not convert.');
    $saved = authoring_request('save', [
        'mode' => 'blocks',
        'post_id' => $id,
        'expected' => mbb_token($post),
        'serialized' => $upgraded['serialized'],
        'title' => $post->post_title,
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    authoring_assert(
        $saved->get_status() === 200,
        'Explicit upgrade save failed: ' . wp_json_encode($saved->get_data()),
    );
    $post = get_post($id);
    $reopened = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $post->post_content_filtered,
        'serialized' => $post->post_content,
        'documentId' => mbb_id($id),
    ]);
    authoring_assert(
        !is_wp_error($reopened) &&
            str_contains($post->post_content, 'edge-1') &&
            str_contains($post->post_content, 'stable-diagram'),
        'Stable identities did not survive paired reopen.',
    );
    $badSource = str_replace(
        '"from":"' . $params['edges'][0]['from'] . '"',
        '"from":"missing-node"',
        $post->post_content_filtered,
    );
    $bad = authoring_request('save', [
        'mode' => 'markdown',
        'post_id' => $id,
        'expected' => mbb_token($post),
        'source' => $badSource,
        'title' => $post->post_title,
        'post_status' => 'draft',
    ]);
    authoring_assert(
        $bad->get_status() === 422 && get_post($id)->post_content === $post->post_content,
        'Invalid graph domain overwrote a valid article.',
    );
    $restored = authoring_request('save', [
        'mode' => 'restore',
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'revision_id' => $revision,
        'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
        'title' => $post->post_title,
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    authoring_assert(
        $restored->get_status() === 200 &&
            get_post($id)->post_content_filtered === $source &&
            get_post($id)->post_content === $originalSerialized,
        'Exact paired revision did not restore the old diagram version.',
    );
    echo 'Actual ' .
        mbb_converter_backend() .
        " REST preview, CRLF, explicit diagram upgrade, reopen, rejection and revision restoration passed.\n";
} finally {
    if ($id) {
        wp_delete_post($id, true);
    }
    if ($user && !is_wp_error($user)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
}
