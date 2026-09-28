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
function native_changed_pair($id, $source)
{
    $base = mbb_document(get_post($id));
    $converted = mbb_convert([
        'mode' => 'markdown',
        'source' => $source,
        'serialized' => null,
        'documentId' => mbb_id($id),
        'base' => $base,
    ]);
    native_assert(!is_wp_error($converted), 'Could not prepare changed document blocks.');
    $roundtripped = mbb_convert([
        'mode' => 'blocks',
        'source' => null,
        'serialized' => $converted['serialized'],
        'documentId' => mbb_id($id),
        'base' => $base,
    ]);
    native_assert(!is_wp_error($roundtripped), 'Could not round-trip changed document blocks.');
    return $roundtripped;
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
$page_id = 0;
$restore_id = 0;
$attachment_id = 0;
$upload_path = null;
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

    $png = base64_decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
        true,
    );
    native_assert($png !== false, 'Could not decode synthetic cover image.');
    $upload = wp_upload_bits('mbb-native-' . $suffix . '.png', null, $png);
    native_assert(empty($upload['error']), 'Could not upload synthetic cover image.');
    $upload_path = $upload['file'];
    $attachment_id = wp_insert_attachment(
        [
            'post_mime_type' => 'image/png',
            'post_title' => 'Synthetic cover ' . $suffix,
            'post_status' => 'inherit',
        ],
        $upload_path,
        0,
        true,
    );
    native_assert(!is_wp_error($attachment_id), 'Could not create synthetic cover attachment.');
    $published = native_request($fixture_id, [
        'mbb_expected' => mbb_token(get_post($fixture_id)),
        'status' => 'publish',
        'featured_media' => $attachment_id,
    ]);
    native_assert(
        native_status($published) === 200,
        'Covered native publication failed: ' . wp_json_encode($published->get_data()),
    );
    native_assert(get_post($fixture_id)->post_status === 'publish', 'Publication status missing.');
    native_assert(
        (int) get_post_thumbnail_id($fixture_id) === $attachment_id,
        'Publication cover missing.',
    );
    $published_source = get_post($fixture_id)->post_content_filtered;
    $published_pair = native_changed_pair($fixture_id, "Published update paragraph\n");
    $published_update = native_request($fixture_id, [
        'mbb_expected' => $published->get_data()['mbb_expected'],
        'content' => $published_pair['serialized'],
        'title' => 'Synthetic published native revision',
    ]);
    native_assert(native_status($published_update) === 200, 'Published native update failed.');
    native_assert(
        get_post($fixture_id)->post_status === 'publish',
        'Published update changed status.',
    );
    native_assert(
        get_post($fixture_id)->post_content === $published_pair['serialized'] &&
            get_post($fixture_id)->post_content_filtered === $published_pair['source'] &&
            get_post($fixture_id)->post_content_filtered !== $published_source &&
            (int) get_post_thumbnail_id($fixture_id) === $attachment_id,
        'Published update broke paired source or cover.',
    );

    $page_id = wp_insert_post(
        [
            'post_type' => 'page',
            'post_status' => 'draft',
            'post_title' => 'Synthetic managed page baseline',
        ],
        true,
    );
    native_assert(!is_wp_error($page_id), 'Could not create synthetic page.');
    update_post_meta($page_id, '_mbb_origin', 'markdown_import');
    update_post_meta($page_id, '_mbb_document_id', 'NativePage' . $suffix);
    $page_seed = new WP_REST_Request('POST', '/mbb/v1/save');
    foreach (
        [
            'post_id' => $page_id,
            'expected' => mbb_token(get_post($page_id)),
            'mode' => 'markdown',
            'source' => "Initial page paragraph\n",
            'title' => 'Synthetic managed page baseline',
            'post_status' => 'draft',
            'featured_media' => 0,
        ]
        as $key => $value
    ) {
        $page_seed->set_param($key, $value);
    }
    $page_created = mbb_save($page_seed);
    native_assert(!is_wp_error($page_created), 'Could not seed paired page.');
    $page_blocks = mbb_convert([
        'mode' => 'markdown',
        'source' => "Revised page paragraph\n",
        'serialized' => null,
        'documentId' => mbb_id($page_id),
        'base' => mbb_document(get_post($page_id)),
    ]);
    native_assert(!is_wp_error($page_blocks), 'Could not prepare page blocks.');
    $page_expected = mbb_convert([
        'mode' => 'blocks',
        'source' => null,
        'serialized' => $page_blocks['serialized'],
        'documentId' => mbb_id($page_id),
        'base' => mbb_document(get_post($page_id)),
    ]);
    native_assert(!is_wp_error($page_expected), 'Could not round-trip page blocks.');
    $page_saved = native_request(
        $page_id,
        [
            'mbb_expected' => mbb_token(get_post($page_id)),
            'content' => $page_blocks['serialized'],
            'title' => 'Synthetic managed page revised',
            'menu_order' => 3,
        ],
        '/wp/v2/pages/' . $page_id,
    );
    native_assert(native_status($page_saved) === 200, 'Managed page native save failed.');
    native_assert(get_post($page_id)->post_type === 'page', 'Managed page changed type.');
    native_assert(
        get_post($page_id)->post_title === 'Synthetic managed page revised',
        'Page title missing.',
    );
    native_assert((int) get_post($page_id)->menu_order === 3, 'Page menu order missing.');
    native_assert(
        get_post($page_id)->post_content === $page_blocks['serialized'] &&
            get_post($page_id)->post_content_filtered === $page_expected['source'],
        'Managed page source and blocks are not paired.',
    );
    native_assert(
        $page_saved->get_data()['mbb_expected'] === mbb_token(get_post($page_id)),
        'Managed page updated token missing.',
    );

    $restore_seed = new WP_REST_Request('POST', '/mbb/v1/save');
    foreach (
        [
            'post_id' => 0,
            'documentId' => 'NativeRestore' . $suffix,
            'title' => 'Synthetic restore baseline',
            'mode' => 'markdown',
            'source' => "Restore baseline paragraph\n",
            'post_status' => 'draft',
            'featured_media' => 0,
        ]
        as $key => $value
    ) {
        $restore_seed->set_param($key, $value);
    }
    $restore_created = mbb_save($restore_seed);
    native_assert(!is_wp_error($restore_created), 'Could not create restore fixture.');
    $restore_id = (int) $restore_created['post_id'];
    $baseline_revision_id = (int) $restore_created['saved_revision'];
    $baseline_revision = wp_get_post_revision($baseline_revision_id);
    native_assert((bool) $baseline_revision, 'Restore baseline revision missing.');
    $restore_blocks = mbb_convert([
        'mode' => 'markdown',
        'source' => "Restore middle paragraph\n",
        'serialized' => null,
        'documentId' => mbb_id($restore_id),
        'base' => mbb_document(get_post($restore_id)),
    ]);
    native_assert(!is_wp_error($restore_blocks), 'Could not prepare restore middle blocks.');
    $middle = native_request($restore_id, [
        'mbb_expected' => mbb_token(get_post($restore_id)),
        'content' => $restore_blocks['serialized'],
        'title' => 'Synthetic restore middle',
    ]);
    native_assert(native_status($middle) === 200, 'Initial native save before restore failed.');
    $restore_request = new WP_REST_Request('POST', '/mbb/v1/save');
    foreach (
        [
            'post_id' => $restore_id,
            'expected' => mbb_token(get_post($restore_id)),
            'mode' => 'restore',
            'revision_id' => $baseline_revision->ID,
            'expected_revision' => mbb_revision_token($baseline_revision),
            'post_status' => 'draft',
            'featured_media' => 0,
        ]
        as $key => $value
    ) {
        $restore_request->set_param($key, $value);
    }
    $restored = rest_do_request($restore_request);
    native_assert(native_status($restored) === 200, 'Paired history restore failed.');
    native_assert(
        get_post($restore_id)->post_content === $baseline_revision->post_content &&
            get_post($restore_id)->post_content_filtered ===
                $baseline_revision->post_content_filtered &&
            get_post($restore_id)->post_title === $baseline_revision->post_title,
        'History restore did not preserve the exact pair.',
    );
    native_assert(
        (int) get_metadata(
            'post',
            $restored->get_data()['saved_revision'],
            '_mbb_restored_from',
            true,
        ) === $baseline_revision->ID,
        'Restored revision ancestry missing.',
    );
    $after_restore_pair = native_changed_pair($restore_id, "Native after restore paragraph\n");
    $after_restore = native_request($restore_id, [
        'mbb_expected' => mbb_token(get_post($restore_id)),
        'content' => $after_restore_pair['serialized'],
        'title' => 'Synthetic native after restore',
    ]);
    native_assert(native_status($after_restore) === 200, 'Native save after restore failed.');
    native_assert(
        get_post($restore_id)->post_title === 'Synthetic native after restore' &&
            get_post($restore_id)->post_content === $after_restore_pair['serialized'] &&
            get_post($restore_id)->post_content_filtered === $after_restore_pair['source'] &&
            get_post($restore_id)->post_content_filtered !==
                $baseline_revision->post_content_filtered,
        'Native save after restore did not update the source and blocks together.',
    );

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
    $managed_allowed = apply_filters(
        'allowed_block_types_all',
        true,
        (object) ['post' => get_post($fixture_id)],
    );
    native_assert(
        is_array($managed_allowed) && !in_array('core/math', $managed_allowed, true),
        'Managed inserter still offers native core math.',
    );
    native_assert(
        apply_filters(
            'allowed_block_types_all',
            true,
            (object) ['post' => get_post($ordinary_id)],
        ) === true,
        'Ordinary post block allowances changed.',
    );
    native_assert(
        apply_filters(
            'allowed_block_types_all',
            ['core/math', 'core/paragraph'],
            (object) ['post' => get_post($fixture_id)],
        ) === ['core/paragraph'],
        'Managed inserter did not preserve an existing allowlist.',
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
    if ($page_id) {
        wp_delete_post($page_id, true);
    }
    if ($restore_id) {
        wp_delete_post($restore_id, true);
    }
    if ($attachment_id && !is_wp_error($attachment_id)) {
        wp_delete_attachment($attachment_id, true);
    } elseif ($upload_path && file_exists($upload_path)) {
        unlink($upload_path);
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
