<?php
/** Closed knowledge-map author model. No WordPress access is performed here. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
require_once __DIR__ . '/relation-map-v2.php';
function markbridge_teaching_supports_knowledge_maps(): bool
{
    return true;
}
function mbb_knowledge_map_target(mixed $v): bool
{
    if (mbb_relation_map_v2_target($v)) {
        return true;
    }
    if (!($v instanceof stdClass)) {
        return false;
    }
    $keys = array_keys(get_object_vars($v));
    sort($keys);
    return $keys === ['document', 'kind', 'namespace', 'target'] &&
        in_array($v->kind, ['step', 'activity'], true) &&
        is_string($v->namespace) &&
        preg_match('/^S_[a-f0-9]{32}$/D', $v->namespace) &&
        is_string($v->document) &&
        preg_match('/^D_[a-f0-9]{32}$/D', $v->document) &&
        is_string($v->target) &&
        preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $v->target);
}
function mbb_knowledge_map_valid(mixed $p): bool
{
    if (
        !($p instanceof stdClass) ||
        ($p->format ?? null) !== 'knowledge-map/v1' ||
        !is_array($p->nodes ?? null) ||
        count($p->nodes) > 32 ||
        !is_array($p->edges ?? null) ||
        count($p->edges) > 32
    ) {
        return false;
    }
    $copy = clone $p;
    $copy->format = 'relation-map/v1';
    $copy->nodes = [];
    $copy->edges = [];
    $adj = [];
    $seen = [];
    foreach ($p->nodes as $n) {
        if (
            !($n instanceof stdClass) ||
            !mbb_knowledge_map_target($n->target ?? null) ||
            !in_array($n->role ?? null, ['concept', 'reading', 'practice'], true) ||
            !is_string($n->title ?? null) ||
            preg_match_all('/./us', $n->title) > 96 ||
            array_diff(array_keys(get_object_vars($n)), [
                'id',
                'group',
                'title',
                'role',
                'target',
                'description',
            ])
        ) {
            return false;
        }
        $next = clone $n;
        unset($next->target, $next->role);
        $next->url = '#controlled';
        $copy->nodes[] = $next;
    }
    $kinds = [
        'prerequisite' => 'recommended',
        'explains' => 'compare',
        'practises' => 'optimization',
    ];
    foreach ($p->edges as $e) {
        if (
            !($e instanceof stdClass) ||
            !is_string($e->id ?? null) ||
            !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $e->id) ||
            isset($seen[$e->id]) ||
            !is_string($e->kind ?? null) ||
            !isset($kinds[$e->kind])
        ) {
            return false;
        }
        $seen[$e->id] = true;
        $next = clone $e;
        unset($next->id);
        $next->kind = $kinds[$e->kind];
        $copy->edges[] = $next;
        if (
            $e->kind === 'prerequisite' &&
            is_string($e->from ?? null) &&
            is_string($e->to ?? null)
        ) {
            $adj[$e->from][] = $e->to;
        }
    }
    if (
        !mbb_relation_map_valid($copy) ||
        strlen(json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) > 16384
    ) {
        return false;
    }
    $marks = [];
    $visit = function ($id) use (&$visit, &$marks, $adj): bool {
        if (($marks[$id] ?? 0) === 1) {
            return false;
        }
        if (($marks[$id] ?? 0) === 2) {
            return true;
        }
        $marks[$id] = 1;
        foreach ($adj[$id] ?? [] as $to) {
            if (!$visit($to)) {
                return false;
            }
        }
        $marks[$id] = 2;
        return true;
    };
    foreach ($p->nodes as $n) {
        if (!$visit($n->id)) {
            return false;
        }
    }
    return true;
}
