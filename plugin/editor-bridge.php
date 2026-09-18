<?php
// Paired document storage, validation and capability-checked editing endpoints.
function mbb_managed($id)
{
    return get_post_meta($id, '_mbb_origin', true) === 'markdown_import' &&
        (!get_post_meta($id, '_llm_document_id', true) ||
            get_post_meta($id, '_mbb_source_managed', true) === 'file');
}
function mbb_id($id)
{
    return get_post_meta($id, '_mbb_document_id', true) ?:
        get_post_meta($id, '_mbb_fixture_id', true);
}
function mbb_token($p)
{
    return hash(
        'sha256',
        wp_json_encode([
            $p->post_content,
            $p->post_content_filtered,
            $p->post_title,
            $p->post_status,
            $p->post_author,
            mbb_id($p->ID),
            get_post_thumbnail_id($p->ID),
        ]),
    );
}
function mbb_document($p)
{
    return [
        'schema' => 1,
        'converter' => '0.2.0',
        'origin' => 'markdown_import',
        'documentId' => mbb_id($p->ID),
        'source' => $p->post_content_filtered,
        'serialized' => $p->post_content,
    ];
}
function mbb_state($id)
{
    $p = get_post($id);
    $state = [
        'post_id' => $id,
        'source_managed' => get_post_meta($id, '_mbb_source_managed', true) === 'file',
        'post_status' => $p->post_status,
        'featured_media' => (int) get_post_thumbnail_id($id),
        'title' => $p->post_title,
        'expected' => mbb_token($p),
        'document' => mbb_document($p),
        'editor_url' => admin_url('post.php?post=' . $id . '&action=edit'),
        'preview_url' => get_preview_post_link($id),
    ];
    if ($state['source_managed']) {
        $target = mbb_source_target($p);
        $state['source_write_available'] = !is_wp_error($target);
        if (!is_wp_error($target)) {
            $fingerprint = mbb_source_fingerprint($target);
            if (!is_wp_error($fingerprint)) {
                $state['source_sha256'] = $fingerprint['sha256'];
            }
        }
    }
    return $state;
}
function mbb_permission($r)
{
    $id = absint($r->get_param('post_id'));
    if (!is_user_logged_in() || !current_user_can($id ? 'edit_post' : 'edit_posts', $id)) {
        return new WP_Error('forbidden', '无权编辑这篇文章。', ['status' => 403]);
    }
    if ($id && !mbb_managed($id)) {
        return new WP_Error('origin', '该文章不是Markdown来源文档。', ['status' => 403]);
    }
    return true;
}
function mbb_source_write_permission($r)
{
    $permission = mbb_permission($r);
    if (is_wp_error($permission)) {
        return $permission;
    }
    $id = absint($r->get_param('post_id'));
    $capability = apply_filters('mbb_source_write_capability', 'edit_post', $id);
    if (!$capability || !current_user_can($capability, $id)) {
        return new WP_Error('source_forbidden', '无权写回这篇文章的源文件。', ['status' => 403]);
    }
    return true;
}
function mbb_source_audit_permission($r)
{
    $id = absint($r->get_param('post_id'));
    if (!$id || !current_user_can('manage_options')) {
        return new WP_Error('forbidden', '只有管理员可以查看源文件写回审计。', ['status' => 403]);
    }
    if (get_post_meta($id, '_mbb_source_managed', true) !== 'file') {
        return new WP_Error('source_managed', '该文章没有文件来源绑定。', ['status' => 409]);
    }
    return true;
}
function mbb_source_record_audit($id, $fields)
{
    update_post_meta(
        $id,
        '_mbb_source_web_audit',
        array_merge(
            [
                'user_id' => get_current_user_id(),
                'time' => current_time('mysql', true),
            ],
            $fields,
        ),
    );
}
function mbb_error($code, $message, $status = 409)
{
    return new WP_Error($code, $message, ['status' => $status]);
}
function mbb_convert($input)
{
    $diagnostics = mbb_runtime_diagnostics();
    if (!$diagnostics['ok']) {
        return mbb_error(
            'runtime_incompatible',
            '转换运行环境未配置或与当前插件、WordPress 不兼容，原内容未写入。',
            503,
        );
    }
    $result = mbb_run_worker($input);
    if (is_wp_error($result)) {
        return $result;
    }
    if (empty($result['ok'])) {
        return mbb_error(
            $result['code'] ?? 'conversion',
            ($result['message'] ?? '转换失败') . ' ' . ($result['location'] ?? ''),
            422,
        );
    }
    return $result['document'];
}
function mbb_html_normalize($html)
{
    $d = new DOMDocument('1.0', 'UTF-8');
    $old = libxml_use_internal_errors(true);
    $d->loadHTML(
        '<?xml encoding="UTF-8"?><div>' . $html . '</div>',
        LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET,
    );
    libxml_clear_errors();
    libxml_use_internal_errors($old);
    return $d->saveHTML();
}
function mbb_safe_css($properties)
{
    $properties[] = 'zoom';
    return array_unique($properties);
}
function mbb_html_allowed($blocks)
{
    $css_filter = has_filter('safe_style_css', 'mbb_safe_css');
    if ($css_filter === false) {
        add_filter('safe_style_css', 'mbb_safe_css');
    }
    try {
        $allowed = [
            'core/paragraph',
            'core/heading',
            'core/separator',
            'core/quote',
            'core/list',
            'core/list-item',
            'core/table',
            'core/image',
            'core/html',
            'core/more',
            'mbb/list',
            'mbb/list-item',
            'mbb/math',
            'mbb/code',
        ];
        foreach ($blocks as $b) {
            if ($b['blockName'] === null && trim($b['innerHTML']) === '') {
                continue;
            }
            if (
                !in_array($b['blockName'], $allowed, true) ||
                mbb_html_normalize(wp_kses_post($b['innerHTML'])) !==
                    mbb_html_normalize($b['innerHTML']) ||
                !mbb_html_allowed($b['innerBlocks'])
            ) {
                return false;
            }
        }
        return true;
    } finally {
        if ($css_filter === false) {
            remove_filter('safe_style_css', 'mbb_safe_css');
        }
    }
}
function mbb_candidate($r)
{
    if (strlen($r->get_body()) > 2000000) {
        return mbb_error('size', '请求过大。', 413);
    }
    $id = absint($r['post_id']);
    $p = $id ? get_post($id) : null;
    $mode = $r['mode'] ?? 'markdown';
    if (!in_array($mode, ['markdown', 'upload', 'blocks', 'restore'], true)) {
        return mbb_error('mode', '未知编辑模式。', 422);
    }
    if ($p && (!is_string($r['expected']) || !hash_equals(mbb_token($p), $r['expected']))) {
        return mbb_error('conflict', '文章已有新修改，请重新载入后合并。');
    }
    if ($mode === 'restore') {
        return mbb_with_publication($r, $p, mbb_revision_candidate($r, $p));
    }
    $docId = $p ? mbb_id($id) : $r['documentId'] ?? '';
    if (!is_string($docId) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,63}$/', $docId)) {
        return mbb_error(
            'identity',
            '文档ID需为3–64位字母、数字、下划线或连字符，以字母开头。',
            422,
        );
    }
    if (!$p && $mode === 'blocks') {
        return mbb_error('origin', '新文档请先导入Markdown。', 422);
    }
    $title = $r['title'] ?? ($p ? $p->post_title : '');
    if (!is_string($title) || !trim($title) || sanitize_text_field($title) !== $title) {
        return mbb_error('title', '请输入不含HTML的标题。', 422);
    }
    if ($mode !== 'blocks' && (!is_string($r['source']) || strlen($r['source']) > 1500000)) {
        return mbb_error('source', '缺少Markdown或原文过大。', 422);
    }
    if (
        $mode === 'blocks' &&
        (!is_string($r['serialized']) || strlen($r['serialized']) > 1500000)
    ) {
        return mbb_error('blocks', '缺少区块内容或内容过大。', 422);
    }
    if ($p && $mode === 'upload') {
        $history = get_post_meta($id, '_mbb_source_history', true);
        $hash = hash('sha256', $r['source']);
        if (
            is_array($history) &&
            in_array($hash, $history, true) &&
            $hash !== hash('sha256', $p->post_content_filtered)
        ) {
            return mbb_error('old_upload', '上传文件是已知旧版本，不能覆盖当前编辑结果。');
        }
    }
    $doc = mbb_convert([
        'mode' => $mode === 'blocks' ? 'blocks' : 'markdown',
        'source' => $r['source'],
        'serialized' => $r['serialized'],
        'documentId' => $docId,
        'base' => $p ? mbb_document($p) : null,
    ]);
    if (is_wp_error($doc)) {
        return $doc;
    }
    // Independent server HTML policy: never silently strip content accepted by the worker.
    if (!mbb_html_allowed(parse_blocks($doc['serialized']))) {
        return mbb_error('html_policy', '内容不符合服务器HTML白名单，未保存。', 422);
    }
    return mbb_with_publication($r, $p, [
        'document' => $doc,
        'title' => $title,
        'post_id' => $id,
        'expected' => $p ? mbb_token($p) : null,
    ]);
}
function mbb_preview($r)
{
    $c = mbb_candidate($r);
    if (is_wp_error($c)) {
        return $c;
    }
    $p = $c['post_id'] ? get_post($c['post_id']) : null;
    $c['before'] = $p ? $p->post_content_filtered : '';
    $c['before_title'] = $p ? $p->post_title : '';
    $c['html'] = do_blocks($c['document']['serialized']);
    return $c;
}
// Code/TeX attributes are plain text. The rendered HTML still passes normal KSES.
function mbb_kses_plain_block_sources($text, $allowed = 'post', $protocols = [])
{
    if (!str_contains($text, '<!--')) {
        return $text;
    }
    $walk = function ($blocks) use (&$walk, $allowed, $protocols) {
        foreach ($blocks as &$b) {
            $field = ['mbb/code' => 'code', 'mbb/math' => 'tex'][$b['blockName']] ?? null;
            $plain = $field ? $b['attrs'][$field] ?? null : null;
            $attrs = $b['attrs'];
            if ($field && is_string($plain)) {
                $attrs[$field] = '';
            }
            $b['attrs'] = filter_block_kses_value($attrs, $allowed, $protocols, $b);
            if ($field && is_string($plain)) {
                $b['attrs'][$field] = $plain;
            }
            $b['innerBlocks'] = $walk($b['innerBlocks']);
        }
        return $blocks;
    };
    return serialize_blocks($walk(parse_blocks($text)));
}
// Preserve only DOM-equivalent entity and void-element spelling after normal KSES.
function mbb_filter_paired_html($value)
{
    $filtered = wp_filter_post_kses($value);
    return mbb_html_normalize(wp_unslash($filtered)) === mbb_html_normalize(wp_unslash($value))
        ? $value
        : $filtered;
}
// Scope these exceptions to server-validated paired writes; preserve callback order and restore afterward.
function mbb_raw_source_filters()
{
    global $wp_filter;
    $saved = [];
    foreach (['content_filtered_save_pre', 'content_save_pre', 'pre_kses'] as $tag) {
        foreach ($wp_filter[$tag]->callbacks ?? [] as $priority => $callbacks) {
            foreach ($callbacks as $key => $entry) {
                if (
                    $tag === 'content_filtered_save_pre' &&
                    in_array(
                        $entry['function'],
                        ['wp_filter_post_kses', 'wp_filter_global_styles_post'],
                        true,
                    )
                ) {
                    $plain = static function ($value) {
                        return $value;
                    };
                } elseif (
                    $tag === 'content_save_pre' &&
                    $entry['function'] === 'wp_filter_post_kses'
                ) {
                    $plain = 'mbb_filter_paired_html';
                } elseif (
                    $tag === 'pre_kses' &&
                    $entry['function'] === 'wp_pre_kses_block_attributes'
                ) {
                    $plain = 'mbb_kses_plain_block_sources';
                } else {
                    continue;
                }
                $saved[] = [$tag, $priority, $key, $entry, $plain];
                $wp_filter[$tag]->callbacks[$priority][$key]['function'] = $plain;
            }
        }
    }
    return $saved;
}
function mbb_restore_source_filters($saved)
{
    global $wp_filter;
    foreach ($saved as [$tag, $priority, $key, $entry, $plain]) {
        if (($wp_filter[$tag]->callbacks[$priority][$key]['function'] ?? null) === $plain) {
            $wp_filter[$tag]->callbacks[$priority][$key] = $entry;
        }
    }
}
function mbb_save($r)
{
    global $wpdb;
    $id = absint($r['post_id']);
    if (
        $id &&
        get_post_meta($id, '_mbb_source_managed', true) === 'file' &&
        !(defined('WP_CLI') && WP_CLI) &&
        empty($GLOBALS['mbb_source_web_write'])
    ) {
        return mbb_error(
            'source_managed',
            '此文章由源文件同步；请修改原文后运行同步工具，后台可查看区块与预览。',
            409,
        );
    }
    $docId = $id ? mbb_id($id) : $r['documentId'] ?? '';
    if (!is_string($docId) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,63}$/', $docId)) {
        return mbb_error('identity', '文档ID无效。', 422);
    }
    $source_lock =
        $id &&
        get_post_meta($id, '_mbb_source_managed', true) === 'file' &&
        ((defined('WP_CLI') && WP_CLI) || !empty($GLOBALS['mbb_source_web_write']));
    $prefix = $source_lock ? '/mbb-source-locks-' : '/mbb-locks-';
    $dir = sys_get_temp_dir() . $prefix . hash('sha256', ABSPATH);
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    $lock = fopen($dir . '/' . hash('sha256', $docId) . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        return mbb_error('busy', '另一个保存正在进行，请稍后重试。');
    }
    try {
        if ($id) {
            clean_post_cache($id);
        }
        $ids = get_posts([
            'post_type' => ['post', 'page'],
            'post_status' => array_keys(get_post_stati()),
            'numberposts' => 2,
            'fields' => 'ids',
            'meta_query' => [
                'relation' => 'OR',
                ['key' => '_mbb_document_id', 'value' => $docId],
                ['key' => '_mbb_fixture_id', 'value' => $docId],
            ],
        ]);
        if (count($ids) > 1 || (!$id && $ids)) {
            return mbb_error('duplicate', '文档ID已存在，请从已有文档继续编辑。');
        }
        $c = mbb_candidate($r);
        if (is_wp_error($c)) {
            return $c;
        }
        $doc = $c['document'];
        $p = $id ? get_post($id) : null;
        $source_backup = null;
        $source_target = null;
        if ($p && get_post_meta($id, '_mbb_source_managed', true) === 'file') {
            if (empty($GLOBALS['mbb_source_web_write'])) {
                return mbb_error(
                    'source_managed',
                    '此文章由源文件同步；请使用受控的源文件写回流程。',
                );
            }
            $source_target = mbb_source_target($p);
            if (is_wp_error($source_target)) {
                return $source_target;
            }
            $current_source = mbb_source_fingerprint($source_target);
            if (is_wp_error($current_source)) {
                return $current_source;
            }
            if (
                !hash_equals((string) ($r['source_sha256'] ?? ''), $current_source['sha256']) ||
                !hash_equals((string) ($r['expected'] ?? ''), mbb_token($p))
            ) {
                return mbb_error('source_conflict', '源文件或文章内容已变化，请重新读取后再确认。');
            }
            $source_backup = $current_source['contents'];
            $written = mbb_source_atomic_write($source_target, $doc['source']);
            if (is_wp_error($written)) {
                return $written;
            }
        }
        if (
            $p &&
            $p->post_content === $doc['serialized'] &&
            $p->post_content_filtered === $doc['source'] &&
            $p->post_title === $c['title'] &&
            $p->post_status === $c['post_status'] &&
            (int) get_post_thumbnail_id($id) === $c['featured_media']
        ) {
            return array_merge(mbb_state($id), ['noop' => true]);
        }
        if ($wpdb->query('START TRANSACTION') === false) {
            if ($source_target && $source_backup !== null) {
                mbb_source_atomic_write($source_target, $source_backup);
            }
            return mbb_error('transaction', '无法开启保存事务。', 500);
        }
        $GLOBALS['mbb_paired_save'] = true;
        $GLOBALS['mbb_pair_identity'] = $docId;
        $raw_source_filters = mbb_raw_source_filters();
        add_filter('safe_style_css', 'mbb_safe_css');
        try {
            $before_revision = $p ? mbb_pair_snapshot($id) : 0;
            $revision_floor = $p
                ? max(array_merge([0], array_keys(wp_get_post_revisions($id))))
                : 0;
            $data = [
                'post_type' => $p ? $p->post_type : 'post',
                'post_status' => $c['post_status'],
                'post_title' => $c['title'],
                'post_content' => $doc['serialized'],
                'post_content_filtered' => $doc['source'],
            ];
            if ($p) {
                $data['ID'] = $id;
                $data['edit_date'] = true;
                $data['post_date'] = $p->post_date;
                $data['post_date_gmt'] = $p->post_date_gmt;
            } else {
                $data['post_author'] = get_current_user_id();
            }
            $id = $p
                ? wp_update_post(wp_slash($data), true)
                : wp_insert_post(wp_slash($data), true);
            if (is_wp_error($id)) {
                throw new RuntimeException('WordPress保存失败');
            }
            if ($c['featured_media']) {
                if (
                    (int) get_post_thumbnail_id($id) !== $c['featured_media'] &&
                    !set_post_thumbnail($id, $c['featured_media'])
                ) {
                    throw new RuntimeException('特色图片保存失败');
                }
            } else {
                delete_post_thumbnail($id);
            }
            update_post_meta($id, '_mbb_origin', 'markdown_import');
            update_post_meta($id, '_mbb_document_id', $docId);
            $history = get_post_meta($id, '_mbb_source_history', true);
            if (!is_array($history)) {
                $history = [];
            }
            if ($p) {
                $history[] = hash('sha256', $p->post_content_filtered);
            }
            $history[] = hash('sha256', $doc['source']);
            update_post_meta(
                $id,
                '_mbb_source_history',
                array_slice(array_values(array_unique($history)), -100),
            );
            clean_post_cache($id);
            $saved = get_post($id);
            if (
                $saved->post_content !== $doc['serialized'] ||
                $saved->post_content_filtered !== $doc['source'] ||
                $saved->post_status !== $c['post_status'] ||
                (int) get_post_thumbnail_id($id) !== $c['featured_media'] ||
                $wpdb->last_error
            ) {
                throw new RuntimeException('保存后内容核验失败');
            }
            $after_revision = mbb_pair_snapshot($id, $revision_floor);
            if (
                !empty($c['revision_id']) &&
                !update_metadata(
                    'post',
                    $after_revision,
                    '_mbb_restored_from',
                    (int) $c['revision_id'],
                )
            ) {
                throw new RuntimeException('恢复来源记录失败');
            }
            if ($wpdb->query('COMMIT') === false) {
                throw new RuntimeException('事务提交失败');
            }
        } catch (Throwable $e) {
            $wpdb->query('ROLLBACK');
            if ($source_target && $source_backup !== null) {
                mbb_source_atomic_write($source_target, $source_backup);
            }
            if (is_int($id)) {
                clean_post_cache($id);
            }
            return mbb_error('save_failed', '保存未完成，已回滚。', 500);
        } finally {
            remove_filter('safe_style_css', 'mbb_safe_css');
            mbb_restore_source_filters($raw_source_filters);
            $GLOBALS['mbb_paired_save'] = false;
            $GLOBALS['mbb_pair_identity'] = null;
            $GLOBALS['mbb_source_web_write'] = false;
        }
        return array_merge(mbb_state($id), [
            'noop' => false,
            'before_revision' => $before_revision,
            'saved_revision' => $after_revision,
            'restored_from' => $c['revision_id'] ?? null,
        ]);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
add_action('rest_api_init', function () {
    register_rest_route('mbb/v1', '/document', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_permission',
        'callback' => function ($r) {
            if (!$r['post_id']) {
                return mbb_error('id', '缺少文章ID。', 422);
            }
            return mbb_state(absint($r['post_id']));
        },
    ]);
    register_rest_route('mbb/v1', '/source', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_permission',
        'callback' => function ($r) {
            $id = absint($r['post_id']);
            $p = get_post($id);
            if (!$p || get_post_meta($id, '_mbb_source_managed', true) !== 'file') {
                return mbb_error('source_managed', '该文章没有可写回的文件来源。', 409);
            }
            $target = mbb_source_target($p);
            if (is_wp_error($target)) {
                return $target;
            }
            $fingerprint = mbb_source_fingerprint($target);
            if (is_wp_error($fingerprint)) {
                return $fingerprint;
            }
            return [
                'post_id' => $id,
                'expected' => mbb_token($p),
                'source_sha256' => $fingerprint['sha256'],
                'source' => $fingerprint['contents'],
            ];
        },
    ]);
    register_rest_route('mbb/v1', '/preview', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_permission',
        'callback' => 'mbb_preview',
    ]);
    register_rest_route('mbb/v1', '/source-save', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_source_write_permission',
        'callback' => function ($r) {
            $id = absint($r['post_id']);
            $p = get_post($id);
            if (!$p || get_post_meta($id, '_mbb_source_managed', true) !== 'file') {
                return mbb_error('source_managed', '该文章没有可写回的文件来源。', 409);
            }
            if (!is_string($r['source'] ?? null) || !is_string($r['source_sha256'] ?? null)) {
                return mbb_error('source_input', '缺少源文件内容或版本指纹。', 422);
            }
            $target = mbb_source_target($p);
            if (is_wp_error($target)) {
                mbb_source_record_audit($id, [
                    'source_sha256_before' => null,
                    'source_sha256_after' => null,
                    'result' => 'failed',
                    'code' => $target->get_error_code(),
                ]);
                return $target;
            }
            $current = mbb_source_fingerprint($target);
            if (is_wp_error($current)) {
                mbb_source_record_audit($id, [
                    'source_sha256_before' => null,
                    'source_sha256_after' => null,
                    'result' => 'failed',
                    'code' => $current->get_error_code(),
                ]);
                return $current;
            }
            if (!hash_equals($r['source_sha256'], $current['sha256'])) {
                $error = mbb_error('source_conflict', '源文件已变化，请重新读取后再确认。');
                mbb_source_record_audit($id, [
                    'source_sha256_before' => $current['sha256'],
                    'source_sha256_after' => null,
                    'result' => 'failed',
                    'code' => $error->get_error_code(),
                ]);
                return $error;
            }
            $GLOBALS['mbb_source_web_write'] = true;
            try {
                $result = mbb_save($r);
            } catch (Throwable $e) {
                $result = mbb_error('source_save_failed', '源文件和配对正文均未完成保存。', 500);
            } finally {
                $GLOBALS['mbb_source_web_write'] = false;
            }
            if (is_wp_error($result)) {
                mbb_source_record_audit($id, [
                    'source_sha256_before' => $current['sha256'],
                    'source_sha256_after' => null,
                    'result' => 'failed',
                    'code' => $result->get_error_code(),
                ]);
                return $result;
            }
            mbb_source_record_audit($id, [
                'source_sha256_before' => $current['sha256'],
                'source_sha256_after' => hash('sha256', $r['source']),
                'result' => 'saved',
            ]);
            return $result;
        },
    ]);
    register_rest_route('mbb/v1', '/source-audit', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_source_audit_permission',
        'callback' => function ($r) {
            $id = absint($r['post_id']);
            return [
                'post_id' => $id,
                'document_id' => mbb_id($id),
                'audit' => get_post_meta($id, '_mbb_source_web_audit', true) ?: null,
            ];
        },
    ]);
    register_rest_route('mbb/v1', '/save', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_permission',
        'callback' => 'mbb_save',
    ]);
});
add_filter(
    'rest_post_dispatch',
    function ($response, $server, $r) {
        if (str_starts_with($r->get_route(), '/mbb/v1/')) {
            $response = rest_ensure_response($response);
            $response->header('Cache-Control', 'private, no-store');
        }
        return $response;
    },
    10,
    3,
);
// Native post updates and autosaves must not split the two representations.
add_filter(
    'rest_pre_dispatch',
    function ($result, $server, $r) {
        if (
            $r->get_method() !== 'GET' &&
            $r->get_method() !== 'DELETE' &&
            preg_match('~^/wp/v2/(?:posts|pages)/(\d+)(?:/|$)~', $r->get_route(), $m) &&
            mbb_managed((int) $m[1]) &&
            current_user_can('edit_post', (int) $m[1])
        ) {
            return mbb_error('paired_save_required', '此文档请使用“预览差异 / 保存双格式”。', 403);
        }
        return $result;
    },
    10,
    3,
);
add_filter(
    'wp_insert_post_empty_content',
    function ($empty, $data) {
        if (!empty($GLOBALS['mbb_paired_save'])) {
            return $empty;
        }
        $id = absint($data['ID'] ?? 0);
        $parent = absint($data['post_parent'] ?? 0);
        if (
            ($id && mbb_managed($id)) ||
            (($data['post_type'] ?? '') === 'revision' && $parent && mbb_managed($parent))
        ) {
            return true;
        }
        return $empty;
    },
    10,
    2,
);
add_filter('_wp_post_revision_fields', function ($fields) {
    $fields['post_content_filtered'] = 'Markdown 原文';
    return $fields;
});
add_action('admin_menu', function () {
    add_management_page(
        'Markdown 编辑桥',
        'Markdown 编辑桥',
        'edit_posts',
        'mbb-editor',
        function () {
            echo '<div class="wrap"><h1>Markdown 编辑桥</h1><p>上传Markdown后可双向编辑；通过差异预览保存、发布或提交审核。发布前请设置特色图片。</p><p><button class="button button-primary" id="mbb-new">上传新文档</button></p><ul>';
            $page = max(1, absint($_GET['mbb_page'] ?? 1));
            $posts = get_posts([
                'post_type' => 'post',
                'post_status' => array_values(
                    array_diff(array_keys(get_post_stati()), ['trash', 'auto-draft']),
                ),
                'numberposts' => 101,
                'offset' => ($page - 1) * 100,
                'orderby' => ['date' => 'DESC', 'ID' => 'DESC'],
                'author' => current_user_can('edit_others_posts') ? '' : get_current_user_id(),
                'meta_key' => '_mbb_origin',
                'meta_value' => 'markdown_import',
            ]);
            foreach (array_slice($posts, 0, 100) as $p) {
                if (current_user_can('edit_post', $p->ID)) {
                    echo '<li><a href="' .
                        esc_url(get_edit_post_link($p->ID)) .
                        '">' .
                        esc_html($p->post_title) .
                        '</a> <button class="button mbb-open" data-post="' .
                        (int) $p->ID .
                        '">Markdown 编辑</button> <button class="button mbb-history" data-post="' .
                        (int) $p->ID .
                        '">历史版本 / 恢复</button></li>';
                }
            }
            echo '</ul><nav aria-label="文档分页">';
            if ($page > 1) {
                echo '<a href="' .
                    esc_url(admin_url('tools.php?page=mbb-editor&mbb_page=' . ($page - 1))) .
                    '">上一页</a> ';
            }
            if (count($posts) > 100) {
                echo '<a href="' .
                    esc_url(admin_url('tools.php?page=mbb-editor&mbb_page=' . ($page + 1))) .
                    '">下一页</a>';
            }
            echo '</nav></div>';
        },
    );
});
function mbb_enqueue_ui()
{
    if (!current_user_can('edit_posts')) {
        return;
    }
    $screen = get_current_screen();
    $id = absint($_GET['post'] ?? 0);
    $tool = $screen && $screen->id === 'tools_page_mbb-editor';
    if ($id && !current_user_can('edit_post', $id)) {
        return;
    }
    $post_screen =
        ($screen && in_array($screen->base, ['post', 'post-new'], true)) ||
        basename($_SERVER['PHP_SELF'] ?? '') === 'post-new.php';
    $new_post = !$id && $post_screen;
    if (!$tool && (!$post_screen || (!$new_post && !mbb_managed($id)))) {
        return;
    }
    wp_enqueue_script(
        'mbb-editor-ui',
        set_url_scheme(plugins_url(mbb_asset('editor-ui.js'), __FILE__), 'https'),
        ['wp-data', 'wp-blocks', 'mbb-math'],
        substr(hash_file('sha256', __DIR__ . '/editor-ui.js'), 0, 12),
        true,
    );
    wp_enqueue_script(
        'mbb-revisions-ui',
        set_url_scheme(plugins_url('revisions-ui.js', __FILE__), 'https'),
        ['mbb-editor-ui'],
        substr(hash_file('sha256', __DIR__ . '/revisions-ui.js'), 0, 12),
        true,
    );
    wp_localize_script('mbb-editor-ui', 'MBB_EDITOR', [
        'root' => rest_url('mbb/v1'),
        'nonce' => wp_create_nonce('wp_rest'),
        'postId' => $tool ? 0 : $id,
        'canPublish' => current_user_can(
            $id && get_post_type($id) === 'page' ? 'publish_pages' : 'publish_posts',
        ),
        'state' => $tool || $new_post ? null : mbb_state($id),
    ]);
    wp_enqueue_style(
        'mbb-editor-ui',
        plugins_url(mbb_asset('editor-ui.css'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/editor-ui.css'), 0, 12),
    );
}
add_action('admin_enqueue_scripts', 'mbb_enqueue_ui');
add_action('enqueue_block_editor_assets', 'mbb_enqueue_ui');
add_action('admin_footer-post-new.php', 'mbb_enqueue_ui');

require_once __DIR__ . '/lifecycle.php';
