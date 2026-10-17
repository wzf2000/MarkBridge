<?php
// Explicitly identified disposable WordPress only. Execute against a fixed installed candidate.
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
if (
    !$root ||
    !$home ||
    realpath(ABSPATH) !== realpath($root) ||
    rtrim(home_url(), '/') !== rtrim($home, '/') ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Bibliography checks require the identified disposable local lab.');
}
function bibliography_save_assert($ok, string $label): void
{
    if (!$ok) {
        throw new RuntimeException($label);
    }
}
function bibliography_save_request(string $route, array $data, string $method = 'POST')
{
    $r = new WP_REST_Request(
        $method,
        str_starts_with($route, '/wp/v2/') ? $route : '/mbb/v1/' . $route,
    );
    $r->set_header('Content-Type', 'application/json');
    $r->set_body(wp_json_encode($data));
    foreach ($data as $k => $v) {
        $r->set_param($k, $v);
    }
    return rest_do_request($r);
}
function bibliography_save_pair(array $payload): array
{
    $preview = bibliography_save_request('preview', $payload);
    bibliography_save_assert(
        $preview->get_status() === 200,
        'preview: ' . wp_json_encode($preview->get_data()),
    );
    $view = $preview->get_data();
    foreach (['adapter_digest', 'frontmatter_receipt', 'resource_receipt'] as $k) {
        $payload[$k] = $view[$k] ?? null;
    }
    $response = bibliography_save_request('save', $payload);
    bibliography_save_assert(
        $response->get_status() === 200,
        'save: ' . wp_json_encode($response->get_data()),
    );
    return $response->get_data();
}
$previous = get_current_user_id();
$user = 0;
$id = 0;
$file = null;
try {
    $user = wp_insert_user([
        'user_login' => 'bibliography-' . wp_generate_password(12, false),
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    bibliography_save_assert(!is_wp_error($user), 'author');
    wp_set_current_user($user);
    $docId = 'Bibliography' . wp_generate_password(12, false);
    $legacy = [
        [
            'key' => 'Paper',
            'authors' => ['Ludwig van Beethoven', '研究机构'],
            'title' => 'Original <literal>',
            'year' => 'Spring 2026',
            'source' => 'Exact original source',
            'url' => '',
        ],
    ];
    $cite = '<span data-mbb-keys="Paper" data-mbb-version="1" class="mbb-cite">[Paper]</span>';
    $source =
        $cite .
        "\r\n\r\n:::mbb:v1 bibliography " .
        wp_json_encode(
            ['id' => 'references', 'entries' => $legacy],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ) .
        "\r\n\r\n:::mbb:end\r\n";
    $saved = bibliography_save_pair([
        'post_id' => 0,
        'documentId' => $docId,
        'mode' => 'markdown',
        'source' => $source,
        'title' => 'Bibliography fixture',
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    $id = $saved['post_id'];
    $revision = $saved['saved_revision'];
    $original = get_post($id, ARRAY_A);
    mbb_csl_library();
    $entries = \MarkBridge\Probe\Bibliography::migrate($legacy);
    $entries[0]['type'] = 'book';
    $entries[0]['publisher'] = 'Explicit publisher';
    $entries[0]['doi'] = '10.1234/example';
    $entries[0]['identifiers']['ISBN'] = '123';
    $new =
        $cite .
        "\n\n:::mbb:v2 bibliography " .
        wp_json_encode(
            ['id' => 'references', 'entries' => $entries, 'style' => 'numeric'],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ) .
        "\n\n:::mbb:end\n";
    bibliography_save_assert(get_post($id, ARRAY_A) === $original, 'pure migration must not write');
    $saved = bibliography_save_pair([
        'post_id' => $id,
        'expected' => $saved['expected'],
        'mode' => 'markdown',
        'source' => $new,
        'title' => 'Bibliography fixture',
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    $v2 = get_post($id);
    bibliography_save_assert(
        $v2->post_content_filtered === $new &&
            str_contains($v2->post_content, 'data-mbb-citation-style="numeric"'),
        'v2 pair',
    );
    $blocks = parse_blocks($v2->post_content);
    foreach ($blocks as &$block) {
        if ($block['blockName'] === 'mbb/bibliography') {
            $block['attrs']['entries'][0]['publisher'] = 'Native publisher';
            // Match Gutenberg serialization, including the block's inner boundary newlines.
            $block['innerHTML'] =
                "\n" .
                \MarkBridge\Probe\Technical::html('bibliography', $block['attrs'], '') .
                "\n";
            $block['innerContent'] = [$block['innerHTML']];
        }
    }
    unset($block);
    $native = bibliography_save_request('/wp/v2/posts/' . $id, [
        'content' => serialize_blocks($blocks),
        'mbb_expected' => $saved['expected'],
        'title' => 'Bibliography fixture',
    ]);
    bibliography_save_assert(
        $native->get_status() === 200,
        'native: ' . wp_json_encode($native->get_data()),
    );
    clean_post_cache($id);
    $nativePost = get_post($id);
    $reopen = mbb_convert([
        'mode' => 'paired_restore',
        'documentId' => $docId,
        'source' => $nativePost->post_content_filtered,
        'serialized' => $nativePost->post_content,
    ]);
    bibliography_save_assert(
        !is_wp_error($reopen) && str_contains($reopen['source'], 'Native publisher'),
        'native metadata reopen',
    );
    $preview = bibliography_save_request('preview', [
        'post_id' => $id,
        'expected' => mbb_token($nativePost),
        'mode' => 'restore',
        'revision_id' => $revision,
        'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
        'title' => 'Bibliography fixture',
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    bibliography_save_assert($preview->get_status() === 200, 'historical compare');
    $restored = bibliography_save_pair([
        'post_id' => $id,
        'expected' => mbb_token($nativePost),
        'mode' => 'restore',
        'revision_id' => $revision,
        'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
        'title' => 'Bibliography fixture',
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    clean_post_cache($id);
    bibliography_save_assert(
        get_post($id)->post_content_filtered === $source &&
            get_post($id)->post_content === $original['post_content'],
        'v1 revision exact, without automatic migration',
    );
    $file = tempnam(sys_get_temp_dir(), 'mbb-bibliography-owned-');
    chmod($file, 0600);
    file_put_contents($file, $new);
    update_post_meta($id, '_mbb_source_managed', 'file');
    update_post_meta($id, '_mbb_source_path_hash', hash('sha256', realpath($file)));
    $synced = mbb_sync_document($docId, 'Bibliography fixture', $file, 'draft');
    bibliography_save_assert($synced === $id, 'source sync');
    clean_post_cache($id);
    $post = get_post($id);
    bibliography_save_assert(
        $post->post_content_filtered === $new && file_get_contents($file) === $new,
        'source bytes retained',
    );
    $html = mbb_render_technical(do_blocks($post->post_content));
    $static = mbb_static_export_body($post->post_content);
    foreach ([$html, $static] as $output) {
        bibliography_save_assert(
            str_contains($output, 'DOI 10.1234/example') &&
                str_contains($output, 'Ludwig van Beethoven') &&
                str_contains($output, 'role="doc-biblioref"'),
            'fixed bibliography display/export metadata',
        );
    }
    $roundtrip = mbb_csl_parse(wp_json_encode(mbb_csl_export($entries)));
    bibliography_save_assert($roundtrip['entries'] === $entries, 'CSL supported subset roundtrip');
    echo 'Actual ' .
        mbb_converter_settings()['backend'] .
        " bibliography v2 native/save/reopen, v1 exact history, private source sync, literal authors and static export passed.\n";
} finally {
    if ($id) {
        wp_delete_post($id, true);
    }
    if (is_string($file) && is_file($file)) {
        unlink($file);
    }
    if ($user && !is_wp_error($user)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
}
