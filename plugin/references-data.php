<?php
// Derived structural data only; no database, authorization or content writes.
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function mbb_references_target(mixed $value): bool
{
    return is_array($value) &&
        count($value) === 4 &&
        !array_diff(array_keys($value), ['namespace', 'document', 'target', 'kind']) &&
        is_string($value['namespace']) &&
        preg_match('/^S_[a-f0-9]{32}$/D', $value['namespace']) &&
        is_string($value['document']) &&
        preg_match('/^D_[a-f0-9]{32}$/D', $value['document']) &&
        is_string($value['target']) &&
        preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $value['target']) &&
        in_array(
            $value['kind'],
            ['equation', 'figure', 'table', 'listing', 'statement', 'step'],
            true,
        );
}
function mbb_references_marker(array $value): string
{
    if (!mbb_references_target($value)) {
        throw new InvalidArgumentException('Invalid cross-document target');
    }
    return '<span data-mbb-target="' .
        $value['target'] .
        '" data-mbb-version="2" data-mbb-namespace="' .
        $value['namespace'] .
        '" data-mbb-document="' .
        $value['document'] .
        '" data-mbb-kind="' .
        $value['kind'] .
        '" class="mbb-xref">[' .
        $value['target'] .
        ']</span>';
}
function mbb_references_projection(string $serialized): array
{
    if (strlen($serialized) > 262144) {
        throw new RuntimeException('Reference document exceeds its existing budget');
    }
    $out = ['identity' => null, 'objects' => [], 'edges' => []];
    $count = 0;
    $numbers = [];
    $walk = function ($blocks, $depth = 0) use (&$walk, &$out, &$count, &$numbers) {
        foreach ($blocks as $block) {
            if (++$count > 10000 || $depth > 32) {
                throw new RuntimeException('Reference structure exceeds its existing budget');
            }
            $name = $block['blockName'];
            $a = $block['attrs'];
            if ($name === 'mbb/identity') {
                if (
                    $out['identity'] ||
                    $depth ||
                    $block['innerBlocks'] ||
                    trim($block['innerHTML']) ||
                    count($a) !== 3 ||
                    ($a['version'] ?? null) !== 1 ||
                    !preg_match('/^S_[a-f0-9]{32}$/D', $a['namespace'] ?? '') ||
                    !preg_match('/^D_[a-f0-9]{32}$/D', $a['document'] ?? '')
                ) {
                    throw new RuntimeException('Invalid logical document identity');
                }
                $out['identity'] = ['namespace' => $a['namespace'], 'document' => $a['document']];
            }
            $kind =
                $name === 'mbb/object'
                    ? $a['kind'] ?? ''
                    : ($name === 'mbb/statement'
                        ? 'statement'
                        : ($name === 'mbb/step'
                            ? 'step'
                            : null));
            if (
                $kind &&
                in_array(
                    $kind,
                    ['equation', 'figure', 'table', 'listing', 'statement', 'step'],
                    true,
                )
            ) {
                $id = $a['id'] ?? '';
                if (
                    !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $id) ||
                    isset($out['objects'][$id])
                ) {
                    throw new RuntimeException('Invalid or duplicate reference target');
                }
                $numberKind = $name === 'mbb/statement' ? $a['kind'] ?? 'statement' : $kind;
                $numbers[$numberKind] = ($numbers[$numberKind] ?? 0) + 1;
                // Titles remain ephemeral: persistence stores IDs/kinds only.
                $out['objects'][$id] = [
                    'id' => $id,
                    'kind' => $kind,
                    'title' => $a['title'] ?? ($a['caption'] ?? ''),
                    'number' => $numbers[$numberKind],
                    'displayKind' => $numberKind,
                ];
            }
            // Parse direct HTML fragments, excluding literal code/pre and all nested block copies.
            $html = implode(
                '',
                array_filter($block['innerContent'], static fn($part) => is_string($part)),
            );
            $html = preg_replace('~<(pre|code)\b[^>]*>[\s\S]*?</\1\s*>~i', '', $html);
            if (str_contains($html, 'data-mbb-version="2"')) {
                $dom = new DOMDocument();
                $old = libxml_use_internal_errors(true);
                try {
                    $dom->loadHTML(
                        '<?xml encoding="utf-8"?><body>' . $html . '</body>',
                        LIBXML_NONET,
                    );
                    foreach ($dom->getElementsByTagName('span') as $span) {
                        if (
                            $span->getAttribute('class') !== 'mbb-xref' ||
                            $span->getAttribute('data-mbb-version') !== '2'
                        ) {
                            continue;
                        }
                        $value = [
                            'namespace' => $span->getAttribute('data-mbb-namespace'),
                            'document' => $span->getAttribute('data-mbb-document'),
                            'target' => $span->getAttribute('data-mbb-target'),
                            'kind' => $span->getAttribute('data-mbb-kind'),
                        ];
                        if (
                            $span->attributes->length !== 6 ||
                            !mbb_references_target($value) ||
                            $span->textContent !== '[' . $value['target'] . ']'
                        ) {
                            throw new RuntimeException('Malformed cross-document reference');
                        }
                        $out['edges'][hash('sha256', json_encode($value))] = $value;
                        if (count($out['edges']) > 4096) {
                            throw new RuntimeException(
                                'Reference count exceeds its existing budget',
                            );
                        }
                    }
                } finally {
                    libxml_clear_errors();
                    libxml_use_internal_errors($old);
                }
            }
            $walk($block['innerBlocks'], $depth + 1);
        }
    };
    $walk(parse_blocks($serialized));
    $out['edges'] = array_values($out['edges']);
    return $out;
}
function mbb_references_insert_identity(string $source, array $identity): string
{
    $header = \MarkBridge\Probe\FrontMatter::parse($source);
    $prefix = $header['raw'] ?? '';
    $body = $header['body'] ?? $source;
    return $prefix .
        ($prefix !== '' && !str_ends_with($prefix, "\n") ? "\n" : '') .
        ($prefix !== '' ? "\n" : '') .
        ':::mbb:v1 identity ' .
        json_encode($identity, JSON_UNESCAPED_SLASHES) .
        "\n\n:::mbb:end\n\n" .
        $body;
}
function mbb_references_replace_tuple(string $source, array $before, array $after): string
{
    return mbb_references_replace_tuples($source, [['before' => $before, 'after' => $after]]);
}
function mbb_references_replace_tuples(string $source, array $mappings): string
{
    $map = [];
    foreach ($mappings as $item) {
        $map[$item['before']['namespace'] . '/' . $item['before']['document']] = $item['after'];
    }
    // Transform the validated tree once, so mappings cannot cascade. Literal code stays untouched.
    $pair = mbb_convert([
        'mode' => 'markdown',
        'source' => $source,
        'documentId' => 'ReferenceCandidate',
    ]);
    if (is_wp_error($pair)) {
        throw new RuntimeException($pair->get_error_message());
    }
    $blocks = parse_blocks($pair['serialized']);
    $walk = function (&$blocks) use (&$walk, $map) {
        foreach ($blocks as &$block) {
            if (
                $block['blockName'] === 'mbb/identity' &&
                ($after =
                    $map[
                        ($block['attrs']['namespace'] ?? '') .
                            '/' .
                            ($block['attrs']['document'] ?? '')
                    ] ?? null)
            ) {
                $block['attrs']['namespace'] = $after['namespace'];
                $block['attrs']['document'] = $after['document'];
            }
            foreach ($block['innerContent'] as &$html) {
                if (!is_string($html) || !str_contains($html, 'data-mbb-version="2"')) {
                    continue;
                }
                // Replace only validated span markers outside literal pre/code. Other bytes are untouched.
                $html = preg_replace_callback(
                    '~<(pre|code)\b[^>]*>[\s\S]*?</\1\s*>|<span\b[^>]*>[\s\S]*?</span>~i',
                    static function ($m) use ($map) {
                        if (!str_starts_with($m[0], '<span')) {
                            return $m[0];
                        }
                        $dom = new DOMDocument();
                        $old = libxml_use_internal_errors(true);
                        try {
                            $dom->loadHTML('<?xml encoding="utf-8"?>' . $m[0], LIBXML_NONET);
                            $n = $dom->getElementsByTagName('span')->item(0);
                            if (
                                !$n ||
                                $n->getAttribute('class') !== 'mbb-xref' ||
                                $n->getAttribute('data-mbb-version') !== '2' ||
                                !($after =
                                    $map[
                                        $n->getAttribute('data-mbb-namespace') .
                                            '/' .
                                            $n->getAttribute('data-mbb-document')
                                    ] ?? null)
                            ) {
                                return $m[0];
                            }
                            return mbb_references_marker([
                                'namespace' => $after['namespace'],
                                'document' => $after['document'],
                                'target' => $n->getAttribute('data-mbb-target'),
                                'kind' => $n->getAttribute('data-mbb-kind'),
                            ]);
                        } finally {
                            libxml_clear_errors();
                            libxml_use_internal_errors($old);
                        }
                    },
                    $html,
                );
            }
            unset($html);
            $block['innerHTML'] = implode('', array_filter($block['innerContent'], 'is_string'));
            $walk($block['innerBlocks']);
        }
        unset($block);
    };
    $walk($blocks);
    $serialized = serialize_blocks($blocks);
    $result = mbb_convert([
        'mode' => 'blocks',
        'serialized' => $serialized,
        'documentId' => $pair['documentId'],
        'base' => $pair,
    ]);
    if (is_wp_error($result)) {
        throw new RuntimeException($result->get_error_message());
    }
    return $result['source'];
}
