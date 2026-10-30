<?php
/** Closed v3 author contract; public geometry continues to use closed v1 data. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
require_once __DIR__ . '/relation-map-v2.php';
function mbb_relation_map_v3_valid(mixed $p): bool
{
    $closed = static function ($v, $keys) {
        if (!($v instanceof stdClass)) {
            return false;
        }
        $actual = array_keys(get_object_vars($v));
        sort($actual);
        sort($keys);
        return $actual === $keys;
    };
    if (
        !$closed($p, ['format', 'title', 'groups', 'nodes', 'edges', 'display']) ||
        $p->format !== 'relation-map/v3' ||
        !$closed($p->display, ['mobileStart']) ||
        !$closed($p->display->mobileStart, ['kind', 'id'])
    ) {
        return false;
    }
    $hint = $p->display->mobileStart;
    if (!is_string($hint->id) || !in_array($hint->kind, ['auto', 'group', 'node'], true)) {
        return false;
    }
    if ($hint->kind === 'auto') {
        if ($hint->id !== '') {
            return false;
        }
    } else {
        $items = $hint->kind === 'group' ? $p->groups ?? null : $p->nodes ?? null;
        if (
            !is_array($items) ||
            !array_filter($items, static fn($n) => ($n->id ?? null) === $hint->id)
        ) {
            return false;
        }
    }
    $copy = clone $p;
    unset($copy->display);
    $copy->format = 'relation-map/v2';
    return mbb_relation_map_v2_valid($copy) &&
        strlen(json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) <= 16384;
}

function mbb_relation_map_v3_public_display(mixed $display, mixed $map): bool
{
    $display = json_decode(json_encode($display));
    if (
        !($display instanceof stdClass) ||
        array_keys(get_object_vars($display)) !== ['mobileStart']
    ) {
        return false;
    }
    $h = $display->mobileStart;
    if ($h === null) {
        return true;
    }
    if (!($h instanceof stdClass)) {
        return false;
    }
    $keys = array_keys(get_object_vars($h));
    sort($keys);
    if (
        $keys !== ['id', 'kind'] ||
        !is_string($h->id) ||
        !in_array($h->kind, ['group', 'node'], true)
    ) {
        return false;
    }
    $prefix = $h->kind === 'group' ? 'g' : 'n';
    $items = $h->kind === 'group' ? $map->groups ?? [] : $map->nodes ?? [];
    return preg_match('/^' . $prefix . '_[a-f0-9]{32}$/D', $h->id) &&
        (bool) array_filter($items, static fn($n) => $n->id === $h->id);
}
