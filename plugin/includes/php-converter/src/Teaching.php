<?php
namespace MarkBridge\Probe;

/** Closed v1 teaching grammar, shared semantics with src/teaching.js. */
final class Teaching
{
    public const SCHEMAS = [
        'code-tabs' => ['id' => 'string', 'defaultTab' => 'string', 'tabs' => 'array'],
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
        if ($kind === 'code-tabs') {
            $out['tabs'] = self::tabs($out, $source);
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
    private static function tabs(array $attrs, bool $source): array
    {
        $keys = $source ? ['id', 'title', 'terminalNewline'] : ['id', 'title', 'language', 'code'];
        if (
            !array_is_list($attrs['tabs']) ||
            count($attrs['tabs']) < 1 ||
            count($attrs['tabs']) > 8
        ) {
            self::fail('CODE_TABS_STRUCTURE', 'Code groups require 1–8 versions');
        }
        $ids = [];
        $bytes = 0;
        $tabs = [];
        foreach ($attrs['tabs'] as $tab) {
            if (
                !is_array($tab) ||
                count($tab) !== count($keys) ||
                array_diff(array_keys($tab), $keys)
            ) {
                self::fail('CODE_TABS_ATTRIBUTES', 'Incomplete or unknown version fields');
            }
            if (
                !is_string($tab['id']) ||
                !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $tab['id']) ||
                isset($ids[$tab['id']])
            ) {
                self::fail('TEACHING_ID', 'Invalid or duplicate version ID');
            }
            $ids[$tab['id']] = true;
            if (
                !is_string($tab['title']) ||
                !mb_check_encoding($tab['title'], 'UTF-8') ||
                mb_strlen($tab['title']) > 200 ||
                preg_match('/[\r\n\x00]/', $tab['title'])
            ) {
                self::fail(
                    'TEACHING_TITLE',
                    'Version title must be empty or at most 200 single-line characters',
                );
            }
            if ($source) {
                if (!is_bool($tab['terminalNewline'])) {
                    self::fail('CODE_TABS_ATTRIBUTES', 'Terminal newline must be boolean');
                }
            } else {
                if (
                    !is_string($tab['language']) ||
                    !preg_match('/^[A-Za-z0-9_+-]{0,64}$/D', $tab['language'])
                ) {
                    self::fail('CODE_INFO', 'Unsafe or overlong code language');
                }
                if (
                    !is_string($tab['code']) ||
                    !mb_check_encoding($tab['code'], 'UTF-8') ||
                    str_contains($tab['code'], "\0")
                ) {
                    self::fail('CODE_TABS_CODE', 'Code must be UTF-8 without NUL');
                }
                $bytes += strlen($tab['code']);
                if (strlen($tab['code']) > 65536 || $bytes > 131072) {
                    self::fail('CODE_TABS_LIMIT', 'Code version/group exceeds 64/128 KiB');
                }
            }
            $tabs[] = array_combine($keys, array_map(static fn($key) => $tab[$key], $keys));
        }
        if (!isset($ids[$attrs['defaultTab']])) {
            self::fail('CODE_TABS_DEFAULT', 'Default version must reference a group member');
        }
        return $tabs;
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
        $tabObject = is_object($object) && isset($object->attrs) ? $object->attrs : $object;
        if (is_object($tabObject) && property_exists($tabObject, 'tabs')) {
            if (
                !is_array($tabObject->tabs) ||
                array_filter($tabObject->tabs, static fn($tab) => !($tab instanceof \stdClass))
            ) {
                self::fail('CODE_TABS_ATTRIBUTES', 'Versions must be a JSON array of objects');
            }
        }
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
        $fences = [];
        $inlineBlocks = [];
        $nodes = 0;
        $walk = function ($node, $depth = 0) use (
            &$walk,
            &$ignored,
            &$nodes,
            &$fences,
            &$inlineBlocks,
        ) {
            if (++$nodes > Converter::MAX_NODES || $depth > Converter::MAX_DEPTH) {
                self::fail('STRUCTURE_LIMIT', 'Teaching boundary AST exceeds structural limits');
            }
            if ($node instanceof \League\CommonMark\Extension\CommonMark\Node\Inline\Code) {
                for ($parent = $node->parent(); $parent; $parent = $parent->parent()) {
                    if (method_exists($parent, 'getStartLine')) {
                        $inlineBlocks[$parent->getStartLine() - 1] = $parent->getEndLine();
                        break;
                    }
                }
            }
            if (
                $node instanceof \League\CommonMark\Extension\CommonMark\Node\Block\FencedCode ||
                $node instanceof \League\CommonMark\Extension\CommonMark\Node\Block\IndentedCode
            ) {
                if (
                    $node instanceof \League\CommonMark\Extension\CommonMark\Node\Block\FencedCode
                ) {
                    $fences[$node->getStartLine() - 1] = $node->getEndLine();
                }
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
        preg_match_all('/[^\r\n]*(?:\r\n|\r|\n|$)/', $source, $rawLines);
        $rawLines = $rawLines[0];
        if (end($rawLines) === '') {
            array_pop($rawLines);
        }
        $text = static fn($i) => isset($rawLines[$i]) ? rtrim($rawLines[$i], "\r\n") : null;
        $marker = static fn($data) => '<!--mbb-teaching ' .
            $nonce .
            ':' .
            bin2hex(self::encode($data)) .
            '-->';
        $offsets = [];
        $cursor = 0;
        foreach ($rawLines as $raw) {
            $offsets[] = $cursor;
            $cursor += strlen($raw);
        }
        $inlineLiterals = [];
        foreach ($inlineBlocks as $start => $end) {
            $begin = $offsets[$start];
            $raw = substr($source, $begin, ($offsets[$end] ?? strlen($source)) - $begin);
            preg_match_all('/`+/', $raw, $runs, PREG_OFFSET_CAPTURE);
            $runs = $runs[0];
            foreach ($runs as $i => [$ticks, $at]) {
                if (isset($skipUntil) && $i <= $skipUntil) {
                    continue;
                }
                $slashes = 0;
                for ($p = $at - 1; $p >= 0 && $raw[$p] === '\\'; $p--) {
                    $slashes++;
                }
                if ($slashes % 2) {
                    continue;
                }
                for ($j = $i + 1; $j < count($runs); $j++) {
                    if (strlen($runs[$j][0]) === strlen($ticks)) {
                        $inlineLiterals[] = [
                            $begin + $at,
                            $begin + $runs[$j][1] + strlen($runs[$j][0]),
                        ];
                        $skipUntil = $j;
                        break;
                    }
                }
            }
            unset($skipUntil);
        }
        preg_match_all('/<(pre|code)\b[^>]*>/i', $source, $matches, PREG_OFFSET_CAPTURE);
        $protected = [];
        $consumed = 0;
        $closes = ['pre' => [], 'code' => []];
        preg_match_all('/<\/(pre|code)>/i', $source, $closing, PREG_OFFSET_CAPTURE);
        foreach ($closing[0] as $i => [$literal, $at]) {
            $closes[strtolower($closing[1][$i][0])][] = [$at, $at + strlen($literal)];
        }
        foreach ($matches[0] as $index => [$html, $start]) {
            if ($start < $consumed) {
                continue;
            }
            $lo = 0;
            $hi = count($offsets);
            while ($lo < $hi) {
                $mid = intdiv($lo + $hi, 2);
                if ($offsets[$mid] <= $start) {
                    $lo = $mid + 1;
                } else {
                    $hi = $mid;
                }
            }
            $inline = false;
            foreach ($inlineLiterals as [$a, $b]) {
                if ($start >= $a && $start < $b) {
                    $inline = true;
                }
            }
            if (
                isset($ignored[$lo - 1]) ||
                str_starts_with($text($lo - 1) ?? '', ':::mbb:') ||
                $inline
            ) {
                continue;
            }
            $after = $start + strlen($html);
            $ends = $closes[strtolower($matches[1][$index][0])];
            $left = 0;
            $right = count($ends);
            while ($left < $right) {
                $mid = intdiv($left + $right, 2);
                if ($ends[$mid][0] < $after) {
                    $left = $mid + 1;
                } else {
                    $right = $mid;
                }
            }
            if (!isset($ends[$left])) {
                continue;
            }
            $consumed = $ends[$left][1];
            $protected[] = [$start, $consumed];
        }
        $replacements = [];
        foreach ($rawLines as $i => $line) {
            $protectedLine = false;
            foreach ($protected as [$a, $b]) {
                if ($offsets[$i] >= $a && $offsets[$i] < $b) {
                    $protectedLine = true;
                }
            }
            if (
                $protectedLine ||
                isset($ignored[$i]) ||
                !preg_match('/^:::mbb:v1 code-tabs (\{[^\r\n]*\})$/D', $text($i), $match)
            ) {
                continue;
            }
            $a = self::attrs('code-tabs', self::json($match[1]), true);
            $next = $i + 1;
            foreach ($a['tabs'] as $tab) {
                while ($next < count($rawLines) && preg_match('/^[ \t]*$/D', $text($next))) {
                    $next++;
                }
                $end = $fences[$next] ?? null;
                if (
                    !$end ||
                    !preg_match(
                        '/^(`{3,}|~{3,})[ \t]*([A-Za-z0-9_+-]{0,64})[ \t]*$/D',
                        $text($next),
                        $open,
                    ) ||
                    !preg_match(
                        '/^' .
                            preg_quote($open[1][0], '/') .
                            '{' .
                            strlen($open[1]) .
                            ',}[ \t]*$/D',
                        $text($end - 1),
                    )
                ) {
                    self::fail(
                        'CODE_TABS_STRUCTURE',
                        'Each version requires a complete fence without container prefixes',
                    );
                }
                $code = implode('', array_slice($rawLines, $next + 1, $end - $next - 2));
                if ($tab['terminalNewline']) {
                    if (!str_ends_with($code, "\n")) {
                        self::fail('CODE_TABS_CODE', 'Terminal newline does not match code');
                    }
                } else {
                    if ($code !== '' && !str_ends_with($code, "\n")) {
                        self::fail('CODE_TABS_CODE', 'Code requires an explicit structural LF');
                    }
                    if ($code !== '') {
                        $code = substr($code, 0, -1);
                    }
                }
                $replacements[$next] = $marker([
                    'rawCode' => ['code' => $code, 'language' => $open[2]],
                ]);
                for ($j = $next + 1; $j < $end; $j++) {
                    $replacements[$j] = '';
                }
                $next = $end;
            }
            while ($next < count($rawLines) && preg_match('/^[ \t]*$/D', $text($next))) {
                $next++;
            }
            if ($text($next) !== ':::mbb:end') {
                self::fail('CODE_TABS_STRUCTURE', 'Only matching fenced versions are allowed');
            }
        }
        $offset = 0;
        $lines = array_map(static fn($line) => rtrim($line, "\r\n"), $rawLines);
        foreach ($lines as $index => &$line) {
            $start = $offset;
            $offset += strlen($rawLines[$index]);
            if (array_key_exists($index, $replacements)) {
                $line = $replacements[$index];
                continue;
            }
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
                        '/^:::mbb:v1 (collapse|steps|step|code-compare|component|code-tabs) (\{.*\})$/D',
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
            if (isset($data['rawCode'])) {
                $stack[$i]['children'][] = [
                    'name' => 'mbb/code',
                    'attrs' => $data['rawCode'],
                    'exactCode' => true,
                ];
                continue;
            }
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
            if ($item['kind'] === 'code-tabs') {
                if (count($item['children']) !== count($item['attrs']['tabs'])) {
                    self::fail('CODE_TABS_STRUCTURE', 'Mismatched code version count');
                }
                foreach ($item['attrs']['tabs'] as $index => &$tab) {
                    $child = $item['children'][$index];
                    if (!($child['exactCode'] ?? false)) {
                        self::fail(
                            'CODE_TABS_STRUCTURE',
                            'Code version is not a complete original fence',
                        );
                    }
                    $tab = [
                        'id' => $tab['id'],
                        'title' => $tab['title'],
                        'language' => $child['attrs']['language'],
                        'code' => $child['attrs']['code'],
                    ];
                }
                unset($tab);
                $item['children'] = [];
            }
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
                    if ($kind === 'code-tabs') {
                        if ($inner !== []) {
                            self::fail(
                                'CODE_TABS_STRUCTURE',
                                'Code groups cannot have child blocks',
                            );
                        }
                        foreach ($a['tabs'] as $tab) {
                            if (isset($ids[$tab['id']])) {
                                self::fail(
                                    'TEACHING_ID',
                                    'Code version conflicts with a document ID',
                                );
                            }
                            $ids[$tab['id']] = true;
                        }
                    }
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
        if ($kind === 'code-tabs') {
            $tabs = [];
            $codes = [];
            foreach ($a['tabs'] as $tab) {
                $terminal = str_ends_with($tab['code'], "\n");
                $tabs[] = [
                    'id' => $tab['id'],
                    'title' => $tab['title'],
                    'terminalNewline' => $terminal,
                ];
                preg_match_all('/`+/', $tab['code'], $runs);
                $length = 3;
                foreach ($runs[0] as $run) {
                    $length = max($length, strlen($run) + 1);
                }
                $fence = str_repeat('`', $length);
                $codes[] =
                    $fence .
                    $tab['language'] .
                    "\n" .
                    $tab['code'] .
                    ($terminal ? '' : "\n") .
                    $fence;
            }
            return ':::mbb:v1 code-tabs ' .
                self::encode([
                    'id' => $a['id'],
                    'defaultTab' => $a['defaultTab'],
                    'tabs' => $tabs,
                ]) .
                "\n\n" .
                implode("\n\n", $codes) .
                "\n\n:::mbb:end";
        }
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
