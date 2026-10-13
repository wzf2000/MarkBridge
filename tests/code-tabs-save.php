<?php
// Run only against an explicitly identified synthetic local WordPress lab.
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
    throw new RuntimeException('Code tabs tests require an explicitly identified local lab');
}
if (!function_exists('mbb_convert') || !mbb_runtime_diagnostics()['ok']) {
    throw new RuntimeException('Candidate converter required');
}
function cts_assert($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function cts_call($route, $params, $method = 'POST')
{
    $r = new WP_REST_Request($method, $route);
    foreach ($params as $key => $value) {
        $r->set_param($key, $value);
    }
    return rest_do_request($r);
}
function cts_ok($r, $message)
{
    cts_assert($r->get_status() === 200, $message . ': ' . wp_json_encode($r->get_data()));
    return $r->get_data();
}
function cts_tabs($blocks)
{
    foreach ($blocks as $b) {
        if ($b['blockName'] === 'mbb/code-tabs') {
            return $b;
        }
        $found = cts_tabs($b['innerBlocks']);
        if ($found) {
            return $found;
        }
    }
    return null;
}
$previous = get_current_user_id();
$author = 0;
$id = 0;
$file = null;
$mapping = null;
$suffix = bin2hex(random_bytes(6));
try {
    $author = wp_insert_user([
        'user_login' => 'tabs-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    cts_assert(!is_wp_error($author), 'Could not create actor');
    wp_set_current_user($author);
    $fixtures = json_decode(
        file_get_contents(__DIR__ . '/fixtures/code-tabs.json'),
        true,
        32,
        JSON_THROW_ON_ERROR,
    );
    $source =
        $fixtures[2]['source'] .
        "\nAuthor paragraph with math \$x+1$.\n\n- [ ] task\n\nNote[^a].\n\n[^a]: retained footnote\n";
    $params = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'Tabs' . $suffix,
        'source' => $source,
        'title' => 'Synthetic code tabs',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    cts_ok(cts_call('/mbb/v1/preview', $params), 'New tabs preview failed');
    $result = cts_ok(cts_call('/mbb/v1/save', $params), 'New tabs save failed');
    $id = (int) $result['post_id'];
    $post = get_post($id);
    $baseline = $post->post_content;
    $before = $post->post_content_filtered;
    cts_assert($before === $source, 'Original Markdown changed');
    $block = cts_tabs(parse_blocks($baseline));
    cts_assert($block !== null, 'Tabs missing');
    foreach ($fixtures[2]['tabs'] as $index => $tab) {
        foreach ($tab as $key => $value) {
            cts_assert(
                $block['attrs']['tabs'][$index][$key] === $value,
                'KSES changed original ' . $key,
            );
        }
    }
    $reopen = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $before,
        'serialized' => $baseline,
        'documentId' => mbb_id($id),
    ]);
    cts_assert(!is_wp_error($reopen), 'Pair failed to reopen');
    $html = do_blocks($baseline);
    cts_assert(
        str_contains($html, 'data-mbb-teaching="code-tabs"'),
        'Real render did not enhance tabs',
    );
    cts_assert(
        preg_match(
            '/data-mbb-teaching="code-tabs" data-mbb-teaching-config="([^"]*)"/',
            $html,
            $render,
        ) === 1,
        'Config missing',
    );
    $config = json_decode(
        html_entity_decode($render[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'),
        true,
        32,
        JSON_THROW_ON_ERROR,
    );
    cts_assert(
        $config['tabs'][3]['code'] === $fixtures[2]['tabs'][3]['code'],
        'Rendered copy config normalized original CRLF',
    );
    $revision = (int) $result['saved_revision'];
    cts_assert(is_int($revision) && $revision > 0, 'No baseline revision');
    $comment = wp_insert_comment([
        'comment_post_ID' => $id,
        'comment_content' => 'Synthetic preserved comment',
        'comment_approved' => 1,
    ]);
    update_post_meta($id, '_tabs_private_note', 'Synthetic retained note');
    $identity = [$post->post_author, $post->post_name, mbb_id($id)];
    $changed = str_replace("a\rb\r", " changed\r\n\t<script> & raw  ", $source);
    $candidate = mbb_convert([
        'mode' => 'markdown',
        'source' => $changed,
        'documentId' => mbb_id($id),
    ]);
    cts_assert(!is_wp_error($candidate), 'Edit conversion failed');
    $edit = [
        'mode' => 'blocks',
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'serialized' => $candidate['serialized'],
        'title' => 'Synthetic code tabs',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    cts_ok(cts_call('/mbb/v1/preview', $edit), 'Reverse preview failed');
    cts_ok(cts_call('/mbb/v1/save', $edit), 'Reverse save failed');
    cts_assert(
        cts_tabs(parse_blocks(get_post($id)->post_content))['attrs']['tabs'][4]['code'] ===
            " changed\r\n\t<script> & raw  ",
        'Reverse edit lost whitespace',
    );
    cts_assert(cts_call('/mbb/v1/save', $edit)->get_status() === 409, 'Stale save accepted');
    $nativeCode = " native\r\n\t<script> & raw  ";
    $nativeDoc = mbb_convert([
        'mode' => 'markdown',
        'source' => str_replace(
            " changed\r\n\t<script> & raw  ",
            $nativeCode,
            get_post($id)->post_content_filtered,
        ),
        'documentId' => mbb_id($id),
    ]);
    cts_assert(!is_wp_error($nativeDoc), 'Native edit conversion failed');
    $native = cts_call('/wp/v2/posts/' . $id, [
        'mbb_expected' => mbb_token(get_post($id)),
        'title' => 'Native metadata title',
        'content' => $nativeDoc['serialized'],
    ]);
    cts_ok($native, 'Native save failed');
    cts_assert(get_post($id)->post_title === 'Native metadata title', 'Native title missing');
    cts_assert(
        cts_tabs(parse_blocks(get_post($id)->post_content))['attrs']['tabs'][4]['code'] ===
            $nativeCode,
        'Native code edit changed original bytes',
    );
    cts_assert(
        !is_wp_error(
            mbb_convert([
                'mode' => 'paired_restore',
                'source' => get_post($id)->post_content_filtered,
                'serialized' => get_post($id)->post_content,
                'documentId' => mbb_id($id),
            ]),
        ),
        'Native pair could not reopen',
    );
    $rev = wp_get_post_revision($revision);
    cts_ok(
        cts_call('/mbb/v1/save', [
            'mode' => 'restore',
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
            'revision_id' => $revision,
            'expected_revision' => mbb_revision_token($rev),
            'post_status' => 'draft',
            'featured_media' => 0,
        ]),
        'Revision restore failed',
    );
    cts_assert(
        get_post($id)->post_content === $baseline &&
            get_post($id)->post_content_filtered === $source,
        'Revision changed code bytes',
    );
    $duplicate = str_replace('"id":"variant1"', '"id":"variant0"', $source);
    cts_assert(
        cts_call('/mbb/v1/preview', [
            'mode' => 'markdown',
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
            'source' => $duplicate,
            'title' => 'Synthetic code tabs',
            'post_status' => 'draft',
            'featured_media' => 0,
        ])->get_status() === 422,
        'Duplicate ID accepted',
    );
    $file = tempnam(sys_get_temp_dir(), 'mbb-tabs-source-');
    file_put_contents($file, $source);
    update_post_meta($id, '_mbb_source_managed', 'file');
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($file)));
    $mapping = static fn($target, $p) => (int) $p->ID === $id ? $file : $target;
    add_filter('mbb_source_write_target', $mapping, 10, 2);
    $write = [
        'mode' => 'markdown',
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'source_sha256' => hash_file('sha256', $file),
        'source' => $changed,
        'title' => 'Synthetic code tabs',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    cts_ok(cts_call('/mbb/v1/source-save', $write), 'Source paired save failed');
    cts_assert(
        file_get_contents($file) === $changed && get_post($id)->post_content_filtered === $changed,
        'Source pair differs',
    );
    $write['expected'] = mbb_token(get_post($id));
    $write['source_sha256'] = hash_file('sha256', $file);
    file_put_contents($file, $changed . "\nExternal edit.\n");
    cts_assert(
        cts_call('/mbb/v1/source-save', $write)->get_status() === 409,
        'Stale file accepted',
    );
    cts_assert(
        [get_post($id)->post_author, get_post($id)->post_name, mbb_id($id)] === $identity &&
            get_comment($comment) &&
            get_post_meta($id, '_tabs_private_note', true) === 'Synthetic retained note',
        'Identity/comments/private metadata changed',
    );
    wp_set_current_user(0);
    cts_assert(
        cts_call('/mbb/v1/preview', $edit)->get_status() === 403,
        'Anonymous preview accepted',
    );
    echo "Code tabs real WordPress import/render/KSES/reverse/native/revisions/source/identity/permissions passed.\n";
} finally {
    wp_set_current_user($previous);
    if ($mapping) {
        remove_filter('mbb_source_write_target', $mapping, 10);
    }
    if ($file && is_file($file)) {
        unlink($file);
    }
    if ($id) {
        wp_delete_post($id, true);
    }
    if ($author && !is_wp_error($author)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($author);
    }
}
