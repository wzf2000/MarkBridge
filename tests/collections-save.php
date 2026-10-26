<?php
// wp eval-file, only against an explicitly identified disposable local WordPress.
if (PHP_SAPI !== 'cli' || !defined('WP_CLI') || !WP_CLI || !defined('ABSPATH')) {
    throw new RuntimeException('Run collection save checks only through local WP-CLI.');
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
    throw new RuntimeException(
        'Collection checks require the explicitly identified disposable local lab.',
    );
}
function collection_assert($value, string $message): void
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function collection_request(string $method, string $path, array $data = []): WP_REST_Response
{
    $r = new WP_REST_Request($method, '/mbb/v1/collections' . $path);
    if ($method === 'GET') {
        foreach ($data as $k => $v) {
            $r->set_param($k, $v);
        }
    } else {
        $r->set_header('Content-Type', 'application/json');
        $r->set_body(wp_json_encode($data));
    }
    return rest_do_request($r);
}
// Exercise the real paired editing API. A bare wp_update_post on a managed
// article is deliberately rejected by the ordinary pair guard, so it cannot
// manufacture a stale snapshot fixture.
function collection_bridge_request(string $route, array $data): WP_REST_Response
{
    $request = new WP_REST_Request('POST', '/mbb/v1/' . $route);
    $request->set_header('Content-Type', 'application/json');
    $request->set_body(wp_json_encode($data));
    foreach ($data as $key => $value) {
        $request->set_param($key, $value);
    }
    return rest_do_request($request);
}
function collection_save_title(int $id, string $title): void
{
    $request = new WP_REST_Request('GET', '/mbb/v1/document');
    $request->set_param('post_id', $id);
    $response = rest_do_request($request);
    collection_assert(
        $response->get_status() === 200,
        'title edit context: ' . wp_json_encode($response->get_data()),
    );
    $context = $response->get_data();
    collection_assert(empty($context['source_managed']), 'synthetic article has no bound source');
    clean_post_cache($id);
    $before = get_post($id, ARRAY_A);
    $cover = (int) get_post_thumbnail_id($id);
    collection_assert(
        $context['document']['source'] === $before['post_content_filtered'],
        'title edit keeps the current source baseline',
    );
    $payload = [
        'post_id' => $id,
        'expected' => $context['expected'],
        'documentId' => $context['document']['documentId'],
        'mode' => 'markdown',
        'source' => $context['document']['source'],
        'title' => $title,
        'post_status' => $context['post_status'],
        'featured_media' => $cover,
    ];
    $preview = collection_bridge_request('preview', $payload);
    collection_assert(
        $preview->get_status() === 200,
        'title edit preview: ' . wp_json_encode($preview->get_data()),
    );
    $view = $preview->get_data();
    foreach (['adapter_digest', 'resource_receipt', 'frontmatter_receipt'] as $field) {
        $payload[$field] = $view[$field] ?? null;
    }
    $saved = collection_bridge_request('save', $payload);
    collection_assert(
        $saved->get_status() === 200,
        'title edit paired save: ' . wp_json_encode($saved->get_data()),
    );
    clean_post_cache($id);
    $after = get_post($id, ARRAY_A);
    collection_assert(
        $after['post_title'] === $title,
        'paired title edit actually changed the title',
    );
    foreach (['post_content', 'post_content_filtered', 'post_status', 'post_author'] as $field) {
        collection_assert(
            $after[$field] === $before[$field],
            'title-only paired save preserved ' . $field,
        );
    }
    collection_assert(
        (int) get_post_thumbnail_id($id) === $cover,
        'title edit preserved the current cover',
    );
}
$previous = get_current_user_id();
$previousOrigin = $_SERVER['HTTP_ORIGIN'] ?? null;
$users = [];
$posts = [];
$tokens = [];
$response = null;
try {
    foreach ([1, 2] as $n) {
        $u = wp_insert_user([
            'user_login' => 'collection-' . wp_generate_password(12, false),
            'user_pass' => wp_generate_password(32),
            'role' => 'author',
        ]);
        collection_assert(!is_wp_error($u), 'author');
        $users[] = $u;
    }
    wp_set_current_user($users[0]);
    foreach (['publish', 'draft'] as $n => $status) {
        $doc = mbb_convert([
            'mode' => 'markdown',
            'source' =>
                "# Synthetic chapter\n\nSaved body $n.\n\n" .
                ':::mbb:v1 object {"id":"eq-book","kind":"equation","caption":"Publication equation"}' .
                "\n\n$$\nx^2\n$$\n\n:::mbb:end\n\n" .
                '<span class="mbb-xref" data-mbb-target="eq-book" data-mbb-version="1">[eq-book]</span> <a href="#eq-book">Author-selected equation link</a>' .
                "\n",
            'documentId' => 'COLLECTION_TEST_' . $n,
        ]);
        collection_assert(!is_wp_error($doc), 'conversion');
        $id = wp_insert_post(
            wp_slash([
                'post_title' => 'Synthetic collection ' . $n,
                'post_author' => $users[0],
                'post_status' => $status,
                'post_content' => $doc['serialized'],
                'post_content_filtered' => $doc['source'],
            ]),
            true,
        );
        collection_assert(!is_wp_error($id), 'synthetic post');
        $posts[] = $id;
        update_post_meta($id, '_mbb_origin', 'markdown_import');
        update_post_meta($id, '_mbb_document_id', 'COLLECTION_TEST_' . $n);
    }
    $before = array_map(fn($id) => get_post($id, ARRAY_A), $posts);
    $config = [
        'schema' => 1,
        'title' => 'Synthetic collection',
        'lang' => 'en-US',
        'rights' => 'Synthetic only',
        'cover' => null,
        'privateOptIn' => false,
        'chapters' => [['key' => 'C_' . bin2hex(random_bytes(16)), 'post_id' => $posts[0]]],
    ];
    $context = collection_request('GET', '')->get_data();
    $saved = collection_request('POST', '', [
        'schema' => 1,
        'revision' => $context['revision'],
        'collection_id' => null,
        'config' => $config,
    ]);
    collection_assert(
        $saved->get_status() === 200,
        'configuration: ' . wp_json_encode($saved->get_data()),
    );
    $saved = $saved->get_data();
    $prepare = [
        'schema' => 1,
        'collection_id' => $saved['collection_id'],
        'revision' => $saved['revision'],
        'adapter' => 'snapshot-v1',
    ];
    $made = collection_request('POST', '/prepare', $prepare);
    collection_assert($made->get_status() === 200, 'prepare: ' . wp_json_encode($made->get_data()));
    $made = $made->get_data();
    $tokens[] = $made['token'];
    wp_set_current_user($users[1]);
    collection_assert(
        collection_request('GET', '/' . $saved['collection_id'])->get_status() === 404,
        'owner isolation',
    );
    collection_assert(
        collection_request('POST', '/jobs/' . $made['token'] . '/confirm', [
            'schema' => 1,
            'receipt' => $made['receipt'],
        ])->get_status() === 404,
        'candidate isolation',
    );
    wp_set_current_user($users[0]);
    $confirm = collection_request('POST', '/jobs/' . $made['token'] . '/confirm', [
        'schema' => 1,
        'receipt' => $made['receipt'],
    ]);
    collection_assert($confirm->get_status() === 200, 'confirm');
    $response = collection_request('POST', '/jobs/' . $made['token'] . '/download', [
        'schema' => 1,
        'receipt' => $made['receipt'],
    ]);
    collection_assert(
        $response->get_status() === 200 &&
            ($response->get_headers()['X-MBB-Collection'] ?? '') === '1',
        'download',
    );
    $stream = $GLOBALS['mbb_collection_downloads'][spl_object_id($response)] ?? null;
    collection_assert($stream !== null, 'stream handle');
    $hash = hash_init('sha256');
    hash_update_stream($hash, $stream['handle']);
    collection_assert(hash_final($hash) === $made['artifact']['sha256'], 'ZIP SHA');
    $zip = new ZipArchive();
    collection_assert($zip->open($stream['dir'] . '/artifact') === true, 'ZIP open');
    $manifest = json_decode($zip->getFromName('manifest.json'), true);
    collection_assert($manifest['schema'] === 1 && count($manifest['chapters']) === 1, 'manifest');
    collection_assert(!str_contains($zip->getFromName('manifest.json'), 'post_id'), 'no post id');
    $zip->close();
    $corePriority = has_filter('rest_pre_serve_request', 'rest_send_cors_headers');
    collection_assert($corePriority !== false, 'real core CORS filter registered');
    foreach (['mbb_collections_serve', 'mbb_collections_client_serve'] as $handler) {
        $priority = has_filter('rest_pre_serve_request', $handler);
        collection_assert(
            is_int($priority) && $priority > $corePriority,
            'body handler follows core CORS: ' . $handler,
        );
    }
    $_SERVER['HTTP_ORIGIN'] = home_url();
    $serveRequest = new WP_REST_Request(
        'POST',
        '/mbb/v1/collections/jobs/' . $made['token'] . '/download',
    );
    rewind($stream['handle']);
    set_error_handler(static function ($level, $message, $file, $line) {
        if (str_contains($message, 'Cannot modify header information')) {
            throw new ErrorException($message, 0, $level, $file, $line);
        }
        return false;
    }, E_WARNING);
    ob_start();
    try {
        $served = apply_filters(
            'rest_pre_serve_request',
            false,
            $response,
            $serveRequest,
            rest_get_server(),
        );
        $binary = ob_get_contents();
    } finally {
        ob_end_clean();
        restore_error_handler();
    }
    collection_assert(
        $served === true && hash('sha256', $binary) === $made['artifact']['sha256'],
        'real Origin filter chain serves exact ZIP without header warnings',
    );
    collection_assert(
        !isset($GLOBALS['mbb_collection_downloads'][spl_object_id($response)]),
        'filter stream cleaned',
    );
    $response = null;
    $made = collection_request('POST', '/prepare', $prepare)->get_data();
    collection_assert(isset($made['token']), 'second candidate');
    $tokens[] = $made['token'];
    collection_save_title($posts[0], 'Changed after preparation');
    collection_assert(
        get_post_field('post_title', $posts[0], 'raw') !== $before[0]['post_title'],
        'stale test title differs from the prepared snapshot',
    );
    collection_assert(
        collection_request('POST', '/jobs/' . $made['token'] . '/confirm', [
            'schema' => 1,
            'receipt' => $made['receipt'],
        ])->get_status() === 409,
        'stale snapshot rejected',
    );
    collection_save_title($posts[0], $before[0]['post_title']);
    collection_assert(
        get_post_field('post_title', $posts[0], 'raw') === $before[0]['post_title'],
        'paired title restoration completed',
    );
    $config['chapters'][] = ['key' => 'C_' . bin2hex(random_bytes(16)), 'post_id' => $posts[1]];
    collection_assert(
        collection_request('POST', '', [
            'schema' => 1,
            'revision' => $saved['revision'],
            'collection_id' => $saved['collection_id'],
            'config' => $config,
        ])->get_status() === 422,
        'private opt-in required',
    );
    $config['privateOptIn'] = true;
    $saved = collection_request('POST', '', [
        'schema' => 1,
        'revision' => $saved['revision'],
        'collection_id' => $saved['collection_id'],
        'config' => $config,
    ])->get_data();
    collection_assert(isset($saved['revision']), 'explicit selected private');
    $v2 = $config + [
        'authors' => ['Synthetic Author'],
        'edition' => 'Edition 1',
        'versionStatement' => 'Reviewed locally',
        'numbering' => 'chapter',
    ];
    $v2['schema'] = 2;
    $v2['chapters'][0]['role'] = 'body';
    $v2['chapters'][1]['role'] = 'appendix';
    $savedV2 = collection_request('POST', '', [
        'schema' => 1,
        'revision' => $saved['revision'],
        'collection_id' => $saved['collection_id'],
        'config' => $v2,
    ]);
    collection_assert($savedV2->get_status() === 200, 'schema two configuration saved');
    $savedV2 = $savedV2->get_data();
    $preparedV2 = collection_request('POST', '/prepare', [
        'schema' => 1,
        'collection_id' => $savedV2['collection_id'],
        'revision' => $savedV2['revision'],
        'adapter' => 'snapshot-v1',
    ]);
    collection_assert($preparedV2->get_status() === 200, 'schema two prepared');
    $preparedV2 = $preparedV2->get_data();
    $tokens[] = $preparedV2['token'];
    $dir = mbb_collections_directory($preparedV2['token']);
    $manifestV2 = json_decode(
        file_get_contents($dir . '/manifest.json'),
        true,
        64,
        JSON_THROW_ON_ERROR,
    );
    collection_assert(
        $manifestV2['schema'] === 2 &&
            $manifestV2['authors'] === ['Synthetic Author'] &&
            $manifestV2['edition'] === 'Edition 1',
        'actual frozen metadata',
    );
    foreach (['1.1', 'A.1'] as $i => $number) {
        collection_assert(
            $manifestV2['chapters'][$i]['objects'][0]['number'] === $number,
            'actual object metadata chapter number',
        );
        $body = file_get_contents($dir . '/' . basename($manifestV2['chapters'][$i]['path']));
        collection_assert(
            str_contains($body, $number . '. ') &&
                str_contains($body, $number . '</a>') &&
                str_contains($body, 'Author-selected equation link'),
            'actual body/automatic reference number and authored anchor',
        );
    }
    $v2['edition'] = 'Edition 2';
    $changedV2 = collection_request('POST', '', [
        'schema' => 1,
        'revision' => $savedV2['revision'],
        'collection_id' => $savedV2['collection_id'],
        'config' => $v2,
    ]);
    collection_assert($changedV2->get_status() === 200, 'changed publication metadata saved');
    collection_assert(
        collection_request('POST', '/jobs/' . $preparedV2['token'] . '/confirm', [
            'schema' => 1,
            'receipt' => $preparedV2['receipt'],
        ])->get_status() === 409,
        'old metadata candidate cannot confirm',
    );
    collection_request('DELETE', '/jobs/' . $preparedV2['token']);
    mbb_register_publication_adapter('legacy-save-fixture', [
        'contract' => 'mbb-publication-adapter/v1',
        'version' => '0.3.0',
        'fingerprint' => str_repeat('d', 64),
        'title' => 'Legacy save fixture',
        'extension' => 'zip',
        'mime' => 'application/zip',
        'build' => 'mbb_collections_snapshot_zip',
    ]);
    $changedV2 = $changedV2->get_data();
    collection_assert(
        collection_request('POST', '/prepare', [
            'schema' => 1,
            'collection_id' => $changedV2['collection_id'],
            'revision' => $changedV2['revision'],
            'adapter' => 'legacy-save-fixture',
        ])->get_status() === 422,
        'old provider refuses schema two in actual REST',
    );
    foreach ($posts as $i => $id) {
        $now = get_post($id, ARRAY_A);
        foreach (
            ['post_content', 'post_content_filtered', 'post_status', 'post_author']
            as $field
        ) {
            collection_assert($now[$field] === $before[$i][$field], 'article unchanged');
        }
    }
    echo "Collection real REST config/prepare/confirm/ZIP/no-body-write/owner/private/stale/schema2-metadata-and-numbering checks passed\n";
} finally {
    if ($previousOrigin === null) {
        unset($_SERVER['HTTP_ORIGIN']);
    } else {
        $_SERVER['HTTP_ORIGIN'] = $previousOrigin;
    }
    if ($response) {
        mbb_collections_finish_download(spl_object_id($response));
    }
    if ($users) {
        wp_set_current_user($users[0]);
        foreach ($tokens as $token) {
            collection_request('DELETE', '/jobs/' . $token);
        }
        delete_option(mbb_collections_key($users[0]));
    }
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach ($posts as $id) {
        wp_delete_post($id, true);
    }
    foreach ($users as $u) {
        wp_delete_user($u);
    }
    wp_set_current_user($previous);
}
