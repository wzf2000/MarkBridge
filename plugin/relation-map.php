<?php
/** Fixed relation-map/v1 data contract; never accepts author HTML, SVG or executable code. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function mbb_relation_map_url(mixed $v): bool
{
    if (
        !is_string($v) ||
        $v === '' ||
        strlen($v) > 1024 ||
        preg_match('//u', $v) !== 1 ||
        trim($v) !== $v ||
        preg_match('/[\s\x{0000}-\x{0020}\x{007f}-\x{009f}\x{FEFF}\\\\]/u', $v) ||
        preg_match('/%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i', $v) ||
        str_starts_with($v, '//')
    ) {
        return false;
    }
    if (preg_match('~^https?://~i', $v)) {
        if (
            !preg_match(
                '~^https?://(\[[0-9a-f:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?(?:[/?#][^\s\\\\]*)?$~iD',
                $v,
                $match,
            ) ||
            (isset($match[2]) && (int) $match[2] > 65535)
        ) {
            return false;
        }
        $host = $match[1];
        if (
            str_starts_with($host, '[') &&
            filter_var(substr($host, 1, -1), FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) === false
        ) {
            return false;
        }
        if (
            preg_match('/^[0-9.]+$/D', $host) &&
            filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false
        ) {
            return false;
        }
        $u = parse_url($v);
        return is_array($u) && !empty($u['host']) && !isset($u['user']) && !isset($u['pass']);
    }
    return !str_contains($v, ':') && !str_starts_with($v, '?//');
}
/** Same conservative escaped-byte estimate as JS; URL bytes allow entity/URI expansion. */
function mbb_relation_map_static_bytes(stdClass $p): int
{
    $escaped = static fn($s) => strlen(preg_replace('/[&<>"\']/u', '&&&&&&', $s));
    $link = static fn($n) => $escaped($n->title) + 6 * strlen($n->url);
    $nodes = [];
    $total = 16384 + $escaped($p->title);
    foreach ($p->groups as $g) {
        $total += 128 + $escaped($g->title);
    }
    foreach ($p->nodes as $n) {
        $nodes[$n->id] = $n;
        $total += 128 + $link($n) + $escaped($n->description ?? '');
    }
    foreach ($p->edges as $e) {
        $total += 128 + $link($nodes[$e->from]) + $link($nodes[$e->to]) + $escaped($e->why ?? '');
    }
    return $total;
}
function mbb_relation_map_valid(mixed $p, int $drawingBytes = 16384): bool
{
    $closed = static fn($v, $keys, $optional = []) => $v instanceof stdClass &&
        !array_diff(array_keys(get_object_vars($v)), array_merge($keys, $optional)) &&
        !array_diff($keys, array_keys(get_object_vars($v)));
    $text = static function ($v, $max, $empty = false) {
        return is_string($v) &&
            preg_match('//u', $v) === 1 &&
            ($empty ||
                preg_match(
                    '/[^\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]/u',
                    $v,
                ) === 1) &&
            preg_match_all('/./us', $v) <= $max &&
            !preg_match('/[\x{0000}-\x{001f}\x{007f}-\x{009f}]/u', $v);
    };
    $id = static fn($v) => is_string($v) && preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $v);
    if (
        !$closed($p, ['format', 'title', 'groups', 'nodes', 'edges']) ||
        $p->format !== 'relation-map/v1' ||
        !in_array($drawingBytes, [16384, 65536], true) ||
        !$text($p->title, 160) ||
        !is_array($p->groups) ||
        !array_is_list($p->groups) ||
        count($p->groups) < 1 ||
        count($p->groups) > 8 ||
        !is_array($p->nodes) ||
        !array_is_list($p->nodes) ||
        count($p->nodes) < 1 ||
        count($p->nodes) > 64 ||
        !is_array($p->edges) ||
        !array_is_list($p->edges) ||
        count($p->edges) > 128 ||
        strlen(json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) > $drawingBytes
    ) {
        return false;
    }
    $groups = [];
    $nodes = [];
    $edges = [];
    foreach ($p->groups as $g) {
        if (
            !$closed($g, ['id', 'title']) ||
            !$id($g->id) ||
            isset($groups[$g->id]) ||
            !$text($g->title, 80)
        ) {
            return false;
        }
        $groups[$g->id] = 0;
    }
    foreach ($p->nodes as $n) {
        if (
            !$closed($n, ['id', 'group', 'title', 'url'], ['description']) ||
            !$id($n->id) ||
            isset($nodes[$n->id]) ||
            (!is_string($n->group) || !array_key_exists($n->group, $groups)) ||
            !$text($n->title, 160) ||
            !$text(property_exists($n, 'description') ? $n->description : '', 240, true) ||
            !mbb_relation_map_url($n->url)
        ) {
            return false;
        }
        $nodes[$n->id] = $n;
        $groups[$n->group]++;
    }
    foreach ($p->edges as $e) {
        $key = json_encode([$e->from ?? null, $e->to ?? null, $e->kind ?? null]);
        if (
            !$closed($e, ['from', 'to', 'kind'], ['why']) ||
            (!is_string($e->from) ||
                !is_string($e->to) ||
                !isset($nodes[$e->from], $nodes[$e->to])) ||
            $e->from === $e->to ||
            !in_array($e->kind, ['recommended', 'compare', 'optimization'], true) ||
            isset($edges[$key]) ||
            !$text(property_exists($e, 'why') ? $e->why : '', 240, true)
        ) {
            return false;
        }
        $edges[$key] = true;
    }
    return !in_array(0, $groups, true) && mbb_relation_map_static_bytes($p) <= 122880;
}
function markbridge_teaching_supports_relation_map(): bool
{
    return true;
}
function mbb_relation_map_envelope(mixed $p, string $locale, int $drawingBytes = 16384): array
{
    if (!mbb_relation_map_valid($p, $drawingBytes)) {
        throw new RuntimeException('relation_map_params');
    }
    return [
        'schema' => 'relation-map/v1',
        'map' => $p,
        'locale' => str_starts_with($locale, 'zh') ? 'zh' : 'en',
    ];
}
function mbb_relation_map_message(string $message, string $locale): string
{
    static $messages = null;
    if ($locale !== 'zh') {
        return $message;
    }
    if ($messages === null) {
        $messages = json_decode(
            (string) file_get_contents(__DIR__ . '/languages/messages.json'),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
    }
    return $messages[$message] ?? $message;
}
function mbb_relation_map_append(
    DOMDocument $doc,
    DOMElement $root,
    array $view,
    ?string $semantics = null,
    array $edgeIds = [],
    int $drawingBytes = 16384,
): void {
    if (
        array_keys($view) !== ['schema', 'map', 'locale'] ||
        $view['schema'] !== 'relation-map/v1' ||
        !in_array($view['locale'], ['zh', 'en'], true) ||
        !mbb_relation_map_valid($view['map'], $drawingBytes) ||
        ($drawingBytes === 65536 && !mbb_relation_map_edge_ids_valid($edgeIds, $view['map']))
    ) {
        throw new RuntimeException('relation_map_projection');
    }
    $p = $view['map'];
    $T = static fn($message) => mbb_relation_map_message($message, $view['locale']);
    $knowledge = $semantics === 'knowledge-map/v1';
    $kinds = $knowledge
        ? ($view['locale'] === 'zh'
            ? ['recommended' => '先了解', 'compare' => '解释关系', 'optimization' => '配套练习']
            : [
                'recommended' => 'Prior understanding',
                'compare' => 'Explanation relationship',
                'optimization' => 'Related practice',
            ])
        : [
            'recommended' => $T('Suggested reading order'),
            'compare' => $T('Compare ideas'),
            'optimization' => $T('For further optimization'),
        ];
    $make = static function ($parent, $tag, $text = '') use ($doc) {
        $n = $doc->createElement($tag);
        if ($text !== '') {
            $n->appendChild($doc->createTextNode($text));
        }
        $parent->appendChild($n);
        return $n;
    };
    $make($root, 'h3', $p->title);
    $make(
        $root,
        'p',
        $knowledge
            ? ($view['locale'] === 'zh'
                ? '先了解表示理解上的前置，不限制访问；解释关系与配套练习帮助联系所学。'
                : 'Prior understanding supports comprehension without restricting access; explanations and practice connect the material.')
            : $T(
                'Relations suggest reading paths and connections; choose your own starting point.',
            ),
    );
    $nodes = [];
    foreach ($p->groups as $g) {
        $section = $make($root, 'section');
        $make($section, 'h3', $g->title);
        $ul = $make($section, 'ul');
        foreach ($p->nodes as $n) {
            $nodes[$n->id] = $n;
            if ($n->group !== $g->id) {
                continue;
            }
            $li = $make($ul, 'li');
            $a = $make($li, 'a', $n->title);
            $a->setAttribute('href', $n->url);
            if (($n->description ?? '') !== '') {
                $make($li, 'p', $n->description);
            }
        }
    }
    $make($root, 'h3', $T('All relationships'));
    $ul = $make($root, 'ul');
    foreach ($p->edges as $edgeIndex => $e) {
        $li = $make($ul, 'li');
        if (
            isset($edgeIds[$edgeIndex]) &&
            preg_match('/^e_[a-f0-9]{32}$/D', $edgeIds[$edgeIndex])
        ) {
            $li->setAttribute('data-mbb-edge-id', $edgeIds[$edgeIndex]);
            $li->setAttribute('data-from', $e->from);
            $li->setAttribute('data-to', $e->to);
            $li->setAttribute('data-kind', $e->kind);
        }
        foreach (['from', 'to'] as $i => $key) {
            if ($i) {
                $li->appendChild($doc->createTextNode(' → '));
            }
            $a = $make($li, 'a', $nodes[$e->$key]->title);
            $a->setAttribute('href', $nodes[$e->$key]->url);
        }
        $li->appendChild(
            $doc->createTextNode(
                ' · ' . $kinds[$e->kind] . (($e->why ?? '') !== '' ? '：' . $e->why : ''),
            ),
        );
    }
}

/** Public identity carrier, always aligned with the closed drawing edge array. */
function mbb_relation_map_edge_ids_valid(mixed $ids, mixed $map): bool
{
    return ($map === null && $ids === []) ||
        (is_array($ids) &&
            array_is_list($ids) &&
            is_array($map->edges ?? null) &&
            count($ids) === count($map->edges) &&
            count(array_unique($ids, SORT_REGULAR)) === count($ids) &&
            !array_filter(
                $ids,
                static fn($id) => !is_string($id) || !preg_match('/^e_[a-f0-9]{32}$/D', $id),
            ));
}
