<?php
// Real WordPress save-chain checks, restricted to an explicitly identified local lab.
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
    throw new RuntimeException('An explicitly configured isolated WordPress is required.');
}
if (!defined('MARKBRIDGE_CONVERTER_BACKEND') || MARKBRIDGE_CONVERTER_BACKEND !== 'php') {
    throw new RuntimeException('This integration suite requires the PHP candidate backend.');
}
function portable_assert($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function portable_request($route, $params, $method = 'POST')
{
    $r = new WP_REST_Request($method, $route);
    foreach ($params as $key => $value) {
        $r->set_param($key, $value);
    }
    return rest_do_request($r);
}
$admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
portable_assert((bool) $admins, 'Missing isolated administrator.');
$admin = (int) $admins[0];
$previous = get_current_user_id();
$suffix = substr(hash('sha256', uniqid('', true)), 0, 10);
$users = [];
$id = 0;
$file = tempnam(sys_get_temp_dir(), 'mbb-php-source-');
$mapping = null;
$corrupt = null;
try {
    foreach (['author', 'author', 'editor'] as $i => $role) {
        $user = wp_insert_user([
            'user_login' => 'portable-' . $suffix . '-' . $i,
            'user_pass' => wp_generate_password(32),
            'role' => $role,
        ]);
        portable_assert(!is_wp_error($user), 'Could not create a synthetic role.');
        $users[] = $user;
    }
    [$author, $other, $editor] = $users;
    wp_set_current_user($author);
    $original = "# Synthetic source\n\nInitial **content** with $" . "x^2$.\n";
    $created = portable_request('/mbb/v1/save', [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'Portable' . $suffix,
        'title' => 'Synthetic PHP source',
        'source' => $original,
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    portable_assert(
        $created->get_status() === 200,
        'PHP Markdown REST import failed: ' . wp_json_encode($created->get_data()),
    );
    $id = (int) $created->get_data()['post_id'];
    portable_assert(get_post($id)->post_content_filtered === $original, 'Import changed source.');
    update_post_meta($id, '_mbb_source_managed', 'file');
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($file)));
    update_post_meta($id, '_portable_private_probe', 'unrelated metadata');
    file_put_contents($file, $original);
    $mapping = static fn($target, $post) => (int) $post->ID === $id ? $file : $target;
    add_filter('mbb_source_write_target', $mapping, 10, 2);
    $comment = wp_insert_comment([
        'comment_post_ID' => $id,
        'comment_content' => 'Synthetic retained comment',
        'comment_approved' => 1,
    ]);
    $identity = [get_post($id)->post_author, get_post($id)->post_name, get_permalink($id)];
    $request = static function ($source) use ($id, $file) {
        return [
            'mode' => 'markdown',
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
            'source_sha256' => hash_file('sha256', $file),
            'source' => $source,
            'title' => 'Synthetic PHP source',
            'post_status' => 'draft',
            'featured_media' => 0,
        ];
    };
    $candidate = "# Synthetic source\n\nAuthor edit.\n";
    $preview = portable_request('/mbb/v1/preview', $request($candidate));
    portable_assert($preview->get_status() === 200, 'PHP source preview failed.');
    portable_assert(
        file_get_contents($file) === $original &&
            get_post($id)->post_content_filtered === $original,
        'Preview performed a write.',
    );
    $saved = portable_request('/mbb/v1/source-save', $request($candidate));
    portable_assert($saved->get_status() === 200, 'Author could not write own bound source.');
    portable_assert(
        file_get_contents($file) === $candidate &&
            get_post($id)->post_content_filtered === $candidate,
        'Source and WordPress did not save together.',
    );
    wp_set_current_user($other);
    portable_assert(
        portable_request('/mbb/v1/source-save', $request("Other writer.\n"))->get_status() === 403,
        'Other author wrote the source.',
    );
    wp_set_current_user(0);
    portable_assert(
        portable_request('/mbb/v1/source-save', $request("Anonymous.\n"))->get_status() === 403,
        'Anonymous source save was allowed.',
    );
    foreach ([$editor, $admin] as $manager) {
        wp_set_current_user($manager);
        $candidate = "# Synthetic source\n\nManager " . $manager . ".\n";
        portable_assert(
            portable_request('/mbb/v1/source-save', $request($candidate))->get_status() === 200,
            'Manager source write failed.',
        );
    }
    $stale = $request("Stale source attempt.\n");
    file_put_contents($file, "External file edit.\n");
    portable_assert(
        portable_request('/mbb/v1/source-save', $stale)->get_status() === 409,
        'Source fingerprint conflict accepted.',
    );
    portable_assert(
        file_get_contents($file) === "External file edit.\n" &&
            get_post($id)->post_content_filtered === $candidate,
        'Source conflict overwrote content.',
    );
    file_put_contents($file, $candidate);
    $stale = $request("Stale WordPress attempt.\n");
    $stale['expected'] = 'invalid-fingerprint';
    portable_assert(
        portable_request('/mbb/v1/source-save', $stale)->get_status() === 409,
        'WordPress fingerprint conflict accepted.',
    );
    foreach (['<script>bad()</script>', str_repeat('x', 262145)] as $invalid) {
        $failed = portable_request('/mbb/v1/source-save', $request($invalid));
        portable_assert(
            $failed->get_status() === 422,
            'Invalid/overlimit PHP conversion was not rejected.',
        );
        portable_assert(
            file_get_contents($file) === $candidate &&
                get_post($id)->post_content_filtered === $candidate,
            'Rejected conversion changed source or post.',
        );
    }
    $corrupt = static function ($data, $postarr) use ($id) {
        if ((int) ($postarr['ID'] ?? 0) === $id && !empty($GLOBALS['mbb_paired_save'])) {
            $data['post_content'] .= 'Injected inconsistent output';
        }
        return $data;
    };
    add_filter('wp_insert_post_data', $corrupt, 999, 2);
    $failed = portable_request('/mbb/v1/source-save', $request("Rollback candidate.\n"));
    remove_filter('wp_insert_post_data', $corrupt, 999);
    $corrupt = null;
    portable_assert(
        $failed->get_status() === 500,
        'Injected paired-save inconsistency was not rejected.',
    );
    portable_assert(
        file_get_contents($file) === $candidate &&
            get_post($id)->post_content_filtered === $candidate,
        'File and database rollback failed.',
    );
    $audit = get_post_meta($id, '_mbb_source_web_audit', true);
    portable_assert(($audit['result'] ?? '') === 'failed', 'Failure audit missing.');
    $cli = "# Synthetic source\n\nCLI update.\n";
    file_put_contents($file, $cli);
    portable_assert(
        mbb_sync_write($id, $cli, null, $file) === $id,
        'Existing file-bound CLI sync failed.',
    );
    portable_assert(get_post($id)->post_content_filtered === $cli, 'CLI source was not paired.');
    $rejected = false;
    try {
        mbb_sync_write($id, $cli . 'wrong', null, $file);
    } catch (RuntimeException $error) {
        $rejected = true;
    }
    portable_assert($rejected, 'CLI accepted source differing from the real bound file.');
    portable_assert(
        [get_post($id)->post_author, get_post($id)->post_name, get_permalink($id)] === $identity,
        'Stable identity changed.',
    );
    portable_assert(
        get_comment($comment) !== null &&
            get_post_meta($id, '_portable_private_probe', true) === 'unrelated metadata',
        'Unrelated comment or metadata changed.',
    );
    portable_assert(
        count(wp_get_post_revisions($id, ['check_enabled' => false])) > 0,
        'Paired revisions missing.',
    );
    echo "PHP REST import/preview, role boundaries, source fingerprints, conversion rejection, coordinated rollback, CLI and identity checks passed.\n";
} finally {
    if ($corrupt) {
        remove_filter('wp_insert_post_data', $corrupt, 999);
    }
    if ($mapping) {
        remove_filter('mbb_source_write_target', $mapping, 10);
    }
    wp_set_current_user($admin);
    if ($id) {
        wp_delete_post($id, true);
    }
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach ($users as $user) {
        wp_delete_user($user);
    }
    if (is_file($file)) {
        unlink($file);
    }
    wp_set_current_user($previous);
}
