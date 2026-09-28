<?php
// Keep a managed document paired while the normal WordPress REST controller saves all fields.
function mbb_native_pre_insert($prepared, $request)
{
    $scope = $GLOBALS['mbb_native_pair'] ?? null;
    if (!is_array($scope) || $scope['id'] !== absint($request['id'])) {
        return $prepared;
    }
    if (is_wp_error($prepared)) {
        return $prepared;
    }
    clean_post_cache($scope['id']);
    $current = get_post($scope['id']);
    if (!$current || !hash_equals($scope['expected'], mbb_token($current))) {
        return mbb_error('conflict', '文章已有新修改，请重新载入后合并。');
    }
    $review = new WP_REST_Request('POST', '/mbb/v1/preview');
    $review->set_body((string) $request->get_body());
    foreach (
        [
            'post_id' => $scope['id'],
            'expected' => $scope['expected'],
            'mode' => 'blocks',
            'serialized' => property_exists($prepared, 'post_content')
                ? $prepared->post_content
                : $current->post_content,
            'title' => property_exists($prepared, 'post_title')
                ? $prepared->post_title
                : $current->post_title,
            'post_status' => property_exists($prepared, 'post_status')
                ? $prepared->post_status
                : $current->post_status,
            'featured_media' => $request->has_param('featured_media')
                ? $request['featured_media']
                : (int) get_post_thumbnail_id($scope['id']),
        ]
        as $name => $value
    ) {
        $review->set_param($name, $value);
    }
    $candidate = mbb_candidate($review);
    if (is_wp_error($candidate)) {
        return $candidate;
    }
    $prepared->post_content = $candidate['document']['serialized'];
    $prepared->post_content_filtered = $candidate['document']['source'];
    $GLOBALS['mbb_native_pair']['candidate'] = $candidate;
    return $prepared;
}
add_filter('rest_pre_insert_post', 'mbb_native_pre_insert', 1000, 2);
add_filter('rest_pre_insert_page', 'mbb_native_pre_insert', 1000, 2);

