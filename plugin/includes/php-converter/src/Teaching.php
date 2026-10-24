<?php
namespace MarkBridge\Probe;
require_once __DIR__ . '/Bibliography.php';
require_once __DIR__ . '/Activity.php';

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

/** Pure fixed native-media v1 contract; attachment authorization is a host concern. */
final class NativeMedia
{
    private static function fail(string $code, string $message): never
    {
        throw new ConversionError($code, $message);
    }
    public static function caption(mixed $value): string
    {
        if (
            !is_string($value) ||
            !mb_check_encoding($value, 'UTF-8') ||
            strlen($value) > 4096 ||
            preg_match('/[\x00\r\n]/', $value)
        ) {
            self::fail(
                'MEDIA_CAPTION',
                'Media captions require bounded single-line safe inline content',
            );
        }
        $doc = new \DOMDocument();
        $old = libxml_use_internal_errors(true);
        try {
            $doc->loadHTML(
                '<!doctype html><html><head><meta charset="UTF-8"></head><body><div>' .
                    $value .
                    '</div></body></html>',
                LIBXML_NONET,
            );
            $errors = libxml_get_errors();
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($old);
        }
        $body = $doc->getElementsByTagName('body')->item(0);
        $root = $body?->firstChild;
        if (!$root || $root->nodeName !== 'div' || $body->childNodes->length !== 1 || $errors) {
            self::fail('MEDIA_CAPTION', 'Media caption HTML must be canonical and balanced');
        }
        $walk = function ($n, $depth = 0) use (&$walk) {
            if ($depth > 16) {
                self::fail('MEDIA_CAPTION', 'Media captions exceed their structure budget');
            }
            if ($n->nodeType === XML_TEXT_NODE) {
                return;
            }
            if (
                !($n instanceof \DOMElement) ||
                !in_array($n->tagName, ['strong', 'em', 'del', 'code', 'br'], true) ||
                $n->attributes->length
            ) {
                self::fail(
                    'MEDIA_CAPTION',
                    'Media captions only support text, strong, emphasis, deletion, code and line breaks',
                );
            }
            foreach ($n->childNodes as $c) {
                $walk($c, $depth + 1);
            }
        };
        foreach ($root->childNodes as $n) {
            $walk($n);
        }
        $out = '';
        foreach ($root->childNodes as $n) {
            $out .= $doc->saveHTML($n);
        }
        if (
            preg_replace('~<br\s*/?\s*>~', '<br>', $out) !==
            preg_replace('~<br\s*/?\s*>~', '<br>', $value)
        ) {
            self::fail('MEDIA_CAPTION', 'Media caption HTML must be canonical and balanced');
        }
        return $value;
    }
    public static function attrs(string $kind, mixed $input, bool $source = true): array
    {
        if ($input instanceof \stdClass) {
            $input = get_object_vars($input);
        }
        if (!is_array($input) || (array_is_list($input) && $input !== [])) {
            self::fail('MEDIA_ATTRIBUTES', 'Native media attributes must be a closed object');
        }
        // Only native editor input may carry Gutenberg's equivalent gallery default.
        if (!$source && $kind === 'gallery' && ($input['linkTo'] ?? null) === 'none') {
            unset($input['linkTo']);
        }
        $allowed =
            $kind === 'image'
                ? ['caption', 'id', 'sizeSlug', 'linkDestination']
                : ['columns', 'imageCrop'];
        if (array_diff(array_keys($input), $allowed)) {
            self::fail('MEDIA_ATTRIBUTES', 'Unsupported native media attribute');
        }
        $a = [];
        foreach ($allowed as $k) {
            if (array_key_exists($k, $input)) {
                $a[$k] = $input[$k];
            }
        }
        if ($kind === 'image') {
            if (array_key_exists('caption', $a)) {
                self::caption($a['caption']);
            }
            if (
                array_key_exists('id', $a) &&
                (!is_numeric($a['id']) ||
                    (!is_int($a['id']) && !is_float($a['id'])) ||
                    !is_finite((float) $a['id']) ||
                    floor($a['id']) != $a['id'] ||
                    $a['id'] < 1 ||
                    $a['id'] > 9007199254740991)
            ) {
                self::fail('MEDIA_ID', 'Media attachment IDs must be positive safe integers');
            }
            if (isset($a['id'])) {
                $a['id'] = (int) $a['id'];
            }
            if (
                array_key_exists('sizeSlug', $a) &&
                !in_array($a['sizeSlug'], ['thumbnail', 'medium', 'large', 'full'], true)
            ) {
                self::fail('MEDIA_ATTRIBUTES', 'Unsupported native image size');
            }
            if (array_key_exists('linkDestination', $a) && $a['linkDestination'] !== 'none') {
                self::fail(
                    'MEDIA_LINK',
                    'Only unlinked native images are supported in this version',
                );
            }
            if (($a['caption'] ?? null) === '') {
                unset($a['caption']);
            }
        } else {
            if (
                array_key_exists('columns', $a) &&
                ((!is_int($a['columns']) && !is_float($a['columns'])) ||
                    floor($a['columns']) != $a['columns'] ||
                    $a['columns'] < 1 ||
                    $a['columns'] > 8)
            ) {
                self::fail('MEDIA_ATTRIBUTES', 'Gallery columns must be an integer from 1 to 8');
            }
            if (isset($a['columns'])) {
                $a['columns'] = (int) $a['columns'];
            }
            if (array_key_exists('imageCrop', $a) && !is_bool($a['imageCrop'])) {
                self::fail('MEDIA_ATTRIBUTES', 'Gallery imageCrop must be a boolean');
            }
        }
        return $a;
    }
    public static function assertPortable(string $serialized): void
    {
        preg_match_all('~<!-- wp:image(?: (\{[\s\S]*?\}))? -->~', $serialized, $matches);
        foreach ($matches[1] as $raw) {
            $a = json_decode($raw ?: '{}', true, 32, JSON_THROW_ON_ERROR);
            if (isset($a['id'])) {
                self::fail(
                    'MEDIA_LOCAL_ID',
                    'Portable exports cannot carry local media attachment IDs',
                );
            }
        }
    }
    public static function directive(string $kind, array $a, string $body): string
    {
        return ':::mbb:v1 ' .
            $kind .
            ' ' .
            Teaching::encode($a ?: new \stdClass()) .
            "\n\n" .
            rtrim($body) .
            "\n\n:::mbb:end";
    }
    public static function assemble(array $item): array
    {
        $kind = $item['kind'];
        $a = self::attrs($kind, $item['attrs']);
        $children = $item['children'];
        if ($kind === 'image') {
            if (
                count($children) !== 1 ||
                $children[0]['name'] !== 'core/image' ||
                ($children[0]['children'] ?? []) ||
                $children[0]['attrs']
            ) {
                self::fail(
                    'MEDIA_STRUCTURE',
                    'An image directive requires exactly one ordinary Markdown image',
                );
            }
            return [
                'name' => 'core/image',
                'attrs' => $a,
                'children' => [],
                'content' => $children[0]['content'],
            ];
        }
        if (
            !$children ||
            count($children) > 32 ||
            array_filter($children, fn($b) => $b['name'] !== 'core/image')
        ) {
            self::fail('MEDIA_STRUCTURE', 'A gallery requires 1 to 32 direct native images');
        }
        return ['name' => 'core/gallery', 'attrs' => $a, 'children' => $children, 'content' => ''];
    }
}

