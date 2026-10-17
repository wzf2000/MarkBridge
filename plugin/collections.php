<?php
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
require_once __DIR__ . '/collections-snapshot.php';
function mbb_collections_error(Throwable $e)
{
    $parts = explode(':', $e->getMessage());
    $code = $parts[0];
    $messages = [
        'collection_unavailable' => mbb_t(
            'This collection operation is unavailable. Sign in again or refresh your collection list.',
        ),
        'collection_changed' => mbb_t(
            'The collection, article, permissions, or resources changed. Prepare a new snapshot; saved articles are unchanged.',
        ),
        'collection_quota' => mbb_t(
            'The collection budget is full. Cancel an unused candidate or reduce the selected articles or images. Saved articles are unchanged.',
        ),
        'collection_busy' => mbb_t('This collection candidate is busy. Try again shortly.'),
        'collection_storage' => mbb_t(
            'Private collection storage is unavailable. Refresh before retrying; no successful operation was reported.',
        ),
        'collection_scope' => mbb_t(
            'Select editable public articles without passwords, or explicitly include selected private drafts. Password-protected articles are not supported.',
        ),
        'collection_media' => mbb_t(
            'Every local image must be a readable attachment of its selected article. External images remain links and are not fetched.',
        ),
        'collection_identity' => mbb_t(
            'Two selected articles declare the same logical identity. Resolve the identity conflict before preparing.',
        ),
        'collection_empty' => mbb_t('Select at least one article before preparing a snapshot.'),
        'collection_adapter' => mbb_t('The selected publication adapter is unavailable.'),
        'collection_input' => mbb_t(
            'The collection input is invalid. Current fields are preserved.',
        ),
        'collection_companion' => mbb_t(
            'Companion series import is unavailable or exceeds the bounded candidate list. Select articles manually.',
        ),
    ];
    $status = isset($parts[1]) && ctype_digit($parts[1]) ? (int) $parts[1] : 422;
    return mbb_error(
        isset($messages[$code]) ? $code : 'collection_input',
        $messages[$code] ?? $messages['collection_input'],
        $status,
    );
}
function mbb_collections_input($r, array $keys): array
{
    $data = $r->get_json_params();
    if (!mbb_collections_closed($data, $keys) || ($data['schema'] ?? null) !== 1) {
        mbb_collections_fail('collection_input', 422);
    }
    return $data;
}
function mbb_collections_context(): array
{
    $owner = mbb_collections_owner();
    $catalog = mbb_collections_catalog($owner);
    $items = [];
    foreach ($catalog['data']['items'] as $id => $config) {
        mbb_collections_config($config);
        $items[] = [
            'id' => $id,
            'title' => $config['title'],
            'chapters' => count($config['chapters']),
            'privateOptIn' => $config['privateOptIn'],
        ];
    }
    mbb_collections_owner($owner);
    return [
        'schema' => 1,
        'revision' => $catalog['revision'],
        'items' => $items,
        'limits' => MBB_COLLECTION_LIMITS,
        'adapters' => array_map(
            fn($p) => array_intersect_key(
                $p,
                array_flip(['contract', 'version', 'fingerprint', 'title', 'extension', 'mime']),
            ),
            $GLOBALS['mbb_publication_adapters'] ?? [],
        ),
    ];
}
function mbb_collections_list($r)
{
    try {
        mbb_collections_cleanup();
        return mbb_collections_context();
    } catch (Throwable $e) {
        return mbb_collections_error($e);
    }
}
function mbb_collections_summaries(array $config): array
{
    $items = [];
    foreach ($config['chapters'] as $chapter) {
        mbb_references_fresh_user();
        $p = mbb_references_fresh_post($chapter['post_id']);
        $item = ['key' => $chapter['key'], 'state' => 'unavailable'];
        if (
            $p &&
            mbb_managed($p->ID) &&
            current_user_can('edit_post', $p->ID) &&
            $p->post_password === '' &&
            in_array($p->post_status, ['publish', 'draft', 'pending', 'private', 'future'], true)
        ) {
            $item += ['title' => $p->post_title, 'status' => $p->post_status];
            $item['state'] = 'available';
        }
        $items[] = $item;
    }
    foreach ($items as &$item) {
        if ($item['state'] !== 'available') {
            continue;
        }
        $chapter =
            $config['chapters'][
                array_search($item['key'], array_column($config['chapters'], 'key'), true)
            ];
        mbb_references_fresh_user();
        $p = mbb_references_fresh_post($chapter['post_id']);
        if (
            !$p ||
            !current_user_can('edit_post', $p->ID) ||
            !mbb_managed($p->ID) ||
            $p->post_password !== '' ||
            $p->post_title !== $item['title'] ||
            $p->post_status !== $item['status']
        ) {
            $item = ['key' => $item['key'], 'state' => 'unavailable'];
        }
    }
    unset($item);
    return $items;
}
function mbb_collections_get($r)
{
    try {
        $owner = mbb_collections_owner();
        $catalog = mbb_collections_catalog($owner);
        $config = $catalog['data']['items'][$r['collection_id']] ?? null;
        if (!$config) {
            mbb_collections_fail('collection_unavailable', 404);
        }
        $summaries = mbb_collections_summaries($config);
        mbb_collections_owner($owner);
        return [
            'schema' => 1,
            'collection_id' => $r['collection_id'],
            'revision' => $catalog['revision'],
            'config' => mbb_collections_config($config),
            'chapterSummaries' => $summaries,
        ];
    } catch (Throwable $e) {
        return mbb_collections_error($e);
    }
}
function mbb_collections_save($r)
{
    try {
        $owner = mbb_collections_owner();
        $data = mbb_collections_input($r, ['schema', 'revision', 'collection_id', 'config']);
        if ($data['collection_id'] !== null && !mbb_collections_id($data['collection_id'])) {
            mbb_collections_fail('collection_input', 422);
        }
        $config = mbb_collections_config($data['config']);
        $catalog = mbb_collections_catalog($owner);
        if ($catalog['revision'] !== $data['revision']) {
            mbb_collections_fail('collection_changed');
        }
        $id = $data['collection_id'] ?? 'B_' . bin2hex(random_bytes(16));
        if ($data['collection_id'] !== null && !isset($catalog['data']['items'][$id])) {
            mbb_collections_fail('collection_unavailable', 404);
        }
        if (
            !isset($catalog['data']['items'][$id]) &&
            count($catalog['data']['items']) >= MBB_COLLECTION_LIMITS['collections']
        ) {
            mbb_collections_fail('collection_quota', 413);
        }
        // A config is a reference record, not a grant. Validate current selected scope before committing it.
        $stamps = [];
        foreach ($config['chapters'] as $chapter) {
            $s = mbb_collections_post($chapter['post_id'], $config['privateOptIn']);
            $stamps[] = mbb_collections_stamp($s);
            unset($s);
        }
        if ($config['cover']) {
            mbb_collections_cover($config['cover'], array_column($config['chapters'], 'post_id'));
        }
        $catalog['data']['items'][$id] = $config;
        $json = mbb_collections_json($catalog['data']);
        mbb_collections_owner($owner);
        foreach ($stamps as $stamp) {
            if (!mbb_collections_final_stamp($stamp, true, $config['privateOptIn'])) {
                mbb_collections_fail('collection_changed');
            }
        }
        if (!mbb_collections_cas(mbb_collections_key($owner), $catalog['raw'], $json)) {
            mbb_collections_fail('collection_changed');
        }
        $summaries = mbb_collections_summaries($config);
        mbb_collections_owner($owner);
        return [
            'schema' => 1,
            'collection_id' => $id,
            'revision' => hash('sha256', $json),
            'config' => $config,
            'chapterSummaries' => $summaries,
        ];
    } catch (Throwable $e) {
        return mbb_collections_error($e);
    }
}
function mbb_collections_delete($r)
{
    try {
        $owner = mbb_collections_owner();
        $data = mbb_collections_input($r, ['schema', 'revision']);
        $catalog = mbb_collections_catalog($owner);
        if ($catalog['revision'] !== $data['revision']) {
            mbb_collections_fail('collection_changed');
        }
        if (!isset($catalog['data']['items'][$r['collection_id']])) {
            mbb_collections_fail('collection_unavailable', 404);
        }
        unset($catalog['data']['items'][$r['collection_id']]);
        mbb_collections_owner($owner);
        if (
            !mbb_collections_cas(
                mbb_collections_key($owner),
                $catalog['raw'],
                mbb_collections_json($catalog['data']),
            )
        ) {
            mbb_collections_fail('collection_changed');
        }
        return mbb_collections_context();
    } catch (Throwable $e) {
        return mbb_collections_error($e);
    }
}
function mbb_collections_candidates(string $query = ''): array
{
    if (strlen($query) > 200 || !mb_check_encoding($query, 'UTF-8')) {
        mbb_collections_fail('collection_input', 422);
    }
    $posts = get_posts([
        'post_type' => ['post', 'page'],
        'post_status' => ['publish', 'draft', 'pending', 'private', 'future'],
        'posts_per_page' => 201,
        's' => $query,
        'author' => current_user_can('edit_others_posts') ? '' : get_current_user_id(),
        'meta_key' => '_mbb_origin',
        'meta_value' => 'markdown_import',
        'orderby' => 'ID',
        'order' => 'ASC',
        'no_found_rows' => true,
        'cache_results' => false,
    ]);
    $items = [];
    foreach ($posts as $post) {
        mbb_references_fresh_user();
        $p = mbb_references_fresh_post((int) $post->ID);
        if (
            $p &&
            mbb_managed($p->ID) &&
            $p->post_password === '' &&
            current_user_can('edit_post', $p->ID)
        ) {
            $items[] = [
                'post_id' => (int) $p->ID,
                'title' => $p->post_title,
                'status' => $p->post_status,
            ];
        }
    }
    return $items;
}
function mbb_collections_search($r)
{
    try {
        $owner = mbb_collections_owner();
        $query = $r['q'] ?? '';
        $page = $r['page'] ?? '1';
        if (!is_string($query) || !is_string($page) || !preg_match('/^[1-9][0-9]?$/D', $page)) {
            mbb_collections_fail('collection_input', 422);
        }
        $items = mbb_collections_candidates($query);
        $slice = array_slice($items, ((int) $page - 1) * 20, 20);
        foreach ($slice as $item) {
            $p = mbb_references_fresh_post($item['post_id']);
            mbb_references_fresh_user();
            if (
                !$p ||
                !current_user_can('edit_post', $p->ID) ||
                $p->post_title !== $item['title'] ||
                $p->post_password !== ''
            ) {
                mbb_collections_fail('collection_changed');
            }
        }
        mbb_collections_owner($owner);
        return [
            'items' => $slice,
            'nextPage' => count($items) > (int) $page * 20 ? (int) $page + 1 : null,
            'bounded' => true,
        ];
    } catch (Throwable $e) {
        return mbb_collections_error($e);
    }
}
function mbb_collections_import_companion($r)
{
    try {
        $owner = mbb_collections_owner();
        $data = mbb_collections_input($r, ['schema', 'post_id']);
        if (
            !is_int($data['post_id']) ||
            $data['post_id'] < 1 ||
            !function_exists('pagenest_companion_post_setting') ||
            !function_exists('pagenest_companion_config') ||
            !function_exists('pagenest_companion_feature') ||
            !pagenest_companion_feature('chapters')
        ) {
            mbb_collections_fail('collection_companion', 422);
        }
        $s = mbb_collections_post($data['post_id'], false);
        $title = $s['post']->post_title;
        $stamps = [$data['post_id'] => mbb_collections_stamp($s)];
        unset($s);
        $settings = pagenest_companion_config('chapters');
        $series = (string) pagenest_companion_post_setting($data['post_id'], 'series');
        $documentMeta = $settings['document_meta'] ?? '';
        if (
            !is_string($documentMeta) ||
            strlen($documentMeta) > 200 ||
            ($series === '' && get_post_meta($data['post_id'], $documentMeta, true) === '')
        ) {
            mbb_collections_fail('collection_companion', 422);
        }
        // Public bounded candidates only, followed by the exact Companion rank/order/doc-id tie break.
        $all = get_posts([
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => 201,
            'meta_key' => '_mbb_origin',
            'meta_value' => 'markdown_import',
            'orderby' => 'ID',
            'order' => 'ASC',
            'no_found_rows' => true,
            'cache_results' => false,
        ]);
        if (count($all) > 200) {
            mbb_collections_fail('collection_companion', 422);
        }
        $items = [];
        $rank = array_flip($settings['series_order'] ?? []);
        foreach ($all as $candidate) {
            $p = mbb_references_fresh_post((int) $candidate->ID);
            mbb_references_fresh_user();
            if (
                !$p ||
                $p->post_password !== '' ||
                !current_user_can('edit_post', $p->ID) ||
                !mbb_managed($p->ID) ||
                ($series !== '' &&
                    (string) pagenest_companion_post_setting($p->ID, 'series') !== $series)
            ) {
                continue;
            }
            $doc = (string) get_post_meta($p->ID, $documentMeta, true);
            if ($series === '' && !metadata_exists('post', $p->ID, $documentMeta)) {
                continue;
            }
            $items[] = [
                'id' => (int) $p->ID,
                'doc' => $doc,
                'rank' => $rank[$doc] ?? PHP_INT_MAX,
                'order' => pagenest_companion_post_setting($p->ID, 'order'),
            ];
        }
        usort($items, static function ($a, $b) {
            return $a['rank'] <=> $b['rank'] ?:
                (is_numeric($a['order']) && is_numeric($b['order']) && $a['order'] != $b['order']
                    ? (float) $a['order'] <=> (float) $b['order']
                    : (strcmp($a['doc'], $b['doc']) ?:
                        $a['id'] <=> $b['id']));
        });
        if (!$items || count($items) > MBB_COLLECTION_LIMITS['chapters']) {
            mbb_collections_fail('collection_companion', 422);
        }
        $config = [
            'schema' => 1,
            'title' => $title,
            'lang' => str_replace('_', '-', get_locale()),
            'rights' => '',
            'cover' => null,
            'privateOptIn' => false,
            'chapters' => array_map(
                fn($item) => ['key' => 'C_' . bin2hex(random_bytes(16)), 'post_id' => $item['id']],
                $items,
            ),
        ];
        foreach ($config['chapters'] as $chapter) {
            $s = mbb_collections_post($chapter['post_id'], false);
            $stamps[$chapter['post_id']] = mbb_collections_stamp($s);
            unset($s);
        }
        mbb_collections_owner($owner);
        foreach ($stamps as $stamp) {
            if (!mbb_collections_final_stamp($stamp, true, false)) {
                mbb_collections_fail('collection_changed');
            }
        }
        return ['schema' => 1, 'config' => mbb_collections_config($config), 'importedOnce' => true];
    } catch (Throwable $e) {
        return mbb_collections_error($e);
    }
}
function mbb_collections_receipt(string $token, array $job, string $sha): string
{
    return hash_hmac(
        'sha256',
        mbb_collections_json([$token, $job['owner'], $job['session'], $job['expires'], $sha]),
        wp_salt('auth'),
    );
}
function mbb_collections_record(string $dir): array
{
    $path = $dir . '/record.json';
    if (is_link($path) || !is_file($path) || filesize($path) > 1048576) {
        mbb_collections_fail('collection_storage', 503);
    }
    mbb_resource_private_owner($path);
    return json_decode(file_get_contents($path), true, 32, JSON_THROW_ON_ERROR);
}
function mbb_collections_verify(array $record): array
{
    $owner = mbb_collections_owner($record['snapshot']['owner']);
    if ($record['snapshot']['session'] !== mbb_collections_session()) {
        mbb_collections_fail('collection_unavailable', 404);
    }
    $item = mbb_collections_catalog_item($owner, $record['collection_id'], $record['revision']);
    if ($item['config'] !== $record['config']) {
        mbb_collections_fail('collection_changed');
    }
    $fresh = mbb_collections_snapshot($record['config'], $record['adapter']);
    if (!hash_equals($record['snapshot']['sha256'], $fresh['sha256'])) {
        mbb_collections_fail('collection_changed');
    }
    mbb_collections_catalog_item($owner, $record['collection_id'], $record['revision']);
    mbb_collections_final($fresh, $record['config'], $record['adapter']);
    return $fresh;
}
function mbb_collections_prepare($r)
{
    $lock = null;
    $token = null;
    $job = null;
    try {
        $owner = mbb_collections_owner();
        $data = mbb_collections_input($r, ['schema', 'collection_id', 'revision', 'adapter']);
        if (
            !mbb_collections_id($data['collection_id']) ||
            !is_string($data['adapter']) ||
            !isset($GLOBALS['mbb_publication_adapters'][$data['adapter']]) ||
            !class_exists('ZipArchive') ||
            !class_exists('Normalizer') ||
            !function_exists('posix_geteuid')
        ) {
            mbb_collections_fail('collection_adapter', 503);
        }
        $item = mbb_collections_catalog_item($owner, $data['collection_id'], $data['revision']);
        $token = bin2hex(random_bytes(32));
        $job = mbb_collections_reserve($owner, $token);
        $dir = mbb_collections_directory($token, true);
        $lock = fopen($dir . '/lock', 'x+b');
        if (!$lock || !chmod($dir . '/lock', 0600) || !flock($lock, LOCK_EX | LOCK_NB)) {
            mbb_collections_fail('collection_storage', 503);
        }
        $snapshot = mbb_collections_snapshot($item['config'], $data['adapter'], $dir);
        $manifest = $snapshot['manifest'];
        unset($snapshot['manifest']);
        $record = [
            'schema' => 1,
            'collection_id' => $data['collection_id'],
            'revision' => $data['revision'],
            'config' => $item['config'],
            'adapter' => $data['adapter'],
            'snapshot' => $snapshot,
        ];
        $provider = $GLOBALS['mbb_publication_adapters'][$data['adapter']];
        $paths = ['manifest.json' => 'manifest.json', 'styles/reading.css' => 'reading.css'];
        foreach ($manifest['chapters'] as $chapter) {
            $paths[$chapter['path']] = basename($chapter['path']);
        }
        foreach ($manifest['resources'] as $resource) {
            $paths[$resource['path']] = basename($resource['path']);
        }
        $read = static function (string $path) use ($paths, $dir): string {
            if (!isset($paths[$path])) {
                mbb_collections_fail('collection_input', 422);
            }
            return $dir . '/' . $paths[$path];
        };
        // Trusted adapters receive a manifest copy, a fixed read-only path allowlist, and one output path.
        $provider['build']($manifest, $read, $dir . '/artifact');
        if (
            is_link($dir . '/artifact') ||
            !is_file($dir . '/artifact') ||
            filesize($dir . '/artifact') < 1 ||
            filesize($dir . '/artifact') > MBB_COLLECTION_LIMITS['artifactBytes']
        ) {
            mbb_collections_fail('collection_quota', 413);
        }
        mbb_resource_private_owner($dir . '/artifact');
        chmod($dir . '/artifact', 0600);
        $record['artifact'] = [
            'bytes' => filesize($dir . '/artifact'),
            'sha256' => hash_file('sha256', $dir . '/artifact'),
            'extension' => $provider['extension'],
            'mime' => $provider['mime'],
        ];
        $json = mbb_collections_json($record);
        if (strlen($json) > 1048576) {
            mbb_collections_fail('collection_quota', 413);
        }
        mbb_collections_write($dir . '/record.json', $json);
        mbb_collections_verify($record);
        if ($job['expires'] < time()) {
            mbb_collections_fail('collection_changed');
        }
        $ready = $job;
        $ready['state'] = 'ready';
        if (!mbb_collections_job_update($token, $ready, $job)) {
            mbb_collections_fail('collection_changed');
        }
        $job = $ready;
        return [
            'schema' => 1,
            'token' => $token,
            'expires' => $job['expires'],
            'receipt' => mbb_collections_receipt($token, $job, $snapshot['sha256']),
            'snapshot_sha256' => $snapshot['sha256'],
            'artifact' => $record['artifact'],
            'scope' => array_map(
                fn($c) => array_intersect_key(
                    $c,
                    array_flip(['key', 'title', 'scope', 'documentId']),
                ),
                $manifest['chapters'],
            ),
            'resourceCount' => count($manifest['resources']),
            'resourceBytes' => array_sum(array_column($manifest['resources'], 'bytes')),
            'limits' => MBB_COLLECTION_LIMITS,
        ];
    } catch (Throwable $e) {
        if ($token && $job) {
            try {
                if (isset($dir) && is_dir($dir)) {
                    mbb_collections_remove($dir);
                }
                mbb_collections_job_update($token, null, $job);
            } catch (Throwable $ignored) {
            }
        }
        return mbb_collections_error($e);
    } finally {
        if (is_resource($lock)) {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
function mbb_collections_claim($r, string $operation)
{
    $lock = null;
    $handle = null;
    try {
        $data = mbb_collections_input($r, ['schema', 'receipt']);
        if (!is_string($data['receipt']) || !mbb_collections_token($data['receipt'])) {
            mbb_collections_fail('collection_input', 422);
        }
        $token = $r['token'];
        [$job, $dir, $lock] = mbb_collections_lock($token);
        $record = mbb_collections_record($dir);
        if (
            !hash_equals(
                mbb_collections_receipt($token, $job, $record['snapshot']['sha256']),
                $data['receipt'],
            ) ||
            !in_array($job['state'], ['ready', 'confirmed'], true)
        ) {
            mbb_collections_fail('collection_changed');
        }
        $fresh = mbb_collections_verify($record);
        if ($job['expires'] < time()) {
            mbb_collections_fail('collection_changed');
        }
        if ($operation === 'confirm') {
            $next = $job;
            $next['state'] = 'confirmed';
            if (!mbb_collections_job_update($token, $next, $job)) {
                mbb_collections_fail('collection_changed');
            }
            return [
                'schema' => 1,
                'confirmed' => true,
                'snapshot_sha256' => $fresh['sha256'],
                'expires' => $job['expires'],
            ];
        }
        if ($job['state'] !== 'confirmed') {
            mbb_collections_fail('collection_changed');
        }
        $path = $dir . '/artifact';
        if (is_link($path) || !is_file($path) || filesize($path) !== $record['artifact']['bytes']) {
            mbb_collections_fail('collection_changed');
        }
        $handle = fopen($path, 'rb');
        if (!$handle) {
            mbb_collections_fail('collection_storage', 503);
        }
        $hash = hash_init('sha256');
        hash_update_stream($hash, $handle);
        if (!hash_equals($record['artifact']['sha256'], hash_final($hash)) || !rewind($handle)) {
            mbb_collections_fail('collection_changed');
        }
        // After hashing the private artifact, repeat final data/session checks before the first byte.
        mbb_collections_catalog_item($job['owner'], $record['collection_id'], $record['revision']);
        mbb_collections_final($fresh, $record['config'], $record['adapter']);
        if ($job['expires'] < time()) {
            mbb_collections_fail('collection_changed');
        }
        $downloading = $job;
        $downloading['state'] = 'downloading';
        if (!mbb_collections_job_update($token, $downloading, $job)) {
            mbb_collections_fail('collection_changed');
        }
        $response = new WP_REST_Response(null, 200, [
            'Content-Type' => $record['artifact']['mime'],
            'Content-Length' => (string) $record['artifact']['bytes'],
            'Content-Disposition' =>
                'attachment; filename="markbridge-collection.' .
                $record['artifact']['extension'] .
                '"',
            'X-Content-Type-Options' => 'nosniff',
            'X-MBB-Collection' => '1',
            'Cache-Control' => 'private, no-store, max-age=0',
            'Vary' => 'Cookie',
        ]);
        $GLOBALS['mbb_collection_downloads'][spl_object_id($response)] = [
            'handle' => $handle,
            'dir' => $dir,
            'lock' => $lock,
            'token' => $token,
            'job' => $downloading,
            'record' => $record,
            'fresh' => $fresh,
        ];
        register_shutdown_function(static function () use ($response) {
            mbb_collections_finish_download(spl_object_id($response));
        });
        $handle = null;
        $lock = null;
        return $response;
    } catch (Throwable $e) {
        return mbb_collections_error($e);
    } finally {
        if (is_resource($handle)) {
            fclose($handle);
        }
        if (is_resource($lock)) {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
function mbb_collections_cancel($r)
{
    $lock = null;
    try {
        [$job, $dir, $lock] = mbb_collections_lock($r['token']);
        mbb_collections_remove($dir);
        if (!mbb_collections_job_update($r['token'], null, $job)) {
            mbb_collections_fail('collection_changed');
        }
        return ['cancelled' => true];
    } catch (Throwable $e) {
        return mbb_collections_error($e);
    } finally {
        if (is_resource($lock)) {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
add_action('rest_api_init', static function () {
    $permission = static function () {
        try {
            mbb_collections_owner();
            return true;
        } catch (Throwable $e) {
            return mbb_collections_error($e);
        }
    };
    foreach (
        [
            ['/collections', 'GET', 'mbb_collections_list'],
            ['/collections', 'POST', 'mbb_collections_save'],
            ['/collections/(?P<collection_id>B_[a-f0-9]{32})', 'GET', 'mbb_collections_get'],
            ['/collections/(?P<collection_id>B_[a-f0-9]{32})', 'DELETE', 'mbb_collections_delete'],
            ['/collections/search', 'GET', 'mbb_collections_search'],
            ['/collections/import-companion', 'POST', 'mbb_collections_import_companion'],
            ['/collections/prepare', 'POST', 'mbb_collections_prepare'],
            ['/collections/jobs/(?P<token>[a-f0-9]{64})', 'DELETE', 'mbb_collections_cancel'],
        ]
        as [$route, $method, $callback]
    ) {
        register_rest_route('mbb/v1', $route, [
            'methods' => $method,
            'permission_callback' => $permission,
            'callback' => $callback,
        ]);
    }
    foreach (['confirm', 'download'] as $operation) {
        register_rest_route('mbb/v1', '/collections/jobs/(?P<token>[a-f0-9]{64})/' . $operation, [
            'methods' => 'POST',
            'permission_callback' => $permission,
            'callback' => static fn($r) => mbb_collections_claim($r, $operation),
        ]);
    }
});
add_filter(
    'rest_post_dispatch',
    static function ($response, $server, $request) {
        if (str_starts_with($request->get_route(), '/mbb/v1/collections')) {
            $response = rest_ensure_response($response);
            $response->header('Cache-Control', 'private, no-store, max-age=0');
            $response->header('Vary', 'Cookie');
        }
        return $response;
    },
    10,
    3,
);
function mbb_collections_finish_download(int $id): void
{
    $stream = $GLOBALS['mbb_collection_downloads'][$id] ?? null;
    if (!$stream) {
        return;
    }
    unset($GLOBALS['mbb_collection_downloads'][$id]);
    try {
        fclose($stream['handle']);
        mbb_collections_remove($stream['dir']);
        mbb_collections_job_update($stream['token'], null, $stream['job']);
    } catch (Throwable $ignored) {
        /* A retained bounded slot is lazily reclaimed after expiry. */
    } finally {
        flock($stream['lock'], LOCK_UN);
        fclose($stream['lock']);
    }
}
function mbb_collections_serve($served, $response, $request, $server)
{
    if (
        $served ||
        !str_starts_with($request->get_route(), '/mbb/v1/collections/jobs/') ||
        !($response instanceof WP_REST_Response) ||
        ($response->get_headers()['X-MBB-Collection'] ?? '') !== '1'
    ) {
        return $served;
    }
    $id = spl_object_id($response);
    $stream = $GLOBALS['mbb_collection_downloads'][$id] ?? null;
    if (!$stream) {
        return $served;
    }
    try {
        // WP's post-dispatch and earlier pre-serve filters run after the callback. This
        // is the authorization boundary immediately before the first artifact byte.
        mbb_collections_owner($stream['job']['owner']);
        [, $jobs] = mbb_collections_jobs();
        if (
            ($jobs[$stream['token']] ?? null) !== $stream['job'] ||
            $stream['job']['expires'] < time() ||
            $stream['job']['session'] !== mbb_collections_session()
        ) {
            mbb_collections_fail('collection_changed');
        }
        mbb_collections_catalog_item(
            $stream['job']['owner'],
            $stream['record']['collection_id'],
            $stream['record']['revision'],
        );
        mbb_collections_final(
            $stream['fresh'],
            $stream['record']['config'],
            $stream['record']['adapter'],
        );
        // Rehash the already-open descriptor as well: the staging pathname may not be
        // reopened or substituted between verification and the streaming handoff.
        if (!rewind($stream['handle'])) {
            mbb_collections_fail('collection_changed');
        }
        $hash = hash_init('sha256');
        hash_update_stream($hash, $stream['handle']);
        if (
            !hash_equals($stream['record']['artifact']['sha256'], hash_final($hash)) ||
            !rewind($stream['handle'])
        ) {
            mbb_collections_fail('collection_changed');
        }
        mbb_collections_final(
            $stream['fresh'],
            $stream['record']['config'],
            $stream['record']['adapter'],
        );
        if ($stream['job']['expires'] < time()) {
            mbb_collections_fail('collection_changed');
        }
    } catch (Throwable $e) {
        $failure = rest_convert_error_to_response(mbb_collections_error($e));
        $headers = $response->get_headers();
        foreach (['Content-Length', 'Content-Disposition', 'X-MBB-Collection'] as $name) {
            unset($headers[$name]);
            if (!headers_sent()) {
                header_remove($name);
            }
        }
        $headers['Content-Type'] = 'application/json; charset=UTF-8';
        $response->set_headers($headers);
        $response->set_status($failure->get_status());
        $response->set_data($failure->get_data());
        if (!headers_sent()) {
            status_header($failure->get_status());
            foreach ($headers as $name => $value) {
                header($name . ': ' . $value);
            }
        }
        try {
            echo mbb_collections_json($failure->get_data());
        } finally {
            mbb_collections_finish_download($id);
        }
        return true;
    }
    try {
        while (!feof($stream['handle'])) {
            $bytes = fread($stream['handle'], 65536);
            if ($bytes === false) {
                break;
            }
            echo $bytes;
        }
    } finally {
        mbb_collections_finish_download($id);
    }
    return true;
}
add_filter('rest_pre_serve_request', 'mbb_collections_serve', 10, 4);
require_once __DIR__ . '/collections-admin.php';

// Bound the raw body before core JSON parameter decoding, as well as the closed fields.
add_filter(
    'rest_pre_dispatch',
    static function ($result, $server, $request) {
        if (
            str_starts_with($request->get_route(), '/mbb/v1/collections') &&
            strlen($request->get_body()) > 20480
        ) {
            return mbb_collections_error(new RuntimeException('collection_quota:413'));
        }
        return $result;
    },
    5,
    3,
);
