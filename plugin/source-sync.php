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

/**
 * Resolve the already-bound source file for a document.
 *
 * The public plugin never accepts a path from a request. A site integration
 * must resolve the path from its private mapping and return it through this
 * filter; the common checks below then verify the existing file and binding.
 */
function mbb_source_target($post)
{
    $p = is_object($post) ? $post : get_post($post);
    if (!$p || get_post_meta($p->ID, '_mbb_source_managed', true) !== 'file') {
        return new WP_Error('source_unmanaged', '该文章没有绑定文件来源。', ['status' => 409]);
    }
    $path = apply_filters('mbb_source_write_target', null, $p);
    if (!is_string($path) || $path === '' || !is_file($path) || is_link($path)) {
        return new WP_Error('source_target_unavailable', '已绑定的源文件当前不可用。', [
            'status' => 409,
        ]);
    }
    $real = realpath($path);
    if (!is_string($real) || !is_readable($real) || !is_writable($real)) {
        return new WP_Error('source_target_unavailable', '已绑定的源文件当前不可写。', [
            'status' => 409,
        ]);
    }
    $bound = get_post_meta($p->ID, '_mbb_source_path_hash', true);
    if (!$bound || !hash_equals((string) $bound, hash('sha256', $real))) {
        return new WP_Error('source_binding', '源文件绑定校验失败。', ['status' => 409]);
    }
    return $real;
}

function mbb_source_fingerprint($path)
{
    $contents = file_get_contents($path);
    if ($contents === false) {
        return new WP_Error('source_read_failed', '无法读取源文件。', ['status' => 409]);
    }
    return ['sha256' => hash('sha256', $contents), 'contents' => $contents];
}

function mbb_source_atomic_write($path, $contents)
{
    $dir = dirname($path);
    $temp = tempnam($dir, '.markbridge-');
    if ($temp === false) {
        return new WP_Error('source_write_failed', '无法创建源文件暂存文件。', ['status' => 500]);
    }
    $mode = fileperms($path) & 0777;
    $owner = fileowner($path);
    $group = filegroup($path);
    $ok = file_put_contents($temp, $contents, LOCK_EX) !== false;
    if ($ok) {
        chmod($temp, $mode);
        if (function_exists('chown')) {
            $ok = chown($temp, $owner) && chgrp($temp, $group);
        }
    }
    if ($ok && function_exists('fsync')) {
        $handle = fopen($temp, 'r');
        $ok = $handle && fsync($handle);
        if ($handle) {
            fclose($handle);
        }
    }
    if (!$ok || !rename($temp, $path)) {
        @unlink($temp);
        return new WP_Error('source_write_failed', '源文件安全写入失败。', ['status' => 500]);
    }
    return true;
}
