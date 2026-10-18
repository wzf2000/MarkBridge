<?php
// Standalone Main transaction checks with two explicitly registered synthetic providers.
// This does not validate Teacher diagram algorithms or domain rules. Owned local lab only.
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
$suffix = substr(hash('sha256', uniqid('', true)), 0, 12);
$providerId = 'authoring-fixture-' . $suffix;
$savedRegistry = mbb_component_registry();
$fixture = WP_PLUGIN_DIR . '/markbridge-authoring-fixture-' . $suffix;
$fixtureFile = $fixture . '/frame.html';
try {
    authoring_assert(mkdir($fixture, 0700), 'Synthetic resource directory creation failed.');
    authoring_assert(
        copy(__DIR__ . '/browser/fixtures/component.html', $fixtureFile),
        'Synthetic resource copy failed.',
    );
    foreach (['0.1.0', '0.2.0'] as $version) {
        authoring_assert(
            markbridge_register_teaching_component($providerId, [
                'version' => $version,
                'protocolVersion' => 1,
                'minMarkBridge' => '1.6.0',
                'budgets' => mbb_component_budget_limits(),
                'title' => 'Synthetic authoring transaction fixture',
                'schema' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['value'],
                    'properties' => [
                        'value' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 10],
                    ],
                ],
                'defaults' => ['value' => 1],
                'resource' => [
                    'file' => $fixtureFile,
                    'url' => plugins_url('frame.html', $fixtureFile),
                    'sha256' => hash_file('sha256', $fixtureFile),
                ],
            ]),
            'Synthetic provider registration failed for ' . $version,
        );
    }
    $user = wp_insert_user([
        'user_login' => 'authoring-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    authoring_assert(!is_wp_error($user), 'Synthetic author creation failed.');
    wp_set_current_user($user);
    $old = mbb_component_provider($providerId, '0.1.0');
    $next = mbb_component_provider($providerId, '0.2.0');
    authoring_assert(
        $old && $next && $old['status'] === 'available' && $next['status'] === 'available',
        'Both exact synthetic versions must be available.',
    );
    $attrs = [
        'id' => 'stable-fixture',
        'component' => $providerId,
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
    $params = ['value' => 2];
    $changed = array_replace($attrs, ['componentVersion' => '0.2.0', 'params' => $params]);
    $upgradeSource = str_replace(
        wp_json_encode($attrs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        wp_json_encode($changed, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $source,
    );
    // Generate matching attributes/fallback, then exercise the real block-mode save endpoint.
    $upgraded = mbb_convert([
        'mode' => 'markdown',
        'source' => $upgradeSource,
        'documentId' => mbb_id($id),
    ]);
    authoring_assert(!is_wp_error($upgraded), 'Synthetic version upgrade did not convert.');
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
            str_contains($post->post_content, 'stable-fixture') &&
            str_contains($post->post_content_filtered, '"componentVersion":"0.2.0"') &&
            str_contains($post->post_content_filtered, '"value":2'),
        'Stable identities did not survive paired reopen.',
    );
    $beforeInvalidToken = mbb_token($post);
    $beforeInvalidSource = $post->post_content_filtered;
    $beforeInvalidRevisions = array_keys(wp_get_post_revisions($id));
    $badSource = str_replace('"value":2', '"value":"not-an-integer"', $post->post_content_filtered);
    authoring_assert($badSource !== $beforeInvalidSource, 'Invalid candidate was not constructed.');
    $bad = authoring_request('save', [
        'mode' => 'markdown',
        'post_id' => $id,
        'expected' => mbb_token($post),
        'source' => $badSource,
        'title' => $post->post_title,
        'post_status' => 'draft',
    ]);
    authoring_assert(
        $bad->get_status() === 422 &&
            get_post($id)->post_content === $post->post_content &&
            get_post($id)->post_content_filtered === $beforeInvalidSource &&
            mbb_token(get_post($id)) === $beforeInvalidToken &&
            array_keys(wp_get_post_revisions($id)) === $beforeInvalidRevisions,
        'Invalid generic schema changed the valid pair, baseline or revisions.',
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
        'Exact paired revision did not restore the old synthetic version.',
    );
    echo 'Actual ' .
        mbb_converter_backend() .
        " REST preview, CRLF, synthetic exact-version upgrade, reopen, generic schema rejection and revision restoration passed.\n";
} finally {
    $GLOBALS['mbb_components'] = $savedRegistry;
    if (is_file($fixtureFile)) {
        unlink($fixtureFile);
    }
    if (is_dir($fixture)) {
        rmdir($fixture);
    }
    if ($id) {
        wp_delete_post($id, true);
    }
    if ($user && !is_wp_error($user)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
}
