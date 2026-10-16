<?php
// Real REST/DB checks restricted to the explicitly owned synthetic lab.
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
function batch_check($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function batch_rest($path, $data = null, $method = 'POST', $files = null)
{
    $r = new WP_REST_Request($method, '/mbb/v1/' . $path);
    if ($data !== null) {
        $r->set_header('Content-Type', 'application/json');
        $r->set_body(wp_json_encode($data));
    }
    if ($files !== null) {
        $r->set_file_params($files);
    }
    return rest_do_request($r);
}
function batch_ok($response)
{
    batch_check(
        $response->get_status() === 200,
        'REST failed: ' . wp_json_encode($response->get_data()),
    );
    return $response->get_data();
}
$prior = get_current_user_id();
$users = [];
$paths = [];
$tokens = [];
$posts = [];
try {
    $tag = substr(hash('sha256', uniqid('', true)), 0, 12);
    foreach (['author', 'author', 'contributor'] as $index => $role) {
        $id = wp_insert_user([
            'user_login' => 'batch-' . $tag . '-' . $index,
            'user_pass' => wp_generate_password(32),
            'role' => $role,
        ]);
        batch_check(!is_wp_error($id), 'Author creation');
        $users[] = $id;
    }
    wp_set_current_user($users[0]);
    $source =
        "---\r\nmarkbridge: 1\r\ntitle: \"Proposed title\"\r\nstatus: \"publish\"\r\n---\r\n\r\n# Batch 😀\r\n\r\nInline $" .
        "a=b$.\r\n\r\n```python\r\nprint(1)\r\n```\r\n";
    $uploads = ['name' => [], 'tmp_name' => [], 'error' => [], 'size' => [], 'type' => []];
    foreach (
        [['lesson.md', $source], ['missing.md', "![Missing](lost.png)\n"], ['lesson.md', $source]]
        as [$name, $body]
    ) {
        $path = tempnam(sys_get_temp_dir(), 'mbb-batch-owned-');
        file_put_contents($path, $body);
        chmod($path, 0600);
        $paths[] = $path;
        $uploads['name'][] = $name;
        $uploads['tmp_name'][] = $path;
        $uploads['error'][] = 0;
        $uploads['size'][] = strlen($body);
        $uploads['type'][] = 'text/markdown';
    }
    $zip = tempnam(sys_get_temp_dir(), 'mbb-batch-owned-');
    $paths[] = $zip;
    $archive = new ZipArchive();
    batch_check($archive->open($zip, ZipArchive::OVERWRITE) === true, 'ZIP create');
    $archive->addFromString('document.md', "# Images\n\n![Chart](images/chart.png)\n");
    $chunk = static fn($type, $data) => pack('N', strlen($data)) .
        $type .
        $data .
        pack('N', crc32($type . $data));
    $png =
        "\x89PNG\r\n\x1a\n" .
        $chunk('IHDR', pack('NNCCCCC', 1, 1, 8, 2, 0, 0, 0)) .
        $chunk('IDAT', gzcompress("\0\x20\x80\xc0")) .
        $chunk('IEND', '');
    $archive->addFromString('images/chart.png', $png);
    $archive->close();
    chmod($zip, 0600);
    $uploads['name'][] = 'images.zip';
    $uploads['tmp_name'][] = $zip;
    $uploads['error'][] = 0;
    $uploads['size'][] = filesize($zip);
    $uploads['type'][] = 'application/zip';
    $job = batch_ok(batch_rest('batch/prepare', null, 'POST', ['documents' => $uploads]));
    $tokens[] = $job['token'];
    batch_check(
        array_column($job['items'], 'state') === ['ready', 'blocked', 'ready', 'ready'],
        'Scan states ' . wp_json_encode($job['items']),
    );
    batch_check(
        in_array('duplicate-source', $job['items'][2]['warnings'], true),
        'Duplicate source not reported',
    );
    batch_check(
        !get_posts([
            'post_type' => ['post', 'attachment'],
            'post_status' => 'any',
            'author' => $users[0],
            'numberposts' => 1,
        ]),
        'Scan wrote article/media',
    );
    wp_set_current_user($users[1]);
    batch_check(
        batch_rest('batch/' . $job['token'], null, 'GET')->get_status() === 403,
        'Foreign actor read',
    );
    wp_set_current_user(0);
    batch_check(
        batch_rest('batch/' . $job['token'], null, 'GET')->get_status() >= 400,
        'Anonymous read',
    );
    wp_set_current_user($users[0]);
    $preview = batch_ok(
        batch_rest('batch/' . $job['token'] . '/preview', [
            'schema' => 1,
            'index' => 0,
            'title' => 'First synthetic draft',
        ]),
    );
    batch_check(
        $preview['source'] === $source && str_contains($preview['html'], 'Batch'),
        'Preview changed bytes',
    );
    $actor = get_user_by('id', $users[0]);
    $actor->add_cap('edit_posts', false);
    wp_set_current_user(0);
    wp_set_current_user($users[0]);
    batch_check(
        batch_rest('batch/' . $job['token'] . '/confirm', [
            'schema' => 1,
            'index' => 0,
            'receipt' => $preview['receipt'],
            'ack_public_media' => false,
        ])->get_status() === 403,
        'Permission loss during confirmation',
    );
    $actor->remove_cap('edit_posts');
    wp_set_current_user(0);
    wp_set_current_user($users[0]);
    batch_check(
        batch_rest('batch/' . $job['token'] . '/confirm', [
            'schema' => 1,
            'index' => 0,
            'receipt' => str_repeat('0', 64),
            'ack_public_media' => false,
        ])->get_status() >= 400,
        'Bad receipt accepted',
    );
    $payload = [
        'schema' => 1,
        'index' => 0,
        'receipt' => $preview['receipt'],
        'ack_public_media' => false,
    ];
    $first = batch_ok(batch_rest('batch/' . $job['token'] . '/confirm', $payload));
    batch_check($first['state'] === 'saved', 'First save state');
    $posts[] = $first['post_id'];
    $retry = batch_ok(batch_rest('batch/' . $job['token'] . '/confirm', $payload));
    batch_check(
        $retry['post_id'] === $first['post_id'],
        'Duplicate confirmation created another post',
    );
    $post = get_post($first['post_id']);
    batch_check(
        $post->post_status === 'draft' && $post->post_content_filtered === $source,
        'Draft/status/source',
    );
    $pair = mbb_convert([
        'mode' => 'paired_restore',
        'documentId' => mbb_id($post->ID),
        'source' => $post->post_content_filtered,
        'serialized' => $post->post_content,
    ]);
    batch_check(!is_wp_error($pair), 'Saved pair invalid');
    // Simulate a lost successful response, using the actual committed provenance.
    $dir = mbb_batch_directory($job['token']);
    $record = mbb_batch_record($dir);
    $record['items'][0]['state'] = 'committing';
    unset($record['items'][0]['post_id']);
    mbb_resource_write_json($dir, $record);
    $restored = batch_ok(batch_rest('batch/' . $job['token'], null, 'GET'));
    batch_check(
        $restored['items'][0]['post_id'] === $first['post_id'],
        'Lost response did not recover exact draft',
    );
    $imagePreview = batch_ok(
        batch_rest('batch/' . $job['token'] . '/preview', [
            'schema' => 1,
            'index' => 3,
            'title' => 'Image synthetic draft',
        ]),
    );
    batch_check(count($imagePreview['images']) === 1, 'Image preview missing');
    $imagePayload = [
        'schema' => 1,
        'index' => 3,
        'receipt' => $imagePreview['receipt'],
        'ack_public_media' => false,
    ];
    batch_check(
        batch_rest('batch/' . $job['token'] . '/confirm', $imagePayload)->get_status() >= 400,
        'Media acknowledgement omitted',
    );
    $imagePayload['ack_public_media'] = true;
    $imageResult = batch_ok(batch_rest('batch/' . $job['token'] . '/confirm', $imagePayload));
    batch_check($imageResult['state'] === 'saved', 'Image save state');
    $posts[] = $imageResult['post_id'];
    $attachments = get_posts([
        'post_type' => 'attachment',
        'post_status' => 'inherit',
        'post_parent' => $imageResult['post_id'],
        'numberposts' => 10,
        'fields' => 'ids',
    ]);
    batch_check(count($attachments) === 1, 'Media ownership/parent mismatch');
    $posts = array_merge($posts, $attachments);
    $imagePost = get_post($imageResult['post_id']);
    batch_check(
        !str_contains($imagePost->post_content_filtered, 'mbb-import/') &&
            str_contains($imagePost->post_content_filtered, '/uploads/'),
        'Final image source was not rewritten',
    );
    $dir = mbb_batch_directory($job['token']);
    $m = mbb_batch_record($dir);
    $m['items'][2]['state'] = 'committing';
    mbb_resource_write_json($dir, $m);
    $uncertain = batch_ok(batch_rest('batch/' . $job['token'], null, 'GET'));
    batch_check($uncertain['items'][2]['state'] === 'review', 'Unknown commit was auto-retried');
    $unknown = batch_ok(
        batch_rest('batch/' . $job['token'] . '/confirm', [
            'schema' => 1,
            'index' => 2,
            'receipt' => str_repeat('0', 64),
            'ack_public_media' => false,
        ]),
    );
    batch_check($unknown['state'] === 'review', 'Uncertain item duplicated');
    $m = mbb_batch_record($dir);
    $originalExpiry = $m['expires'];
    $m['expires'] = time() - 1;
    mbb_resource_write_json($dir, $m);
    $pinned = batch_ok(batch_rest('batch/' . $job['token'], null, 'GET'));
    batch_check(
        $pinned['items'][2]['state'] === 'review' && is_dir($dir),
        'Uncertain expired evidence disappeared',
    );
    batch_check(
        batch_rest('batch/' . $job['token'] . '/preview', [
            'schema' => 1,
            'index' => 2,
            'title' => 'Expired',
        ])->get_status() >= 400,
        'Expired pinned batch accepted a new preview',
    );
    $m = mbb_batch_record($dir);
    $m['expires'] = $originalExpiry;
    $m['items'][2]['state'] = 'ready';
    unset($m['items'][2]['error']);
    mbb_resource_write_json($dir, $m); // End the artificial pre-transaction interruption.
    $canceled = batch_ok(batch_rest('batch/' . $job['token'], null, 'DELETE'));
    batch_check(
        $canceled['state'] === 'cancelled' && get_post($first['post_id']),
        'Cancel removed a saved draft',
    );
    batch_check(
        batch_rest('batch/' . $job['token'] . '/preview', [
            'schema' => 1,
            'index' => 2,
            'title' => 'No',
        ])->get_status() >= 400,
        'Canceled item resumed',
    );
    // Expiry, unknown/tampered staging and budgets remain closed before writes.
    $plain = [
        'name' => ['expired.md'],
        'tmp_name' => [$paths[0]],
        'error' => [0],
        'size' => [strlen($source)],
        'type' => ['text/markdown'],
    ];
    $expires = batch_ok(batch_rest('batch/prepare', null, 'POST', ['documents' => $plain]));
    $tokens[] = $expires['token'];
    $dir = mbb_batch_directory($expires['token']);
    $m = mbb_batch_record($dir);
    $m['expires'] = time() - 1;
    mbb_resource_write_json($dir, $m);
    batch_check(
        batch_rest('batch/' . $expires['token'], null, 'GET')->get_status() === 410,
        'Expired batch accepted',
    );
    $tooMany = $plain;
    foreach ($tooMany as $k => $v) {
        $tooMany[$k] = array_fill(0, 11, $v[0]);
    }
    batch_check(
        batch_rest('batch/prepare', null, 'POST', ['documents' => $tooMany])->get_status() >= 400,
        '11 item budget accepted',
    );
    $ten = $plain;
    foreach ($ten as $k => $v) {
        $ten[$k] = array_fill(0, 10, $v[0]);
    }
    $tenJob = batch_ok(batch_rest('batch/prepare', null, 'POST', ['documents' => $ten]));
    $tokens[] = $tenJob['token'];
    batch_check(count($tenJob['items']) === 10, 'Ten item admission');
    $second = batch_ok(batch_rest('batch/prepare', null, 'POST', ['documents' => $plain]));
    $tokens[] = $second['token'];
    batch_check(
        batch_rest('batch/prepare', null, 'POST', ['documents' => $plain])->get_status() === 409,
        'Per-actor quota',
    );
    foreach ([$tenJob, $second] as $c) {
        batch_ok(batch_rest('batch/' . $c['token'], null, 'DELETE'));
    }
    $large = tempnam(sys_get_temp_dir(), 'mbb-batch-owned-');
    $paths[] = $large;
    $f = fopen($large, 'wb');
    ftruncate($f, 6291456);
    fclose($f);
    chmod($large, 0600);
    $oversize = [
        'name' => ['one.zip', 'two.zip', 'three.zip'],
        'tmp_name' => [$large, $large, $large],
        'error' => [0, 0, 0],
        'size' => [6291456, 6291456, 6291456],
    ];
    batch_check(
        batch_rest('batch/prepare', null, 'POST', ['documents' => $oversize])->get_status() >= 400,
        'Total upload budget',
    );
    wp_set_current_user($users[2]);
    $contributor = batch_ok(batch_rest('batch/prepare', null, 'POST', ['documents' => $plain]));
    $tokens[] = $contributor['token'];
    $contribPreview = batch_ok(
        batch_rest('batch/' . $contributor['token'] . '/preview', [
            'schema' => 1,
            'index' => 0,
            'title' => 'Contributor draft',
        ]),
    );
    $contribResult = batch_ok(
        batch_rest('batch/' . $contributor['token'] . '/confirm', [
            'schema' => 1,
            'index' => 0,
            'receipt' => $contribPreview['receipt'],
            'ack_public_media' => false,
        ]),
    );
    $posts[] = $contribResult['post_id'];
    batch_check(
        get_post($contribResult['post_id'])->post_status === 'draft',
        'Contributor published',
    );
    echo 'Actual ' .
        mbb_converter_settings()['backend'] .
        " batch scan, duplicate warnings, private actor scope, paired drafts, retry/recovery, media receipt/parent, partial cancel, expiry, budgets and contributor checks passed.\n";
} finally {
    foreach ($posts as $id) {
        if (get_post_type($id) === 'attachment') {
            wp_delete_attachment($id, true);
        } else {
            wp_delete_post($id, true);
        }
    }
    foreach ($tokens as $token) {
        try {
            $dir = mbb_batch_directory($token);
            $m = mbb_batch_record($dir, false, false);
            mbb_batch_remove_files($dir, $m);
            foreach (['manifest.json', 'lock'] as $f) {
                if (is_file($dir . '/' . $f)) {
                    unlink($dir . '/' . $f);
                }
            }
            rmdir($dir);
        } catch (Throwable $e) {
        }
    }
    foreach ($paths as $path) {
        if (is_file($path)) {
            unlink($path);
        }
    }
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach ($users as $user) {
        wp_delete_user($user);
    }
    wp_set_current_user($prior);
}
