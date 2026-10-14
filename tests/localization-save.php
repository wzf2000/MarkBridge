<?php
// Real WordPress contract restricted to explicitly identified, synthetic local data.
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
if (
    !$root ||
    !$home ||
    realpath(ABSPATH) !== realpath($root) ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    rtrim(home_url(), '/') !== rtrim($home, '/') ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Localization saves require an explicitly identified local lab');
}
function loc_assert($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function loc_call($route, $fields)
{
    $request = new WP_REST_Request('POST', $route);
    foreach ($fields as $key => $value) {
        $request->set_param($key, $value);
    }
    return rest_do_request($request);
}
$actor = get_current_user_id();
$user = 0;
$post = 0;
$switched = false;
$suffix = bin2hex(random_bytes(5));
try {
    loc_assert(
        in_array('zh_CN', get_available_languages(), true),
        'Actual WordPress Chinese language resources are required',
    );
    $user = wp_insert_user([
        'user_login' => 'locale-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    loc_assert(!is_wp_error($user), 'Could not create synthetic locale author');
    $source = "Author 正文 \$x\$.\r\n\r\n```text\r\noriginal code\r\n```\r\n";
    $fields = [
        'post_id' => 0,
        'expected' => null,
        'mode' => 'markdown',
        'source' => $source,
        'title' => '作者标题',
        'documentId' => 'Locale' . $suffix,
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $digest = mbb_block_adapter_digest();
    $serialized = null;
    $token = null;
    foreach (['en_US', 'zh_CN'] as $locale) {
        update_user_meta($user, 'locale', $locale);
        clean_user_cache($user);
        wp_set_current_user(0);
        wp_set_current_user($user);
        $switched = switch_to_locale($locale);
        try {
            loc_assert(
                mbb_t('Close') === ($locale === 'zh_CN' ? '关闭' : 'Close'),
                'Actual gettext language was not applied',
            );
            $bad = $fields;
            $bad['source'] = "\$\$\nx\n";
            $failure = loc_call('/mbb/v1/preview', $bad);
            $detail = $failure->get_data();
            loc_assert(
                $failure->get_status() === 422 &&
                    ($detail['data']['conversion_code'] ?? '') === 'UNCLOSED_MATH',
                'Specific conversion error contract changed',
            );
            $rawFailure = mbb_converter_dispatch([
                'mode' => 'markdown',
                'source' => $bad['source'],
                'documentId' => $fields['documentId'],
                'blockAdapters' => mbb_block_adapter_snapshot(),
            ]);
            loc_assert(
                !is_wp_error($rawFailure) &&
                    empty($rawFailure['ok']) &&
                    $rawFailure['code'] === 'UNCLOSED_MATH' &&
                    is_string($rawFailure['message_id'] ?? null),
                'Actual backend did not return a registered precise English diagnostic',
            );
            loc_assert(
                !preg_match('/[\x{4e00}-\x{9fff}]/u', $rawFailure['message']),
                'Pure backend depended on WordPress locale',
            );
            $prefix = mbb_conversion_message($rawFailure);
            loc_assert(
                $prefix !== mbb_t('Conversion failed') &&
                    str_starts_with($detail['message'], $prefix),
                'REST lost the registered precise diagnostic prefix',
            );
            loc_assert(
                ($detail['data']['location'] ?? '') === ($rawFailure['location'] ?? ''),
                'REST lost the backend diagnostic location',
            );
            $preview = loc_call('/mbb/v1/preview', $fields);
            loc_assert(
                $preview->get_status() === 200,
                'Actual preview failed: ' . wp_json_encode($preview->get_data()),
            );
            $data = $preview->get_data();
            $serialized ??= $data['document']['serialized'];
            loc_assert(
                $data['document']['serialized'] === $serialized &&
                    $data['document']['source'] === $source,
                'Locale changed paired serialization or raw source',
            );
            if (!$post) {
                $saved = loc_call('/mbb/v1/save', $fields);
                loc_assert($saved->get_status() === 200, 'Actual paired save failed');
                $post = (int) $saved->get_data()['post_id'];
                $fields['post_id'] = $post;
                $fields['expected'] = mbb_token(get_post($post));
                $token = $fields['expected'];
            } else {
                loc_assert(
                    mbb_token(get_post($post)) === $token,
                    'Locale changed the identity token',
                );
                $paired = mbb_convert([
                    'mode' => 'paired_restore',
                    'source' => $source,
                    'serialized' => $serialized,
                    'documentId' => mbb_id($post),
                ]);
                loc_assert(
                    !is_wp_error($paired) &&
                        $paired['source'] === $source &&
                        $paired['serialized'] === $serialized,
                    'Historical pair changed across locales',
                );
                $saved = loc_call('/mbb/v1/save', $fields);
                loc_assert(
                    $saved->get_status() === 200 && $saved->get_data()['noop'] === true,
                    'Locale-only confirmation rewrote the article',
                );
            }
            loc_assert(
                mbb_block_adapter_digest() === $digest,
                'Locale changed registered templates',
            );
            clean_post_cache($post);
            loc_assert(
                get_post($post)->post_title === '作者标题' &&
                    get_post($post)->post_content === $serialized &&
                    get_post($post)->post_content_filtered === $source,
                'Locale changed authored fields',
            );
        } finally {
            if ($switched) {
                restore_previous_locale();
                $switched = false;
            }
        }
    }
    echo "Actual WordPress gettext/precise diagnostics/paired save/noop/source/token locale contracts passed.\n";
} finally {
    if ($switched) {
        restore_previous_locale();
    }
    wp_set_current_user($actor);
    if ($post) {
        wp_delete_post($post, true);
    }
    if ($user && !is_wp_error($user)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
}
