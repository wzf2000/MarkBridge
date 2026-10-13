<?php
// Run only via WP-CLI in an explicitly identified synthetic local installation.
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
        'FrontMatter tests require an explicitly identified local WordPress lab.',
    );
}
if (!function_exists('mbb_frontmatter_candidate') || !mbb_runtime_diagnostics()['ok']) {
    throw new RuntimeException('A compatible candidate FrontMatter converter is required.');
}
function fm_save_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function fm_save_request($endpoint, array $params)
{
    $r = new WP_REST_Request('POST', $endpoint);
    foreach ($params as $key => $value) {
        $r->set_param($key, $value);
    }
    return rest_do_request($r);
}
function fm_save_ok($response, $message)
{
    fm_save_assert(
        $response->get_status() === 200,
        $message . ': ' . wp_json_encode($response->get_data()),
    );
    return $response->get_data();
}
function fm_save_head(array $proposal, string $body): string
{
    $head = "---\nmarkbridge: 1\n";
    foreach ($proposal as $field => $value) {
        $head .=
            $field .
            ': ' .
            wp_json_encode(
                $value,
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS,
            ) .
            "\n";
    }
    return $head . "---\n\n" . $body;
}
function fm_save_preview(array $params): array
{
    $preview = fm_save_ok(
        fm_save_request('/mbb/v1/preview', $params),
        'FrontMatter preview failed',
    );
    $params['frontmatter_receipt'] = $preview['frontmatter_receipt'];
    return [$params, $preview];
}
function fm_save_snapshot($id): array
{
    clean_post_cache($id);
    $p = get_post($id);
    return [
        $p->post_title,
        $p->post_content,
        $p->post_content_filtered,
        $p->post_excerpt,
        $p->post_name,
        $p->post_status,
        (int) get_post_thumbnail_id($id),
        mbb_frontmatter_current($p)['categories'],
        mbb_frontmatter_current($p)['tags'],
    ];
}
$suffix = substr(hash('sha256', uniqid('', true)), 0, 12);
$previous = get_current_user_id();
$posts = $users = $terms = $hooks = [];
$file = null;
try {
    $author = wp_insert_user([
        'user_login' => 'fm-author-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    fm_save_assert(!is_wp_error($author), 'Could not create synthetic author');
    $users[] = $author;
    wp_set_current_user($author);
    foreach (['category', 'post_tag'] as $taxonomy) {
        $term = wp_insert_term('FrontMatter ' . $suffix . $taxonomy, $taxonomy, [
            'slug' => 'fm-' . $suffix . '-' . $taxonomy,
        ]);
        fm_save_assert(!is_wp_error($term), 'Could not create synthetic term');
        $terms[$taxonomy] = (int) $term['term_id'];
    }
    $proposal = [
        'title' => 'Header title ' . $suffix,
        'excerpt' => "Summary <strong>safe</strong>\nSecond line",
        'slug' => 'fm-final-' . $suffix,
        'status' => 'draft',
        'categories' => ['fm-' . $suffix . '-category'],
        'tags' => ['fm-' . $suffix . '-post_tag'],
        'featured_media' => 0,
    ];
    $body =
        "# Synthetic body\n\nText $" .
        "x^2$ and note[^n].\n\n- [ ] Synthetic task\n\n:::mbb:v1 collapse {\"id\":\"fm-fold\",\"title\":\"Details\",\"open\":false}\n\nHidden author paragraph.\n\n:::mbb:end\n\n[^n]: Synthetic footnote.\n";
    $source = fm_save_head($proposal, $body);
    $params = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'FrontMatter' . $suffix,
        'title' => 'Form title ' . $suffix,
        'source' => $source,
        'post_status' => 'draft',
        'featured_media' => 0,
        'frontmatter_selected' => [],
    ];
    $created = fm_save_ok(fm_save_request('/mbb/v1/save', $params), 'Default import failed');
    $id = (int) $created['post_id'];
    $posts[] = $id;
    $p = get_post($id);
    fm_save_assert(
        $p->post_title === $params['title'] &&
            $p->post_excerpt === '' &&
            $p->post_name !== $proposal['slug'],
        'Unselected header silently applied metadata',
    );
    fm_save_assert(
        $p->post_content_filtered === $source &&
            !str_contains(do_blocks($p->post_content), 'markbridge: 1'),
        'Raw header changed or rendered in frontend',
    );
    $raw = parse_blocks($p->post_content)[0]['attrs']['raw'];
    fm_save_assert(
        $raw === substr($source, 0, strpos($source, "---\n\n", 5) + 4),
        'KSES changed the raw header carrier',
    );
    $reopen = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $source,
        'serialized' => $p->post_content,
        'documentId' => mbb_id($id),
    ]);
    fm_save_assert(
        !is_wp_error($reopen) && $reopen['serialized'] === $p->post_content,
        'Header pair could not reopen',
    );
    $revision_id = (int) $created['saved_revision'];
    $comment = wp_insert_comment([
        'comment_post_ID' => $id,
        'comment_content' => 'Synthetic retained comment',
        'comment_approved' => 1,
    ]);
    update_post_meta($id, '_fm_private_note', 'Synthetic retained note');
    $identity = [$p->ID, $p->post_author, mbb_id($id)];
    $params['post_id'] = $id;
    $params['expected'] = mbb_token($p);
    $params['frontmatter_selected'] = array_keys($proposal);
    $before = fm_save_snapshot($id);
    [$selected, $preview] = fm_save_preview($params);
    fm_save_assert(fm_save_snapshot($id) === $before, 'Preview wrote metadata or content');
    fm_save_assert(
        $preview['frontmatter_applied']['categories'] === [$terms['category']] &&
            $preview['frontmatter_applied']['tags'] === [$terms['post_tag']],
        'Preview did not resolve exact existing term IDs',
    );
    fm_save_assert(
        fm_save_request('/mbb/v1/save', $params)->get_status() === 409,
        'Selected fields saved without receipt',
    );
    $tampered = $selected;
    $tampered['source'] .= "\nChanged after preview.\n";
    fm_save_assert(
        fm_save_request('/mbb/v1/save', $tampered)->get_status() === 409,
        'Receipt accepted different body',
    );
    $tampered = $selected;
    $tampered['frontmatter_selected'] = ['title'];
    fm_save_assert(
        fm_save_request('/mbb/v1/save', $tampered)->get_status() === 409,
        'Receipt accepted different selected fields',
    );
    fm_save_ok(fm_save_request('/mbb/v1/save', $selected), 'Selected metadata save failed');
    $p = get_post($id);
    fm_save_assert(
        $p->post_title === $proposal['title'] &&
            $p->post_excerpt === $proposal['excerpt'] &&
            $p->post_name === $proposal['slug'] &&
            mbb_frontmatter_matches($id, $preview['frontmatter_applied']),
        'Saved metadata differed from selected resolution',
    );
    fm_save_assert(
        [$p->ID, $p->post_author, mbb_id($id)] === $identity &&
            get_comment($comment) &&
            get_post_meta($id, '_fm_private_note', true) === 'Synthetic retained note',
        'Metadata application lost identity/comments/private notes',
    );
    $params['expected'] = mbb_token($p);
    [$noop] = fm_save_preview($params);
    fm_save_assert(
        fm_save_ok(fm_save_request('/mbb/v1/save', $noop), 'Noop save failed')['noop'] === true,
        'Selected identical metadata was not a noop',
    );
    $native = fm_save_request('/wp/v2/posts/' . $id, [
        'title' => 'Native title ' . $suffix,
        'content' => $p->post_content,
        'mbb_expected' => mbb_token($p),
    ]);
    fm_save_ok($native, 'Native title edit failed');
    fm_save_assert(
        get_post($id)->post_title === 'Native title ' . $suffix &&
            parse_blocks(get_post($id)->post_content)[0]['attrs']['raw'] === $raw,
        'Native metadata silently rewrote the header',
    );
    fm_save_assert(
        fm_save_request('/wp/v2/posts/' . $id, [
            'content' => get_post($id)->post_content,
            'mbb_expected' => mbb_token(get_post($id)),
            'frontmatter_selected' => ['title'],
        ])->get_status() === 422,
        'Native route accepted header application without receipt workflow',
    );
    $revision = wp_get_post_revision($revision_id);
    $restore = [
        'mode' => 'restore',
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'revision_id' => $revision_id,
        'expected_revision' => mbb_revision_token($revision),
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    fm_save_assert(
        fm_save_request(
            '/mbb/v1/save',
            $restore + ['frontmatter_selected' => ['title']],
        )->get_status() === 422,
        'Revision restore applied header proposal',
    );
    fm_save_ok(fm_save_request('/mbb/v1/save', $restore), 'Header revision restore failed');
    fm_save_assert(
        get_post($id)->post_excerpt === $proposal['excerpt'] &&
            get_post($id)->post_name === $proposal['slug'] &&
            get_post($id)->post_content_filtered === $source,
        'Revision restore auto-applied historical header metadata',
    );

    // New page form may be blank only when the author explicitly selects its header title.
    $new = $params;
    $new['post_id'] = 0;
    unset($new['expected']);
    $new['documentId'] = 'FrontMatterNew' . $suffix;
    $new['title'] = '';
    $new['frontmatter_selected'] = ['title'];
    [$new] = fm_save_preview($new);
    $first = fm_save_ok(fm_save_request('/mbb/v1/save', $new), 'New selected-title import failed');
    $posts[] = (int) $first['post_id'];
    fm_save_assert(
        get_post($first['post_id'])->post_title === $proposal['title'],
        'Blank form title masked explicitly selected proposal',
    );

    // A term can retain its slug while changing identity; a prior receipt must then fail.
    wp_set_object_terms($id, [], 'post_tag');
    clean_post_cache($id);
    $params['expected'] = mbb_token(get_post($id));
    $params['frontmatter_selected'] = ['tags'];
    [$term_change] = fm_save_preview($params);
    wp_delete_term($terms['post_tag'], 'post_tag');
    $replacement = wp_insert_term('Replacement ' . $suffix, 'post_tag', [
        'slug' => $proposal['tags'][0],
    ]);
    fm_save_assert(!is_wp_error($replacement), 'Could not replace synthetic term');
    $terms['post_tag'] = (int) $replacement['term_id'];
    fm_save_assert(
        mbb_token(get_post($id)) === $term_change['expected'],
        'Unused term replacement unexpectedly changed the post baseline',
    );
    $replayed = fm_save_request('/mbb/v1/save', $term_change);
    fm_save_assert(
        $replayed->get_status() === 409 && $replayed->get_data()['code'] === 'frontmatter_receipt',
        'Receipt accepted changed resolved term identity',
    );
    $collision = wp_insert_post([
        'post_title' => 'Synthetic collision',
        'post_name' => 'collision-' . $suffix,
        'post_status' => 'publish',
        'post_author' => $author,
    ]);
    $posts[] = $collision;
    $bad = $params;
    $bad['source'] = fm_save_head(['slug' => 'collision-' . $suffix], $body);
    $bad['frontmatter_selected'] = ['slug'];
    fm_save_assert(
        fm_save_request('/mbb/v1/preview', $bad)->get_status() === 409,
        'Slug collision was silently renamed',
    );
    $bad['source'] = fm_save_head(['tags' => ['missing-' . $suffix]], $body);
    $bad['frontmatter_selected'] = ['tags'];
    fm_save_assert(
        fm_save_request('/mbb/v1/preview', $bad)->get_status() === 422 &&
            !get_term_by('slug', 'missing-' . $suffix, 'post_tag'),
        'Missing term was created or accepted',
    );
    $contributor = wp_insert_user([
        'user_login' => 'fm-contributor-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'contributor',
    ]);
    fm_save_assert(!is_wp_error($contributor), 'Could not create synthetic contributor');
    $users[] = $contributor;
    wp_set_current_user($contributor);
    $bad = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'FrontMatterDenied' . $suffix,
        'title' => 'Contributor',
        'source' => fm_save_head(['status' => 'publish'], $body),
        'post_status' => 'draft',
        'featured_media' => 0,
        'frontmatter_selected' => ['status'],
    ];
    fm_save_assert(
        fm_save_request('/mbb/v1/preview', $bad)->get_status() === 403,
        'Header bypassed publication permissions',
    );
    wp_set_current_user($author);

    // Actual image attachment and status/cover integration through selected proposals.
    $upload = wp_upload_bits(
        'fm-' . $suffix . '.png',
        null,
        base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVioAAAAASUVORK5CYII=',
        ),
    );
    fm_save_assert(!$upload['error'], 'Could not create synthetic PNG');
    $image = wp_insert_attachment(
        [
            'post_title' => 'Synthetic FrontMatter image',
            'post_mime_type' => 'image/png',
            'post_status' => 'inherit',
        ],
        $upload['file'],
    );
    fm_save_assert(!is_wp_error($image) && $image > 0, 'Could not register synthetic PNG');
    $posts[] = $image;
    require_once ABSPATH . 'wp-admin/includes/image.php';
    wp_update_attachment_metadata($image, wp_generate_attachment_metadata($image, $upload['file']));
    fm_save_assert(
        wp_attachment_is_image($image) && wp_get_attachment_image($image),
        'Synthetic PNG is not a usable image attachment',
    );
    $publication = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'FrontMatterPublication' . $suffix,
        'title' => 'Publication fixture',
        'source' => fm_save_head(['status' => 'publish', 'featured_media' => $image], $body),
        'post_status' => 'draft',
        'featured_media' => 0,
        'frontmatter_selected' => ['status', 'featured_media'],
    ];
    [$publication] = fm_save_preview($publication);
    $published = fm_save_ok(
        fm_save_request('/mbb/v1/save', $publication),
        'Selected status/cover publication failed',
    );
    $pub_id = (int) $published['post_id'];
    $posts[] = $pub_id;
    fm_save_assert(
        get_post($pub_id)->post_status === 'publish' &&
            (int) get_post_thumbnail_id($pub_id) === $image,
        'Selected publication status/PNG were not applied',
    );
    foreach (['private', 'draft'] as $status) {
        $publication['post_id'] = $pub_id;
        $publication['expected'] = mbb_token(get_post($pub_id));
        $cover = $status === 'draft' ? 0 : $image;
        $publication['source'] = fm_save_head(
            ['status' => $status, 'featured_media' => $cover],
            $body,
        );
        [$publication] = fm_save_preview($publication);
        fm_save_ok(
            fm_save_request('/mbb/v1/save', $publication),
            'Selected status transition failed: ' . $status,
        );
        fm_save_assert(
            get_post($pub_id)->post_status === $status &&
                (int) get_post_thumbnail_id($pub_id) === $cover,
            'Status transition/cover removal differed from receipt',
        );
    }
    $other = wp_insert_user([
        'user_login' => 'fm-other-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    $editor = wp_insert_user([
        'user_login' => 'fm-editor-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'editor',
    ]);
    fm_save_assert(
        !is_wp_error($other) && !is_wp_error($editor),
        'Could not create synthetic permission actors',
    );
    $users[] = $other;
    $users[] = $editor;
    wp_set_current_user($other);
    $other_params = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'FrontMatterOther' . $suffix,
        'title' => 'Other author fixture',
        'source' => fm_save_head(['title' => 'Editor-applied title'], $body),
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $other_saved = fm_save_ok(
        fm_save_request('/mbb/v1/save', $other_params),
        'Other author fixture creation failed',
    );
    $other_id = (int) $other_saved['post_id'];
    $posts[] = $other_id;
    $other_params['post_id'] = $other_id;
    $other_params['expected'] = mbb_token(get_post($other_id));
    $other_params['frontmatter_selected'] = ['title'];
    wp_set_current_user($author);
    fm_save_assert(
        fm_save_request('/mbb/v1/preview', $other_params)->get_status() === 403,
        'Author applied metadata to another author post',
    );
    wp_set_current_user($editor);
    [$other_params] = fm_save_preview($other_params);
    fm_save_ok(
        fm_save_request('/mbb/v1/save', $other_params),
        'Editor could not apply permitted metadata',
    );
    fm_save_assert(
        get_post($other_id)->post_title === 'Editor-applied title' &&
            (int) get_post($other_id)->post_author === $other,
        'Editor application changed original author',
    );
    wp_set_current_user($author);

    // Coordinated source/DB failure paths; queries and hooks are real WordPress hooks.
    $file = tempnam(sys_get_temp_dir(), 'mbb-frontmatter-source-');
    file_put_contents($file, get_post($id)->post_content_filtered);
    update_post_meta($id, '_mbb_source_managed', 'file');
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($file)));
    $mapping = static fn($target, $post) => (int) $post->ID === $id ? $file : $target;
    add_filter('mbb_source_write_target', $mapping, 10, 2);
    $hooks[] = ['mbb_source_write_target', $mapping, 10];
    $source_params = $params;
    $source_params['expected'] = mbb_token(get_post($id));
    $source_params['source_sha256'] = hash_file('sha256', $file);
    $source_params['source'] = fm_save_head(
        ['excerpt' => 'Source excerpt ' . $suffix, 'categories' => $proposal['categories']],
        str_replace('Synthetic body', 'Updated synthetic body', $body),
    );
    $source_params['frontmatter_selected'] = ['excerpt', 'categories'];
    [$source_params] = fm_save_preview($source_params);
    $before = fm_save_snapshot($id);
    $source_before = file_get_contents($file);
    foreach (['start', 'terms', 'revisions', 'verify'] as $failure) {
        $started = false;
        $query = static function ($sql) use ($failure, &$started) {
            if ($sql === 'START TRANSACTION') {
                if ($failure === 'start') {
                    throw new RuntimeException('Synthetic START failure');
                }
                $started = true;
            }
            return $sql;
        };
        $term_hook = static function ($value) use ($failure, &$started) {
            if ($started && $failure === 'terms') {
                throw new RuntimeException('Synthetic term failure');
            }
            return $value;
        };
        $revision_hook = static function ($value, $query) use ($failure, &$started) {
            if ($started && $failure === 'revisions' && $query->get('post_type') === 'revision') {
                throw new RuntimeException('Synthetic repeated revision query failure');
            }
            return $value;
        };
        $verify_hook = static function ($data, $postarr) use ($failure, &$started, $id) {
            if ($started && $failure === 'verify' && (int) ($postarr['ID'] ?? 0) === $id) {
                $data['post_title'] = 'Synthetic forced mismatch';
            }
            return $data;
        };
        add_filter('query', $query);
        add_filter('get_object_terms', $term_hook);
        add_filter('posts_pre_query', $revision_hook, 10, 2);
        add_filter('wp_insert_post_data', $verify_hook, 10, 2);
        try {
            $response = fm_save_request('/mbb/v1/source-save', $source_params);
            fm_save_assert(
                $response->get_status() === 500,
                'Failure injection did not fail: ' .
                    $failure .
                    ' ' .
                    wp_json_encode($response->get_data()),
            );
        } finally {
            remove_filter('query', $query);
            remove_filter('get_object_terms', $term_hook);
            remove_filter('posts_pre_query', $revision_hook);
            remove_filter('wp_insert_post_data', $verify_hook);
        }
        fm_save_assert(
            file_get_contents($file) === $source_before && fm_save_snapshot($id) === $before,
            'Failure left source/metadata/content or cache changed: ' . $failure,
        );
    }
    fm_save_ok(
        fm_save_request('/mbb/v1/source-save', $source_params),
        'Coordinated metadata source-save failed',
    );
    fm_save_assert(
        file_get_contents($file) === $source_params['source'] &&
            get_post($id)->post_content_filtered === $source_params['source'] &&
            get_post($id)->post_excerpt === 'Source excerpt ' . $suffix,
        'Source and metadata save differed',
    );
    $source_params['expected'] = mbb_token(get_post($id));
    file_put_contents($file, $source_params['source'] . "\nExternal edit.\n");
    fm_save_assert(
        fm_save_request('/mbb/v1/source-save', $source_params)->get_status() === 409,
        'Stale source hash was accepted',
    );
    echo 'FrontMatter ' .
        mbb_converter_backend() .
        " actual WordPress proposals/selected receipt/default separation/KSES/native/revisions/terms/slug/permissions/noop/source double hash/transaction failures passed.\n";
} finally {
    foreach ($hooks as [$name, $callback, $priority]) {
        remove_filter($name, $callback, $priority);
    }
    if ($file && is_file($file)) {
        unlink($file);
    }
    wp_set_current_user($previous);
    foreach ($posts as $post) {
        get_post_type($post) === 'attachment'
            ? wp_delete_attachment($post, true)
            : wp_delete_post($post, true);
    }
    foreach ($terms as $taxonomy => $term) {
        wp_delete_term($term, $taxonomy);
    }
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach ($users as $user) {
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
}
