<?php
// Only synthetic posts in the explicitly identified disposable WordPress lab.
if (PHP_SAPI !== 'cli' || !defined('ABSPATH')) {
    exit(1);
}
$readRoot = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$readHome = getenv('MARKBRIDGE_TEST_HOME');
if (
    !$readRoot ||
    !$readHome ||
    realpath(ABSPATH) !== realpath($readRoot) ||
    !in_array(parse_url($readHome, PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    rtrim(home_url(), '/') !== rtrim($readHome, '/') ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Component editor reads require the explicitly owned local lab');
}
function native_read_assert(bool $ok, string $label): void
{
    if (!$ok) {
        throw new RuntimeException($label);
    }
}
function native_read_request(int $id): WP_REST_Response
{
    $request = new WP_REST_Request('GET', '/wp/v2/posts/' . $id);
    $request->set_param('context', 'edit');
    return rest_do_request($request);
}
function native_read_params(string $raw): stdClass
{
    preg_match('/<!-- wp:mbb\/component (\{[\s\S]*?\}) -->/', $raw, $match);
    $attrs = mbb_native_component_read_header($match[1] ?? '');
    native_read_assert($attrs !== null && $attrs->params instanceof stdClass, 'Readable header');
    return $attrs->params;
}
$readPrevious = get_current_user_id();
$readPosts = [];
$readHook = null;
$readAdmins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
native_read_assert((bool) $readAdmins, 'Synthetic lab administrator available');
wp_set_current_user((int) $readAdmins[0]);
try {
    $identity = 'NativeRead' . bin2hex(random_bytes(6));
    $params = (object) [
        'empty' => (object) [],
        'items' => [],
        'nested' => [(object) ['cell' => (object) []], []],
    ];
    $source =
        ':::mbb:v1 component ' .
        wp_json_encode(
            [
                'id' => 'read-shape',
                'component' => 'missing-read-fixture',
                'componentVersion' => '0.1.0',
                'params' => $params,
            ],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ) .
        "\n\nOriginal synthetic explanation.\n\n:::mbb:end\n";
    $pair = mbb_convert(['mode' => 'markdown', 'source' => $source, 'documentId' => $identity]);
    native_read_assert(!is_wp_error($pair), 'Synthetic component pair converts');
    // A missing implementation remains editable through its existing paired fallback.
    foreach ([true, false] as $managed) {
        $id = wp_insert_post(
            wp_slash([
                'post_type' => 'post',
                'post_status' => 'draft',
                'post_author' => get_current_user_id(),
                'post_title' => $identity,
                'post_content' => $pair['serialized'],
                'post_content_filtered' => $pair['source'],
            ]),
            true,
        );
        native_read_assert(!is_wp_error($id) && $id > 0, 'Owned synthetic article created');
        $readPosts[] = $id;
        if ($managed) {
            update_post_meta($id, '_mbb_origin', 'markdown_import');
            update_post_meta($id, '_mbb_document_id', $identity);
        }
    }
    [$id, $ordinary] = $readPosts;
    $before = get_post($id);
    $token = mbb_token($before);
    $revisions = array_keys(wp_get_post_revisions($id));
    remove_filter('rest_prepare_post', 'mbb_native_component_read_response', 20);
    try {
        $projected = native_read_request($id);
        native_read_assert($projected->get_status() === 200, 'Core edit projection available');
        native_read_assert(
            is_array(native_read_params($projected->get_data()['content']['raw'])->empty),
            'Actual core edit hook reproduces object-to-array loss',
        );
    } finally {
        add_filter('rest_prepare_post', 'mbb_native_component_read_response', 20, 3);
    }
    $read = native_read_request($id);
    native_read_assert($read->get_status() === 200, 'Managed editor read available');
    native_read_assert(
        mbb_component_equal(native_read_params($read->get_data()['content']['raw']), $params),
        'Actual editor REST read preserves nested empty objects and legitimate arrays',
    );
    $ordinaryRead = native_read_request($ordinary);
    native_read_assert(
        is_array(native_read_params($ordinaryRead->get_data()['content']['raw'])->empty),
        'Ordinary WordPress editor content is unchanged',
    );
    $readHook = static function ($response, $post) use ($id) {
        if ($post->ID === $id) {
            $data = $response->get_data();
            $data['content']['raw'] = preg_replace_callback(
                '/<!-- wp:mbb\/component (\{[\s\S]*?\}) -->/',
                static function ($match) {
                    $attrs = json_decode($match[1], false, 32, JSON_THROW_ON_ERROR);
                    $attrs->metadata = (object) ['ignoredHookedBlocks' => ['example/extra']];
                    return '<!-- wp:mbb/component ' .
                        serialize_block_attributes((array) $attrs) .
                        ' -->';
                },
                $data['content']['raw'],
            );
            $data['content']['raw'] =
                '<!-- wp:paragraph --><p>Hooked introduction</p><!-- /wp:paragraph -->' .
                $data['content']['raw'];
            $response->set_data($data);
        }
        return $response;
    };
    add_filter('rest_prepare_post', $readHook, 15, 2);
    $hooked = native_read_request($id)->get_data()['content']['raw'];
    native_read_assert(
        str_contains($hooked, 'Hooked introduction') &&
            str_contains($hooked, 'ignoredHookedBlocks') &&
            mbb_component_equal(native_read_params($hooked), $params),
        'Other hooks and metadata remain intact',
    );
    remove_filter('rest_prepare_post', $readHook, 15);
    $readHook = null;
    clean_post_cache($id);
    $after = get_post($id);
    native_read_assert(
        $after->post_content === $before->post_content &&
            $after->post_content_filtered === $before->post_content_filtered &&
            mbb_token($after) === $token &&
            array_keys(wp_get_post_revisions($id)) === $revisions,
        'Editor reads do not write pairs, revisions or tokens',
    );
    wp_set_current_user(0);
    $denied = native_read_request($id);
    native_read_assert(
        $denied->get_status() >= 400 && !isset($denied->get_data()['content']['raw']),
        'Anonymous readers cannot receive draft raw configuration',
    );
    echo "Native component editor REST read: actual core projection, object/array shapes, missing implementation, hooks, metadata, permissions and unchanged stored pair passed.\n";
} finally {
    if ($readHook !== null) {
        remove_filter('rest_prepare_post', $readHook, 15);
    }
    wp_set_current_user((int) $readAdmins[0]);
    foreach ($readPosts as $id) {
        wp_delete_post($id, true);
    }
    wp_set_current_user($readPrevious);
}
