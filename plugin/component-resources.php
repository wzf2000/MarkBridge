<?php
/** Fixed public resource groups. This module never accepts article paths or fetches URLs. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
const MBB_COMPONENT_RESOURCE_LIMITS = [
    'manifest' => 16384,
    'items' => 8,
    'item' => 1048576,
    'total' => 2097152,
    'cache' => 4194304,
];
/** Decode bounded JSON without silently discarding duplicate keys or invalid Unicode. */
function mbb_component_resource_json(string $text): mixed
{
    if (strlen($text) > 16384 || !mb_check_encoding($text, 'UTF-8')) {
        throw new InvalidArgumentException('RESOURCE_JSON');
    }
    $p = 0;
    $nodes = 0;
    $length = strlen($text);
    $ws = static function () use (&$p, $text, $length) {
        while ($p < $length && str_contains(" \r\n\t", $text[$p])) {
            $p++;
        }
    };
    $string = static function () use (&$p, $text, $length) {
        $start = $p++;
        while ($p < $length) {
            if ($text[$p] === '\\') {
                $p += 2;
                continue;
            }
            if ($text[$p] === '"') {
                $p++;
                return json_decode(
                    substr($text, $start, $p - $start),
                    false,
                    16,
                    JSON_THROW_ON_ERROR,
                );
            }
            $p++;
        }
        throw new InvalidArgumentException('RESOURCE_JSON_STRING');
    };
    $value = null;
    $value = static function ($depth) use (&$value, &$p, &$nodes, $text, $length, $ws, $string) {
        if (++$nodes > 1024 || $depth > 8) {
            throw new InvalidArgumentException('RESOURCE_JSON_BOUND');
        }
        $ws();
        $c = $text[$p] ?? '';
        if ($c === '"') {
            return $string();
        }
        if ($c === '{' || $c === '[') {
            $p++;
            $object = $c === '{';
            $out = $object ? new stdClass() : [];
            $seen = [];
            $ws();
            $end = $object ? '}' : ']';
            if (($text[$p] ?? '') === $end) {
                $p++;
                return $out;
            }
            while (true) {
                $ws();
                $key = null;
                if ($object) {
                    if (($text[$p] ?? '') !== '"') {
                        throw new InvalidArgumentException('RESOURCE_JSON_KEY');
                    }
                    $key = $string();
                    if (isset($seen[$key])) {
                        throw new InvalidArgumentException('RESOURCE_JSON_DUPLICATE');
                    }
                    $seen[$key] = true;
                    $ws();
                    if (($text[$p++] ?? '') !== ':') {
                        throw new InvalidArgumentException('RESOURCE_JSON_COLON');
                    }
                }
                $v = $value($depth + 1);
                if ($object) {
                    $out->{$key} = $v;
                } else {
                    $out[] = $v;
                }
                $ws();
                $next = $text[$p++] ?? '';
                if ($next === $end) {
                    return $out;
                }
                if ($next !== ',') {
                    throw new InvalidArgumentException('RESOURCE_JSON_SEPARATOR');
                }
            }
        }
        if (
            !preg_match(
                '/\G(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/A',
                $text,
                $m,
                0,
                $p,
            )
        ) {
            throw new InvalidArgumentException('RESOURCE_JSON_VALUE');
        }
        $p += strlen($m[0]);
        $out = json_decode($m[0], false, 16, JSON_THROW_ON_ERROR);
        if (is_float($out) && !is_finite($out)) {
            throw new InvalidArgumentException('RESOURCE_JSON_NUMBER');
        }
        return $out;
    };
    $out = $value(0);
    $ws();
    if ($p !== $length) {
        throw new InvalidArgumentException('RESOURCE_JSON_TRAILING');
    }
    return $out;
}
function mbb_component_resource_manifest(mixed $m): array
{
    $closed = static fn($v, $keys) => $v instanceof stdClass &&
        count(get_object_vars($v)) === count($keys) &&
        !array_diff($keys, array_keys(get_object_vars($v)));
    $semver = '/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/D';
    if (
        !$closed($m, ['schema', 'version', 'resources']) ||
        $m->schema !== 'mbb-resources/v2' ||
        !is_string($m->version) ||
        !preg_match($semver, $m->version) ||
        !is_array($m->resources) ||
        !array_is_list($m->resources) ||
        !$m->resources ||
        count($m->resources) > 8
    ) {
        throw new InvalidArgumentException('MANIFEST_SHAPE');
    }
    $ids = [];
    $paths = [];
    $sum = 0;
    foreach ($m->resources as $r) {
        if (
            !$closed($r, ['id', 'path', 'type', 'bytes', 'sha256', 'deps', 'license', 'version']) ||
            !is_string($r->id) ||
            !preg_match('/^[a-z][a-z0-9-]{0,23}$/D', $r->id) ||
            isset($ids[$r->id]) ||
            !is_string($r->path) ||
            !preg_match(
                '~^assets/[0-9]+\.[0-9]+\.[0-9]+/[a-z][a-z0-9-]*\.(json|js|bin)$~D',
                $r->path,
            ) ||
            explode('/', $r->path)[1] !== $m->version ||
            isset($paths[$r->path]) ||
            $r->version !== $m->version ||
            !in_array($r->type, ['json', 'javascript', 'public-data'], true) ||
            ['json' => 'json', 'javascript' => 'js', 'public-data' => 'bin'][$r->type] !==
                pathinfo($r->path, PATHINFO_EXTENSION) ||
            !(is_int($r->bytes) || is_float($r->bytes)) ||
            !is_finite((float) $r->bytes) ||
            floor($r->bytes) != $r->bytes ||
            $r->bytes < 1 ||
            $r->bytes > 1048576 ||
            !is_string($r->sha256) ||
            !preg_match('/^[a-f0-9]{64}$/D', $r->sha256) ||
            !is_array($r->deps) ||
            !array_is_list($r->deps) ||
            count($r->deps) > 7 ||
            count(array_unique($r->deps, SORT_REGULAR)) !== count($r->deps) ||
            !in_array($r->license, ['CC0-1.0', 'GPL-3.0-or-later', 'Apache-2.0'], true)
        ) {
            throw new InvalidArgumentException('RESOURCE_SHAPE');
        }
        foreach ($r->deps as $d) {
            if (!is_string($d) || !preg_match('/^[a-z][a-z0-9-]{0,23}$/D', $d)) {
                throw new InvalidArgumentException('RESOURCE_SHAPE');
            }
        }
        $row = get_object_vars($r);
        $row['bytes'] = (int) $r->bytes;
        $ids[$r->id] = $row;
        $paths[$r->path] = true;
        $sum += (int) $r->bytes;
    }
    if ($sum > 2097152) {
        throw new InvalidArgumentException('GROUP_LIMIT');
    }
    $visiting = [];
    $done = [];
    $order = [];
    $visit = null;
    $visit = static function ($id) use (&$visit, &$visiting, &$done, &$order, $ids) {
        if (isset($visiting[$id])) {
            throw new InvalidArgumentException('DEPENDENCY_CYCLE');
        }
        if (isset($done[$id])) {
            return;
        }
        if (!isset($ids[$id])) {
            throw new InvalidArgumentException('DEPENDENCY_MISSING');
        }
        $visiting[$id] = true;
        foreach ($ids[$id]['deps'] as $d) {
            $visit($d);
        }
        unset($visiting[$id]);
        $done[$id] = true;
        $order[] = $ids[$id];
    };
    foreach (array_keys($ids) as $id) {
        $visit($id);
    }
    return ['version' => $m->version, 'resources' => $order, 'bytes' => $sum];
}
/** Require regular canonical files underneath one registered plugin root, including ancestors. */
function mbb_component_resource_file(string $root, string $relative, int $max): string
{
    if (
        !preg_match('~^assets/[0-9]+\.[0-9]+\.[0-9]+/[a-z][a-z0-9-]*\.(json|js|bin)$~D', $relative)
    ) {
        throw new InvalidArgumentException('RESOURCE_PATH');
    }
    $path = $root;
    foreach (explode('/', $relative) as $part) {
        $path .= '/' . $part;
        if (is_link($path)) {
            throw new InvalidArgumentException('RESOURCE_SYMLINK');
        }
    }
    if (
        realpath($path) !== $path ||
        !is_file($path) ||
        !is_readable($path) ||
        filesize($path) < 1 ||
        filesize($path) > $max
    ) {
        throw new InvalidArgumentException('RESOURCE_FILE');
    }
    return $path;
}
function mbb_component_resource_group(array $provider): array
{
    $r = $provider['resources'] ?? null;
    if (
        !is_array($r) ||
        array_diff(array_keys($r), ['file', 'url', 'sha256']) ||
        array_diff(['file', 'url', 'sha256'], array_keys($r)) ||
        !is_string($r['file']) ||
        !is_string($r['url']) ||
        !is_string($r['sha256']) ||
        !preg_match('/^[a-f0-9]{64}$/D', $r['sha256'])
    ) {
        throw new InvalidArgumentException('RESOURCE_REGISTRATION');
    }
    $root = null;
    $bootstrap = realpath($provider['resource']['file'] ?? '');
    foreach (scandir(WP_PLUGIN_DIR) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $candidate = realpath(WP_PLUGIN_DIR . '/' . $entry);
        if (
            $candidate &&
            is_dir($candidate) &&
            $bootstrap &&
            str_starts_with($bootstrap, $candidate . '/')
        ) {
            $root = $candidate;
            break;
        }
    }
    if (!$root || !str_starts_with($r['file'], $root . '/')) {
        throw new InvalidArgumentException('RESOURCE_ROOT');
    }
    $relative = substr($r['file'], strlen($root) + 1);
    $file = mbb_component_resource_file($root, $relative, 16384);
    if (
        $r['url'] !== plugins_url(basename($file), $file) ||
        parse_url($r['url'], PHP_URL_HOST) !== parse_url(site_url(), PHP_URL_HOST)
    ) {
        throw new InvalidArgumentException('RESOURCE_URL');
    }
    $raw = file_get_contents($file, false, null, 0, 16385);
    if (
        $raw === false ||
        strlen($raw) > 16384 ||
        !hash_equals($r['sha256'], hash('sha256', $raw))
    ) {
        throw new InvalidArgumentException('MANIFEST_SHA');
    }
    $plan = mbb_component_resource_manifest(mbb_component_resource_json($raw));
    if (
        $plan['version'] !== $provider['version'] ||
        explode('/', $relative)[1] !== $plan['version']
    ) {
        throw new InvalidArgumentException('MANIFEST_VERSION');
    }
    foreach ($plan['resources'] as &$item) {
        if ($item['path'] === $relative) {
            throw new InvalidArgumentException('MANIFEST_SELF');
        }
        $item['file'] = mbb_component_resource_file($root, $item['path'], 1048576);
        $bytes = file_get_contents($item['file'], false, null, 0, $item['bytes'] + 1);
        if (
            $bytes === false ||
            strlen($bytes) !== $item['bytes'] ||
            !hash_equals($item['sha256'], hash('sha256', $bytes))
        ) {
            throw new InvalidArgumentException('RESOURCE_SHA');
        }
    }
    unset($item);
    return $plan + [
        'manifestFile' => $file,
        'manifestSha256' => $r['sha256'],
        'groupSha256' => hash(
            'sha256',
            "mbb-resources/v2\n" . $plan['version'] . "\n" . $r['sha256'],
        ),
        'baseUrl' => substr($r['url'], 0, -strlen($relative)),
    ];
}
function markbridge_teaching_supports_resource_groups(): bool
{
    return true;
}

/** Trusted projections may read only registered fixed public data, never article URLs or scripts. */
function markbridge_teaching_resource_bytes(string $component, string $version, string $id): string
{
    $p = mbb_component_provider($component, $version);
    if (!$p || $p['protocolVersion'] !== 2 || $p['status'] !== 'available') {
        throw new RuntimeException('RESOURCE_PROVIDER');
    }
    $checked = mbb_component_v2_check($p);
    foreach ($checked['plan']['resources'] as $item) {
        if ($item['id'] !== $id) {
            continue;
        }
        if ($item['type'] === 'javascript') {
            throw new RuntimeException('RESOURCE_NOT_DATA');
        }
        $bytes = file_get_contents($item['file'], false, null, 0, $item['bytes'] + 1);
        if (
            $bytes === false ||
            strlen($bytes) !== $item['bytes'] ||
            !hash_equals($item['sha256'], hash('sha256', $bytes))
        ) {
            throw new RuntimeException('RESOURCE_CHANGED');
        }
        return $bytes;
    }
    throw new RuntimeException('RESOURCE_ID');
}