final class TechnicalReference extends \League\CommonMark\Node\Inline\AbstractStringContainer {}
final class TechnicalInlineParser implements \League\CommonMark\Parser\Inline\InlineParserInterface
{
    public function getMatchDefinition(): \League\CommonMark\Parser\Inline\InlineParserMatch
    {
        return \League\CommonMark\Parser\Inline\InlineParserMatch::string('<span');
    }
    public function parse(\League\CommonMark\Parser\InlineParserContext $context): bool
    {
        $cursor = $context->getCursor();
        $raw = $cursor->getRemainder();
        if (!Technical::opening($raw)) {
            return false;
        }
        $depth = 0;
        foreach ($context->getContainer()->children() as $node) {
            if (
                !($node instanceof \League\CommonMark\Extension\CommonMark\Node\Inline\HtmlInline)
            ) {
                continue;
            }
            if (preg_match('/^<(?:code|pre)(?:\s|>)/i', $node->getLiteral())) {
                $depth++;
            } elseif (preg_match('/^<\/(?:code|pre)\s*>/i', $node->getLiteral())) {
                $depth = max(0, $depth - 1);
            }
        }
        if ($depth) {
            return false;
        }
        $reference = Technical::reference($raw, false);
        $context->getContainer()->appendChild(new TechnicalReference($reference['raw']));
        $cursor->advanceBy(mb_strlen($reference['raw'], 'UTF-8'));
        return true;
    }
}

