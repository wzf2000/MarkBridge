<?php

declare(strict_types=1);

namespace MarkBridge\Probe;

use League\CommonMark\Node\Block\AbstractBlock;
use League\CommonMark\Node\Inline\AbstractStringContainer;
use League\CommonMark\Extension\CommonMark\Node\Block\ListItem;
use League\CommonMark\Node\Block\Paragraph;
use League\CommonMark\Node\Inline\Text;
use League\CommonMark\Parser\Block\AbstractBlockContinueParser;
use League\CommonMark\Parser\Block\BlockContinue;
use League\CommonMark\Parser\Block\BlockContinueParserInterface;
use League\CommonMark\Parser\Block\BlockStart;
use League\CommonMark\Parser\Block\BlockStartParserInterface;
use League\CommonMark\Parser\Cursor;
use League\CommonMark\Parser\Inline\InlineParserInterface;
use League\CommonMark\Parser\Inline\InlineParserMatch;
use League\CommonMark\Parser\InlineParserContext;
use League\CommonMark\Parser\MarkdownParserStateInterface;

final class InlineMath extends AbstractStringContainer {}

final class DisplayMath extends AbstractBlock
{
    public string $tex = '';
}

// These run inside CommonMark's parser. Container indentation, quoted blocks,
// fenced code and escaped dollars are handled by the host parser, not a scan of
// the original document.
final class MathStartParser implements BlockStartParserInterface
{
    public function tryStart(Cursor $cursor, MarkdownParserStateInterface $parserState): ?BlockStart
    {
        if ($cursor->isIndented() || trim($cursor->getRemainder()) !== '$$') {
            return BlockStart::none();
        }
        $cursor->advanceToEnd();
        return BlockStart::of(new MathContinueParser())->at($cursor);
    }
}

final class MathContinueParser extends AbstractBlockContinueParser
{
    private DisplayMath $block;
    private array $lines = [];
    private bool $opening = true;
    private bool $closed = false;

    public function __construct()
    {
        $this->block = new DisplayMath();
    }

    public function getBlock(): DisplayMath
    {
        return $this->block;
    }

    public function tryContinue(
        Cursor $cursor,
        BlockContinueParserInterface $activeBlockParser,
    ): ?BlockContinue {
        if (trim($cursor->getRemainder()) === '$$') {
            $this->closed = true;
            return BlockContinue::finished();
        }
        return BlockContinue::at($cursor);
    }

    public function addLine(string $line): void
    {
        if ($this->opening) {
            $this->opening = false;
            return;
        }
        $this->lines[] = $line;
    }

    public function closeBlock(): void
    {
        if (!$this->closed) {
            throw new ConversionError('UNCLOSED_MATH', 'Display math requires a closing $$ line');
        }
        $this->block->tex = implode("\n", $this->lines);
    }
}

final class MathInlineParser implements InlineParserInterface
{
    public function getMatchDefinition(): InlineParserMatch
    {
        return InlineParserMatch::string('$');
    }

    public function parse(InlineParserContext $inlineContext): bool
    {
        $cursor = $inlineContext->getCursor();
        $remainder = $cursor->getRemainder();
        if (str_starts_with($remainder, '$$')) {
            throw new ConversionError('MATH_DELIMITER', '$$ must occupy a complete line');
        }
        // Delimiters are ASCII, so a byte scan stays linear even for long CJK
        // paragraphs. Convert the accepted prefix to character count only once
        // for CommonMark's Unicode cursor.
        $length = strlen($remainder);
        for ($i = 1; $i < $length; $i++) {
            $char = $remainder[$i];
            if ($char === "\n") {
                return false;
            }
            if ($char === '\\') {
                $i++;
                continue;
            }
            if ($char === '$') {
                if ($i === 1) {
                    return false;
                }
                $inlineContext
                    ->getContainer()
                    ->appendChild(new InlineMath(substr($remainder, 1, $i - 1)));
                $cursor->advanceBy(mb_strlen(substr($remainder, 0, $i + 1), 'UTF-8'));
                return true;
            }
        }
        return false;
    }
}

// Record tasks from their actual unescaped parser input. Text AST nodes alone
// cannot distinguish [x] from \[x] or &#91;x], so they are not an authority for
// whether a list item carries checkbox state.
final class TaskMarkerParser implements InlineParserInterface
{
    public function getMatchDefinition(): InlineParserMatch
    {
        return InlineParserMatch::string('[');
    }

    public function parse(InlineParserContext $inlineContext): bool
    {
        $container = $inlineContext->getContainer();
        $cursor = $inlineContext->getCursor();
        if (
            !($container instanceof Paragraph) ||
            !($container->parent() instanceof ListItem) ||
            $container->parent()->firstChild() !== $container ||
            $cursor->getPosition() !== 0 ||
            $container->hasChildren()
        ) {
            return false;
        }
        if (!preg_match('/^\[([ xX])\](?:[ \t]+|$)/', $cursor->getRemainder(), $match)) {
            return false;
        }
        $container->data->set('probe_task', [
            'prefix' => strlen($match[0]),
            'checked' => strtolower($match[1]) === 'x',
        ]);
        $container->appendChild(new Text($match[0]));
        $cursor->advanceBy(strlen($match[0]));
        return true;
    }
}

// Explicitly reject definitions before CommonMark can interpret them as normal
// link definitions and discard them. Named-footnote validation is a documented
// gap of this first prototype; a partial implementation must not report success.
final class FootnoteRejectParser implements BlockStartParserInterface
{
    public function tryStart(Cursor $cursor, MarkdownParserStateInterface $parserState): ?BlockStart
    {
        if (
            !$cursor->isIndented() &&
            preg_match('/^\s*\[\^[^\]\n]+\]:/', $cursor->getRemainder())
        ) {
            throw new ConversionError(
                'UNSUPPORTED_FOOTNOTE',
                'Named footnotes are not implemented in this prototype',
            );
        }
        return BlockStart::none();
    }
}
