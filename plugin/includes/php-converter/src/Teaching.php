<?php
namespace MarkBridge\Probe;

/** Closed v1 teaching grammar, shared semantics with src/teaching.js. */
final class Teaching
{
    public const SCHEMAS = [
        'component' => [
            'id' => 'string',
            'component' => 'string',
            'componentVersion' => 'string',
            'params' => 'object',
        ],
        'collapse' => ['id' => 'string', 'title' => 'string', 'open' => 'boolean'],
        'steps' => [
            'id' => 'string',
            'title' => 'string',
            'mode' => 'string',
            'previous' => 'boolean',
            'next' => 'boolean',
            'full' => 'boolean',
        ],
        'step' => ['id' => 'string', 'title' => 'string'],
        'code-compare' => [
            'id' => 'string',
            'leftTitle' => 'string',
            'rightTitle' => 'string',
            'leftHighlights' => 'string',
            'rightHighlights' => 'string',
        ],
    ];
    public const SOURCE_FIELDS = [
        'codeLeft' => 'string',
        'languageLeft' => 'string',
        'codeRight' => 'string',
        'languageRight' => 'string',
    ];
    public static function kind(string $name): ?string
    {
        $kind = substr($name, 4);
        return str_starts_with($name, 'mbb/') && isset(self::SCHEMAS[$kind]) ? $kind : null;
    }
    private static function fail(string $code, string $message): never
    {
        throw new ConversionError($code, $message);
    }
    public static function attrs(string $kind, mixed $attrs, bool $source = false): array
    {
        $schema =
            self::SCHEMAS[$kind] +
            (!$source ? ['version' => 'integer'] : []) +
            ($kind === 'code-compare' && !$source ? self::SOURCE_FIELDS : []);
        if (!is_array($attrs) || count($schema) !== count($attrs)) {
            self::fail('TEACHING_ATTRIBUTES', 'Incomplete teaching attributes');
        }
        foreach ($attrs as $key => $value) {
            if (!isset($schema[$key]) || gettype($value) !== $schema[$key]) {
                self::fail('TEACHING_ATTRIBUTES', 'Unknown or invalid teaching attribute');
            }
        }
        if (!$source && $attrs['version'] !== 1) {
            self::fail('TEACHING_VERSION', 'Unsupported teaching block version');
        }
        $out = [];
        foreach ($schema as $key => $type) {
            $out[$key] = $attrs[$key];
        }
        if (!preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $out['id'])) {
            self::fail('TEACHING_ID', 'Invalid stable teaching ID');
        }
        foreach (['title', 'leftTitle', 'rightTitle'] as $key) {
            if (
                isset($out[$key]) &&
                (preg_replace(
                    '/[ \t\r\n\f\v\x{0085}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]/u',
                    '',
                    $out[$key],
                ) === '' ||
                    mb_strlen($out[$key]) > 200 ||
                    preg_match('/[\r\n\x00]/', $out[$key]))
            ) {
                self::fail('TEACHING_TITLE', 'Teaching title must be nonempty single-line text');
            }
        }
        if ($kind === 'component') {
            if (
                !preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $out['component']) ||
                !preg_match('/^\d+\.\d+\.\d+$/D', $out['componentVersion'])
            ) {
                self::fail('COMPONENT_VERSION', 'Invalid component/version');
            }
            self::params($out['params']);
        }
        if (
            $kind === 'steps' &&
            (!in_array($out['mode'], ['full', 'staged'], true) || $out['full'] !== true)
        ) {
            self::fail('TEACHING_MODE', 'Full reading entry must remain enabled');
        }
        if ($kind === 'code-compare') {
            foreach (['leftHighlights', 'rightHighlights'] as $key) {
                if (
                    !preg_match('/^(?:[1-9]\d*(?:,[1-9]\d*)*)?$/D', $out[$key]) ||
                    count(array_unique(explode(',', $out[$key]))) !==
                        count(explode(',', $out[$key]))
                ) {
                    self::fail('TEACHING_LINES', 'Invalid highlighted lines');
                }
            }
            if (!$source) {
                foreach (['Left', 'Right'] as $side) {
                    if (
                        !preg_match('/^[\w+-]*$/D', $out['language' . $side]) ||
                        !str_ends_with($out['code' . $side], "\n")
                    ) {
                        self::fail('TEACHING_CODE', 'Invalid language or missing terminal newline');
                    }
                }
            }
        }
        return $out;
    }
    public static function params(mixed $value): void
    {
        if (!($value instanceof \stdClass)) {
            self::fail('COMPONENT_PARAMS', 'Parameters must be a JSON object');
        }
        $nodes = 0;
        $walk = function ($v, $depth) use (&$walk, &$nodes) {
            if (++$nodes > 1024 || $depth > 8) {
                self::fail('COMPONENT_PARAMS', 'Parameter structure exceeds budget');
            }
            if (is_string($v) && !mb_check_encoding($v, 'UTF-8')) {
                self::fail('COMPONENT_PARAMS', 'Invalid Unicode');
            }
            if (is_float($v) && !is_finite($v)) {
                self::fail('COMPONENT_PARAMS', 'Numbers must be finite');
            }
            if (is_array($v) || $v instanceof \stdClass) {
                foreach ($v as $key => $child) {
                    if (in_array((string) $key, ['__proto__', 'prototype', 'constructor'], true)) {
                        self::fail('COMPONENT_PARAMS', 'Unsafe property name');
                    }
                    $walk($child, $depth + 1);
                }
            }
        };
        $walk($value, 0);
        if (strlen(self::encode($value)) > 16384) {
            self::fail('COMPONENT_PARAMS', 'Parameters exceed 16 KiB');
        }
    }
    /** JSON.stringify ordering and numeric spelling, including empty objects. */
    public static function encode(mixed $value): string
    {
        $precision = ini_get('serialize_precision');
        ini_set('serialize_precision', '-1');
        try {
            return self::encodeValue($value);
        } finally {
            ini_set('serialize_precision', (string) $precision);
        }
    }
    private static function encodeValue(mixed $value): string
    {
        if (is_array($value) && array_is_list($value)) {
            return '[' . implode(',', array_map([self::class, 'encodeValue'], $value)) . ']';
        }
        if (is_array($value) || $value instanceof \stdClass) {
            $props = (array) $value;
            $indices = [];
            $ordinary = [];
            foreach ($props as $key => $v) {
                $k = (string) $key;
                if (preg_match('/^(0|[1-9]\d*)$/D', $k) && (float) $k < 4294967295) {
                    $indices[$k] = $v;
                } else {
                    $ordinary[$k] = $v;
                }
            }
            uksort($indices, static fn($a, $b) => (float) $a <=> (float) $b);
            $parts = [];
            foreach ($indices + $ordinary as $key => $v) {
                $parts[] = self::encodeValue((string) $key) . ':' . self::encodeValue($v);
            }
            return '{' . implode(',', $parts) . '}';
        }
        if (is_int($value) && abs($value) > 9007199254740991) {
            $value = (float) $value;
        }
        $raw = json_encode(
            $value,
            JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES |
                JSON_UNESCAPED_LINE_TERMINATORS |
                JSON_THROW_ON_ERROR,
        );
        if (is_int($value) || is_float($value)) {
            if ($value == 0) {
                return '0';
            }
            $raw = strtolower($raw);
            if (str_contains($raw, 'e')) {
                [$mantissa, $exponent] = explode('e', $raw);
                $exp = (int) $exponent;
                $mantissa = preg_replace('/\.0$/', '', $mantissa);
                if ($exp >= -6 && $exp < 21) {
                    $sign = str_starts_with($mantissa, '-') ? '-' : '';
                    $mantissa = ltrim($mantissa, '-');
                    $point = strpos($mantissa, '.');
                    $point = $point === false ? strlen($mantissa) : $point;
                    $digits = str_replace('.', '', $mantissa);
                    $point += $exp;
                    $raw =
                        $sign .
                        ($point <= 0
                            ? '0.' . str_repeat('0', -$point) . $digits
                            : ($point >= strlen($digits)
                                ? $digits . str_repeat('0', $point - strlen($digits))
                                : substr($digits, 0, $point) . '.' . substr($digits, $point)));
                } else {
                    $raw = $mantissa . 'e' . ($exp >= 0 ? '+' : '') . $exp;
                }
            }
        }
        return $raw;
    }
    public static function json(string $raw): mixed
    {
        preg_match_all('/"(?:\\\\.|[^"\\\\])*"|[^\s]/', $raw, $matches);
        $stack = [];
        $tokens = $matches[0];
        foreach ($tokens as $i => $token) {
            if ($token === '{') {
                $stack[] = [];
            } elseif ($token === '[') {
                $stack[] = null;
            } elseif ($token === '}' || $token === ']') {
                array_pop($stack);
            } elseif (
                str_starts_with($token, '"') &&
                ($tokens[$i + 1] ?? '') === ':' &&
                ($stack[count($stack) - 1] ?? null) !== null
            ) {
                $key = json_decode($token, true, 32, JSON_THROW_ON_ERROR);
                $index = count($stack) - 1;
                if (isset($stack[$index][$key])) {
                    self::fail('TEACHING_ATTRIBUTES', 'Duplicate teaching JSON attribute');
                }
                $stack[$index][$key] = true;
            }
        }

        $object = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
        $attrs = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        if (
            is_object($object) &&
            isset($object->attrs) &&
            property_exists($object->attrs, 'params')
        ) {
            $attrs['attrs']['params'] = $object->attrs->params;
        }
        if (is_object($object) && property_exists($object, 'params')) {
            $attrs['params'] = $object->params;
        }
        return $attrs;
    }
    public static function source(string $source, string &$nonce): string
    {
        $nonce = bin2hex(random_bytes(16));
        $environment = new \League\CommonMark\Environment\Environment([
            'max_nesting_level' => Converter::MAX_DEPTH + 1,
        ]);
        $environment->addExtension(
            new \League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension(),
        );
        $document = (new \League\CommonMark\Parser\MarkdownParser($environment))->parse($source);
        $ignored = [];
        $nodes = 0;
        $walk = function ($node, $depth = 0) use (&$walk, &$ignored, &$nodes) {
            if (++$nodes > Converter::MAX_NODES || $depth > Converter::MAX_DEPTH) {
                self::fail('STRUCTURE_LIMIT', 'Teaching boundary AST exceeds structural limits');
            }
            if (
                $node instanceof \League\CommonMark\Extension\CommonMark\Node\Block\FencedCode ||
                $node instanceof \League\CommonMark\Extension\CommonMark\Node\Block\IndentedCode
            ) {
                for ($line = $node->getStartLine(); $line <= $node->getEndLine(); $line++) {
                    $ignored[$line - 1] = true;
                }
                return;
            }
            foreach ($node->children() as $child) {
                $walk($child, $depth + 1);
            }
        };
        $walk($document);
        preg_match_all(
            '/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/i',
            $source,
            $matches,
            PREG_OFFSET_CAPTURE,
        );
        $protected = [];
        foreach ($matches[0] as [$text, $start]) {
            $protected[] = [$start, $start + strlen($text)];
        }
        $offset = 0;
        $lines = explode("\n", $source);
        foreach ($lines as $index => &$line) {
            $start = $offset;
            $offset += strlen($line) + 1;
            $skip = isset($ignored[$index]);
            foreach ($protected as [$a, $b]) {
                if ($start >= $a && $start < $b) {
                    $skip = true;
                }
            }
            if ($skip) {
                continue;
            }
            if (preg_match('/^ {0,3}<!--mbb-teaching/', $line)) {
                self::fail('TEACHING_SYNTAX', 'Reserved internal marker');
            }
            if (!str_starts_with($line, ':::mbb:')) {
                continue;
            }
            if ($line === ':::mbb:end') {
                $data = ['end' => true];
            } else {
                if (
                    !preg_match(
                        '/^:::mbb:v1 (collapse|steps|step|code-compare|component) (\{.*\})$/D',
                        $line,
                        $m,
                    )
                ) {
                    self::fail('TEACHING_SYNTAX', 'Invalid versioned teaching directive');
                }
                try {
                    $a = self::json($m[2]);
                } catch (\JsonException $e) {
                    self::fail('TEACHING_ATTRIBUTES', 'Invalid JSON attributes');
                }
                $data = ['kind' => $m[1], 'attrs' => self::attrs($m[1], $a, true)];
            }
            $line =
                '<!--mbb-teaching ' .
                $nonce .
                ':' .
                bin2hex(
                    json_encode(
                        $data,
                        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
                    ),
                ) .
                '-->';
        }
        return implode("\n", $lines);
    }
    public static function marker(string $raw, string $nonce): ?array
    {
        return preg_match('/^<!--mbb-teaching ([0-9a-f]{32}):([0-9a-f]+)-->\s*$/D', $raw, $m) &&
            $m[1] === $nonce
            ? self::json(hex2bin($m[2]))
            : null;
    }
    public static function assemble(array $blocks): array
    {
        $stack = [['children' => []]];
        foreach ($blocks as $b) {
            $i = count($stack) - 1;
            if (!isset($b['marker'])) {
                $stack[$i]['children'][] = $b;
                continue;
            }
            $data = $b['marker'];
            if (!isset($data['end'])) {
                if (count($stack) >= 32) {
                    self::fail('STRUCTURE_LIMIT', 'Teaching nesting exceeds the structural limit');
                }
                $stack[] = $data + ['children' => []];
                continue;
            }
            if ($i === 0) {
                self::fail('TEACHING_STRUCTURE', 'Unexpected teaching closing marker');
            }
            $item = array_pop($stack);
            $item['attrs']['version'] = 1;
            if ($item['kind'] === 'code-compare') {
                $left = $item['children'][0] ?? null;
                $right = $item['children'][1] ?? null;
                if (($left['name'] ?? '') !== 'mbb/code' || ($right['name'] ?? '') !== 'mbb/code') {
                    self::fail(
                        'TEACHING_CODE',
                        'Code comparison requires two initial fenced code blocks',
                    );
                }
                $item['attrs'] += [
                    'codeLeft' => $left['attrs']['code'],
                    'languageLeft' => $left['attrs']['language'] ?? '',
                    'codeRight' => $right['attrs']['code'],
                    'languageRight' => $right['attrs']['language'] ?? '',
                ];
                $item['children'] = array_slice($item['children'], 2);
            }
            $stack[count($stack) - 1]['children'][] = [
                'name' => 'mbb/' . $item['kind'],
                'attrs' => $item['attrs'],
                'children' => $item['children'],
                'content' => '',
            ];
        }
        if (count($stack) !== 1) {
            self::fail('TEACHING_STRUCTURE', 'Unclosed teaching container');
        }
        self::validate($stack[0]['children']);
        return $stack[0]['children'];
    }
    public static function validate(array $blocks): void
    {
        $ids = [];
        $groups = 0;
        $count = 0;
        $walk = function (array $list, string $parent = '', int $depth = 0, int $collapse = 0) use (
            &$walk,
            &$ids,
            &$groups,
            &$count,
        ): void {
            foreach ($list as $b) {
                if ($depth > 32 || ++$count > 10000) {
                    self::fail(
                        'STRUCTURE_LIMIT',
                        'Teaching structure exceeds depth or node limits',
                    );
                }
                $kind = self::kind($b['name']);
                $inner = $b['children'];
                if ($parent === 'steps' && $kind !== 'step') {
                    self::fail('TEACHING_STRUCTURE', 'Only steps are permitted in a steps group');
                }
                if ($kind !== null) {
                    $a = self::attrs($kind, $b['attrs']);
                    if (isset($ids[$a['id']])) {
                        self::fail('TEACHING_ID', 'Duplicate teaching ID');
                    }
                    $ids[$a['id']] = true;
                    if ($kind === 'steps' && ($depth !== 0 || ++$groups > 1 || $inner === [])) {
                        self::fail(
                            'TEACHING_STRUCTURE',
                            'One nonempty top-level steps group is permitted',
                        );
                    }
                    if ($kind === 'step' && $parent !== 'steps') {
                        self::fail('TEACHING_STRUCTURE', 'Step must be a direct child of steps');
                    }
                    if (in_array($kind, ['collapse', 'step', 'component'], true) && $inner === []) {
                        self::fail('TEACHING_STRUCTURE', 'Teaching body cannot be empty');
                    }
                    if ($kind === 'collapse' && $collapse >= 3) {
                        self::fail('TEACHING_DEPTH', 'Maximum three nested collapse containers');
                    }
                    if ($kind === 'code-compare') {
                        foreach (['Left', 'Right'] as $side) {
                            foreach (
                                array_filter(explode(',', $a[strtolower($side) . 'Highlights']))
                                as $line
                            ) {
                                if ((int) $line > substr_count($a['code' . $side], "\n")) {
                                    self::fail(
                                        'TEACHING_LINES',
                                        'Highlight exceeds corresponding code length',
                                    );
                                }
                            }
                        }
                    }
                }
                $walk(
                    $inner,
                    $kind ?? $b['name'],
                    $depth + 1,
                    $collapse + ($kind === 'collapse' ? 1 : 0),
                );
            }
        };
        $walk($blocks);
        $anchors = function (array $list) use (&$anchors, $ids): void {
            foreach ($list as $b) {
                if (self::kind($b['name']) === null) {
                    $html = $b['raw'] ?? ($b['content'] ?? '');
                    $dom = new \DOMDocument();
                    $old = libxml_use_internal_errors(true);
                    try {
                        $dom->loadHTML('<?xml encoding="utf-8"?><body>' . $html . '</body>');
                        foreach ($dom->getElementsByTagName('*') as $node) {
                            if (
                                $node->hasAttribute('id') &&
                                isset($ids[$node->getAttribute('id')])
                            ) {
                                self::fail(
                                    'TEACHING_ID',
                                    'Teaching ID conflicts with a body anchor',
                                );
                            }
                        }
                    } finally {
                        libxml_clear_errors();
                        libxml_use_internal_errors($old);
                    }
                }
                $anchors($b['children']);
            }
        };
        $anchors($blocks);
    }
    public static function markdown(array $block, string $body): string
    {
        $kind = self::kind($block['name']);
        $a = self::attrs($kind, $block['attrs']);
        $attrs = [];
        foreach (self::SCHEMAS[$kind] as $key => $type) {
            $attrs[$key] = $a[$key];
        }
        $codes = '';
        if ($kind === 'code-compare') {
            foreach (['Left', 'Right'] as $side) {
                $code = $a['code' . $side];
                preg_match_all('/`+/', $code, $matches);
                $size = 3;
                foreach ($matches[0] as $m) {
                    $size = max($size, strlen($m) + 1);
                }
                $f = str_repeat('`', $size);
                $codes .= $f . $a['language' . $side] . "\n" . $code . $f . "\n\n";
            }
        }
        return ':::mbb:v1 ' .
            $kind .
            ' ' .
            self::encode($attrs) .
            "\n\n" .
            $codes .
            rtrim($body) .
            "\n\n:::mbb:end";
    }
}
