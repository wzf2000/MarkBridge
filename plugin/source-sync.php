<?php
// Read old storage without loading the retired editor. codeblock_restore adapted from WP Editor.md 10.2.1, LuRenJiasWorld, GPL-3.0-or-later.
function mbb_source_text($post)
{
    $p = is_object($post) ? $post : get_post($post);
    $source = $p->post_content_filtered;
    if (get_post_meta($p->ID, '_mbb_origin', true) !== 'markdown_import') {
        $source = preg_replace_callback(
            '/^([`~]{3})([^`\\n]+)?\\n([^`~]+)(\\1)/m',
            static fn($m) => $m[1] .
                ($m[2] ?? '') .
                "\n" .
                html_entity_decode($m[3], ENT_QUOTES) .
                $m[4],
            $source,
        );
    }
    $source = str_replace(["\r\n", "\r"], "\n", $source);
    return get_post_meta($p->ID, '_llm_document_id', true)
        ? preg_replace('/^&gt; /m', '> ', $source)
        : $source;
}
function mbb_sync_write($id, $source, $title = null, $source_path = null, $status = null)
{
    if (!defined('WP_CLI') || !WP_CLI) {
        throw new RuntimeException('CLI source sync only');
    }
    $p = get_post($id);
    if (!$p || !mbb_managed($id)) {
        throw new RuntimeException('Migrate this document before syncing');
    }
    if (get_post_meta($id, '_mbb_source_managed', true) === 'file') {
        if (
            !$source_path ||
            !is_file($source_path) ||
            file_get_contents($source_path) !== $source ||
            get_post_meta($id, '_mbb_source_path_hash', true) !==
                hash('sha256', realpath($source_path))
        ) {
            throw new RuntimeException('Wrong source owner or source changed');
        }
    }
    if (!mbb_is_lab() && get_post_meta($id, '_mbb_source_managed', true) !== 'file') {
        throw new RuntimeException('Only file-managed documents use CLI source sync');
    }
    $r = new WP_REST_Request('POST', '/mbb/v1/save');
    $r->set_body(
        wp_json_encode([
            'mode' => 'markdown',
            'post_id' => $id,
            'expected' => mbb_token($p),
            'source' => $source,
            'title' => $title ?? $p->post_title,
            'post_status' => $status ?? $p->post_status,
        ]),
    );
    $r->set_header('Content-Type', 'application/json');
    $result = mbb_save($r);
    if (is_wp_error($result)) {
        throw new RuntimeException($result->get_error_message());
    }
    return $result['post_id'];
}
