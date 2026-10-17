<?php
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
require_once __DIR__ . '/collections-data.php';
function mbb_collections_fail(string $code, int $status = 409): never
{
    throw new RuntimeException($code . ':' . $status);
}
function mbb_collections_owner(?int $expected = null): int
{
    mbb_references_fresh_user();
    $id = get_current_user_id();
    if (!$id || ($expected !== null && $id !== $expected) || !current_user_can('edit_posts')) {
        mbb_collections_fail('collection_unavailable', 404);
    }
    return $id;
}
function mbb_collections_session(): string
{
    return hash('sha256', get_current_user_id() . ':' . wp_get_session_token());
}
function mbb_collections_key(int $owner): string
{
    return 'mbb_collections_v1_' . $owner;
}
function mbb_collections_raw(string $key): ?string
{
    global $wpdb;
    $value = $wpdb->get_var(
        $wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name=%s", $key),
    );
    if ($wpdb->last_error) {
        mbb_collections_fail('collection_storage', 503);
    }
    return is_string($value) ? $value : null;
}
// No add_option/upsert and no cached get_option baseline. A reconnect can replay only the
// same exact-byte conditional operation; it cannot overwrite a newer catalog/generation.
function mbb_collections_cas(string $key, ?string $before, ?string $after): bool
{
    global $wpdb;
    if ($after !== null && strlen($after) > MBB_COLLECTION_LIMITS['catalogBytes']) {
        mbb_collections_fail('collection_quota', 413);
    }
    if ($before === $after) {
        return mbb_collections_raw($key) === $before;
    }
    if ($before === null) {
        $sql = $wpdb->prepare(
            "INSERT IGNORE INTO {$wpdb->options} (option_name,option_value,autoload) VALUES (%s,%s,'off')",
            $key,
            $after,
        );
    } elseif ($after === null) {
        $sql = $wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name=%s AND BINARY option_value=BINARY %s",
            $key,
            $before,
        );
    } else {
        $sql = $wpdb->prepare(
            "UPDATE {$wpdb->options} SET option_value=%s,autoload='off' WHERE option_name=%s AND BINARY option_value=BINARY %s",
            $after,
            $key,
            $before,
        );
    }
    $result = $wpdb->query($sql);
    wp_cache_delete($key, 'options');
    wp_cache_delete('notoptions', 'options');
    wp_cache_delete('alloptions', 'options');
    if ($result === false) {
        mbb_collections_fail('collection_storage', 503);
    }
    // Zero includes a lost race or an uncertain replay. Do not claim a successful write.
    return $result === 1;
}
function mbb_collections_catalog(int $owner): array
{
    $raw = mbb_collections_raw(mbb_collections_key($owner));
    if ($raw !== null && strlen($raw) > MBB_COLLECTION_LIMITS['catalogBytes']) {
        mbb_collections_fail('collection_storage', 503);
    }
    $data =
        $raw === null
            ? ['schema' => 1, 'items' => []]
            : json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    if (
        ($data['schema'] ?? null) !== 1 ||
        !is_array($data['items'] ?? null) ||
        count($data['items']) > MBB_COLLECTION_LIMITS['collections']
    ) {
        mbb_collections_fail('collection_storage', 503);
    }
    foreach ($data['items'] as $id => $config) {
        if (!mbb_collections_id($id)) {
            mbb_collections_fail('collection_storage', 503);
        }
        mbb_collections_config($config);
    }
    return [
        'raw' => $raw,
        'revision' => $raw === null ? null : hash('sha256', $raw),
        'data' => $data,
    ];
}
function mbb_collections_catalog_item(int $owner, string $id, mixed $revision): array
{
    $catalog = mbb_collections_catalog($owner);
    if (
        !is_string($revision) ||
        $catalog['revision'] !== $revision ||
        !isset($catalog['data']['items'][$id])
    ) {
        mbb_collections_fail('collection_changed');
    }
    return [
        'config' => mbb_collections_config($catalog['data']['items'][$id]),
        'revision' => $revision,
    ];
}
function mbb_collections_root(): string
{
    $path = mbb_resource_root() . '/collections-v1';
    if (is_link($path) || (!is_dir($path) && !@mkdir($path, 0700))) {
        mbb_collections_fail('collection_storage', 503);
    }
    mbb_resource_private_owner($path);
    if (realpath($path) !== $path || !chmod($path, 0700)) {
        mbb_collections_fail('collection_storage', 503);
    }
    return $path;
}
function mbb_collections_directory(string $token, bool $create = false): string
{
    if (!mbb_collections_token($token)) {
        mbb_collections_fail('collection_unavailable', 404);
    }
    $path = mbb_collections_root() . '/' . $token;
    if (is_link($path) || ($create && !is_dir($path) && !@mkdir($path, 0700))) {
        mbb_collections_fail('collection_storage', 503);
    }
    if (is_dir($path)) {
        mbb_resource_private_owner($path);
        if (realpath($path) !== $path) {
            mbb_collections_fail('collection_storage', 503);
        }
    }
    return $path;
}
function mbb_collections_remove(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    mbb_resource_private_owner($dir);
    $count = 0;
    // Only our fixed flat staging layout. Never follow symlinks or recurse through input paths.
    foreach (new DirectoryIterator($dir) as $entry) {
        if ($entry->isDot()) {
            continue;
        }
        if (++$count > 100 || $entry->isLink() || !$entry->isFile()) {
            mbb_collections_fail('collection_storage', 503);
        }
        mbb_resource_private_owner($entry->getPathname());
        if (!@unlink($entry->getPathname())) {
            mbb_collections_fail('collection_storage', 503);
        }
    }
    if (!@rmdir($dir)) {
        mbb_collections_fail('collection_storage', 503);
    }
}
function mbb_collections_jobs(): array
{
    $raw = mbb_collections_raw('mbb_collection_jobs_v1');
    if ($raw !== null && strlen($raw) > MBB_COLLECTION_LIMITS['catalogBytes']) {
        mbb_collections_fail('collection_storage', 503);
    }
    $jobs = $raw === null ? [] : json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($jobs) || count($jobs) > MBB_COLLECTION_LIMITS['siteJobs']) {
        mbb_collections_fail('collection_storage', 503);
    }
    foreach ($jobs as $token => $job) {
        if (
            !mbb_collections_token($token) ||
            !mbb_collections_closed($job, ['owner', 'session', 'expires', 'state']) ||
            !is_int($job['owner']) ||
            $job['owner'] < 1 ||
            !mbb_collections_token($job['session']) ||
            !is_int($job['expires']) ||
            !in_array($job['state'], ['preparing', 'ready', 'confirmed', 'downloading'], true)
        ) {
            mbb_collections_fail('collection_storage', 503);
        }
    }
    return [$raw, $jobs];
}
function mbb_collections_job_update(string $token, ?array $next, ?array $expected = null): bool
{
    for ($attempt = 0; $attempt < 8; $attempt++) {
        [$raw, $jobs] = mbb_collections_jobs();
        if ($expected !== null && ($jobs[$token] ?? null) !== $expected) {
            return false;
        }
        if ($next === null) {
            unset($jobs[$token]);
        } else {
            $jobs[$token] = $next;
        }
        if (mbb_collections_cas('mbb_collection_jobs_v1', $raw, mbb_collections_json($jobs))) {
            return true;
        }
    }
    mbb_collections_fail('collection_busy', 503);
}
function mbb_collections_cleanup(): void
{
    [, $jobs] = mbb_collections_jobs();
    foreach ($jobs as $token => $job) {
        if (!mbb_collections_token($token) || ($job['expires'] ?? PHP_INT_MAX) >= time()) {
            continue;
        }
        $dir = mbb_collections_directory($token);
        $lock = is_dir($dir) ? @fopen($dir . '/lock', 'c+b') : false;
        if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) {
            fclose($lock);
            continue;
        }
        try {
            if (is_dir($dir)) {
                mbb_collections_remove($dir);
            }
            mbb_collections_job_update($token, null, $job);
        } finally {
            if ($lock) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        }
    }
}
function mbb_collections_reserve(int $owner, string $token): array
{
    mbb_collections_cleanup();
    for ($attempt = 0; $attempt < 8; $attempt++) {
        [$raw, $jobs] = mbb_collections_jobs();
        if (
            count($jobs) >= MBB_COLLECTION_LIMITS['siteJobs'] ||
            count(array_filter($jobs, fn($j) => $j['owner'] === $owner)) >=
                MBB_COLLECTION_LIMITS['ownerJobs']
        ) {
            mbb_collections_fail('collection_quota', 413);
        }
        $job = [
            'owner' => $owner,
            'session' => mbb_collections_session(),
            'expires' => time() + MBB_COLLECTION_LIMITS['ttlSeconds'],
            'state' => 'preparing',
        ];
        $jobs[$token] = $job;
        if (mbb_collections_cas('mbb_collection_jobs_v1', $raw, mbb_collections_json($jobs))) {
            return $job;
        }
    }
    mbb_collections_fail('collection_busy', 503);
}
function mbb_collections_lock(string $token): array
{
    mbb_collections_owner();
    [, $jobs] = mbb_collections_jobs();
    $job = $jobs[$token] ?? null;
    if (
        !$job ||
        $job['owner'] !== get_current_user_id() ||
        $job['session'] !== mbb_collections_session() ||
        $job['expires'] < time()
    ) {
        mbb_collections_fail('collection_unavailable', 404);
    }
    $dir = mbb_collections_directory($token);
    if (!is_dir($dir) || is_link($dir . '/lock')) {
        mbb_collections_fail('collection_unavailable', 404);
    }
    $lock = @fopen($dir . '/lock', 'r+b');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        if ($lock) {
            fclose($lock);
        }
        mbb_collections_fail('collection_busy', 503);
    }
    [, $fresh] = mbb_collections_jobs();
    if (($fresh[$token] ?? null) !== $job) {
        flock($lock, LOCK_UN);
        fclose($lock);
        mbb_collections_fail('collection_changed');
    }
    return [$job, $dir, $lock];
}
