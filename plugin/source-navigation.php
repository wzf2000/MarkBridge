<?php
/**
 * Preview-only provenance for an already validated raw-source/block pair.
 * Offsets: raw UTF-16 [start,end); inclusive physical startLine/endLine.
 * Paths count named semantic siblings; IDs are preview-local r0..r2047.
 * Ranges/unmapped are capped at 2048 each. No source or attrs are mutated.
 */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}

function mbb_source_navigation(string $source, array $blocks): array
{
    $result = ['schema' => 1, 'offsetUnit' => 'utf16', 'ranges' => [], 'unmapped' => []];
    if (strlen($source) > 262144 || str_contains($source, "\0") || !preg_match('//u', $source)) {
        $result['unmapped'][] = ['blockPath' => [], 'reason' => 'invalid-input'];
        return $result;
    }
    $blank = static fn(string $s): bool => preg_match('/^[ \t]*$/D', $s) === 1;
    $fence = static function (string $s): ?array {
        return preg_match('/^ {0,3}(`{3,}|~{3,})[^\r\n]*$/D', $s, $m) ? $m : null;
    };
    $heading = static fn(string $s): bool => preg_match('/^ {0,3}#{1,6}(?:[ \t]+|$)/D', $s) === 1;
    $list = static fn(string $s): bool => preg_match(
        '/^ {0,3}(?:[-+*][ \t]+|\d{1,9}[.)][ \t]+)/',
        $s,
    ) === 1;
    $quote = static fn(string $s): bool => preg_match('/^ {0,3}>/', $s) === 1;
    $definition = static function (string $s): ?array {
        return preg_match('/^ {0,3}\[\^([^\]\r\n]+)\]:/u', $s, $m) ? $m : null;
    };
    $directive = static function (string $s): ?array {
        return preg_match('/^:::mbb:v1 ([a-z-]+) (\{.*\})$/Du', $s, $m) ? $m : null;
    };
    $separator = static fn(string $s): bool => preg_match(
        '/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/D',
        $s,
    ) === 1;
    $setext = static fn(string $s): bool => preg_match('/^ {0,3}(?:=+|-+)[ \t]*$/D', $s) === 1;
    $ownMath = static fn(string $s): bool => preg_match('/^[ \t]*\$\$[ \t]*$/D', $s) === 1;
    $boundary = static fn(string $s): bool => $blank($s) ||
        $fence($s) ||
        $heading($s) ||
        $list($s) ||
        $quote($s) ||
        $definition($s) ||
        $directive($s) ||
        $s === ':::mbb:end' ||
        $separator($s) ||
        $ownMath($s) ||
        preg_match('/^ {0,3}</', $s);
    $lines = [];
    $offset = 0;
    $byteOffset = 0;
    preg_match_all('/[^\r\n]*(?:\r\n|\r|\n|$)/u', $source, $rawLines);
    foreach ($rawLines[0] as $raw) {
        if ($raw === '') {
            continue;
        }
        $size = strlen(mb_convert_encoding($raw, 'UTF-16LE', 'UTF-8')) / 2;
        $lines[] = [
            'text' => preg_replace('/[\r\n]+$/D', '', $raw),
            'start' => $offset,
            'end' => $offset + (int) $size,
            'byteStart' => $byteOffset,
            'byteEnd' => $byteOffset + strlen($raw),
        ];
        $offset += (int) $size;
        $byteOffset += strlen($raw);
    }
    $definitions = [];
    $duplicateDefinition = false;
    $unsupportedSyntax = false;
    $unit = static fn(string $kind, int $start, int $end, array $extra = []): array => [
        'kind' => $kind,
        'start' => $lines[$start]['start'],
        'end' => $lines[$end - 1]['end'],
        'startLine' => $start + 1,
        'endLine' => $end,
        'precision' => in_array($kind, ['quote', 'list', 'teaching'], true) ? 'coarse' : 'exact',
    ] + $extra;
    $paragraphKinds = static function (string $text): array {
        $marks = [];
        $ticks = 0;
        $length = strlen($text);
        for ($i = 0; $i < $length; $i++) {
            if ($text[$i] === '\\' && !$ticks) {
                $i++;
                continue;
            }
            if ($text[$i] === '`') {
                $count = 1;
                while ($i + $count < $length && $text[$i + $count] === '`') {
                    $count++;
                }
                if (!$ticks) {
                    $ticks = $count;
                } elseif ($ticks === $count) {
                    $ticks = 0;
                }
                $i += $count - 1;
                continue;
            }
            if (!$ticks && substr($text, $i, 2) === '$$') {
                $marks[] = $i;
                $i++;
            }
        }
        if (!$marks) {
            return ['paragraph'];
        }
        if (count($marks) % 2) {
            return ['unknown'];
        }
        $kinds = [];
        $cursor = 0;
        for ($i = 0; $i < count($marks); $i += 2) {
            if (
                preg_match(
                    '/[^\p{Z}\x{FEFF}\x09-\x0d]/u',
                    substr($text, $cursor, $marks[$i] - $cursor),
                )
            ) {
                $kinds[] = 'paragraph';
            }
            $kinds[] = 'math';
            $cursor = $marks[$i + 1] + 2;
        }
        if (preg_match('/[^\p{Z}\x{FEFF}\x09-\x0d]/u', substr($text, $cursor))) {
            $kinds[] = 'paragraph';
        }
        return $kinds;
    };
    $scan = function (int $from, int $until, int $depth = 0) use (
        &$scan,
        &$definitions,
        &$duplicateDefinition,
        &$unsupportedSyntax,
        $lines,
        $source,
        $unit,
        $blank,
        $fence,
        $directive,
        $definition,
        $ownMath,
        $heading,
        $separator,
        $quote,
        $list,
        $boundary,
        $setext,
        $paragraphKinds,
    ): array {
        $units = [];
        if ($depth > 32) {
            return [['kind' => 'unknown']];
        }
        $i = $from;
        while ($i < $until) {
            $line = $lines[$i]['text'];
            if ($blank($line)) {
                $i++;
                continue;
            }
            $start = $i;
            $f = $fence($line);
            $d = $directive($line);
            $note = $definition($line);
            if ($i === 0 && $line === '---' && ($lines[$i + 1]['text'] ?? '') === 'markbridge: 1') {
                $i += 2;
                while ($i < $until && $lines[$i]['text'] !== '---') {
                    $i++;
                }
                if ($i === $until) {
                    $units[] = $unit('unknown', $start, $i);
                    break;
                }
                $units[] = $unit('frontmatter', $start, ++$i);
                continue;
            }
            if ($f) {
                $i++;
                $close =
                    '/^ {0,3}' . preg_quote($f[1][0], '/') . '{' . strlen($f[1]) . ',}[ \t]*$/D';
                while ($i < $until && !preg_match($close, $lines[$i]['text'])) {
                    $i++;
                }
                $units[] = $unit($i < $until ? 'code' : 'unknown', $start, $i < $until ? ++$i : $i);
                continue;
            }
            if ($d) {
                $attrs = json_decode($d[2], true) ?: [];
                $i++;
                $level = 1;
                while ($i < $until && $level) {
                    $nestedFence = $fence($lines[$i]['text']);
                    if ($nestedFence) {
                        $close =
                            '/^ {0,3}' .
                            preg_quote($nestedFence[1][0], '/') .
                            '{' .
                            strlen($nestedFence[1]) .
                            ',}[ \t]*$/D';
                        $i++;
                        while ($i < $until && !preg_match($close, $lines[$i]['text'])) {
                            $i++;
                        }
                        if ($i < $until) {
                            $i++;
                        }
                        continue;
                    }
                    if ($directive($lines[$i]['text'])) {
                        $level++;
                    }
                    if ($lines[$i]['text'] === ':::mbb:end') {
                        $level--;
                    }
                    if ($level) {
                        $i++;
                    }
                }
                if ($i === $until) {
                    $units[] = $unit('unknown', $start, $i);
                    break;
                }
                $children = $scan($start + 1, $i, $depth + 1);
                $units[] = $unit('teaching', $start, ++$i, [
                    'teachingKind' => $d[1],
                    'stableId' => $attrs['id'] ?? null,
                    'anchor' => $attrs['anchor'] ?? null,
                    'children' => $children,
                ]);
                continue;
            }
            if ($note) {
                $i++;
                while (
                    $i < $until &&
                    (preg_match('/^(?: {4}|\t)/', $lines[$i]['text']) ||
                        ($blank($lines[$i]['text']) &&
                            $i + 1 < $until &&
                            preg_match('/^(?: {4}|\t)/', $lines[$i + 1]['text'])))
                ) {
                    $i++;
                }
                if ($i < $until && !$boundary($lines[$i]['text'])) {
                    $unsupportedSyntax = true;
                }
                if (isset($definitions[$note[1]])) {
                    $duplicateDefinition = true;
                }
                $definitions[$note[1]] = $unit('footnote', $start, $i);
                continue;
            }
            if ($ownMath($line)) {
                $i++;
                while ($i < $until && !$ownMath($lines[$i]['text'])) {
                    $i++;
                }
                $units[] = $unit($i < $until ? 'math' : 'unknown', $start, $i < $until ? ++$i : $i);
                continue;
            }
            if ($heading($line)) {
                $units[] = $unit('heading', $start, ++$i);
                continue;
            }
            if ($separator($line)) {
                $units[] = $unit('separator', $start, ++$i);
                continue;
            }
            if ($quote($line) || $list($line)) {
                $kind = $quote($line) ? 'quote' : 'list';
                $i++;
                while ($i < $until) {
                    $next = $lines[$i]['text'];
                    if ($kind === 'quote') {
                        if (!$quote($next)) {
                            break;
                        }
                    } elseif ($blank($next)) {
                        if (
                            $i + 1 >= $until ||
                            (!$list($lines[$i + 1]['text']) &&
                                !preg_match('/^[ \t]+\S/', $lines[$i + 1]['text']))
                        ) {
                            break;
                        }
                    } elseif (
                        !$list($next) &&
                        !preg_match('/^[ \t]+/', $next) &&
                        $boundary($next)
                    ) {
                        break;
                    }
                    $i++;
                }
                $units[] = $unit($kind, $start, $i);
                continue;
            }
            if (
                preg_match('/^ {0,3}</', $line) ||
                preg_match('/^ {4}\S|^\t\S/', $line) ||
                $line === ':::mbb:end'
            ) {
                $i++;
                while ($i < $until && !$blank($lines[$i]['text'])) {
                    $i++;
                }
                $units[] = $unit('unknown', $start, $i);
                continue;
            }
            $i++;
            if ($i < $until && $setext($lines[$i]['text'])) {
                $units[] = $unit('heading', $start, ++$i);
                continue;
            }
            while ($i < $until && !$boundary($lines[$i]['text'])) {
                $i++;
            }
            $span = $unit('paragraph', $start, $i);
            $raw = substr(
                $source,
                $lines[$start]['byteStart'],
                $lines[$i - 1]['byteEnd'] - $lines[$start]['byteStart'],
            );
            $kinds = $paragraphKinds($raw);
            foreach ($kinds as $kind) {
                $units[] = array_replace($span, [
                    'kind' => $kind,
                    'precision' => count($kinds) > 1 ? 'coarse' : $span['precision'],
                ]);
            }
        }
        return $units;
    };
    $syntax = $scan(0, count($lines));
    $normalizedCount = 0;
    $normalize = function (array $items, int $depth = 0) use (
        &$normalize,
        &$normalizedCount,
    ): array {
        if ($depth > 32) {
            throw new RuntimeException('limit');
        }
        $out = [];
        foreach ($items as $b) {
            if (!is_array($b)) {
                throw new RuntimeException('shape');
            }
            $name = $b['name'] ?? ($b['blockName'] ?? '');
            if (!$name && preg_match('/^[ \t\r\n]*$/D', $b['innerHTML'] ?? '')) {
                continue;
            }
            if (++$normalizedCount > 10000 || !$name) {
                throw new RuntimeException('shape');
            }
            $out[] = [
                'name' => $name,
                'attrs' => $b['attributes'] ?? ($b['attrs'] ?? []),
                'children' => $normalize($b['innerBlocks'] ?? ($b['children'] ?? []), $depth + 1),
            ];
        }
        return $out;
    };
    $count = 0;
    $recordUnmapped = function (array $path, string $reason) use (&$result): void {
        if (count($result['unmapped']) >= 2048) {
            throw new RuntimeException('range-limit');
        }
        $result['unmapped'][] = ['blockPath' => $path, 'reason' => $reason];
    };
    $unmapped = function (array $node, array $path, string $reason) use (
        &$unmapped,
        &$count,
        &$result,
        $recordUnmapped,
    ): void {
        if (++$count > 10000) {
            throw new RuntimeException('range-limit');
        }
        $recordUnmapped($path, $reason);
        foreach ($node['children'] as $i => $child) {
            $unmapped($child, [...$path, $i], $reason);
        }
    };
    $add = function (array $node, array $path, array $span, ?string $precision = null) use (
        &$count,
        &$result,
    ): void {
        if (++$count > 10000 || count($result['ranges']) >= 2048) {
            throw new RuntimeException('range-limit');
        }
        $result['ranges'][] = [
            'id' => 'r' . count($result['ranges']),
            'blockPath' => $path,
            'kind' => $span['kind'],
            'start' => $span['start'],
            'end' => $span['end'],
            'startLine' => $span['startLine'],
            'endLine' => $span['endLine'],
            'precision' => $precision ?? $span['precision'],
        ];
    };
    $coarseChildren = function (array $node, array $path, array $span) use (
        &$coarseChildren,
        $add,
    ): void {
        foreach ($node['children'] as $i => $child) {
            $p = [...$path, $i];
            $add($child, $p, $span, 'coarse');
            $coarseChildren($child, $p, $span);
        }
    };
    $native = ['details' => 'core/details', 'buttons' => 'core/buttons', 'button' => 'core/button'];
    $names = [
        'paragraph' => ['core/paragraph'],
        'heading' => ['core/heading'],
        'code' => ['mbb/code'],
        'math' => ['mbb/math'],
        'quote' => ['core/quote'],
        'list' => ['core/list', 'mbb/list'],
        'separator' => ['core/separator'],
        'frontmatter' => ['mbb/frontmatter'],
    ];
    $bind = function (array $items, array $units, array $parentPath = []) use (
        &$bind,
        &$result,
        $definitions,
        $duplicateDefinition,
        $unmapped,
        $add,
        $coarseChildren,
        $names,
        $native,
        $recordUnmapped,
    ): void {
        $ordinary = [];
        foreach ($items as $i => $node) {
            $path = [...$parentPath, $i];
            if ($node['name'] !== 'mbb/footnotes') {
                $ordinary[] = [$node, $path];
                continue;
            }
            $recordUnmapped($path, 'definition-group');
            foreach ($node['children'] as $j => $note) {
                $p = [...$path, $j];
                $span = $definitions[$note['attrs']['label'] ?? ''] ?? null;
                if ($note['name'] !== 'mbb/footnote' || !$span || $duplicateDefinition) {
                    $unmapped($note, $p, 'definition-identity');
                } else {
                    $add($note, $p, $span);
                    $coarseChildren($note, $p, $span);
                }
            }
        }
        if (count($ordinary) !== count($units)) {
            foreach ($ordinary as [$node, $path]) {
                $unmapped($node, $path, 'structure-mismatch');
            }
            return;
        }
        $blocked = false;
        foreach ($ordinary as $i => [$node, $path]) {
            $span = $units[$i];
            $allowed =
                $span['kind'] === 'teaching'
                    ? [$native[$span['teachingKind']] ?? 'mbb/' . $span['teachingKind']]
                    : $names[$span['kind']] ?? [];
            $identity =
                $span['kind'] !== 'teaching' ||
                (isset($native[$span['teachingKind']])
                    ? !$span['anchor'] || $span['anchor'] === ($node['attrs']['anchor'] ?? null)
                    : is_string($span['stableId']) &&
                        $span['stableId'] === ($node['attrs']['id'] ?? null));
            if ($blocked || !in_array($node['name'], $allowed, true) || !$identity) {
                $blocked = true;
                $unmapped($node, $path, 'unsupported-structure');
                continue;
            }
            if (
                $span['kind'] === 'teaching' &&
                in_array($span['teachingKind'], ['code-tabs', 'button', 'bibliography'], true) &&
                $node['children']
            ) {
                $blocked = true;
                $unmapped($node, $path, 'unsupported-structure');
                continue;
            }
            $add($node, $path, $span);
            if ($span['kind'] === 'teaching') {
                if (
                    in_array($span['teachingKind'], ['code-tabs', 'button', 'bibliography'], true)
                ) {
                    /* body is stored as attributes */
                } elseif ($span['teachingKind'] === 'code-compare') {
                    $bind($node['children'], array_slice($span['children'], 2), $path);
                } else {
                    $bind($node['children'], $span['children'], $path);
                }
            } else {
                $coarseChildren($node, $path, $span);
            }
        }
    };
    $uncertain = function (array $units) use (&$uncertain): bool {
        foreach ($units as $u) {
            if ($u['kind'] === 'unknown' || $uncertain($u['children'] ?? [])) {
                return true;
            }
        }
        return false;
    };
    try {
        $tree = $normalize($blocks);
        if ($unsupportedSyntax || $uncertain($syntax)) {
            foreach ($tree as $i => $node) {
                $unmapped($node, [$i], 'unsupported-syntax');
            }
        } else {
            $bind($tree, $syntax);
        }
    } catch (Throwable $error) {
        if ($error->getMessage() !== 'range-limit') {
            $result['ranges'] = [];
            $result['unmapped'] = [];
        }
        $result['unmapped'] = array_slice($result['unmapped'], 0, 2047);
        $result['unmapped'][] = ['blockPath' => [], 'reason' => 'structure-limit'];
    }
    $comparePath = static function (array $a, array $b): int {
        for ($i = 0; $i < min(count($a['blockPath']), count($b['blockPath'])); $i++) {
            if ($a['blockPath'][$i] !== $b['blockPath'][$i]) {
                return $a['blockPath'][$i] <=> $b['blockPath'][$i];
            }
        }
        return count($a['blockPath']) <=> count($b['blockPath']);
    };
    usort($result['ranges'], $comparePath);
    usort($result['unmapped'], $comparePath);
    foreach ($result['ranges'] as $i => &$range) {
        $range['id'] = 'r' . $i;
    }
    unset($range);
    return $result;
}
