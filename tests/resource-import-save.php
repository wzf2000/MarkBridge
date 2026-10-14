<?php
global $wpdb;
// Explicit synthetic WordPress lab only; no real source files or remotely fetched images.
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
        'Resource tests require an explicitly identified local WordPress lab.',
    );
}
if (
    !function_exists('mbb_resource_prepare') ||
    !mbb_runtime_diagnostics()['ok'] ||
    !class_exists('ZipArchive') ||
    !class_exists('Normalizer') ||
    !function_exists('posix_geteuid')
) {
    throw new RuntimeException(
        'Compatible converter and zip/intl/POSIX/upload_files are required.',
    );
}
function ris_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function ris_call($endpoint, array $params, $method = 'POST', array $files = [])
{
    $r = new WP_REST_Request($method, '/mbb/v1/' . $endpoint);
    foreach ($params as $key => $value) {
        $r->set_param($key, $value);
    }
    if ($files) {
        $r->set_file_params($files);
    }
    return rest_do_request($r);
}
function ris_ok($response, $message)
{
    ris_assert(
        $response->get_status() === 200,
        $message . ': ' . wp_json_encode($response->get_data()),
    );
    return $response->get_data();
}
function ris_error($response, $code)
{
    ris_assert(
        $response->get_status() >= 400 && ($response->get_data()['code'] ?? null) === $code,
        'Expected ' . $code . ': ' . wp_json_encode($response->get_data()),
    );
}
function ris_png($width, $height)
{
    $chunk = static fn($type, $data) => pack('N', strlen($data)) .
        $type .
        $data .
        pack('N', crc32($type . $data));
    return "\x89PNG\r\n\x1a\n" .
        $chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0)) .
        $chunk('IDAT', gzcompress(str_repeat("\0" . str_repeat("\xff\0\0", $width), $height))) .
        $chunk('IEND', '');
}
function ris_zip($source, array $images): string
{
    $path = $GLOBALS['ris_private'] . '/' . bin2hex(random_bytes(8)) . '.zip';
    $zip = new ZipArchive();
    ris_assert($zip->open($path, ZipArchive::CREATE) === true, 'Cannot create synthetic ZIP');
    $zip->addFromString('lesson.md', $source);
    foreach ($images as $name => $contents) {
        $zip->addFromString($name, $contents);
    }
    $zip->close();
    return $path;
}
function ris_prepare($zip, array $scope): array
{
    $result = ris_ok(
        ris_call('resource-import/prepare', $scope, 'POST', [
            'archive' => ['tmp_name' => $zip, 'name' => 'synthetic.zip', 'error' => UPLOAD_ERR_OK],
        ]),
        'Prepare failed',
    );
    $GLOBALS['ris_tokens'][$result['token']] = true;
    return $result;
}
function ris_params(array $prepared, array $scope): array
{
    return array_merge(
        [
            'mode' => 'markdown',
            'title' => 'Resource form title',
            'source' => $prepared['source'],
            'post_status' => 'draft',
            'featured_media' => 0,
            'frontmatter_selected' => [],
            'resource_import' => [
                'schema' => 1,
                'token' => $prepared['token'],
                'ack_public_media' => true,
            ],
        ],
        $scope,
    );
}
function ris_preview(array $params): array
{
    $preview = ris_ok(ris_call('preview', $params), 'Resource preview failed');
    $params['frontmatter_receipt'] = $preview['frontmatter_receipt'];
    $params['resource_receipt'] = $preview['resource_receipt'];
    return [$params, $preview];
}
function ris_attachments(): array
{
    $ids = get_posts([
        'post_type' => 'attachment',
        'post_status' => 'inherit',
        'numberposts' => -1,
        'fields' => 'ids',
    ]);
    sort($ids);
    return $ids;
}
$suffix = bin2hex(random_bytes(6));
$previous = get_current_user_id();
$posts = $users = $hooks = [];
$GLOBALS['ris_private'] = sys_get_temp_dir() . '/mbb-resource-save-' . $suffix;
mkdir($GLOBALS['ris_private'], 0700);
$GLOBALS['ris_tokens'] = [];
$small = ris_png(48, 32);
$large = ris_png(2700, 900);
$sourceFile = null;
try {
    $author = wp_insert_user([
        'user_login' => 'resource-author-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    ris_assert(!is_wp_error($author), 'Cannot create synthetic author');
    $users[] = $author;
    wp_set_current_user($author);
    $baselineAttachments = ris_attachments();
    $header =
        "---\nmarkbridge: 1\ntitle: \"Image header title\"\nexcerpt: \"Image summary\"\n---\n";
    $body =
        "\n# Image lesson\n\n![small](images/small.png)\n\n![repeat](images/small.png)\n\n![large](images/large.png)\n\n[ordinary](images/small.png) and `![literal](images/small.png)`.\n\n```html\n<img src=\"images/small.png\">\n```\n\n- [ ] Task\n\nText $" .
        "x^2$ and note[^a].\n\n[^a]: Synthetic note.\n";
    $scope = ['post_id' => 0, 'documentId' => 'Resource' . $suffix, 'expected' => null];
    $prepared = ris_prepare(
        ris_zip($header . $body, ['images/small.png' => $small, 'images/large.png' => $large]),
        $scope,
    );
    ris_assert(ris_attachments() === $baselineAttachments, 'Prepare created media');
    $imageResponse = ris_call(
        'resource-import/' . $prepared['token'] . '/image/' . $prepared['images'][0]['key'],
        $scope,
        'GET',
    );
    ris_ok($imageResponse, 'Authenticated single-image read failed');
    ris_assert(
        isset($GLOBALS['mbb_resource_stream']) &&
            $imageResponse->get_data() === ['resourceStream' => $prepared['images'][0]['key']],
        'Single-image endpoint exposed a private filesystem path',
    );
    mbb_resource_release($GLOBALS['mbb_resource_stream']['context']);
    unset($GLOBALS['mbb_resource_stream']);
    $params = ris_params($prepared, $scope);
    $params['frontmatter_selected'] = ['title', 'excerpt'];
    [$params, $preview] = ris_preview($params);
    ris_assert(
        ris_attachments() === $baselineAttachments &&
            count($preview['resource_plan']['images']) === 2 &&
            str_contains($preview['resource_plan']['projectedDocument']['source'], 'mbb-import/'),
        'Preview wrote media or lost projected changes',
    );
    $ctx = mbb_resource_load($prepared['token']);
    $privateDir = $ctx['dir'];
    mbb_resource_release($ctx);
    ris_assert(
        !str_contains(wp_json_encode($prepared), $privateDir) &&
            !str_contains(wp_json_encode($preview), $privateDir),
        'Temporary path escaped to API',
    );
    $notAck = $params;
    $notAck['resource_import']['ack_public_media'] = false;
    ris_error(ris_call('save', $notAck), 'resource_receipt');
    ris_assert(ris_attachments() === $baselineAttachments, 'Rejected receipt wrote media');
    $saved = ris_ok(ris_call('save', $params), 'Actual media/pair save failed');
    $id = (int) $saved['post_id'];
    $posts[] = $id;
    $newImages = array_values(array_diff(ris_attachments(), $baselineAttachments));
    foreach ($newImages as $image) {
        $posts[] = $image;
    }
    ris_assert(
        count($newImages) === 2 && !is_dir($privateDir),
        'Repeated reference duplicated media or private staging survived success',
    );
    $post = get_post($id);
    ris_assert(
        $post->post_title === 'Image header title' && $post->post_excerpt === 'Image summary',
        'Media rewrite invalidated selected metadata',
    );
    ris_assert(
        parse_blocks($post->post_content)[0]['attrs']['raw'] === $header,
        'Image import rewrote raw header',
    );
    $urls = \MarkBridge\Probe\ResourceImages::urls($post->post_content);
    ris_assert(
        !str_contains($post->post_content_filtered, $prepared['token']),
        'Private staging token entered saved media URLs',
    );
    ris_assert(
        count($urls) === 2 && !str_contains($post->post_content_filtered, 'mbb-import/'),
        'Persisted body contains temporary markers',
    );
    $scaled = false;
    foreach ($newImages as $image) {
        $p = get_post($image);
        $meta = wp_get_attachment_metadata($image);
        ris_assert(
            (int) $p->post_author === $author &&
                (int) $p->post_parent === $id &&
                !mbb_managed($image) &&
                get_post_meta($image, '_mbb_document_id', true) === '',
            'Attachment inherited article identity or lost ownership',
        );
        ris_assert(
            in_array(wp_get_attachment_url($image), $urls, true) &&
                is_file(get_attached_file($image)),
            'Article did not use WordPress final URL',
        );
        if (!empty($meta['original_image'])) {
            $scaled = true;
            ris_assert(
                is_file(dirname(get_attached_file($image)) . '/' . $meta['original_image']),
                'Original was lost during scaling',
            );
        }
    }
    ris_assert($scaled, 'Large PNG did not exercise WordPress scaled-original path');
    ris_assert(
        str_contains($post->post_content_filtered, '[ordinary](<images/small.png>)') &&
            str_contains($post->post_content_filtered, '<img src="images/small.png">'),
        'Code or ordinary link target was rewritten',
    );
    ris_assert(
        !is_wp_error(
            mbb_convert([
                'mode' => 'paired_restore',
                'source' => $post->post_content_filtered,
                'serialized' => $post->post_content,
                'documentId' => mbb_id($id),
            ]),
        ),
        'Final media pair did not reopen',
    );

    // No-header receipts bind form metadata; another actor cannot read or cancel staging.
    $scope = ['post_id' => 0, 'documentId' => 'NoHeader' . $suffix, 'expected' => null];
    $prepared = ris_prepare(
        ris_zip("![small](images/small.png)\n", ['images/small.png' => $small]),
        $scope,
    );
    [$plain] = ris_preview(ris_params($prepared, $scope));
    foreach (
        [
            'title' => 'Different title',
            'post_status' => 'pending',
            'featured_media' => $newImages[0],
        ]
        as $key => $value
    ) {
        $bad = $plain;
        $bad[$key] = $value;
        ris_error(ris_call('save', $bad), 'resource_receipt');
    }
    $other = wp_insert_user([
        'user_login' => 'resource-other-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    ris_assert(!is_wp_error($other), 'Cannot create second actor');
    $users[] = $other;
    wp_set_current_user($other);
    ris_error(ris_call('resource-import/' . $prepared['token'], [], 'DELETE'), 'resource_gone');
    wp_set_current_user($author);
    ris_ok(ris_call('resource-import/' . $prepared['token'], [], 'DELETE'), 'Cancellation failed');
    $expired = ris_prepare(
        ris_zip("![small](images/small.png)\n", ['images/small.png' => $small]),
        $scope,
    );
    $expiredContext = mbb_resource_load($expired['token'], true);
    $expiredContext['manifest']['expires'] = time() - 1;
    mbb_resource_write_json($expiredContext['dir'], $expiredContext['manifest']);
    mbb_resource_release($expiredContext);
    ris_error(ris_call('preview', ris_params($expired, $scope)), 'resource_gone');
    mbb_resource_cleanup_expired(mbb_resource_owner_root());
    ris_assert(!is_dir($expiredContext['dir']), 'Expired private staging was not cleaned');
    $contributor = wp_insert_user([
        'user_login' => 'resource-contributor-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'contributor',
    ]);
    ris_assert(!is_wp_error($contributor), 'Cannot create upload permission fixture');
    $users[] = $contributor;
    wp_set_current_user($contributor);
    ris_error(
        ris_call('resource-import/prepare', $scope, 'POST', [
            'archive' => ['tmp_name' => ris_zip('x', []), 'error' => 0],
        ]),
        'resource_permission',
    );
    wp_set_current_user($author);
    $missing = $plain;
    unset($missing['resource_import'], $missing['resource_receipt']);
    $missing['requires_resources'] = $prepared['requirements'];
    ris_error(ris_call('preview', $missing), 'resource_required');
    $candidate = $missing;
    $candidate['source'] = "![existing-relative](existing.png)\n";
    ris_ok(ris_call('preview', $candidate), 'Unrelated relative media blanket-rejected');

    // Real failure hooks after originals/scaled/subsizes exist: only this batch must disappear.
    foreach (['second-image', 'verify', 'sql'] as $failure) {
        $scope = [
            'post_id' => 0,
            'documentId' => 'Fail' . str_replace('-', '', $failure) . $suffix,
            'expected' => null,
        ];
        $prepared = ris_prepare(
            ris_zip("![a](images/a.png)\n\n![b](images/b.png)\n", [
                'images/a.png' => $large,
                'images/b.png' => $small,
            ]),
            $scope,
        );
        [$attempt] = ris_preview(ris_params($prepared, $scope));
        $beforeImages = ris_attachments();
        $count = 0;
        $started = false;
        $imageFailure = static function ($metadata) use ($failure, &$count) {
            if ($failure === 'second-image' && ++$count === 2) {
                throw new RuntimeException('Synthetic Nth-image processing failure');
            }
            return $metadata;
        };
        $verifyFailure = static function ($data) use ($failure) {
            if ($failure === 'verify' && $data['post_type'] === 'post') {
                $data['post_title'] = 'Synthetic mismatch';
            }
            return $data;
        };
        $sqlFailure = static function ($sql) use ($failure, &$started) {
            if ($sql === 'START TRANSACTION') {
                $started = true;
            }
            if (
                $failure === 'sql' &&
                $started &&
                str_starts_with($sql, 'INSERT INTO') &&
                str_contains($sql, 'posts') &&
                str_contains($sql, "'post'")
            ) {
                throw new RuntimeException('Synthetic article SQL failure');
            }
            return $sql;
        };
        add_filter('wp_generate_attachment_metadata', $imageFailure);
        add_filter('wp_insert_post_data', $verifyFailure);
        add_filter('query', $sqlFailure);
        try {
            $result = ris_call('save', $attempt);
            ris_assert(
                $result->get_status() === 500,
                'Failure injection did not fail: ' .
                    $failure .
                    ' ' .
                    wp_json_encode($result->get_data()),
            );
        } finally {
            remove_filter('wp_generate_attachment_metadata', $imageFailure);
            remove_filter('wp_insert_post_data', $verifyFailure);
            remove_filter('query', $sqlFailure);
        }
        ris_assert(
            ris_attachments() === $beforeImages,
            'Rollback left new attachment rows: ' . $failure,
        );
        $uploads = wp_upload_dir();
        ris_assert(
            !is_dir(
                $uploads['basedir'] .
                    '/markbridge-imports/' .
                    mbb_resource_public_key($prepared['token']),
            ),
            'Rollback left original/scaled/subsize files: ' . $failure,
        );
        ris_ok(
            ris_call('resource-import/' . $prepared['token'], [], 'DELETE'),
            'Failed batch private cancellation failed',
        );
        foreach ($newImages as $image) {
            ris_assert(
                is_file(get_attached_file($image)),
                'Unrelated preexisting media was cleaned',
            );
        }
    }

    // COMMIT executes for real, but the outer query reports failure. Never compensate committed files.
    $scope = ['post_id' => 0, 'documentId' => 'CommitAck' . $suffix, 'expected' => null];
    $prepared = ris_prepare(ris_zip("![a](images/a.png)\n", ['images/a.png' => $large]), $scope);
    [$attempt] = ris_preview(ris_params($prepared, $scope));
    $committed = false;
    $ackFailure = static function ($sql) use (&$committed, $wpdb) {
        if ($sql === 'COMMIT' && !$committed) {
            ris_assert(mysqli_commit($wpdb->dbh), 'Synthetic underlying COMMIT failed');
            $committed = true;
            throw new RuntimeException('Synthetic lost COMMIT ACK');
        }
        return $sql;
    };
    add_filter('query', $ackFailure);
    try {
        ris_error(ris_call('save', $attempt), 'commit_uncertain');
    } finally {
        remove_filter('query', $ackFailure);
    }
    $committedIds = get_posts([
        'post_type' => 'post',
        'post_status' => 'draft',
        'numberposts' => 2,
        'fields' => 'ids',
        'meta_key' => '_mbb_document_id',
        'meta_value' => $scope['documentId'],
    ]);
    ris_assert(count($committedIds) === 1, 'Real COMMIT article was lost');
    $committedId = (int) $committedIds[0];
    $posts[] = $committedId;
    $committedImages = get_children([
        'post_parent' => $committedId,
        'post_type' => 'attachment',
        'fields' => 'ids',
    ]);
    foreach ($committedImages as $image) {
        $posts[] = $image;
        ris_assert(
            is_file(get_attached_file($image)),
            'Lost ACK compensation deleted committed media',
        );
    }
    ris_assert(
        count($committedImages) === 1 &&
            str_contains(get_post($committedId)->post_content_filtered, '/markbridge-imports/'),
        'Committed body/media not readable',
    );
    $ctx = mbb_resource_load($prepared['token']);
    ris_assert($ctx['manifest']['state'] === 'needs-review', 'Uncertain ACK discarded the journal');
    mbb_resource_release($ctx);
    ris_ok(
        ris_call('resource-import/' . $prepared['token'], [], 'DELETE'),
        'Rechecked complete commit did not safely finish journal',
    );

    // The guarded native REST transaction has the same lost-ACK distinction.
    $native = new WP_REST_Request('POST', '/wp/v2/posts/' . $id);
    $native->set_header('Content-Type', 'application/json');
    $native->set_body(
        wp_json_encode([
            'mbb_expected' => mbb_token(get_post($id)),
            'title' => 'Native committed title',
            'content' => get_post($id)->post_content,
        ]),
    );
    $committed = false;
    add_filter('query', $ackFailure);
    try {
        ris_error(rest_do_request($native), 'commit_uncertain');
    } finally {
        remove_filter('query', $ackFailure);
    }
    clean_post_cache($id);
    ris_assert(
        get_post($id)->post_title === 'Native committed title',
        'Native lost ACK rolled back or misreported a committed update',
    );

    // The shared source writer must not undo committed DB state or overwrite a third-party file edit.
    $sourceFile = $GLOBALS['ris_private'] . '/source.md';
    file_put_contents($sourceFile, get_post($id)->post_content_filtered);
    update_post_meta($id, '_mbb_source_managed', 'file');
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($sourceFile)));
    $mapping = static fn($target, $p) => (int) $p->ID === $id ? $sourceFile : $target;
    add_filter('mbb_source_write_target', $mapping, 10, 2);
    $hooks[] = ['mbb_source_write_target', $mapping, 10];
    $scope = [
        'post_id' => $id,
        'documentId' => mbb_id($id),
        'expected' => mbb_token(get_post($id)),
    ];
    ris_error(
        ris_call('resource-import/prepare', $scope, 'POST', [
            'archive' => ['tmp_name' => ris_zip('x', []), 'error' => 0],
        ]),
        'resource_source',
    );
    $sourceParams = [
        'mode' => 'markdown',
        'post_id' => $id,
        'documentId' => mbb_id($id),
        'expected' => mbb_token(get_post($id)),
        'title' => get_post($id)->post_title,
        'post_status' => 'draft',
        'featured_media' => 0,
        'source_sha256' => hash_file('sha256', $sourceFile),
        'source' => get_post($id)->post_content_filtered . "\nCommitted source update.\n",
    ];
    $committed = false;
    add_filter('query', $ackFailure);
    try {
        ris_error(ris_call('source-save', $sourceParams), 'commit_uncertain');
    } finally {
        remove_filter('query', $ackFailure);
    }
    clean_post_cache($id);
    ris_assert(
        get_post($id)->post_content_filtered === $sourceParams['source'] &&
            file_get_contents($sourceFile) === $sourceParams['source'],
        'Lost COMMIT ACK split source from committed article',
    );
    $sourceParams['expected'] = mbb_token(get_post($id));
    $sourceParams['source_sha256'] = hash_file('sha256', $sourceFile);
    $sourceParams['source'] .= "\nFailed candidate.\n";
    $external = static function ($sql) use ($sourceFile) {
        if ($sql === 'START TRANSACTION') {
            file_put_contents($sourceFile, "External third draft.\n");
            throw new RuntimeException('Synthetic failure after external source edit');
        }
        return $sql;
    };
    add_filter('query', $external);
    try {
        ris_error(ris_call('source-save', $sourceParams), 'source_restore_failed');
    } finally {
        remove_filter('query', $external);
    }
    ris_assert(
        file_get_contents($sourceFile) === "External third draft.\n",
        'Failure cleanup overwrote a third-party source edit',
    );
    echo 'Resource import ' .
        mbb_converter_backend() .
        " actual ZIP preview/media/metadata/permissions/cleanup/scaled originals/COMMIT ACK/source protection passed.\n";
} finally {
    foreach ($hooks as [$name, $callback, $priority]) {
        remove_filter($name, $callback, $priority);
    }
    if (isset($author) && is_int($author)) {
        wp_set_current_user($author);
    }
    foreach ($GLOBALS['ris_tokens'] as $token => $_) {
        try {
            $ctx = mbb_resource_load($token, true);
            try {
                mbb_resource_discard($ctx);
            } finally {
                mbb_resource_release($ctx);
            }
        } catch (Throwable $error) {
        }
    }
    foreach (array_unique($posts) as $post) {
        clean_post_cache($post);
        get_post_type($post) === 'attachment'
            ? wp_delete_attachment($post, true)
            : wp_delete_post($post, true);
    }
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach ($users as $user) {
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
    foreach (scandir($GLOBALS['ris_private']) as $name) {
        if ($name !== '.' && $name !== '..') {
            unlink($GLOBALS['ris_private'] . '/' . $name);
        }
    }
    rmdir($GLOBALS['ris_private']);
}
