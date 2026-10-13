<?php
require_once __DIR__ . '/includes/i18n.php';
function mbb_with_publication($r, $p, $candidate)
{
    if (is_wp_error($candidate)) {
        return $candidate;
    }
    $status = $r->get_param('post_status') ?? ($p ? $p->post_status : 'draft');
    if (!in_array($status, ['draft', 'pending', 'publish', 'private'], true)) {
        return mbb_error('status', mbb_t('Choose draft, pending review, public, or private.'), 422);
    }
    if (
        in_array($status, ['publish', 'private'], true) &&
        !current_user_can($p && $p->post_type === 'page' ? 'publish_pages' : 'publish_posts')
    ) {
        return mbb_error(
            'publish_permission',
            mbb_t('This account cannot publish articles. Save a draft or submit for review.'),
            403,
        );
    }
    $cover = $r->get_param('featured_media') ?? ($p ? get_post_thumbnail_id($p->ID) : 0);
    if (!is_numeric($cover) || (int) $cover < 0 || (string) (int) $cover !== (string) $cover) {
        return mbb_error('cover', mbb_t('The featured image ID is invalid.'), 422);
    }
    $cover = (int) $cover;
    if ($cover && !wp_attachment_is_image($cover)) {
        return mbb_error('cover', mbb_t('Choose a valid image from the media library.'), 422);
    }
    if (
        in_array($status, ['publish', 'private'], true) &&
        !$cover &&
        !($p && $p->post_status === $status && !get_post_thumbnail_id($p->ID))
    ) {
        return mbb_error(
            'cover_required',
            mbb_t(
                'Choose a featured image in article settings before publishing, then preview and save.',
            ),
            422,
        );
    }
    $candidate['post_status'] = $status;
    $candidate['featured_media'] = $cover;
    return $candidate;
}
