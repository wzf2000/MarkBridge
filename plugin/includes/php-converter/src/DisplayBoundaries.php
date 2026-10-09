<?php

declare(strict_types=1);

namespace MarkBridge\Probe;

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Extension\CommonMark\Node\Block\IndentedCode;
use League\CommonMark\Node\Node;
use League\CommonMark\Parser\MarkdownParser;

/** The current engine's legacy $$ boundary normalization, guarded by a real AST. */
final class DisplayBoundaries
{
    public static function normalize(string $source): string
    {
        if (!str_contains($source, '$$')) {
            return $source;
        }
        $environment = new Environment(['max_nesting_level' => Converter::MAX_DEPTH + 1]);
        $environment->addExtension(new CommonMarkCoreExtension());
        $registry = new FootnoteRegistry();
        $environment->addBlockStartParser(new NamedFootnoteStartParser($registry), 101);
        $document = (new MarkdownParser($environment))->parse($source);
        $ignored = [];
        $nodes = 0;
        $visit = function (Node $node, int $depth) use (&$visit, &$ignored, &$nodes): void {
            if (++$nodes > Converter::MAX_NODES || $depth > Converter::MAX_DEPTH) {
                throw new ConversionError(
                    'STRUCTURE_LIMIT',
                    'Boundary AST exceeds structural limits',
                );
            }
            if ($node instanceof FencedCode || $node instanceof IndentedCode) {
                for (
                    $line = $node->getStartLine() ?? 1;
                    $line <= ($node->getEndLine() ?? $line);
                    $line++
                ) {
                    $ignored[$line - 1] = true;
                }
                return;
            }
            foreach ($node->children() as $child) {
                $visit($child, $depth + 1);
            }
        };
        $visit($document, 0);
        // This narrow raw-tag guard reproduces the existing legacy boundary
        // policy. It does not authorize HTML; the DOM policy validates it later.
        preg_match_all(
            '/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/i',
            $source,
            $htmlCode,
            PREG_OFFSET_CAPTURE,
        );
        $protected = [];
        foreach ($htmlCode[0] as [$text, $offset]) {
            $protected[] = [$offset, $offset + strlen($text)];
        }
        $marks = [];
        $offset = 0;
        $inlineCode = 0;
        $protectedIndex = 0;
        foreach (explode("\n", $source) as $lineIndex => $line) {
            if (isset($ignored[$lineIndex])) {
                $offset += strlen($line) + 1;
                continue;
            }
            for ($i = 0, $length = strlen($line); $i < $length; $i++) {
                while (
                    isset($protected[$protectedIndex]) &&
                    $offset + $i >= $protected[$protectedIndex][1]
                ) {
                    $protectedIndex++;
                }
                if (
                    isset($protected[$protectedIndex]) &&
                    $offset + $i >= $protected[$protectedIndex][0]
                ) {
                    $i = min($length, $protected[$protectedIndex][1] - $offset) - 1;
                    continue;
                }
                if ($line[$i] === '\\' && $inlineCode === 0) {
                    $i++;
                    continue;
                }
                if ($line[$i] === '`') {
                    $ticks = strspn($line, '`', $i);
                    if ($inlineCode === 0) {
                        $inlineCode = $ticks;
                    } elseif ($inlineCode === $ticks) {
                        $inlineCode = 0;
                    }
                    $i += $ticks - 1;
                    continue;
                }
                if ($inlineCode === 0 && substr($line, $i, 2) === '$$') {
                    preg_match('/^\s*/', $line, $indent);
                    $marks[] = [
                        'pos' => $offset + $i,
                        'own' => preg_match('/^(?: {0,3}>[ \t]?)*\s*\$\$\s*$/D', $line) === 1,
                        'indent' => $indent[0],
                    ];
                    $i++;
                }
            }
            $offset += strlen($line) + 1;
        }
        if (count($marks) % 2 !== 0) {
            throw new ConversionError(
                'UNCLOSED_MATH',
                'Display math requires paired $$ delimiters',
            );
        }
        for ($i = count($marks) - 2; $i >= 0; $i -= 2) {
            $opening = $marks[$i];
            $closing = $marks[$i + 1];
            if ($opening['own'] && $closing['own']) {
                continue;
            }
            $tex = trim(
                substr($source, $opening['pos'] + 2, $closing['pos'] - $opening['pos'] - 2),
            );
            $source =
                substr($source, 0, $opening['pos']) .
                "\n\n" .
                $opening['indent'] .
                "$$\n" .
                $tex .
                "\n" .
                $opening['indent'] .
                "$$\n\n" .
                substr($source, $closing['pos'] + 2);
        }
        return $source;
    }
}
