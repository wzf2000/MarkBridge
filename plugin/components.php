<?php

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

require_once __DIR__ . '/includes/i18n.php';
require_once __DIR__ . '/component-resources.php';
/** Trusted, local provider registration. Conversion remains provider-independent. */
function mbb_component_registry(): array
{
    return $GLOBALS['mbb_components'] ?? [];
}
/** Resolve authored versions exactly; first registration remains the legacy/default entry. */
function mbb_component_provider(string $id, string $version): ?array
{
    foreach (mbb_component_registry() as $provider) {
        if ($provider['id'] === $id && $provider['version'] === $version) {
            return $provider;
        }
    }
    return null;
}
function mbb_component_json(mixed $value, int $flags = 0): string|false
{
    $precision = ini_get('serialize_precision');
    ini_set('serialize_precision', '-1');
    try {
        return json_encode($value, $flags);
    } finally {
        ini_set('serialize_precision', (string) $precision);
    }
}
function mbb_component_equal(mixed $a, mixed $b, int $depth = 0): bool
{
    if ($depth > 8) {
        return false;
    }
    if ((is_int($a) || is_float($a)) && (is_int($b) || is_float($b))) {
        return is_finite((float) $a) && is_finite((float) $b) && (float) $a === (float) $b;
    }
    if (gettype($a) !== gettype($b)) {
        return false;
    }
    if (is_array($a)) {
        if (count($a) !== count($b) || array_is_list($a) !== array_is_list($b)) {
            return false;
        }
        foreach ($a as $k => $v) {
            if (!array_key_exists($k, $b) || !mbb_component_equal($v, $b[$k], $depth + 1)) {
                return false;
            }
        }
        return true;
    }
    if ($a instanceof stdClass) {
        $left = get_object_vars($a);
        $right = get_object_vars($b);
        if (count($left) !== count($right)) {
            return false;
        }
        foreach ($left as $k => $v) {
            if (
                !property_exists($b, (string) $k) ||
                !mbb_component_equal($v, $b->{(string) $k}, $depth + 1)
            ) {
                return false;
            }
        }
        return true;
    }
    return $a === $b;
}
function mbb_component_pure_params(mixed $value): bool
{
    if (!($value instanceof stdClass)) {
        return false;
    }
    $nodes = 0;
    $walk = function ($v, $depth) use (&$walk, &$nodes) {
        if (++$nodes > 1024 || $depth > 8) {
            return false;
        }
        if (is_float($v) && !is_finite($v)) {
            return false;
        }
        if (is_string($v) && !mb_check_encoding($v, 'UTF-8')) {
            return false;
        }
        if (is_array($v) || $v instanceof stdClass) {
            foreach ($v as $k => $child) {
                if (
                    in_array((string) $k, ['__proto__', 'prototype', 'constructor'], true) ||
                    !$walk($child, $depth + 1)
                ) {
                    return false;
                }
            }
        }
        return true;
    };
    $raw = mbb_component_json(
        $value,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS,
    );
    return $walk($value, 0) && is_string($raw) && strlen($raw) <= 16384;
}
function mbb_component_schema_definition(array $schema, int $depth = 0, int &$nodes = 0): bool
{
    if (
        ++$nodes > 1024 ||
        $depth > 8 ||
        !in_array(
            $schema['type'] ?? null,
            ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'],
            true,
        )
    ) {
        return false;
    }
    $type = $schema['type'];
    $allowed = ['type', 'enum'];
    $allowed = array_merge(
        $allowed,
        match ($type) {
            'object' => ['properties', 'required', 'additionalProperties'],
            'array' => ['items', 'minItems', 'maxItems'],
            'string' => ['minLength', 'maxLength'],
            'number', 'integer' => ['minimum', 'maximum'],
            default => [],
        },
    );
    foreach ($schema as $key => $value) {
        if (!in_array($key, $allowed, true)) {
            return false;
        }
    }
    if (
        array_key_exists('enum', $schema) &&
        (!is_array($schema['enum']) || !array_is_list($schema['enum']) || !$schema['enum'])
    ) {
        return false;
    }
    foreach (['minItems', 'maxItems', 'minLength', 'maxLength'] as $key) {
        if (
            array_key_exists($key, $schema) &&
            (!is_int($schema[$key]) || $schema[$key] < 0 || $schema[$key] > 1024)
        ) {
            return false;
        }
    }
    foreach (['minimum', 'maximum'] as $key) {
        if (
            array_key_exists($key, $schema) &&
            ((!is_int($schema[$key]) && !is_float($schema[$key])) ||
                !is_finite((float) $schema[$key]))
        ) {
            return false;
        }
    }
    foreach (
        [['minItems', 'maxItems'], ['minLength', 'maxLength'], ['minimum', 'maximum']]
        as [$min, $max]
    ) {
        if (isset($schema[$min], $schema[$max]) && $schema[$min] > $schema[$max]) {
            return false;
        }
    }
    if ($type === 'object') {
        if (
            ($schema['additionalProperties'] ?? null) !== false ||
            !is_array($schema['properties'] ?? null)
        ) {
            return false;
        }
        $required = $schema['required'] ?? [];
        if (
            !is_array($required) ||
            !array_is_list($required) ||
            count(array_unique($required, SORT_STRING)) !== count($required)
        ) {
            return false;
        }
        foreach ($required as $key) {
            if (!is_string($key) || !array_key_exists($key, $schema['properties'])) {
                return false;
            }
        }
        foreach ($schema['properties'] as $key => $child) {
            if (
                !is_array($child) ||
                in_array((string) $key, ['__proto__', 'prototype', 'constructor'], true) ||
                !mbb_component_schema_definition($child, $depth + 1, $nodes)
            ) {
                return false;
            }
        }
    }
    if (
        $type === 'array' &&
        (!is_array($schema['items'] ?? null) ||
            !mbb_component_schema_definition($schema['items'], $depth + 1, $nodes))
    ) {
        return false;
    }
    if (array_key_exists('enum', $schema)) {
        foreach ($schema['enum'] as $value) {
            $without = $schema;
            unset($without['enum']);
            if (!mbb_component_schema($value, $without, $depth)) {
                return false;
            }
        }
    }
    return true;
}
function mbb_component_schema(mixed $value, array $schema, int $depth = 0): bool
{
    if ($depth > 8 || !isset($schema['type'])) {
        return false;
    }
    $type = $schema['type'];
    $valid = match ($type) {
        'object' => $value instanceof stdClass,
        'array' => is_array($value) && array_is_list($value),
        'string' => is_string($value),
        'number' => (is_int($value) || is_float($value)) && is_finite((float) $value),
        'integer' => (is_int($value) || is_float($value)) &&
            is_finite((float) $value) &&
            floor($value) === (float) $value,
        'boolean' => is_bool($value),
        'null' => $value === null,
        default => false,
    };
    if (
        !$valid ||
        (array_key_exists('enum', $schema) &&
            !array_filter(
                $schema['enum'],
                static fn($candidate) => mbb_component_equal($value, $candidate),
            ))
    ) {
        return false;
    }
    if (
        is_numeric($value) &&
        !is_string($value) &&
        ((isset($schema['minimum']) && $value < $schema['minimum']) ||
            (isset($schema['maximum']) && $value > $schema['maximum']))
    ) {
        return false;
    }
    if (
        is_string($value) &&
        ((isset($schema['maxLength']) && mb_strlen($value) > $schema['maxLength']) ||
            (isset($schema['minLength']) && mb_strlen($value) < $schema['minLength']))
    ) {
        return false;
    }
    if ($type === 'object') {
        if (($schema['additionalProperties'] ?? null) !== false) {
            return false;
        }
        foreach ($schema['required'] ?? [] as $key) {
            if (!property_exists($value, $key)) {
                return false;
            }
        }
        foreach ($value as $key => $child) {
            if (
                !isset($schema['properties'][$key]) ||
                !mbb_component_schema($child, $schema['properties'][$key], $depth + 1)
            ) {
                return false;
            }
        }
    }
    if ($type === 'array') {
        if (
            count($value) < ($schema['minItems'] ?? 0) ||
            count($value) > ($schema['maxItems'] ?? 1024) ||
            !isset($schema['items'])
        ) {
            return false;
        }
        foreach ($value as $child) {
            if (!mbb_component_schema($child, $schema['items'], $depth + 1)) {
                return false;
            }
        }
    }
    return true;
}
function mbb_component_budget_limits(): array
{
    return [
        'resourceBytes' => 524288,
        'startupMs' => 5000,
        'wallMs' => 2000,
        'traceFrames' => 8192,
        'traceBytes' => 524288,
    ];
}
function mbb_component_reject(string $id, string $reason): bool
{
    $list = $GLOBALS['mbb_component_rejections'] ?? [];
    if (count($list) < 100) {
        $list[] = [
            'id' => preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $id) ? $id : '(invalid-id)',
            'reason' => $reason,
        ];
        $GLOBALS['mbb_component_rejections'] = $list;
    }
    return false;
}
function markbridge_register_teaching_component(string $id, array $provider): bool
{
    try {
        return mbb_component_register_checked($id, $provider);
    } catch (Throwable) {
        return mbb_component_reject($id, 'invalid-registration');
    }
}
function markbridge_teaching_supports_ui_locale(): bool
{
    return true;
}
function markbridge_teaching_supports_component_versions(): bool
{
    return true;
}
function markbridge_teaching_supports_activities(): bool
{
    return true;
}

