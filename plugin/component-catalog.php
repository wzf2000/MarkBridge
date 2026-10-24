<?php
// Trusted local indexes contain data only. Factories and filesystem paths never cross the API.
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
const MBB_COMPONENT_CATALOG_LIMITS = [
    'keys' => 256,
    'types' => 64,
    'versions' => 64,
    'indexBytes' => 131072,
    'declarationBytes' => 32768,
    'pageSize' => 20,
    'pageMax' => 50,
    'pageBytes' => 32768,
    'descriptorBytes' => 65536,
    'documentKeys' => 32,
    'documentBytes' => 524288,
    'requestBytes' => 4194304,
];
function markbridge_teaching_supports_component_catalog(): bool
{
    return true;
}
function mbb_component_canonical(mixed $value): mixed
{
    if (is_object($value)) {
        $fields = get_object_vars($value);
        ksort($fields, SORT_STRING);
        foreach ($fields as &$v) {
            $v = mbb_component_canonical($v);
        }
        return (object) $fields;
    }
    if (is_array($value)) {
        if (!array_is_list($value)) {
            ksort($value, SORT_STRING);
        }
        foreach ($value as &$v) {
            $v = mbb_component_canonical($v);
        }
    }
    return $value;
}
/** Portable definition pin: only declared provider data, never deployment paths or status. */
function markbridge_teaching_component_fingerprint(string $id, array $provider): string
{
    $data = array_intersect_key(
        $provider,
        array_flip([
            'version',
            'title',
            'schema',
            'defaults',
            'protocolVersion',
            'minMarkBridge',
            'budgets',
            'supportsUiLocale',
            'readerMode',
            'activityVersion',
            'executionProfile',
        ]),
    );
    // Defaults are JSON objects both before and after the existing registration normalizer.
    if (
        isset($data['defaults']) &&
        is_array($data['defaults']) &&
        !array_is_list($data['defaults'])
    ) {
        $data['defaults'] = (object) $data['defaults'];
    }
    if (($data['schema']['type'] ?? null) === 'object' && ($data['defaults'] ?? null) === []) {
        $data['defaults'] = (object) [];
    }
    $data['id'] = $id;
    $data['resourceSha256'] = $provider['resource']['sha256'] ?? null;
    if (isset($provider['resources'])) {
        $data['manifestSha256'] = $provider['resources']['sha256'] ?? null;
    }
    $json = mbb_component_json(mbb_component_canonical($data));
    if ($json === false) {
        throw new InvalidArgumentException('component_definition');
    }
    return hash('sha256', $json);
}
function mbb_component_index_entries(): array
{
    $entries = [];
    foreach (mbb_component_registry() as $p) {
        $entries[$p['id'] . '@' . $p['version']] = [
            'id' => $p['id'],
            'version' => $p['version'],
            'title' => $p['title'],
            'fingerprint' => markbridge_teaching_component_fingerprint($p['id'], $p),
            'status' => $p['status'],
            ...isset($p['activityVersion']) ? ['activityVersion' => $p['activityVersion']] : [],
        ];
    }
    foreach ($GLOBALS['mbb_component_indexes'] ?? [] as $id => $index) {
        foreach ($index['versions'] as $v) {
            $entries[$id . '@' . $v['version']] = ['id' => $id, 'status' => 'indexed'] + $v;
        }
    }
    // Registration order is the default order; do not sort versions semantically.
    return $entries;
}
function mbb_component_index_has(string $id, string $version): bool
{
    return isset(mbb_component_index_entries()[$id . '@' . $version]);
}
function mbb_component_index_bytes(
    array $entries,
    ?array $indexes = null,
    ?array $defaults = null,
): int {
    $types = [];
    foreach ($indexes ?? ($GLOBALS['mbb_component_indexes'] ?? []) as $id => $index) {
        $types[$id] = array_diff_key($index, ['versions' => true]);
    }
    $json = mbb_component_json([
        'entries' => $entries,
        'types' => $types,
        'defaults' => $defaults ?? mbb_component_default_versions(),
    ]);
    return $json === false ? PHP_INT_MAX : strlen($json);
}
function mbb_component_index_room(string $id, mixed $version): bool
{
    $entries = mbb_component_index_entries();
    $entries[$id . '@' . (is_string($version) ? $version : '')] = ['id' => $id];
    $counts = array_count_values(array_column($entries, 'id'));
    return count($entries) <= 256 && count($counts) <= 64 && max($counts) <= 64;
}
function mbb_component_index_definition_fits(array $p): bool
{
    $entries = mbb_component_index_entries();
    $entries[$p['id'] . '@' . $p['version']] = [
        'id' => $p['id'],
        'version' => $p['version'],
        'title' => $p['title'],
        'status' => $p['status'],
        ...isset($p['activityVersion']) ? ['activityVersion' => $p['activityVersion']] : [],
        'fingerprint' => markbridge_teaching_component_fingerprint($p['id'], $p),
    ];
    return mbb_component_index_bytes(
        $entries,
        null,
        mbb_component_default_versions() + [$p['id'] => $p['version']],
    ) <= 131072;
}
function markbridge_register_teaching_component_catalog(
    string $id,
    array $index,
    callable $resolver,
): bool {
    try {
        if (
            !preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $id) ||
            isset($GLOBALS['mbb_component_indexes'][$id]) ||
            array_diff(array_keys($index), ['title', 'defaultVersion', 'versions']) ||
            count($index) !== 3 ||
            !is_string($index['title']) ||
            trim($index['title']) === '' ||
            strlen($index['title']) > 800 ||
            !is_array($index['versions']) ||
            !array_is_list($index['versions']) ||
            !$index['versions'] ||
            count($index['versions']) > 64 ||
            strlen(mbb_component_json($index) ?: '') > 32768 ||
            $index['defaultVersion'] !== ($index['versions'][0]['version'] ?? null)
        ) {
            return mbb_component_reject($id, 'invalid-catalog');
        }
        $entries = mbb_component_index_entries();
        foreach ($index['versions'] as $v) {
            if (
                !is_array($v) ||
                array_diff(['version', 'title', 'fingerprint'], array_keys($v)) ||
                array_diff(array_keys($v), [
                    'version',
                    'title',
                    'fingerprint',
                    'activityVersion',
                ]) ||
                (array_key_exists('activityVersion', $v) && $v['activityVersion'] !== 1) ||
                !is_string($v['version']) ||
                !preg_match('/^\d+\.\d+\.\d+$/D', $v['version']) ||
                !is_string($v['title']) ||
                trim($v['title']) === '' ||
                strlen($v['title']) > 800 ||
                !is_string($v['fingerprint']) ||
                !preg_match('/^[a-f0-9]{64}$/D', $v['fingerprint']) ||
                isset($entries[$id . '@' . $v['version']])
            ) {
                return mbb_component_reject($id, 'duplicate-or-invalid-catalog-key');
            }
            $entries[$id . '@' . $v['version']] = ['id' => $id] + $v;
        }
        $counts = array_count_values(array_column($entries, 'id'));
        $indexes = $GLOBALS['mbb_component_indexes'] ?? [];
        $indexes[$id] = $index;
        if (
            count($entries) > 256 ||
            count($counts) > 64 ||
            max($counts) > 64 ||
            mbb_component_index_bytes(
                $entries,
                $indexes,
                mbb_component_default_versions() + [$id => $index['defaultVersion']],
            ) > 131072 ||
            mbb_component_json($indexes) === false
        ) {
            return mbb_component_reject($id, 'catalog-limit');
        }
        // First successful type declaration wins even when another API adds later versions.
        if (!isset($GLOBALS['mbb_component_defaults'][$id])) {
            $legacy = array_filter(mbb_component_registry(), static fn($p) => $p['id'] === $id);
            $GLOBALS['mbb_component_defaults'][$id] = $legacy
                ? reset($legacy)['version']
                : $index['defaultVersion'];
        }
        $GLOBALS['mbb_component_indexes'][$id] = $index;
        $GLOBALS['mbb_component_factories'][$id] = $resolver;
        return true;
    } catch (Throwable) {
        return mbb_component_reject($id, 'invalid-catalog');
    }
}
function mbb_component_registry_fingerprint(): string
{
    return hash(
        'sha256',
        mbb_component_json(
            mbb_component_canonical([
                'entries' => array_map(
                    static fn($v) => array_diff_key($v, ['status' => true]),
                    mbb_component_index_entries(),
                ),
                'indexes' => $GLOBALS['mbb_component_indexes'] ?? [],
                'defaults' => mbb_component_default_versions(),
                'defaultOrder' => array_keys(mbb_component_default_versions()),
            ]),
        ),
    );
}
function mbb_component_recheck(array $provider): array
{
    $wasAvailable = $provider['status'] === 'available';
    $file = $provider['resource']['file'];
    clearstatcache(true, $file);
    if (!is_file($file) || !is_readable($file) || is_link($file)) {
        $provider['status'] = 'resource-unavailable';
    } elseif (filesize($file) > $provider['budgets']['resourceBytes']) {
        $provider['status'] = 'resource-limit';
    } elseif (!hash_equals($provider['resource']['sha256'], (string) hash_file('sha256', $file))) {
        $provider['status'] = 'resource-integrity';
    }
    if (($provider['protocolVersion'] ?? null) === 2 && $provider['status'] === 'available') {
        try {
            mbb_component_v2_check($provider);
        } catch (Throwable) {
            $provider['status'] = 'resource-integrity';
        }
    }
    if ($wasAvailable && $provider['status'] !== 'available') {
        $provider['integrityChanged'] = true;
    }
    return $provider;
}
function mbb_component_resolve(string $id, string $version): ?array
{
    foreach (mbb_component_registry() as $p) {
        if ($p['id'] === $id && $p['version'] === $version) {
            return mbb_component_recheck($p);
        }
    }
    $entry = null;
    foreach ($GLOBALS['mbb_component_indexes'][$id]['versions'] ?? [] as $v) {
        if ($v['version'] === $version) {
            $entry = $v;
            break;
        }
    }
    if (!$entry) {
        return null;
    }
    $key = $id . '@' . $version;
    $cacheKey = $key . '@' . $entry['fingerprint'];
    if (array_key_exists($cacheKey, $GLOBALS['mbb_component_resolved'] ?? [])) {
        $p = $GLOBALS['mbb_component_resolved'][$cacheKey];
        return $p ? mbb_component_recheck($p) : null;
    }
    if (isset($GLOBALS['mbb_component_resolving'][$key])) {
        $GLOBALS['mbb_component_resolution_failed'][$key] = true;
        return null;
    }
    if (
        isset($GLOBALS['mbb_component_resolving'][$key]) ||
        count($GLOBALS['mbb_component_resolved'] ?? []) >= 256
    ) {
        return null;
    }
    $GLOBALS['mbb_component_resolving'][$key] = true;
    $p = null;
    try {
        $candidate = $GLOBALS['mbb_component_factories'][$id]($id, $version);
        if (
            empty($GLOBALS['mbb_component_resolution_failed'][$key]) &&
            is_array($candidate) &&
            ($candidate['version'] ?? null) === $version
        ) {
            $checked = mbb_component_register_checked($id, $candidate, true);
            if (
                is_array($checked) &&
                $checked['title'] === $entry['title'] &&
                ($checked['activityVersion'] ?? null) === ($entry['activityVersion'] ?? null) &&
                hash_equals(
                    $entry['fingerprint'],
                    markbridge_teaching_component_fingerprint($id, $checked),
                ) &&
                strlen(mbb_component_json(mbb_component_public($checked))) <= 65536
            ) {
                $bytes = strlen(mbb_component_json($checked));
                if (($GLOBALS['mbb_component_resolved_bytes'] ?? 0) + $bytes <= 4194304) {
                    $GLOBALS['mbb_component_resolved_bytes'] =
                        ($GLOBALS['mbb_component_resolved_bytes'] ?? 0) + $bytes;
                    $p = $checked;
                }
            }
        }
    } catch (Throwable) {
        $p = null;
    } finally {
        unset($GLOBALS['mbb_component_resolving'][$key]);
    }
    if (!$p) {
        unset($GLOBALS['mbb_indexed_projection_renderers'][$key]);
    }
    $GLOBALS['mbb_component_resolved'][$cacheKey] = $p;
    return $p;
}
/** Budget distinct exact dependencies, including unchanged/missing configurations. */
function mbb_component_document_within_budget(string $serialized): bool
{
    $seen = [];
    $bytes = 0;
    foreach (mbb_component_descriptors($serialized) as $a) {
        $key = $a->component . '@' . $a->componentVersion;
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        if (count($seen) > 32) {
            return false;
        }
        $p = mbb_component_provider($a->component, $a->componentVersion);
        if ($p) {
            $bytes += strlen(mbb_component_json(mbb_component_public($p)));
        }
        if ($bytes > 524288) {
            return false;
        }
    }
    return true;
}
function mbb_component_serialized_providers(string $serialized): array
{
    // Frontend dependency discovery is best effort: ordinary/native posts may contain
    // unrecognized comments. Admission and conversion keep their strict error path.
    try {
        preg_match_all('/<!-- wp:mbb\/component (\{[\s\S]*?\}) -->/', $serialized, $matches);
        $descriptors = [];
        foreach ($matches[1] as $raw) {
            $a = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
            if (
                !is_object($a) ||
                !is_string($a->id ?? null) ||
                !is_string($a->component ?? null) ||
                !preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $a->component) ||
                !is_string($a->componentVersion ?? null) ||
                !preg_match('/^\d+\.\d+\.\d+$/D', $a->componentVersion)
            ) {
                return [];
            }
            $descriptors[$a->id] = $a;
        }
        if (!mbb_component_document_within_budget($serialized)) {
            return [];
        }
        $items = [];
        foreach ($descriptors as $a) {
            $p = mbb_component_provider($a->component, $a->componentVersion);
            if ($p && $p['status'] === 'available') {
                $items[$a->component . '@' . $a->componentVersion] = mbb_component_public($p);
            }
        }
        return array_values($items);
    } catch (Throwable) {
        return [];
    }
}

