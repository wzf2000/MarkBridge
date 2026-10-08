<?php

declare(strict_types=1);

namespace MarkBridge\Probe;

use DOMDocument;
use DOMElement;
use DOMNode;
use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\CommonMark\Parser\Block\FencedCodeStartParser;
use League\CommonMark\Extension\CommonMark\Parser\Block\IndentedCodeStartParser;
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
use League\CommonMark\Extension\CommonMark\Node\Inline\Image;
use League\CommonMark\Extension\CommonMark\Node\Inline\HtmlInline;
use League\CommonMark\Extension\CommonMark\Node\Block\HtmlBlock;
use League\CommonMark\Extension\Table\Table;
use League\CommonMark\Extension\Table\TableCell;
use League\CommonMark\Extension\Table\TableSection;
use League\CommonMark\Extension\Strikethrough\Strikethrough;
use League\CommonMark\Extension\Strikethrough\StrikethroughExtension;
use League\CommonMark\Extension\Footnote\Node\Footnote;
use League\CommonMark\Extension\Table\TableExtension;
use League\CommonMark\Node\Block\Paragraph;
use League\CommonMark\Node\Inline\Newline;
use League\CommonMark\Node\Inline\Text;
use League\CommonMark\Node\Node;
use League\CommonMark\Parser\MarkdownParser;

require_once __DIR__ . '/../autoload.php';
require_once __DIR__ . '/MathExtension.php';
require_once __DIR__ . '/Footnotes.php';
require_once __DIR__ . '/DisplayBoundaries.php';
require_once __DIR__ . '/CodeWhitespace.php';

final class ConversionError extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}

/** Restricted content converter. It never loads WordPress or spawns a worker. */
final class Converter
{
    public const MAX_BYTES = 262144;
    public const MAX_NODES = 10000;
    public const MAX_DEPTH = 32;
    private int $nodes = 0;
    private bool $legacyTasks = false;
    private bool $legacyFootnotes = false;
    private bool $markdownInline = false;

