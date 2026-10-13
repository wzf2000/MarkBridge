<?php
// Guarded synthetic WordPress contract. Merge endpoints are strictly read-only.
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
    throw new RuntimeException('Merge tests require an explicitly identified local lab');
}
if (!function_exists('mbb_merge_open') || !mbb_runtime_diagnostics()['ok']) {
    throw new RuntimeException('Current merge candidate required');
}
function mgs_assert($condition, $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function mgs_call($route, array $params)
{
    $r = new WP_REST_Request('POST', $route);
    $r->set_header('Content-Type', 'application/json');
    $r->set_body(wp_json_encode($params));
    return rest_do_request($r);
}
function mgs_ok($response, $message): array
{
    mgs_assert(
        $response->get_status() === 200 && is_array($response->get_data()),
        $message . ': ' . wp_json_encode($response->get_data()),
    );
    return $response->get_data();
}
function mgs_error($response, $code): void
{
    $data = $response->get_data();
    mgs_assert(
        $response->get_status() >= 400 && is_array($data) && ($data['code'] ?? null) === $code,
        'Expected ' . $code . ': ' . wp_json_encode($data),
    );
}
function mgs_snapshot($id): array
{
    clean_post_cache($id);
    return [
        get_post($id),
        get_post_meta($id),
        get_comments(['post_id' => $id]),
        wp_get_post_revisions($id),
    ];
}
$suffix = bin2hex(random_bytes(6));
$previous = get_current_user_id();
$actors = [];
$id = 0;
$image = 0;
$files = [];
$mapping = null;
$capability = null;
try {
    foreach (['author', 'author', 'editor'] as $index => $role) {
        $user = wp_insert_user([
            'user_login' => 'merge-' . $index . '-' . $suffix,
            'user_pass' => wp_generate_password(32),
            'role' => $role,
        ]);
        mgs_assert(!is_wp_error($user), 'Actor creation failed');
        $actors[] = $user;
    }
    wp_set_current_user($actors[0]);
    $a =
        "---\nmarkbridge: 1\ntitle: \"Proposal stays proposal\"\n---\n\nFirst opening line.\r\n\r\nSecond opening line.\r\n\r\nCode:\n\n```js\r\nconst x = 1;\r\n```\n";
    $create = [
        'post_id' => 0,
        'mode' => 'markdown',
        'documentId' => 'Merge' . $suffix,
        'source' => $a,
        'title' => 'Opening saved title',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    mgs_ok(mgs_call('/mbb/v1/preview', $create), 'Create preview failed');
    $saved = mgs_ok(mgs_call('/mbb/v1/save', $create), 'Create failed');
    $id = (int) $saved['post_id'];
    update_post_meta($id, '_merge_private_note', 'Synthetic retained note');
    wp_insert_comment([
        'comment_post_ID' => $id,
        'comment_content' => 'Synthetic merge comment',
        'comment_approved' => 1,
    ]);
    $expectedA = mbb_token(get_post($id));
    $opening = mgs_ok(
        mgs_call('/mbb/v1/merge/open', ['schema' => 1, 'post_id' => $id, 'expected' => $expectedA]),
        'Opening failed',
    );
    mgs_assert($opening['document']['source'] === $a, 'A raw source changed');
    $mine = [
        'source' => str_replace('First opening', 'Mine changed', $a),
        'title' => 'Opening saved title',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $snapshot = mgs_snapshot($id);
    wp_set_current_user($actors[1]);
    mgs_assert(
        mgs_call('/mbb/v1/merge/latest', [
            'schema' => 1,
            'post_id' => $id,
            'opening' => $opening,
            'candidate' => $mine,
        ])->get_status() === 403,
        'Other author read baseline',
    );
    wp_set_current_user($actors[2]);
    mgs_error(
        mgs_call('/mbb/v1/merge/latest', [
            'schema' => 1,
            'post_id' => $id,
            'opening' => $opening,
            'candidate' => $mine,
        ]),
        'merge_identity',
    );
    $editorA = mgs_ok(
        mgs_call('/mbb/v1/merge/open', ['schema' => 1, 'post_id' => $id, 'expected' => $expectedA]),
        'Editor could not get own baseline',
    );
    mgs_assert($editorA['claims']['actor'] === $actors[2], 'Baseline actor incorrect');
    wp_set_current_user($actors[0]);
    $bad = $opening;
    $bad['document']['source'] .= 'tampered';
    mgs_error(
        mgs_call('/mbb/v1/merge/latest', [
            'schema' => 1,
            'post_id' => $id,
            'opening' => $bad,
            'candidate' => $mine,
        ]),
        'merge_pair',
    );
    $bad = $opening;
    $bad['claims']['expires'] = time() - 1;
    $bad['signature'] = mbb_merge_sign($bad['claims']);
    mgs_error(
        mgs_call('/mbb/v1/merge/latest', [
            'schema' => 1,
            'post_id' => $id,
            'opening' => $bad,
            'candidate' => $mine,
        ]),
        'merge_expired',
    );
    $over = $mine;
    $over['source'] = str_repeat("\r\n", 32769);
    mgs_error(
        mgs_call('/mbb/v1/merge/latest', [
            'schema' => 1,
            'post_id' => $id,
            'opening' => $opening,
            'candidate' => $over,
        ]),
        'merge_budget',
    );
    mgs_assert(
        mgs_snapshot($id) == $snapshot,
        'Opening/latest/rejections wrote article/meta/revisions/comments',
    );
    $upload = wp_upload_bits(
        'merge-' . $suffix . '.png',
        null,
        base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVioAAAAASUVORK5CYII=',
        ),
    );
    mgs_assert(!$upload['error'], 'Could not create synthetic merge PNG');
    $image = wp_insert_attachment(
        [
            'post_title' => 'Synthetic merge cover',
            'post_mime_type' => 'image/png',
            'post_status' => 'inherit',
            'post_parent' => $id,
        ],
        $upload['file'],
        $id,
        true,
    );
    mgs_assert(!is_wp_error($image) && $image > 0, 'Could not register synthetic merge PNG');
    require_once ABSPATH . 'wp-admin/includes/image.php';
    wp_update_attachment_metadata($image, wp_generate_attachment_metadata($image, $upload['file']));
    mgs_assert(
        wp_attachment_is_image($image) && wp_get_attachment_image($image),
        'Merge PNG is not a usable cover',
    );
    $c = str_replace('Second opening', 'Server changed', $a);
    $edit = [
        'post_id' => $id,
        'mode' => 'markdown',
        'expected' => $expectedA,
        'source' => $c,
        'title' => 'Server saved title',
        'post_status' => 'pending',
        'featured_media' => $image,
    ];
    mgs_ok(mgs_call('/mbb/v1/preview', $edit), 'Concurrent preview failed');
    $server = mgs_ok(mgs_call('/mbb/v1/save', $edit), 'Concurrent save failed');
    mgs_error(
        mgs_call('/mbb/v1/merge/open', ['schema' => 1, 'post_id' => $id, 'expected' => $expectedA]),
        'merge_conflict',
    );
    $latest = mgs_ok(
        mgs_call('/mbb/v1/merge/latest', [
            'schema' => 1,
            'post_id' => $id,
            'opening' => $opening,
            'candidate' => $mine,
        ]),
        'Latest failed',
    );
    $beforeAdopt = mgs_snapshot($id);
    $adopt = [
        'schema' => 1,
        'post_id' => $id,
        'opening' => $opening,
        'latest' => $latest,
        'candidate' => $mine,
        'source' => str_replace('First opening', 'Mine changed', $c),
    ];
    $merged = mgs_ok(mgs_call('/mbb/v1/merge/adopt', $adopt), 'Adopt failed');
    mgs_assert(
        $merged['saved'] === false &&
            $merged['newbase']['post_id'] === $id &&
            $merged['newbase']['title'] === 'Server saved title' &&
            $merged['newbase']['post_status'] === 'pending' &&
            $merged['newbase']['featured_media'] === $image &&
            mgs_snapshot($id) == $beforeAdopt,
        'Adopt wrote or lost new C metadata/identity',
    );
    $modified = $adopt;
    $modified['candidate']['title'] = 'Different B';
    mgs_error(mgs_call('/mbb/v1/merge/adopt', $modified), 'merge_candidate');
    $modified = $adopt;
    $modified['source'] = str_repeat("\n", 32769);
    mgs_error(mgs_call('/mbb/v1/merge/adopt', $modified), 'merge_budget');
    $modified = $adopt;
    $modified['source'] = ":::mbb:v1 collapse {}\n:::mbb:end\n";
    mgs_error(mgs_call('/mbb/v1/merge/adopt', $modified), 'merge_conversion');
    mgs_assert(mgs_snapshot($id) == $beforeAdopt, 'Adopt rejection wrote');
    $race = mgs_ok(
        mgs_call('/wp/v2/posts/' . $id, [
            'content' => get_post($id)->post_content,
            'title' => 'Later concurrent title',
            'mbb_expected' => mbb_token(get_post($id)),
        ]),
        'Concurrent native save failed',
    );
    mgs_error(mgs_call('/mbb/v1/merge/adopt', $adopt), 'merge_conflict');
    // Explicit normal preview/save after adopt; the merge endpoint never writes.
    $final = [
        'post_id' => $id,
        'mode' => 'markdown',
        'expected' => mbb_token(get_post($id)),
        'source' => $merged['document']['source'],
        'title' => 'Later concurrent title',
        'post_status' => 'pending',
        'featured_media' => $image,
    ];
    mgs_ok(mgs_call('/mbb/v1/preview', $final), 'Merged normal preview failed');
    mgs_ok(mgs_call('/mbb/v1/save', $final), 'Merged normal save failed');
    mgs_assert(
        get_post($id)->post_content_filtered === $final['source'] &&
            get_post_meta($id, '_merge_private_note', true) === 'Synthetic retained note',
        'Normal merged save lost source/private metadata',
    );
    $beforeRestoreA = mgs_ok(
        mgs_call('/mbb/v1/merge/open', [
            'schema' => 1,
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
        ]),
        'Pre-restore opening failed',
    );
    $revisionId = (int) $saved['saved_revision'];
    $revision = wp_get_post_revision($revisionId);
    mgs_assert($revision instanceof WP_Post, 'Original paired revision missing');
    mgs_ok(
        mgs_call('/mbb/v1/save', [
            'mode' => 'restore',
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
            'revision_id' => (int) $revision->ID,
            'expected_revision' => mbb_revision_token($revision),
            'post_status' => 'draft',
            'featured_media' => $image,
        ]),
        'Paired revision restore failed',
    );
    $afterRestore = mgs_snapshot($id);
    $restoredC = mgs_ok(
        mgs_call('/mbb/v1/merge/latest', [
            'schema' => 1,
            'post_id' => $id,
            'opening' => $beforeRestoreA,
            'candidate' => $mine,
        ]),
        'Restored C could not be compared',
    );
    mgs_assert(
        $restoredC['document']['source'] === $a &&
            $restoredC['title'] !== 'Proposal stays proposal' &&
            mgs_snapshot($id) == $afterRestore,
        'Revision merge applied header metadata or wrote',
    );
    $final['expected'] = mbb_token(get_post($id));
    mgs_ok(mgs_call('/mbb/v1/preview', $final), 'Post-restore preview failed');
    mgs_ok(mgs_call('/mbb/v1/save', $final), 'Post-restore save failed');
    $files[] = $file = tempnam(sys_get_temp_dir(), 'mbb-merge-source-');
    file_put_contents($file, $final['source']);
    update_post_meta($id, '_mbb_source_managed', 'file');
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($file)));
    $target = $file;
    $mapping = static function ($value, $p) use ($id, &$target) {
        return (int) $p->ID === $id ? $target : $value;
    };
    add_filter('mbb_source_write_target', $mapping, 10, 2);
    $sourceA = mgs_ok(
        mgs_call('/mbb/v1/merge/open', [
            'schema' => 1,
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
        ]),
        'Source opening failed',
    );
    $sourceToken = mbb_token(get_post($id));
    $files[] = $other = tempnam(sys_get_temp_dir(), 'mbb-merge-rebind-');
    file_put_contents($other, $final['source']);
    $target = $other;
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($other)));
    mgs_assert(
        mbb_token(get_post($id)) !== $sourceToken,
        'Same-byte source rebind did not change full token',
    );
    mgs_error(
        mgs_call('/mbb/v1/merge/latest', [
            'schema' => 1,
            'post_id' => $id,
            'opening' => $sourceA,
            'candidate' => $mine,
        ]),
        'merge_binding',
    );
    $target = $file;
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($file)));
    $capability = static fn() => 'manage_options';
    add_filter('mbb_source_write_capability', $capability);
    mgs_assert(
        mgs_call('/mbb/v1/merge/open', [
            'schema' => 1,
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
        ])->get_status() === 403,
        'Missing source write permission accepted',
    );
    remove_filter('mbb_source_write_capability', $capability);
    $capability = null;
    file_put_contents($file, 'Different actual source');
    mgs_error(
        mgs_call('/mbb/v1/merge/open', [
            'schema' => 1,
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
        ]),
        'merge_source_diverged',
    );
    file_put_contents($file, str_repeat('x', 262145));
    mgs_error(
        mgs_call('/mbb/v1/merge/open', [
            'schema' => 1,
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
        ]),
        'merge_source_diverged',
    );
    mgs_assert(filesize($file) === 262145, 'Oversized source modified');
    wp_set_current_user(0);
    mgs_assert(
        mgs_call('/mbb/v1/merge/open', [
            'schema' => 1,
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
        ])->get_status() === 403,
        'Anonymous merge accepted',
    );
    echo "Real merge: signed A/C, actor/role/expiry/pair/budget, noWrites, metadata, races, same-byte binding and bounded source passed\n";
} finally {
    if ($mapping) {
        remove_filter('mbb_source_write_target', $mapping, 10);
    }
    if ($capability) {
        remove_filter('mbb_source_write_capability', $capability);
    }
    wp_set_current_user($previous);
    if (is_int($image) && $image > 0) {
        wp_delete_attachment($image, true);
    }
    if ($id) {
        wp_delete_post($id, true);
    }
    foreach ($files as $file) {
        if (is_file($file)) {
            unlink($file);
        }
    }
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach ($actors as $actor) {
        wp_delete_user($actor);
    }
}