function mbb_component_page_providers(): array
{
    global $post, $wp_query;
    $items = [];
    $bytes = 0;
    $posts = is_admin() ? [$post] : $wp_query->posts ?? [$post];
    foreach ($posts as $p) {
        if (!is_object($p)) {
            continue;
        }
        foreach (
            mbb_component_serialized_providers((string) ($p->post_content ?? ''))
            as $provider
        ) {
            $key = $provider['id'] . '@' . $provider['version'];
            if (isset($items[$key])) {
                continue;
            }
            $bytes += strlen(mbb_component_json($provider));
            if (count($items) >= 256 || $bytes > 4194304) {
                return [];
            }
            $items[$key] = $provider;
        }
    }
    return array_values($items);
}

function mbb_component_author_permission($request = null): bool
{
    if (function_exists('mbb_references_fresh_user')) {
        mbb_references_fresh_user();
    }
    if (!get_current_user_id() || !current_user_can('edit_posts')) {
        return false;
    }
    $postId = (int) ($request['post_id'] ?? 0);
    return !$postId || current_user_can('edit_post', $postId);
}
function mbb_component_api_response(array $data)
{
    $r = new WP_REST_Response($data);
    $r->header('Cache-Control', 'private, no-store, max-age=0');
    return $r;
}
function mbb_component_catalog_page($request = null)
{
    if (!mbb_component_author_permission($request)) {
        return mbb_error(
            'component_unavailable',
            mbb_t('This extension information is unavailable.'),
            404,
        );
    }
    $fingerprint = mbb_component_registry_fingerprint();
    $expected = $request['fingerprint'] ?? '';
    if ($expected !== '' && $expected !== $fingerprint) {
        return mbb_error(
            'component_catalog_changed',
            mbb_t('The component catalog changed. Refresh the list before continuing.'),
            409,
        );
    }
    $page = filter_var($request['page'] ?? 1, FILTER_VALIDATE_INT);
    $size = filter_var($request['per_page'] ?? 20, FILTER_VALIDATE_INT);
    $type = $request['type'] ?? '';
    if (
        !$page ||
        $page < 1 ||
        !$size ||
        $size < 1 ||
        $size > 50 ||
        !is_string($type) ||
        ($type !== '' && !preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $type))
    ) {
        return mbb_error(
            'component_catalog_request',
            mbb_t('Invalid component catalog request.'),
            400,
        );
    }
    $items = array_values(
        array_filter(
            mbb_component_index_entries(),
            static fn($v) => $type === '' || $v['id'] === $type,
        ),
    );
    $data = [
        'schema' => 1,
        'fingerprint' => $fingerprint,
        'page' => $page,
        'perPage' => $size,
        'total' => count($items),
        'items' => array_slice($items, ($page - 1) * $size, $size),
        'defaults' => mbb_component_default_versions(),
    ];
    if (strlen(mbb_component_json($data)) > 32768) {
        return mbb_error(
            'component_catalog_limit',
            mbb_t('The installed extension catalog exceeds its display budget.'),
            413,
        );
    }
    return mbb_component_api_response($data);
}
function mbb_component_default_versions(): array
{
    $defaults = $GLOBALS['mbb_component_defaults'] ?? [];
    foreach (mbb_component_registry() as $p) {
        $defaults[$p['id']] ??= $p['version'];
    }
    return $defaults;
}
function mbb_component_descriptor_response($request)
{
    if (!mbb_component_author_permission($request)) {
        return mbb_error(
            'component_unavailable',
            mbb_t('This extension information is unavailable.'),
            404,
        );
    }
    $fingerprint = mbb_component_registry_fingerprint();
    if (!is_string($request['fingerprint'] ?? null) || $request['fingerprint'] !== $fingerprint) {
        return mbb_error(
            'component_catalog_changed',
            mbb_t('The component catalog changed. Refresh the list before continuing.'),
            409,
        );
    }
    $p = mbb_component_provider((string) $request['component'], (string) $request['version']);
    if ($fingerprint !== mbb_component_registry_fingerprint()) {
        return mbb_error(
            'component_catalog_changed',
            mbb_t('The component catalog changed. Refresh the list before continuing.'),
            409,
        );
    }
    if (!$p || $p['status'] !== 'available') {
        return mbb_error(
            'component_unavailable',
            mbb_t(
                'The component is missing or incompatible. Preserve its configuration or enable the matching extension before editing.',
            ),
            422,
        );
    }
    $data = [
        'fingerprint' => $fingerprint,
        'definitionFingerprint' => markbridge_teaching_component_fingerprint($p['id'], $p),
        'provider' => mbb_component_public($p),
    ];
    if (
        strlen(mbb_component_json($data['provider'])) > 65536 ||
        !mbb_component_author_permission($request)
    ) {
        return mbb_error(
            'component_unavailable',
            mbb_t('This extension information is unavailable.'),
            404,
        );
    }
    return mbb_component_api_response($data);
}
function mbb_component_catalog_bootstrap(): array
{
    return [
        'fingerprint' => mbb_component_registry_fingerprint(),
        'url' => rest_url('mbb/v2/components/'),
        'postId' => (int) ($GLOBALS['post']->ID ?? 0),
        'defaults' => mbb_component_default_versions(),
    ];
}
add_action('rest_api_init', static function () {
    register_rest_route('mbb/v2', '/components/catalog', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_component_author_permission',
        'callback' => 'mbb_component_catalog_page',
    ]);
    register_rest_route(
        'mbb/v2',
        '/components/descriptor/(?P<component>[a-z][a-z0-9-]{0,63})/(?P<version>\d+\.\d+\.\d+)',
        [
            'methods' => 'GET',
            'permission_callback' => 'mbb_component_author_permission',
            'callback' => 'mbb_component_descriptor_response',
        ],
    );
});

/** A publication may span more than one article's dependency set. */
function mbb_component_publication_budget(array $components): void
{
    $seen = [];
    $bytes = 0;
    foreach ($components as $c) {
        $key = $c['component'] . '@' . $c['version'];
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $p = mbb_component_provider($c['component'], $c['version']);
        if ($p) {
            $bytes += strlen(mbb_component_json(mbb_component_public($p)));
        }
        if (count($seen) > 256 || $bytes > 4194304) {
            mbb_collections_fail('collection_quota', 413);
        }
    }
}
