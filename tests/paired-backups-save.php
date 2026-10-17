<?php
// Execute through wp eval-file only in an explicitly identified disposable local lab.
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
        'Paired backup checks require the explicitly identified local synthetic lab.',
    );
}
function backup_assert($v, $msg)
{
    if (!$v) {
        throw new RuntimeException($msg);
    }
}
function backup_request($method, $data)
{
    $r = new WP_REST_Request($method, '/mbb/v1/paired-backups');
    foreach ($data as $k => $v) {
        $r->set_param($k, $v);
    }
    return rest_do_request($r);
}
$previous = get_current_user_id();
$user = 0;
$post = 0;
$file = $mapping = $sourceKey = null;
try {
    $user = wp_insert_user([
        'user_login' => 'paired-backup-' . wp_generate_password(12, false),
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    backup_assert(!is_wp_error($user), 'author');
    wp_set_current_user($user);
    $doc = mbb_convert([
        'mode' => 'markdown',
        'source' => "# Baseline\n\nSaved text.\n",
        'documentId' => 'BACKUP_TEST',
    ]);
    backup_assert(!is_wp_error($doc), 'conversion');
    $post = wp_insert_post(
        wp_slash([
            'post_title' => 'Synthetic paired backup',
            'post_status' => 'draft',
            'post_author' => $user,
            'post_content' => $doc['serialized'],
            'post_content_filtered' => $doc['source'],
        ]),
        true,
    );
    backup_assert(!is_wp_error($post), 'post');
    update_post_meta($post, '_mbb_origin', 'markdown_import');
    update_post_meta($post, '_mbb_document_id', 'BACKUP_TEST');
    $before = get_post($post, ARRAY_A);
    $list = backup_request('GET', ['post_id' => $post]);
    backup_assert($list->get_status() === 200, 'list');
    $context = $list->get_data()['context'];
    $input = [
        'post_id' => $post,
        'context' => $context,
        'expected' => $context['expected'],
        'mode' => 'markdown',
        'source' => "# Candidate\n\nUnsaved text.\n",
        'title' => 'Unsaved title',
        'status' => 'draft',
        'featured_media' => 0,
    ];
    $made = backup_request('POST', $input);
    backup_assert(
        $made->get_status() === 200,
        'backup create: ' . wp_json_encode($made->get_data()),
    );
    backup_assert(get_post($post, ARRAY_A) === $before, 'backup did not mutate post');
    $key = $made->get_data()['items'][0]['key'];
    $prepared = backup_request('POST', ['post_id' => $post, 'key' => $key, 'context' => $context]);
    backup_assert(
        $prepared->get_status() === 200 &&
            str_contains($prepared->get_data()['payload']['content'], 'Unsaved text.'),
        'prepare',
    );
    backup_assert(get_post($post, ARRAY_A) === $before, 'prepare did not mutate post');
    $bad = $input;
    $bad['source'] = ':::mbb:v1 not-valid {}';
    backup_assert(backup_request('POST', $bad)->get_status() >= 400, 'invalid conversion rejected');
    // A source binding is private and disposable; both create and prepare must leave it untouched.
    $file = tempnam(sys_get_temp_dir(), 'mbb-backup-source-');
    backup_assert(
        $file &&
            realpath($file) &&
            !str_starts_with(realpath($file), realpath(ABSPATH) . DIRECTORY_SEPARATOR),
        'source outside Web root',
    );
    chmod($file, 0600);
    file_put_contents($file, $doc['source']);
    update_post_meta($post, '_mbb_source_managed', 'file');
    update_post_meta($post, '_mbb_source_path_hash', hash('sha256', realpath($file)));
    $mapping = static fn($target, $item) => (int) $item->ID === $post ? $file : $target;
    add_filter('mbb_source_write_target', $mapping, 10, 2);
    $bound = backup_request('GET', ['post_id' => $post])->get_data()['context'];
    backup_assert(
        $bound['sourceManaged'] && $bound['sourceDigest'] === hash_file('sha256', $file),
        'bound source digest',
    );
    $boundInput = $input;
    $boundInput['context'] = $bound;
    $boundInput['expected'] = $bound['expected'];
    $boundMade = backup_request('POST', $boundInput);
    backup_assert($boundMade->get_status() === 200, 'source-bound create');
    $boundItems = array_values(
        array_filter($boundMade->get_data()['items'], static fn($item) => $item['key'] !== $key),
    );
    backup_assert(count($boundItems) === 1, 'new bound backup identified');
    $sourceKey = $boundItems[0]['key'];
    backup_assert(
        backup_request('POST', [
            'post_id' => $post,
            'key' => $sourceKey,
            'context' => $bound,
        ])->get_status() === 200,
        'source-bound prepare',
    );
    backup_assert(
        file_get_contents($file) === $doc['source'] && get_post($post, ARRAY_A) === $before,
        'source backup/prepare leave source and post untouched',
    );
    $external = $doc['source'] . "\nExternal synthetic source change.\n";
    file_put_contents($file, $external);
    $fresh = backup_request('GET', ['post_id' => $post])->get_data()['context'];
    foreach ([$bound, $fresh] as $check) {
        backup_assert(
            backup_request('POST', [
                'post_id' => $post,
                'key' => $sourceKey,
                'context' => $check,
            ])->get_status() === 409,
            'old source record rejects both stale and fresh context',
        );
    }
    backup_assert(
        file_get_contents($file) === $external && get_post($post, ARRAY_A) === $before,
        'external source retained',
    );
    backup_request('DELETE', ['post_id' => $post, 'key' => $sourceKey]);
    $sourceKey = null;
    wp_set_current_user(0);
    backup_assert(
        backup_request('GET', ['post_id' => $post])->get_status() >= 400,
        'anonymous denied',
    );
    wp_set_current_user($user);
    update_post_meta($post, '_mbb_source_path_hash', 'changed-identity');
    backup_assert(
        backup_request('POST', [
            'post_id' => $post,
            'key' => $key,
            'context' => $context,
        ])->get_status() >= 400,
        'changed identity rejected',
    );
    backup_request('DELETE', ['post_id' => $post, 'key' => $key]);
    echo "paired backups real WordPress OK\n";
} finally {
    if ($sourceKey && $post) {
        backup_request('DELETE', ['post_id' => $post, 'key' => $sourceKey]);
    }
    if ($mapping) {
        remove_filter('mbb_source_write_target', $mapping, 10);
    }
    if ($file && is_file($file)) {
        unlink($file);
    }
    if ($post) {
        wp_delete_post($post, true);
    }
    if ($user) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
}
