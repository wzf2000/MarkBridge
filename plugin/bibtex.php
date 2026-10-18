<?php
/** Pure bounded BibTeX mapping. No database writes, remote lookups, or executable TeX. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
final class MBB_BibTeX_Error extends RuntimeException
{
    public function __construct(public string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}
function mbb_bibtex_fail(string $code, string $message): never
{
    throw new MBB_BibTeX_Error($code, $message);
}
function mbb_bibtex_validate(array $entries): void
{
    if (!class_exists('MarkBridge\\Probe\\Technical')) {
        require_once __DIR__ . '/includes/php-converter/Worker.php';
    }
    \MarkBridge\Probe\Technical::attrs('bibliography', ['entries' => $entries]);
}
function mbb_bibtex_plain(string $raw): string
{
    $accents = [
        "'" => "\u{0301}",
        '`' => "\u{0300}",
        '"' => "\u{0308}",
        '^' => "\u{0302}",
        '~' => "\u{0303}",
        '=' => "\u{0304}",
        '.' => "\u{0307}",
        'c' => "\u{0327}",
        'v' => "\u{030c}",
        'u' => "\u{0306}",
        'H' => "\u{030b}",
    ];
    $commands = [
        'TeX' => 'TeX',
        'LaTeX' => 'LaTeX',
        'ae' => 'æ',
        'AE' => 'Æ',
        'oe' => 'œ',
        'OE' => 'Œ',
        'aa' => 'å',
        'AA' => 'Å',
        'o' => 'ø',
        'O' => 'Ø',
        'ss' => 'ß',
    ];
    $out = '';
    $bad = static fn() => mbb_bibtex_fail(
        'BIBTEX_TEX',
        'Unsupported TeX command or math in BibTeX',
    );
    for ($i = 0; $i < strlen($raw); $i++) {
        $c = $raw[$i];
        if ($c === '{' || $c === '}') {
            continue;
        }
        if ($c === '$') {
            $bad();
        }
        if ($c !== '\\') {
            $out .= $c === '~' ? ' ' : $c;
            continue;
        }
        $next = $raw[++$i] ?? '';
        if ($next !== '' && str_contains('&%$#_{}', $next)) {
            $out .= $next;
            continue;
        }
        if (isset($accents[$next])) {
            if (
                preg_match('/^[A-Za-z]$/D', $next) &&
                preg_match('/^[A-Za-z]$/D', $raw[$i + 1] ?? '')
            ) {
                $bad();
            }
            while (($raw[$i + 1] ?? '') === ' ') {
                $i++;
            }
            $grouped = ($raw[$i + 1] ?? '') === '{';
            if ($grouped) {
                $i++;
            }
            if (!preg_match('/\G\p{L}/u', $raw, $m, 0, $i + 1)) {
                $bad();
            }
            $letter = $m[0];
            $i += strlen($letter);
            if ($grouped && ($raw[++$i] ?? '') !== '}') {
                $bad();
            }
            if (!class_exists('Normalizer')) {
                mbb_bibtex_fail(
                    'BIBTEX_TEX',
                    'BibTeX accent conversion requires Unicode normalization',
                );
            }
            $out .= Normalizer::normalize($letter . $accents[$next], Normalizer::FORM_C);
            continue;
        }
        $command = $next;
        while (preg_match('/^[A-Za-z]$/D', $raw[$i + 1] ?? '')) {
            $command .= $raw[++$i];
        }
        if (!isset($commands[$command])) {
            $bad();
        }
        $out .= $commands[$command];
        if (substr($raw, $i + 1, 2) === '{}') {
            $i += 2;
        }
    }
    return trim(
        preg_replace(
            '/[ \t\r\n\f\v\x{0085}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]+/u',
            ' ',
            $out,
        ),
    );
}
function mbb_bibtex_authors(string $raw): array
{
    $depth = 0;
    $start = 0;
    $values = [];
    for ($i = 0; $i < strlen($raw); $i++) {
        if ($raw[$i] === '\\') {
            $i++;
            continue;
        }
        if ($raw[$i] === '{') {
            $depth++;
        } elseif ($raw[$i] === '}') {
            $depth--;
        }
        if (
            !$depth &&
            ($i > 0 && str_contains(" \t\r\n\f\v", $raw[$i - 1])) &&
            preg_match('/^and(?=[ \t\r\n\f\v])/i', substr($raw, $i))
        ) {
            $values[] = substr($raw, $start, $i - $start);
            $i += 2;
            $start = $i + 1;
        }
    }
    $values[] = substr($raw, $start);
    if (count($values) > 8) {
        mbb_bibtex_fail('BIBTEX_AUTHORS', 'BibTeX entries support at most eight authors');
    }
    return array_map('mbb_bibtex_plain', $values);
}
function mbb_bibtex_parse(string $input): array
{
    if (
        strlen($input) > 65536 ||
        !mb_check_encoding($input, 'UTF-8') ||
        preg_match('/[\x00-\x08\x0e-\x1f\x7f]/', $input)
    ) {
        mbb_bibtex_fail('BIBTEX_LIMIT', 'BibTeX input must be UTF-8 text within 64 KiB');
    }
    $s = str_starts_with($input, "\xef\xbb\xbf") ? substr($input, 3) : $input;
    $at = 0;
    $entries = [];
    $bad = static fn() => mbb_bibtex_fail(
        'BIBTEX_SYNTAX',
        'BibTeX is outside the supported bounded data subset',
    );
    $skip = static function () use (&$at, $s) {
        while ($at < strlen($s)) {
            if (str_contains(" \t\r\n\f\v", $s[$at])) {
                $at++;
            } elseif ($s[$at] === '%') {
                while ($at < strlen($s) && $s[$at] !== "\n") {
                    $at++;
                }
            } else {
                break;
            }
        }
    };
    $take = static function ($c) use (&$at, $s, $skip, $bad) {
        $skip();
        if (($s[$at++] ?? '') !== $c) {
            $bad();
        }
    };
    $word = static function () use (&$at, $s, $skip, $bad) {
        $skip();
        if (!preg_match('/\G[A-Za-z][A-Za-z0-9_-]*/A', $s, $m, 0, $at)) {
            $bad();
        }
        $at += strlen($m[0]);
        return $m[0];
    };
    $value = static function ($field) use (&$at, $s, $skip, $bad) {
        $skip();
        $open = $s[$at++] ?? '';
        if ($open !== '{' && $open !== '"') {
            $at--;
            if ($field !== 'year' || !preg_match('/\G\d+/A', $s, $m, 0, $at)) {
                $bad();
            }
            $at += strlen($m[0]);
            return $m[0];
        }
        $raw = '';
        $depth = 0;
        while ($at < strlen($s)) {
            $c = $s[$at++];
            if ($c === '\\') {
                if ($at === strlen($s)) {
                    $bad();
                }
                $raw .= $c . $s[$at++];
                continue;
            }
            if ($c === '{') {
                if (++$depth > 16) {
                    $bad();
                }
                $raw .= $c;
                continue;
            }
            if ($c === '}') {
                if (!$depth) {
                    if ($open === '{') {
                        return $raw;
                    }
                    $bad();
                }
                $depth--;
                $raw .= $c;
                continue;
            }
            if ($c === '"' && $open === '"' && !$depth) {
                return $raw;
            }
            $raw .= $c;
        }
        $bad();
    };
    while (true) {
        $skip();
        if ($at === strlen($s)) {
            break;
        }
        $take('@');
        $type = strtolower($word());
        if (!in_array($type, ['article', 'book', 'inproceedings', 'misc'], true)) {
            $bad();
        }
        $skip();
        $open = $s[$at++] ?? '';
        if (!in_array($open, ['{', '('], true)) {
            $bad();
        }
        $close = $open === '{' ? '}' : ')';
        $key = $word();
        if (strlen($key) > 64) {
            $bad();
        }
        $take(',');
        $fields = [];
        while (true) {
            $skip();
            if (($s[$at] ?? '') === $close) {
                $at++;
                break;
            }
            $name = strtolower($word());
            if (
                !in_array(
                    $name,
                    [
                        'author',
                        'title',
                        'year',
                        'journal',
                        'booktitle',
                        'publisher',
                        'doi',
                        'url',
                        'volume',
                        'number',
                        'pages',
                    ],
                    true,
                ) ||
                array_key_exists($name, $fields)
            ) {
                $bad();
            }
            $take('=');
            $fields[$name] = $value($name);
            $skip();
            if (($s[$at] ?? '') === ',') {
                $at++;
                continue;
            }
            if (($s[$at] ?? '') === $close) {
                $at++;
                break;
            }
            $bad();
        }
        if (!array_key_exists('title', $fields)) {
            $bad();
        }
        $f = [];
        foreach ($fields as $k => $v) {
            $f[$k] = $k === 'author' ? $v : mbb_bibtex_plain($v);
            if ($k !== 'author' && $f[$k] === '') {
                $bad();
            }
        }
        if (isset($f['year']) && !preg_match('/^\d{1,4}$/D', $f['year'])) {
            $bad();
        }
        $doi = $f['doi'] ?? '';
        if ($doi !== '') {
            $doi = preg_replace('~^https://doi\.org/~i', '', $doi);
            if (!preg_match('~^10\.\d{4,9}/[-._;()/:A-Za-z0-9]+$~D', $doi)) {
                mbb_bibtex_fail('BIBTEX_DOI', 'BibTeX DOI values must be bounded DOI identifiers');
            }
        }
        $parts = [];
        foreach (
            [
                'journal' => 'Journal',
                'booktitle' => 'Book title',
                'publisher' => 'Publisher',
                'volume' => 'Volume',
                'number' => 'Number',
                'pages' => 'Pages',
            ]
            as $field => $label
        ) {
            if (array_key_exists($field, $f)) {
                $parts[] = $label . ': ' . $f[$field];
            }
        }
        if ($doi !== '' && isset($f['url'])) {
            $parts[] = 'DOI: ' . $doi;
        }
        $entries[] = [
            'key' => $key,
            'authors' => isset($f['author']) ? mbb_bibtex_authors($f['author']) : [],
            'title' => $f['title'],
            'year' => $f['year'] ?? '',
            'source' => implode('; ', $parts),
            'url' => $f['url'] ?? ($doi !== '' ? 'https://doi.org/' . $doi : ''),
        ];
        if (count($entries) > 64) {
            mbb_bibtex_fail('BIBTEX_LIMIT', 'BibTeX supports one to 64 entries');
        }
    }
    mbb_bibtex_validate($entries);
    return $entries;
}
function mbb_bibtex_candidate(
    array $existing,
    array $incoming,
    string $mode,
    array $referencedKeys = [],
): array {
    if (
        !in_array($mode, ['merge', 'replace'], true) ||
        count($referencedKeys) > 64 ||
        array_filter(
            $referencedKeys,
            fn($key) => !is_string($key) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $key),
        )
    ) {
        mbb_bibtex_fail('BIBTEX_MODE', 'Choose explicit BibTeX merge or replacement');
    }
    $entries = $mode === 'merge' ? array_merge($existing, $incoming) : array_values($incoming);
    mbb_bibtex_validate($entries);
    $keys = array_column($entries, 'key');
    foreach ($referencedKeys as $key) {
        if (!in_array($key, $keys, true)) {
            mbb_bibtex_fail(
                'BIBTEX_REFERENCES',
                'BibTeX replacement must preserve every currently cited key',
            );
        }
    }
    return $entries;
}