/** Installed providers can add data-only domain checks after the strict generic schema. */
/** Trusted providers may opt passive diagrams into automatic frontend presentation. */
function markbridge_teaching_supports_reader_diagrams(): bool
{
    return true;
}
function mbb_component_domain_valid(
    string $id,
    string $version,
    mixed $params,
    mixed $activity = null,
): bool {
    try {
        return !function_exists('apply_filters') ||
            apply_filters(
                'markbridge_validate_component_params',
                true,
                $id,
                $version,
                $params,
                $activity,
            ) === true;
    } catch (Throwable) {
        return false;
    }
}
function mbb_component_register_checked(string $id, array $provider): bool
{
    $registry = mbb_component_registry();
    if (
        is_string($provider['version'] ?? null) &&
        mbb_component_provider($id, $provider['version'])
    ) {
        return mbb_component_reject($id, 'duplicate-provider');
    }
    $fields = [
        'version',
        'title',
        'schema',
        'defaults',
        'resource',
        'protocolVersion',
        'minMarkBridge',
        'budgets',
    ];
    if (
        count($registry) >= 32 ||
        array_diff(array_keys($provider), [
            ...$fields,
            'supportsUiLocale',
            'readerMode',
            'activityVersion',
            'resources',
        ]) ||
        (array_key_exists('supportsUiLocale', $provider) &&
            !is_bool($provider['supportsUiLocale'])) ||
        (array_key_exists('readerMode', $provider) && $provider['readerMode'] !== 'diagram') ||
        (array_key_exists('activityVersion', $provider) && $provider['activityVersion'] !== 1) ||
        array_diff($fields, array_keys($provider)) ||
        !preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $id) ||
        !is_string($provider['version']) ||
        !preg_match('/^\d+\.\d+\.\d+$/D', $provider['version']) ||
        !is_int($provider['protocolVersion']) ||
        $provider['protocolVersion'] < 1 ||
        ($provider['protocolVersion'] === 2) !== array_key_exists('resources', $provider) ||
        !is_string($provider['minMarkBridge']) ||
        !preg_match('/^\d+\.\d+\.\d+(?:-(?:dev|rc)\.\d+)?$/D', $provider['minMarkBridge']) ||
        !is_string($provider['title']) ||
        trim($provider['title']) === '' ||
        strlen($provider['title']) > 800 ||
        mbb_component_json($provider['title']) === false ||
        !is_array($provider['resource']) ||
        array_diff(array_keys($provider['resource']), ['file', 'url', 'sha256']) ||
        !is_array($provider['budgets']) ||
        array_diff(array_keys($provider['budgets']), array_keys(mbb_component_budget_limits()))
    ) {
        return mbb_component_reject($id, 'invalid-registration');
    }
    foreach (mbb_component_budget_limits() as $key => $max) {
        $n = $provider['budgets'][$key] ?? null;
        if (!is_int($n) || $n < 1 || $n > $max) {
            return mbb_component_reject($id, 'invalid-budget');
        }
    }
    if (
        !is_array($provider['schema']) ||
        mbb_component_json($provider['schema']) === false ||
        !mbb_component_schema_definition($provider['schema'])
    ) {
        return mbb_component_reject($id, 'invalid-schema');
    }
    $file = $provider['resource']['file'] ?? '';
    $path = is_string($file) ? realpath($file) : false;
    $parent = is_string($file) ? realpath(dirname($file)) : false;
    $inside = false;
    foreach (scandir(WP_PLUGIN_DIR) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $directory = realpath(WP_PLUGIN_DIR . '/' . $entry);
        $candidate = $path ?: ($parent ? $parent . '/' . basename($file) : false);
        if (
            $directory &&
            is_dir($directory) &&
            $candidate &&
            str_starts_with(wp_normalize_path($candidate), wp_normalize_path($directory) . '/')
        ) {
            $inside = true;
            break;
        }
    }
    if (
        !$inside ||
        !preg_match('/\.html(?:\.txt)?$/D', $file) ||
        !is_string($provider['resource']['sha256'] ?? null) ||
        !preg_match('/^[a-f0-9]{64}$/D', $provider['resource']['sha256'])
    ) {
        return mbb_component_reject($id, 'invalid-resource');
    }
    $url = plugins_url(basename($file), $file);
    if (
        ($provider['resource']['url'] ?? '') !== $url ||
        parse_url($url, PHP_URL_HOST) !== parse_url(site_url(), PHP_URL_HOST)
    ) {
        return mbb_component_reject($id, 'invalid-resource-url');
    }
    $defaults = json_decode(
        mbb_component_json($provider['defaults']),
        false,
        16,
        JSON_THROW_ON_ERROR,
    );
    if (
        !mbb_component_pure_params($defaults) ||
        !mbb_component_schema($defaults, $provider['schema'])
    ) {
        return mbb_component_reject($id, 'invalid-defaults');
    }
    preg_match(
        '/^ \* Version: ([^ \r\n]+)/m',
        file_get_contents(__DIR__ . '/markdown-block-bridge.php'),
        $version,
    );
    if ($provider['protocolVersion'] === 2) {
        try {
            $provider['resourcePlan'] = mbb_component_resource_group($provider);
        } catch (Throwable $e) {
            return mbb_component_reject($id, 'invalid-resource-group');
        }
    }
    $provider['id'] = $id;
    $provider['defaults'] = $defaults;
    $provider['status'] = !in_array($provider['protocolVersion'], [1, 2], true)
        ? 'protocol-incompatible'
        : (version_compare($version[1] ?? '0.0.0', $provider['minMarkBridge'], '<')
            ? 'version-incompatible'
            : (!$path || !is_file($path) || !is_readable($path)
                ? 'resource-unavailable'
                : (filesize($path) > $provider['budgets']['resourceBytes']
                    ? 'resource-limit'
                    : (hash_equals($provider['resource']['sha256'], hash_file('sha256', $path))
                        ? 'available'
                        : 'resource-integrity'))));
    $GLOBALS['mbb_components'][
        isset($registry[$id]) ? $id . '@' . $provider['version'] : $id
    ] = $provider;
    return true;
}
add_action(
    'init',
    static function () {
        do_action('markbridge_register_teaching_components');
    },
    5,
);
function mbb_component_descriptors(string $serialized): array
{
    $result = [];
    preg_match_all('/<!-- wp:mbb\/component (\{[\s\S]*?\}) -->/', $serialized, $matches);
    foreach ($matches[1] as $raw) {
        $attrs = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
        $result[$attrs->id] = $attrs;
    }
    return $result;
}
function mbb_component_admit(string $serialized, string $base)
{
    $original = mbb_component_descriptors($base);
    foreach (mbb_component_descriptors($serialized) as $id => $a) {
        $old = $original[$id] ?? null;
        // Existing exact configuration survives missing providers; fallback is independently editable.
        if (
            $old &&
            $old->component === $a->component &&
            $old->componentVersion === $a->componentVersion &&
            mbb_component_equal($old->params, $a->params) &&
            mbb_component_equal($old->activity ?? null, $a->activity ?? null)
        ) {
            continue;
        }
        $p = mbb_component_provider($a->component, $a->componentVersion);
        $resourcesValid = true;
        if (($p['protocolVersion'] ?? null) === 2) {
            try {
                mbb_component_v2_check($p);
            } catch (Throwable) {
                $resourcesValid = false;
            }
        }
        if (
            !$p ||
            $p['status'] !== 'available' ||
            $p['version'] !== $a->componentVersion ||
            !$resourcesValid
        ) {
            return mbb_error(
                'component_unavailable',
                mbb_t(
                    'The component is missing or incompatible. Preserve its configuration or enable the matching extension before editing.',
                ),
                422,
            );
        }
        if (
            !mbb_component_schema($a->params, $p['schema']) ||
            (isset($a->activity) && ($p['activityVersion'] ?? null) !== 1) ||
            !mbb_component_domain_valid(
                $a->component,
                $a->componentVersion,
                $a->params,
                $a->activity ?? null,
            )
        ) {
            return mbb_error(
                'component_params',
                mbb_t('Component parameters do not satisfy the registered strict schema.'),
                422,
            );
        }
    }
    return true;
}
function mbb_component_public(array $p): array
{
    $public = array_intersect_key(
        $p,
        array_flip([
            'id',
            'title',
            'version',
            'schema',
            'defaults',
            'protocolVersion',
            'minMarkBridge',
            'budgets',
            'supportsUiLocale',
            'readerMode',
            'activityVersion',
        ]),
    ) + [
        'resource' => ['url' => $p['resource']['url'], 'sha256' => $p['resource']['sha256']],
    ];
    if ($p['protocolVersion'] === 2) {
        $public['resources'] = [
            'url' => $p['resources']['url'],
            'baseUrl' => $p['resourcePlan']['baseUrl'],
            'sha256' => $p['resources']['sha256'],
            'groupSha256' => $p['resourcePlan']['groupSha256'],
            'version' => $p['version'],
        ];
        $public['frameUrl'] = rest_url(
            'mbb/v2/component-frame/' .
                $p['id'] .
                '/' .
                $p['version'] .
                '/' .
                $p['resource']['sha256'],
        );
        $public['identity'] = mbb_component_identity($p);
    }
    return $public;
}
function mbb_component_available(): array
{
    return array_values(
        array_map(
            'mbb_component_public',
            array_filter(mbb_component_registry(), static fn($p) => $p['status'] === 'available'),
        ),
    );
}
add_action('enqueue_block_editor_assets', static function () {
    $providers = mbb_component_available();
    wp_enqueue_script(
        'mbb-components',
        plugins_url(mbb_asset('components.js'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/components.js'), 0, 12),
        true,
    );
    wp_add_inline_script(
        'mbb-components',
        'window.MBBComponents=' .
            mbb_component_json(
                $providers,
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT,
            ) .
            ';',
        'before',
    );
});

require_once __DIR__ . '/component-diagnostics.php';

require_once __DIR__ . '/projections.php';

require_once __DIR__ . '/component-frame.php';
