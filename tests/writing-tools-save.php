<?php
// Explicitly identified disposable local WordPress only; no production source files.
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
        'Writing pattern checks require the explicitly identified local synthetic lab.',
    );
}
function writing_save_assert($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
$previous = get_current_user_id();
$user = 0;
$ids = [];
try {
    $user = wp_insert_user([
        'user_login' => 'writing-' . wp_generate_password(12, false),
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    writing_save_assert(!is_wp_error($user), 'author');
    wp_set_current_user($user);
    $patterns = json_decode(file_get_contents(__DIR__ . '/../plugin/writing-patterns.json'), true);
    foreach ($patterns as $n => $pattern) {
        $id = 'Writing' . wp_generate_password(12, false);
        $source =
            $pattern['source'] .
            "\nA note[^note-" .
            $n .
            "].\n\n[^note-" .
            $n .
            "]: Synthetic note.\n\n" .
            ':::mbb:v1 collapse {"id":"fold-' .
            $n .
            '","title":"Explanation","open":false}' .
            "\n\n" .
            ':::mbb:v1 collapse {"id":"inner-' .
            $n .
            '","title":"Boundary","open":false}' .
            "\n\n" .
            "$$\nx^2\n$$\n\n:::mbb:end\n\n:::mbb:end\n";
        $request = new WP_REST_Request('POST', '/mbb/v1/save');
        foreach (
            [
                'post_id' => 0,
                'mode' => 'markdown',
                'source' => $source,
                'documentId' => $id,
                'title' => 'Synthetic writing pattern',
                'post_status' => 'draft',
                'featured_media' => 0,
            ]
            as $key => $value
        ) {
            $request->set_param($key, $value);
        }
        $response = rest_do_request($request);
        writing_save_assert(
            $response->get_status() === 200,
            'save: ' . wp_json_encode($response->get_data()),
        );
        $post = (int) $response->get_data()['post_id'];
        $ids[] = $post;
        clean_post_cache($post);
        $saved = get_post($post);
        writing_save_assert($saved->post_content_filtered === $source, 'source bytes retained');
        $pair = mbb_convert([
            'mode' => 'paired_restore',
            'source' => $saved->post_content_filtered,
            'serialized' => $saved->post_content,
            'documentId' => mbb_id($post),
        ]);
        writing_save_assert(
            !is_wp_error($pair),
            'pattern + note + math + nested structures reopen',
        );
    }
    echo "writing patterns real WordPress save/reopen OK\n";
} finally {
    foreach ($ids as $post) {
        wp_delete_post($post, true);
    }
    if ($user) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
}
