<?php
/** Local native-media attachment admission. Pure conversion never calls this host guard. */
if (!defined('ABSPATH')) {
    exit();
}
function mbb_native_media_validate_candidate(string $serialized)
{
    $budget = 0;
    $walk = function (array $blocks, int $depth = 0) use (&$walk, &$budget) {
        if ($depth > 32) {
            return new WP_Error(
                'invalid_media',
                mbb_t('Native media exceeds the document structure budget'),
                ['status' => 422],
            );
        }
        foreach ($blocks as $block) {
            if (++$budget > 10000) {
                return new WP_Error(
                    'invalid_media',
                    mbb_t('Native media exceeds the document structure budget'),
                    ['status' => 422],
                );
            }
            $a = $block['attrs'] ?? [];
            if (($block['blockName'] ?? '') === 'core/image' && array_key_exists('id', $a)) {
                $id = $a['id'];
                if (
                    !is_int($id) ||
                    $id < 1 ||
                    $id > 9007199254740991 ||
                    get_post_type($id) !== 'attachment' ||
                    !str_starts_with((string) get_post_mime_type($id), 'image/') ||
                    !current_user_can('edit_post', $id)
                ) {
                    return new WP_Error(
                        'invalid_media',
                        mbb_t(
                            'The local image attachment is missing or is not available to this author',
                        ),
                        ['status' => 403],
                    );
                }
                $post = get_post($id);
                if (!$post) {
                    return new WP_Error(
                        'invalid_media',
                        mbb_t(
                            'The local image attachment is missing or is not available to this author',
                        ),
                        ['status' => 403],
                    );
                }
                if ($post->post_parent) {
                    $parent = get_post($post->post_parent);
                    if (
                        $parent &&
                        (!current_user_can('read_post', $parent->ID) ||
                            ($parent->post_password !== '' &&
                                !current_user_can('edit_post', $parent->ID)))
                    ) {
                        return new WP_Error(
                            'invalid_media',
                            mbb_t(
                                'The local image attachment is missing or is not available to this author',
                            ),
                            ['status' => 403],
                        );
                    }
                }
                $processor = new WP_HTML_Tag_Processor($block['innerHTML'] ?? '');
                if (!$processor->next_tag('IMG')) {
                    return new WP_Error(
                        'invalid_media',
                        mbb_t('The image URL does not match its local attachment'),
                        ['status' => 422],
                    );
                }
                $src = $processor->get_attribute('src');
                $allowed = [wp_get_attachment_url($id)];
                if (function_exists('wp_get_original_image_url')) {
                    $allowed[] = wp_get_original_image_url($id);
                }
                $image = wp_get_attachment_image_src($id, $a['sizeSlug'] ?? 'full');
                if (is_array($image)) {
                    $allowed[] = $image[0];
                }
                if (
                    !is_string($src) ||
                    !in_array($src, array_filter($allowed, 'is_string'), true)
                ) {
                    return new WP_Error(
                        'invalid_media',
                        mbb_t('The image URL does not match its local attachment'),
                        ['status' => 422],
                    );
                }
                if ($processor->next_tag('IMG')) {
                    return new WP_Error(
                        'invalid_media',
                        mbb_t('Native image blocks cannot contain child blocks'),
                        ['status' => 422],
                    );
                }
            }
            $result = $walk($block['innerBlocks'] ?? [], $depth + 1);
            if (is_wp_error($result)) {
                return $result;
            }
        }
        return true;
    };
    return $walk(parse_blocks($serialized));
}
/** Explicit portable admission; a Markdown source download may retain its local relationship. */
function mbb_native_media_portable_admission(string $serialized)
{
    $budget = 0;
    $walk = function (array $blocks, int $depth = 0) use (&$walk, &$budget) {
        if ($depth > 32) {
            return new WP_Error(
                'invalid_media',
                mbb_t('Native media exceeds the document structure budget'),
                ['status' => 422],
            );
        }
        foreach ($blocks as $block) {
            if (++$budget > 10000) {
                return new WP_Error(
                    'invalid_media',
                    mbb_t('Native media exceeds the document structure budget'),
                    ['status' => 422],
                );
            }
            if (
                ($block['blockName'] ?? '') === 'core/image' &&
                array_key_exists('id', $block['attrs'] ?? [])
            ) {
                return new WP_Error(
                    'media_local_id',
                    mbb_t('Portable exports cannot carry local media attachment IDs'),
                    ['status' => 422],
                );
            }
            $result = $walk($block['innerBlocks'] ?? [], $depth + 1);
            if (is_wp_error($result)) {
                return $result;
            }
        }
        return true;
    };
    return $walk(parse_blocks($serialized));
}
