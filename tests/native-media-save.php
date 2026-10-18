<?php
$lab = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
if (
    !$lab ||
    !$home ||
    realpath(ABSPATH) !== realpath($lab) ||
    rtrim(home_url(), '/') !== rtrim($home, '/') ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost'], true) ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Owned synthetic lab required.');
}
function native_check($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function native_rest($route, array $data)
{
    $r = new WP_REST_Request('POST', '/mbb/v1/' . $route);
    $r->set_header('Content-Type', 'application/json');
    $r->set_body(wp_json_encode($data));
    return rest_do_request($r);
}
function native_ok($r)
{
    native_check($r->get_status() === 200, 'Native REST: ' . wp_json_encode($r->get_data()));
    return $r->get_data();
}
$previous = get_current_user_id();
$users = [];
$postId = 0;
$attachment = 0;
$upload = null;
try {
    $tag = substr(hash('sha256', uniqid('', true)), 0, 12);
    foreach ([0, 1] as $i) {
        $u = wp_insert_user([
            'user_login' => 'native-' . $tag . '-' . $i,
            'user_pass' => wp_generate_password(32),
            'role' => 'author',
        ]);
        native_check(!is_wp_error($u), 'Author create');
        $users[] = $u;
    }
    wp_set_current_user($users[0]);
    $chunk = static fn($t, $d) => pack('N', strlen($d)) . $t . $d . pack('N', crc32($t . $d));
    $png =
        "\x89PNG\r\n\x1a\n" .
        $chunk('IHDR', pack('NNCCCCC', 1, 1, 8, 2, 0, 0, 0)) .
        $chunk('IDAT', gzcompress("\0\x20\x80\xc0")) .
        $chunk('IEND', '');
    $upload = wp_upload_bits('native-' . $tag . '.png', null, $png);
    native_check(!$upload['error'], 'Upload');
    $attachment = wp_insert_attachment(
        [
            'post_title' => 'Synthetic native image',
            'post_author' => $users[0],
            'post_mime_type' => 'image/png',
            'post_status' => 'inherit',
        ],
        $upload['file'],
    );
    native_check(!is_wp_error($attachment), 'Attachment');
    require_once ABSPATH . 'wp-admin/includes/image.php';
    wp_update_attachment_metadata(
        $attachment,
        wp_generate_attachment_metadata($attachment, $upload['file']),
    );
    $image = static fn($caption) => ':::mbb:v1 image ' .
        wp_json_encode(
            [
                'id' => $attachment,
                'sizeSlug' => 'full',
                'linkDestination' => 'none',
                'caption' => $caption,
            ],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ) .
        "\n\n![Alternative](<" .
        $upload['url'] .
        ">)\n\n:::mbb:end\n";
    $source =
        "# Native media\r\n\r\n" .
        ':::mbb:v1 gallery {"columns":2,"imageCrop":false}' .
        "\n\n" .
        $image('Caption <strong>one</strong>') .
        "\n" .
        $image('Caption two') .
        "\n:::mbb:end\n";
    $payload = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'Native' . $tag,
        'title' => 'Synthetic native draft',
        'source' => $source,
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    native_ok(native_rest('preview', $payload));
    $created = native_ok(native_rest('save', $payload));
    $postId = $created['post_id'];
    $revision = $created['saved_revision'];
    $post = get_post($postId);
    $before = $post->post_content;
    native_check(
        $post->post_content_filtered === $source && str_contains($before, 'wp:gallery'),
        'Native save changed raw source',
    );
    $edited = str_replace('Caption', 'Edited', $before);
    $edited = str_replace('<!-- wp:gallery {', '<!-- wp:gallery {"linkTo":"none",', $edited);
    native_ok(
        native_rest('save', [
            'mode' => 'blocks',
            'post_id' => $postId,
            'expected' => mbb_token($post),
            'serialized' => $edited,
            'title' => $post->post_title,
            'post_status' => 'draft',
            'featured_media' => 0,
        ]),
    );
    $post = get_post($postId);
    $pair = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $post->post_content_filtered,
        'serialized' => $post->post_content,
        'documentId' => mbb_id($postId),
    ]);
    native_check(
        !is_wp_error($pair) && str_contains($post->post_content_filtered, 'Edited'),
        'Native edit/reopen',
    );
    $bad = str_replace(
        $upload['url'],
        'https://example.invalid/not-the-attachment.png',
        $post->post_content_filtered,
    );
    $rejected = native_rest('preview', [
        'mode' => 'markdown',
        'post_id' => $postId,
        'expected' => mbb_token($post),
        'source' => $bad,
        'title' => $post->post_title,
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    native_check($rejected->get_status() >= 400, 'Wrong attachment URL accepted');
    wp_set_current_user($users[1]);
    $foreign = $payload;
    $foreign['documentId'] = 'Foreign' . $tag;
    native_check(
        native_rest('preview', $foreign)->get_status() === 403,
        'Foreign attachment reused',
    );
    wp_set_current_user($users[0]);
    native_ok(
        native_rest('save', [
            'mode' => 'restore',
            'post_id' => $postId,
            'expected' => mbb_token($post),
            'revision_id' => $revision,
            'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
            'title' => $post->post_title,
            'post_status' => 'draft',
            'featured_media' => 0,
        ]),
    );
    $post = get_post($postId);
    native_check(
        $post->post_content === $before && $post->post_content_filtered === $source,
        'Exact native revision restoration',
    );
    $unsupported = native_rest('save', [
        'mode' => 'blocks',
        'post_id' => $postId,
        'expected' => mbb_token($post),
        'serialized' => $before . "\n\n<!-- wp:footnotes /-->",
        'title' => $post->post_title,
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    native_check(
        $unsupported->get_status() >= 400 && get_post($postId)->post_content === $before,
        'Native footnotes removed/replaced body',
    );
    $export = native_rest('export/prepare', [
        'schema' => 1,
        'post_id' => $postId,
        'expected' => mbb_token($post),
        'format' => 'zip',
    ]);
    native_check($export->get_status() >= 400, 'Portable ZIP carried local ID');
    $md = native_ok(
        native_rest('export/prepare', [
            'schema' => 1,
            'post_id' => $postId,
            'expected' => mbb_token($post),
            'format' => 'markdown',
        ]),
    );
    native_check($md['projectedSource'] === $source, 'Markdown original altered local IDs');
    $r = new WP_REST_Request('DELETE', '/mbb/v1/export/' . $md['token']);
    rest_do_request($r);
    echo 'Actual ' .
        mbb_converter_settings()['backend'] .
        " native media/galleries, repeated attachment IDs, exact source, edits/reopen/revision, actor/URL admission, native footnote rejection and portable boundaries passed.\n";
} finally {
    if ($postId) {
        wp_delete_post($postId, true);
    }
    if ($attachment && !is_wp_error($attachment)) {
        wp_delete_attachment($attachment, true);
    } elseif (is_array($upload) && is_file($upload['file'])) {
        unlink($upload['file']);
    }
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach ($users as $user) {
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
}
