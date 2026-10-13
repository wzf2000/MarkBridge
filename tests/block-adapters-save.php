<?php
// Guarded synthetic WordPress contract. Never access a real article or source binding.
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
    throw new RuntimeException('Adapter saves require an explicitly identified local lab');
}
if (!function_exists('mbb_register_block_adapter') || !mbb_runtime_diagnostics()['ok']) {
    throw new RuntimeException('Current adapter converter required');
}
function bas_assert($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function bas_call($route, $params, $method = 'POST')
{
    $request = new WP_REST_Request($method, $route);
    foreach ($params as $key => $value) {
        $request->set_param($key, $value);
    }
    return rest_do_request($request);
}
function bas_ok($response, $message)
{
    bas_assert(
        $response->get_status() === 200,
        $message . ': ' . wp_json_encode($response->get_data()),
    );
    return $response->get_data();
}
function bas_flatten($blocks)
{
    $all = [];
    foreach ($blocks as $block) {
        $all[] = $block;
        $all = array_merge($all, bas_flatten($block['innerBlocks']));
    }
    return $all;
}
$actor = get_current_user_id();
$user = 0;
$id = 0;
$file = null;
$binding = null;
$comment = 0;
$registered = false;
$suffix = bin2hex(random_bytes(5));
$fixture = json_decode(
    file_get_contents(__DIR__ . '/fixtures/block-adapters.json'),
    true,
    32,
    JSON_THROW_ON_ERROR,
);
$descriptor = $fixture['descriptors'][0];
$descriptor['name'] = 'fixture-card-' . $suffix;
$descriptor['blockName'] = 'mbb-fixture/card-' . $suffix;
try {
    bas_assert(
        mbb_register_block_adapter($descriptor),
        'Could not register isolated static adapter',
    );
    $registered = true;
    $user = wp_insert_user([
        'user_login' => 'adapter-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    bas_assert(!is_wp_error($user), 'Could not create synthetic author');
    wp_set_current_user($user);
    $static =
        ':::mbb:v1 adapter ' .
        wp_json_encode(
            [
                'name' => $descriptor['name'],
                'version' => '1.0.0',
                'attrs' => [
                    'text' => '<literal> ![image](https://example.invalid/a.png) $x$ & source',
                    'count' => 1,
                    'enabled' => false,
                    'tone' => 'note',
                ],
            ],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ) .
        "\n:::mbb:end\n";
    $source =
        $fixture['native'][0] .
        "\n" .
        $fixture['native'][1] .
        "\n" .
        $static .
        "\nAuthor paragraph with math \$x$.\n\n\$\$\nx^2 + 1\n\$\$\n\n- [x] task\n\nNote[^a].\n\n[^a]: footnote\n";
    $request = [
        'post_id' => 0,
        'documentId' => 'Adapters' . $suffix,
        'mode' => 'markdown',
        'source' => $source,
        'title' => 'Synthetic adapters',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $preview = bas_ok(bas_call('/mbb/v1/preview', $request), 'Preview failed');
    bas_assert(
        $preview['adapter_digest'] === mbb_block_adapter_digest(),
        'Preview omitted trusted digest',
    );
    $unconfirmed = bas_call('/mbb/v1/save', $request);
    bas_assert(
        $unconfirmed->get_status() === 409 &&
            $unconfirmed->get_data()['code'] === 'adapter_conflict',
        'New static document bypassed preview digest',
    );
    $request['adapter_digest'] = $preview['adapter_digest'];
    $saved = bas_ok(bas_call('/mbb/v1/save', $request), 'Initial paired save failed');
    $id = (int) $saved['post_id'];
    $revision = (int) $saved['saved_revision'];
    $post = get_post($id);
    $baseline = $post->post_content;
    $original = $post->post_content_filtered;
    bas_assert($original === $source, 'Original native/adapter source changed');
    $names = array_column(bas_flatten(parse_blocks($baseline)), 'blockName');
    foreach (
        [
            'core/details',
            'core/buttons',
            'core/button',
            $descriptor['blockName'],
            'mbb/math',
            'mbb/task-item',
            'mbb/footnotes',
        ]
        as $name
    ) {
        bas_assert(in_array($name, $names, true), 'Identity missing ' . $name);
    }
    $html = do_blocks($baseline);
    bas_assert(
        str_contains($html, 'data-mbb-teaching="native-details"'),
        'Real native details render did not load reveal/print controller',
    );
    bas_assert(str_contains($baseline, '\\u003cliteral\\u003e'), 'KSES changed pure static attrs');
    $pair = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $original,
        'serialized' => $baseline,
        'documentId' => mbb_id($id),
    ]);
    bas_assert(!is_wp_error($pair) && $pair['serialized'] === $baseline, 'Pair could not reopen');
    $comment = wp_insert_comment([
        'comment_post_ID' => $id,
        'comment_content' => 'Synthetic adapter comment',
        'comment_approved' => 1,
    ]);
    update_post_meta($id, '_adapter_private_note', 'Synthetic note');
    // Normal core REST edit preserves native names and all adapter fields through real KSES.
    $serialized = str_replace('Author paragraph', 'Edited author paragraph', $baseline);
    $native = bas_ok(
        bas_call('/wp/v2/posts/' . $id, [
            'id' => $id,
            'content' => $serialized,
            'title' => 'Synthetic adapters',
            'mbb_expected' => mbb_token(get_post($id)),
        ]),
        'Native REST pair failed',
    );
    bas_assert(
        get_post($id)->post_content === $serialized &&
            str_contains(get_post($id)->post_content_filtered, 'Edited author paragraph'),
        'Native reverse lost content',
    );
    bas_assert(
        get_comment($comment) !== null &&
            get_post_meta($id, '_adapter_private_note', true) === 'Synthetic note' &&
            (int) get_post($id)->post_author === $user,
        'Article identity/comment/private note changed',
    );
    $restore = [
        'post_id' => $id,
        'mode' => 'restore',
        'expected' => mbb_token(get_post($id)),
        'revision_id' => $revision,
        'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
    ];
    $restorePreview = bas_ok(bas_call('/mbb/v1/preview', $restore), 'Revision preview failed');
    $restore['adapter_digest'] = $restorePreview['adapter_digest'];
    bas_ok(bas_call('/mbb/v1/save', $restore), 'Revision pair restore failed');
    bas_assert(
        get_post($id)->post_content === $baseline,
        'Revision did not restore exact native/static pair',
    );
    // Descriptor identity is part of the normal full version token and cannot silently change after preview.
    $edit = [
        'post_id' => $id,
        'mode' => 'markdown',
        'expected' => mbb_token(get_post($id)),
        'source' => $source . "\nChanged.\n",
        'title' => 'Synthetic adapters',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $review = bas_ok(bas_call('/mbb/v1/preview', $edit), 'Mutation preview failed');
    $edit['adapter_digest'] = $review['adapter_digest'];
    $beforeToken = mbb_token(get_post($id));
    bas_assert(
        mbb_unregister_block_adapter($descriptor['name']),
        'Could not detach fixture provider',
    );
    $changed = $descriptor;
    $changed['template']['children'][1]['children'][1]['text'] = ' : ';
    bas_assert(mbb_register_block_adapter($changed), 'Could not change trusted template');
    bas_assert(mbb_token(get_post($id)) !== $beforeToken, 'Registry mutation left token unchanged');
    $conflict = bas_call('/mbb/v1/save', $edit);
    bas_assert(
        $conflict->get_status() === 409 &&
            $conflict->get_data()['code'] === 'conflict' &&
            get_post($id)->post_content === $baseline,
        'Changed descriptor silently wrote candidate',
    );
    mbb_unregister_block_adapter($descriptor['name']);
    bas_assert(mbb_register_block_adapter($descriptor), 'Original descriptor did not restore');
    // New null-expected writes must still require the exact preview registry digest.
    $new = $request;
    $new['documentId'] = 'AdapterNew' . $suffix;
    $new['adapter_digest'] = 'f' . str_repeat('0', 63);
    $refused = bas_call('/mbb/v1/save', $new);
    bas_assert(
        $refused->get_status() === 409 && $refused->get_data()['code'] === 'adapter_conflict',
        'New adapter request ignored digest',
    );
    // Missing provider is explicitly unavailable, retaining the stored serialized attributes and HTML.
    mbb_unregister_block_adapter($descriptor['name']);
    $missing = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $source,
        'serialized' => $baseline,
        'documentId' => mbb_id($id),
    ]);
    bas_assert(is_wp_error($missing), 'Missing adapter conversion succeeded');
    $shown = do_blocks($baseline);
    bas_assert(
        str_contains($shown, '适配包或版本不可用') &&
            str_contains($shown, 'Literal') === false &&
            str_contains($shown, '&lt;literal'),
        'Missing adapter erased stored static content',
    );
    bas_assert(get_post($id)->post_content === $baseline, 'Missing provider changed article');
    bas_assert(mbb_register_block_adapter($descriptor), 'Provider restore failed');
    // Real dependency-parser and renderer hooks cannot wash an old preview into a new digest.
    foreach (['parse', 'render'] as $phase) {
        $mutated = false;
        $mutation = static function ($value, $block = null) use (&$mutated, $phase, $descriptor) {
            if (
                $mutated ||
                ($phase === 'render' && ($block['blockName'] ?? null) !== $descriptor['blockName'])
            ) {
                return $value;
            }
            $mutated = true;
            mbb_unregister_block_adapter($descriptor['name']);
            $changed = $descriptor;
            $changed['template']['children'][1]['children'][1]['text'] = ' : ';
            bas_assert(
                mbb_register_block_adapter($changed),
                'Could not change provider in WP hook',
            );
            return $value;
        };
        $tag = $phase === 'parse' ? 'block_parser_class' : 'render_block';
        add_filter($tag, $mutation, 11, $phase === 'parse' ? 1 : 2);
        try {
            $probe = $request;
            $probe['documentId'] = 'AdapterRace' . $phase . $suffix;
            unset($probe['adapter_digest']);
            $response = bas_call('/mbb/v1/preview', $probe);
            bas_assert(
                $mutated &&
                    $response->get_status() === 409 &&
                    $response->get_data()['code'] === 'adapter_conflict',
                'Preview preparation/render race refreshed identity',
            );
        } finally {
            remove_filter($tag, $mutation, 11);
            mbb_unregister_block_adapter($descriptor['name']);
            bas_assert(
                mbb_register_block_adapter($descriptor),
                'Could not restore provider after preview race',
            );
        }
        bas_assert(
            !get_posts([
                'post_type' => 'post',
                'post_status' => 'any',
                'numberposts' => 1,
                'fields' => 'ids',
                'meta_key' => '_mbb_document_id',
                'meta_value' => 'AdapterRace' . $phase . $suffix,
            ]),
            'Race preview wrote a new article',
        );
    }
    // A provider change inside the real native transaction must roll back the paired update.
    $nativeBefore = get_post($id)->post_content;
    $nativeSource = get_post($id)->post_content_filtered;
    $mutated = false;
    $nativeMutation = static function ($postId, $post) use ($id, $descriptor, &$mutated) {
        if ($mutated || (int) $postId !== $id || $post->post_type !== 'post') {
            return;
        }
        $mutated = true;
        mbb_unregister_block_adapter($descriptor['name']);
        $changed = $descriptor;
        $changed['template']['children'][1]['children'][1]['text'] = ' : ';
        bas_assert(mbb_register_block_adapter($changed), 'Could not mutate native provider');
    };
    add_action('wp_after_insert_post', $nativeMutation, 10, 2);
    try {
        $failed = bas_call('/wp/v2/posts/' . $id, [
            'id' => $id,
            'content' => str_replace(
                'Author paragraph',
                'Rejected native paragraph',
                $nativeBefore,
            ),
            'title' => 'Synthetic adapters',
            'mbb_expected' => mbb_token(get_post($id)),
        ]);
        bas_assert($mutated && $failed->get_status() >= 400, 'Native registry change committed');
    } finally {
        remove_action('wp_after_insert_post', $nativeMutation, 10);
        mbb_unregister_block_adapter($descriptor['name']);
        bas_assert(mbb_register_block_adapter($descriptor), 'Native provider restore failed');
    }
    clean_post_cache($id);
    bas_assert(
        get_post($id)->post_content === $nativeBefore &&
            get_post($id)->post_content_filtered === $nativeSource,
        'Native registry failure did not restore both fields',
    );
    // Same paired/source path with the standard CLI writer, never a second body save implementation.
    $file = tempnam(sys_get_temp_dir(), 'mbb-adapter-source-');
    file_put_contents($file, $source);
    update_post_meta($id, '_mbb_source_managed', 'file');
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($file)));
    $binding = static function ($value, $post) use ($id, $file) {
        return (int) $post->ID === $id ? $file : $value;
    };
    add_filter('mbb_source_write_target', $binding, 10, 2);
    bas_assert(
        mbb_sync_write($id, $source, 'Synthetic adapters', $file) === $id,
        'CLI trusted snapshot failed',
    );
    $sourcePreview = bas_call('/mbb/v1/preview', [
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'mode' => 'markdown',
        'source' => $source,
        'title' => 'Synthetic adapters',
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    bas_assert($sourcePreview->get_status() === 200, 'Source-bound preview failed');
    $webSource = str_replace('Author paragraph', 'Source edited paragraph', $source);
    $web = [
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'source_sha256' => hash_file('sha256', $file),
        'mode' => 'markdown',
        'source' => $webSource,
        'title' => 'Synthetic adapters',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $webReview = bas_ok(bas_call('/mbb/v1/preview', $web), 'Source candidate preview failed');
    $web['adapter_digest'] = $webReview['adapter_digest'];
    bas_ok(bas_call('/mbb/v1/source-save', $web), 'Source web paired save failed');
    bas_assert(
        file_get_contents($file) === $webSource &&
            get_post($id)->post_content_filtered === $webSource,
        'Source/web database pair diverged',
    );
    $webPair = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $webSource,
        'serialized' => get_post($id)->post_content,
        'documentId' => mbb_id($id),
    ]);
    bas_assert(!is_wp_error($webPair), 'Source saved adapter pair did not reopen');
    $web['expected'] = mbb_token(get_post($id));
    $web['source_sha256'] = hash_file('sha256', $file);
    $web['source'] = $webSource . "\nRejected missing provider.\n";
    mbb_unregister_block_adapter($descriptor['name']);
    $missingWrite = bas_call('/mbb/v1/source-save', $web);
    bas_assert(
        $missingWrite->get_status() >= 400 &&
            file_get_contents($file) === $webSource &&
            get_post($id)->post_content_filtered === $webSource,
        'Missing provider wrote source',
    );
    bas_assert(mbb_register_block_adapter($descriptor), 'Provider final restore failed');
    // Source is already written before wp_after_insert_post. Commit rejection must restore source + DB.
    $sourceBefore = file_get_contents($file);
    $serializedBefore = get_post($id)->post_content;
    $mutated = false;
    $attempt = [
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'source_sha256' => hash_file('sha256', $file),
        'mode' => 'markdown',
        'source' => $sourceBefore . "\nRejected registry mutation.\n",
        'title' => 'Synthetic adapters',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $review = bas_ok(bas_call('/mbb/v1/preview', $attempt), 'Rollback candidate preview failed');
    $attempt['adapter_digest'] = $review['adapter_digest'];
    $afterWrite = static function ($postId, $post) use (
        $id,
        $file,
        $attempt,
        $descriptor,
        &$mutated,
    ) {
        if ($mutated || (int) $postId !== $id || $post->post_type !== 'post') {
            return;
        }
        bas_assert(
            file_get_contents($file) === $attempt['source'],
            'Fault injection ran before source write',
        );
        $mutated = true;
        mbb_unregister_block_adapter($descriptor['name']);
        $changed = $descriptor;
        $changed['template']['children'][1]['children'][1]['text'] = ' : ';
        bas_assert(
            mbb_register_block_adapter($changed),
            'Could not change provider after source write',
        );
    };
    add_action('wp_after_insert_post', $afterWrite, 10, 2);
    try {
        $failed = bas_call('/mbb/v1/source-save', $attempt);
        bas_assert($mutated && $failed->get_status() >= 400, 'Source registry change committed');
    } finally {
        remove_action('wp_after_insert_post', $afterWrite, 10);
        mbb_unregister_block_adapter($descriptor['name']);
        bas_assert(mbb_register_block_adapter($descriptor), 'Could not restore source provider');
    }
    clean_post_cache($id);
    bas_assert(
        file_get_contents($file) === $sourceBefore &&
            get_post($id)->post_content_filtered === $sourceBefore &&
            get_post($id)->post_content === $serializedBefore,
        'Registry failure left source/paired fields split',
    );
    echo "Guarded native/static adapter save, revision, registry and source contracts passed.\n";
} finally {
    if ($binding) {
        remove_filter('mbb_source_write_target', $binding, 10);
    }
    if ($file) {
        unlink($file);
    }
    wp_set_current_user($actor);
    if ($id) {
        wp_delete_post($id, true);
    }
    if ($user) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
    if ($registered) {
        mbb_unregister_block_adapter($descriptor['name']);
    }
}
