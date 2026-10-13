<?php

declare(strict_types=1);
namespace MarkBridge\Probe;

final class FrontMatter
{
    public const HTML = '<div class="wp-block-mbb-frontmatter" data-mbb-generated=""></div>';
    public const FIELDS = [
        'title',
        'excerpt',
        'slug',
        'status',
        'categories',
        'tags',
        'featured_media',
    ];
    private static function error(string $code, string $message): never
    {
        throw new ConversionError($code, $message);
    }
    public static function parse(string $source): ?array
    {
        preg_match_all('/[^\n]*(?:\n|$)/', $source, $matches);
        $lines = $matches[0];
        if (
            !preg_match('/^---\r?\n$/D', $lines[0] ?? '') ||
            !str_starts_with($lines[1] ?? '', 'markbridge:')
        ) {
            return null;
        }
        if (!preg_match('/^markbridge: 1\r?\n$/D', $lines[1])) {
            self::error('FRONTMATTER_VERSION', 'FrontMatter version must be 1');
        }
        $raw = $lines[0] . $lines[1];
        $proposal = [];
        $closed = false;
        foreach (array_slice($lines, 2) as $row) {
            $line = preg_replace('/\r?\n$/D', '', $row);
            $raw .= $row;
            if (strlen($raw) > 16384) {
                self::error('FRONTMATTER_LIMIT', 'FrontMatter exceeds 16 KiB');
            }
            if ($line === '---') {
                $closed = true;
                break;
            }
            if (
                !preg_match('/^([a-z_]+): ([^\r\n]+)$/D', $line, $match) ||
                !in_array($match[1], self::FIELDS, true) ||
                array_key_exists($match[1], $proposal)
            ) {
                self::error(
                    'FRONTMATTER_FIELD',
                    'Unknown, duplicate or multiline FrontMatter field',
                );
            }
            $key = $match[1];
            try {
                $value = json_decode($match[2], true, 8, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                self::error('FRONTMATTER_VALUE', 'FrontMatter requires valid JSON');
            }
            if ($key === 'featured_media') {
                if (
                    !preg_match('/^(?:0|[1-9]\d*)$/D', $match[2]) ||
                    strlen($match[2]) > 16 ||
                    (strlen($match[2]) === 16 && strcmp($match[2], '9007199254740991') > 0)
                ) {
                    self::error(
                        'FRONTMATTER_VALUE',
                        'Featured media requires a nonnegative safe integer',
                    );
                }
            } elseif ($key === 'categories' || $key === 'tags') {
                if (!is_array($value) || !array_is_list($value) || count($value) > 100) {
                    self::error('FRONTMATTER_VALUE', 'Terms require a bounded unique string array');
                }
                foreach ($value as $slug) {
                    if (!is_string($slug) || !preg_match('/^[a-z0-9%_-]{1,200}$/D', $slug)) {
                        self::error('FRONTMATTER_VALUE', 'Invalid term slug');
                    }
                }
                if (
                    count(array_unique($value, SORT_STRING)) !== count($value) ||
                    !str_starts_with(ltrim($match[2]), '[')
                ) {
                    self::error('FRONTMATTER_VALUE', 'Terms require a JSON array');
                }
            } else {
                if (
                    !is_string($value) ||
                    !mb_check_encoding($value, 'UTF-8') ||
                    str_contains($value, "\0")
                ) {
                    self::error('FRONTMATTER_VALUE', 'Invalid Unicode string');
                }
                if (
                    $key === 'title' &&
                    (preg_replace('/[\p{Z}\x{0009}-\x{000D}\x{0085}\x{FEFF}]/u', '', $value) ===
                        '' ||
                        mb_strlen($value, 'UTF-8') > 200 ||
                        preg_match('/[\x00-\x1f\x7f]/', $value))
                ) {
                    self::error('FRONTMATTER_VALUE', 'Invalid title');
                }
                if (
                    $key === 'excerpt' &&
                    (strlen($value) > 8192 ||
                        preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value))
                ) {
                    self::error('FRONTMATTER_VALUE', 'Invalid excerpt');
                }
                if (
                    $key === 'slug' &&
                    (mb_strlen($value, 'UTF-8') > 200 ||
                        preg_match(
                            '/[\p{Z}\x{0009}-\x{000D}\x{0085}\x{FEFF}<>\\\\\/\x00-\x1f\x7f]/u',
                            $value,
                        ))
                ) {
                    self::error('FRONTMATTER_VALUE', 'Invalid slug');
                }
                if (
                    $key === 'status' &&
                    !in_array($value, ['draft', 'pending', 'publish', 'private'], true)
                ) {
                    self::error('FRONTMATTER_VALUE', 'Invalid status');
                }
            }
            $proposal[$key] = $value;
        }
        if (!$closed) {
            self::error('FRONTMATTER_SYNTAX', 'Missing FrontMatter closing delimiter');
        }
        return ['raw' => $raw, 'body' => substr($source, strlen($raw)), 'proposal' => $proposal];
    }
    public static function validate(array $blocks): void
    {
        $found = false;
        $walk = function (array $items, bool $top = false) use (&$walk, &$found): void {
            foreach ($items as $index => $block) {
                if ($block['name'] === 'mbb/frontmatter') {
                    $attrs = $block['attrs'];
                    if (
                        !$top ||
                        $index !== 0 ||
                        $found ||
                        $block['children'] !== [] ||
                        !in_array(trim($block['raw'] ?? ''), ['', self::HTML], true)
                    ) {
                        self::error(
                            'FRONTMATTER_STRUCTURE',
                            'FrontMatter must be the unique first top-level empty block',
                        );
                    }
                    $found = true;
                    if (
                        count($attrs) !== 2 ||
                        array_diff(array_keys($attrs), ['version', 'raw']) ||
                        $attrs['version'] !== 1 ||
                        !is_string($attrs['raw'])
                    ) {
                        self::error('FRONTMATTER_ATTRIBUTES', 'Invalid FrontMatter attributes');
                    }
                    $parsed = self::parse($attrs['raw']);
                    if (!$parsed || $parsed['body'] !== '') {
                        self::error(
                            'FRONTMATTER_ATTRIBUTES',
                            'Raw must contain only a complete FrontMatter header',
                        );
                    }
                }
                $walk($block['children']);
            }
        };
        $walk($blocks, true);
    }
}
