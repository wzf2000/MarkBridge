<?php

declare(strict_types=1);

namespace MarkBridge\Probe;

use League\CommonMark\Extension\CommonMark\Node\Inline\HtmlInline;
use League\CommonMark\Extension\Footnote\Parser\FootnoteParser;
use League\CommonMark\Node\Inline\AbstractStringContainer;
use League\CommonMark\Parser\Block\BlockStart;
use League\CommonMark\Parser\Block\BlockStartParserInterface;
use League\CommonMark\Parser\Cursor;
use League\CommonMark\Parser\Inline\InlineParserInterface;
use League\CommonMark\Parser\Inline\InlineParserMatch;
use League\CommonMark\Parser\InlineParserContext;
use League\CommonMark\Parser\MarkdownParserStateInterface;
use League\CommonMark\Reference\Reference;

final class FootnoteReference extends AbstractStringContainer {}

final class FootnoteRegistry
{
    public array $definitions = [];

    public static function label(string $label): string
    {
        if (!preg_match('/^[\p{L}\p{N}_-]{1,64}$/uD', $label)) {
            throw new ConversionError(
                'FOOTNOTE_LABEL',
                'Footnote labels require 1–64 letters, numbers, underscores or hyphens',
            );
        }
        return $label;
    }
}

// Reuse CommonMark's container/indent parser but not its footnote processor:
// the default processor drops unreferenced definitions and changes their order.
final class NamedFootnoteStartParser implements BlockStartParserInterface
{
    public function __construct(private readonly FootnoteRegistry $registry) {}

    public function tryStart(Cursor $cursor, MarkdownParserStateInterface $parserState): ?BlockStart
    {
        if (
            $cursor->isIndented() ||
            !preg_match('/^\s*\[\^([^\]\n]+)\]:[ \t]*/', $cursor->getRemainder(), $match)
        ) {
            return BlockStart::none();
        }
        $label = FootnoteRegistry::label($match[1]);
        if (isset($this->registry->definitions[$label])) {
            throw new ConversionError(
                'FOOTNOTE_DUPLICATE',
                'Duplicate footnote definition: ' . $label,
            );
        }
        $parser = new FootnoteParser(new Reference($label, $label, $label));
        $this->registry->definitions[$label] = $parser->getBlock();
        $cursor->advanceBy(mb_strlen($match[0], 'UTF-8'));
        return BlockStart::of($parser)->at($cursor);
    }
}

final class NamedFootnoteInlineParser implements InlineParserInterface
{
    private \WeakMap $htmlStates;
    private int $references = 0;

    public function __construct()
    {
        $this->htmlStates = new \WeakMap();
    }

    public function getMatchDefinition(): InlineParserMatch
    {
        return InlineParserMatch::oneOf('[^', '^[');
    }

    public function parse(InlineParserContext $inlineContext): bool
    {
        $cursor = $inlineContext->getCursor();
        if (!preg_match('/^\[\^([^\]\n]+)\]/', $cursor->getRemainder(), $match)) {
            if (str_starts_with($cursor->getRemainder(), '^[')) {
                throw new ConversionError(
                    'FOOTNOTE_ANONYMOUS',
                    'Anonymous inline footnotes are not supported',
                );
            }
            return false;
        }
        $container = $inlineContext->getContainer();
        $state = $this->htmlStates[$container] ?? ['code' => 0, 'link' => 0, 'last' => null];
        $last = $state['last'];
        if ($last !== null && $last->parent() === $container) {
            $child = $last->next();
        } else {
            $state = ['code' => 0, 'link' => 0, 'last' => null];
            $child = $container->firstChild();
        }
        $codeDepth = $state['code'];
        $linkDepth = $state['link'];
        for (; $child !== null; $child = $child->next()) {
            if (!($child instanceof HtmlInline)) {
                continue;
            }
            $literal = $child->getLiteral();
            if (preg_match('/^<(?:code|pre)(?:\s|>)/i', $literal)) {
                $codeDepth++;
            } elseif (preg_match('/^<\/(?:code|pre)\s*>/i', $literal)) {
                $codeDepth = max(0, $codeDepth - 1);
            } elseif (preg_match('/^<a(?:\s|>)/i', $literal)) {
                $linkDepth++;
            } elseif (preg_match('/^<\/a\s*>/i', $literal)) {
                $linkDepth = max(0, $linkDepth - 1);
            }
        }
        if ($codeDepth > 0) {
            $this->htmlStates[$container] = [
                'code' => $codeDepth,
                'link' => $linkDepth,
                'last' => $container->lastChild(),
            ];
            return false;
        }
        if ($linkDepth > 0) {
            throw new ConversionError(
                'FOOTNOTE_IN_LINK',
                'Footnote references cannot appear in links',
            );
        }
        if (++$this->references > Converter::MAX_NODES) {
            throw new ConversionError(
                'STRUCTURE_LIMIT',
                'Footnote references exceed the parser node budget',
            );
        }
        $label = FootnoteRegistry::label($match[1]);
        $reference = new FootnoteReference($label);
        $container->appendChild($reference);
        $this->htmlStates[$container] = [
            'code' => $codeDepth,
            'link' => $linkDepth,
            'last' => $reference,
        ];
        $cursor->advanceBy(mb_strlen($match[0], 'UTF-8'));
        return true;
    }
}
