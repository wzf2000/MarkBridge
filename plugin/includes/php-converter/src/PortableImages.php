<?php
declare(strict_types=1);
namespace MarkBridge\Probe;
final class PortableImages
{
    public static function source(string $source, array $mappings): string
    {
        $map = array_column($mappings, 'to', 'from');
        $visible = $source;
        $mask = static function (int $start, int $length) use (&$visible): void {
            $visible = substr_replace(
                $visible,
                preg_replace('/[^\r\n]/', ' ', substr($visible, $start, $length)),
                $start,
                $length,
            );
        };
        preg_match_all('/[^\n]*\n|[^\n]+$/', $source, $lines, PREG_OFFSET_CAPTURE);
        $fence = null;
        foreach ($lines[0] as [$raw, $offset]) {
            $line = preg_replace('/\r?\n$/', '', $raw);
            preg_match('/^ {0,3}(`{3,}|~{3,})(.*)$/', $line, $opening);
            if ($fence) {
                $mask($offset, strlen($raw));
                if (
                    preg_match(
                        '/^ {0,3}' . $fence[0] . '{' . strlen($fence) . ',}[ \t\r]*$/D',
                        $line,
                    )
                ) {
                    $fence = null;
                }
            } elseif ($opening && ($opening[1][0] !== '`' || !str_contains($opening[2], '`'))) {
                $fence = $opening[1];
                $mask($offset, strlen($raw));
            } elseif (preg_match('/^(?: {4}|\t|:::mbb:)/', $line)) {
                $mask($offset, strlen($raw));
            }
        }
        if (
            preg_match('/\A---\r?\nmarkbridge: 1\r?\n[\s\S]*?^---(?:\r?\n|$)/m', $source, $header)
        ) {
            $mask(0, strlen($header[0]));
        }
        preg_match_all('/(`+)([\s\S]*?)\1(?!`)/', $visible, $codes, PREG_OFFSET_CAPTURE);
        foreach ($codes[0] as [$code, $offset]) {
            $mask($offset, strlen($code));
        }
        preg_match_all(
            '~<!--[\s\S]*?-->|<(pre|code)\b[^>]*>[\s\S]*?</\1\s*>~i',
            $visible,
            $codes,
            PREG_OFFSET_CAPTURE,
        );
        foreach ($codes[0] as [$code, $offset]) {
            $mask($offset, strlen($code));
        }
        $visible = str_replace("\r", "\n", str_replace("\r\n", " \n", $visible));
        $decode = static fn(string $value): string => html_entity_decode(
            preg_replace('/\\\\([!"#$%&\'()*+,\-.\/:;<=>?@\[\\\\\]^_`{|}~])/', '$1', $value),
            ENT_QUOTES | ENT_HTML5,
            'UTF-8',
        );
        $label = static fn(string $value): string => mb_strtoupper(
            trim(preg_replace('/\s+/u', ' ', $value)),
            'UTF-8',
        );
        $destination = '(?:<((?:\\\\.|[^\\\\<>\r\n])*)>|((?:\\\\.|[^\\\\\s()])+))';
        $title = '([ \t]+(?:"[^"\r\n]*"|\'[^\'\r\n]*\'|\([^\r\n]*\)))?';
        preg_match_all(
            '/^ {0,3}\[([^\]\r\n]+)\]:[ \t]*' . $destination . $title . '[ \t]*$/m',
            $visible,
            $defs,
            PREG_SET_ORDER | PREG_UNMATCHED_AS_NULL,
        );
        $definitions = [];
        foreach ($defs as $def) {
            $key = $label($def[1]);
            if (!isset($definitions[$key])) {
                $definitions[$key] = [
                    'url' => $decode($def[2] ?? $def[3]),
                    'title' => $def[4] ?? '',
                ];
            }
        }
        preg_match_all(
            '/!\[((?:\\\\.|[^\\\\\]\r\n])*)\](?:\([ \t]*' .
                $destination .
                $title .
                '[ \t]*\)|\[([^\]\r\n]*)\])?/',
            $visible,
            $matches,
            PREG_SET_ORDER | PREG_OFFSET_CAPTURE | PREG_UNMATCHED_AS_NULL,
        );
        $edits = [];
        foreach ($matches as $item) {
            [$text, $start] = $item[0];
            if ($start && $source[$start - 1] === '\\') {
                continue;
            }
            $ref =
                $item[2][0] === null && $item[3][0] === null
                    ? $definitions[$label($item[5][0] ?? '' ?: $item[1][0])] ?? null
                    : null;
            $url = $ref['url'] ?? $decode($item[2][0] ?? ($item[3][0] ?? ''));
            if (!isset($map[$url])) {
                continue;
            }
            if ($ref) {
                $alt = substr($source, $start + 2, strlen($item[1][0]));
                $edits[] = [
                    'start' => $start,
                    'end' => $start + strlen($text),
                    'value' => '![' . $alt . '](' . $map[$url] . $ref['title'] . ')',
                ];
            } else {
                $range = $item[$item[2][0] === null ? 3 : 2];
                $edits[] = [
                    'start' => $range[1],
                    'end' => $range[1] + strlen($range[0]),
                    'value' => $map[$url],
                ];
            }
        }
        preg_match_all(
            '~<img\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>~i',
            $visible,
            $images,
            PREG_OFFSET_CAPTURE,
        );
        foreach ($images[0] as [$text, $start]) {
            $original = substr($source, $start, strlen($text));
            $value = preg_replace_callback(
                '~(\s+src\s*=\s*)(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))~i',
                static function ($item) use ($map, $decode) {
                    $url = $decode(
                        $item[2] !== ''
                            ? $item[2]
                            : (($item[3] ?? '') !== ''
                                ? $item[3]
                                : $item[4] ?? ''),
                    );
                    if (!isset($map[$url])) {
                        return $item[0];
                    }
                    $quote = substr($item[0], strlen($item[1]), 1);
                    $quoted = $quote === '"' || $quote === "'";
                    return substr($item[0], 0, strlen($item[1]) + ($quoted ? 1 : 0)) .
                        $map[$url] .
                        ($quoted ? $quote : '');
                },
                $original,
            );
            if ($value !== $original) {
                $edits[] = ['start' => $start, 'end' => $start + strlen($text), 'value' => $value];
            }
        }
        usort($edits, static fn($a, $b) => $b['start'] <=> $a['start']);
        $end = strlen($source);
        $result = $source;
        foreach ($edits as $edit) {
            if ($edit['end'] > $end) {
                throw new ConversionError('EXPORT_PROJECTION', 'Overlapping image syntax');
            }
            $result = substr_replace(
                $result,
                $edit['value'],
                $edit['start'],
                $edit['end'] - $edit['start'],
            );
            $end = $edit['start'];
        }
        return $result;
    }
}