function mbb_native_verify_terms($id, $post_type, $request)
{
    foreach (get_object_taxonomies($post_type, 'objects') as $taxonomy) {
        if (!$taxonomy->show_in_rest) {
            continue;
        }
        $field = $taxonomy->rest_base ?: $taxonomy->name;
        if (!$request->has_param($field)) {
            continue;
        }
        $expected = array_map('intval', (array) $request[$field]);
        $saved = wp_get_object_terms($id, $taxonomy->name, ['fields' => 'ids']);
        if (is_wp_error($saved)) {
            return false;
        }
        $saved = array_map('intval', $saved);
        sort($expected);
        sort($saved);
        if ($expected !== $saved) {
            return false;
        }
    }
    return true;
}
function mbb_native_verify($id, $request)
{
    global $wpdb;
    $candidate = $GLOBALS['mbb_native_pair']['candidate'] ?? null;
    if (!$candidate) {
        return false;
    }
    clean_post_cache($id);
    $post = get_post($id);
    if (
        !$post ||
        $post->post_content !== $candidate['document']['serialized'] ||
        $post->post_content_filtered !== $candidate['document']['source'] ||
        $post->post_title !== $candidate['title'] ||
        $post->post_status !== $candidate['post_status'] ||
        (int) get_post_thumbnail_id($id) !== (int) $candidate['featured_media'] ||
        $wpdb->last_error ||
        !mbb_native_verify_terms($id, $post->post_type, $request)
    ) {
        return false;
    }
    if ($request->has_param('sticky') && (bool) $request['sticky'] !== is_sticky($id)) {
        return false;
    }
    $format = $request['format'] ?? null;
    if (
        $request->has_param('format') &&
        ($format === 'standard' ? false : $format) !== get_post_format($id)
    ) {
        return false;
    }
    $template = $request['template'] ?? null;
    if ($request->has_param('template') && $template !== get_page_template_slug($id)) {
        return false;
    }
    return true;
}
function mbb_native_update_history($id, $before, $after)
{
    $history = get_post_meta($id, '_mbb_source_history', true);
    if (!is_array($history)) {
        $history = [];
    }
    $history[] = hash('sha256', $before);
    $history[] = hash('sha256', $after);
    $history = array_slice(array_values(array_unique($history)), -100);
    update_post_meta($id, '_mbb_source_history', $history);
    return get_post_meta($id, '_mbb_source_history', true) === $history;
}
function mbb_native_clear_rollback_cache($id, $revisions, $term_ids)
{
    clean_post_cache($id);
    foreach ($revisions as $revision_id) {
        wp_cache_delete($revision_id, 'posts');
        wp_cache_delete($revision_id, 'post_meta');
    }
    foreach ($term_ids as $taxonomy => $ids) {
        if ($ids) {
            clean_term_cache(array_values(array_unique($ids)), $taxonomy);
        }
    }
    foreach (['sticky_posts', 'alloptions', 'notoptions'] as $key) {
        wp_cache_delete($key, 'options');
    }
    wp_cache_set_posts_last_changed();
}
function mbb_native_rest_update($result, $server, $request)
{
    global $wpdb;
    if (null !== $result || !empty($GLOBALS['mbb_native_pair'])) {
        return $result;
    }
    if (!preg_match('~^/wp/v2/(?:posts|pages)/(\d+)(.*)$~', $request->get_route(), $matches)) {
        return $result;
    }
    $id = (int) $matches[1];
    if (!mbb_managed($id) || in_array($request->get_method(), ['GET', 'DELETE'], true)) {
        return $result;
    }
    if (!current_user_can('edit_post', $id)) {
        return mbb_error('forbidden', '无权编辑这篇文章。', 403);
    }
    if ($matches[2] !== '' && $matches[2] !== '/') {
        return mbb_error('paired_save_required', '此文档的自动保存与修订不能单独写入。', 403);
    }
    if (get_post_meta($id, '_mbb_source_managed', true) === 'file') {
        return mbb_error('source_managed', '文件来源文章请先预览并明确确认写回。', 403);
    }
    if (!in_array($request->get_method(), ['POST', 'PUT', 'PATCH'], true)) {
        return mbb_error('paired_save_required', '此文档只能通过原生文章更新保存。', 403);
    }
    $expected = $request->get_param('mbb_expected');
    if (!is_string($expected) || !preg_match('/^[a-f0-9]{64}$/', $expected)) {
        return mbb_error('expected_required', '缺少当前文档版本，请重新载入后保存。', 409);
    }
    $doc_id = mbb_id($id);
    if (!is_string($doc_id) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,63}$/', $doc_id)) {
        return mbb_error('identity', '文档 ID 无效。', 422);
    }
    $dir = sys_get_temp_dir() . '/mbb-locks-' . hash('sha256', ABSPATH);
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        return mbb_error('lock', '无法创建文档锁。', 500);
    }
    $lock = fopen($dir . '/' . hash('sha256', $doc_id) . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        if ($lock) {
            fclose($lock);
        }
        return mbb_error('busy', '另一个保存正在进行，请稍后重试。');
    }
    $started = false;
    $response = null;
    $revisions = [];
    $term_ids = [];
    $previous_paired = $GLOBALS['mbb_paired_save'] ?? false;
    $previous_identity = $GLOBALS['mbb_pair_identity'] ?? null;
    $raw_source_filters = [];
    $revision_callback = function ($revision_id, $post_id) use ($id, &$revisions) {
        if ((int) $post_id === $id) {
            $revisions[] = (int) $revision_id;
        }
    };
    try {
        if ($wpdb->query('START TRANSACTION') === false) {
            return mbb_error('transaction', '无法开启保存事务。', 500);
        }
        $started = true;
        $row = $wpdb->get_var(
            $wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id),
        );
        if ((int) $row !== $id || $wpdb->last_error) {
            throw new RuntimeException('无法锁定文章记录');
        }
        clean_post_cache($id);
        $post = get_post($id);
        if (!$post || !hash_equals($expected, mbb_token($post))) {
            $response = mbb_error('conflict', '文章已有新修改，请重新载入后合并。');
            throw new RuntimeException('stale expected version');
        }
        foreach (get_object_taxonomies($post->post_type, 'objects') as $taxonomy) {
            if (!$taxonomy->show_in_rest) {
                continue;
            }
            $old = wp_get_object_terms($id, $taxonomy->name, ['fields' => 'ids']);
            if (is_wp_error($old)) {
                throw new RuntimeException('无法读取当前分类或标签');
            }
            $field = $taxonomy->rest_base ?: $taxonomy->name;
            $term_ids[$taxonomy->name] = array_merge(
                array_map('intval', $old),
                $request->has_param($field) ? array_map('intval', (array) $request[$field]) : [],
            );
        }
        $GLOBALS['mbb_native_pair'] = [
            'id' => $id,
            'expected' => $expected,
            'candidate' => null,
        ];
        $GLOBALS['mbb_paired_save'] = true;
        $GLOBALS['mbb_pair_identity'] = $doc_id;
        $raw_source_filters = mbb_raw_source_filters();
        add_filter('safe_style_css', 'mbb_safe_css');
        add_action('_wp_put_post_revision', $revision_callback, 1, 2);
        $before_revision = mbb_pair_snapshot($id);
        $revision_floor = max(array_merge([0], array_keys(wp_get_post_revisions($id))));
        $response = $server->dispatch($request);
        if (is_wp_error($response) || $response->get_status() >= 400) {
            throw new RuntimeException('WordPress REST update rejected');
        }
        if (!mbb_native_verify($id, $request)) {
            throw new RuntimeException('配对正文或附属字段核验失败');
        }
        if (
            !mbb_native_update_history(
                $id,
                $post->post_content_filtered,
                $GLOBALS['mbb_native_pair']['candidate']['document']['source'],
            )
        ) {
            throw new RuntimeException('源版本历史保存失败');
        }
        $saved_revision = mbb_pair_snapshot($id, $revision_floor);
        if ($wpdb->query('COMMIT') === false) {
            throw new RuntimeException('事务提交失败');
        }
        $started = false;
        $data = $response->get_data();
        if (is_array($data)) {
            clean_post_cache($id);
            $data['mbb_expected'] = mbb_token(get_post($id));
            $data['mbb_before_revision'] = $before_revision;
            $data['mbb_saved_revision'] = $saved_revision;
            $response->set_data($data);
        }
        return $response;
    } catch (Throwable $error) {
        if ($started && $wpdb->query('ROLLBACK') === false) {
            return mbb_error('rollback_failed', '保存失败且无法回滚，请联系管理员。', 500);
        }
        mbb_native_clear_rollback_cache($id, $revisions, $term_ids);
        return $response && (is_wp_error($response) || $response->get_status() >= 400)
            ? $response
            : mbb_error('native_save_failed', '原生保存未完成，已回滚。', 500);
    } finally {
        remove_action('_wp_put_post_revision', $revision_callback, 1);
        remove_filter('safe_style_css', 'mbb_safe_css');
        mbb_restore_source_filters($raw_source_filters);
        $GLOBALS['mbb_paired_save'] = $previous_paired;
        $GLOBALS['mbb_pair_identity'] = $previous_identity;
        unset($GLOBALS['mbb_native_pair']);
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
add_filter('rest_pre_dispatch', 'mbb_native_rest_update', 10, 3);
