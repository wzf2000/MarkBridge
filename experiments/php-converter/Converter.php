<?php

declare(strict_types=1);

namespace MarkBridge\Probe;

use DOMDocument;
use DOMElement;
use DOMNode;
use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\CommonMark\Node\Block\BlockQuote;
use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Extension\CommonMark\Node\Block\Heading;
use League\CommonMark\Extension\CommonMark\Node\Block\IndentedCode;
use League\CommonMark\Extension\CommonMark\Node\Block\ListBlock;
use League\CommonMark\Extension\CommonMark\Node\Block\ListItem;
use League\CommonMark\Extension\CommonMark\Node\Block\ThematicBreak;
use League\CommonMark\Extension\CommonMark\Node\Inline\Code;
use League\CommonMark\Extension\CommonMark\Node\Inline\Emphasis;
use League\CommonMark\Extension\CommonMark\Node\Inline\Link;
use League\CommonMark\Extension\CommonMark\Node\Inline\Strong;
use League\CommonMark\Extension\Table\TableExtension;
use League\CommonMark\Node\Block\Paragraph;
use League\CommonMark\Node\Inline\Newline;
use League\CommonMark\Node\Inline\Text;
use League\CommonMark\Node\Node;
use League\CommonMark\Parser\MarkdownParser;

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/MathExtension.php';

final class ConversionError extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}

/** Restricted, standalone experiment. It never loads WordPress or spawns a worker. */
final class Converter
{
    public const MAX_BYTES = 262144;
    public const MAX_NODES = 10000;
    public const MAX_DEPTH = 32;
    private int $nodes = 0;

    public function fromMarkdown(string $source): array
    {
        $this->input($source);
        $blocks = $this->markdownBlocks($source);
        $serialized = $this->serializeAll($blocks);
        // Exercise the actual reverse path on every successful import.
        $parsed = $this->parseBlocks($serialized);
        $this->nodes = 0;
        $normalized = $this->decodeAll($parsed);
        if ($this->serializeAll($this->markdownBlocks($normalized)) !== $serialized) {
            throw new ConversionError(
                'ROUNDTRIP',
                'This Markdown cannot be represented without a block roundtrip change',
            );
        }
        return [
            'ok' => true,
            'source' => $source,
            'normalized_source' => $normalized,
            'serialized' => $serialized,
        ];
    }

    public function fromBlocks(string $serialized): array
    {
        $this->input($serialized);
        $blocks = $this->parseBlocks($serialized);
        $this->nodes = 0;
        $source = $this->decodeAll($blocks);
        $regenerated = $this->serializeAll($this->markdownBlocks($source));
        // Canonical DOM comparison preserves every attribute, text node and block
        // comment. Only attribute order and HTML entity spellings normalize.
        if ($this->canonical($serialized) !== $this->canonical($regenerated)) {
            throw new ConversionError(
                'ROUNDTRIP',
                'Block HTML, attributes or nesting would change during Markdown roundtrip',
            );
        }
        return ['ok' => true, 'source' => $source, 'serialized' => $regenerated];
    }

    private function input(string $value): void
    {
        if (strlen($value) > self::MAX_BYTES) {
            throw new ConversionError('INPUT_LIMIT', 'Input exceeds 256 KiB');
        }
        if (!mb_check_encoding($value, 'UTF-8') || str_contains($value, "\0")) {
            throw new ConversionError('INPUT_ENCODING', 'Input must be UTF-8 without NUL bytes');
        }
    }

    private function tick(int $depth): void
    {
        if ($depth > self::MAX_DEPTH || ++$this->nodes > self::MAX_NODES) {
            throw new ConversionError('STRUCTURE_LIMIT', 'Input exceeds the node or nesting limit');
        }
    }

    private function markdownBlocks(string $source): array
    {
        $environment = new Environment(['max_nesting_level' => self::MAX_DEPTH + 1]);
        $environment->addExtension(new CommonMarkCoreExtension());
        $environment->addExtension(new TableExtension());
        $environment->addBlockStartParser(new MathStartParser(), 100);
        $environment->addBlockStartParser(new FootnoteRejectParser(), 101);
        $environment->addInlineParser(new MathInlineParser(), 200);
        $environment->addInlineParser(new TaskMarkerParser(), 35);
        $document = (new MarkdownParser($environment))->parse($source);
        $this->nodes = 0;
        $blocks = [];
        foreach ($document->children() as $node) {
            $blocks[] = $this->astBlock($node, 0);
        }
        return $blocks;
    }

    private function block(
        string $name,
        array $attrs = [],
        array $children = [],
        string $content = '',
    ): array {
        return ['name' => $name, 'attrs' => $attrs, 'children' => $children, 'content' => $content];
    }

