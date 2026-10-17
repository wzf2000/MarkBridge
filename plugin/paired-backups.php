<?php
// Private candidate storage. This module never updates posts, revisions, attachments or source files.
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
const MBB_BACKUP_INDEX = '_mbb_paired_backups_v1';
const MBB_BACKUP_BYTES = 33554432;
const MBB_BACKUP_TTL = 604800;
function mbb_backup_error(string $code = 'backup_conflict')
{
    $messages = [
        'backup_quota' => mbb_t(
            'Paired backup storage is full. Delete some of your older backups or contact an administrator. Current input is preserved.',
        ),
        'backup_busy' => mbb_t(
            'Another paired backup is being processed. Try again shortly. Current input is preserved.',
        ),
        'backup_storage' => mbb_t(
            'Paired backup storage failed. Current input is preserved; try again or download your candidate.',
        ),
        'backup_auth_expired' => mbb_t(
            'Your sign-in expired. Sign in again before using paired backups. Current input is preserved.',
        ),
        'backup_unavailable' => mbb_t(
            'This paired backup is unavailable or expired. Current input is preserved.',
        ),
    ];
    return mbb_error(
        $code,
        $messages[$code] ??
            mbb_t(
                'Paired backup verification failed. Current input is preserved; compare the article and try again.',
            ),
        $code === 'backup_auth_expired' ? 401 : ($code === 'backup_storage' ? 503 : 409),
    );
}
// A backup lock must never survive transparently onto a different database connection.
class MBB_Backup_DB extends wpdb
{
    public function check_connection($allow_bail = true)
    {
        return false;
    }
}
function mbb_backup_locked(callable $callback)
{
    global $wpdb;
    $original = $wpdb;
    if (
        get_class($original) !== 'wpdb' ||
        (defined('WP_CONTENT_DIR') && is_file(WP_CONTENT_DIR . '/db.php'))
    ) {
        return mbb_error(
            'backup_backend',
            mbb_t(
                'Paired backups require the core WordPress MySQL connection. Normal editing remains available.',
            ),
            503,
        );
    }
    $connection = new MBB_Backup_DB(DB_USER, DB_PASSWORD, DB_NAME, DB_HOST);
    $connection->set_prefix($original->base_prefix);
    $connection->set_blog_id(get_current_blog_id());
    $connection->suppress_errors(true);
    $name = 'mbb-backup-' . substr(hash('sha256', DB_NAME . ':' . $original->prefix), 0, 40);
    if (
        (string) $connection->get_var($connection->prepare('SELECT GET_LOCK(%s, 0)', $name)) !== '1'
    ) {
        $connection->close();
        return mbb_backup_error('backup_busy');
    }
    // Every option API write uses this same non-reconnecting connection until finally.
    $wpdb = $connection;
    // Long-running requests can retain an old positive or negative option cache.
    wp_cache_delete(MBB_BACKUP_INDEX, 'options');
    wp_cache_delete('notoptions', 'options');
    try {
        return $callback();
    } finally {
        $connection->get_var($connection->prepare('SELECT RELEASE_LOCK(%s)', $name));
        $wpdb = $original;
        $connection->close();
    }
}
function mbb_backup_index(): array
{
    $index = get_option(MBB_BACKUP_INDEX, []);
    return is_array($index) ? $index : [];
}
function mbb_backup_store_index(array $index): bool
{
    if (get_option(MBB_BACKUP_INDEX, null) === null) {
        return add_option(MBB_BACKUP_INDEX, $index, '', false);
    }
    return get_option(MBB_BACKUP_INDEX) === $index ||
        update_option(MBB_BACKUP_INDEX, $index, false);
}
function mbb_backup_prune(array &$index): void
{
    foreach ($index as $key => $entry) {
        wp_cache_delete($key, 'options');
        if (
            $entry['expires'] <= time() ||
            (empty($entry['ready']) && get_option($key, null) === null)
        ) {
            delete_option($key);
            if (get_option($key, null) === null) {
                unset($index[$key]);
            }
        } elseif (empty($entry['ready'])) {
            $index[$key]['ready'] = true;
        }
    }
    $groups = [];
    foreach ($index as $key => $entry) {
        wp_cache_delete($key, 'options');
        if (!empty($entry['ready'])) {
            $groups[$entry['user'] . ':' . $entry['post']][] = $key;
        }
    }
    foreach ($groups as $keys) {
        while (count($keys) > 10) {
            $key = array_shift($keys);
            delete_option($key);
            if (get_option($key, null) === null) {
                unset($index[$key]);
            }
        }
    }
}
function mbb_backup_context($request)
{
    $context = mbb_recovery_context($request);
    if (is_wp_error($context)) {
        return $context;
    }
    // New drafts keep browser recovery until they acquire a real article identity.
    if (!$context['postId']) {
        return mbb_backup_error('backup_article_required');
    }
    return $context;
}
function mbb_backup_fresh_context($request)
{
    $id = absint($request->get_param('post_id'));
    $user = get_current_user_id();
    if ($id) {
        clean_post_cache($id);
        wp_cache_delete($id, 'post_meta');
    }
    if ($user) {
        $roles = wp_roles();
        wp_cache_delete($roles->role_key, 'options');
        wp_cache_delete('alloptions', 'options');
        // for_site preserves legitimate in-memory role providers with use_db=false.
        $roles->for_site(get_current_blog_id());
        clean_user_cache($user);
        wp_cache_delete($user, 'user_meta');
        wp_set_current_user(0);
        wp_set_current_user($user);
        $token = wp_get_session_token();
        if ($token && !WP_Session_Tokens::get_instance($user)->verify($token)) {
            return mbb_backup_error('backup_auth_expired');
        }
    }
    clearstatcache();
    return mbb_backup_context($request);
}
function mbb_backup_same(array $a, array $b, bool $baseline = true): bool
{
    foreach (
        array_merge(
            ['siteKey', 'userKey', 'postId', 'identity', 'permission'],
            $baseline ? ['baseline'] : [],
        )
        as $key
    ) {
        if (($a[$key] ?? null) !== ($b[$key] ?? null)) {
            return false;
        }
    }
    return true;
}
function mbb_backup_endpoint($request)
{
    $context = mbb_backup_fresh_context($request);
    if (is_wp_error($context)) {
        return $context;
    }
    $action = $request->get_method();
    $candidate = null;
    if ($action === 'POST' && !$request->get_param('key')) {
        if (!mbb_backup_same((array) $request->get_param('context'), $context)) {
            return mbb_backup_error();
        }
        foreach (
            ['resource_import', 'resource_receipt', 'frontmatter_apply', 'new_blocks_original']
            as $name
        ) {
            if ($request->has_param($name)) {
                return mbb_backup_error('backup_input');
            }
        }
        if (
            !in_array($request['mode'], ['markdown', 'blocks'], true) ||
            !is_string($request['title']) ||
            strlen($request['title']) > 4096 ||
            !in_array($request['status'], ['draft', 'pending', 'private', 'publish'], true) ||
            !is_int($request['featured_media']) ||
            $request['featured_media'] < 0
        ) {
            return mbb_backup_error('backup_input');
        }
        $candidate = mbb_candidate($request);
        if (is_wp_error($candidate)) {
            return $candidate;
        }
        $doc = $candidate['document'];
        $verified = mbb_convert([
            'mode' => 'paired_restore',
            'source' => $doc['source'],
            'serialized' => $doc['serialized'],
            'documentId' => $doc['documentId'],
        ]);
        if (is_wp_error($verified) || strlen(wp_json_encode($doc)) > 786432) {
            return mbb_backup_error('backup_pair');
        }
    }
    return mbb_backup_locked(static function () use ($request, $context, $action, $candidate) {
        // Conversion may be slow: compare the original baseline again under the quota lock.
        $fresh = mbb_backup_fresh_context($request);
        if (is_wp_error($fresh)) {
            return $fresh;
        }
        if (!mbb_backup_same($fresh, $context)) {
            return mbb_backup_error();
        }
        $index = mbb_backup_index();
        mbb_backup_prune($index);
        if (!mbb_backup_store_index($index)) {
            return mbb_backup_error('backup_storage');
        }
        $owns = static fn($e) => $e['user'] === get_current_user_id() &&
            $e['post'] === $context['postId'];
        $key = $request->get_param('key');
        if ($key) {
            if (
                !is_string($key) ||
                !preg_match('/^_mbb_backup_[a-f0-9]{32}$/D', $key) ||
                !isset($index[$key]) ||
                !$owns($index[$key])
            ) {
                return mbb_backup_error('backup_unavailable');
            }
            if ($action === 'DELETE') {
                delete_option($key);
                if (get_option($key, null) !== null) {
                    return mbb_backup_error('backup_storage');
                }
                unset($index[$key]);
            } else {
                if (!mbb_backup_same((array) $request['context'], $context)) {
                    return mbb_backup_error();
                }
                wp_cache_delete($key, 'options');
                $record = get_option($key);
                if (
                    !is_array($record) ||
                    !mbb_backup_same($record['context'], $context, false) ||
                    ($context['sourceManaged'] &&
                        $record['context']['sourceDigest'] !== $context['sourceDigest'])
                ) {
                    // Identity and permissions remain mandatory even for an older baseline.
                    return mbb_backup_error();
                }
                $doc = $record['document'];
                $checked = mbb_convert([
                    'mode' => 'paired_restore',
                    'source' => $doc['source'],
                    'serialized' => $doc['serialized'],
                    'documentId' => $doc['documentId'],
                ]);
                if (is_wp_error($checked)) {
                    return $checked;
                }
                $final = mbb_backup_fresh_context($request);
                if (is_wp_error($final)) {
                    return $final;
                }
                if (!mbb_backup_same($context, $final)) {
                    return mbb_backup_error();
                }
                return $record + [
                    'currentContext' => $context,
                    'recordBaseline' => $record['context']['baseline'],
                    'currentBaseline' => $context['baseline'],
                    'stale' => $record['context']['baseline'] !== $context['baseline'],
                ];
            }
        } elseif ($candidate !== null) {
            $record = [
                'schema' => 1,
                'context' => $context,
                'document' => $candidate['document'],
                'kind' => $request['mode'],
                'payload' => [
                    'content' =>
                        $request['mode'] === 'blocks'
                            ? $candidate['document']['serialized']
                            : $candidate['document']['source'],
                    'title' => $request['title'],
                    'status' => $request['status'],
                    'documentId' => $candidate['document']['documentId'],
                    'featuredMedia' => $request['featured_media'],
                ],
                'created' => time(),
                'expires' => time() + MBB_BACKUP_TTL,
            ];
            $size = strlen(serialize($record));
            $mine = array_keys(array_filter($index, $owns));
            if (
                count($index) >= 4096 ||
                array_sum(array_column($index, 'bytes')) + $size > MBB_BACKUP_BYTES
            ) {
                mbb_backup_store_index($index);
                return mbb_backup_error('backup_quota');
            }
            $key = '_mbb_backup_' . bin2hex(random_bytes(16));
            $index[$key] = [
                'user' => get_current_user_id(),
                'post' => $context['postId'],
                'created' => $record['created'],
                'expires' => $record['expires'],
                'bytes' => $size,
                'baseline' => $context['baseline'],
                'kind' => $record['kind'],
                'ready' => false,
            ];
            // Reserve quota before the body write. A crash leaves a counted reservation, removed lazily.
            if (!mbb_backup_store_index($index) || !add_option($key, $record, '', false)) {
                return mbb_backup_error('backup_storage');
            }
            $index[$key]['ready'] = true;
            // Preserve all previous recovery points until the replacement body exists.
            while (count($mine) >= 10) {
                $old = array_shift($mine);
                delete_option($old);
                if (get_option($old, null) !== null) {
                    mbb_backup_store_index($index);
                    return mbb_backup_error('backup_storage');
                }
                unset($index[$old]);
            }
        }
        if (!mbb_backup_store_index($index)) {
            return mbb_backup_error('backup_storage');
        }
        $items = [];
        foreach ($index as $key => $entry) {
            if ($owns($entry)) {
                $items[] = [
                    'key' => $key,
                    'created' => $entry['created'],
                    'expires' => $entry['expires'],
                    'baseline' => $entry['baseline'],
                    'kind' => $entry['kind'],
                ];
            }
        }
        return [
            'context' => $context,
            'items' => array_reverse($items),
            'saved' => get_post($context['postId'])->post_modified_gmt,
        ];
    });
}
add_action('rest_api_init', static function () {
    register_rest_route('mbb/v1', '/paired-backups', [
        'methods' => ['GET', 'POST', 'DELETE'],
        'permission_callback' => 'mbb_recovery_permission',
        'callback' => 'mbb_backup_endpoint',
    ]);
});
