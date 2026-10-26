<?php

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

require_once __DIR__ . '/includes/i18n.php';
/** Read a bounded, unambiguous component header without erasing JSON object identities. */
function mbb_native_component_read_header(string $raw): ?stdClass
{
    try {
        $attrs = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
        if (
            !($attrs instanceof stdClass) ||
            !is_string($attrs->id ?? null) ||
            !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $attrs->id) ||
            !is_string($attrs->component ?? null) ||
            !is_string($attrs->componentVersion ?? null) ||
            !property_exists($attrs, 'params')
        ) {
            return null;
        }
        // json_decode accepts duplicate keys; neither response nor stored duplicates
        // establish a correspondence. Strings followed by ':' are object keys.
        preg_match_all('/"(?:\\\\.|[^"\\\\])*"|[{}\[\]:,]/', $raw, $matches);
        $tokens = $matches[0];
        $stack = [];
        foreach ($tokens as $i => $token) {
            if ($token === '{') {
                $stack[] = [];
            } elseif ($token === '[') {
                $stack[] = null;
            } elseif ($token === '}' || $token === ']') {
                array_pop($stack);
            } elseif (
                str_starts_with($token, '"') &&
                ($tokens[$i + 1] ?? '') === ':' &&
                ($stack[count($stack) - 1] ?? null) !== null
            ) {
                $key = json_decode($token, true, 32, JSON_THROW_ON_ERROR);
                $index = count($stack) - 1;
                if (isset($stack[$index][$key])) {
                    return null;
                }
                $stack[$index][$key] = true;
            }
        }
        return $attrs;
    } catch (JsonException) {
        return null;
    }
}
/** Restore parameter shapes in an edit projection while retaining all core/plugin hooks. */
function mbb_native_component_read_bytes(string $projected, string $stored): string
{
    if (
        strlen($stored) > 262144 ||
        strlen($projected) > 1500000 ||
        !str_contains($stored, '<!-- wp:mbb/component ')
    ) {
        return $projected;
    }
    $pattern = '/<!-- wp:mbb\/component (\{[\s\S]*?\}) -->/';
    preg_match_all($pattern, $stored, $original, PREG_SET_ORDER);
    preg_match_all($pattern, $projected, $current, PREG_SET_ORDER);
    if (count($original) > 32 || count($current) > 32) {
        return $projected;
    }
    foreach ([[$stored, $original], [$projected, $current]] as [$text, $matches]) {
        if (preg_match_all('/<!--\s+wp:mbb\/component(?=\s|\/|-->)/', $text) !== count($matches)) {
            return $projected;
        }
    }
    $headers = [];
    $counts = [];
    foreach ($original as $match) {
        $a = mbb_native_component_read_header($match[1]);
        if (!$a) {
            return $projected;
        }
        $headers[$a->id][] = $a;
    }
    foreach ($current as $match) {
        $a = mbb_native_component_read_header($match[1]);
        if (!$a) {
            return $projected;
        }
        $counts[$a->id] = ($counts[$a->id] ?? 0) + 1;
    }
    return preg_replace_callback(
        $pattern,
        static function ($match) use ($headers, $counts) {
            $a = mbb_native_component_read_header($match[1]);
            if (!$a || count($headers[$a->id] ?? []) !== 1 || ($counts[$a->id] ?? 0) !== 1) {
                return $match[0];
            }
            $before = $headers[$a->id][0];
            if (
                $a->component !== $before->component ||
                $a->componentVersion !== $before->componentVersion ||
                !($before->params instanceof stdClass) ||
                !mbb_component_pure_params($before->params)
            ) {
                return $match[0];
            }
            $original = mbb_component_json($before->params);
            $prepared = mbb_component_json($a->params);
            if (
                !is_string($original) ||
                !is_string($prepared) ||
                strlen($original) > 16384 ||
                strlen($prepared) > 16384 ||
                $original === $prepared ||
                json_decode($original, true, 32, JSON_THROW_ON_ERROR) !==
                    json_decode($prepared, true, 32, JSON_THROW_ON_ERROR)
            ) {
                return $match[0];
            }
            $a->params = $before->params;
            return '<!-- wp:mbb/component ' . serialize_block_attributes((array) $a) . ' -->';
        },
        $projected,
    );
}
function mbb_native_component_read_response($response, $post, $request)
{
    if (
        !($response instanceof WP_REST_Response) ||
        $request->get_param('context') !== 'edit' ||
        !mbb_managed($post->ID) ||
        !current_user_can('edit_post', $post->ID)
    ) {
        return $response;
    }
    $data = $response->get_data();
    if (is_string($data['content']['raw'] ?? null)) {
        $data['content']['raw'] = mbb_native_component_read_bytes(
            $data['content']['raw'],
            $post->post_content,
        );
        $response->set_data($data);
    }
    return $response;
}
foreach (['post', 'page'] as $mbb_native_post_type) {
    add_filter(
        'rest_prepare_' . $mbb_native_post_type,
        'mbb_native_component_read_response',
        20,
        3,
    );
}
unset($mbb_native_post_type);