    private function astBlock(Node $node, int $depth): array
    {
        $this->tick($depth);
        if ($node instanceof Paragraph) {
            return $this->block('core/paragraph', [], [], $this->astInline($node, $depth + 1));
        }
        if ($node instanceof Heading) {
            return $this->block(
                'core/heading',
                $node->getLevel() === 2 ? [] : ['level' => $node->getLevel()],
                [],
                $this->astInline($node, $depth + 1),
            );
        }
        if ($node instanceof FencedCode || $node instanceof IndentedCode) {
            $language = $node instanceof FencedCode ? trim($node->getInfo()) : '';
            if (!preg_match('/^[\w+-]*$/D', $language)) {
                throw new ConversionError(
                    'CODE_INFO',
                    'Only a simple code language identifier is supported',
                );
            }
            $attrs = ['code' => $node->getLiteral()];
            if ($language !== '') {
                $attrs['language'] = $language;
            }
            return $this->block('mbb/code', $attrs);
        }
        if ($node instanceof DisplayMath) {
            return $this->block('mbb/math', $node->tex === '' ? [] : ['tex' => $node->tex]);
        }
        if ($node instanceof ThematicBreak) {
            return $this->block('core/separator');
        }
        if ($node instanceof BlockQuote) {
            $children = [];
            foreach ($node->children() as $child) {
                $children[] = $this->astBlock($child, $depth + 1);
            }
            return $this->block('core/quote', [], $children);
        }
        if ($node instanceof ListBlock) {
            $complex = $this->complexList($node);
            $data = $node->getListData();
            $attrs = $data->type === ListBlock::TYPE_ORDERED ? ['ordered' => true] : [];
            if ($complex) {
                // Both fields are defaults in the custom registration and omit
                // from serialized comments when false/1.
                if (($data->start ?? 1) !== 1) {
                    $attrs['start'] = $data->start;
                }
            } elseif ($data->type === ListBlock::TYPE_ORDERED && ($data->start ?? 1) !== 1) {
                $attrs['start'] = $data->start;
            }
            $children = [];
            foreach ($node->children() as $item) {
                if (!($item instanceof ListItem) || !($item->firstChild() instanceof Paragraph)) {
                    throw new ConversionError(
                        'LIST_STRUCTURE',
                        'List items must start with a paragraph',
                    );
                }
                $body = iterator_to_array($item->children());
                $task = $this->task($body[0]);
                if ($complex) {
                    $childBlocks = [];
                    if ($task !== null) {
                        $taskContent = $this->astInline($body[0], $depth + 2, $task['prefix']);
                        $taskAttrs = $taskContent === '' ? [] : ['content' => $taskContent];
                        if ($task['checked']) {
                            $taskAttrs['checked'] = true;
                        }
                        foreach (array_slice($body, 1) as $child) {
                            $childBlocks[] = $this->astBlock($child, $depth + 2);
                        }
                        $children[] = $this->block('mbb/task-item', $taskAttrs, $childBlocks);
                    } else {
                        foreach ($body as $child) {
                            $childBlocks[] = $this->astBlock($child, $depth + 2);
                        }
                        $children[] = $this->block('mbb/list-item', [], $childBlocks);
                    }
                } else {
                    $content = $this->astInline($body[0], $depth + 2);
                    $nested = [];
                    foreach (array_slice($body, 1) as $child) {
                        $nested[] = $this->astBlock($child, $depth + 2);
                    }
                    $children[] = $this->block('core/list-item', [], $nested, $content);
                }
            }
            return $this->block($complex ? 'mbb/list' : 'core/list', $attrs, $children);
        }
        throw new ConversionError(
            'UNSUPPORTED_MARKDOWN',
            'Unsupported Markdown AST node: ' . $node::class,
        );
    }

    private function complexList(ListBlock $list): bool
    {
        foreach ($list->children() as $item) {
            $body = iterator_to_array($item->children());
            if (
                !isset($body[0]) ||
                !($body[0] instanceof Paragraph) ||
                $this->task($body[0]) !== null
            ) {
                return true;
            }
            foreach (array_slice($body, 1) as $child) {
                if (!($child instanceof ListBlock) || $this->complexList($child)) {
                    return true;
                }
            }
        }
        return false;
    }

    private function task(Paragraph $paragraph): ?array
    {
        return $paragraph->data->get('probe_task', null);
    }

