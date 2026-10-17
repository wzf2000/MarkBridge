<?php
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
require_once __DIR__ . '/references-data.php';
require_once __DIR__ . '/references-store.php';
function mbb_references_readable($post): bool
{
    if (
        !$post ||
        !in_array($post->post_type, ['post', 'page'], true) ||
        !mbb_managed($post->ID) ||
        in_array($post->post_status, ['trash', 'auto-draft'], true)
    ) {
        return false;
    }
    if ($post->post_status === 'publish') {
        return !post_password_required($post) || current_user_can('edit_post', $post->ID);
    }
    if (!current_user_can('read_post', $post->ID) || post_password_required($post)) {
        return current_user_can('edit_post', $post->ID);
    }
    $type = get_post_type_object($post->post_type);
    return current_user_can('edit_post', $post->ID) ||
        ($post->post_status === 'private' && current_user_can($type->cap->read_private_posts));
}
function mbb_references_snapshot(int $id, bool $edit = false): array
{
    mbb_references_fresh_user();
    $post = mbb_references_fresh_post($id);
    if (!mbb_references_readable($post) || ($edit && !current_user_can('edit_post', $id))) {
        mbb_references_fail('reference_unavailable', 'This article is unavailable.', 404);
    }
    $hash = mbb_references_pair_hash($post);
    $cacheKey = $id . ':' . $hash . ':' . mbb_id($id) . ':' . mbb_block_adapter_digest();
    $pair =
        $GLOBALS['mbb_reference_pairs'][$cacheKey] ??
        mbb_convert([
            'mode' => 'paired_restore',
            'source' => $post->post_content_filtered,
            'serialized' => $post->post_content,
            'documentId' => mbb_id($id),
        ]);
    if (!is_wp_error($pair)) {
        if (count($GLOBALS['mbb_reference_pairs'] ?? []) >= 32) {
            $GLOBALS['mbb_reference_pairs'] = [];
        }
        $GLOBALS['mbb_reference_pairs'][$cacheKey] = $pair;
    }
    if (is_wp_error($pair)) {
        mbb_references_fail('reference_unavailable', 'This article is unavailable.', 404);
    }
    $projection = mbb_references_projection($post->post_content);
    mbb_references_fresh_user();
    $fresh = mbb_references_fresh_post($id);
    if (
        !mbb_references_readable($fresh) ||
        ($edit && !current_user_can('edit_post', $id)) ||
        !hash_equals($hash, mbb_references_pair_hash($fresh))
    ) {
        mbb_references_fail('reference_unavailable', 'This article is unavailable.', 404);
    }
    return [
        'post' => $fresh,
        'document' => $pair,
        'projection' => $projection,
        'hash' => $hash,
        'expected' => mbb_token($fresh),
    ];
}
function mbb_references_resolve(array $target): array
{
    $unavailable = ['state' => 'unavailable'];
    if (!mbb_references_target($target)) {
        return $unavailable;
    }
    global $wpdb;
    $t = mbb_references_tables();
    $control = mbb_references_control();
    if (!$control || $control['state'] !== 'ready') {
        return $unavailable;
    }
    $row = $wpdb->get_row(
        $wpdb->prepare(
            "SELECT post_id,pair_hash FROM {$t['claims']} WHERE generation=%d AND namespace_key=%s AND document_key=%s",
            $control['active_generation'],
            $target['namespace'],
            $target['document'],
        ),
        ARRAY_A,
    );
    if (!$row) {
        return $unavailable;
    }
    try {
        $snapshot = mbb_references_snapshot((int) $row['post_id']);
        $p = $snapshot['post'];
        if (
            !hash_equals($row['pair_hash'], $snapshot['hash']) ||
            $snapshot['projection']['identity'] !== [
                'namespace' => $target['namespace'],
                'document' => $target['document'],
            ]
        ) {
            return $unavailable;
        }
        $object = $snapshot['projection']['objects'][$target['target']] ?? null;
        if (!$object || $object['kind'] !== $target['kind']) {
            return $unavailable;
        }
        return [
            'state' => 'available',
            'title' => $object['title'],
            'article' => $p->post_title,
            'label' =>
                ($object['displayKind'] === 'step'
                    ? mbb_t('Stage')
                    : mbb_technical_label($object['displayKind'])) .
                ' ' .
                $object['number'],
            'url' =>
                ($p->post_status === 'publish' ? get_permalink($p) : get_preview_post_link($p)) .
                '#' .
                rawurlencode($target['target']),
            'post_id' => (int) $p->ID,
            'expected' => $snapshot['expected'],
            'pair_hash' => $snapshot['hash'],
        ];
    } catch (Throwable $e) {
        return $unavailable;
    }
}
function mbb_references_operation_owner(): string
{
    return hash('sha256', get_current_user_id() . ':' . wp_get_session_token());
}
function mbb_references_receipt(array $claims): string
{
    $json = wp_json_encode($claims);
    return rtrim(strtr(base64_encode($json), '+/', '-_'), '=') .
        '.' .
        hash_hmac('sha256', $json, wp_salt('auth'));
}
function mbb_references_operation(string $receipt): array
{
    $parts = explode('.', $receipt);
    if (count($parts) !== 2 || strlen($receipt) > 4096) {
        mbb_references_fail(
            'identity_receipt',
            'Prepare the identity operation again. Current input is preserved.',
        );
    }
    $json = base64_decode(strtr($parts[0], '-_', '+/'), true);
    $claims = is_string($json) ? json_decode($json, true) : null;
    if (
        !is_array($claims) ||
        !hash_equals(hash_hmac('sha256', $json, wp_salt('auth')), $parts[1]) ||
        ($claims['expires'] ?? 0) < time() ||
        ($claims['owner'] ?? '') !== mbb_references_operation_owner()
    ) {
        mbb_references_fail(
            'identity_receipt',
            'Prepare the identity operation again. Current input is preserved.',
        );
    }
    return $claims;
}
function mbb_references_verify_operation($request, int $id, array $identity): void
{
    $claims = mbb_references_operation(
        (string) ($request['identity_receipt'] ?? ($request['mbb_identity_receipt'] ?? '')),
    );
    if (
        ($claims['post_id'] ?? null) !== $id ||
        ($claims['identity'] ?? null) !== $identity ||
        ($claims['expected'] ?? null) !==
            ($request['expected'] ?? ($request['mbb_expected'] ?? null))
    ) {
        mbb_references_fail(
            'identity_receipt',
            'Prepare the identity operation again. Current input is preserved.',
        );
    }
}
function mbb_references_source_digest($post): ?string
{
    if (!$post || get_post_meta($post->ID, '_mbb_source_managed', true) !== 'file') {
        return null;
    }
    $target = mbb_source_target($post);
    if (is_wp_error($target)) {
        mbb_references_fail(
            'source_conflict',
            'The source binding or content changed. Read it again before synchronization.',
        );
    }
    $fingerprint = mbb_source_fingerprint($target);
    if (is_wp_error($fingerprint)) {
        mbb_references_fail(
            'source_conflict',
            'The source binding or content changed. Read it again before synchronization.',
        );
    }
    return $fingerprint['sha256'];
}
function mbb_references_prepare($r)
{
    try {
        if (strlen((string) $r->get_body()) > 1500000) {
            mbb_references_fail(
                'reference_input',
                'The reference operation input is invalid.',
                422,
            );
        }
        $action = $r['action'];
        $id = absint($r['post_id']);
        $snapshot = $id ? mbb_references_snapshot($id, true) : null;
        if (
            $snapshot &&
            (!is_string($r['expected']) || !hash_equals($snapshot['expected'], $r['expected']))
        ) {
            mbb_references_fail(
                'conflict',
                'The article has newer changes. Reload and merge them.',
            );
        }
        $openingSource = mbb_references_source_digest($snapshot['post'] ?? null);
        if ($openingSource !== null && ($r['source_sha256'] ?? null) !== $openingSource) {
            mbb_references_fail(
                'source_conflict',
                'The source binding or content changed. Read it again before synchronization.',
            );
        }
        $newId = $id;
        $expected = $snapshot['expected'] ?? null;
        $docId = $id ? mbb_id($id) : $r['documentId'] ?? 'Reference' . bin2hex(random_bytes(12));
        $source = $r['source'] ?? ($snapshot['document']['source'] ?? null);
        if (!is_string($source) || strlen($source) > 262144) {
            mbb_references_fail(
                'reference_input',
                'The reference operation input is invalid.',
                422,
            );
        }
        $pair = mbb_convert(['mode' => 'markdown', 'source' => $source, 'documentId' => $docId]);
        if (is_wp_error($pair)) {
            return $pair;
        }
        $projection = mbb_references_projection($pair['serialized']);
        $old = $projection['identity'];
        if (
            ($r['allow_no_identity'] ?? false) === true &&
            in_array($action, ['import-copy', 'migrate'], true) &&
            (!$old || ($snapshot['projection']['identity'] ?? null) === $old)
        ) {
            return ['unchanged' => true];
        }
        $control = mbb_references_control();
        if (
            !$control ||
            ($control['state'] !== 'ready' &&
                !(
                    $control['state'] === 'conflict' &&
                    $action === 'repair-copy' &&
                    current_user_can('manage_options')
                ))
        ) {
            mbb_references_fail(
                'reference_uninitialized',
                'The reference index is not ready. An administrator can initialize or rebuild it.',
                503,
            );
        }

        $next = [
            'namespace' => $control['site_namespace'],
            'document' => 'D_' . bin2hex(random_bytes(16)),
        ];
        if ($action === 'enable') {
            if ($snapshot['projection']['identity'] ?? null) {
                mbb_references_fail(
                    'identity_exists',
                    'This article already has a logical identity.',
                );
            }
            if ($old) {
                mbb_references_fail(
                    'identity_input',
                    'Choose explicit migration or prepare a copy for an existing identity.',
                    422,
                );
            }
        } elseif ($action === 'import-copy') {
            if (!$old || ($snapshot['projection']['identity'] ?? null)) {
                mbb_references_fail(
                    'identity_input',
                    'Choose explicit migration or prepare a copy for an existing identity.',
                    422,
                );
            }
            $source = mbb_references_replace_tuple($source, $old, $next);
        } elseif ($action === 'copy') {
            $newId = 0;
            $expected = null;
            $docId = $id ? 'Reference' . bin2hex(random_bytes(12)) : $docId;
            if ($old) {
                $source = mbb_references_replace_tuple($source, $old, $next);
            }
        } elseif ($action === 'repair-copy') {
            if (
                !$snapshot ||
                !$old ||
                $old !== $snapshot['projection']['identity'] ||
                !current_user_can('manage_options') ||
                $control['state'] !== 'conflict'
            ) {
                mbb_references_fail(
                    'identity_input',
                    'Conflict repair requires an administrator and the unchanged article identity.',
                    422,
                );
            }
            $source = mbb_references_replace_tuple($source, $old, $next);
        } elseif ($action === 'migrate') {
            if (!$old || ($snapshot['projection']['identity'] ?? null)) {
                mbb_references_fail(
                    'identity_input',
                    'Migration requires an explicit unclaimed identity candidate.',
                    422,
                );
            }
            $next = $old;
        } elseif ($action === 'adopt-history') {
            if (!$snapshot || !$snapshot['projection']['identity']) {
                mbb_references_fail(
                    'identity_input',
                    'This article has no current logical identity.',
                    422,
                );
            }
            $revision = mbb_revision_candidate($r, $snapshot['post']);
            if (is_wp_error($revision)) {
                return $revision;
            }
            $source = $revision['document']['source'];
            $projection = mbb_references_projection($revision['document']['serialized']);
            if ($projection['identity']) {
                mbb_references_fail(
                    'identity_input',
                    'Use the exact revision workflow when its logical identity is unchanged.',
                    422,
                );
            }
            $next = $snapshot['projection']['identity'];
        } else {
            mbb_references_fail(
                'reference_input',
                'The reference operation input is invalid.',
                422,
            );
        }
        if (!$old || $action === 'adopt-history') {
            $source = mbb_references_insert_identity($source, $next);
        }
        $pair = mbb_convert(['mode' => 'markdown', 'source' => $source, 'documentId' => $docId]);
        if (is_wp_error($pair)) {
            return $pair;
        }
        $claims = [
            'post_id' => $newId,
            'expected' => $expected,
            'identity' => $next,
            'owner' => mbb_references_operation_owner(),
            'expires' => time() + 900,
            'source_sha256' => hash('sha256', $pair['source']),
            'action' => $action,
            'previous_identity' => $snapshot['projection']['identity'] ?? null,
            'revision_id' => $action === 'adopt-history' ? absint($r['revision_id']) : null,
        ];
        if ($snapshot) {
            $fresh = mbb_references_snapshot($id, true);
            if ($fresh['expected'] !== $snapshot['expected']) {
                mbb_references_fail(
                    'conflict',
                    'The article has newer changes. Reload and merge them.',
                );
            }
        }
        if (
            $snapshot &&
            mbb_references_source_digest(mbb_references_fresh_post($id)) !== $openingSource
        ) {
            mbb_references_fail(
                'source_conflict',
                'The source binding or content changed. Read it again before synchronization.',
            );
        }
        $sourceHash = $newId ? $openingSource : null;
        return [
            'post_id' => $newId,
            'expected' => $expected,
            'document' => $pair,
            'identity_receipt' => mbb_references_receipt($claims),
            'action' => $action,
            'title' => $snapshot['post']->post_title ?? mbb_t('New draft'),
            'post_status' => $newId ? $snapshot['post']->post_status : 'draft',
            'source_sha256' => $sourceHash,
        ];
    } catch (Throwable $e) {
        return mbb_references_error($e);
    }
}
function mbb_references_status(int $postId = 0): array
{
    global $wpdb;
    $supported =
        !empty($GLOBALS['mbb_reference_connection']) ||
        (get_class($wpdb) === 'wpdb' &&
            !(defined('WP_CONTENT_DIR') && is_file(WP_CONTENT_DIR . '/db.php')));
    $control = $supported ? mbb_references_control() : null;
    $result = [
        'state' => $supported ? $control['state'] ?? 'uninitialized' : 'unsupported',
        'schema' => 1,
    ];
    if (!$supported) {
        $result['message'] = mbb_t(
            'Cross-document identities require the core WordPress transactional database connection. Legacy editing remains available.',
        );
    }
    if ($postId) {
        try {
            $snapshot = mbb_references_snapshot($postId, true);
            $result['identity'] = $snapshot['projection']['identity'];
        } catch (Throwable $e) {
            $result['identity'] = null;
        }
    }
    if (current_user_can('manage_options')) {
        $result['generation'] = (int) ($control['active_generation'] ?? 0);
        $result['cursor'] = (int) ($control['cursor_id'] ?? 0);
        $result['can_manage'] = true;
        $error = (int) ($control['error_post'] ?? 0);
        if ($error && current_user_can('edit_post', $error)) {
            $result['conflict_post_id'] = $error;
        }
    }
    return $result;
}
function mbb_references_private($value)
{
    if (is_wp_error($value)) {
        return $value;
    }
    $response = rest_ensure_response($value);
    $response->header('Cache-Control', 'private, no-store, max-age=0');
    $response->header('Vary', 'Cookie');
    return $response;
}
function mbb_references_final(int $id, string $hash, bool $edit = false): bool
{
    mbb_references_fresh_user();
    $post = mbb_references_fresh_post($id);
    return mbb_references_readable($post) &&
        (!$edit || current_user_can('edit_post', $id)) &&
        hash_equals($hash, mbb_references_pair_hash($post));
}
function mbb_references_search($r)
{
    try {
        global $wpdb;
        $control = mbb_references_control();
        if (!$control || $control['state'] !== 'ready') {
            return [
                'items' => [],
                'cursor' => null,
                'state' => $control['state'] ?? 'uninitialized',
            ];
        }
        $query = $r['q'] ?? '';
        if (!is_string($query) || strlen($query) > 200) {
            mbb_references_fail(
                'reference_input',
                'The reference operation input is invalid.',
                422,
            );
        }
        $after = 0;
        if ($r['cursor']) {
            $claims = mbb_references_operation($r['cursor']);
            if (($claims['action'] ?? null) !== 'search' || ($claims['query'] ?? null) !== $query) {
                mbb_references_fail(
                    'reference_input',
                    'The reference operation input is invalid.',
                    422,
                );
            }
            $after = (int) $claims['after'];
        }
        // Bound work, but never expose whether inaccessible rows filled the scan window.
        // Pagination exists only when one more currently readable article has been found.
        $t = mbb_references_tables();
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT post_id,pair_hash,namespace_key,document_key FROM {$t['claims']} WHERE generation=%d AND post_id>%d ORDER BY post_id LIMIT 1000",
                $control['active_generation'],
                $after,
            ),
        );
        $articles = [];
        foreach ($rows as $row) {
            try {
                $id = (int) $row->post_id;
                mbb_references_fresh_user();
                $post = mbb_references_fresh_post($id);
                if (
                    !mbb_references_readable($post) ||
                    ($query !== '' && stripos($post->post_title, $query) === false)
                ) {
                    continue;
                }
                $snapshot = mbb_references_snapshot($id);
                if (
                    !hash_equals($row->pair_hash, $snapshot['hash']) ||
                    $snapshot['projection']['identity'] !== [
                        'namespace' => $row->namespace_key,
                        'document' => $row->document_key,
                    ]
                ) {
                    continue;
                }
                if ($query !== '' && stripos($snapshot['post']->post_title, $query) === false) {
                    continue;
                }
                if (!$snapshot['projection']['identity'] || !$snapshot['projection']['objects']) {
                    continue;
                }
                $articles[] = $snapshot;
                if (count($articles) === 21) {
                    break;
                }
            } catch (Throwable $e) {
                continue;
            }
        }
        $articles = array_values(
            array_filter(
                $articles,
                static fn($s) => mbb_references_final((int) $s['post']->ID, $s['hash']),
            ),
        );
        $more = count($articles) > 20;
        $items = [];
        $after = 0;
        foreach (array_slice($articles, 0, 20) as $snapshot) {
            $after = (int) $snapshot['post']->ID;
            foreach (array_slice($snapshot['projection']['objects'], 0, 100) as $object) {
                $target = $snapshot['projection']['identity'] + [
                    'target' => $object['id'],
                    'kind' => $object['kind'],
                ];
                $items[] = [
                    'target' => $target,
                    'title' => $object['title'],
                    'article' => $snapshot['post']->post_title,
                    'label' =>
                        ($object['displayKind'] === 'step'
                            ? mbb_t('Stage')
                            : mbb_technical_label($object['displayKind'])) .
                        ' ' .
                        $object['number'],
                ];
            }
        }
        return [
            'items' => $items,
            'cursor' => $more
                ? mbb_references_receipt([
                    'owner' => mbb_references_operation_owner(),
                    'expires' => time() + 900,
                    'action' => 'search',
                    'query' => $query,
                    'after' => $after,
                ])
                : null,
            'state' => 'ready',
            'bounded' => true,
        ];
    } catch (Throwable $e) {
        return mbb_references_error($e);
    }
}
function mbb_references_incoming(array $target): array
{
    if (
        !mbb_references_target($target) ||
        mbb_references_resolve($target)['state'] !== 'available'
    ) {
        return ['state' => 'unavailable'];
    }
    global $wpdb;
    $control = mbb_references_control();
    $t = mbb_references_tables();
    $rows = $wpdb->get_col(
        $wpdb->prepare(
            "SELECT DISTINCT post_id FROM {$t['edges']} WHERE generation=%d AND namespace_key=%s AND document_key=%s AND target_key=%s AND kind=%s ORDER BY post_id LIMIT 101",
            $control['active_generation'],
            $target['namespace'],
            $target['document'],
            $target['target'],
            $target['kind'],
        ),
    );
    $items = [];
    foreach (array_slice($rows, 0, 100) as $id) {
        try {
            $snapshot = mbb_references_snapshot((int) $id);
            if (!in_array($target, $snapshot['projection']['edges'], true)) {
                continue;
            }
            $post = $snapshot['post'];
            $items[] = [
                'post_id' => (int) $id,
                'title' => $post->post_title,
                'url' =>
                    $post->post_status === 'publish'
                        ? get_permalink($post)
                        : get_preview_post_link($post),
                '_hash' => $snapshot['hash'],
            ];
        } catch (Throwable $e) {
            continue;
        }
    }
    $items = array_values(
        array_filter(
            $items,
            static fn($item) => mbb_references_final($item['post_id'], $item['_hash']),
        ),
    );
    foreach ($items as &$item) {
        unset($item['_hash']);
    }
    unset($item);
    // Recheck target after resolving all source articles; never expose hidden incoming counts.
    return mbb_references_resolve($target)['state'] === 'available'
        ? ['state' => 'available', 'items' => $items, 'bounded' => true]
        : ['state' => 'unavailable'];
}
function mbb_references_impact($r)
{
    try {
        $snapshot = mbb_references_snapshot(absint($r['post_id']), true);
        if (!is_string($r['expected']) || $r['expected'] !== $snapshot['expected']) {
            mbb_references_fail(
                'conflict',
                'The article has newer changes. Reload and merge them.',
            );
        }
        $source = $r['source'];
        if (!is_string($source) || strlen($source) > 262144) {
            mbb_references_fail(
                'reference_input',
                'The reference operation input is invalid.',
                422,
            );
        }
        $pair = mbb_convert([
            'mode' => 'markdown',
            'source' => $source,
            'documentId' => mbb_id($snapshot['post']->ID),
        ]);
        if (is_wp_error($pair)) {
            return $pair;
        }
        $next = mbb_references_projection($pair['serialized']);
        $changes = [];
        if ($snapshot['projection']['identity']) {
            foreach ($snapshot['projection']['objects'] as $id => $object) {
                if (
                    !isset($next['objects'][$id]) ||
                    $next['objects'][$id]['kind'] !== $object['kind']
                ) {
                    $target = $snapshot['projection']['identity'] + [
                        'target' => $id,
                        'kind' => $object['kind'],
                    ];
                    $changes[] = [
                        'target' => $target,
                        'incoming' => mbb_references_incoming($target),
                    ];
                }
            }
        }
        $fresh = mbb_references_snapshot((int) $snapshot['post']->ID, true);
        if ($fresh['expected'] !== $snapshot['expected']) {
            mbb_references_fail(
                'conflict',
                'The article has newer changes. Reload and merge them.',
            );
        }
        return ['changes' => $changes, 'bounded' => true];
    } catch (Throwable $e) {
        return mbb_references_error($e);
    }
}
function mbb_references_permission($r)
{
    mbb_references_fresh_user();
    if (!is_user_logged_in()) {
        return mbb_error(
            'reference_auth_expired',
            mbb_t('Refresh or sign in again to verify recovery permissions.'),
            401,
        );
    }
    $id = absint($r['post_id']);
    if ($id) {
        $post = mbb_references_fresh_post($id);
        if (!$post || !mbb_managed($id) || !current_user_can('edit_post', $id)) {
            return mbb_error('reference_unavailable', mbb_t('This article is unavailable.'), 404);
        }
    } elseif (!current_user_can('edit_posts') && !current_user_can('edit_pages')) {
        return mbb_error('reference_unavailable', mbb_t('This article is unavailable.'), 404);
    }
    return true;
}
function mbb_references_admin_permission($r)
{
    $permission = mbb_references_permission($r);
    return $permission === true && !current_user_can('manage_options')
        ? mbb_error('forbidden', mbb_t('Administrator permission is required.'), 403)
        : $permission;
}
add_action('rest_api_init', static function () {
    foreach (
        [
            'status' => [
                'GET',
                'mbb_references_permission',
                static fn($r) => mbb_references_status(absint($r['post_id'])),
            ],
            'manage' => [
                'POST',
                'mbb_references_admin_permission',
                static function ($r) {
                    if ($r['action'] === 'initialize') {
                        return mbb_references_initialize();
                    }
                    if (in_array($r['action'], ['rebuild', 'resume', 'restart'], true)) {
                        return mbb_references_rebuild_batch($r['action'] === 'restart');
                    }
                    return mbb_error(
                        'reference_input',
                        mbb_t('The reference operation input is invalid.'),
                        422,
                    );
                },
            ],
            'prepare' => ['POST', 'mbb_references_permission', 'mbb_references_prepare'],
            'search' => ['GET', 'mbb_references_permission', 'mbb_references_search'],
            'resolve' => [
                'POST',
                '__return_true',
                static function ($r) {
                    if (strlen((string) $r->get_body()) > 32768) {
                        return mbb_error(
                            'reference_input',
                            mbb_t('The reference operation input is invalid.'),
                            422,
                        );
                    }
                    $targets = $r['targets'];
                    if (!is_array($targets) || count($targets) > 32 || !array_is_list($targets)) {
                        return mbb_error(
                            'reference_input',
                            mbb_t('The reference operation input is invalid.'),
                            422,
                        );
                    }
                    $items = [];
                    foreach ($targets as $target) {
                        $items[] = is_array($target)
                            ? mbb_references_resolve($target)
                            : ['state' => 'unavailable'];
                    }
                    foreach ($items as &$item) {
                        if (
                            ($item['state'] ?? '') === 'available' &&
                            !mbb_references_final($item['post_id'], $item['pair_hash'])
                        ) {
                            $item = ['state' => 'unavailable'];
                        }
                    }
                    unset($item);
                    return ['items' => $items];
                },
            ],
            'incoming' => [
                'GET',
                'mbb_references_permission',
                static fn($r) => mbb_references_incoming([
                    'namespace' => $r['namespace'],
                    'document' => $r['document'],
                    'target' => $r['target'],
                    'kind' => $r['kind'],
                ]),
            ],
            'impact' => ['POST', 'mbb_references_permission', 'mbb_references_impact'],
        ]
        as $name => [$methods, $permission, $callback]
    ) {
        register_rest_route('mbb/v1', '/references/' . $name, [
            'methods' => $methods,
            'permission_callback' => $permission,
            'callback' => static fn($r) => mbb_references_private($callback($r)),
        ]);
    }
});
// Activation is bounded. Administrators can resume, rebuild or repair through the Tools screen.
register_activation_hook(__DIR__ . '/markdown-block-bridge.php', static function () {
    mbb_references_initialize();
});
add_filter('mbb_admin_settings_tabs', static function ($tabs) {
    $tabs['references'] = [
        'label' => mbb_t('Document references'),
        'render' => 'mbb_references_admin_page',
    ];
    return $tabs;
});
function mbb_references_admin_page(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }
    if (isset($_POST['mbb_reference_action'])) {
        check_admin_referer('mbb_references_manage');
        $action = sanitize_key($_POST['mbb_reference_action']);
        $result =
            $action === 'initialize'
                ? mbb_references_initialize()
                : mbb_references_rebuild_batch($action === 'restart');
        echo '<div class="notice notice-info"><p>' .
            esc_html(
                is_wp_error($result)
                    ? $result->get_error_message()
                    : mbb_t('Reference index operation completed.'),
            ) .
            '</p></div>';
    }
    $status = mbb_references_status();
    echo '<div class="mbb-reference-settings"><h2>' .
        esc_html(mbb_t('Document references')) .
        '</h2><p>' .
        esc_html(
            mbb_t(
                'Only derived identifiers are indexed. Existing article bodies are never changed by initialization or rebuild.',
            ),
        ) .
        '</p><p>' .
        esc_html(mbb_t('Index status')) .
        ': ' .
        esc_html($status['state']) .
        '</p>';
    if (!empty($status['conflict_post_id'])) {
        echo '<p><a href="' .
            esc_url(get_edit_post_link($status['conflict_post_id'])) .
            '">' .
            esc_html(mbb_t('Review the conflicting article and prepare a new identity.')) .
            '</a></p>';
    }
    echo '<form method="post">';
    wp_nonce_field('mbb_references_manage');
    foreach (
        [
            'initialize' => 'Initialize',
            'resume' => 'Continue rebuild',
            'restart' => 'Restart rebuild',
        ]
        as $value => $label
    ) {
        echo '<button class="button" name="mbb_reference_action" value="' .
            esc_attr($value) .
            '">' .
            esc_html(mbb_t($label)) .
            '</button> ';
    }
    echo '</form><p>' .
        esc_html(
            mbb_t(
                'Each operation processes at most ten articles. Continue until ready; no background job is scheduled.',
            ),
        ) .
        '</p></div>';
}
function mbb_references_enqueue(): void
{
    wp_enqueue_script(
        'mbb-references-ui',
        plugins_url(mbb_asset('references-ui.js'), __FILE__),
        ['mbb-i18n'],
        substr(hash_file('sha256', __DIR__ . '/references-ui.js'), 0, 12),
        true,
    );
    wp_add_inline_script(
        'mbb-references-ui',
        'window.MBB_REFERENCES=' .
            wp_json_encode([
                'url' => rest_url('mbb/v1/__route__'),
                'ajax' => admin_url('admin-ajax.php'),
                'manageUrl' => admin_url('options-general.php?page=markbridge&tab=references'),
            ]) .
            ';',
        'before',
    );
}
add_action(
    'admin_enqueue_scripts',
    static function () {
        $screen = get_current_screen();
        if (
            $screen &&
            (in_array($screen->base, ['post', 'post-new'], true) ||
                $screen->id === 'tools_page_mbb-editor')
        ) {
            mbb_references_enqueue();
        }
    },
    5,
);
add_action('wp_enqueue_scripts', static function () {
    if (
        is_singular() &&
        mbb_managed(get_queried_object_id()) &&
        str_contains(
            (string) get_post_field('post_content', get_queried_object_id()),
            'data-mbb-version="2"',
        )
    ) {
        mbb_references_enqueue();
    }
});
function mbb_references_nonce(): void
{
    nocache_headers();
    wp_send_json(['nonce' => is_user_logged_in() ? wp_create_nonce('wp_rest') : null]);
}
add_action('wp_ajax_mbb_reference_nonce', 'mbb_references_nonce');
add_action('wp_ajax_nopriv_mbb_reference_nonce', 'mbb_references_nonce');
function mbb_references_export_map(string $serialized): array
{
    $projection = mbb_references_projection($serialized);
    $map = [];
    foreach ($projection['edges'] as $target) {
        $resolved = mbb_references_resolve($target);
        if ($resolved['state'] === 'available') {
            $map[] = ['target' => $target, 'resolved' => $resolved];
        } else {
            $map[] = ['target' => $target, 'resolved' => ['state' => 'unavailable']];
        }
    }
    foreach ($map as &$item) {
        $resolved = $item['resolved'];
        if (
            $resolved['state'] === 'available' &&
            !mbb_references_final($resolved['post_id'], $resolved['pair_hash'])
        ) {
            mbb_export_throw(
                'export_scope',
                mbb_t('Reference permissions changed. Prepare the export again.'),
            );
        }
    }
    unset($item);
    return $map;
}
function mbb_references_static_links(string $html, array $mapping): string
{
    [$doc, $xpath, $root] = mbb_static_export_fragment($html);
    $map = [];
    foreach ($mapping as $item) {
        $map[wp_json_encode($item['target'])] = $item['resolved'];
    }
    foreach (
        iterator_to_array(
            $xpath->query('.//span[@class="mbb-xref" and @data-mbb-version="2"]', $root),
        )
        as $span
    ) {
        $target = [
            'namespace' => $span->getAttribute('data-mbb-namespace'),
            'document' => $span->getAttribute('data-mbb-document'),
            'target' => $span->getAttribute('data-mbb-target'),
            'kind' => $span->getAttribute('data-mbb-kind'),
        ];
        $resolved = $map[wp_json_encode($target)] ?? ['state' => 'unavailable'];
        if ($resolved['state'] === 'available') {
            $link = $doc->createElement('a');
            $link->setAttribute('href', $resolved['url']);
            $link->setAttribute('rel', 'noreferrer noopener');
            $link->appendChild($doc->createTextNode($resolved['label']));
            $span->parentNode->replaceChild($link, $span);
        } else {
            $span->parentNode->replaceChild(
                $doc->createTextNode('[' . $target['target'] . ']'),
                $span,
            );
        }
    }
    $html = '';
    foreach ($root->childNodes as $child) {
        $html .= $doc->saveHTML($child);
    }
    return $html;
}
function mbb_references_provenance($request, int $id, array $document, int $revision): void
{
    if (empty($request['identity_receipt'])) {
        return;
    }
    $claims = mbb_references_operation($request['identity_receipt']);
    if (($claims['action'] ?? '') !== 'adopt-history') {
        return;
    }
    mbb_references_verify_operation(
        $request,
        $id,
        mbb_references_projection($document['serialized'])['identity'],
    );
    // Distinct from exact restoration. Later author edits retain candidate provenance only.
    if (
        !update_metadata(
            'post',
            $revision,
            '_mbb_copied_from_revision',
            (int) $claims['revision_id'],
        )
    ) {
        mbb_references_fail(
            'reference_provenance',
            'The history candidate provenance could not be saved.',
        );
    }
}
add_filter(
    'rest_post_dispatch',
    static function ($response, $server, $request) {
        if (str_starts_with($request->get_route(), '/mbb/v1/references/')) {
            $response = rest_ensure_response($response);
            $response->header('Cache-Control', 'private, no-store, max-age=0');
            $response->header('Vary', 'Cookie');
        }
        return $response;
    },
    10,
    3,
);
function mbb_references_batch_prepare(string $dir, array &$record): void
{
    $mappings = [];
    $seen = [];
    $control = mbb_references_control();
    foreach ($record['items'] as $item) {
        if ($item['state'] !== 'ready' || empty($item['originalIdentity'])) {
            continue;
        }
        if (!$control || $control['state'] !== 'ready') {
            mbb_batch_throw(
                'identity',
                mbb_t(
                    'The reference index is not ready. An administrator can initialize or rebuild it.',
                ),
            );
        }
        $old = $item['originalIdentity'];
        $key = $old['namespace'] . '/' . $old['document'];
        if (isset($seen[$key])) {
            mbb_batch_throw(
                'identity',
                mbb_t(
                    'Selected files repeat a logical identity. Correct the ambiguous originals before preparing the batch.',
                ),
            );
        }
        $seen[$key] = true;
        $next =
            ($record['identityStrategy'] ?? 'copy') === 'migrate'
                ? $old
                : [
                    'namespace' => $control['site_namespace'],
                    'document' => 'D_' . bin2hex(random_bytes(16)),
                ];
        $mappings[] = ['before' => $old, 'after' => $next];
    }
    $record['identityMappings'] = $mappings;
    if (!$mappings) {
        return;
    }
    foreach ($record['items'] as $i => &$item) {
        if ($item['state'] !== 'ready') {
            continue;
        }
        $source = mbb_batch_source($dir, $i, $item);
        $mapped = mbb_references_replace_tuples($source, $mappings);
        if (strlen($mapped) > 262144) {
            mbb_batch_throw(
                'identity',
                mbb_t('The transformed reference candidate exceeds the existing document budget.'),
            );
        }
        $path = $dir . '/item-' . $i . '/source.md';
        if (file_put_contents($path, $mapped) !== strlen($mapped) || !chmod($path, 0600)) {
            mbb_batch_throw('storage', mbb_t('The staged source could not be written.'));
        }
        $item['sourceSha256'] = hash('sha256', $mapped);
        if ($item['originalIdentity']) {
            foreach ($mappings as $mapping) {
                if ($mapping['before'] === $item['originalIdentity']) {
                    $item['logicalIdentity'] = $mapping['after'];
                }
            }
        }
    }
    unset($item);
}
