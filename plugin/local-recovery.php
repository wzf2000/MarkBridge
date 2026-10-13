<?php
// Read-only, authenticated identity checks. Draft bodies never leave the browser here.
function mbb_recovery_config(): ?array
{
    if (
        !is_user_logged_in() ||
        (!current_user_can('edit_posts') && !current_user_can('edit_pages'))
    ) {
        return null;
    }
    $site = hash('sha256', home_url('/') . ':' . get_current_blog_id());
    return [
        'schema' => 1,
        'siteKey' => $site,
        'userKey' => hash('sha256', $site . ':' . get_current_user_id()),
    ];
}
function mbb_recovery_permission($request)
{
    if (!is_user_logged_in()) {
        return new WP_Error('recovery_auth_expired', '请刷新页面或重新登录后校验恢复权限。', [
            'status' => 401,
        ]);
    }
    $id = absint($request->get_param('post_id'));
    if (
        is_user_logged_in() &&
        (current_user_can('edit_posts') || current_user_can('edit_pages')) &&
        $id &&
        !get_post($id)
    ) {
        return new WP_Error('not_found', '文章已删除，不能以旧身份重建。', ['status' => 404]);
    }
    return mbb_permission($request);
}
function mbb_recovery_context($request)
{
    $permission = mbb_recovery_permission($request);
    if (is_wp_error($permission)) {
        return $permission;
    }
    $config = mbb_recovery_config();
    if (!$config) {
        return new WP_Error('forbidden', '请重新登录有编辑权限的账号。', ['status' => 403]);
    }
    $id = absint($request->get_param('post_id'));
    $newKey = $request->get_param('new_key');
    if (!$id && (!is_string($newKey) || !preg_match('/^[a-f0-9]{32}$/D', $newKey))) {
        return new WP_Error('recovery_identity', '新草稿身份无效。', ['status' => 400]);
    }
    $post = $id ? get_post($id) : null;
    if ($id && !$post) {
        return new WP_Error('not_found', '文章不存在。', ['status' => 404]);
    }
    if (
        $post &&
        (!in_array($post->post_type, ['post', 'page'], true) ||
            !in_array(
                $post->post_status,
                ['draft', 'pending', 'private', 'publish', 'future'],
                true,
            ))
    ) {
        return new WP_Error('inactive', '文章当前不可编辑恢复；请先通过 WordPress 正常还原。', [
            'status' => 409,
        ]);
    }
    $state = $id ? mbb_state($id) : null;
    $user = wp_get_current_user();
    $caps = array_map('boolval', $user->allcaps);
    ksort($caps);
    $sourceManaged = (bool) ($state['source_managed'] ?? false);
    $sourceWrite = (bool) ($state['source_write_available'] ?? false);
    $identity = hash(
        'sha256',
        wp_json_encode([
            $id,
            $id ? mbb_id($id) : $newKey,
            $id ? get_post_meta($id, '_mbb_origin', true) : 'new-markdown',
            $id ? get_post_meta($id, '_mbb_source_path_hash', true) : null,
            $sourceManaged,
        ]),
    );
    return $config + [
        'postId' => $id,
        'newKey' => $id ? null : $newKey,
        'identity' => $identity,
        'baseline' => hash(
            'sha256',
            wp_json_encode([$state['expected'] ?? 'new', $state['source_sha256'] ?? null]),
        ),
        'permission' => hash(
            'sha256',
            wp_json_encode([
                $caps,
                $post->post_author ?? get_current_user_id(),
                current_user_can(
                    $post && $post->post_type === 'page' ? 'publish_pages' : 'publish_posts',
                ),
                $sourceWrite,
            ]),
        ),
        'expected' => $state['expected'] ?? null,
        'sourceDigest' => $state['source_sha256'] ?? null,
        'sourceManaged' => $sourceManaged,
        'sourceWriteAvailable' => $sourceWrite,
    ];
}
add_action('rest_api_init', static function () {
    register_rest_route('mbb/v1', '/recovery-context', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_recovery_permission',
        'callback' => 'mbb_recovery_context',
        'args' => [
            'post_id' => ['type' => 'integer', 'minimum' => 0, 'default' => 0],
            'new_key' => ['type' => 'string'],
        ],
    ]);
});