    public function fromMarkdown(string $source): array
    {
        $this->input($source);
        $blocks = $this->markdownBlocks($source);
        $serialized = $this->serializeAll($blocks);
        $this->input($serialized);
        // Exercise the actual reverse path on every successful import.
        $parsed = $this->parseBlocks($serialized);
        $this->nodes = 0;
        $normalized = $this->decodeAll($parsed);
        $this->input($normalized);
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
        $this->input($source);
        $regenerated = $this->serializeAll($this->markdownBlocks($source));
        $this->input($regenerated);
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

    public function equivalentSerialized(string $left, string $right): bool
    {
        $this->input($left);
        $this->input($right);
        return $this->canonical($left) === $this->canonical($right);
    }

    public function restorePair(string $source, string $serialized, string $documentId): array
    {
        $this->input($source);
        $this->input($serialized);
        if (trim($documentId) === '') {
            throw new ConversionError('DOCUMENT_ID', 'A nonempty documentId is required');
        }
        try {
            foreach (
                [[false, false], [true, true], [false, true]]
                as [$legacyTasks, $legacyFootnotes]
            ) {
                $this->legacyTasks = $legacyTasks;
                $this->legacyFootnotes = $legacyFootnotes;
                try {
                    // Snapshot admission intentionally does not call the editing
                    // reverse path: historical pairs may be non-editable today.
                    $candidate = $this->serializeAll($this->markdownBlocks($source));
                    if ($candidate === $serialized) {
                        return [
                            'ok' => true,
                            'source' => $source,
                            'serialized' => $serialized,
                            'documentId' => $documentId,
                            'snapshot_kind' => $legacyFootnotes ? 'legacy' : 'current',
                        ];
                    }
                } catch (ConversionError $error) {
                    // Only an exact complete snapshot can use a historical variant.
                }
            }
        } finally {
            $this->legacyTasks = false;
            $this->legacyFootnotes = false;
            $this->markdownInline = false;
        }
        throw new ConversionError(
            'SNAPSHOT_MISMATCH',
            'Source and serialized snapshot do not match',
        );
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
        $this->markdownInline = false;
        $source = DisplayBoundaries::normalize($source);
        $this->input($source);
        $environment = new Environment(['max_nesting_level' => self::MAX_DEPTH + 1]);
        $environment->addExtension(new CommonMarkCoreExtension());
        $environment->addBlockStartParser(
            new CodeWhitespaceStartParser(new FencedCodeStartParser()),
            51,
        );
        $environment->addBlockStartParser(
            new CodeWhitespaceStartParser(new IndentedCodeStartParser()),
            -99,
        );
        $environment->addExtension(new TableExtension());
        $environment->addExtension(new StrikethroughExtension());
        $environment->addBlockStartParser(new MathStartParser(), 100);
        $registry = new FootnoteRegistry();
        if ($this->legacyFootnotes) {
            $environment->addBlockStartParser(new FootnoteRejectParser(), 101);
        } else {
            $environment->addBlockStartParser(new NamedFootnoteStartParser($registry), 101);
            $environment->addInlineParser(new NamedFootnoteInlineParser(), 36);
        }
        $environment->addInlineParser(new MathInlineParser(), 200);
        $environment->addInlineParser(new TaskMarkerParser(), 35);
        $document = (new MarkdownParser($environment))->parse($source);
        $this->nodes = 0;
        $references = [];
        $validate = function (
            Node $node,
            int $depth,
            bool $inFootnote = false,
            bool $inLink = false,
        ) use (&$validate, &$references, $registry): void {
            $this->tick($depth);
            // The current link probe forbids literal markers even when raw
            // HTML <code> protects them from footnote parsing. Markdown Code
            // nodes retain their separate literal-code exemption.
            if (
                !$this->legacyFootnotes &&
                $inLink &&
                $node instanceof Text &&
                preg_match('/\[\^[^\]\s]+\]/u', $node->getLiteral())
            ) {
                throw new ConversionError(
                    'FOOTNOTE_IN_LINK',
                    'Link text cannot contain footnote markers',
                );
            }
            if ($node instanceof FootnoteReference) {
                $label = $node->getLiteral();
                if ($inFootnote) {
                    throw new ConversionError(
                        'FOOTNOTE_NESTED',
                        'Footnote definitions cannot contain references',
                    );
                }
                if ($inLink) {
                    throw new ConversionError(
                        'FOOTNOTE_IN_LINK',
                        'Footnote references cannot appear in links or images',
                    );
                }
                if (!isset($registry->definitions[$label])) {
                    throw new ConversionError(
                        'FOOTNOTE_MISSING',
                        'Missing footnote definition: ' . $label,
                    );
                }
                $references[$label] = true;
            }
            foreach ($node->children() as $child) {
                $validate(
                    $child,
                    $depth + 1,
                    $inFootnote || $node instanceof Footnote,
                    $inLink || $node instanceof Link || $node instanceof Image,
                );
            }
        };
        $validate($document, 0);
        foreach ($registry->definitions as $label => $note) {
            if (!isset($references[$label])) {
                throw new ConversionError(
                    'FOOTNOTE_ORPHAN',
                    'Unreferenced footnote definition: ' . $label,
                );
            }
            if (!$note->hasChildren()) {
                throw new ConversionError(
                    'FOOTNOTE_STRUCTURE',
                    'Footnote definition cannot be empty',
                );
            }
            $note->detach();
        }
        $this->nodes = 0;
        $blocks = [];
        foreach ($document->children() as $node) {
            $blocks[] = $this->astBlock($node, 0);
        }
        if ($registry->definitions !== []) {
            $notes = [];
            foreach ($registry->definitions as $label => $note) {
                $body = [];
                foreach ($note->children() as $child) {
                    $body[] = $this->astBlock($child, 2);
                }
                $notes[] = $this->block('mbb/footnote', ['label' => (string) $label], $body);
            }
            $blocks[] = $this->block('mbb/footnotes', [], $notes);
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
            if (
                $node->firstChild() instanceof Image &&
                $node->firstChild() === $node->lastChild()
            ) {
                return $this->block('core/image', [], [], $this->imageHtml($node->firstChild()));
            }
            $content = $this->astInline($node, $depth + 1);
            if (preg_match('/^<a id="[^"]+"><\/a>$/D', $content)) {
                return $this->block('core/html', [], [], $content);
            }
            if (preg_match('/<a id="[^"]+"><\/a>/', $content)) {
                throw new ConversionError(
                    'INLINE_ANCHOR',
                    'Empty anchors must occupy their own paragraph',
                );
            }
            return $this->block('core/paragraph', [], [], $content);
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
        if ($node instanceof HtmlBlock) {
            $raw = trim($node->getLiteral());
            if (preg_match('/^<!--\s*more\s*-->$/D', $raw)) {
                return $this->block('core/more');
            }
            $this->safeHtml($raw);
            $raw = $this->htmlMath($raw);
            $raw = preg_replace_callback(
                '/style=(["\'])(.*?)\1/s',
                fn(array $match): string => 'style=' .
                    $match[1] .
                    rtrim(trim($match[2]), ';') .
                    $match[1],
                $raw,
            );
            return $this->block('core/html', [], [], $raw);
        }
        if ($node instanceof Table) {
            $previousTable = $this->markdownInline;
            $this->markdownInline = true;
            $html = '<table class="has-fixed-layout">';
            foreach ($node->children() as $section) {
                $this->tick($depth + 1);
                $tag = $section->getType() === TableSection::TYPE_HEAD ? 'thead' : 'tbody';
                $html .= '<' . $tag . '>';
                foreach ($section->children() as $row) {
                    $this->tick($depth + 2);
                    $html .= '<tr>';
                    foreach ($row->children() as $cell) {
                        $this->tick($depth + 3);
                        $cellTag = $cell->getType() === TableCell::TYPE_HEADER ? 'th' : 'td';
                        $align = $cell->getAlign();
                        $html .=
                            '<' .
                            $cellTag .
                            ($align === null
                                ? ''
                                : ' class="has-text-align-' .
                                    $align .
                                    '" data-align="' .
                                    $align .
                                    '"') .
                            '>' .
                            $this->astInline($cell, $depth + 4) .
                            '</' .
                            $cellTag .
                            '>';
                    }
                    $html .= '</tr>';
                }
                $html .= '</' . $tag . '>';
            }
            $this->markdownInline = $previousTable;
            return $this->block('core/table', [], [], $html . '</table>');
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
                if (($data->start ?? 1) > 1) {
                    $attrs['start'] = $data->start;
                }
            } elseif ($data->type === ListBlock::TYPE_ORDERED && ($data->start ?? 1) > 1) {
                $attrs['start'] = $data->start;
            }
            $children = [];
            foreach ($node->children() as $item) {
                if (!($item instanceof ListItem)) {
                    throw new ConversionError(
                        'LIST_STRUCTURE',
                        'List items must start with a paragraph',
                    );
                }
                $body = iterator_to_array($item->children());
                $task =
                    isset($body[0]) && $body[0] instanceof Paragraph ? $this->task($body[0]) : null;
                if (
                    $this->legacyTasks &&
                    !$complex &&
                    isset($body[0]) &&
                    $body[0] instanceof Paragraph &&
                    $body[0]->data->get('probe_task', null) !== null
                ) {
                    throw new ConversionError(
                        'TASK_LIST',
                        'Simple task lists were unsupported by the historical parser',
                    );
                }
                if ($complex) {
                    $childBlocks = [];
                    if ($task !== null) {
                        $previousInline = $this->markdownInline;
                        $this->markdownInline = true;
                        try {
                            $taskContent = $this->astInline($body[0], $depth + 2, $task['prefix']);
                        } finally {
                            $this->markdownInline = $previousInline;
                        }
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
        return $this->legacyTasks ? null : $paragraph->data->get('probe_task', null);
    }

    private function astInline(Node $parent, int $depth, int $skip = 0): string
    {
        $html = '';
        foreach ($parent->children() as $node) {
            $this->tick($depth);
            if ($node instanceof Text) {
                $text = substr($node->getLiteral(), $skip);
                $skip = 0;
                $html .= $this->inlineText($text);
            } elseif ($node instanceof FootnoteReference) {
                $label = $node->getLiteral();
                $html .=
                    ($this->markdownInline
                        ? '<span class="mbb-footnote-ref" data-mbb-footnote="' .
                            self::attribute($label) .
                            '"'
                        : '<span data-mbb-footnote="' .
                            self::attribute($label) .
                            '" class="mbb-footnote-ref"') .
                    '>[^' .
                    self::esc($label) .
                    ']</span>';
            } elseif ($node instanceof HtmlInline) {
                $literal = $node->getLiteral();
                if (
                    preg_match(
                        '/^<(?:class\s+[^<>]+|sstream|stdexcept|vector|functional|optional|iostream|memory|simplecounter|int|float|t|string|typename)>$/iD',
                        $literal,
                    )
                ) {
                    $html .= $this->inlineText($literal);
                } else {
                    $html .= $literal;
                }
            } elseif ($node instanceof Newline) {
                // Match the current WordPress RichText serialization: a soft
                // LF becomes one <br>; markdown-it's hardbreak <br> plus LF
                // becomes two <br> elements.
                $html .= $node->getType() === Newline::HARDBREAK ? '<br><br>' : '<br>';
            } elseif ($node instanceof InlineMath) {
                $tex = $node->getLiteral();
                $html .=
                    ($this->markdownInline
                        ? '<span class="mbb-math" data-mbb-tex="' . self::attribute($tex) . '"'
                        : '<span data-mbb-tex="' . self::attribute($tex) . '" class="mbb-math"') .
                    '>' .
                    ($this->markdownInline
                        ? self::attribute('$' . $tex . '$')
                        : str_replace('>', '&gt;', self::esc('$' . $tex . '$'))) .
                    '</span>';
            } elseif ($node instanceof Code) {
                $html .= '<code>' . $this->inlineText($node->getLiteral()) . '</code>';
            } elseif ($node instanceof Image) {
                $html .= $this->imageHtml($node);
            } elseif (
                $node instanceof Strong ||
                $node instanceof Emphasis ||
                $node instanceof Strikethrough
            ) {
                if ($node instanceof Strikethrough && $node->getOpeningDelimiter() === '~') {
                    $html .= '~' . $this->astInline($node, $depth + 1) . '~';
                    continue;
                }
                $tag =
                    $node instanceof Strong ? 'strong' : ($node instanceof Emphasis ? 'em' : 's');
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
        if (
            $parent instanceof Paragraph ||
            $parent instanceof Heading ||
            $parent instanceof TableCell
        ) {
            $this->safeHtml($html);
        }
        return $html;
    }

    private function imageHtml(Image $image): string
    {
        self::safeUrl($image->getUrl());
        $text = function (Node $node) use (&$text): string {
            if ($node instanceof InlineMath) {
                throw new ConversionError(
                    'UNSUPPORTED_IMAGE_ALT',
                    'Math in image alternative text would be discarded by the current engine',
                );
            }
            if ($node instanceof Text || $node instanceof Code) {
                return $node->getLiteral();
            }
            if ($node instanceof Newline) {
                return "\n";
            }
            $out = '';
            foreach ($node->children() as $child) {
                $out .= $text($child);
            }
            return $out;
        };
        $alt = $text($image);
        if (html_entity_decode($alt, ENT_QUOTES | ENT_HTML5, 'UTF-8') !== $alt) {
            throw new ConversionError(
                'UNSUPPORTED_IMAGE_ALT',
                'Entity-looking image alternative text would change under the current engine serialization',
            );
        }
        if (!$this->legacyFootnotes && preg_match('/\[\^[^\]\s]+\]/u', $alt)) {
            throw new ConversionError(
                'FOOTNOTE_IN_LINK',
                'Image alternative text cannot contain footnote markers',
            );
        }
        return '<img src="' .
            self::attribute($image->getUrl()) .
            '" alt="' .
            self::attribute($alt) .
            '"' .
            ($image->getTitle() === null
                ? ''
                : ' title="' . self::attribute($image->getTitle()) . '"') .
            ($image->parent() instanceof Paragraph &&
            $image->parent()->firstChild() === $image->parent()->lastChild()
                ? '/>'
                : '>');
    }

    // RichText content is DOM-normalized by WordPress, while table/task HTML
    // keeps markdown-it's renderer spelling. Preserve that distinction exactly.
    private function inlineText(string $text): string
    {
        return $this->markdownInline ? self::attribute($text) : self::esc($text);
    }

    private static function esc(string $text): string
    {
        return str_replace(['&', '<'], ['&amp;', '&lt;'], $text);
    }

    // wp.element uses escapeHTML, which preserves entity-shaped sequences.
    // This is distinct from Markdown/RichText escaping and remains local to
    // the literal text children of the registered code and display-math blocks.
    private static function elementText(string $text): string
    {
        return str_replace(
            '<',
            '&lt;',
            preg_replace('/&(?!([a-z0-9]+|#[0-9]+|#x[a-f0-9]+);)/i', '&amp;', $text),
        );
    }

    private static function attribute(string $text): string
    {
        return str_replace(['>', '"'], ['&gt;', '&quot;'], self::esc($text));
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
            case 'core/image':
                $html = '<figure class="wp-block-image">' . $content . '</figure>';
                break;
            case 'core/table':
                $html = '<figure class="wp-block-table">' . $content . '</figure>';
                break;
            case 'core/html':
                $html = $content;
                break;
            case 'core/more':
                $html = '<!--more-->';
                break;
            case 'mbb/footnotes':
                $html =
                    '<section class="wp-block-mbb-footnotes mbb-footnotes"><ol>' .
                    $children .
                    '</ol></section>';
                break;
            case 'mbb/footnote':
                $html =
                    '<li data-mbb-footnote="' .
                    self::attribute($attrs['label']) .
                    '" class="wp-block-mbb-footnote">' .
                    $children .
                    '</li>';
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
                    self::elementText($attrs['code'] ?? '') .
                    '</code></pre>';
                break;
            case 'mbb/math':
                $html =
                    '<pre class="wp-block-mbb-math"><code class="mbb-tex">' .
                    self::elementText($attrs['tex'] ?? '') .
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
            JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES |
                JSON_UNESCAPED_LINE_TERMINATORS |
                JSON_THROW_ON_ERROR,
        );
        // Match WordPress serializeAttributes: first protect literal backslashes.
        // Otherwise the final slash of an escaped backslash consumes the JSON
        // string's closing quote when the escaped-quote replacement runs first.
        return str_replace(
            ['\\\\', '--', '<', '>', '&', '\\"'],
            ['\\u005c', '\\u002d\\u002d', '\\u003c', '\\u003e', '\\u0026', '\\u0022'],
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
            if (
                $name === 'core/more' &&
                str_starts_with(substr($input, $position), '<!--more-->')
            ) {
                $raw .= '<!--more-->';
                $position += strlen('<!--more-->');
                continue;
            }
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
            'core/image' => [],
            'core/table' => [],
            'core/html' => [],
            'core/more' => [],
            'mbb/footnotes' => [],
            'mbb/footnote' => ['label' => 'string'],
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
                if (
                    $error->code !== 801 ||
                    !in_array(
                        trim($error->message),
                        ['Tag mbb-child invalid', 'Tag figure invalid', 'Tag section invalid'],
                        true,
                    )
                ) {
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

    private function htmlMath(string $html): string
    {
        // HTML has already passed the DOM policy. Tokenize only its tag/text
        // boundaries to preserve the original authorized markup spelling.
        $tokens = preg_split(
            '/(<(?:[^>"\']|"[^"]*"|\'[^\']*\')*>)/',
            $html,
            -1,
            PREG_SPLIT_DELIM_CAPTURE,
        );
        $codeDepth = 0;
        $protectedMath = 0;
        $out = '';
        foreach ($tokens as $token) {
            if (str_starts_with($token, '<')) {
                if (preg_match('/^<(?:pre|code)(?:\s|>)/i', $token)) {
                    $codeDepth++;
                } elseif (preg_match('/^<\/(?:pre|code)\s*>/i', $token)) {
                    $codeDepth = max(0, $codeDepth - 1);
                }
                if (preg_match('/^<span\b[^>]*\bdata-mbb-tex\b/i', $token)) {
                    $protectedMath++;
                } elseif ($protectedMath > 0 && preg_match('/^<\/span\s*>/i', $token)) {
                    $protectedMath--;
                }
                $out .= $token;
                continue;
            }
            if ($codeDepth > 0 || $protectedMath > 0) {
                $out .= $token;
                continue;
            }
            $out .= preg_replace_callback(
                '/(?<!\\\\)\$(?!\$)(?:\\\\.|[^$\n])+?(?<!\\\\)\$/',
                function (array $match): string {
                    $tex = substr($match[0], 1, -1);
                    return '<span class="mbb-math" data-mbb-tex="' .
                        self::attribute($tex) .
                        '">' .
                        self::attribute($match[0]) .
                        '</span>';
                },
                $token,
            );
        }
        $this->safeHtml($out);
        return $out;
    }

    private function htmlSource(string $html): string
    {
        $body = $this->safeHtml($html);
        $spans = iterator_to_array($body->getElementsByTagName('span'));
        if ($spans === []) {
            return $html;
        }
        // DOM validation authorizes the spans and their exact literal TeX.
        // Replace only their original lexical ranges. Serializing the whole
        // DOM would also rewrite protected code text and attribute entities.
        $tokens = preg_split(
            '/(<(?:[^>"\']|"[^"]*"|\'[^\']*\')*>)/',
            $html,
            -1,
            PREG_SPLIT_DELIM_CAPTURE,
        );
        $index = 0;
        $inMath = false;
        $source = '';
        foreach ($tokens as $token) {
            if ($inMath) {
                if (preg_match('/^<\/span\s*>$/iD', $token)) {
                    $inMath = false;
                } elseif (str_starts_with($token, '<')) {
                    throw new ConversionError('HTML_STRUCTURE', 'Math span must contain only text');
                }
                continue;
            }
            if (preg_match('/^<span(?:\s|>)/i', $token)) {
                $span = $spans[$index++] ?? null;
                if ($span === null) {
                    throw new ConversionError('HTML_STRUCTURE', 'HTML span positions disagree');
                }
                if ($span->hasAttribute('data-mbb-tex')) {
                    $source .= '$' . $span->getAttribute('data-mbb-tex') . '$';
                    $inMath = true;
                    continue;
                }
            }
            $source .= $token;
        }
        if ($inMath || $index !== count($spans)) {
            throw new ConversionError('HTML_STRUCTURE', 'HTML span positions disagree');
        }
        return $source;
    }

    private function safeHtml(string $html): DOMElement
    {
        $body = $this->dom($html);
        $count = 0;
        $walk = function (DOMNode $node, int $depth) use (&$walk, &$count): void {
            if (++$count > self::MAX_NODES || $depth > self::MAX_DEPTH) {
                throw new ConversionError('STRUCTURE_LIMIT', 'HTML exceeds structural limits');
            }
            if ($node->nodeType === XML_TEXT_NODE) {
                return;
            }
            if (!($node instanceof DOMElement)) {
                throw new ConversionError(
                    'UNSAFE_HTML',
                    'HTML comments and nontext nodes are unsupported',
                );
            }
            $tag = $node->tagName;
            if (
                !in_array(
                    $tag,
                    explode(
                        ' ',
                        'p br strong em s del span font code pre blockquote ul ol li a img table thead tbody tr th td hr h1 h2 h3 h4 h5 h6',
                    ),
                    true,
                )
            ) {
                throw new ConversionError('UNSUPPORTED_HTML', 'Unsupported HTML tag: ' . $tag);
            }
            $math =
                $tag === 'span' &&
                $node->getAttribute('class') === 'mbb-math' &&
                $node->hasAttribute('data-mbb-tex');
            $footnote =
                $tag === 'span' &&
                $node->getAttribute('class') === 'mbb-footnote-ref' &&
                $node->hasAttribute('data-mbb-footnote');
            $allowed = $math
                ? ['class', 'data-mbb-tex']
                : ($footnote
                    ? ['class', 'data-mbb-footnote']
                    : [
                            'a' => ['href', 'title', 'id'],
                            'img' => ['src', 'alt', 'title', 'style', 'width', 'height'],
                            'p' => ['style'],
                            'span' => ['style', 'class'],
                            'font' => ['color', 'style'],
                            'ol' => ['start'],
                        ][$tag] ?? []);
            foreach ($node->attributes as $attribute) {
                $key = $attribute->name;
                $value = $attribute->value;
                if (!in_array($key, $allowed, true)) {
                    throw new ConversionError(
                        'HTML_ATTRIBUTES',
                        'Unsupported HTML attribute: ' . $tag . '.' . $key,
                    );
                }
                if (in_array($key, ['href', 'src'], true)) {
                    self::safeUrl($value);
                }
                if ($key === 'class' && !$math && !$footnote && $value !== 'wzf-exercise-hint') {
                    throw new ConversionError('HTML_ATTRIBUTES', 'Unsupported HTML class');
                }
                if ($key === 'style') {
                    $styles = [
                        'color' => '/^(?:[a-z]+|#[0-9a-f]{3,8})$/iD',
                        'background-color' => '/^(?:[a-z]+|#[0-9a-f]{3,8})$/iD',
                        'font-weight' => '/^(?:normal|bold|[1-9]00)$/D',
                        'font-size' => '/^\d+(?:\.\d+)?(?:px|em|rem|%)$/D',
                        'text-align' => '/^(?:left|right|center|justify)$/D',
                        'zoom' => '/^\d+(?:\.\d+)?%?$/D',
                    ];
                    foreach (explode(';', $value) as $rule) {
                        if (trim($rule) === '') {
                            continue;
                        }
                        $parts = explode(':', $rule);
                        $name = strtolower(trim($parts[0]));
                        if (
                            count($parts) !== 2 ||
                            !isset($styles[$name]) ||
                            !preg_match($styles[$name], trim($parts[1]))
                        ) {
                            throw new ConversionError(
                                'UNSAFE_STYLE',
                                'Unsupported or unsafe HTML style',
                            );
                        }
                    }
                }
                if (
                    ($key === 'color' && !preg_match('/^(?:[a-z]+|#[0-9a-f]{3,8})$/iD', $value)) ||
                    (in_array($key, ['width', 'height'], true) &&
                        !preg_match('/^\d+(?:\.\d+)?(?:px|%)?$/D', $value))
                ) {
                    throw new ConversionError('UNSAFE_STYLE', 'Unsafe HTML color or dimensions');
                }
            }
            if (
                $math &&
                ($node->childNodes->length !== 1 ||
                    $node->firstChild->nodeType !== XML_TEXT_NODE ||
                    $node->textContent !== '$' . $node->getAttribute('data-mbb-tex') . '$')
            ) {
                throw new ConversionError('MATH_MISMATCH', 'Inline math text disagrees with TeX');
            }
            if (
                $footnote &&
                ($node->childNodes->length !== 1 ||
                    $node->firstChild->nodeType !== XML_TEXT_NODE ||
                    $node->textContent !==
                        '[^' .
                            FootnoteRegistry::label($node->getAttribute('data-mbb-footnote')) .
                            ']')
            ) {
                throw new ConversionError(
                    'FOOTNOTE_MISMATCH',
                    'Footnote reference text disagrees with its label',
                );
            }
            foreach ($node->childNodes as $child) {
                $walk($child, $depth + 1);
            }
        };
        foreach ($body->childNodes as $node) {
            $walk($node, 0);
        }
        return $body;
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
        if ($depth === 0) {
            $notes = array_keys(
                array_filter($blocks, fn(array $block): bool => $block['name'] === 'mbb/footnotes'),
            );
            if (count($notes) > 1 || ($notes !== [] && $notes[0] !== count($blocks) - 1)) {
                throw new ConversionError(
                    'FOOTNOTE_STRUCTURE',
                    'One footnote section is allowed, at the document end',
                );
            }
        }
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
            case 'core/html':
                if ($children !== []) {
                    throw new ConversionError(
                        'HTML_STRUCTURE',
                        'HTML blocks cannot contain child blocks',
                    );
                }
                return $this->htmlSource($raw);
            case 'core/more':
                if ($children !== [] || $raw !== '<!--more-->') {
                    throw new ConversionError(
                        'MORE_OPTIONS',
                        'More block must use its default exact marker',
                    );
                }
                return '<!--more-->';
            case 'mbb/footnotes':
                if ($depth !== 0 || $children === []) {
                    throw new ConversionError(
                        'FOOTNOTE_STRUCTURE',
                        'Footnote section must be nonempty and top-level',
                    );
                }
                $root = $this->outer($raw, 'section', [
                    'class' => 'wp-block-mbb-footnotes mbb-footnotes',
                ]);
                if (
                    $root->childNodes->length !== 1 ||
                    !($root->firstChild instanceof DOMElement) ||
                    $root->firstChild->tagName !== 'ol'
                ) {
                    throw new ConversionError(
                        'FOOTNOTE_STRUCTURE',
                        'Footnote section requires one ol',
                    );
                }
                $this->attrs($root->firstChild, []);
                $this->validateSlots($root->firstChild, $children);
                $definitions = [];
                $labels = [];
                foreach ($children as $note) {
                    if ($note['name'] !== 'mbb/footnote' || $note['children'] === []) {
                        throw new ConversionError(
                            'FOOTNOTE_STRUCTURE',
                            'Footnote section may contain only nonempty definitions',
                        );
                    }
                    $label = FootnoteRegistry::label($note['attrs']['label'] ?? '');
                    if (isset($labels[$label])) {
                        throw new ConversionError('FOOTNOTE_DUPLICATE', 'Duplicate footnote label');
                    }
                    $labels[$label] = true;
                    $li = $this->outer($note['raw'], 'li', [
                        'data-mbb-footnote' => $label,
                        'class' => 'wp-block-mbb-footnote',
                    ]);
                    $body = explode("\n", $this->childElements($li, $note['children'], 1));
                    $first = array_shift($body);
                    $definitions[] =
                        '[^' .
                        $label .
                        ']: ' .
                        $first .
                        ($body === []
                            ? ''
                            : "\n" .
                                implode(
                                    "\n",
                                    array_map(
                                        fn(string $line): string => $line === ''
                                            ? ''
                                            : '    ' . $line,
                                        $body,
                                    ),
                                ));
                }
                return implode("\n\n", $definitions);
            case 'mbb/footnote':
                throw new ConversionError(
                    'FOOTNOTE_STRUCTURE',
                    'Footnotes belong only in the footnote section',
                );
            case 'core/image':
                if ($children !== []) {
                    throw new ConversionError(
                        'IMAGE_STRUCTURE',
                        'Image blocks cannot contain child blocks',
                    );
                }
                $root = $this->outer($raw, 'figure', ['class' => 'wp-block-image']);
                if (
                    $root->childNodes->length !== 1 ||
                    !($root->firstChild instanceof DOMElement) ||
                    $root->firstChild->tagName !== 'img'
                ) {
                    throw new ConversionError(
                        'IMAGE_STRUCTURE',
                        'Image requires exactly one img element',
                    );
                }
                return $this->inlineNode($root->firstChild, $depth + 1);
            case 'core/table':
                if ($children !== []) {
                    throw new ConversionError(
                        'TABLE_STRUCTURE',
                        'Table blocks cannot contain child blocks',
                    );
                }
                $root = $this->outer($raw, 'figure', ['class' => 'wp-block-table']);
                if (
                    $root->childNodes->length !== 1 ||
                    !($root->firstChild instanceof DOMElement) ||
                    $root->firstChild->tagName !== 'table'
                ) {
                    throw new ConversionError('TABLE_STRUCTURE', 'Expected one table');
                }
                $table = $root->firstChild;
                $this->attrs($table, ['class' => 'has-fixed-layout']);
                $rows = [];
                $aligns = [];
                $width = 0;
                $hasHead = false;
                $hasBody = false;
                foreach ($table->childNodes as $section) {
                    if (
                        !($section instanceof DOMElement) ||
                        !in_array($section->tagName, ['thead', 'tbody'], true) ||
                        ($section->tagName === 'thead'
                            ? $hasHead || $hasBody
                            : !$hasHead || $hasBody)
                    ) {
                        throw new ConversionError(
                            'TABLE_STRUCTURE',
                            'Table requires one header and at most one body',
                        );
                    }
                    $this->attrs($section, []);
                    $header = $section->tagName === 'thead';
                    if ($header) {
                        $hasHead = true;
                    } else {
                        $hasBody = true;
                    }
                    if ($header && $section->childNodes->length !== 1) {
                        throw new ConversionError(
                            'TABLE_STRUCTURE',
                            'Table must have exactly one header row',
                        );
                    }
                    foreach ($section->childNodes as $row) {
                        if (!($row instanceof DOMElement) || $row->tagName !== 'tr') {
                            throw new ConversionError('TABLE_STRUCTURE', 'Expected table row');
                        }
                        $this->attrs($row, []);
                        $cells = [];
                        foreach ($row->childNodes as $index => $cell) {
                            if (
                                !($cell instanceof DOMElement) ||
                                $cell->tagName !== ($header ? 'th' : 'td')
                            ) {
                                throw new ConversionError(
                                    'TABLE_STRUCTURE',
                                    'Unexpected table cell',
                                );
                            }
                            $align = $cell->hasAttribute('data-align')
                                ? $cell->getAttribute('data-align')
                                : null;
                            if (
                                $align !== null &&
                                !in_array($align, ['left', 'right', 'center'], true)
                            ) {
                                throw new ConversionError(
                                    'TABLE_STRUCTURE',
                                    'Invalid table alignment',
                                );
                            }
                            $this->attrs(
                                $cell,
                                $align === null
                                    ? []
                                    : [
                                        'class' => 'has-text-align-' . $align,
                                        'data-align' => $align,
                                    ],
                            );
                            if ($header) {
                                $aligns[] = $align;
                            } elseif (($aligns[$index] ?? null) !== $align) {
                                throw new ConversionError(
                                    'TABLE_STRUCTURE',
                                    'Body alignment must match header columns',
                                );
                            }
                            $cells[] = str_replace(
                                "\n",
                                ' ',
                                $this->inlineMarkdown($cell, $depth + 1, true),
                            );
                        }
                        if ($cells === [] || (!$header && count($cells) !== $width)) {
                            throw new ConversionError(
                                'TABLE_STRUCTURE',
                                'Table width must be consistent',
                            );
                        }
                        if ($header) {
                            $width = count($cells);
                        }
                        $rows[] = '| ' . implode(' | ', $cells) . ' |';
                        if ($header) {
                            $rows[] =
                                '| ' .
                                implode(
                                    ' | ',
                                    array_map(
                                        fn(?string $align): string => [
                                            'left' => ':---',
                                            'right' => '---:',
                                            'center' => ':---:',
                                        ][$align ?? ''] ?? '---',
                                        $aligns,
                                    ),
                                ) .
                                ' |';
                        }
                    }
                }
                if (!$hasHead) {
                    throw new ConversionError('TABLE_STRUCTURE', 'Missing table header');
                }
                return implode("\n", $rows);
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
                $literal = $attrs[$name === 'mbb/code' ? 'code' : 'tex'] ?? '';
                // The block attribute is the literal content model, not a
                // cached document source. Require the rendered HTML to agree
                // with that model through the same wp.element text renderer.
                $expectedText = $this->dom(self::elementText($literal))->textContent;
                if ($code->textContent !== $expectedText) {
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

    private function inlineMarkdown(DOMElement $element, int $depth, bool $table = false): string
    {
        $markdown = '';
        foreach ($element->childNodes as $node) {
            $markdown .= $this->inlineNode($node, $depth, $table);
        }
        return $markdown;
    }

    private static function terminalBreak(DOMNode $node): bool
    {
        $tail = $node->nextSibling;
        return $tail === null ||
            ($tail->nodeType === XML_TEXT_NODE &&
                $tail->textContent === "\n" &&
                $tail->nextSibling === null);
    }

    private function inlineNode(DOMNode $node, int $depth, bool $table = false): string
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
            $text = str_replace(['&', '<'], ['&amp;', '&lt;'], $text);
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
            case 's':
                $this->attrs($node, []);
                $marker =
                    $node->tagName === 'strong' ? '**' : ($node->tagName === 'em' ? '*' : '~~');
                return $marker . $this->inlineMarkdown($node, $depth + 1, $table) . $marker;
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
                    return self::terminalBreak($node->nextSibling) ? '<br><br>' : "  \n";
                }
                // A terminal newline is removed by Markdown block parsing.
                // Keep an authorized literal break at the end of its inline
                // container instead, so paragraph/strong endings roundtrip.
                return self::terminalBreak($node) ? '<br>' : "\n";
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
                if ($table && str_contains($literal, '|')) {
                    throw new ConversionError(
                        'ROUNDTRIP',
                        'Code pipes in tables are outside the current engine reverse contract',
                    );
                }
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
                if ($node->hasAttribute('id')) {
                    $this->safeHtml($node->ownerDocument->saveHTML($node));
                    return $node->ownerDocument->saveHTML($node);
                }
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
                    $this->inlineMarkdown($node, $depth + 1, $table) .
                    '](<' .
                    $url .
                    '>' .
                    $title .
                    ')';
            case 'img':
                if (
                    $node->hasAttribute('style') ||
                    $node->hasAttribute('width') ||
                    $node->hasAttribute('height')
                ) {
                    $this->safeHtml($node->ownerDocument->saveHTML($node));
                    return $node->ownerDocument->saveHTML($node);
                }
                if (
                    !$node->hasAttribute('src') ||
                    !$node->hasAttribute('alt') ||
                    $node->hasChildNodes()
                ) {
                    throw new ConversionError(
                        'IMAGE_STRUCTURE',
                        'Images require src, alt and no children',
                    );
                }
                $imageAttrs = [
                    'src' => $node->getAttribute('src'),
                    'alt' => $node->getAttribute('alt'),
                ];
                if ($node->hasAttribute('title')) {
                    $imageAttrs['title'] = $node->getAttribute('title');
                }
                $this->attrs($node, $imageAttrs);
                self::safeUrl($imageAttrs['src']);
                $alt = preg_replace(
                    '/([\\\\`*{}_\[\]()#+.!>~|$-])/',
                    '\\\\$1',
                    str_replace(['&', '<'], ['&amp;', '&lt;'], $imageAttrs['alt']),
                );
                $url = str_replace(
                    ['\\', '>', '<', "\n"],
                    ['%5C', '%3E', '%3C', '%0A'],
                    $imageAttrs['src'],
                );
                $title = isset($imageAttrs['title'])
                    ? ' "' . str_replace(['\\', '"'], ['\\\\', '\\"'], $imageAttrs['title']) . '"'
                    : '';
                return '![' . $alt . '](<' . $url . '>' . $title . ')';
            case 'span':
                if ($node->hasAttribute('data-mbb-footnote')) {
                    $label = FootnoteRegistry::label($node->getAttribute('data-mbb-footnote'));
                    $this->attrs($node, [
                        'data-mbb-footnote' => $label,
                        'class' => 'mbb-footnote-ref',
                    ]);
                    if (
                        $node->childNodes->length !== 1 ||
                        $node->firstChild->nodeType !== XML_TEXT_NODE ||
                        $node->textContent !== '[^' . $label . ']'
                    ) {
                        throw new ConversionError(
                            'FOOTNOTE_MISMATCH',
                            'Footnote reference text disagrees with its label',
                        );
                    }
                    return '[^' . $label . ']';
                }
                if (!$node->hasAttribute('data-mbb-tex')) {
                    $this->safeHtml($node->ownerDocument->saveHTML($node));
                    return $node->ownerDocument->saveHTML($node);
                }
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
            case 'del':
            case 'font':
                $this->safeHtml($node->ownerDocument->saveHTML($node));
                return $node->ownerDocument->saveHTML($node);
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
            foreach (libxml_get_errors() as $error) {
                if (
                    $error->code !== 801 ||
                    !in_array(
                        trim($error->message),
                        ['Tag figure invalid', 'Tag section invalid'],
                        true,
                    )
                ) {
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
