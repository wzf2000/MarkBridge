<?php
// Revision selection is always scoped to an editable Markdown-origin parent.
function mbb_revision_token($r)
{
    return hash(
        'sha256',
        wp_json_encode([
            $r->ID,
            $r->post_parent,
            $r->post_title,
            $r->post_content_filtered,
            $r->post_content,
            get_metadata('post', $r->ID, '_mbb_revision_pair', true),
        ]),
    );
}
function mbb_revision_permission($r)
{
    if (!absint($r['post_id'])) {
        return mbb_error('id', '缺少文章ID。', 422);
    }
    return mbb_permission($r);
}
function mbb_revisions($r)
{
    $rows = [];
    foreach (
        wp_get_post_revisions(absint($r['post_id']), [
            'posts_per_page' => 100,
            'orderby' => 'ID',
            'order' => 'DESC',
            'check_enabled' => false,
        ])
        as $v
    ) {
        if (wp_is_post_autosave($v)) {
            continue;
        }
        $rows[] = [
            'id' => $v->ID,
            'date' => $v->post_date,
            'title' => $v->post_title,
            'expected_revision' => mbb_revision_token($v),
            'paired' => !!get_metadata('post', $v->ID, '_mbb_revision_pair', true),
            'restored_from' => (int) get_metadata('post', $v->ID, '_mbb_restored_from', true),
        ];
    }
    return ['revisions' => $rows, 'limit' => 100];
}
function mbb_revision_candidate($r, $p)
{
    if (!$p) {
        return mbb_error('revision', '请选择已有文章。', 422);
    }
    $revision_id = absint($r['revision_id']);
    $v = wp_get_post_revision($revision_id);
    if (!$v || (int) $v->post_parent !== (int) $p->ID || wp_is_post_autosave($v)) {
        return mbb_error('revision', '该修订不可用于此文章。', 422);
    }
    if (
        !is_string($r['expected_revision']) ||
        !hash_equals(mbb_revision_token($v), $r['expected_revision'])
    ) {
        return mbb_error('revision_changed', '历史版本已变化，请重新选择。');
    }
    $meta = get_metadata('post', $v->ID, '_mbb_revision_pair', true);
    if (
        $meta &&
        (!is_array($meta) ||
            ($meta['schema'] ?? null) !== 1 ||
            !in_array($meta['converter'] ?? null, ['0.1.2', '0.2.0'], true) ||
            ($meta['documentId'] ?? null) !== mbb_id($p->ID) ||
            ($meta['source_sha256'] ?? null) !== hash('sha256', $v->post_content_filtered) ||
            ($meta['blocks_sha256'] ?? null) !== hash('sha256', $v->post_content))
    ) {
        return mbb_error('revision_pair', '该历史版本的配对记录不兼容或已损坏，未恢复。', 422);
    }
    if (strlen($v->post_content_filtered) > 1500000 || strlen($v->post_content) > 1500000) {
        return mbb_error('size', '历史版本过大。', 413);
    }
    if (sanitize_text_field($v->post_title) !== $v->post_title || !trim($v->post_title)) {
        return mbb_error('title', '历史标题不符合当前规则。', 422);
    }
    $doc = mbb_convert([
        'mode' => 'markdown',
        'source' => $v->post_content_filtered,
        'documentId' => mbb_id($p->ID),
    ]);
    if (is_wp_error($doc)) {
        return $doc;
    }
    // Exact comparison: never silently regenerate a different historical block snapshot.
    if (
        $doc['serialized'] !== $v->post_content ||
        !mbb_html_allowed(parse_blocks($v->post_content))
    ) {
        return mbb_error(
            'revision_pair',
            '该历史版本的Markdown与区块不一致或不兼容，未恢复。',
            422,
        );
    }
    return [
        'document' => $doc,
        'title' => $v->post_title,
        'post_id' => $p->ID,
        'expected' => mbb_token($p),
        'revision_id' => $v->ID,
    ];
}
function mbb_pair_snapshot($id, $after_id = 0)
{
    $result = wp_save_post_revision($id);
    if (is_wp_error($result)) {
        throw new RuntimeException('修订保存失败');
    }
    $p = get_post($id);
    $expected = [
        'schema' => 1,
        'converter' => '0.2.0',
        'documentId' => mbb_id($id),
        'source_sha256' => hash('sha256', $p->post_content_filtered),
        'blocks_sha256' => hash('sha256', $p->post_content),
    ];
    foreach (wp_get_post_revisions($id, ['orderby' => 'ID', 'order' => 'DESC']) as $v) {
        $meta = get_metadata('post', $v->ID, '_mbb_revision_pair', true);
        if (
            $v->ID > $after_id &&
            !wp_is_post_autosave($v) &&
            (!$meta || $meta === $expected) &&
            $v->post_content === $p->post_content &&
            $v->post_content_filtered === $p->post_content_filtered &&
            $v->post_title === $p->post_title
        ) {
            return $v->ID;
        }
    }
    // An autosave or a damaged latest entry must not hide the last intact pair.
    $rid = _wp_put_post_revision($p);
    if (!$rid || is_wp_error($rid)) {
        throw new RuntimeException('未能保留配对修订');
    }
    $v = get_post($rid);
    if (
        $v->post_content !== $p->post_content ||
        $v->post_content_filtered !== $p->post_content_filtered ||
        $v->post_title !== $p->post_title
    ) {
        throw new RuntimeException('修订内容核验失败');
    }
    return $rid;
}
// Core normalizes whitespace when deciding to retain a revision; source bytes matter here.
add_filter(
    'wp_save_post_revision_post_has_changed',
    function ($changed, $latest, $post) {
        if (!empty($GLOBALS['mbb_paired_save'])) {
            return $latest->post_content !== $post->post_content ||
                $latest->post_content_filtered !== $post->post_content_filtered ||
                $latest->post_title !== $post->post_title;
        }
        return $changed;
    },
    10,
    3,
);
add_action(
    '_wp_put_post_revision',
    function ($revision_id, $post_id) {
        if (empty($GLOBALS['mbb_paired_save']) || empty($GLOBALS['mbb_pair_identity'])) {
            return;
        }
        $v = get_post($revision_id);
        $meta = [
            'schema' => 1,
            'converter' => '0.2.0',
            'documentId' => $GLOBALS['mbb_pair_identity'],
            'source_sha256' => hash('sha256', $v->post_content_filtered),
            'blocks_sha256' => hash('sha256', $v->post_content),
        ];
        // update_post_meta redirects revision IDs to their parent: use the metadata API directly.
        if (!update_metadata('post', $revision_id, '_mbb_revision_pair', $meta)) {
            throw new RuntimeException('修订配对记录保存失败');
        }
    },
    10,
    2,
);
add_action('rest_api_init', function () {
    register_rest_route('mbb/v1', '/revisions', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_revision_permission',
        'callback' => 'mbb_revisions',
    ]);
});
