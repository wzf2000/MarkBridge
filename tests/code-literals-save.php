<?php
// Actual local WordPress reading pipeline; only synthetic drafts/actor, never production.
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
if (
    PHP_SAPI !== 'cli' ||
    !defined('WP_CLI') ||
    !WP_CLI ||
    !$root ||
    !$home ||
    realpath(ABSPATH) !== realpath($root) ||
    rtrim(home_url(), '/') !== rtrim($home, '/') ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Literal reading requires an explicitly identified local lab.');
}
function cls_assert($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function cls_call($route, $params)
{
    $request = new WP_REST_Request('POST', $route);
    foreach ($params as $key => $value) {
        $request->set_param($key, $value);
    }
    $result = rest_do_request($request);
    cls_assert($result->get_status() === 200, $route . ': ' . wp_json_encode($result->get_data()));
    return $result->get_data();
}
$previous = get_current_user_id();
$previousPost = $GLOBALS['post'] ?? null;
$user = $id = $unmanaged = 0;
$tag = 'mbbliteral' . bin2hex(random_bytes(5));
$token = '[' . $tag . ']';
$calls = 0;
add_shortcode($tag, static function () use (&$calls) {
    ++$calls;
    return '<mark class="literal-result">Normal shortcode</mark>';
});
try {
    $user = wp_insert_user([
        'user_login' => 'literal-' . bin2hex(random_bytes(5)),
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    cls_assert(!is_wp_error($user), 'Synthetic actor could not be created');
    wp_set_current_user($user);
    $code = 'const value = "' . $token . '";' . "\n";
    $source = $token . "\n\nInline `" . $token . "`.\n\n```javascript\n" . $code . "```\n\n";
    foreach (['native-code', 'preformatted'] as $kind) {
        $source .=
            ':::mbb:v1 ' . $kind . ' ' . wp_json_encode(['text' => $token]) . "\n:::mbb:end\n\n";
    }
    $source .=
        ':::mbb:v1 code-tabs ' .
        wp_json_encode([
            'id' => 'literal-tabs',
            'defaultTab' => 'literal-one',
            'tabs' => [['id' => 'literal-one', 'title' => 'JS', 'terminalNewline' => true]],
        ]) .
        "\n\n```javascript\n" .
        $code .
        "```\n\n:::mbb:end\n\n";
    $source .=
        ':::mbb:v1 code-compare ' .
        wp_json_encode([
            'id' => 'literal-diff',
            'leftTitle' => 'Left',
            'rightTitle' => 'Right',
            'leftHighlights' => '',
            'rightHighlights' => '',
        ]) .
        "\n\n```javascript\n" .
        $code .
        "```\n\n```javascript\n" .
        $code .
        "```\n\n:::mbb:end\n";
    $request = [
        'post_id' => 0,
        'documentId' => 'Literal' . bin2hex(random_bytes(5)),
        'mode' => 'markdown',
        'source' => $source,
        'title' => 'Synthetic literal code',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $preview = cls_call('/mbb/v1/preview', $request);
    $request['adapter_digest'] = $preview['adapter_digest'];
    $saved = cls_call('/mbb/v1/save', $request);
    $id = (int) $saved['post_id'];
    $post = get_post($id);
    $stored = $post->post_content;
    $markdown = $post->post_content_filtered;
    cls_assert($markdown === $source && mbb_managed($id), 'The original managed pair changed');
    $GLOBALS['post'] = $post;
    $calls = 0;
    $html = apply_filters('the_content', $stored);
    cls_assert(
        $calls === 1 && substr_count($html, 'literal-result') === 1,
        'Code/config executed or ordinary shortcode did not execute',
    );
    $dom = new DOMDocument();
    @$dom->loadHTML('<?xml encoding="UTF-8"?>' . $html, LIBXML_NONET);
    cls_assert($dom->getElementsByTagName('code')->length >= 6, 'Code fixture branches missing');
    foreach ($dom->getElementsByTagName('code') as $node) {
        cls_assert(str_contains($node->textContent, $token), 'Code literal was lost');
    }
    foreach ($dom->getElementsByTagName('div') as $node) {
        if ($node->getAttribute('data-mbb-teaching') === 'code-tabs') {
            $config = json_decode($node->getAttribute('data-mbb-teaching-config'), true);
            cls_assert(
                $config['tabs'][0]['code'] === $code,
                'Derived tabs config changed original code',
            );
        }
    }
    cls_assert(
        get_post($id)->post_content === $stored &&
            get_post($id)->post_content_filtered === $markdown,
        'Reading modified the saved pair',
    );
    cls_assert(
        mbb_code_literal_html(mbb_code_literal_html($html)) === mbb_code_literal_html($html),
        'Projection was not idempotent',
    );
    $unmanaged = wp_insert_post(
        [
            'post_title' => 'Synthetic unmanaged literal',
            'post_status' => 'draft',
            'post_content' => '<code>' . $token . '</code>',
        ],
        true,
    );
    cls_assert(!is_wp_error($unmanaged) && !mbb_managed($unmanaged), 'Unmanaged draft failed');
    $GLOBALS['post'] = get_post($unmanaged);
    $calls = 0;
    $unmanagedSource = get_post($unmanaged)->post_content;
    $withProtection = apply_filters('the_content', $unmanagedSource);
    $protectedCalls = $calls;
    remove_filter('the_content', 'mbb_protect_code_shortcodes', 10);
    $calls = 0;
    try {
        $withoutProtection = apply_filters('the_content', $unmanagedSource);
    } finally {
        add_filter('the_content', 'mbb_protect_code_shortcodes', 10);
    }
    cls_assert(
        $withProtection === $withoutProtection && $protectedCalls === $calls,
        'Unmanaged shortcode behavior changed',
    );
    echo "Guarded actual shortcode reading/config/managed scope and unchanged stored pair passed.\n";
} finally {
    remove_shortcode($tag);
    if (is_int($id) && $id > 0) {
        wp_delete_post($id, true);
    }
    if (is_int($unmanaged) && $unmanaged > 0) {
        wp_delete_post($unmanaged, true);
    }
    if (is_int($user) && $user > 0) {
        if (!function_exists('wp_delete_user')) {
            require_once ABSPATH . 'wp-admin/includes/user.php';
        }
        wp_delete_user($user);
    }
    $GLOBALS['post'] = $previousPost;
    wp_set_current_user($previous);
}