final class Technical
{
    public const SCHEMAS = [
        'object' => ['id' => 'string', 'kind' => 'string', 'caption' => 'string'],
        'statement' => [
            'id' => 'string',
            'kind' => 'string',
            'title' => 'string',
            'open' => 'boolean',
        ],
        'bibliography' => ['id' => 'string', 'entries' => 'array'],
    ];
    public static function fail(string $code, string $message): never
    {
        throw new ConversionError($code, $message);
    }
    public static function id(mixed $value): bool
    {
        return is_string($value) && preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $value);
    }
    private static function plain(mixed $value, int $limit, bool $required = false): bool
    {
        return is_string($value) &&
            mb_strlen($value, 'UTF-8') <= $limit &&
            !preg_match('/[\r\n\x00]/', $value) &&
            (!$required ||
                preg_replace(
                    '/[ \t\r\n\f\v\x{0085}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]/u',
                    '',
                    $value,
                ) !== '');
    }
    public static function attrs(string $kind, array $a): array
    {
        if (
            $kind === 'object' &&
            (!in_array($a['kind'], ['equation', 'figure', 'table', 'listing'], true) ||
                !self::plain($a['caption'], 512, true))
        ) {
            self::fail(
                'TECHNICAL_ATTRIBUTES',
                'An object requires a supported kind and a plain caption of 1–512 characters',
            );
        }
        if (
            $kind === 'statement' &&
            (!in_array($a['kind'], ['definition', 'theorem', 'proof'], true) ||
                !self::plain($a['title'], 200, true) ||
                ($a['kind'] !== 'proof' && $a['open'] !== true))
        ) {
            self::fail(
                'TECHNICAL_ATTRIBUTES',
                'A statement requires a supported kind and title; only proofs may be closed',
            );
        }
        if ($kind === 'bibliography') {
            if (($a['version'] ?? 1) === 2 || array_key_exists('style', $a)) {
                return Bibliography::attrs($a);
            }
            $entries = $a['entries'];
            if (
                !is_array($entries) ||
                !count($entries) ||
                count($entries) > 64 ||
                strlen(Teaching::encode($entries)) > 65536
            ) {
                self::fail(
                    'TECHNICAL_ATTRIBUTES',
                    'A bibliography requires 1–64 entries within 64 KiB',
                );
            }
            $keys = [];
            foreach ($entries as $entry) {
                $e =
                    $entry instanceof \stdClass
                        ? get_object_vars($entry)
                        : (is_array($entry)
                            ? $entry
                            : []);
                $fields = array_keys($e);
                sort($fields);
                if (
                    $fields !== ['authors', 'key', 'source', 'title', 'url', 'year'] ||
                    !self::id($e['key']) ||
                    isset($keys[$e['key']]) ||
                    !is_array($e['authors']) ||
                    count($e['authors']) > 8 ||
                    !self::plain($e['title'], 512, true) ||
                    !self::plain($e['source'], 512) ||
                    !self::plain($e['year'], 32) ||
                    !self::plain($e['url'], 2048)
                ) {
                    self::fail(
                        'TECHNICAL_ATTRIBUTES',
                        'Bibliography fields are incomplete, duplicated, or outside their bounds',
                    );
                }
                foreach ($e['authors'] as $name) {
                    if (!self::plain($name, 120, true)) {
                        self::fail(
                            'TECHNICAL_ATTRIBUTES',
                            'Bibliography author names are outside their bounds',
                        );
                    }
                }
                $keys[$e['key']] = true;
                if ($e['url'] !== '') {
                    $url = parse_url($e['url']);
                    if (
                        !$url ||
                        !preg_match('~^https?://[^/?#]+~i', $e['url']) ||
                        !in_array(strtolower($url['scheme'] ?? ''), ['http', 'https'], true) ||
                        empty($url['host']) ||
                        isset($url['user']) ||
                        isset($url['pass']) ||
                        preg_match(
                            '/[\x00-\x20\x7f\\\\\x{0085}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]/u',
                            $e['url'],
                        )
                    ) {
                        self::fail(
                            'TECHNICAL_ATTRIBUTES',
                            'Bibliography URLs must use absolute HTTP or HTTPS without credentials',
                        );
                    }
                }
            }
        }
        return $a;
    }
    public static function opening(string $raw): bool
    {
        return (bool) preg_match(
            '/^<span\b[^>]*(?:mbb-(?:xref|cite)|data-mbb-(?:target|keys|version))/i',
            $raw,
        );
    }
    public static function reference(string $raw, bool $complete = true): array
    {
        $bad = static fn() => self::fail(
            'TECHNICAL_REFERENCE',
            'The versioned reference marker is malformed or its text differs from its identity',
        );
        if (
            !preg_match(
                '/^<span((?:\s+[a-z][a-z0-9-]*="[^"<>]*")+)>([^<>\r\n]*)<\/span>/',
                $raw,
                $m,
            ) ||
            ($complete && strlen($m[0]) !== strlen($raw))
        ) {
            $bad();
        }
        preg_match_all('/\s+([a-z][a-z0-9-]*)="([^"<>]*)"/', $m[1], $matches, PREG_SET_ORDER);
        $attrs = [];
        foreach ($matches as $item) {
            if (array_key_exists($item[1], $attrs)) {
                $bad();
            }
            $attrs[$item[1]] = $item[2];
        }
        $kind =
            ($attrs['class'] ?? '') === 'mbb-xref'
                ? 'xref'
                : (($attrs['class'] ?? '') === 'mbb-cite'
                    ? 'cite'
                    : null);
        $identity = $attrs[$kind === 'xref' ? 'data-mbb-target' : 'data-mbb-keys'] ?? null;
        if ($kind === 'xref' && ($attrs['data-mbb-version'] ?? '') === '2') {
            if (
                count($attrs) !== 6 ||
                array_diff(array_keys($attrs), [
                    'class',
                    'data-mbb-version',
                    'data-mbb-namespace',
                    'data-mbb-document',
                    'data-mbb-target',
                    'data-mbb-kind',
                ]) ||
                !preg_match('/^S_[a-f0-9]{32}$/D', $attrs['data-mbb-namespace'] ?? '') ||
                !preg_match('/^D_[a-f0-9]{32}$/D', $attrs['data-mbb-document'] ?? '') ||
                !is_string($identity) ||
                !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $identity) ||
                !in_array(
                    $attrs['data-mbb-kind'] ?? '',
                    ['equation', 'figure', 'table', 'listing', 'statement', 'step', 'activity'],
                    true,
                ) ||
                $m[2] !== '[' . $identity . ']'
            ) {
                $bad();
            }
            return [
                'raw' => $m[0],
                'kind' => 'xref',
                'keys' => [$identity],
                'version' => 2,
                'namespace' => $attrs['data-mbb-namespace'],
                'document' => $attrs['data-mbb-document'],
                'targetKind' => $attrs['data-mbb-kind'],
            ];
        }
        if (
            !$kind ||
            count($attrs) !== 3 ||
            ($attrs['data-mbb-version'] ?? '') !== '1' ||
            !is_string($identity) ||
            !preg_match(
                '/^[A-Za-z][A-Za-z0-9_-]{0,63}(?:,[A-Za-z][A-Za-z0-9_-]{0,63}){0,7}$/D',
                $identity,
            ) ||
            ($kind === 'xref' && str_contains($identity, ',')) ||
            $m[2] !== '[' . $identity . ']'
        ) {
            $bad();
        }
        $keys = explode(',', $identity);
        if (count(array_unique($keys)) !== count($keys)) {
            $bad();
        }
        return ['raw' => $m[0], 'kind' => $kind, 'keys' => $keys];
    }
    public static function storedReference(string $raw): string
    {
        $ref = self::reference($raw);
        if (($ref['version'] ?? 1) === 2) {
            return '<span data-mbb-target="' .
                $ref['keys'][0] .
                '" data-mbb-version="2" data-mbb-namespace="' .
                $ref['namespace'] .
                '" data-mbb-document="' .
                $ref['document'] .
                '" data-mbb-kind="' .
                $ref['targetKind'] .
                '" class="mbb-xref">[' .
                $ref['keys'][0] .
                ']</span>';
        }
        $identity = implode(',', $ref['keys']);
        return '<span data-mbb-' .
            ($ref['kind'] === 'xref' ? 'target' : 'keys') .
            '="' .
            $identity .
            '" data-mbb-version="1" class="mbb-' .
            $ref['kind'] .
            '">[' .
            $identity .
            ']</span>';
    }
    public static function raw(string $html): array
    {
        $raw = preg_replace('/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/i', '', $html);
        preg_match_all('/<span\b[^>]*>/i', $raw, $matches, PREG_OFFSET_CAPTURE);
        $refs = [];
        foreach ($matches[0] as [$tag, $offset]) {
            if (self::opening($tag)) {
                $refs[] = self::reference(substr($raw, $offset), false);
            }
        }
        return $refs;
    }
    public static function validate(array $blocks): void
    {
        $objects = [];
        $keys = [];
        $refs = [];
        $groups = 0;
        $count = 0;
        $walk = function (array $list, int $depth = 0, bool $footnote = false) use (
            &$walk,
            &$objects,
            &$keys,
            &$refs,
            &$groups,
            &$count,
        ): void {
            $seenFootnotes = false;
            foreach ($list as $b) {
                $name = $b['name'];
                $a = $b['attrs'] ?? [];
                $inner = $b['children'] ?? [];
                $kind = str_starts_with($name, 'mbb/') ? substr($name, 4) : '';
                if ($name === 'mbb/footnotes') {
                    $seenFootnotes = true;
                }
                if (isset(self::SCHEMAS[$kind])) {
                    if (++$count > 2048) {
                        self::fail(
                            'STRUCTURE_LIMIT',
                            'Technical objects exceed the document budget',
                        );
                    }
                    self::attrs($kind, $a);
                    if ($kind !== 'bibliography') {
                        if ($footnote) {
                            self::fail(
                                'TECHNICAL_STRUCTURE',
                                'Technical objects and statements must not be inside footnotes',
                            );
                        }
                        $objects[$a['id']] = true;
                    }
                    if (
                        $kind === 'object' &&
                        (count($inner) !== 1 ||
                            $inner[0]['name'] !==
                                [
                                    'equation' => 'mbb/math',
                                    'figure' => 'core/image',
                                    'table' => 'core/table',
                                    'listing' => 'mbb/code',
                                ][$a['kind']])
                    ) {
                        self::fail(
                            'TECHNICAL_STRUCTURE',
                            'An object must contain exactly one matching supported block',
                        );
                    }
                    if ($kind === 'statement' && !$inner) {
                        self::fail('TECHNICAL_STRUCTURE', 'A statement body must not be empty');
                    }
                    if ($kind === 'bibliography') {
                        if (++$groups > 1 || $depth || $inner || $seenFootnotes) {
                            self::fail(
                                'TECHNICAL_STRUCTURE',
                                'One bibliography is allowed at top level before footnotes, without body blocks',
                            );
                        }
                        foreach ($a['entries'] as $e) {
                            $keys[is_array($e) ? $e['key'] : $e->key] = true;
                        }
                    }
                }
                if (
                    !in_array(
                        $name,
                        ['mbb/code', 'mbb/math', 'core/code', 'core/preformatted'],
                        true,
                    )
                ) {
                    foreach (self::raw($b['content'] ?? '') as $ref) {
                        $refs[] = $ref;
                    }
                    if (count($refs) > 4096) {
                        self::fail(
                            'STRUCTURE_LIMIT',
                            'Technical references exceed the document budget',
                        );
                    }
                }
                $walk($inner, $depth + 1, $footnote || $name === 'mbb/footnote');
            }
        };
        $walk($blocks);
        foreach ($refs as $ref) {
            if (($ref['version'] ?? 1) === 2) {
                continue;
            }
            foreach ($ref['keys'] as $key) {
                if (!isset(($ref['kind'] === 'xref' ? $objects : $keys)[$key])) {
                    self::fail(
                        'TECHNICAL_MISSING',
                        'A technical reference has no matching object or bibliography entry',
                    );
                }
            }
        }
    }
    public static function html(string $kind, array $a, string $children): string
    {
        $esc = static fn($v) => str_replace(
            '<',
            '&lt;',
            preg_replace('/&(?!([a-z0-9]+|#[0-9]+|#x[a-f0-9]+);)/i', '&amp;', $v),
        );
        $attr = static fn($v) => htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $id = $attr($a['id']);
        if ($kind === 'object') {
            return '<figure id="' .
                $id .
                '" class="mbb-technical-object" data-mbb-object-kind="' .
                $a['kind'] .
                '"><div class="mbb-technical-body">' .
                $children .
                '</div><figcaption class="mbb-technical-caption">' .
                $esc($a['caption']) .
                '</figcaption></figure>';
        }
        if ($kind === 'statement') {
            $proof = $a['kind'] === 'proof';
            $tag = $proof ? 'details' : 'section';
            $heading = $proof ? 'summary' : 'p';
            return '<' .
                $tag .
                ' id="' .
                $id .
                '" class="mbb-technical-statement" data-mbb-statement-kind="' .
                $a['kind'] .
                '"' .
                ($proof && $a['open'] ? ' open' : '') .
                '><' .
                $heading .
                ' class="mbb-technical-heading">' .
                $esc($a['title']) .
                '</' .
                $heading .
                '><div class="mbb-technical-body">' .
                $children .
                '</div></' .
                $tag .
                '>';
        }
        $html =
            '<section id="' .
            $id .
            '" class="mbb-bibliography"' .
            (($a['version'] ?? 1) === 2
                ? ' data-mbb-bibliography-version="2" data-mbb-citation-style="' . $a['style'] . '"'
                : '') .
            '><p class="mbb-bibliography-title">Bibliography</p><ol>';
        foreach ($a['entries'] as $entry) {
            if (($a['version'] ?? 1) === 2) {
                $entry = Bibliography::projection($entry);
            }
            $html .=
                '<li data-mbb-bib-key="' .
                $attr(is_array($entry) ? $entry['key'] : $entry->key) .
                '">';
            foreach (['authors', 'title', 'year', 'source', 'url'] as $field) {
                $html .=
                    '<span class="mbb-bib-' .
                    $field .
                    '">' .
                    $esc(
                        $field === 'authors'
                            ? implode(', ', is_array($entry) ? $entry['authors'] : $entry->authors)
                            : (is_array($entry)
                                ? $entry[$field]
                                : $entry->$field),
                    ) .
                    '</span>';
            }
            $html .= '</li>';
        }
        return $html . '</ol></section>';
    }
}

