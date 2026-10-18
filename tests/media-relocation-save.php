<?php
// Retained synthetic review drafts in two independently installed loopback databases.
$lab = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
$out = getenv('MARKBRIDGE_MEDIA_REVIEW');
if (
    !$lab ||
    !$home ||
    !$out ||
    realpath(ABSPATH) !== realpath($lab) ||
    rtrim(home_url(), '/') !== $home ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost'], true) ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Explicit owned loopback sites required');
}
function relocation_check($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function relocation_request($route, $params = [], $method = 'POST')
{
    $r = new WP_REST_Request($method, '/mbb/v1/' . $route);
    $r->set_header('Content-Type', 'application/json');
    $r->set_body(wp_json_encode($params));
    return rest_do_request($r);
}
function relocation_ok($r)
{
    relocation_check($r->get_status() === 200, 'REST failed: ' . wp_json_encode($r->get_data()));
    return $r->get_data();
}
function relocation_image($title, $importId = 0)
{
    require_once ABSPATH . 'wp-admin/includes/image.php';
    $chunk = static fn($name, $bytes) => pack('N', strlen($bytes)) .
        $name .
        $bytes .
        pack('H*', hash('crc32b', $name . $bytes));
    $png =
        "\x89PNG\r\n\x1a\n" .
        $chunk('IHDR', pack('NNCCCCC', 1, 1, 8, 2, 0, 0, 0)) .
        $chunk('IDAT', gzcompress("\0\x40\xa0\xc0")) .
        $chunk('IEND', '');
    $u = wp_upload_bits('cross-site-' . bin2hex(random_bytes(6)) . '.png', null, $png);
    relocation_check(empty($u['error']), 'PNG upload');
    $a = wp_insert_attachment(
        [
            'post_title' => $title,
            'post_mime_type' => 'image/png',
            'post_author' => get_current_user_id(),
            'post_status' => 'inherit',
            'import_id' => $importId,
        ],
        $u['file'],
    );
    relocation_check(!is_wp_error($a), 'Attachment');
    wp_update_attachment_metadata($a, wp_generate_attachment_metadata($a, $u['file']));
    return $a;
}
wp_set_current_user(get_user_by('login', 'markbridge_ci')->ID);
$mode = $args[0] ?? '';
$archive = $out . '/cross-site.zip';
$identity = $out . '/cross-site-source.json';
if ($mode === 'export') {
    $sequence = max(1000000, (int) get_option('_mbb_synthetic_media_sequence', 1000000)) + 100;
    update_option('_mbb_synthetic_media_sequence', $sequence, false);
    $a = relocation_image('Source attachment', $sequence);
    $url = wp_get_attachment_url($a);
    $source =
        "# 跨站图片关联审阅\n\n:::mbb:v1 image " .
        wp_json_encode(
            [
                'id' => $a,
                'caption' => '跨站图注 <strong>保留</strong>',
                'sizeSlug' => 'full',
                'linkDestination' => 'none',
            ],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ) .
        "\n\n![独立合成图](<$url>)\n\n:::mbb:end\n\nText ![inline](<$url>) after.\n\n<p>HTML <img src=\"$url\" alt=\"raw\"/> after.</p>\n\n```python\n  value = 1\n\n  print(value)\n```\n";
    $save = relocation_ok(
        relocation_request('save', [
            'mode' => 'markdown',
            'post_id' => 0,
            'documentId' => 'CrossSite' . bin2hex(random_bytes(5)),
            'title' => '跨站图片源站审阅（保留草稿）',
            'source' => $source,
            'post_status' => 'draft',
            'featured_media' => 0,
        ]),
    );
    $id = $save['post_id'];
    wp_update_post(['ID' => $a, 'post_parent' => $id]);
    $before = get_post($id);
    $prepared = relocation_ok(
        relocation_request('export/prepare', [
            'schema' => 1,
            'post_id' => $id,
            'expected' => mbb_token($before),
            'format' => 'portable-zip',
        ]),
    );
    relocation_check(
        !str_contains($prepared['projectedSource'], '"id":' . $a),
        'Old numeric ID survived',
    );
    $bytes = relocation_ok(
        relocation_request('export/' . $prepared['token'] . '/download', [
            'schema' => 1,
            'receipt' => $prepared['receipt'],
        ]),
    );
    file_put_contents($archive, $bytes);
    chmod($archive, 0600);
    relocation_check(
        get_post($id)->post_content_filtered === $source,
        'Export modified saved source',
    );
    file_put_contents(
        $identity,
        wp_json_encode(
            [
                'post_id' => $id,
                'attachment' => $a,
                'source_sha256' => hash('sha256', $source),
                'body_sha256' => hash('sha256', $before->post_content),
                'zip_sha256' => hash('sha256', $bytes),
                'site' => $home,
                'source_url' => $url,
            ],
            JSON_PRETTY_PRINT,
        ),
    );
    chmod($identity, 0600);
    echo "Retained source draft $id; cross-site ZIP without old IDs prepared\n";
} elseif ($mode === 'import') {
    $source = json_decode(file_get_contents($identity), true);
    relocation_check($source['site'] !== $home, 'Destination must be a separately installed site');
    $collision = relocation_image(
        'Unrelated destination same-ID attachment',
        $source['attachment'],
    );
    relocation_check(
        $collision === $source['attachment'],
        'Same numeric ID collision not established',
    );
    $collisionBefore = get_post($collision);
    $docid = 'CrossDestination' . bin2hex(random_bytes(4));
    $request = new WP_REST_Request('POST', '/mbb/v1/resources');
    foreach (['documentId' => $docid, 'post_id' => 0, 'mode' => 'markdown'] as $k => $v) {
        $request->set_param($k, $v);
    }
    $job = mbb_resource_prepare_file($request, $archive);
    relocation_check(
        !is_wp_error($job),
        'Resource stage: ' . (is_wp_error($job) ? $job->get_error_message() : ''),
    );
    $payload = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => $docid,
        'source' => $job['source'],
        'title' => '跨站图片目标站审阅（保留草稿）',
        'post_status' => 'draft',
        'featured_media' => 0,
        'resource_import' => ['schema' => 1, 'token' => $job['token'], 'ack_public_media' => true],
    ];
    $payload['frontmatter_selected'] = [];
    $preview = relocation_ok(relocation_request('preview', $payload));
    $payload['frontmatter_receipt'] = $preview['frontmatter_receipt'];
    $payload['resource_receipt'] = $preview['resource_receipt'];
    $save = relocation_ok(relocation_request('save', $payload));
    $id = $save['post_id'];
    $post = get_post($id);
    $blocks = parse_blocks($post->post_content);
    $images = [];
    $walk = function ($bs) use (&$walk, &$images) {
        foreach ($bs as $b) {
            if ($b['blockName'] === 'core/image') {
                $images[] = $b;
            }
            $walk($b['innerBlocks']);
        }
    };
    $walk($blocks);
    relocation_check(count($images) === 1, 'Native image structure');
    relocation_check(
        !str_contains($post->post_content, $source['source_url']),
        'Inline/HTML image retained source URL',
    );
    $new = $images[0]['attrs']['id'] ?? 0;
    relocation_check(
        $new && $new !== $collision && get_post_type($new) === 'attachment',
        'Old ID reused instead of new attachment',
    );
    relocation_check((int) get_post($new)->post_parent === $id, 'New media relationship missing');
    relocation_check(
        get_post($collision) == $collisionBefore,
        'Existing same-ID attachment changed',
    );
    relocation_check(
        str_contains($post->post_content_filtered, '跨站图注 <strong>保留</strong>') &&
            str_contains($post->post_content_filtered, "  value = 1\n\n  print(value)"),
        'Caption/code changed',
    );
    relocation_check(
        str_contains($post->post_content, 'wp-image-' . $new) && $post->post_status === 'draft',
        'Draft or native ID wrong',
    );
    $again = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $post->post_content_filtered,
        'serialized' => $post->post_content,
        'documentId' => mbb_id($id),
    ]);
    relocation_check(!is_wp_error($again), 'Saved pair cannot reopen');
    $originalPair = [$post->post_content, $post->post_content_filtered];
    relocation_ok(
        relocation_request('save', [
            'mode' => 'blocks',
            'post_id' => $id,
            'expected' => mbb_token($post),
            'serialized' => str_replace(
                '跨站图注 <strong>保留</strong>',
                '跨站图注 <strong>修改</strong>',
                $post->post_content,
            ),
            'title' => $post->post_title,
            'post_status' => 'draft',
            'featured_media' => 0,
        ]),
    );
    $revision = wp_get_post_revision($save['saved_revision']);
    relocation_check($revision instanceof WP_Post, 'Imported pair revision missing');
    relocation_ok(
        relocation_request('save', [
            'mode' => 'restore',
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
            'revision_id' => $revision->ID,
            'expected_revision' => mbb_revision_token($revision),
            'post_status' => 'draft',
            'featured_media' => 0,
        ]),
    );
    clean_post_cache($id);
    $post = get_post($id);
    relocation_check(
        [$post->post_content, $post->post_content_filtered] === $originalPair,
        'Revision did not preserve new destination attachment identity',
    );

    file_put_contents(
        $out . '/cross-site-destination.json',
        wp_json_encode(
            [
                'post_id' => $id,
                'old_numeric_id' => $collision,
                'new_attachment' => $new,
                'source_sha256' => hash('sha256', $post->post_content_filtered),
                'site' => $home,
                'same_id_attachment_unchanged' => true,
                'revision_restored_exact_new_ids' => true,
                'saved_revision' => $save['saved_revision'],
            ],
            JSON_PRETTY_PRINT,
        ),
    );
    echo "Separate-site import draft $id: old ID collision preserved, new attachment $new associated and paired reopened\n";
} else {
    throw new RuntimeException('Choose export/import');
}
