<?php
function mbb_with_publication($r, $p, $candidate)
{
    if (is_wp_error($candidate)) {
        return $candidate;
    }
    $status = $r->get_param('post_status') ?? ($p ? $p->post_status : 'draft');
    if (!in_array($status, ['draft', 'pending', 'publish', 'private'], true)) {
        return mbb_error('status', '请选择草稿、待审核、公开或私密。', 422);
    }
    if (
        in_array($status, ['publish', 'private'], true) &&
        !current_user_can($p && $p->post_type === 'page' ? 'publish_pages' : 'publish_posts')
    ) {
        return mbb_error(
            'publish_permission',
            '当前账号没有发布文章的权限，可保存草稿或提交审核。',
            403,
        );
    }
    $cover = $r->get_param('featured_media') ?? ($p ? get_post_thumbnail_id($p->ID) : 0);
    if (!is_numeric($cover) || (int) $cover < 0 || (string) (int) $cover !== (string) $cover) {
        return mbb_error('cover', '特色图片ID无效。', 422);
    }
    $cover = (int) $cover;
    if ($cover && !wp_attachment_is_image($cover)) {
        return mbb_error('cover', '请选择媒体库中的有效图片。', 422);
    }
    if (
        in_array($status, ['publish', 'private'], true) &&
        !$cover &&
        !($p && $p->post_status === $status && !get_post_thumbnail_id($p->ID))
    ) {
        return mbb_error('cover_required', '发布前请在文章设置中选择特色图片，再预览并保存。', 422);
    }
    $candidate['post_status'] = $status;
    $candidate['featured_media'] = $cover;
    return $candidate;
}