// Undo only the exact core block-comment projection, never a filter's content/configuration change.
// Core REST block hooks serialize attributes before pre-insert (e.g. 1e-8 -> 1.0e-8,
// or nested {} -> []). The original browser comment remains subject to strict conversion.
// Temporary core projection may exceed 256 KiB by a few bytes: scratch input is capped
// at the existing 1.5 MB REST bound; saved source/blocks still pass the 256 KiB converter.
function mbb_native_component_comment_bytes(string $prepared, string $incoming): string
{
    if (
        strlen($prepared) > 1500000 ||
        strlen($incoming) > 1500000 ||
        !str_contains($incoming, '<!-- wp:mbb/component ') ||
        preg_match_all('/<!--\s+wp:/', $incoming) > 10000 ||
        preg_match_all('/<!--\s+wp:/', $prepared) > 10000
    ) {
        return $prepared;
    }
    $originalBlocks = parse_blocks($incoming);
    $preparedBlocks = parse_blocks($prepared);
    $pattern = '/<!-- wp:mbb\/component (\{[\s\S]*?\}) -->/';
    $originalComments = [];
    preg_match_all($pattern, $incoming, $matches, PREG_SET_ORDER);
    foreach ($matches as $match) {
        try {
            $attrs = json_decode($match[1], true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            continue;
        }
        $id = $attrs['id'] ?? null;
        if (is_string($id)) {
            $originalComments[$id][] = $match[0];
        }
    }
    $count = static function (array $blocks) {
        $ids = [];
        $nodes = 0;
        $walk = static function (array $list, int $depth) use (&$walk, &$ids, &$nodes): bool {
            foreach ($list as $block) {
                if (
                    $depth > 32 ||
                    ++$nodes > 10000 ||
                    !is_array($block) ||
                    !array_key_exists('blockName', $block) ||
                    !is_array($block['attrs'] ?? null) ||
                    !is_array($block['innerBlocks'] ?? null)
                ) {
                    return false;
                }
                if (
                    ($block['blockName'] ?? '') === 'mbb/component' &&
                    is_string($block['attrs']['id'] ?? null)
                ) {
                    $id = $block['attrs']['id'];
                    $ids[$id] = ($ids[$id] ?? 0) + 1;
                }
                if (!$walk($block['innerBlocks'] ?? [], $depth + 1)) {
                    return false;
                }
            }
            return true;
        };
        return $walk($blocks, 0) ? $ids : null;
    };
    $originalIds = $count($originalBlocks);
    $preparedIds = $count($preparedBlocks);
    if (
        $originalIds === null ||
        $preparedIds === null ||
        serialize_blocks($preparedBlocks) !== $prepared
    ) {
        return $prepared;
    }
    $eligible = [];
    $pair = static function (array $original, array $current) use (
        &$pair,
        &$eligible,
        $originalIds,
        $preparedIds,
        $originalComments,
    ): void {
        foreach ($original as $index => $before) {
            $after = $current[$index] ?? null;
            if (!$after || $before['blockName'] !== $after['blockName']) {
                continue;
            }
            // Changed enclosing identities/structure are not a correspondence proof.
            foreach (['id', 'anchor'] as $key) {
                if (($before['attrs'][$key] ?? null) !== ($after['attrs'][$key] ?? null)) {
                    continue 2;
                }
            }
            if ($before['blockName'] === 'mbb/component') {
                $id = $before['attrs']['id'] ?? null;
                if (
                    !is_string($id) ||
                    ($originalIds[$id] ?? 0) !== 1 ||
                    ($preparedIds[$id] ?? 0) !== 1 ||
                    count($originalComments[$id] ?? []) !== 1 ||
                    serialize_block($before) !== serialize_block($after)
                ) {
                    continue;
                }
                $eligible[$id] = $originalComments[$id][0];
            }
            $pair($before['innerBlocks'] ?? [], $after['innerBlocks'] ?? []);
        }
    };
    $pair($originalBlocks, $preparedBlocks);
    return preg_replace_callback(
        $pattern,
        static function ($match) use ($eligible) {
            $attrs = json_decode($match[1], true, 32);
            $id = $attrs['id'] ?? null;
            return is_string($id) && isset($eligible[$id]) ? $eligible[$id] : $match[0];
        },
        $prepared,
    );
}

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
        return mbb_error(
            'conflict',
            mbb_t('The article has newer changes. Reload and merge them.'),
        );
    }
    $serialized = property_exists($prepared, 'post_content')
        ? $prepared->post_content
        : $current->post_content;
    $incoming = $request->get_param('content');
    if (is_array($incoming)) {
        $incoming = $incoming['raw'] ?? null;
    }
    if (is_string($serialized) && is_string($incoming)) {
        $serialized = mbb_native_component_comment_bytes($serialized, $incoming);
    }
    $review = new WP_REST_Request('POST', '/mbb/v1/preview');
    $review->set_body((string) $request->get_body());
    foreach (
        [
            'post_id' => $scope['id'],
            'expected' => $scope['expected'],
            'mode' => 'blocks',
            'serialized' => $serialized,
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
    if (
        function_exists('mbb_references_requires_connection') &&
        mbb_references_requires_connection($candidate['document'])
    ) {
        return mbb_error('reference_connection_required', 'Reference transaction required.', 409);
    }
    if (function_exists('mbb_references_begin') && !empty($GLOBALS['mbb_reference_connection'])) {
        try {
            mbb_references_begin($scope['id'], $candidate['document'], $request, true);
        } catch (Throwable $e) {
            return mbb_references_error($e);
        }
    }
    $prepared->post_content = $candidate['document']['serialized'];
    $prepared->post_content_filtered = $candidate['document']['source'];
    if (!hash_equals($candidate['_adapter_registry_digest'], mbb_block_adapter_digest())) {
        return mbb_error(
            'adapter_conflict',
            mbb_t(
                'Static registrations changed while preparing the native candidate. Verify it again.',
            ),
        );
    }
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
    if (!empty($GLOBALS['mbb_reference_lifecycle'])) {
        return mbb_error(
            'nested_save',
            mbb_t('A paired save cannot start inside a native save transaction.'),
            409,
        );
    }
    $response = mbb_native_rest_update_core($result, $server, $request);
    $data =
        is_object($response) && method_exists($response, 'get_data') ? $response->get_data() : null;
    $code = is_wp_error($response)
        ? $response->get_error_code()
        : (is_array($data)
            ? $data['code'] ?? null
            : null);
    if ($code === 'reference_connection_required') {
        return mbb_references_connection(
            fn() => mbb_native_rest_update_core($result, $server, $request),
        );
    }
    return $response;
}
function mbb_native_rest_update_core($result, $server, $request)
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
    if (
        function_exists('mbb_references_request_touched') &&
        mbb_references_request_touched($request, $id)
    ) {
        return mbb_references_connection(
            fn() => mbb_native_rest_update_core($result, $server, $request),
        );
    }
    if (!current_user_can('edit_post', $id)) {
        return mbb_error(
            'forbidden',
            mbb_t('You do not have permission to edit this article.'),
            403,
        );
    }
    if ($matches[2] !== '' && $matches[2] !== '/') {
        return mbb_error(
            'paired_save_required',
            mbb_t('Autosaves and revisions for this document cannot be written separately.'),
            403,
        );
    }
    if (get_post_meta($id, '_mbb_source_managed', true) === 'file') {
        return mbb_error(
            'source_managed',
            mbb_t('Preview and explicitly confirm the write for a source-managed article.'),
            403,
        );
    }
    if (!in_array($request->get_method(), ['POST', 'PUT', 'PATCH'], true)) {
        return mbb_error(
            'paired_save_required',
            mbb_t('This document must be saved through the native article update route.'),
            403,
        );
    }
    if (
        $request->has_param('resource_import') ||
        $request->has_param('resource_receipt') ||
        $request->has_param('requires_resources') ||
        ($request['frontmatter_selected'] ?? []) !== [] ||
        $request->has_param('frontmatter_receipt') ||
        $request->has_param('frontmatter_applied')
    ) {
        return mbb_error(
            'frontmatter_native',
            mbb_t(
                'Native saving only preserves header proposals. Apply metadata by selecting fields, previewing, and confirming in the editing bridge.',
            ),
            422,
        );
    }
    $expected = $request->get_param('mbb_expected');
    if (!is_string($expected) || !preg_match('/^[a-f0-9]{64}$/', $expected)) {
        return mbb_error(
            'expected_required',
            mbb_t('The current document version is missing. Reload before saving.'),
            409,
        );
    }
    $doc_id = mbb_id($id);
    if (!is_string($doc_id) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,63}$/', $doc_id)) {
        return mbb_error('identity', mbb_t('The document ID is invalid.'), 422);
    }
    $dir = sys_get_temp_dir() . '/mbb-locks-' . hash('sha256', ABSPATH);
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        return mbb_error('lock', mbb_t('The document lock could not be created.'), 500);
    }
    $lock = fopen($dir . '/' . hash('sha256', $doc_id) . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        if ($lock) {
            fclose($lock);
        }
        return mbb_error('busy', mbb_t('Another save is in progress. Try again later.'));
    }
    $started = false;
    $attempted = false;
    $commit_attempted = false;
    $database_baseline = null;
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
        $database_baseline = mbb_save_database_snapshot($id);
        $attempted = true;
        if (
            (function_exists('mbb_references_start_sql')
                ? mbb_references_start_sql()
                : $wpdb->query('START TRANSACTION')) === false
        ) {
            $response = mbb_error(
                'transaction',
                mbb_t('The save transaction could not be started.'),
                500,
            );
            throw new RuntimeException('Transaction start rejected');
        }
        $started = true;
        $row = $wpdb->get_var(
            $wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id),
        );
        if ((int) $row !== $id || $wpdb->last_error) {
            throw new RuntimeException(mbb_t('The article record could not be locked'));
        }
        clean_post_cache($id);
        $post = get_post($id);
        if (!$post || !hash_equals($expected, mbb_token($post))) {
            $response = mbb_error(
                'conflict',
                mbb_t('The article has newer changes. Reload and merge them.'),
            );
            throw new RuntimeException('stale expected version');
        }
        foreach (get_object_taxonomies($post->post_type, 'objects') as $taxonomy) {
            if (!$taxonomy->show_in_rest) {
                continue;
            }
            $old = wp_get_object_terms($id, $taxonomy->name, ['fields' => 'ids']);
            if (is_wp_error($old)) {
                throw new RuntimeException(mbb_t('Current categories or tags could not be read'));
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
            throw new RuntimeException(
                mbb_t('Paired body or accompanying field verification failed'),
            );
        }
        if (
            !mbb_native_update_history(
                $id,
                $post->post_content_filtered,
                $GLOBALS['mbb_native_pair']['candidate']['document']['source'],
            )
        ) {
            throw new RuntimeException(mbb_t('Source version history could not be saved'));
        }
        $saved_revision = mbb_pair_snapshot($id, $revision_floor);
        $adapter_digest =
            $GLOBALS['mbb_native_pair']['candidate']['_adapter_registry_digest'] ?? null;
        if ($adapter_digest !== null && !hash_equals($adapter_digest, mbb_block_adapter_digest())) {
            throw new RuntimeException(mbb_t('Static block registrations changed during saving'));
        }
        if (function_exists('mbb_references_finish')) {
            mbb_references_finish($id, $GLOBALS['mbb_native_pair']['candidate']['document']);
        }
        $commit_attempted = true;
        if ($wpdb->query('COMMIT') === false) {
            throw new RuntimeException(mbb_t('Transaction commit failed'));
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
        try {
            $rollback_ok = !$attempted || $wpdb->query('ROLLBACK') !== false;
        } catch (Throwable $rollback_error) {
            $rollback_ok = false;
        }
        if (
            $commit_attempted &&
            (!$rollback_ok || !mbb_save_rollback_confirmed($id, $database_baseline))
        ) {
            mbb_native_clear_rollback_cache($id, $revisions, $term_ids);
            return mbb_error(
                'commit_uncertain',
                mbb_t(
                    'The commit result could not be reliably confirmed. Verify the article before saving again.',
                ),
                500,
            );
        }
        if (!$rollback_ok) {
            return mbb_error(
                'rollback_failed',
                mbb_t('Saving failed and rollback was unavailable. Contact an administrator.'),
                500,
            );
        }
        mbb_native_clear_rollback_cache($id, $revisions, $term_ids);
        if ($error instanceof MBB_Reference_Failure) {
            return mbb_references_error($error);
        }
        return $response && (is_wp_error($response) || $response->get_status() >= 400)
            ? $response
            : mbb_error(
                'native_save_failed',
                mbb_t('Native saving did not complete and was rolled back.'),
                500,
            );
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