    private function astInline(Node $parent, int $depth, int $skip = 0): string
    {
        $html = '';
        foreach ($parent->children() as $node) {
            $this->tick($depth);
            if ($node instanceof Text) {
                $text = substr($node->getLiteral(), $skip);
                $skip = 0;
                if (preg_match('/\[\^[^\]\n]+\]/', $text)) {
                    throw new ConversionError(
                        'UNSUPPORTED_FOOTNOTE',
                        'Named footnotes are not implemented in this prototype',
                    );
                }
                $html .= self::esc($text);
            } elseif ($node instanceof Newline) {
                // Match the current WordPress RichText serialization: a soft
                // LF becomes one <br>; markdown-it's hardbreak <br> plus LF
                // becomes two <br> elements.
                $html .= $node->getType() === Newline::HARDBREAK ? '<br><br>' : '<br>';
            } elseif ($node instanceof InlineMath) {
                $tex = $node->getLiteral();
                $html .=
                    '<span data-mbb-tex="' .
                    self::attribute($tex) .
                    '" class="mbb-math">' .
                    self::esc('$' . $tex . '$') .
                    '</span>';
            } elseif ($node instanceof Code) {
                $html .= '<code>' . self::esc($node->getLiteral()) . '</code>';
            } elseif ($node instanceof Strong || $node instanceof Emphasis) {
                $tag = $node instanceof Strong ? 'strong' : 'em';
                $html .= '<' . $tag . '>' . $this->astInline($node, $depth + 1) . '</' . $tag . '>';
            } elseif ($node instanceof Link) {
                self::safeUrl($node->getUrl());
                $html .=
                    '<a href="' .
                    self::attribute($node->getUrl()) .
                    '"' .
                    ($node->getTitle() === null
                        ? ''
                        : ' title="' . self::attribute($node->getTitle()) . '"') .
                    '>' .
                    $this->astInline($node, $depth + 1) .
                    '</a>';
            } else {
                throw new ConversionError(
                    'UNSUPPORTED_INLINE',
                    'Unsupported inline AST node: ' . $node::class,
                );
            }
        }
        return $html;
    }

