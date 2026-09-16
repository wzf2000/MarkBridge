<?php
// Core trash/restore transitions may change status, never either document representation.
add_filter(
    'wp_insert_post_empty_content',
    function ($empty, $data) {
        $id = absint($data['ID'] ?? 0);
        $post = $id ? get_post($id) : null;
        if (!$post || !mbb_managed($id) || !current_user_can('delete_post', $id)) {
            return $empty;
        }
        $status = $data['post_status'] ?? '';
        $restore = get_post_meta($id, '_wp_trash_meta_status', true) ?: 'draft';
        if (
            !(
                ($status === 'trash' && $post->post_status !== 'trash') ||
                ($post->post_status === 'trash' && in_array($status, ['draft', $restore], true))
            )
        ) {
            return $empty;
        }
        foreach (
            [
                'post_content',
                'post_content_filtered',
                'post_title',
                'post_excerpt',
                'post_author',
                'post_type',
                'post_parent',
                'post_password',
            ]
            as $field
        ) {
            if (
                !array_key_exists($field, $data) ||
                (string) wp_unslash($data[$field]) !== (string) $post->$field
            ) {
                return $empty;
            }
        }
        return false;
    },
    PHP_INT_MAX,
    2,
);
