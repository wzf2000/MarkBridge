<?php
// wp eval-file, only against an explicitly identified disposable local WordPress.
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
$previous = get_current_user_id();
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
            'source' => "# Synthetic chapter\n\nSaved body $n.\n",
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
    mbb_collections_finish_download(spl_object_id($response));
    $response = null;
    $made = collection_request('POST', '/prepare', $prepare)->get_data();
    collection_assert(isset($made['token']), 'second candidate');
    $tokens[] = $made['token'];
    wp_update_post(['ID' => $posts[0], 'post_title' => 'Changed after preparation']);
    collection_assert(
        collection_request('POST', '/jobs/' . $made['token'] . '/confirm', [
            'schema' => 1,
            'receipt' => $made['receipt'],
        ])->get_status() === 409,
        'stale snapshot rejected',
    );
    wp_update_post(['ID' => $posts[0], 'post_title' => $before[0]['post_title']]);
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
    foreach ($posts as $i => $id) {
        $now = get_post($id, ARRAY_A);
        foreach (
            ['post_content', 'post_content_filtered', 'post_status', 'post_author']
            as $field
        ) {
            collection_assert($now[$field] === $before[$i][$field], 'article unchanged');
        }
    }
    echo "Collection real REST config/prepare/confirm/ZIP/no-body-write/owner/private/stale checks passed\n";
} finally {
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
