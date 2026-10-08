<?php

declare(strict_types=1);

namespace MarkBridge\Probe;

use League\CommonMark\Extension\CommonMark\Node\Block\BlockQuote;
use League\CommonMark\Extension\CommonMark\Node\Block\ListBlock;
use League\CommonMark\Extension\CommonMark\Parser\Block\BlockQuoteParser;
use League\CommonMark\Extension\CommonMark\Parser\Block\FencedCodeParser;
use League\CommonMark\Extension\CommonMark\Parser\Block\IndentedCodeParser;
use League\CommonMark\Node\Block\Document;
use League\CommonMark\Extension\CommonMark\Node\Block\ListItem;
use League\CommonMark\Node\Block\AbstractBlock;
use League\CommonMark\Parser\Block\AbstractBlockContinueParser;
use League\CommonMark\Parser\Block\BlockContinue;
use League\CommonMark\Parser\Block\BlockContinueParserInterface;
use League\CommonMark\Parser\Block\BlockStart;
use League\CommonMark\Parser\Block\BlockStartParserInterface;
use League\CommonMark\Parser\Cursor;
use League\CommonMark\Parser\MarkdownParserStateInterface;

/** Keep the official code grammar; specialize only list-contained blank lines. */
final class CodeWhitespaceStartParser implements BlockStartParserInterface
{
    public function __construct(private readonly BlockStartParserInterface $delegate) {}

    public function tryStart(Cursor $cursor, MarkdownParserStateInterface $parserState): ?BlockStart
    {
        $start = $this->delegate->tryStart($cursor, $parserState);
        if ($start === null) {
            return null;
        }
        $parsers = [];
        foreach ($start->getBlockParsers() as $parser) {
            $parsers[] = new CodeWhitespaceContinueParser($parser);
        }
        return BlockStart::of(...$parsers)->at($cursor);
    }
}

final class CodeWhitespaceContinueParser extends AbstractBlockContinueParser
{
    private ?string $blankLine = null;

    public function __construct(private readonly FencedCodeParser|IndentedCodeParser $delegate) {}

    public function getBlock(): AbstractBlock
    {
        return $this->delegate->getBlock();
    }

    public function tryContinue(
        Cursor $cursor,
        BlockContinueParserInterface $activeBlockParser,
    ): ?BlockContinue {
        // CommonMark's ListItemParser consumes all remaining whitespace on a
        // blank line before its code child sees the cursor. markdown-it keeps
        // whitespace beyond the list/code indentation as literal code content.
        // Replay only this already-classified blank code line's AST containers;
        // every code/fence decision stays in the official continuation parser.
        $this->blankLine = null;
        if ($cursor->isBlank()) {
            $replay = $this->blankLineCursor($cursor);
            if ($replay !== null) {
                // Both pinned official code parsers only move the cursor on a
                // blank line. Read its literal remainder separately: virtual
                // quote columns must never replace the real engine's cursor.
                $continued = $this->delegate->tryContinue($replay, $activeBlockParser);
                if ($continued !== null && !$continued->isFinalize()) {
                    $this->blankLine = $replay->getRemainder();
                }
            }
        }
        return $this->delegate->tryContinue($cursor, $activeBlockParser);
    }

    private function blankLineCursor(Cursor $cursor): ?Cursor
    {
        $ancestors = [];
        $hasList = false;
        for ($node = $this->getBlock()->parent(); $node !== null; $node = $node->parent()) {
            if ($node instanceof ListItem) {
                $hasList = true;
            } elseif (
                !($node instanceof BlockQuote) &&
                !($node instanceof ListBlock) &&
                !($node instanceof Document)
            ) {
                // Preserve the host parser's behavior in other containers.
                return null;
            }
            $ancestors[] = $node;
        }
        if (!$hasList) {
            return null;
        }
        $replay = new Cursor($cursor->getLine());
        $baseColumn = 0;
        foreach (array_reverse($ancestors) as $node) {
            if ($node instanceof ListItem) {
                $data = $node->getListData();
                $replay->advanceBy($data->markerOffset + $data->padding, true);
            } elseif ($node instanceof BlockQuote) {
                $probe = clone $replay;
                if ((new BlockQuoteParser())->tryContinue($probe, $this) === null) {
                    return null;
                }
                $replay->advanceToNextNonSpaceOrTab();
                $indent = $replay->getColumn() - $baseColumn;
                $replay->advanceBy(1); // Authorized quote marker.
                $optional = $replay->getCurrentCharacter();
                $spaceAfter = $optional === ' ' || $optional === "\t";
                if ($optional === ' ' || ($optional === "\t" && $replay->getColumn() % 4 === 3)) {
                    $replay->advanceBy(1, true);
                }
                // markdown-it retains a wide optional tab physically, while
                // accounting for one optional column in its per-line bsCount.
                // Reset that virtual column after every quote marker, including
                // nested quotes. This cursor is used only to extract code text.
                $baseColumn = $indent + 1 + ($spaceAfter ? 1 : 0);
                $replay = new Cursor(str_repeat(' ', $baseColumn) . $replay->getRemainder());
                $replay->advanceBy($baseColumn, true);
            }
        }
        return $replay->isBlank() ? $replay : null;
    }

    public function addLine(string $line): void
    {
        $this->delegate->addLine($this->blankLine ?? $line);
        $this->blankLine = null;
    }

    public function closeBlock(): void
    {
        $this->delegate->closeBlock();
    }
}
