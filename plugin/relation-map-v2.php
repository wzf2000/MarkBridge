<?php
// Author data never doubles as a public view. No resolver runs outside WordPress.
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
require_once __DIR__ . '/relation-map.php';
function mbb_relation_map_v2_target(mixed $v): bool
{
    if (!($v instanceof stdClass)) {
        return false;
    }
    $keys = array_keys(get_object_vars($v));
    sort($keys);
    return ($keys === ['document', 'kind', 'namespace'] &&
        $v->kind === 'document' &&
        is_string($v->namespace) &&
        preg_match('/^S_[a-f0-9]{32}$/D', $v->namespace) &&
        is_string($v->document) &&
        preg_match('/^D_[a-f0-9]{32}$/D', $v->document)) ||
        ($keys === ['documentId', 'kind', 'site'] &&
            $v->kind === 'local-document' &&
            is_string($v->site) &&
            preg_match('/^S_[a-f0-9]{32}$/D', $v->site) &&
            is_string($v->documentId) &&
            $v->documentId !== '' &&
            strlen($v->documentId) <= 512 &&
            preg_match('//u', $v->documentId) === 1 &&
            !preg_match('/[\x{0000}-\x{001f}\x{007f}-\x{009f}]/u', $v->documentId));
}
function mbb_relation_map_v2_valid(mixed $p): bool
{
    if (
        !($p instanceof stdClass) ||
        ($p->format ?? null) !== 'relation-map/v2' ||
        !is_array($p->nodes ?? null) ||
        !is_array($p->edges ?? null)
    ) {
        return false;
    }
    $copy = clone $p;
    $copy->format = 'relation-map/v1';
    $copy->nodes = [];
    $copy->edges = [];
    $ids = [];
    foreach ($p->nodes as $n) {
        if (
            !($n instanceof stdClass) ||
            !mbb_relation_map_v2_target($n->target ?? null) ||
            array_diff(array_keys(get_object_vars($n)), [
                'id',
                'group',
                'title',
                'description',
                'target',
            ])
        ) {
            return false;
        }
        $next = clone $n;
        unset($next->target);
        $next->url = '#controlled';
        $copy->nodes[] = $next;
    }
    foreach ($p->edges as $e) {
        if (
            !($e instanceof stdClass) ||
            !is_string($e->id ?? null) ||
            !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $e->id) ||
            isset($ids[$e->id])
        ) {
            return false;
        }
        $ids[$e->id] = true;
        $next = clone $e;
        unset($next->id);
        $copy->edges[] = $next;
    }
    return mbb_relation_map_valid($copy) &&
        strlen(json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) <= 16384;
}