/** Closed v1 teaching grammar, shared semantics with src/teaching.js. */
final class Teaching
{
    public const SCHEMAS = [
        ...Technical::SCHEMAS,
        'identity' => ['namespace' => 'string', 'document' => 'string'],
        'image' => [],
        'gallery' => [],
        'native-code' => [],
        'preformatted' => [],
        'group' => [],
        'details' => [],
        'buttons' => [],
        'button' => [],
        'adapter' => [],
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
        if (($native = BlockAdapters::kind($name)) !== null) {
            return $native;
        }
        if (BlockAdapters::descriptor($name, true)) {
            return 'adapter';
        }
        $kind = substr($name, 4);
        return str_starts_with($name, 'mbb/') && isset(self::SCHEMAS[$kind]) ? $kind : null;
    }
    private static function fail(string $code, string $message): never
    {
        throw new ConversionError($code, $message);
    }
    public static function attrs(
        string $kind,
        mixed $attrs,
        bool $source = false,
        ?string $blockName = null,
        int $sourceVersion = 1,
    ): array {
        if (in_array($kind, ['image', 'gallery'], true)) {
            return NativeMedia::attrs($kind, $attrs);
        }
        if (isset(BlockAdapters::NATIVE[$kind])) {
            return BlockAdapters::nativeAttrs($kind, $attrs, $source);
        }
        if ($kind === 'adapter') {
            if ($source) {
                $a = BlockAdapters::sourceAttrs($attrs);
                return [
                    'name' => $a['descriptor']['name'],
                    'version' => $a['descriptor']['version'],
                    'attrs' => array_intersect_key(
                        $a['attributes'],
                        $a['descriptor']['attributes'],
                    ),
                ];
            }
            $d = $blockName ? BlockAdapters::descriptor($blockName, true) : null;
            if (!$d) {
                self::fail('ADAPTER_VERSION', 'The static adapter is missing or incompatible');
            }
            return BlockAdapters::leafAttrs($d, $attrs);
        }
        if (!is_array($attrs)) {
            self::fail('TEACHING_ATTRIBUTES', 'Incomplete teaching attributes');
        }
        $schema =
            self::SCHEMAS[$kind] +
            ($kind === 'component' &&
            (($attrs['version'] ?? 1) === 2 || ($source && array_key_exists('activity', $attrs)))
                ? ['activity' => 'object']
                : []) +
            ($kind === 'bibliography' &&
            (($attrs['version'] ?? 1) === 2 || ($source && array_key_exists('style', $attrs)))
                ? ['style' => 'string'] +
                    (array_key_exists('origins', $attrs) ? ['origins' => 'array'] : [])
                : []) +
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
        if (
            !$source &&
            $attrs['version'] !== 1 &&
            !(
                in_array($kind, ['bibliography', 'component', 'code-tabs'], true) &&
                $attrs['version'] === 2
            )
        ) {
            self::fail('TEACHING_VERSION', 'Unsupported teaching block version');
        }
        $out = [];
        foreach ($schema as $key => $type) {
            $out[$key] = $attrs[$key];
        }
        if ($kind === 'identity') {
            if (
                !preg_match('/^S_[a-f0-9]{32}$/D', $out['namespace']) ||
                !preg_match('/^D_[a-f0-9]{32}$/D', $out['document'])
            ) {
                self::fail(
                    'DOCUMENT_IDENTITY',
                    'A logical identity requires a closed namespace and document tuple',
                );
            }
            return $out;
        }
        if (isset(Technical::SCHEMAS[$kind])) {
            Technical::attrs($kind, $out);
        }
        if ($kind === 'code-tabs') {
            $out['tabs'] = self::tabs(
                $source ? $out + ['version' => $sourceVersion] : $out,
                $source,
            );
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
            if (array_key_exists('activity', $out)) {
                Activity::relations($out['activity']);
            }
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
        $keys = array_merge(
            $source ? ['id', 'title', 'terminalNewline'] : ['id', 'title', 'language', 'code'],
            ($attrs['version'] ?? 1) === 2 ? ['startLine', 'highlights'] : [],
        );
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
            if (($attrs['version'] ?? 1) === 2) {
                $count = $source
                    ? null
                    : max(
                        1,
                        count(
                            explode(
                                "\n",
                                preg_replace(
                                    '/\n$/',
                                    '',
                                    str_replace(["\r\n", "\r"], "\n", $tab['code']),
                                ),
                            ),
                        ),
                    );
                if (
                    !(
                        is_int($tab['startLine']) ||
                        (is_float($tab['startLine']) &&
                            is_finite($tab['startLine']) &&
                            floor($tab['startLine']) === $tab['startLine'])
                    ) ||
                    $tab['startLine'] < 1 ||
                    $tab['startLine'] > 999999 ||
                    ($count !== null && $tab['startLine'] + $count - 1 > 999999) ||
                    !is_string($tab['highlights']) ||
                    strlen($tab['highlights']) > 512 ||
                    !preg_match(
                        '/^(?:[1-9]\d{0,5}(?:-[1-9]\d{0,5})?(?:,[1-9]\d{0,5}(?:-[1-9]\d{0,5})?)*)?$/D',
                        $tab['highlights'],
                    )
                ) {
                    self::fail('CODE_TABS_LINES', 'Invalid code line metadata');
                }
                $tab['startLine'] = (int) $tab['startLine'];
                $ranges = $tab['highlights'] === '' ? [] : explode(',', $tab['highlights']);
                if (count($ranges) > 32) {
                    self::fail('CODE_TABS_LINES', 'Too many highlighted ranges');
                }
                $previous = 0;
                foreach ($ranges as $range) {
                    $parts = array_map('intval', explode('-', $range));
                    $start = $parts[0];
                    $end = $parts[1] ?? $start;
                    if (
                        $start < $tab['startLine'] ||
                        $end < $start ||
                        $start <= $previous ||
                        ($count !== null && $end >= $tab['startLine'] + $count)
                    ) {
                        self::fail(
                            'CODE_TABS_LINES',
                            'Highlighted ranges must be ordered, disjoint and within the code',
                        );
                    }
                    $previous = $end;
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
        if (
            is_object($tabObject) &&
            property_exists($tabObject, 'origins') &&
            (!is_array($tabObject->origins) ||
                array_filter(
                    $tabObject->origins,
                    static fn($origin) => !($origin instanceof \stdClass),
                ))
        ) {
            self::fail(
                'BIBLIOGRAPHY_V2',
                'Bibliography origins must be a JSON array of closed objects',
            );
        }
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
            is_object($object->attrs) &&
            property_exists($object->attrs, 'params')
        ) {
            $attrs['attrs']['params'] = $object->attrs->params;
        }
        if (is_object($object) && property_exists($object, 'params')) {
            $attrs['params'] = $object->params;
        }
        if (is_object($object) && property_exists($object, 'activity')) {
            $attrs['activity'] = $object->activity;
        }
        if (
            is_object($object) &&
            isset($object->attrs) &&
            is_object($object->attrs) &&
            property_exists($object->attrs, 'activity')
        ) {
            $attrs['attrs']['activity'] = $object->attrs->activity;
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
                !preg_match('/^:::mbb:v([12]) code-tabs (\{[^\r\n]*\})$/D', $text($i), $match)
            ) {
                continue;
            }
            $a = self::attrs('code-tabs', self::json($match[2]), true, null, (int) $match[1]);
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
        // A raw controlled paragraph inside a button contains literal text, not math/image syntax.
        foreach ($rawLines as $i => $raw) {
            $insideHtml = false;
            foreach ($protected as [$a, $b]) {
                if ($offsets[$i] >= $a && $offsets[$i] < $b) {
                    $insideHtml = true;
                }
            }
            if (
                $insideHtml ||
                isset($ignored[$i]) ||
                !str_starts_with($text($i) ?? '', ':::mbb:v1 button ')
            ) {
                continue;
            }
            $begin = $i + 1;
            while ($begin < count($rawLines) && preg_match('/^[ \t]*$/D', $text($begin))) {
                $begin++;
            }
            if (!str_starts_with($text($begin) ?? '', '<p>')) {
                continue;
            }
            $end = $begin;
            while ($end < count($rawLines) && !str_ends_with($text($end) ?? '', '</p>')) {
                $end++;
            }
            if ($end === count($rawLines)) {
                self::fail('ADAPTER_STRUCTURE', 'The button text paragraph is unclosed');
            }
            $html = rtrim(implode('', array_slice($rawLines, $begin, $end - $begin + 1)), "\r\n");
            $replacements[$begin] = $marker(['rawButton' => BlockAdapters::buttonParagraph($html)]);
            for ($n = $begin + 1; $n <= $end; $n++) {
                $replacements[$n] = '';
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
            if (
                preg_match(
                    '/^ {0,3}\[\^[^\]\r\n]+\]:[ \t]*:::mbb:v1 (?:object|statement) \{/',
                    $line,
                )
            ) {
                self::fail(
                    'TECHNICAL_STRUCTURE',
                    'Technical objects and statements must not be inside footnotes',
                );
            }
            if (preg_match('/^ {0,3}\[\^[^\]\r\n]+\]:/', $line)) {
                $definitionBeforeBibliography = true;
            }
            if (
                ($definitionBeforeBibliography ?? false) &&
                preg_match('/^:::mbb:v[12] bibliography /', $line)
            ) {
                self::fail(
                    'TECHNICAL_STRUCTURE',
                    'The bibliography must precede footnote definitions',
                );
            }
            if (!str_starts_with($line, ':::mbb:')) {
                continue;
            }
            if ($line === ':::mbb:end') {
                $data = ['end' => true];
            } else {
                if (
                    !preg_match(
                        '/^:::mbb:v([12]) (identity|collapse|steps|step|code-compare|component|code-tabs|native-code|preformatted|group|details|buttons|button|adapter|object|statement|bibliography|image|gallery) (\{.*\})$/D',
                        $line,
                        $m,
                    )
                ) {
                    self::fail('TEACHING_SYNTAX', 'Invalid versioned teaching directive');
                }
                try {
                    $a = self::json($m[3]);
                } catch (\JsonException $e) {
                    self::fail('TEACHING_ATTRIBUTES', 'Invalid JSON attributes');
                }
                if (
                    $m[1] === '2' &&
                    !in_array($m[2], ['bibliography', 'component', 'code-tabs'], true)
                ) {
                    self::fail('TEACHING_VERSION', 'Unsupported teaching block version');
                }
                if ($m[2] === 'component' && ($m[1] === '2') !== array_key_exists('activity', $a)) {
                    self::fail(
                        'ACTIVITY_RELATION',
                        'Activity relations require a closed map of unique local static targets',
                    );
                }
                if ($m[2] === 'bibliography' && ($m[1] === '2') !== array_key_exists('style', $a)) {
                    self::fail('TEACHING_ATTRIBUTES', 'Incomplete teaching attributes');
                }
                $data = [
                    'kind' => $m[2],
                    'version' => (int) $m[1],
                    'attrs' => self::attrs($m[2], $a, true, null, (int) $m[1]),
                ];
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
            if (array_key_exists('rawButton', $data)) {
                $stack[$i]['children'][] = [
                    'name' => 'core/paragraph',
                    'attrs' => [],
                    'children' => [],
                    'content' => BlockAdapters::buttonText($data['rawButton']),
                ];
                continue;
            }
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
            if (in_array($item['kind'], ['image', 'gallery'], true)) {
                $stack[count($stack) - 1]['children'][] = NativeMedia::assemble($item);
                continue;
            }
            if (isset(BlockAdapters::NATIVE[$item['kind']])) {
                $a = BlockAdapters::nativeAttrs($item['kind'], $item['attrs'], true);
                if (BlockAdapters::textKind($item['kind'])) {
                    if ($item['children']) {
                        self::fail(
                            'ADAPTER_STRUCTURE',
                            'Native text leaves cannot contain body content',
                        );
                    }
                    $a['content'] = BlockAdapters::textHtml($a['text'], $item['kind']);
                    unset($a['text']);
                }
                if ($item['kind'] === 'details') {
                    $a['summary'] = BlockAdapters::text($a['summary']);
                }
                if ($item['kind'] === 'button') {
                    if (
                        count($item['children']) !== 1 ||
                        !in_array(
                            $item['children'][0]['name'],
                            ['core/paragraph', 'core/html'],
                            true,
                        ) ||
                        ($item['children'][0]['children'] ?? []) !== []
                    ) {
                        self::fail(
                            'ADAPTER_STRUCTURE',
                            'A link button must contain exactly one controlled text paragraph',
                        );
                    }
                    $a['text'] =
                        $item['children'][0]['name'] === 'core/html'
                            ? BlockAdapters::buttonParagraph($item['children'][0]['content'] ?? '')
                            : BlockAdapters::buttonText($item['children'][0]['content'] ?? '');
                    $item['children'] = [];
                }
                $stack[count($stack) - 1]['children'][] = [
                    'name' => BlockAdapters::NATIVE[$item['kind']],
                    'attrs' => $a,
                    'children' => $item['children'],
                    'content' => '',
                ];
                continue;
            }
            if ($item['kind'] === 'adapter') {
                if ($item['children']) {
                    self::fail(
                        'ADAPTER_STRUCTURE',
                        'Static adapter containers must not contain body content',
                    );
                }
                $a = BlockAdapters::sourceAttrs($item['attrs']);
                $stack[count($stack) - 1]['children'][] = [
                    'name' => $a['descriptor']['blockName'],
                    'attrs' => $a['attributes'],
                    'children' => [],
                    'content' => '',
                ];
                continue;
            }
            $item['attrs']['version'] = $item['version'] ?? 1;
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
                    $tab =
                        [
                            'id' => $tab['id'],
                            'title' => $tab['title'],
                            'language' => $child['attrs']['language'],
                            'code' => $child['attrs']['code'],
                        ] +
                        ($item['attrs']['version'] === 2
                            ? ['startLine' => $tab['startLine'], 'highlights' => $tab['highlights']]
                            : []);
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
        $identities = 0;
        $count = 0;
        $walk = function (
            array $list,
            string $parent = '',
            int $depth = 0,
            int $collapse = 0,
            int $details = 0,
        ) use (&$walk, &$ids, &$groups, &$identities, &$count): void {
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
                    $a = self::attrs($kind, $b['attrs'], false, $b['name']);
                    if ($kind === 'component') {
                        Activity::validate([
                            'name' => $b['name'],
                            'attrs' => $a,
                            'children' => $inner,
                        ]);
                    }
                    if ($kind === 'identity') {
                        if ($depth || ++$identities > 1 || $inner) {
                            self::fail(
                                'DOCUMENT_IDENTITY',
                                'A document permits one empty top-level logical identity',
                            );
                        }
                        continue;
                    }
                    if (isset(BlockAdapters::NATIVE[$kind]) || $kind === 'adapter') {
                        if ($kind === 'details' && $details >= 8) {
                            self::fail(
                                'ADAPTER_LIMIT',
                                'Native details are limited to 8 nested levels',
                            );
                        }
                        if (isset($a['anchor'])) {
                            if (isset($ids[$a['anchor']])) {
                                self::fail('ADAPTER_ANCHOR', 'The anchor duplicates a document ID');
                            }
                            $ids[$a['anchor']] = true;
                        }
                        if (
                            $kind === 'buttons' &&
                            (!$inner ||
                                count($inner) > 32 ||
                                array_filter(
                                    $inner,
                                    fn($child) => $child['name'] !== 'core/button',
                                ))
                        ) {
                            self::fail(
                                'ADAPTER_STRUCTURE',
                                'A button group requires 1–32 direct link buttons',
                            );
                        }
                        if ($kind === 'button' && ($parent !== 'buttons' || $inner)) {
                            self::fail(
                                'ADAPTER_STRUCTURE',
                                'A link button must be a direct leaf of a button group',
                            );
                        }
                        if (BlockAdapters::textKind($kind) && $inner) {
                            self::fail(
                                'ADAPTER_STRUCTURE',
                                'Native text leaves cannot contain body content',
                            );
                        }
                        if ($kind === 'adapter' && $inner) {
                            self::fail(
                                'ADAPTER_STRUCTURE',
                                'Static adapters must not contain nested blocks',
                            );
                        }
                        $walk(
                            $inner,
                            $kind,
                            $depth + 1,
                            $collapse,
                            $details + ($kind === 'details' ? 1 : 0),
                        );
                        continue;
                    }
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
                    $details,
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
        Technical::validate($blocks);
    }
    public static function markdown(array $block, string $body): string
    {
        $kind = self::kind($block['name']);
        $a = self::attrs($kind, $block['attrs'], false, $block['name']);
        if (isset(BlockAdapters::NATIVE[$kind]) || $kind === 'adapter') {
            if ($kind === 'adapter') {
                $d = BlockAdapters::descriptor($block['name'], true);
                $header = [
                    'name' => $d['name'],
                    'version' => $d['version'],
                    'attrs' => array_intersect_key($a, $d['attributes']),
                ];
            } else {
                $header = $a;
                if (BlockAdapters::textKind($kind)) {
                    $header['text'] = BlockAdapters::contentText($header['content'], $kind);
                    unset($header['content']);
                } else {
                    unset($header['text']);
                }
            }
            return ':::mbb:v1 ' .
                $kind .
                ' ' .
                self::encode($header ?: new \stdClass()) .
                "\n\n" .
                rtrim($body) .
                "\n\n:::mbb:end";
        }
        if ($kind === 'code-tabs') {
            $tabs = [];
            $codes = [];
            foreach ($a['tabs'] as $tab) {
                $terminal = str_ends_with($tab['code'], "\n");
                $tabs[] =
                    [
                        'id' => $tab['id'],
                        'title' => $tab['title'],
                        'terminalNewline' => $terminal,
                    ] +
                    ($a['version'] === 2
                        ? ['startLine' => $tab['startLine'], 'highlights' => $tab['highlights']]
                        : []);
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
            return ':::mbb:v' .
                $a['version'] .
                ' code-tabs ' .
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
        if ($kind === 'component' && $a['version'] === 2) {
            $attrs['activity'] = $a['activity'];
        }
        if ($kind === 'bibliography' && $a['version'] === 2) {
            $attrs['style'] = $a['style'];
            if (array_key_exists('origins', $a)) {
                $attrs['origins'] = $a['origins'];
            }
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
        return ':::mbb:v' .
            (in_array($kind, ['bibliography', 'component'], true) ? $a['version'] : 1) .
            ' ' .
            $kind .
            ' ' .
            self::encode($attrs) .
            "\n\n" .
            $codes .
            rtrim($body) .
            "\n\n:::mbb:end";
    }
}
