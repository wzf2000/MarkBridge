<?php
// The test creates and removes only synthetic fixtures in an explicitly named local lab.
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
        'Teaching save tests require an explicitly identified local WordPress lab.',
    );
}
if (!function_exists('mbb_convert') || !mbb_runtime_diagnostics()['ok']) {
    throw new RuntimeException('A compatible candidate converter is required.');
}
function teaching_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function teaching_request($route, $params)
{
    $r = new WP_REST_Request('POST', $route);
    foreach ($params as $key => $value) {
        $r->set_param($key, $value);
    }
    return rest_do_request($r);
}
function teaching_directive($kind, $attrs, $body)
{
    return ':::mbb:v1 ' .
        $kind .
        ' ' .
        wp_json_encode($attrs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) .
        "\n\n" .
        $body .
        "\n\n:::mbb:end\n";
}
$suffix = substr(hash('sha256', uniqid('', true)), 0, 10);
$previous = get_current_user_id();
$ids = [];
$author = 0;
$file = null;
$mapping = null;
try {
    $author = wp_insert_user([
        'user_login' => 'teaching-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    teaching_assert(!is_wp_error($author), 'Could not create synthetic author');
    wp_set_current_user($author);
    $collapse = teaching_directive(
        'collapse',
        ['id' => 'fold', 'title' => '细节 <raw>', 'open' => false],
        teaching_directive(
            'collapse',
            ['id' => 'nested', 'title' => '嵌套细节', 'open' => false],
            "## Hidden heading\n\nAuthor paragraph with $" . "x^2$ and note[^n].",
        ),
    );
    $compare = teaching_directive(
        'code-compare',
        [
            'id' => 'comparison',
            'leftTitle' => '原代码',
            'rightTitle' => '新代码',
            'leftHighlights' => '2',
            'rightHighlights' => '2',
        ],
        "```js\nconst common = 1;\n\tconst raw = \"<script> & raw\";  \n```\n\n```python\nconst common = 1;\n\tconst raw = \"<safe> & raw\";  \n```\n\n重点解释 **原空白**。",
    );
    $source =
        teaching_directive(
            'steps',
            [
                'id' => 'course',
                'title' => '合成课程',
                'mode' => 'staged',
                'previous' => true,
                'next' => true,
                'full' => true,
            ],
            teaching_directive('step', ['id' => 'first', 'title' => 'First'], $collapse) .
                "\n" .
                teaching_directive('step', ['id' => 'second', 'title' => 'Second'], $compare),
        ) . "\n[^n]: Synthetic footnote.\n";
    $created = teaching_request('/mbb/v1/save', [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'Teaching' . $suffix,
        'title' => 'Synthetic teaching',
        'source' => $source,
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    teaching_assert(
        $created->get_status() === 200,
        'Teaching import failed: ' . wp_json_encode($created->get_data()),
    );
    $data = $created->get_data();
    $id = (int) $data['post_id'];
    $ids[] = $id;
    $post = get_post($id);
    $baseline = $post->post_content;
    $baseline_revision = (int) $data['saved_revision'];
    $rendered = do_blocks($baseline);
    foreach (['collapse', 'steps', 'step', 'code-compare'] as $kind) {
        teaching_assert(
            str_contains($rendered, 'data-mbb-teaching="' . $kind . '"'),
            'Real rendering did not enhance ' . $kind,
        );
    }

    teaching_assert($post->post_content_filtered === $source, 'Import changed original Markdown');
    $parsed = parse_blocks($baseline);
    $compare_block = null;
    $find = function ($blocks) use (&$find, &$compare_block) {
        foreach ($blocks as $b) {
            if ($b['blockName'] === 'mbb/code-compare') {
                $compare_block = $b;
            }
            $find($b['innerBlocks']);
        }
    };
    $find($parsed);
    teaching_assert(
        $compare_block !== null &&
            $compare_block['attrs']['codeLeft'] ===
                "const common = 1;\n\tconst raw = \"<script> & raw\";  \n",
        'KSES silently changed comparison source',
    );
    $restored = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $source,
        'serialized' => $baseline,
        'documentId' => mbb_id($id),
    ]);
    teaching_assert(
        !is_wp_error($restored) && $restored['serialized'] === $baseline,
        'Exact teaching pair could not reopen',
    );
    $comment = wp_insert_comment([
        'comment_post_ID' => $id,
        'comment_content' => 'Synthetic retained paragraph comment',
        'comment_approved' => 1,
    ]);
    update_post_meta($id, '_teaching_private_note', 'Synthetic retained note');
    $identity = [$post->post_author, $post->post_name, mbb_id($id)];
    $edit = function ($blocks) use (&$edit) {
        foreach ($blocks as &$b) {
            if (
                $b['blockName'] === 'core/paragraph' &&
                str_contains($b['innerHTML'], 'Author paragraph')
            ) {
                $b['innerHTML'] = str_replace(
                    'Author paragraph',
                    'Edited author paragraph',
                    $b['innerHTML'],
                );
                foreach ($b['innerContent'] as &$part) {
                    if (is_string($part)) {
                        $part = str_replace('Author paragraph', 'Edited author paragraph', $part);
                    }
                }
                unset($part);
            }
            $b['innerBlocks'] = $edit($b['innerBlocks']);
        }
        unset($b);
        return $blocks;
    };
    $serialized = serialize_blocks($edit($parsed));
    $stale = mbb_token($post);
    $params = [
        'mode' => 'blocks',
        'post_id' => $id,
        'expected' => $stale,
        'serialized' => $serialized,
        'title' => 'Synthetic teaching',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $preview = teaching_request('/mbb/v1/preview', $params);
    teaching_assert(
        $preview->get_status() === 200,
        'Teaching reverse preview failed: ' . wp_json_encode($preview->get_data()),
    );
    teaching_assert(get_post($id)->post_content === $baseline, 'Preview wrote content');
    $saved = teaching_request('/mbb/v1/save', $params);
    teaching_assert(
        $saved->get_status() === 200,
        'Teaching reverse save failed: ' . wp_json_encode($saved->get_data()),
    );
    $edited = get_post($id)->post_content_filtered;
    teaching_assert(
        str_contains($edited, 'Edited author paragraph') &&
            get_post($id)->post_content === $serialized,
        'Edited blocks did not reverse and save exactly',
    );
    teaching_assert(
        teaching_request('/mbb/v1/save', $params)->get_status() === 409,
        'Stale teaching fingerprint was accepted',
    );
    $revision = wp_get_post_revision($baseline_revision);
    $restore = teaching_request('/mbb/v1/save', [
        'mode' => 'restore',
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'revision_id' => $baseline_revision,
        'expected_revision' => mbb_revision_token($revision),
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    teaching_assert(
        $restore->get_status() === 200,
        'Teaching revision restore failed: ' . wp_json_encode($restore->get_data()),
    );
    teaching_assert(
        get_post($id)->post_content_filtered === $source &&
            get_post($id)->post_content === $baseline,
        'Restored teaching pair differs',
    );
    $file = tempnam(sys_get_temp_dir(), 'mbb-teaching-source-');
    file_put_contents($file, $source);
    update_post_meta($id, '_mbb_source_managed', 'file');
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($file)));
    $mapping = static fn($target, $post) => (int) $post->ID === $id ? $file : $target;
    add_filter('mbb_source_write_target', $mapping, 10, 2);
    $candidate = str_replace('Author paragraph', 'Source author paragraph', $source);
    $source_params = [
        'mode' => 'markdown',
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'source_sha256' => hash_file('sha256', $file),
        'source' => $candidate,
        'title' => 'Synthetic teaching',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $result = teaching_request('/mbb/v1/source-save', $source_params);
    teaching_assert(
        $result->get_status() === 200,
        'Teaching source write failed: ' . wp_json_encode($result->get_data()),
    );
    teaching_assert(
        file_get_contents($file) === $candidate &&
            get_post($id)->post_content_filtered === $candidate,
        'Source/database pair differed',
    );
    $source_params['expected'] = mbb_token(get_post($id));
    $source_params['source_sha256'] = hash_file('sha256', $file);
    file_put_contents($file, $candidate . "\nExternal edit.\n");
    teaching_assert(
        teaching_request('/mbb/v1/source-save', $source_params)->get_status() === 409,
        'Stale source hash was accepted',
    );
    $cli = str_replace('Source author paragraph', 'CLI author paragraph', $candidate);
    file_put_contents($file, $cli);
    teaching_assert(
        mbb_sync_write($id, $cli, null, $file) === $id &&
            get_post($id)->post_content_filtered === $cli,
        'Teaching CLI sync failed',
    );
    $rejected = false;
    try {
        mbb_sync_write($id, $cli . 'Wrong', null, $file);
    } catch (RuntimeException $e) {
        $rejected = true;
    }
    teaching_assert($rejected, 'CLI accepted mismatched real source');
    teaching_assert(
        [get_post($id)->post_author, get_post($id)->post_name, mbb_id($id)] === $identity &&
            get_comment($comment) !== null &&
            get_post_meta($id, '_teaching_private_note', true) === 'Synthetic retained note',
        'Teaching changed identity, comment or private metadata',
    );
    wp_set_current_user(0);
    teaching_assert(
        teaching_request('/mbb/v1/source-save', $source_params)->get_status() === 403,
        'Anonymous teaching write was allowed',
    );
    wp_set_current_user($author);
    $ordinary = wp_insert_post([
        'post_title' => 'Ordinary teaching regression',
        'post_content' => '<p>Ordinary text.</p>',
        'post_status' => 'draft',
        'post_author' => $author,
    ]);
    $ids[] = $ordinary;
    $ordinary_result = teaching_request('/wp/v2/posts/' . $ordinary, [
        'content' => '<p>Ordinary edited.</p>',
    ]);
    teaching_assert(
        $ordinary_result->get_status() === 200 &&
            get_post($ordinary)->post_content === '<p>Ordinary edited.</p>' &&
            !mbb_managed($ordinary),
        'Ordinary native save regressed',
    );
    echo 'Teaching ' .
        mbb_converter_backend() .
        " real WordPress import/reopen/edit/revisions/stale fingerprints/KSES/source write/CLI/identity/permissions/ordinary save passed.\n";
} finally {
    if ($mapping) {
        remove_filter('mbb_source_write_target', $mapping, 10);
    }
    if ($file && is_file($file)) {
        unlink($file);
    }
    wp_set_current_user($author);
    foreach ($ids as $id) {
        wp_delete_post($id, true);
    }
    if ($author && !is_wp_error($author)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($author);
    }
    wp_set_current_user($previous);
}
