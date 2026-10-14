<?php
declare(strict_types=1);
namespace MarkBridge\Probe;

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

final class ResourceImages
{
    private const TOKENS = '~<!--[\s\S]*?-->|<(pre|code)\b[^>]*>[\s\S]*?</\1\s*>|<img\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>~i';
    private const ATTRIBUTES = '/(\s+[a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+)))?/i';
    public static function urls(string $serialized): array
    {
        preg_match_all(self::TOKENS, $serialized, $tags);
        $urls = [];
        foreach ($tags[0] as $tag) {
            if (!preg_match('/^<img\b/i', $tag)) {
                continue;
            }
            preg_match_all(self::ATTRIBUTES, $tag, $attributes, PREG_SET_ORDER);
            foreach ($attributes as $src) {
                if (strtolower(trim($src[1])) !== 'src' || count($src) < 3) {
                    continue;
                }
                $value =
                    $src[2] !== '' ? $src[2] : (($src[3] ?? '') !== '' ? $src[3] : $src[4] ?? '');
                $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                if (!in_array($value, $urls, true)) {
                    $urls[] = $value;
                }
            }
        }
        return $urls;
    }
    public static function rewrite(
        string $serialized,
        array $mappings,
        bool $portable = false,
    ): string {
        if (!array_is_list($mappings) || count($mappings) > 256) {
            throw new ConversionError('RESOURCE_MAP', 'Invalid image mapping');
        }
        $map = [];
        foreach ($mappings as $item) {
            if (
                !is_array($item) ||
                count($item) !== 2 ||
                !is_string($item['from'] ?? null) ||
                !is_string($item['to'] ?? null) ||
                $item['from'] === '' ||
                !mb_check_encoding($item['from'] . $item['to'], 'UTF-8') ||
                str_contains($item['from'] . $item['to'], "\0") ||
                mb_strlen($item['from'], 'UTF-8') > 2048 ||
                mb_strlen($item['to'], 'UTF-8') > 4096 ||
                isset($map[$item['from']]) ||
                !preg_match(
                    $portable
                        ? '~^images/[a-f0-9]{64}\.(?:png|jpg|gif|webp)$~D'
                        : '~^(?:https?://[^\s<>"\'\\\\]+|mbb-import/[a-f0-9]{64})$~D',
                    $item['to'],
                )
            ) {
                throw new ConversionError('RESOURCE_MAP', 'Invalid or repeated image mapping');
            }
            $map[$item['from']] = ['url' => $item['to'], 'count' => 0];
        }
        if (count(array_unique(array_column($map, 'url'), SORT_STRING)) > 32) {
            throw new ConversionError('RESOURCE_MAP', 'At most 32 image targets');
        }
        $result = preg_replace_callback(
            self::TOKENS,
            static function ($tag) use (&$map, $portable) {
                if (!preg_match('/^<img\b/i', $tag[0])) {
                    return $tag[0];
                }
                return preg_replace_callback(
                    self::ATTRIBUTES,
                    static function ($src) use (&$map, $portable) {
                        if (strtolower(trim($src[1])) !== 'src' || count($src) < 3) {
                            return $src[0];
                        }
                        $value =
                            $src[2] !== ''
                                ? $src[2]
                                : (($src[3] ?? '') !== ''
                                    ? $src[3]
                                    : $src[4] ?? '');
                        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                        if (!isset($map[$value])) {
                            return $src[0];
                        }
                        $map[$value]['count']++;
                        if ($portable) {
                            preg_match('/^.*?=\s*/s', $src[0], $prefix);
                            $quote = substr($src[0], strlen($prefix[0]), 1);
                            $quoted = $quote === '"' || $quote === "'";
                            return $prefix[0] .
                                ($quoted ? $quote : '') .
                                $map[$value]['url'] .
                                ($quoted ? $quote : '');
                        }
                        return $src[1] .
                            '="' .
                            htmlspecialchars($map[$value]['url'], ENT_QUOTES | ENT_HTML5, 'UTF-8') .
                            '"';
                    },
                    $tag[0],
                );
            },
            $serialized,
        );
        foreach ($map as $item) {
            if (!$item['count']) {
                throw new ConversionError(
                    'RESOURCE_TARGET',
                    'Image mapping does not target an author image',
                );
            }
        }
        return $result;
    }
}