    private static function esc(string $text): string
    {
        return htmlspecialchars($text, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8', true);
    }

    private static function attribute(string $text): string
    {
        return str_replace('"', '&quot;', self::esc($text));
    }

    private static function safeUrl(string $url): void
    {
        $compact = preg_replace('/[\x00-\x20\x7f]/', '', $url);
        if (
            preg_match('/^[a-z][a-z\d+.-]*:/i', $compact) &&
            !preg_match('/^(?:https?|mailto):/i', $compact)
        ) {
            throw new ConversionError(
                'UNSAFE_URL',
                'Only HTTP, HTTPS, mailto and relative links are supported',
            );
        }
    }

    private function serializeAll(array $blocks): string
    {
        return implode(
            "\n\n",
            array_map(fn(array $block): string => $this->serialize($block), $blocks),
        );
    }

    private function serialize(array $block): string
    {
        $name = $block['name'];
        $attrs = $block['attrs'];
        $children = $this->serializeAll($block['children']);
        $content = $block['content'];
        switch ($name) {
            case 'core/paragraph':
                $html = '<p>' . $content . '</p>';
                break;
            case 'core/heading':
                $tag = 'h' . ($attrs['level'] ?? 2);
                $html = '<' . $tag . ' class="wp-block-heading">' . $content . '</' . $tag . '>';
                break;
            case 'core/quote':
                $html = '<blockquote class="wp-block-quote">' . $children . '</blockquote>';
                break;
            case 'core/separator':
                $html = '<hr class="wp-block-separator has-alpha-channel-opacity"/>';
                break;
            case 'core/list':
            case 'mbb/list':
                $tag = $attrs['ordered'] ?? false ? 'ol' : 'ul';
                $class = $name === 'core/list' ? 'wp-block-list' : 'wp-block-mbb-list';
                $start =
                    $tag === 'ol' && ($name === 'mbb/list' || ($attrs['start'] ?? 1) !== 1)
                        ? ' start="' . ($attrs['start'] ?? 1) . '"'
                        : '';
                $html =
                    '<' .
                    $tag .
                    $start .
                    ' class="' .
                    $class .
                    '">' .
                    $children .
                    '</' .
                    $tag .
                    '>';
                break;
            case 'core/list-item':
                $html = '<li>' . $content . $children . '</li>';
                break;
            case 'mbb/list-item':
                $html = '<li class="wp-block-mbb-list-item">' . $children . '</li>';
                break;
            case 'mbb/task-item':
                $html =
                    '<li class="wp-block-mbb-task-item"><p>[' .
                    ($attrs['checked'] ?? false ? 'x' : ' ') .
                    '] <span>' .
                    ($attrs['content'] ?? '') .
                    '</span></p>' .
                    $children .
                    '</li>';
                break;
            case 'mbb/code':
                $language = $attrs['language'] ?? '';
                $html =
                    '<pre class="wp-block-mbb-code"><code' .
                    ($language === ''
                        ? ''
                        : ' class="language-' . self::attribute($language) . '"') .
                    '>' .
                    self::esc($attrs['code'] ?? '') .
                    '</code></pre>';
                break;
            case 'mbb/math':
                $html =
                    '<pre class="wp-block-mbb-math"><code class="mbb-tex">' .
                    self::esc($attrs['tex'] ?? '') .
                    '</code></pre>';
                break;
            default:
                throw new ConversionError('UNSUPPORTED_BLOCK', 'Unsupported block: ' . $name);
        }
        $short = str_starts_with($name, 'core/') ? substr($name, 5) : $name;
        $json = $attrs === [] ? '' : ' ' . self::commentJson($attrs);
        return '<!-- wp:' . $short . $json . " -->\n" . $html . "\n<!-- /wp:" . $short . ' -->';
    }

    private static function commentJson(array $attrs): string
    {
        $json = json_encode(
            $attrs,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );
        return str_replace(
            ['--', '<', '>', '&', '\\"', '\\\\'],
            ['\\u002d\\u002d', '\\u003c', '\\u003e', '\\u0026', '\\u0022', '\\u005c'],
            $json,
        );
    }

    /** A bounded block-comment grammar, not a Markdown or HTML regex parser. */
    private function parseBlocks(string $input): array
    {
        $this->nodes = 0;
        $position = 0;
        $blocks = $this->blockSequence($input, $position, null, 0);
        if ($position !== strlen($input)) {
            throw new ConversionError('BLOCK_SYNTAX', 'Unexpected data after the block sequence');
        }
        return $blocks;
    }

    private function blockSequence(
        string $input,
        int &$position,
        ?string $closing,
        int $depth,
    ): array {
        $blocks = [];
        while ($position < strlen($input)) {
            $space = strspn($input, " \t\r\n", $position);
            $position += $space;
            if ($position === strlen($input)) {
                break;
            }
            if (
                $closing !== null &&
                preg_match(
                    '/\G<!-- \/wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?) -->/A',
                    $input,
                    $match,
                    0,
                    $position,
                )
            ) {
                if ($match[1] !== $closing) {
                    throw new ConversionError('BLOCK_SYNTAX', 'Mismatched closing block comment');
                }
                $position += strlen($match[0]);
                return $blocks;
            }
            $blocks[] = $this->parseOne($input, $position, $depth);
        }
        if ($closing !== null) {
            throw new ConversionError('BLOCK_SYNTAX', 'Missing closing block comment');
        }
        return $blocks;
    }

    private function parseOne(string $input, int &$position, int $depth): array
    {
        $this->tick($depth);
        if (
            !preg_match(
                '/\G<!-- wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)(?: (\{.*?\}))? -->/As',
                $input,
                $match,
                0,
                $position,
            )
        ) {
            throw new ConversionError(
                'BLOCK_SYNTAX',
                'Only paired, explicitly supported WordPress blocks are accepted',
            );
        }
        $short = $match[1];
        $name = str_contains($short, '/') ? $short : 'core/' . $short;
        $attrs = isset($match[2]) ? json_decode($match[2], true, 32, JSON_THROW_ON_ERROR) : [];
        if (!is_array($attrs) || (array_is_list($attrs) && $attrs !== [])) {
            throw new ConversionError('BLOCK_ATTRIBUTES', 'Block attributes must be an object');
        }
        $this->validateAttrs($name, $attrs);
        $position += strlen($match[0]);
        $raw = '';
        $children = [];
        while ($position < strlen($input)) {
            $next = strpos($input, '<!--', $position);
            if ($next === false) {
                throw new ConversionError('BLOCK_SYNTAX', 'Missing block closing comment');
            }
            $raw .= substr($input, $position, $next - $position);
            $position = $next;
            if (str_starts_with(substr($input, $position), '<!-- /wp:')) {
                if (
                    !preg_match(
                        '/\G<!-- \/wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?) -->/A',
                        $input,
                        $close,
                        0,
                        $position,
                    ) ||
                    $close[1] !== $short
                ) {
                    throw new ConversionError('BLOCK_SYNTAX', 'Mismatched block closing comment');
                }
                $position += strlen($close[0]);
                return [
                    'name' => $name,
                    'attrs' => $attrs,
                    'children' => $children,
                    'raw' => trim($raw),
                ];
            }
            $index = count($children);
            $children[] = $this->parseOne($input, $position, $depth + 1);
            $raw .= '<mbb-child data-index="' . $index . '"></mbb-child>';
        }
        throw new ConversionError('BLOCK_SYNTAX', 'Missing closing block comment');
    }

    private function validateAttrs(string $name, array $attrs): void
    {
        $schemas = [
            'core/paragraph' => [],
            'core/heading' => ['level' => 'integer'],
            'core/quote' => [],
            'core/separator' => [],
            'core/list' => ['ordered' => 'boolean', 'start' => 'integer'],
            'core/list-item' => [],
            'mbb/list' => ['ordered' => 'boolean', 'start' => 'integer'],
            'mbb/list-item' => [],
            'mbb/task-item' => ['content' => 'string', 'checked' => 'boolean'],
            'mbb/code' => ['code' => 'string', 'language' => 'string'],
            'mbb/math' => ['tex' => 'string'],
        ];
        if (!array_key_exists($name, $schemas)) {
            throw new ConversionError('UNSUPPORTED_BLOCK', 'Unsupported block: ' . $name);
        }
        foreach ($attrs as $key => $value) {
            if (!isset($schemas[$name][$key]) || gettype($value) !== $schemas[$name][$key]) {
                throw new ConversionError(
                    'BLOCK_ATTRIBUTES',
                    'Unknown or invalid block attribute: ' . $name . '.' . $key,
                );
            }
        }
        if (
            (isset($attrs['level']) && ($attrs['level'] < 1 || $attrs['level'] > 6)) ||
            (isset($attrs['start']) && ($attrs['start'] < 1 || $attrs['start'] > 999999999))
        ) {
            throw new ConversionError(
                'BLOCK_ATTRIBUTES',
                'Heading level or list start is out of range',
            );
        }
    }

    private function dom(string $html): DOMElement
    {
        if (preg_match('/<!|<\/?(?:html|head|body)\b/i', $html)) {
            throw new ConversionError(
                'UNSAFE_HTML',
                'Document containers and declarations are unsupported',
            );
        }
        $doc = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        libxml_clear_errors();
        try {
            $doc->loadHTML(
                '<?xml encoding="UTF-8"><html><body>' . $html . '</body></html>',
                LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING,
            );
            foreach (libxml_get_errors() as $error) {
                // libxml's HTML4 parser reports the internal child-slot tag as
                // unknown. All other repairs/errors must fail closed, notably
                // duplicate attributes that DOM would silently discard.
                if ($error->code !== 801 || trim($error->message) !== 'Tag mbb-child invalid') {
                    throw new ConversionError(
                        'HTML_PARSE',
                        'HTML requires parser repair or contains duplicate attributes',
                    );
                }
            }
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        $head = $doc->getElementsByTagName('head')->item(0);
        if ($head !== null && $head->hasChildNodes()) {
            throw new ConversionError('UNSAFE_HTML', 'Unexpected relocated HTML head content');
        }
        return $doc->getElementsByTagName('body')->item(0);
    }

    private function attrs(DOMElement $element, array $expected): void
    {
        $actual = [];
        foreach ($element->attributes as $attribute) {
            $actual[$attribute->name] = $attribute->value;
        }
        ksort($actual);
        ksort($expected);
        if ($actual !== $expected) {
            throw new ConversionError(
                'HTML_ATTRIBUTES',
                'Unsupported or inconsistent HTML attributes on ' . $element->tagName,
            );
        }
    }

    private function outer(string $html, string $tag, array $attrs): DOMElement
    {
        $body = $this->dom($html);
        if (
            $body->childNodes->length !== 1 ||
            !($body->firstChild instanceof DOMElement) ||
            $body->firstChild->tagName !== $tag
        ) {
            throw new ConversionError('HTML_STRUCTURE', 'Expected one ' . $tag . ' wrapper');
        }
        $this->attrs($body->firstChild, $attrs);
        return $body->firstChild;
    }

    private function decodeAll(array $blocks, int $depth = 0): string
    {
        return implode(
            "\n\n",
            array_map(fn(array $block): string => $this->decode($block, $depth), $blocks),
        ) . ($blocks === [] ? '' : "\n");
    }

    private function childElements(DOMElement $element, array $children, int $depth): string
    {
        $this->validateSlots($element, $children);
        return rtrim($this->decodeAll($children, $depth + 1), "\n");
    }

    private function validateSlots(DOMElement $element, array $children): void
    {
        $index = 0;
        foreach ($element->childNodes as $node) {
            if ($node->nodeType === XML_TEXT_NODE && trim($node->textContent) === '') {
                continue;
            }
            if (
                !($node instanceof DOMElement) ||
                $node->tagName !== 'mbb-child' ||
                $node->hasChildNodes()
            ) {
                throw new ConversionError(
                    'HTML_STRUCTURE',
                    'Container must contain only its declared child blocks',
                );
            }
            $this->attrs($node, ['data-index' => (string) $index]);
            $index++;
        }
        if ($index !== count($children)) {
            throw new ConversionError('HTML_STRUCTURE', 'Block children and HTML slots disagree');
        }
    }

    private function decode(array $block, int $depth): string
    {
        $this->tick($depth);
        $name = $block['name'];
        $attrs = $block['attrs'];
        $children = $block['children'];
        $raw = $block['raw'];
        switch ($name) {
            case 'core/paragraph':
            case 'core/heading':
                if ($children !== []) {
                    throw new ConversionError(
                        'HTML_STRUCTURE',
                        'Text blocks cannot contain child blocks',
                    );
                }
                $tag = $name === 'core/paragraph' ? 'p' : 'h' . ($attrs['level'] ?? 2);
                $root = $this->outer(
                    $raw,
                    $tag,
                    $name === 'core/paragraph' ? [] : ['class' => 'wp-block-heading'],
                );
                return ($name === 'core/heading'
                    ? str_repeat('#', $attrs['level'] ?? 2) . ' '
                    : '') . $this->inlineMarkdown($root, $depth + 1);
            case 'core/separator':
                $root = $this->outer($raw, 'hr', [
                    'class' => 'wp-block-separator has-alpha-channel-opacity',
                ]);
                if ($children !== [] || $root->hasChildNodes()) {
                    throw new ConversionError('HTML_STRUCTURE', 'Separator must be empty');
                }
                return '---';
            case 'core/quote':
                $root = $this->outer($raw, 'blockquote', ['class' => 'wp-block-quote']);
                $body = $this->childElements($root, $children, $depth);
                return implode(
                    "\n",
                    array_map(fn(string $line): string => '> ' . $line, explode("\n", $body)),
                );
            case 'mbb/code':
            case 'mbb/math':
                if ($children !== []) {
                    throw new ConversionError(
                        'HTML_STRUCTURE',
                        'Code and math cannot contain blocks',
                    );
                }
                $root = $this->outer($raw, 'pre', [
                    'class' => $name === 'mbb/code' ? 'wp-block-mbb-code' : 'wp-block-mbb-math',
                ]);
                if (
                    $root->childNodes->length !== 1 ||
                    !($root->firstChild instanceof DOMElement) ||
                    $root->firstChild->tagName !== 'code'
                ) {
                    throw new ConversionError('HTML_STRUCTURE', 'Expected a single code element');
                }
                $code = $root->firstChild;
                $language = $attrs['language'] ?? '';
                $this->attrs(
                    $code,
                    $name === 'mbb/math'
                        ? ['class' => 'mbb-tex']
                        : ($language === ''
                            ? []
                            : ['class' => 'language-' . $language]),
                );
                foreach ($code->childNodes as $text) {
                    if ($text->nodeType !== XML_TEXT_NODE) {
                        throw new ConversionError(
                            'HTML_STRUCTURE',
                            'Code and math must contain only literal text',
                        );
                    }
                }
                $literal = $code->textContent;
                if ($literal !== ($attrs[$name === 'mbb/code' ? 'code' : 'tex'] ?? '')) {
                    throw new ConversionError(
                        'CONTENT_MISMATCH',
                        'Code or math HTML disagrees with block attributes',
                    );
                }
                if ($name === 'mbb/math') {
                    if (preg_match('/(^|\n)\s*\$\$\s*(\n|$)/', $literal)) {
                        throw new ConversionError(
                            'MATH_DELIMITER',
                            'Math contains a standalone $$ delimiter',
                        );
                    }
                    return "$$\n" . $literal . "\n$$";
                }
                if (!preg_match('/^[\w+-]*$/D', $language) || !str_ends_with($literal, "\n")) {
                    throw new ConversionError(
                        'CODE_STRUCTURE',
                        'Code requires a simple language and a trailing newline',
                    );
                }
                preg_match_all('/`+/', $literal, $ticks);
                $fence = str_repeat(
                    '`',
                    max([3, ...array_map(fn(string $value): int => strlen($value) + 1, $ticks[0])]),
                );
                return $fence . $language . "\n" . $literal . $fence;
            case 'core/list':
            case 'mbb/list':
                $ordered = $attrs['ordered'] ?? false;
                $tag = $ordered ? 'ol' : 'ul';
                $htmlAttrs = [
                    'class' => $name === 'core/list' ? 'wp-block-list' : 'wp-block-mbb-list',
                ];
                if ($ordered && ($name === 'mbb/list' || ($attrs['start'] ?? 1) !== 1)) {
                    $htmlAttrs['start'] = (string) ($attrs['start'] ?? 1);
                }
                $root = $this->outer($raw, $tag, $htmlAttrs);
                $this->validateSlots($root, $children);
                $items = [];
                foreach ($children as $index => $child) {
                    if (
                        !in_array(
                            $child['name'],
                            $name === 'core/list'
                                ? ['core/list-item']
                                : ['mbb/list-item', 'mbb/task-item'],
                            true,
                        )
                    ) {
                        throw new ConversionError('LIST_STRUCTURE', 'Unexpected list item block');
                    }
                    $marker = $ordered ? (string) (($attrs['start'] ?? 1) + $index) . '. ' : '- ';
                    $body = $this->decode($child, $depth + 1);
                    $lines = explode("\n", $body);
                    $items[] =
                        $marker .
                        array_shift($lines) .
                        ($lines === []
                            ? ''
                            : "\n" .
                                implode(
                                    "\n",
                                    array_map(
                                        fn(string $line): string => str_repeat(
                                            ' ',
                                            strlen($marker),
                                        ) . $line,
                                        $lines,
                                    ),
                                ));
                }
                return implode($name === 'mbb/list' ? "\n\n" : "\n", $items);
            case 'core/list-item':
                $root = $this->outer($raw, 'li', []);
                $text = '';
                $slots = false;
                $index = 0;
                foreach (iterator_to_array($root->childNodes) as $node) {
                    if ($node instanceof DOMElement && $node->tagName === 'mbb-child') {
                        $slots = true;
                        $this->attrs($node, ['data-index' => (string) $index++]);
                        if ($node->hasChildNodes()) {
                            throw new ConversionError('HTML_STRUCTURE', 'Child slot must be empty');
                        }
                    } elseif ($slots) {
                        if ($node->nodeType !== XML_TEXT_NODE || trim($node->textContent) !== '') {
                            throw new ConversionError(
                                'LIST_STRUCTURE',
                                'Inline text cannot follow nested list blocks',
                            );
                        }
                    } else {
                        $text .= $this->inlineNode($node, $depth + 1);
                    }
                }
                if (
                    $index !== count($children) ||
                    array_filter(
                        $children,
                        fn(array $child): bool => $child['name'] !== 'core/list',
                    ) !== []
                ) {
                    throw new ConversionError(
                        'LIST_STRUCTURE',
                        'Simple items can contain only nested simple lists',
                    );
                }
                return $text .
                    ($children === []
                        ? ''
                        : "\n" . rtrim($this->decodeAll($children, $depth + 1), "\n"));
            case 'mbb/list-item':
                $root = $this->outer($raw, 'li', ['class' => 'wp-block-mbb-list-item']);
                return $this->childElements($root, $children, $depth);
            case 'mbb/task-item':
                $root = $this->outer($raw, 'li', ['class' => 'wp-block-mbb-task-item']);
                $paragraph = $root->firstChild;
                if (
                    !($paragraph instanceof DOMElement) ||
                    $paragraph->tagName !== 'p' ||
                    $paragraph->childNodes->length !== 2
                ) {
                    throw new ConversionError(
                        'TASK_STRUCTURE',
                        'Task requires its marker and content span',
                    );
                }
                $this->attrs($paragraph, []);
                $marker = '[' . ($attrs['checked'] ?? false ? 'x' : ' ') . '] ';
                $span = $paragraph->lastChild;
                if (
                    $paragraph->firstChild->nodeType !== XML_TEXT_NODE ||
                    $paragraph->firstChild->textContent !== $marker ||
                    !($span instanceof DOMElement) ||
                    $span->tagName !== 'span'
                ) {
                    throw new ConversionError(
                        'TASK_STRUCTURE',
                        'Task marker disagrees with checked state',
                    );
                }
                $this->attrs($span, []);
                $content = $this->inlineMarkdown($span, $depth + 1);
                $html = '';
                foreach ($span->childNodes as $node) {
                    $html .= $span->ownerDocument->saveHTML($node);
                }
                if ($this->canonical($html) !== $this->canonical($attrs['content'] ?? '')) {
                    throw new ConversionError(
                        'CONTENT_MISMATCH',
                        'Task content HTML disagrees with its attribute',
                    );
                }
                $root->removeChild($paragraph);
                $nested = $this->childElements($root, $children, $depth);
                return $marker . $content . ($nested === '' ? '' : "\n\n" . $nested);
            default:
                throw new ConversionError('UNSUPPORTED_BLOCK', 'Unsupported block: ' . $name);
        }
    }

    private function inlineMarkdown(DOMElement $element, int $depth): string
    {
        $markdown = '';
        foreach ($element->childNodes as $node) {
            $markdown .= $this->inlineNode($node, $depth);
        }
        return $markdown;
    }

    private function inlineNode(DOMNode $node, int $depth): string
    {
        $this->tick($depth);
        if ($node->nodeType === XML_TEXT_NODE) {
            $text = $node->textContent;
            // Markdown renderers retain a cosmetic LF after <br>. The break
            // itself already emits the newline in Markdown.
            if (
                $node->previousSibling instanceof DOMElement &&
                $node->previousSibling->tagName === 'br' &&
                str_starts_with($text, "\n")
            ) {
                $text = substr($text, 1);
            }
            return preg_replace('/([\\\\`*{}_\[\]()#+.!>~|$-])/', '\\\\$1', $text);
        }
        if (!($node instanceof DOMElement)) {
            throw new ConversionError(
                'UNSAFE_HTML',
                'Inline comments and non-text nodes are unsupported',
            );
        }
        switch ($node->tagName) {
            case 'strong':
            case 'em':
                $this->attrs($node, []);
                $marker = $node->tagName === 'strong' ? '**' : '*';
                return $marker . $this->inlineMarkdown($node, $depth + 1) . $marker;
            case 'br':
                $this->attrs($node, []);
                if (
                    $node->previousSibling instanceof DOMElement &&
                    $node->previousSibling->tagName === 'br'
                ) {
                    return '';
                }
                if (
                    $node->nextSibling instanceof DOMElement &&
                    $node->nextSibling->tagName === 'br'
                ) {
                    $this->attrs($node->nextSibling, []);
                    if (
                        $node->nextSibling->nextSibling instanceof DOMElement &&
                        $node->nextSibling->nextSibling->tagName === 'br'
                    ) {
                        throw new ConversionError(
                            'ROUNDTRIP',
                            'More than two adjacent inline breaks cannot be represented',
                        );
                    }
                    return "  \n";
                }
                return "\n";
            case 'code':
                $this->attrs($node, []);
                foreach ($node->childNodes as $child) {
                    if ($child->nodeType !== XML_TEXT_NODE) {
                        throw new ConversionError(
                            'UNSAFE_HTML',
                            'Inline code must be literal text',
                        );
                    }
                }
                $literal = $node->textContent;
                preg_match_all('/`+/', $literal, $ticks);
                $fence = str_repeat(
                    '`',
                    max([1, ...array_map(fn(string $value): int => strlen($value) + 1, $ticks[0])]),
                );
                $pad =
                    str_starts_with($literal, '`') ||
                    str_ends_with($literal, '`') ||
                    (str_starts_with($literal, ' ') &&
                        str_ends_with($literal, ' ') &&
                        trim($literal) !== '')
                        ? ' '
                        : '';
                return $fence . $pad . $literal . $pad . $fence;
            case 'a':
                $allowed = ['href' => $node->getAttribute('href')];
                if (!$node->hasAttribute('href')) {
                    throw new ConversionError('UNSAFE_HTML', 'Links must have an href');
                }
                if ($node->hasAttribute('title')) {
                    $allowed['title'] = $node->getAttribute('title');
                }
                $this->attrs($node, $allowed);
                self::safeUrl($allowed['href']);
                $url = str_replace(
                    ['\\', '>', '<', "\n"],
                    ['%5C', '%3E', '%3C', '%0A'],
                    $allowed['href'],
                );
                $title = isset($allowed['title'])
                    ? ' "' . str_replace(['\\', '"'], ['\\\\', '\\"'], $allowed['title']) . '"'
                    : '';
                return '[' .
                    $this->inlineMarkdown($node, $depth + 1) .
                    '](<' .
                    $url .
                    '>' .
                    $title .
                    ')';
            case 'span':
                $tex = $node->getAttribute('data-mbb-tex');
                $this->attrs($node, ['class' => 'mbb-math', 'data-mbb-tex' => $tex]);
                if (
                    $node->textContent !== '$' . $tex . '$' ||
                    $node->childNodes->length !== 1 ||
                    $node->firstChild->nodeType !== XML_TEXT_NODE ||
                    $tex === '' ||
                    str_contains($tex, "\n")
                ) {
                    throw new ConversionError(
                        'MATH_MISMATCH',
                        'Inline math must contain matching literal TeX',
                    );
                }
                return '$' . $tex . '$';
            default:
                throw new ConversionError(
                    'UNSUPPORTED_HTML',
                    'Unsupported inline HTML element: ' . $node->tagName,
                );
        }
    }

    private function canonical(string $html): string
    {
        $doc = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        libxml_clear_errors();
        try {
            $doc->loadHTML(
                '<?xml encoding="UTF-8"><html><body>' . $html . '</body></html>',
                LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING,
            );
            if (libxml_get_errors() !== []) {
                throw new ConversionError(
                    'HTML_PARSE',
                    'HTML requires parser repair or contains duplicate attributes',
                );
            }
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        $nodes = 0;
        $walk = function (DOMNode $node, int $depth) use (&$walk, &$nodes): mixed {
            if ($depth > self::MAX_DEPTH || ++$nodes > self::MAX_NODES) {
                throw new ConversionError(
                    'STRUCTURE_LIMIT',
                    'HTML exceeds the node or nesting limit',
                );
            }
            if ($node->nodeType === XML_TEXT_NODE) {
                return ['text', $node->textContent];
            }
            if ($node->nodeType === XML_COMMENT_NODE) {
                return ['comment', $node->textContent];
            }
            if (!($node instanceof DOMElement)) {
                throw new ConversionError('UNSAFE_HTML', 'Unexpected DOM node');
            }
            $attrs = [];
            foreach ($node->attributes as $attr) {
                $attrs[$attr->name] = $attr->value;
            }
            ksort($attrs);
            $children = [];
            foreach ($node->childNodes as $child) {
                $children[] = $walk($child, $depth + 1);
            }
            return [$node->tagName, $attrs, $children];
        };
        $body = $doc->getElementsByTagName('body')->item(0);
        return json_encode($walk($body, 0), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }
}
