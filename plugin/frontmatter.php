<?php
// A header is a proposal. Only an explicit preview receipt can apply selected metadata.
require_once __DIR__ . '/includes/php-converter/Converter.php';
use MarkBridge\Probe\FrontMatter;

function mbb_frontmatter_selected($request)
{
    $selected = $request['frontmatter_selected'] ?? [];
    if (
        !is_array($selected) ||
        !array_is_list($selected) ||
        count($selected) > count(FrontMatter::FIELDS)
    ) {
        return mbb_error('frontmatter_selection', '元数据选择无效。', 422);
    }
    foreach ($selected as $key) {
        if (!is_string($key) || !in_array($key, FrontMatter::FIELDS, true)) {
            return mbb_error('frontmatter_selection', '元数据选择含未知字段。', 422);
        }
    }
    if (count(array_unique($selected, SORT_STRING)) !== count($selected)) {
        return mbb_error('frontmatter_selection', '元数据选择重复。', 422);
    }
    sort($selected, SORT_STRING);
    return $selected;
}
function mbb_frontmatter_current($post): array
{
    $values = [
        'title' => $post->post_title ?? '',
        'excerpt' => $post->post_excerpt ?? '',
        'slug' => $post->post_name ?? '',
        'status' => $post->post_status ?? 'draft',
        'featured_media' => $post ? (int) get_post_thumbnail_id($post->ID) : 0,
        'categories' => [],
        'tags' => [],
    ];
    if ($post) {
        foreach (['categories' => 'category', 'tags' => 'post_tag'] as $key => $taxonomy) {
            $slugs = wp_get_object_terms($post->ID, $taxonomy, ['fields' => 'slugs']);
            if (!is_wp_error($slugs)) {
                sort($slugs, SORT_STRING);
                $values[$key] = $slugs;
            }
        }
    }
    return $values;
}
function mbb_frontmatter_proposal(array $document): array
{
    $blocks = parse_blocks($document['serialized']);
    foreach ($blocks as $block) {
        if ($block['blockName'] === null && trim($block['innerHTML']) === '') {
            continue;
        }
        if ($block['blockName'] !== 'mbb/frontmatter') {
            return [];
        }
        $parsed = FrontMatter::parse($block['attrs']['raw']);
        return $parsed['proposal'];
    }
    return [];
}
function mbb_frontmatter_term_ids(string $field, array $slugs, $post)
{
    $name = $field === 'categories' ? 'category' : 'post_tag';
    $taxonomy = get_taxonomy($name);
    $type = $post->post_type ?? 'post';
    if (
        !$taxonomy ||
        !is_object_in_taxonomy($type, $name) ||
        !current_user_can($taxonomy->cap->assign_terms)
    ) {
        return mbb_error('frontmatter_permission', '无权为此文章分配分类或标签。', 403);
    }
    $ids = [];
    foreach ($slugs as $slug) {
        $term = get_term_by('slug', $slug, $name);
        if (!$term || $term->slug !== $slug) {
            return mbb_error(
                'frontmatter_term',
                '选择的 term slug 已不存在或发生变化；不会自动创建词项。',
                422,
            );
        }
        $ids[] = (int) $term->term_id;
    }
    sort($ids, SORT_NUMERIC);
    return $ids;
}
function mbb_frontmatter_receipt_payload(
    $request,
    $post,
    array $candidate,
    array $selected,
    array $applied,
    int $expires,
): array {
    return [
        'version' => 1,
        'site' => hash('sha256', home_url('/') . ':' . get_current_blog_id()),
        'user' => get_current_user_id(),
        'post' => $post ? (int) $post->ID : 0,
        'expected' => $candidate['expected'],
        'sourceDigest' => $request['source_sha256'] ?? null,
        'documentId' => $candidate['document']['documentId'],
        'digest' => hash(
            'sha256',
            mbb_component_json([
                $candidate['document'],
                $candidate['title'],
                $candidate['post_status'],
                $candidate['featured_media'],
            ]),
        ),
        'selected' => $selected,
        'applied' => $applied,
        'expires' => $expires,
    ];
}
function mbb_frontmatter_receipt(array $payload): string
{
    $encoded = rtrim(strtr(base64_encode(mbb_component_json($payload)), '+/', '-_'), '=');
    return $encoded . '.' . hash_hmac('sha256', $encoded, wp_salt('auth'));
}
function mbb_frontmatter_candidate($request, $post, array $candidate)
{
    $selected = mbb_frontmatter_selected($request);
    if (is_wp_error($selected)) {
        return $selected;
    }
    if (($request['mode'] ?? '') === 'restore' && $selected) {
        return mbb_error('frontmatter_restore', '历史恢复不能自动应用头部元数据。', 422);
    }
    $proposal =
        ($request['mode'] ?? '') === 'restore'
            ? []
            : mbb_frontmatter_proposal($candidate['document']);
    if (array_diff($selected, array_keys($proposal))) {
        return mbb_error('frontmatter_selection', '所选字段不在当前头部提案中。', 422);
    }
    $copy = clone $request;
    $applied = [];
    foreach ($selected as $key) {
        $value = $proposal[$key];
        if ($key === 'title') {
            $candidate['title'] = $value;
        } elseif ($key === 'status') {
            $copy['post_status'] = $value;
        } elseif ($key === 'featured_media') {
            $copy['featured_media'] = $value;
        } elseif ($key === 'categories' || $key === 'tags') {
            $value = mbb_frontmatter_term_ids($key, $value, $post);
            if (is_wp_error($value)) {
                return $value;
            }
        } elseif ($key === 'excerpt') {
            if (wp_kses_post($value) !== $value) {
                return mbb_error(
                    'frontmatter_excerpt',
                    '摘要含会被 WordPress 改写的 HTML，未应用。',
                    422,
                );
            }
        } elseif ($key === 'slug') {
            $value = sanitize_title($value);
        }
        $applied[$key] = $value;
    }
    if (
        !is_string($candidate['title']) ||
        trim($candidate['title']) === '' ||
        sanitize_text_field($candidate['title']) !== $candidate['title']
    ) {
        return mbb_error('title', '请输入不含 HTML 的标题，或明确选择头部标题提案。', 422);
    }
    $candidate = mbb_with_publication($copy, $post, $candidate);
    if (is_wp_error($candidate)) {
        return $candidate;
    }
    if (array_key_exists('slug', $applied)) {
        $slug = $applied['slug'];
        if ($slug === '' && in_array($candidate['post_status'], ['publish', 'private'], true)) {
            $slug = sanitize_title($candidate['title']);
        }
        if (
            $slug !== '' &&
            wp_unique_post_slug(
                $slug,
                $post->ID ?? 0,
                'publish',
                $post->post_type ?? 'post',
                $post->post_parent ?? 0,
            ) !== $slug
        ) {
            return mbb_error('frontmatter_slug', 'slug 与已有内容冲突，未自动添加后缀。', 409);
        }
        $applied['slug'] = $slug;
    }
    $current = mbb_frontmatter_current($post);
    if (!$proposal && !$selected) {
        $candidate['frontmatter_applied'] = [];
        $candidate['frontmatter'] = [
            'version' => 1,
            'current' => $current,
            'fields' => [],
            'selected' => [],
        ];
        return $candidate;
    }
    $rows = [];
    foreach ($proposal as $key => $value) {
        $error = null;
        $resolved = $value;
        if ($key === 'categories' || $key === 'tags') {
            $resolved = mbb_frontmatter_term_ids($key, $value, $post);
            if (is_wp_error($resolved)) {
                $error = $resolved;
            }
        } elseif ($key === 'title') {
            if (trim($value) === '' || sanitize_text_field($value) !== $value) {
                $error = mbb_error('title', '标题会被 WordPress 改写，请修改提案。', 422);
            }
        } elseif ($key === 'excerpt') {
            if (wp_kses_post($value) !== $value) {
                $error = mbb_error('excerpt', '摘要含不允许的 HTML。', 422);
            }
        } elseif ($key === 'status' || $key === 'featured_media') {
            $test = clone $copy;
            $test['post_status'] = $key === 'status' ? $value : $candidate['post_status'];
            $test['featured_media'] =
                $key === 'featured_media' ? $value : $candidate['featured_media'];
            $check = mbb_with_publication($test, $post, $candidate);
            if (is_wp_error($check)) {
                $error = $check;
            }
        } elseif ($key === 'slug') {
            $resolved = sanitize_title($value);
            if (
                $resolved === '' &&
                in_array($candidate['post_status'], ['publish', 'private'], true)
            ) {
                $resolved = sanitize_title($candidate['title']);
            }
            if (
                $resolved !== '' &&
                wp_unique_post_slug(
                    $resolved,
                    $post->ID ?? 0,
                    'publish',
                    $post->post_type ?? 'post',
                    $post->post_parent ?? 0,
                ) !== $resolved
            ) {
                $error = mbb_error('slug', 'slug 与已有内容冲突。', 409);
            }
        }
        $rows[] = [
            'field' => $key,
            'before' => $current[$key],
            'proposal' => $value,
            'selected' => in_array($key, $selected, true),
            'available' => !$error,
            'reason' => $error ? $error->get_error_message() : '',
            'resolved' => array_key_exists($key, $applied)
                ? $applied[$key]
                : ($error
                    ? null
                    : $resolved),
        ];
    }
    $candidate['frontmatter_applied'] = $applied;
    $candidate['frontmatter'] = [
        'version' => 1,
        'current' => $current,
        'fields' => $rows,
        'selected' => $selected,
    ];
    $candidate['frontmatter_binding'] = mbb_frontmatter_receipt_payload(
        $request,
        $post,
        $candidate,
        $selected,
        $applied,
        time() + 300,
    );
    return $candidate;
}
function mbb_frontmatter_verify_receipt($request, array $candidate)
{
    if (!$candidate['frontmatter']['selected']) {
        return true;
    }
    $receipt = $request['frontmatter_receipt'] ?? null;
    if (
        !is_string($receipt) ||
        strlen($receipt) > 32768 ||
        !preg_match('/^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/D', $receipt, $parts) ||
        !hash_equals(hash_hmac('sha256', $parts[1], wp_salt('auth')), $parts[2])
    ) {
        return mbb_error('frontmatter_receipt', '元数据选择须重新预览后确认。', 409);
    }
    $raw = base64_decode(strtr($parts[1], '-_', '+/'), true);
    $payload = is_string($raw) ? json_decode($raw, true) : null;
    if (
        !is_array($payload) ||
        !is_int($payload['expires'] ?? null) ||
        $payload['expires'] < time() ||
        $payload['expires'] > time() + 300
    ) {
        return mbb_error('frontmatter_receipt', '元数据预览凭据已过期。', 409);
    }
    $expected = $candidate['frontmatter_binding'];
    $expected['expires'] = $payload['expires'];
    if (!hash_equals(mbb_component_json($expected), mbb_component_json($payload))) {
        return mbb_error(
            'frontmatter_receipt',
            '元数据、term、候选或身份已变化，请重新预览。',
            409,
        );
    }
    return true;
}
function mbb_frontmatter_matches($id, array $applied): bool
{
    $post = get_post($id);
    foreach ($applied as $key => $value) {
        if ($key === 'excerpt' && $post->post_excerpt !== $value) {
            return false;
        }
        if ($key === 'slug' && $post->post_name !== $value) {
            return false;
        }
        if ($key === 'categories' || $key === 'tags') {
            $ids = wp_get_object_terms($id, $key === 'categories' ? 'category' : 'post_tag', [
                'fields' => 'ids',
            ]);
            if (is_wp_error($ids)) {
                return false;
            }
            $ids = array_map('intval', $ids);
            sort($ids, SORT_NUMERIC);
            if ($ids !== $value) {
                return false;
            }
        }
    }
    return true;
}
add_action('init', static function () {
    register_block_type('mbb/frontmatter', [
        'api_version' => 3,
        'attributes' => ['version' => ['type' => 'number'], 'raw' => ['type' => 'string']],
        'render_callback' => static fn() => '',
    ]);
});

add_action(
    '_wp_put_post_revision',
    static function ($revision_id) {
        if (is_array($GLOBALS['mbb_frontmatter_revision_ids'] ?? null)) {
            $GLOBALS['mbb_frontmatter_revision_ids'][] = (int) $revision_id;
        }
    },
    1,
);
