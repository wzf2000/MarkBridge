<?php
namespace MarkBridge\Probe;

/** Closed native adaptation and trusted pure-data static rendering. No WP dependencies. */
final class BlockAdapters
{
    private static array $registry = [];
    public const NATIVE = [
        'details' => 'core/details',
        'buttons' => 'core/buttons',
        'button' => 'core/button',
    ];
    private static function fail(string $code, string $message): never
    {
        throw new ConversionError($code, $message);
    }
    private static function nonblank(string $value): bool
    {
        return preg_replace(
            '/[ \t\r\n\f\v\x{0085}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]/u',
            '',
            $value,
        ) !== '';
    }
    private static function plain(mixed $value, int $max, bool $nonempty = false): string
    {
        if (
            !is_string($value) ||
            !mb_check_encoding($value, 'UTF-8') ||
            str_contains($value, "\0") ||
            mb_strlen($value, 'UTF-8') > $max ||
            ($nonempty && !self::nonblank($value))
        ) {
            self::fail('ADAPTER_ATTRIBUTES', '纯文字字段类型、Unicode 或长度非法');
        }
        return $value;
    }
    private static function keys(mixed $value, array $allowed, array $required): array
    {
        if ($value instanceof \stdClass) {
            $value = get_object_vars($value);
        }
        if (
            !is_array($value) ||
            array_diff(array_keys($value), $allowed) ||
            array_diff($required, array_keys($value))
        ) {
            self::fail('ADAPTER_ATTRIBUTES', '适配属性缺失或包含未知字段');
        }
        return $value;
    }
    private static function integer(mixed $v): bool
    {
        return (is_int($v) || is_float($v)) &&
            is_finite((float) $v) &&
            floor($v) === $v * 1.0 &&
            abs($v) <= 9007199254740991;
    }
    public static function kind(string $name): ?string
    {
        $key = array_search($name, self::NATIVE, true);
        return $key === false ? null : $key;
    }
    public static function anchor(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^(?:[A-Za-z][A-Za-z0-9_-]{0,63})?$/D', $value)) {
            self::fail(
                'ADAPTER_ANCHOR',
                '锚点需为字母开头的 1–64 位 ASCII 字母、数字、下划线或连字符',
            );
        }
        return $value;
    }
    public static function url(mixed $value): string
    {
        $value = self::plain($value, 2048, true);
        if (
            preg_match('/[\x00-\x20\x7f<>"`]/', $value) ||
            (preg_match('/^([^:\/?#]+):/', $value) &&
                !preg_match('/^(?:https?|mailto|tel|ftp):/i', $value))
        ) {
            self::fail('ADAPTER_URL', '按钮链接协议或字符不安全');
        }
        return $value;
    }
    private static function fragment(string $html): \DOMElement
    {
        $doc = new \DOMDocument();
        $old = libxml_use_internal_errors(true);
        try {
            $doc->loadHTML(
                '<!doctype html><html><head><meta charset="UTF-8"></head><body><div data-mbb-root="">' .
                    $html .
                    '</div></body></html>',
                LIBXML_NONET,
            );
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($old);
        }
        $body = $doc->getElementsByTagName('body')->item(0);
        $root = $body?->firstChild;
        if (
            !$body ||
            $body->childNodes->length !== 1 ||
            !($root instanceof \DOMElement) ||
            $root->tagName !== 'div' ||
            $root->attributes->length !== 1 ||
            !$root->hasAttribute('data-mbb-root')
        ) {
            self::fail('ADAPTER_STRUCTURE', '文字 HTML 无效');
        }
        return $root;
    }
    public static function summary(string $html): string
    {
        if (preg_match('/<\/?[A-Za-z]|<!/', $html)) {
            self::fail('ADAPTER_SUMMARY', '摘要只允许单行纯文字');
        }
        $root = self::fragment($html);
        foreach ($root->childNodes as $n) {
            if ($n->nodeType !== XML_TEXT_NODE) {
                self::fail('ADAPTER_SUMMARY', '摘要只允许单行纯文字');
            }
        }
        $v = self::plain($root->textContent, 200, true);
        if (preg_match('/[\r\n]/', $v)) {
            self::fail('ADAPTER_SUMMARY', '摘要只允许单行纯文字');
        }
        return $v;
    }
    public static function buttonText(string $html): string
    {
        if (str_contains($html, '<!')) {
            self::fail('ADAPTER_INLINE', '按钮只允许受控文字格式');
        }
        preg_match_all('/<\/?([A-Za-z][A-Za-z0-9-]*)\b/', $html, $markup);
        foreach ($markup[1] as $tag) {
            if (!in_array(strtolower($tag), ['strong', 'em', 's', 'del', 'code'], true)) {
                self::fail('ADAPTER_INLINE', '按钮只允许受控文字格式');
            }
        }
        if (strlen($html) > 4096) {
            self::fail('ADAPTER_LIMIT', '按钮文字最多 4 KiB');
        }
        $root = self::fragment($html);
        $count = 0;
        $walk = function ($node, $depth = 1) use (&$walk, &$count) {
            if (++$count > 256 || $depth > 16) {
                self::fail('ADAPTER_LIMIT', '按钮文字最多 256 节点/16 层');
            }
            if ($node->nodeType === XML_TEXT_NODE) {
                self::plain($node->textContent, 4096);
                return;
            }
            if (
                !($node instanceof \DOMElement) ||
                !in_array(strtolower($node->tagName), ['strong', 'em', 's', 'del', 'code'], true) ||
                $node->attributes->length
            ) {
                self::fail(
                    'ADAPTER_INLINE',
                    '按钮仅支持纯文字与 strong/em/del/code，不支持链接、图片或交互嵌套',
                );
            }
            foreach ($node->childNodes as $child) {
                if ($node->tagName === 'code' && $child->nodeType !== XML_TEXT_NODE) {
                    self::fail('ADAPTER_INLINE', '代码标记只支持纯文字');
                }
                $walk($child, $depth + 1);
            }
        };
        foreach ($root->childNodes as $n) {
            $walk($n);
        }
        if (!self::nonblank($root->textContent)) {
            self::fail('ADAPTER_INLINE', '按钮文字不能为空');
        }
        return $html;
    }
    public static function buttonParagraph(string $html): string
    {
        $root = self::fragment(trim($html));
        if (
            $root->childNodes->length !== 1 ||
            !($root->firstChild instanceof \DOMElement) ||
            $root->firstChild->tagName !== 'p' ||
            $root->firstChild->attributes->length
        ) {
            self::fail('ADAPTER_STRUCTURE', '链接按钮必须恰好有一个受控文字段落');
        }
        $inside = '';
        foreach ($root->firstChild->childNodes as $child) {
            $inside .= $root->ownerDocument->saveHTML($child);
        }
        return self::buttonText($inside);
    }
    public static function nativeAttrs(string $kind, mixed $attrs, bool $source = false): array
    {
        $keys = match ($kind) {
            'details' => ['summary', 'showContent', 'anchor', ...!$source ? ['name'] : []],
            'buttons' => ['anchor', 'layout'],
            'button' => [
                'url',
                'title',
                'linkTarget',
                'rel',
                'anchor',
                ...!$source ? ['text', 'tagName', 'type'] : [],
            ],
            default => throw new ConversionError('ADAPTER_KIND', '未知原生适配类型'),
        };
        $attrs = self::keys(
            $attrs,
            $keys,
            $kind === 'details'
                ? ['summary']
                : ($kind === 'button'
                    ? ['url', ...!$source ? ['text'] : []]
                    : []),
        );
        $out = [];
        if (array_key_exists('anchor', $attrs) && self::anchor($attrs['anchor']) !== '') {
            $out['anchor'] = $attrs['anchor'];
        }
        if ($kind === 'details') {
            if (array_key_exists('name', $attrs) && $attrs['name'] !== '') {
                self::fail('ADAPTER_ATTRIBUTES', '互斥详情组尚不支持');
            }
            $out['summary'] = $source
                ? self::plain($attrs['summary'], 200, true)
                : self::summary(self::plain($attrs['summary'], 4096));
            if (preg_match('/[\r\n]/', $out['summary'])) {
                self::fail('ADAPTER_SUMMARY', '摘要只允许单行纯文字');
            }
            if (array_key_exists('showContent', $attrs) && !is_bool($attrs['showContent'])) {
                self::fail('ADAPTER_ATTRIBUTES', '详情展开状态需为布尔值');
            }
            $out['showContent'] = $attrs['showContent'] ?? false;
        } elseif ($kind === 'buttons') {
            if (array_key_exists('layout', $attrs)) {
                $layout = self::keys($attrs['layout'], ['type'], ['type']);
                if ($layout['type'] !== 'flex') {
                    self::fail('ADAPTER_ATTRIBUTES', '按钮组只支持默认 flex 布局');
                }
                $out['layout'] = ['type' => 'flex'];
            }
        } else {
            if (
                (array_key_exists('tagName', $attrs) && $attrs['tagName'] !== 'a') ||
                (array_key_exists('type', $attrs) && $attrs['type'] !== 'button')
            ) {
                self::fail('ADAPTER_ATTRIBUTES', '仅支持链接按钮，不支持动作按钮');
            }
            $out['url'] = self::url($attrs['url']);
            if (array_key_exists('title', $attrs)) {
                $title = self::plain($attrs['title'], 200);
                if (preg_match('/[\r\n]/', $title)) {
                    self::fail('ADAPTER_ATTRIBUTES', '链接标题必须单行');
                }
                $out['title'] = $title;
            }
            if (array_key_exists('linkTarget', $attrs)) {
                if (!in_array($attrs['linkTarget'], ['', '_self', '_blank'], true)) {
                    self::fail('ADAPTER_ATTRIBUTES', '链接 target 非法');
                }
                $out['linkTarget'] = $attrs['linkTarget'];
            }
            if (array_key_exists('rel', $attrs)) {
                if (!is_string($attrs['rel'])) {
                    self::fail('ADAPTER_ATTRIBUTES', '链接 rel 需为文字');
                }
                $tokens = $attrs['rel'] === '' ? [] : explode(' ', $attrs['rel']);
                if (
                    count($tokens) > 5 ||
                    count(array_unique($tokens, SORT_STRING)) !== count($tokens) ||
                    array_diff($tokens, ['noopener', 'noreferrer', 'nofollow', 'ugc', 'sponsored'])
                ) {
                    self::fail('ADAPTER_ATTRIBUTES', '链接 rel 必须为闭合、不重复的安全标记');
                }
                $out['rel'] = implode(' ', $tokens);
            }
            if (
                ($out['linkTarget'] ?? null) === '_blank' &&
                !in_array('noopener', explode(' ', $out['rel'] ?? ''), true)
            ) {
                self::fail('ADAPTER_ATTRIBUTES', '新窗口链接必须含 noopener');
            }
            if (!$source) {
                $out['text'] = self::buttonText(self::plain($attrs['text'], 262144));
            }
        }
        return $out;
    }
    public static function nativeHtml(string $kind, array $attrs, string $body): string
    {
        $a = self::nativeAttrs($kind, $attrs);
        $id = isset($a['anchor'])
            ? ' id="' . htmlspecialchars($a['anchor'], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '"'
            : '';
        if ($kind === 'details') {
            return '<details' .
                $id .
                ' class="wp-block-details"' .
                ($a['showContent'] ? ' open' : '') .
                '><summary>' .
                str_replace('&gt;', '>', self::text($a['summary'])) .
                '</summary>' .
                $body .
                '</details>';
        }
        if ($kind === 'buttons') {
            return '<div class="wp-block-buttons"' . $id . '>' . $body . '</div>';
        }
        $link =
            '<a class="wp-block-button__link wp-element-button" href="' .
            htmlspecialchars($a['url'], ENT_QUOTES | ENT_HTML5, 'UTF-8') .
            '"';
        foreach (
            ['title' => 'title', 'linkTarget' => 'target', 'rel' => 'rel']
            as $key => $attribute
        ) {
            if (array_key_exists($key, $a)) {
                $link .=
                    ' ' .
                    $attribute .
                    '="' .
                    htmlspecialchars($a[$key], ENT_QUOTES | ENT_HTML5, 'UTF-8') .
                    '"';
            }
        }
        return '<div' . $id . ' class="wp-block-button">' . $link . '>' . $a['text'] . '</a></div>';
    }
    /** Read the exact native save shell; sourced values never come from block comments. */
    public static function decodeNative(array $block): array
    {
        $kind = self::kind($block['name']);
        $comment = $block['attrs'];
        self::keys(
            $comment,
            match ($kind) {
                'details' => ['showContent', 'anchor', 'name'],
                'buttons' => ['anchor', 'layout'],
                'button' => ['anchor', 'tagName', 'type'],
            },
            [],
        );
        $wrapper = self::fragment($block['raw']);
        $nodes = [];
        foreach ($wrapper->childNodes as $n) {
            if ($n->nodeType === XML_TEXT_NODE && trim($n->textContent) === '') {
                continue;
            }
            $nodes[] = $n;
        }
        if (count($nodes) !== 1 || !($nodes[0] instanceof \DOMElement)) {
            self::fail('ADAPTER_STRUCTURE', '原生区块壳结构非法');
        }
        $root = $nodes[0];
        $tag = $kind === 'details' ? 'details' : 'div';
        $class = 'wp-block-' . $kind;
        if (strtolower($root->tagName) !== $tag || $root->getAttribute('class') !== $class) {
            self::fail('ADAPTER_STRUCTURE', '原生区块标签或 class 非法');
        }
        $allowed = ['class'];
        if (isset($comment['anchor']) && self::anchor($comment['anchor']) !== '') {
            $allowed[] = 'id';
        }
        if ($kind === 'details') {
            $allowed[] = 'open';
            $allowed[] = 'name';
        }
        foreach ($root->attributes as $attr) {
            if (
                !in_array($attr->name, $allowed, true) ||
                ($attr->name === 'name' && $attr->value !== '')
            ) {
                self::fail('ADAPTER_ATTRIBUTES', '区块壳出现未知或非中性属性');
            }
        }
        if ($root->getAttribute('id') !== ($comment['anchor'] ?? '')) {
            self::fail('ADAPTER_ANCHOR', 'HTML 锚点与区块属性不一致');
        }
        $children = [];
        foreach ($root->childNodes as $n) {
            if ($n->nodeType === XML_TEXT_NODE && trim($n->textContent) === '') {
                continue;
            }
            $children[] = $n;
        }
        if ($kind === 'details') {
            $summary = array_shift($children);
            if (
                !($summary instanceof \DOMElement) ||
                strtolower($summary->tagName) !== 'summary' ||
                $summary->attributes->length
            ) {
                self::fail('ADAPTER_SUMMARY', '详情必须有唯一直接摘要');
            }
            $html = '';
            foreach ($summary->childNodes as $n) {
                $html .= $summary->ownerDocument->saveHTML($n);
            }
            $comment['summary'] = $html;
            if (($comment['showContent'] ?? false) !== $root->hasAttribute('open')) {
                self::fail('ADAPTER_ATTRIBUTES', '详情展开状态与 HTML 不一致');
            }
        } elseif ($kind === 'button') {
            if (
                count($children) !== 1 ||
                !($children[0] instanceof \DOMElement) ||
                strtolower($children[0]->tagName) !== 'a'
            ) {
                self::fail('ADAPTER_STRUCTURE', '按钮只能包含链接');
            }
            $a = array_shift($children);
            if ($a->getAttribute('class') !== 'wp-block-button__link wp-element-button') {
                self::fail('ADAPTER_STRUCTURE', '按钮链接 class 非法');
            }
            foreach ($a->attributes as $attr) {
                if (!in_array($attr->name, ['class', 'href', 'title', 'target', 'rel'], true)) {
                    self::fail('ADAPTER_ATTRIBUTES', '按钮链接出现未知属性');
                }
            }
            $comment['url'] = $a->getAttribute('href');
            foreach (
                ['title' => 'title', 'target' => 'linkTarget', 'rel' => 'rel']
                as $attribute => $key
            ) {
                if ($a->hasAttribute($attribute)) {
                    $comment[$key] = $a->getAttribute($attribute);
                }
            }
            $html = '';
            foreach ($a->childNodes as $n) {
                $html .= $a->ownerDocument->saveHTML($n);
            }
            $comment['text'] = $html;
        }
        if (count($children) !== count($block['children'])) {
            self::fail('ADAPTER_STRUCTURE', '原生容器只能包含声明的子区块');
        }
        foreach ($children as $index => $child) {
            if (
                !($child instanceof \DOMElement) ||
                $child->tagName !== 'mbb-child' ||
                $child->attributes->length !== 1 ||
                $child->getAttribute('data-index') !== (string) $index ||
                $child->childNodes->length
            ) {
                self::fail('ADAPTER_STRUCTURE', '原生区块嵌套位置非法');
            }
        }
        $block['attrs'] = self::nativeAttrs($kind, $comment);
        if ($kind === 'details') {
            $block['attrs']['summary'] = self::text($block['attrs']['summary']);
        }
        return $block;
    }
    public static function descriptors(): array
    {
        return self::$registry;
    }
    public static function configure(mixed $input): void
    {
        self::$registry = self::validateDescriptors($input);
    }
    public static function validateDescriptors(mixed $input): array
    {
        if (is_string($input)) {
            $input = json_decode($input, false, 32, JSON_THROW_ON_ERROR);
        }
        if (!is_array($input) || !array_is_list($input) || count($input) > 16) {
            self::fail('ADAPTER_REGISTRY', '最多登记 16 个静态适配器');
        }
        $names = [];
        $blocks = [];
        $out = [];
        foreach ($input as $raw) {
            $raw = self::keys(
                $raw,
                ['schema', 'name', 'version', 'blockName', 'attributes', 'template'],
                ['schema', 'name', 'version', 'blockName', 'attributes', 'template'],
            );
            if (
                !self::integer($raw['schema']) ||
                $raw['schema'] != 1 ||
                !is_string($raw['name']) ||
                !preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $raw['name']) ||
                !is_string($raw['version']) ||
                !preg_match('/^\d{1,6}\.\d{1,6}\.\d{1,6}$/D', $raw['version']) ||
                !is_string($raw['blockName']) ||
                !preg_match('/^[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,63}$/D', $raw['blockName']) ||
                str_starts_with($raw['blockName'], 'core/') ||
                str_starts_with($raw['blockName'], 'mbb/') ||
                isset($names[$raw['name']]) ||
                isset($blocks[$raw['blockName']])
            ) {
                self::fail('ADAPTER_REGISTRY', '登记身份/版本无效或冲突');
            }
            $names[$raw['name']] = true;
            $blocks[$raw['blockName']] = true;
            $fields =
                $raw['attributes'] instanceof \stdClass
                    ? get_object_vars($raw['attributes'])
                    : $raw['attributes'];
            if (
                !is_array($fields) ||
                !count($fields) ||
                count($fields) > 16 ||
                array_is_list($fields)
            ) {
                self::fail('ADAPTER_REGISTRY', '每个适配器需要 1–16 个字段');
            }
            ksort($fields, SORT_STRING);
            $attributes = [];
            foreach ($fields as $key => $v) {
                if (
                    !is_string($key) ||
                    !preg_match('/^[a-z][A-Za-z0-9_]{0,63}$/D', $key) ||
                    in_array(
                        $key,
                        [
                            'mbbAdapterVersion',
                            'className',
                            'style',
                            'anchor',
                            'metadata',
                            'lock',
                            'align',
                            'layout',
                            'constructor',
                            'prototype',
                            '__proto__',
                            'backgroundColor',
                            'textColor',
                            'borderColor',
                            'gradient',
                            'fontSize',
                            'fontFamily',
                            'allowedBlocks',
                        ],
                        true,
                    )
                ) {
                    self::fail('ADAPTER_REGISTRY', '字段名称非法');
                }
                $v = self::keys(
                    $v,
                    ['type', 'maxLength', 'minimum', 'maximum', 'values'],
                    ['type'],
                );
                switch ($v['type']) {
                    case 'plainText':
                        $v = self::keys($v, ['type', 'maxLength'], ['type', 'maxLength']);
                        if (
                            !self::integer($v['maxLength']) ||
                            $v['maxLength'] < 1 ||
                            $v['maxLength'] > 4096
                        ) {
                            self::fail('ADAPTER_REGISTRY', '文字长度预算非法');
                        }
                        $attributes[$key] = [
                            'type' => $v['type'],
                            'maxLength' => (int) $v['maxLength'],
                        ];
                        break;
                    case 'integer':
                        $v = self::keys(
                            $v,
                            ['type', 'minimum', 'maximum'],
                            ['type', 'minimum', 'maximum'],
                        );
                        if (
                            !self::integer($v['minimum']) ||
                            !self::integer($v['maximum']) ||
                            $v['minimum'] > $v['maximum']
                        ) {
                            self::fail('ADAPTER_REGISTRY', '整数预算非法');
                        }
                        $attributes[$key] = [
                            'type' => $v['type'],
                            'minimum' => (int) $v['minimum'],
                            'maximum' => (int) $v['maximum'],
                        ];
                        break;
                    case 'boolean':
                        self::keys($v, ['type'], ['type']);
                        $attributes[$key] = ['type' => $v['type']];
                        break;
                    case 'enum':
                        $v = self::keys($v, ['type', 'values'], ['type', 'values']);
                        if (
                            !is_array($v['values']) ||
                            !array_is_list($v['values']) ||
                            !count($v['values']) ||
                            count($v['values']) > 16
                        ) {
                            self::fail('ADAPTER_REGISTRY', '枚举声明非法');
                        }
                        foreach ($v['values'] as $x) {
                            self::plain($x, 200);
                        }
                        if (
                            count(array_unique($v['values'], SORT_STRING)) !== count($v['values'])
                        ) {
                            self::fail('ADAPTER_REGISTRY', '枚举声明重复');
                        }
                        $attributes[$key] = ['type' => $v['type'], 'values' => $v['values']];
                        break;
                    default:
                        self::fail('ADAPTER_REGISTRY', '未知字段类型');
                }
            }
            $count = 0;
            $template = function ($v, $depth) use (&$template, &$count, $attributes) {
                if (++$count > 64 || $depth > 8) {
                    self::fail('ADAPTER_REGISTRY', '模板最多 64 节点/8 层');
                }
                $v = self::keys($v, ['field', 'text', 'tag', 'class', 'children'], []);
                if (array_key_exists('field', $v)) {
                    self::keys($v, ['field'], ['field']);
                    if (!is_string($v['field']) || !isset($attributes[$v['field']])) {
                        self::fail('ADAPTER_REGISTRY', '模板引用未知字段');
                    }
                    return ['field' => $v['field']];
                }
                if (array_key_exists('text', $v)) {
                    self::keys($v, ['text'], ['text']);
                    return ['text' => self::plain($v['text'], 4096)];
                }
                $v = self::keys($v, ['tag', 'class', 'children'], ['tag', 'children']);
                if (
                    !in_array(
                        $v['tag'],
                        ['div', 'p', 'span', 'strong', 'em', 'del', 'code'],
                        true,
                    ) ||
                    !is_array($v['children']) ||
                    !array_is_list($v['children'])
                ) {
                    self::fail('ADAPTER_REGISTRY', '模板只允许固定安全标签');
                }
                $result = ['tag' => $v['tag']];
                if (array_key_exists('class', $v)) {
                    if (
                        !is_string($v['class']) ||
                        strlen($v['class']) > 200 ||
                        !preg_match(
                            '/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*)*$/D',
                            $v['class'],
                        )
                    ) {
                        self::fail('ADAPTER_REGISTRY', '模板 class 非法');
                    }
                    $result['class'] = $v['class'];
                }
                $result['children'] = array_map(
                    fn($child) => $template($child, $depth + 1),
                    $v['children'],
                );
                foreach ($result['children'] as $child) {
                    if (
                        isset($child['tag']) &&
                        (($v['tag'] !== 'div' && in_array($child['tag'], ['div', 'p'], true)) ||
                            $v['tag'] === 'code')
                    ) {
                        self::fail('ADAPTER_REGISTRY', '模板标签嵌套会改变保存结构');
                    }
                }
                return $result;
            };
            $node = $template($raw['template'], 1);
            if (!isset($node['tag'])) {
                self::fail('ADAPTER_REGISTRY', '模板根必须为安全标签');
            }
            $d = [
                'schema' => 1,
                'name' => $raw['name'],
                'version' => $raw['version'],
                'blockName' => $raw['blockName'],
                'attributes' => $attributes,
                'template' => $node,
            ];
            if (strlen(Teaching::encode($d)) > 16384) {
                self::fail('ADAPTER_REGISTRY', '单个登记描述最多 16 KiB');
            }
            $out[] = $d;
        }
        usort($out, fn($a, $b) => strcmp($a['name'], $b['name']));
        return $out;
    }
    public static function descriptor(string $name, bool $block = false): ?array
    {
        foreach (self::$registry as $d) {
            if ($d[$block ? 'blockName' : 'name'] === $name) {
                return $d;
            }
        }
        return null;
    }
    public static function leafAttrs(array $descriptor, mixed $attrs, bool $source = false): array
    {
        $keys = array_keys($descriptor['attributes']);
        $attrs = self::keys(
            $attrs,
            [...$keys, ...!$source ? ['mbbAdapterVersion'] : []],
            [...$keys, ...!$source ? ['mbbAdapterVersion'] : []],
        );
        if (!$source && $attrs['mbbAdapterVersion'] !== $descriptor['version']) {
            self::fail('ADAPTER_VERSION', '适配版本不匹配，原配置保留但不能转换新候选');
        }
        $out = $source ? [] : ['mbbAdapterVersion' => $descriptor['version']];
        foreach ($descriptor['attributes'] as $key => $field) {
            $v = $attrs[$key];
            if ($field['type'] === 'plainText') {
                $out[$key] = self::plain($v, $field['maxLength']);
            } elseif ($field['type'] === 'integer') {
                if (!self::integer($v) || $v < $field['minimum'] || $v > $field['maximum']) {
                    self::fail('ADAPTER_ATTRIBUTES', '整数超出登记预算');
                }
                $out[$key] = (int) $v;
            } elseif ($field['type'] === 'boolean') {
                if (!is_bool($v)) {
                    self::fail('ADAPTER_ATTRIBUTES', '布尔字段类型非法');
                }
                $out[$key] = $v;
            } else {
                if (!in_array($v, $field['values'], true)) {
                    self::fail('ADAPTER_ATTRIBUTES', '枚举值不在登记集合中');
                }
                $out[$key] = $v;
            }
        }
        return $out;
    }
    public static function sourceAttrs(mixed $attrs): array
    {
        $attrs = self::keys($attrs, ['name', 'version', 'attrs'], ['name', 'version', 'attrs']);
        $d = is_string($attrs['name']) ? self::descriptor($attrs['name']) : null;
        if (!$d || $d['version'] !== $attrs['version']) {
            self::fail('ADAPTER_VERSION', '静态适配器缺失或版本不兼容；原配置未删除');
        }
        return [
            'descriptor' => $d,
            'attributes' =>
                ['mbbAdapterVersion' => $d['version']] + self::leafAttrs($d, $attrs['attrs'], true),
        ];
    }
    public static function text(mixed $v): string
    {
        return str_replace(
            '&gt;',
            '>',
            htmlspecialchars(
                is_bool($v) ? ($v ? 'true' : 'false') : (string) $v,
                ENT_NOQUOTES | ENT_SUBSTITUTE | ENT_HTML5,
                'UTF-8',
            ),
        );
    }
    public static function html(array $d, array $attrs): string
    {
        $render = function ($node) use (&$render, $attrs) {
            if (isset($node['text'])) {
                return self::text($node['text']);
            }
            if (isset($node['field'])) {
                return self::text($attrs[$node['field']]);
            }
            return '<' .
                $node['tag'] .
                (isset($node['class'])
                    ? ' class="' .
                        htmlspecialchars(
                            $node['class'],
                            ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5,
                            'UTF-8',
                        ) .
                        '"'
                    : '') .
                '>' .
                implode('', array_map($render, $node['children'])) .
                '</' .
                $node['tag'] .
                '>';
        };
        return $render($d['template']);
    }
}
