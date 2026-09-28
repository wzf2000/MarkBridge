<?php
// Both variables must identify an isolated local WordPress installation explicitly.
$expected_home = getenv('MARKBRIDGE_TEST_HOME');
$expected_root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$host = is_string($expected_home) ? parse_url($expected_home, PHP_URL_HOST) : null;
if (
    !$expected_home ||
    !$expected_root ||
    !in_array($host, ['127.0.0.1', 'localhost', '::1'], true) ||
    wp_get_environment_type() !== 'local' ||
    rtrim(home_url(), '/') !== rtrim($expected_home, '/') ||
    realpath(ABSPATH) !== realpath($expected_root)
) {
    throw new RuntimeException(
        'Native REST save test requires an explicitly configured local lab.',
    );
}
if (!function_exists('mbb_native_rest_update') || !mbb_runtime_diagnostics()['ok']) {
    throw new RuntimeException('Candidate plugin and compatible converter runtime are required.');
}
function native_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function native_request($id, $params, $path = null)
{
    $request = new WP_REST_Request('POST', $path ?: '/wp/v2/posts/' . $id);
    foreach ($params as $key => $value) {
        $request->set_param($key, $value);
    }
    return rest_do_request($request);
}
function native_status($response)
{
    return $response instanceof WP_REST_Response ? $response->get_status() : 500;
}
function native_term_ids($id, $taxonomy)
{
    $ids = wp_get_object_terms($id, $taxonomy, ['fields' => 'ids']);
    native_assert(!is_wp_error($ids), 'Failed to read fixture terms.');
    $ids = array_map('intval', $ids);
    sort($ids);
    return $ids;
}
$admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
native_assert((bool) $admins, 'Lab administrator unavailable.');
$previous_user = get_current_user_id();
wp_set_current_user((int) $admins[0]);
register_post_meta('post', '_mbb_native_probe', [
    'type' => 'string',
    'single' => true,
    'show_in_rest' => true,
    'auth_callback' => '__return_true',
]);
$suffix = substr(hash('sha256', uniqid('', true)), 0, 10);
$fixture_id = 0;
$ordinary_id = 0;
$term_ids = [];
$user_id = 0;
$other_user_id = 0;
try {
    foreach (['category', 'category', 'post_tag', 'post_tag'] as $index => $taxonomy) {
        $term = wp_insert_term('MBB Native ' . $suffix . ' ' . $index, $taxonomy);
        native_assert(!is_wp_error($term), 'Could not create synthetic taxonomy fixture.');
        $term_ids[] = ['id' => (int) $term['term_id'], 'taxonomy' => $taxonomy];
    }
    [$cat_a, $cat_b, $tag_a, $tag_b] = array_column($term_ids, 'id');
    $doc_id = 'Native' . $suffix;
    $initial_source = 'Before $x$ paragraph.' . "\n";
    $new = new WP_REST_Request('POST', '/mbb/v1/save');
    foreach (
        [
            'post_id' => 0,
            'documentId' => $doc_id,
            'title' => 'Synthetic native baseline',
            'mode' => 'markdown',
            'source' => $initial_source,
            'post_status' => 'draft',
            'featured_media' => 0,
        ]
        as $key => $value
    ) {
        $new->set_param($key, $value);
    }
    $created = mbb_save($new);
    native_assert(!is_wp_error($created), 'Could not create synthetic paired fixture.');
    $fixture_id = (int) $created['post_id'];
    native_assert($fixture_id > 0, 'Missing fixture post ID.');
    $baseline_source = get_post($fixture_id)->post_content_filtered;
    $baseline_blocks = get_post($fixture_id)->post_content;

    $initial_token = mbb_token(get_post($fixture_id));
    $metadata = native_request($fixture_id, [
        'mbb_expected' => $initial_token,
        'categories' => [$cat_a],
        'tags' => [$tag_a],
        'template' => '',
        'meta' => ['_mbb_native_probe' => 'one'],
    ]);
    native_assert(native_status($metadata) === 200, 'Native metadata-only update failed.');
    native_assert(
        $metadata->get_data()['mbb_expected'] === mbb_token(get_post($fixture_id)),
        'Updated token missing.',
    );
    native_assert(
        get_post($fixture_id)->post_content === $baseline_blocks,
        'Metadata-only update changed blocks.',
    );
    native_assert(
        get_post($fixture_id)->post_content_filtered === $baseline_source,
        'Metadata-only update changed source.',
    );
    native_assert(native_term_ids($fixture_id, 'category') === [$cat_a], 'Category was not saved.');
    native_assert(native_term_ids($fixture_id, 'post_tag') === [$tag_a], 'Tag was not saved.');
    native_assert(
        get_post_meta($fixture_id, '_mbb_native_probe', true) === 'one',
        'REST meta was not saved.',
    );
    native_assert(
        mbb_token(get_post($fixture_id)) !== $initial_token,
        'Metadata-only save did not advance token.',
    );
    $stale_metadata = native_request($fixture_id, [
        'mbb_expected' => $initial_token,
        'title' => 'Should not accept old metadata token',
    ]);
    native_assert(native_status($stale_metadata) === 409, 'Metadata-only old token was accepted.');

    $before_full = mbb_token(get_post($fixture_id));
    $changed_source = 'After $x$ paragraph.' . "\n";
    $converted = mbb_convert([
        'mode' => 'markdown',
        'source' => $changed_source,
        'serialized' => null,
        'documentId' => $doc_id,
        'base' => mbb_document(get_post($fixture_id)),
    ]);
    native_assert(!is_wp_error($converted), 'Could not prepare valid changed blocks.');
    $roundtripped = mbb_convert([
        'mode' => 'blocks',
        'source' => null,
        'serialized' => $converted['serialized'],
        'documentId' => $doc_id,
        'base' => mbb_document(get_post($fixture_id)),
    ]);
    native_assert(!is_wp_error($roundtripped), 'Could not round-trip candidate blocks.');
    $canonical_source = $roundtripped['source'];
    $full = native_request($fixture_id, [
        'mbb_expected' => $before_full,
        'content' => $converted['serialized'],
        'title' => 'Synthetic native revised',
        'categories' => [$cat_b],
        'tags' => [$tag_b],
        'meta' => ['_mbb_native_probe' => 'two'],
    ]);
    native_assert(native_status($full) === 200, 'Native content and metadata update failed.');
    native_assert(
        get_post($fixture_id)->post_content_filtered === $canonical_source,
        'Markdown source not paired: ' . json_encode(get_post($fixture_id)->post_content_filtered),
    );
    native_assert(
        native_term_ids($fixture_id, 'category') === [$cat_b],
        'Revised category missing.',
    );
    native_assert(native_term_ids($fixture_id, 'post_tag') === [$tag_b], 'Revised tag missing.');
    native_assert(
        get_post_meta($fixture_id, '_mbb_native_probe', true) === 'two',
        'Revised REST meta missing.',
    );
    $history = get_post_meta($fixture_id, '_mbb_source_history', true);
    native_assert(
        in_array(hash('sha256', $baseline_source), $history, true),
        'Old source history missing.',
    );
    native_assert(
        in_array(hash('sha256', $canonical_source), $history, true),
        'New source history missing.',
    );
    $revisions = wp_get_post_revisions($fixture_id, ['posts_per_page' => 1]);
    native_assert((bool) $revisions, 'Paired revision missing.');
    native_assert(
        (bool) get_metadata('post', array_key_first($revisions), '_mbb_revision_pair', true),
        'Revision pair metadata missing.',
    );

    $stale = native_request($fixture_id, [
        'mbb_expected' => $before_full,
        'title' => 'Should never save',
    ]);
    native_assert(native_status($stale) === 409, 'Old expected fingerprint was accepted.');
    native_assert(
        get_post($fixture_id)->post_title === 'Synthetic native revised',
        'Conflict changed title.',
    );
    $invalid = native_request($fixture_id, [
        'mbb_expected' => mbb_token(get_post($fixture_id)),
        'content' =>
            '<!-- wp:core/video --><figure class="wp-block-video"><video></video></figure><!-- /wp:core/video -->',
    ]);
    native_assert(native_status($invalid) >= 400, 'Unsupported block was accepted.');
    native_assert(
        get_post($fixture_id)->post_content_filtered === $canonical_source,
        'Invalid block changed source.',
    );

    $saved_token = mbb_token(get_post($fixture_id));
    $saved_block = get_post($fixture_id)->post_content;
    $saved_terms = native_term_ids($fixture_id, 'category');
    $count_before = get_term($cat_b, 'category')->count;
    $fail_meta = function ($check, $object_id, $meta_key) use ($fixture_id) {
        return (int) $object_id === $fixture_id && $meta_key === '_mbb_native_probe'
            ? false
            : $check;
    };
    add_filter('update_post_metadata', $fail_meta, 10, 3);
    try {
        $failed = native_request($fixture_id, [
            'mbb_expected' => $saved_token,
            'content' => $baseline_blocks,
            'categories' => [$cat_a],
            'sticky' => true,
            'meta' => ['_mbb_native_probe' => 'must-rollback'],
        ]);
    } finally {
        remove_filter('update_post_metadata', $fail_meta, 10);
    }
    native_assert(
        native_status($failed) >= 400,
        'Injected REST meta failure did not reject update.',
    );
    native_assert(
        get_post($fixture_id)->post_content === $saved_block,
        'Meta failure left changed blocks.',
    );
    native_assert(
        get_post($fixture_id)->post_content_filtered === $canonical_source,
        'Meta failure left changed source.',
    );
    native_assert(
        native_term_ids($fixture_id, 'category') === $saved_terms,
        'Meta failure left changed terms.',
    );
    native_assert(
        get_term($cat_b, 'category')->count === $count_before,
        'Term count cache was stale after rollback.',
    );
    native_assert(!is_sticky($fixture_id), 'Sticky option/cache survived rollback.');
    native_assert(
        get_post_meta($fixture_id, '_mbb_native_probe', true) === 'two',
        'Meta failure changed REST meta.',
    );
    native_assert(
        mbb_token(get_post($fixture_id)) === $saved_token,
        'Rollback did not restore fingerprint.',
    );
    $uncovered_publish = native_request($fixture_id, [
        'mbb_expected' => $saved_token,
        'status' => 'publish',
    ]);
    native_assert(
        native_status($uncovered_publish) === 422,
        'Publishing without cover was accepted.',
    );
    native_assert(
        get_post($fixture_id)->post_status === 'draft',
        'Rejected publication changed status.',
    );

    $autosave = native_request(
        $fixture_id,
        ['content' => $baseline_blocks],
        '/wp/v2/posts/' . $fixture_id . '/autosaves',
    );
    native_assert(native_status($autosave) === 403, 'Managed autosave was not rejected.');
    update_post_meta($fixture_id, '_mbb_source_managed', 'file');
    $source_locked = native_request($fixture_id, [
        'mbb_expected' => mbb_token(get_post($fixture_id)),
        'title' => 'Should never write source',
    ]);
    native_assert(
        native_status($source_locked) === 403,
        'Source-managed native save was accepted.',
    );
    delete_post_meta($fixture_id, '_mbb_source_managed');

    $user_id = wp_create_user(
        'mbb-native-' . $suffix,
        wp_generate_password(32),
        'mbb-native-' . $suffix . '@example.invalid',
    );
    native_assert(!is_wp_error($user_id), 'Could not create role fixture.');
    (new WP_User($user_id))->set_role('subscriber');
    wp_set_current_user($user_id);
    $denied = native_request($fixture_id, [
        'mbb_expected' => mbb_token(get_post($fixture_id)),
        'title' => 'Should never save by subscriber',
    ]);
    native_assert(native_status($denied) === 403, 'Subscriber edited managed post.');
    wp_set_current_user((int) $admins[0]);

    $other_user_id = wp_create_user(
        'mbb-native-other-' . $suffix,
        wp_generate_password(32),
        'mbb-native-other-' . $suffix . '@example.invalid',
    );
    native_assert(!is_wp_error($other_user_id), 'Could not create second author fixture.');
    (new WP_User($user_id))->set_role('author');
    (new WP_User($other_user_id))->set_role('author');
    $assign = native_request($fixture_id, [
        'mbb_expected' => mbb_token(get_post($fixture_id)),
        'author' => $user_id,
    ]);
    native_assert(native_status($assign) === 200, 'Could not assign synthetic author.');
    $author_token = mbb_token(get_post($fixture_id));
    wp_set_current_user($user_id);
    native_assert(
        current_user_can('edit_post', $fixture_id),
        'Assigned author lacks edit_post capability: ' .
            wp_json_encode([
                'author' => get_post($fixture_id)->post_author,
                'user' => $user_id,
                'can_edit_posts' => current_user_can('edit_posts'),
            ]),
    );
    $own = native_request($fixture_id, [
        'mbb_expected' => $author_token,
        'title' => 'Synthetic own-author revision',
    ]);
    native_assert(
        native_status($own) === 200,
        'Author could not edit own managed draft: ' . wp_json_encode($own->get_data()),
    );
    native_assert(
        get_post($fixture_id)->post_title === 'Synthetic own-author revision',
        'Own-author change missing.',
    );
    wp_set_current_user($other_user_id);
    $others = native_request($fixture_id, [
        'mbb_expected' => mbb_token(get_post($fixture_id)),
        'title' => 'Should not edit another author',
    ]);
    native_assert(native_status($others) === 403, 'Author edited another author managed draft.');
    wp_set_current_user((int) $admins[0]);

    $ordinary_id = wp_insert_post([
        'post_type' => 'post',
        'post_status' => 'draft',
        'post_title' => 'Synthetic ordinary baseline',
        'post_content' => 'ordinary',
    ]);
    native_assert(is_int($ordinary_id) && $ordinary_id > 0, 'Could not create ordinary fixture.');
    $ordinary = native_request($ordinary_id, ['title' => 'Synthetic ordinary revised']);
    native_assert(native_status($ordinary) === 200, 'Ordinary WordPress post was intercepted.');
    native_assert(
        get_post($ordinary_id)->post_title === 'Synthetic ordinary revised',
        'Ordinary post update failed.',
    );
    echo "Native REST paired-save fixture passed.\n";
} finally {
    wp_set_current_user((int) $admins[0]);
    if ($fixture_id) {
        wp_delete_post($fixture_id, true);
    }
    if ($ordinary_id) {
        wp_delete_post($ordinary_id, true);
    }
    foreach ($term_ids as $term) {
        wp_delete_term($term['id'], $term['taxonomy']);
    }
    if ($user_id) {
        wp_delete_user($user_id);
    }
    if ($other_user_id) {
        wp_delete_user($other_user_id);
    }
    wp_set_current_user($previous_user);
}
