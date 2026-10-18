<?php
// Real WordPress paired-save checks, restricted to an explicitly owned synthetic lab.
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
    throw new RuntimeException('Technical writing checks require the explicitly owned local lab.');
}
function technical_save_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function technical_save_request($route, array $params)
{
    $request = new WP_REST_Request('POST', '/mbb/v1/' . $route);
    foreach ($params as $key => $value) {
        $request->set_param($key, $value);
    }
    return rest_do_request($request);
}
$previous = get_current_user_id();
$postId = 0;
$user = 0;
$sourceFile = null;
try {
    $suffix = substr(hash('sha256', uniqid('', true)), 0, 12);
    $user = wp_insert_user([
        'user_login' => 'technical-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    technical_save_assert(!is_wp_error($user), 'Synthetic author creation failed.');
    wp_set_current_user($user);
    $source =
        "# Technical 😀\r\n\r\nSee <span class=\"mbb-xref\" data-mbb-target=\"eq-one\" data-mbb-version=\"1\">[eq-one]</span> and <span class=\"mbb-cite\" data-mbb-keys=\"paper-b,paper-a\" data-mbb-version=\"1\">[paper-b,paper-a]</span>.\r\n\r\n" .
        ':::mbb:v1 object {"id":"eq-one","kind":"equation","caption":"Loss 😀"}' .
        "\r\n\r\n$$\r\nx^2\r\n$$\r\n\r\n:::mbb:end\r\n\r\n" .
        ':::mbb:v1 statement {"id":"proof-one","kind":"proof","title":"Proof","open":false}' .
        "\r\n\r\nSubstitute directly.\r\n\r\n:::mbb:end\r\n\r\n" .
        ':::mbb:v1 bibliography {"id":"references","entries":[{"key":"paper-a","authors":["A. 作者"],"title":"First <literal>","year":"2026","source":"Journal","url":"https://example.invalid/a"},{"key":"paper-b","authors":[],"title":"Second","year":"","source":"","url":""}]}' .
        "\r\n\r\n:::mbb:end\r\n";
    $payload = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'Technical' . $suffix,
        'title' => 'Technical synthetic draft',
        'source' => $source,
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $preview = technical_save_request('preview', $payload);
    technical_save_assert(
        $preview->get_status() === 200,
        'Technical preview failed: ' . wp_json_encode($preview->get_data()),
    );
    $view = $preview->get_data();
    technical_save_assert(
        str_contains($view['html'], '>Equation 1</a>') &&
            str_contains($view['html'], 'role="doc-biblioref"'),
        'Actual preview omitted derived links.',
    );
    technical_save_assert(
        !str_contains($view['document']['serialized'], 'data-mbb-technical-rendered') &&
            !str_contains($view['document']['serialized'], 'doc-biblioref'),
        'Derived data leaked into canonical blocks.',
    );
    technical_save_assert(
        $view['navigation']['sourceSha256'] === hash('sha256', $source),
        'Raw CRLF navigation identity changed.',
    );
    $created = technical_save_request('save', $payload);
    technical_save_assert(
        $created->get_status() === 200,
        'Technical save failed: ' . wp_json_encode($created->get_data()),
    );
    $data = $created->get_data();
    $postId = (int) $data['post_id'];
    $revision = (int) $data['saved_revision'];
    $post = get_post($postId);
    $before = $post->post_content;
    technical_save_assert(
        $post->post_status === 'draft' && $post->post_content_filtered === $source,
        'Saved source bytes or draft visibility changed.',
    );
    $changed = str_replace('Loss 😀', 'Edited loss 😀', $before);
    $saved = technical_save_request('save', [
        'mode' => 'blocks',
        'post_id' => $postId,
        'expected' => mbb_token($post),
        'serialized' => $changed,
        'title' => $post->post_title,
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    technical_save_assert(
        $saved->get_status() === 200,
        'Technical block save failed: ' . wp_json_encode($saved->get_data()),
    );
    $post = get_post($postId);
    $reopened = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $post->post_content_filtered,
        'serialized' => $post->post_content,
        'documentId' => mbb_id($postId),
    ]);
    technical_save_assert(
        !is_wp_error($reopened) && str_contains($reopened['source'], 'Edited loss'),
        'Technical paired reopen lost edits.',
    );
    $bad = str_replace(
        'data-mbb-target="eq-one"',
        'data-mbb-target="missing"',
        $post->post_content,
    );
    $bad = str_replace('[eq-one]</span>', '[missing]</span>', $bad);
    $rejected = technical_save_request('save', [
        'mode' => 'blocks',
        'post_id' => $postId,
        'expected' => mbb_token($post),
        'serialized' => $bad,
        'title' => $post->post_title,
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    technical_save_assert(
        $rejected->get_status() >= 400 && get_post($postId)->post_content === $post->post_content,
        'Missing reference target was written.',
    );
    $restored = technical_save_request('save', [
        'mode' => 'restore',
        'post_id' => $postId,
        'expected' => mbb_token($post),
        'revision_id' => $revision,
        'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
        'title' => $post->post_title,
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    technical_save_assert(
        $restored->get_status() === 200,
        'Technical paired restore failed: ' . wp_json_encode($restored->get_data()),
    );
    technical_save_assert(
        get_post($postId)->post_content === $before &&
            get_post($postId)->post_content_filtered === $source,
        'Revision did not restore exact original technical pair.',
    );
    $sourceFile = tempnam(sys_get_temp_dir(), 'mbb-technical-owned-');
    technical_save_assert(
        is_string($sourceFile) && chmod($sourceFile, 0600),
        'Synthetic source staging failed.',
    );
    update_post_meta($postId, '_mbb_source_managed', 'file');
    update_post_meta($postId, '_mbb_source_path_hash', hash('sha256', realpath($sourceFile)));
    $fileSource = str_replace('Loss 😀', 'File loss 😀', $source);
    technical_save_assert(
        file_put_contents($sourceFile, $fileSource) === strlen($fileSource),
        'Synthetic source write failed.',
    );
    $savedId = mbb_sync_write($postId, $fileSource, null, $sourceFile, 'draft');
    technical_save_assert(
        $savedId === $postId &&
            get_post($postId)->post_content_filtered === $fileSource &&
            file_get_contents($sourceFile) === $fileSource,
        'File-bound technical source did not synchronize through the normal paired path.',
    );
    $post = get_post($postId);
    if (function_exists('pagenest_pc_blocks')) {
        update_post_meta($postId, '_pagenest_comments_enabled', '1');
        $html = mbb_render_technical(mbb_render_footnotes(do_blocks($post->post_content)));
        pagenest_pc_blocks($html, $postId, true);
        $registryKey = pagenest_companion_config('paragraphs', 'registry_meta');
        $registry = get_post_meta($postId, $registryKey, true);
        $paragraph =
            array_values(
                array_filter($registry, static fn($item) => str_starts_with($item['text'], 'See ')),
            )[0] ?? null;
        technical_save_assert(
            $paragraph && str_contains($paragraph['text'], '[eq-one]'),
            'Derived numbering replaced the paragraph authored identity.',
        );
        $extraSource =
            ':::mbb:v1 object {"id":"eq-extra","kind":"equation","caption":"Earlier equation"}' .
            "\r\n\r\n$$\r\ny^2\r\n$$\r\n\r\n:::mbb:end\r\n\r\n" .
            $fileSource;
        $extra = mbb_convert([
            'mode' => 'markdown',
            'source' => $extraSource,
            'documentId' => mbb_id($postId),
        ]);
        technical_save_assert(
            !is_wp_error($extra),
            'Additional synthetic equation did not convert.',
        );
        $display = mbb_render_technical(mbb_render_footnotes(do_blocks($extra['serialized'])));
        technical_save_assert(
            str_contains($display, '>Equation 2</a>'),
            'Synthetic object insertion did not change the displayed reference.',
        );
        $annotated = pagenest_pc_blocks($display, $postId, false);
        technical_save_assert(
            str_contains($annotated, 'data-pagenest-block="' . $paragraph['id'] . '"'),
            'Renumbering orphaned a paragraph-comment target.',
        );
        $dom = new DOMDocument();
        $oldErrors = libxml_use_internal_errors(true);
        $dom->loadHTML('<?xml encoding="UTF-8"?>' . $annotated);
        libxml_clear_errors();
        libxml_use_internal_errors($oldErrors);
        foreach ((new DOMXPath($dom))->query('//span[contains(@class,"mbb-cite")]//a') as $link) {
            technical_save_assert(
                $dom->getElementById(substr($link->getAttribute('href'), 1)),
                'Paragraph annotation replaced a bibliography target.',
            );
        }
    }
    echo 'Actual ' .
        mbb_converter_settings()['backend'] .
        " technical preview, derived/static separation, CRLF, native block save, reopen, missing-target rejection and revision restoration passed.\n";
} finally {
    if ($postId) {
        wp_delete_post($postId, true);
    }
    if (is_string($sourceFile) && is_file($sourceFile)) {
        unlink($sourceFile);
    }
    if ($user && !is_wp_error($user)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
}
