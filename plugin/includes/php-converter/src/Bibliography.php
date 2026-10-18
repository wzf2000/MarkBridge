<?php
namespace MarkBridge\Probe;
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}

/** Closed bibliography data and a finite CSL-JSON interchange subset, without a CSL engine. */
final class Bibliography
{
    public const TYPES = [
        'article-journal',
        'book',
        'chapter',
        'paper-conference',
        'report',
        'thesis',
        'webpage',
        'dataset',
        'software',
        'document',
    ];
    public const FIELDS = [
        'key',
        'type',
        'authors',
        'issued',
        'title',
        'containerTitle',
        'publisher',
        'volume',
        'issue',
        'page',
        'doi',
        'url',
        'identifiers',
        'source',
    ];
    public const IDENTIFIERS = ['ISBN', 'ISSN', 'PMID', 'PMCID'];
    private static function fail(string $code, string $message): never
    {
        throw new ConversionError($code, $message);
    }
    private static function bad(string $message): never
    {
        self::fail('BIBLIOGRAPHY_V2', $message);
    }
    private static function object(mixed $v): ?array
    {
        return $v instanceof \stdClass
            ? get_object_vars($v)
            : (is_array($v) && !array_is_list($v)
                ? $v
                : null);
    }
    private static function closed(mixed $v, array $fields): ?array
    {
        $a = self::object($v);
        if ($a === null) {
            return null;
        }
        $keys = array_keys($a);
        sort($keys);
        sort($fields);
        return $keys === $fields ? $a : null;
    }
    private static function integer(mixed $v): bool
    {
        return (is_int($v) || (is_float($v) && is_finite($v) && floor($v) === $v)) &&
            abs($v) <= 9007199254740991;
    }
    /** JSON safe integers have one decimal spelling across PHP/JS, independent of locale. */
    private static function integerText(int|float $value): string
    {
        return $value == 0 ? '0' : sprintf('%.0F', $value);
    }
    private static function text(mixed $v, int $limit, bool $required = false): bool
    {
        return is_string($v) &&
            mb_check_encoding($v, 'UTF-8') &&
            mb_strlen($v, 'UTF-8') <= $limit &&
            !preg_match('/[\r\n\x00]/', $v) &&
            (!$required || preg_replace('/[\p{Z}\s\x{0085}\x{feff}]/u', '', $v) !== '');
    }
    public static function author(mixed $name): string
    {
        $n = self::object($name) ?? [];
        return $n['literal'] ??
            implode(
                ' ',
                array_filter(
                    array_map(static fn($k) => $n[$k] ?? '', [
                        'given',
                        'droppingParticle',
                        'nonDroppingParticle',
                        'family',
                        'suffix',
                    ]),
                    static fn($s) => $s !== '',
                ),
            );
    }
    public static function name(mixed $value): void
    {
        if ($n = self::closed($value, ['literal'])) {
            if (!self::text($n['literal'], 120, true)) {
                self::bad('A literal author name requires 1–120 plain characters');
            }
            return;
        }
        $n = self::closed($value, [
            'family',
            'given',
            'droppingParticle',
            'nonDroppingParticle',
            'suffix',
        ]);
        if (
            !$n ||
            !self::text($n['family'], 120, true) ||
            array_filter($n, static fn($v) => !self::text($v, 120)) ||
            mb_strlen(self::author($n), 'UTF-8') > 120
        ) {
            self::bad(
                'A structured author requires an explicit family name within the existing 120-character name budget',
            );
        }
    }
    public static function date(mixed $value): void
    {
        if ($n = self::closed($value, ['literal'])) {
            if (!self::text($n['literal'], 64)) {
                self::bad('A literal issue date must be bounded single-line text');
            }
            return;
        }
        $n = self::closed($value, ['date-parts']);
        $parts = $n['date-parts'] ?? null;
        if (!is_array($parts) || !array_is_list($parts) || count($parts) < 1 || count($parts) > 2) {
            self::bad('A structured issue date requires one or two year/month/day parts');
        }
        foreach ($parts as $p) {
            if (
                !is_array($p) ||
                !array_is_list($p) ||
                count($p) < 1 ||
                count($p) > 3 ||
                array_filter($p, static fn($v) => !self::integer($v)) ||
                $p[0] < 1 ||
                $p[0] > 9999 ||
                (count($p) > 1 && ($p[1] < 1 || $p[1] > 12))
            ) {
                self::bad('The structured issue date is invalid');
            }
            if (count($p) > 2 && !checkdate($p[1], $p[2], $p[0])) {
                self::bad('The structured issue date is invalid');
            }
        }
    }
    private static function ipv4(string $host): bool
    {
        $parts = explode('.', $host);
        return count($parts) === 4 &&
            !array_filter(
                $parts,
                static fn($p) => !preg_match('/^(?:0|[1-9][0-9]{0,2})$/D', $p) || (int) $p > 255,
            );
    }
    private static function ipv6(string $host): bool
    {
        if (!str_contains($host, ':') || !preg_match('/^[0-9a-f:.]+$/iD', $host)) {
            return false;
        }
        $sides = explode('::', $host);
        if (count($sides) > 2) {
            return false;
        }
        $groups = [];
        foreach ($sides as $side) {
            if ($side !== '') {
                $groups = array_merge($groups, explode(':', $side));
            }
        }
        $units = 0;
        foreach ($groups as $i => $group) {
            if (str_contains($group, '.')) {
                if (
                    $i !== count($groups) - 1 ||
                    !str_ends_with($host, $group) ||
                    !self::ipv4($group)
                ) {
                    return false;
                }
                $units += 2;
            } else {
                if (!preg_match('/^[0-9a-f]{1,4}$/iD', $group)) {
                    return false;
                }
                $units++;
            }
        }
        return count($sides) === 2 ? $units < 8 : $units === 8;
    }
    public static function url(mixed $value): bool
    {
        if (!self::text($value, 2048)) {
            return false;
        }
        if ($value === '') {
            return true;
        }
        if (
            preg_match('~[\p{Z}\s\x{0085}\x{feff}\x00-\x20\x7f\\\\]~u', $value) ||
            !preg_match('~^https?://([^/?#]+)~i', $value, $match)
        ) {
            return false;
        }
        $authority = $match[1];
        $bracketed = str_starts_with($authority, '[');
        if (
            !preg_match(
                $bracketed ? '~^\[([^\]]+)\](?::([0-9]+))?$~D' : '~^([^:]+)(?::([0-9]+))?$~D',
                $authority,
                $parts,
            )
        ) {
            return false;
        }
        if (isset($parts[2])) {
            $port = ltrim($parts[2], '0') ?: '0';
            if (strlen($port) > 5 || (int) $port > 65535) {
                return false;
            }
        }
        if ($bracketed) {
            return self::ipv6($parts[1]);
        }
        if (preg_match('/%(?![0-9a-f]{2})/i', $parts[1])) {
            return false;
        }
        $host = rawurldecode($parts[1]);
        if (
            $host === '' ||
            !mb_check_encoding($host, 'UTF-8') ||
            preg_match('~[\p{Z}\s\x{0085}\x{feff}\x00-\x20\x7f#/:<>?@\[\]\\\\^|%]~u', $host)
        ) {
            return false;
        }
        return preg_match('/^[0-9.]+$/D', $host)
            ? self::ipv4(preg_replace('/\.$/D', '', $host))
            : true;
    }
    public static function entry(mixed $value): array
    {
        $e = self::closed($value, self::FIELDS);
        if (
            !$e ||
            !Technical::id($e['key']) ||
            !in_array($e['type'], self::TYPES, true) ||
            !is_array($e['authors']) ||
            !array_is_list($e['authors']) ||
            count($e['authors']) > 8 ||
            !self::text($e['title'], 512, true)
        ) {
            self::bad(
                'Bibliography v2 entries require closed fields, a stable key, a supported type and a title',
            );
        }
        foreach ($e['authors'] as $n) {
            self::name($n);
        }
        self::date($e['issued']);
        foreach (['containerTitle', 'publisher', 'source'] as $k) {
            if (!self::text($e[$k], 512)) {
                self::bad('Publication and source fields are limited to 512 plain characters');
            }
        }
        foreach (['volume', 'issue', 'page'] as $k) {
            if (!self::text($e[$k], 128)) {
                self::bad('Volume, issue and pages are limited to 128 plain characters');
            }
        }
        if (
            !self::text($e['doi'], 512) ||
            ($e['doi'] !== '' &&
                !preg_match('~^10\.[0-9]{4,9}/[A-Za-z0-9\-._;()/:]+$~D', $e['doi']))
        ) {
            self::bad('A DOI must be a bounded supported DOI identifier, without a URL prefix');
        }
        if (!self::url($e['url'])) {
            self::bad('Bibliography URLs must use absolute HTTP or HTTPS without credentials');
        }
        $ids = self::closed($e['identifiers'], self::IDENTIFIERS);
        if (!$ids || array_filter($ids, static fn($v) => !self::text($v, 128))) {
            self::bad(
                'Bibliography identifiers require bounded ISBN, ISSN, PMID and PMCID text fields',
            );
        }
        return $e;
    }
    public static function attrs(array $a): array
    {
        $es = $a['entries'] ?? null;
        if (
            !in_array($a['style'] ?? null, ['author-year', 'numeric'], true) ||
            !is_array($es) ||
            !array_is_list($es) ||
            !count($es) ||
            count($es) > 64 ||
            strlen(Teaching::encode($es)) > 65536
        ) {
            self::bad(
                'Bibliography v2 requires a fixed supported style and 1–64 entries within 64 KiB',
            );
        }
        $keys = [];
        foreach ($es as $e) {
            $e = self::entry($e);
            if (isset($keys[$e['key']])) {
                self::bad('Bibliography keys must be unique');
            }
            $keys[$e['key']] = true;
        }
        if (array_key_exists('origins', $a)) {
            if (
                !is_array($a['origins']) ||
                !array_is_list($a['origins']) ||
                count($a['origins']) > 64
            ) {
                self::bad('Bibliography origins require at most 64 closed source declarations');
            }
            $linked = [];
            foreach ($a['origins'] as $value) {
                $o = self::closed($value, ['key', 'namespace', 'item', 'version', 'hash']);
                if (
                    !$o ||
                    !is_string($o['key']) ||
                    !isset($keys[$o['key']]) ||
                    isset($linked[$o['key']]) ||
                    !is_string($o['namespace']) ||
                    !preg_match('/^L_[a-f0-9]{32}$/D', $o['namespace']) ||
                    !is_string($o['item']) ||
                    !preg_match('/^I_[a-f0-9]{32}$/D', $o['item']) ||
                    !self::integer($o['version']) ||
                    $o['version'] < 1 ||
                    !is_string($o['hash']) ||
                    !preg_match('/^[a-f0-9]{64}$/D', $o['hash'])
                ) {
                    self::bad(
                        'Bibliography origins require unique existing keys and bounded opaque source versions',
                    );
                }
                $linked[$o['key']] = true;
            }
        }
        return $a;
    }
    /** Same canonical UTF-8 JSON as bibliographyEntryCanonical; article key is excluded. */
    public static function canonical(mixed $entry): string
    {
        $entry = self::entry($entry);
        unset($entry['key']);
        $order = static function ($value) use (&$order) {
            if ($value instanceof \stdClass) {
                $value = get_object_vars($value);
            }
            if (!is_array($value)) {
                return $value;
            }
            if (!array_is_list($value)) {
                ksort($value, SORT_STRING);
            }
            return array_map($order, $value);
        };
        return json_encode(
            $order($entry),
            JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES |
                JSON_UNESCAPED_LINE_TERMINATORS |
                JSON_THROW_ON_ERROR,
        );
    }
    public static function hash(mixed $entry): string
    {
        return hash('sha256', self::canonical($entry));
    }
    public static function empty(string $key): array
    {
        return [
            'key' => $key,
            'type' => 'document',
            'authors' => [],
            'issued' => ['literal' => ''],
            'title' => '',
            'containerTitle' => '',
            'publisher' => '',
            'volume' => '',
            'issue' => '',
            'page' => '',
            'doi' => '',
            'url' => '',
            'identifiers' => array_fill_keys(self::IDENTIFIERS, ''),
            'source' => '',
        ];
    }
    public static function migrate(array $entries): array
    {
        return array_map(static function ($v) {
            $e = (array) $v;
            return array_replace(self::empty($e['key']), [
                'authors' => array_map(static fn($n) => ['literal' => $n], $e['authors']),
                'issued' => ['literal' => $e['year']],
                'title' => $e['title'],
                'source' => $e['source'],
                'url' => $e['url'],
            ]);
        }, $entries);
    }
    public static function year(mixed $issued): string
    {
        $d = (array) $issued;
        if (array_key_exists('literal', $d)) {
            return $d['literal'];
        }
        $ys = array_map(static fn($p) => (string) $p[0], $d['date-parts']);
        return implode('–', array_values(array_unique($ys)));
    }
    public static function projection(mixed $entry): array
    {
        $e = (array) $entry;
        $d = (array) $e['issued'];
        $year = self::year($d);
        $date =
            $d['literal'] ??
            implode(
                '–',
                array_map(
                    static fn($p) => implode(
                        '-',
                        array_map(
                            static fn($v, $i) => $i
                                ? str_pad((string) $v, 2, '0', STR_PAD_LEFT)
                                : (string) $v,
                            $p,
                            array_keys($p),
                        ),
                    ),
                    $d['date-parts'],
                ),
            );
        $ids = (array) $e['identifiers'];
        $parts = [
            $e['containerTitle'],
            $e['publisher'],
            $e['volume'] !== '' ? 'vol. ' . $e['volume'] : '',
            $e['issue'] !== '' ? 'no. ' . $e['issue'] : '',
            $e['page'] !== '' ? 'pp. ' . $e['page'] : '',
            $date !== $year ? $date : '',
        ];
        foreach (self::IDENTIFIERS as $k) {
            if ($ids[$k] !== '') {
                $parts[] = $k . ' ' . $ids[$k];
            }
        }
        $parts[] = $e['doi'] !== '' ? 'DOI ' . $e['doi'] : '';
        $parts[] = $e['source'];
        return [
            'key' => $e['key'],
            'authors' => array_map(self::author(...), $e['authors']),
            'title' => $e['title'],
            'year' => $year,
            'source' => implode(' · ', array_filter($parts, static fn($v) => $v !== '')),
            'url' => $e['url'] ?: ($e['doi'] !== '' ? 'https://doi.org/' . $e['doi'] : ''),
        ];
    }
    public static function parseCSL(string $input, array $keyMap = []): array
    {
        if (
            strlen($input) > 65536 ||
            !mb_check_encoding($input, 'UTF-8') ||
            str_contains($input, "\0")
        ) {
            self::fail('CSL_INPUT', 'CSL-JSON input must be UTF-8 JSON within 64 KiB');
        }
        if (str_starts_with($input, "\xEF\xBB\xBF")) {
            $input = substr($input, 3);
        }
        preg_match_all('/"(?:\\\\.|[^"\\\\])*"|[^\s]/', $input, $m);
        $stack = [];
        $tokens = $m[0];
        foreach ($tokens as $i => $t) {
            if ($t === '{' || $t === '[') {
                $stack[] = $t === '{' ? [] : null;
                if (count($stack) > 16) {
                    self::fail('CSL_DEPTH', 'CSL-JSON nesting exceeds sixteen levels');
                }
            } elseif ($t === '}' || $t === ']') {
                array_pop($stack);
            } elseif (
                str_starts_with($t, '"') &&
                ($tokens[$i + 1] ?? '') === ':' &&
                ($stack[count($stack) - 1] ?? null) !== null
            ) {
                try {
                    $key = json_decode($t, true, 32, JSON_THROW_ON_ERROR);
                } catch (\Throwable) {
                    self::fail('CSL_JSON', 'CSL-JSON is invalid');
                }
                $s = count($stack) - 1;
                if (isset($stack[$s][$key])) {
                    self::fail('CSL_JSON', 'CSL-JSON contains a duplicate property');
                }
                $stack[$s][$key] = true;
            }
        }
        try {
            $rows = json_decode($input, false, 32, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            self::fail('CSL_JSON', 'CSL-JSON is invalid');
        }
        $count = 0;
        $walk = function ($v) use (&$walk, &$count) {
            if (++$count > 16384) {
                self::fail('CSL_INPUT', 'CSL-JSON data exceeds its bounded node budget');
            }
            if (is_float($v) && !is_finite($v)) {
                self::fail('CSL_JSON', 'CSL-JSON contains invalid Unicode or a nonfinite number');
            }
            if (is_array($v) || is_object($v)) {
                foreach ($v as $k => $child) {
                    if (
                        is_string($k) &&
                        (mb_strlen($k, 'UTF-8') > 128 || preg_match('/[\x00\r\n]/', $k))
                    ) {
                        self::fail('CSL_JSON', 'CSL-JSON property names are invalid or too long');
                    }
                    $walk($child);
                }
            }
        };
        $walk($rows);
        if (!is_array($rows) || !count($rows) || count($rows) > 64) {
            self::fail('CSL_ITEMS', 'CSL-JSON requires an array of 1–64 records');
        }
        foreach ($keyMap as $k => $v) {
            if (
                !preg_match('/^(?:0|[1-9]\d*)$/D', (string) $k) ||
                (int) $k >= count($rows) ||
                !Technical::id($v)
            ) {
                self::fail('CSL_KEYS', 'CSL-JSON key mappings are invalid');
            }
        }
        $losses = [];
        $mapping = [];
        $ids = [];
        $entries = [];
        $fields = [
            'id',
            'type',
            'author',
            'issued',
            'title',
            'container-title',
            'publisher',
            'volume',
            'issue',
            'page',
            'DOI',
            'URL',
            'ISBN',
            'ISSN',
            'PMID',
            'PMCID',
            'source',
        ];
        $loss = function ($index, $field) use (&$losses) {
            if (count($losses) >= 256) {
                self::fail(
                    'CSL_LOSS',
                    'CSL-JSON has more than 256 unsupported fields; simplify the input before importing',
                );
            }
            $losses[] = ['index' => $index, 'field' => $field];
        };
        foreach ($rows as $index => $r) {
            if (!($r instanceof \stdClass) || !in_array($r->type ?? null, self::TYPES, true)) {
                self::fail('CSL_TYPE', 'A CSL-JSON record has an unsupported or missing type');
            }
            $r = get_object_vars($r);
            $id = $r['id'] ?? null;
            if (!((is_string($id) && $id !== '' && strlen($id) <= 512) || self::integer($id))) {
                self::fail(
                    'CSL_ID',
                    'A CSL-JSON record requires a bounded string or safe integer id',
                );
            }
            $id = is_string($id) ? $id : self::integerText($id);
            if (isset($ids[$id])) {
                self::fail('CSL_ID', 'CSL-JSON record ids are duplicated');
            }
            $ids[$id] = true;
            $key = $keyMap[$index] ?? (Technical::id($id) ? $id : 'reference-' . ($index + 1));
            if (!Technical::id($key)) {
                self::fail('CSL_KEYS', 'A proposed CSL-JSON key is invalid');
            }
            if ($key !== $id) {
                $mapping[] = ['index' => $index, 'from' => $id, 'to' => $key];
            }
            foreach (array_keys($r) as $f) {
                if (!in_array($f, $fields, true)) {
                    $loss($index, $f);
                }
            }
            $e = array_replace(self::empty($key), [
                'type' => $r['type'],
                'title' => $r['title'] ?? null,
            ]);
            if (array_key_exists('author', $r)) {
                if (!is_array($r['author']) || count($r['author']) > 8) {
                    self::fail('CSL_NAMES', 'CSL-JSON supports at most eight authors');
                }
                foreach ($r['author'] as $n => $name) {
                    if (!($name instanceof \stdClass)) {
                        self::fail('CSL_NAMES', 'A CSL-JSON author is invalid');
                    }
                    $name = get_object_vars($name);
                    $allowed = array_key_exists('literal', $name)
                        ? ['literal']
                        : [
                            'family',
                            'given',
                            'dropping-particle',
                            'non-dropping-particle',
                            'suffix',
                        ];
                    foreach (array_keys($name) as $f) {
                        if (!in_array($f, $allowed, true)) {
                            $loss($index, 'author[' . $n . '].' . $f);
                        }
                    }
                    $e['authors'][] = array_key_exists('literal', $name)
                        ? ['literal' => $name['literal']]
                        : [
                            'family' => $name['family'] ?? null,
                            'given' => array_key_exists('given', $name) ? $name['given'] : '',
                            'droppingParticle' => array_key_exists('dropping-particle', $name)
                                ? $name['dropping-particle']
                                : '',
                            'nonDroppingParticle' => array_key_exists(
                                'non-dropping-particle',
                                $name,
                            )
                                ? $name['non-dropping-particle']
                                : '',
                            'suffix' => array_key_exists('suffix', $name) ? $name['suffix'] : '',
                        ];
                }
            }
            if (array_key_exists('issued', $r)) {
                if (!($r['issued'] instanceof \stdClass)) {
                    self::fail('CSL_DATE', 'A CSL-JSON issue date is invalid');
                }
                $d = get_object_vars($r['issued']);
                foreach (array_keys($d) as $f) {
                    if (!in_array($f, ['literal', 'date-parts'], true)) {
                        $loss($index, 'issued.' . $f);
                    }
                }
                if (array_key_exists('literal', $d) && array_key_exists('date-parts', $d)) {
                    self::fail(
                        'CSL_DATE',
                        'Choose a literal date or structured date parts, not both',
                    );
                }
                if (array_key_exists('date-parts', $d) && !is_array($d['date-parts'])) {
                    self::fail('CSL_DATE', 'A CSL-JSON issue date is invalid');
                }
                $e['issued'] = array_key_exists('literal', $d)
                    ? ['literal' => $d['literal']]
                    : (!array_key_exists('date-parts', $d)
                        ? ['literal' => '']
                        : [
                            'date-parts' => array_map(static function ($p) {
                                if (!is_array($p)) {
                                    self::fail('CSL_DATE', 'A CSL-JSON issue date is invalid');
                                }
                                return array_map(
                                    static fn($v) => is_string($v) && preg_match('/^\d{1,4}$/D', $v)
                                        ? (int) $v
                                        : $v,
                                    $p,
                                );
                            }, $d['date-parts']),
                        ]);
            }
            foreach (
                [
                    'container-title' => 'containerTitle',
                    'publisher' => 'publisher',
                    'DOI' => 'doi',
                    'URL' => 'url',
                    'source' => 'source',
                ]
                as $from => $to
            ) {
                if (array_key_exists($from, $r)) {
                    $e[$to] = $r[$from];
                }
            }
            foreach (['volume', 'issue', 'page'] as $f) {
                if (array_key_exists($f, $r)) {
                    if (!is_string($r[$f]) && !self::integer($r[$f])) {
                        self::fail(
                            'CSL_NUMBER',
                            'CSL-JSON numeric fields require text or safe integers',
                        );
                    }
                    $e[$f] = is_string($r[$f]) ? $r[$f] : self::integerText($r[$f]);
                }
            }
            foreach (self::IDENTIFIERS as $f) {
                if (array_key_exists($f, $r)) {
                    $e['identifiers'][$f] = $r[$f];
                }
            }
            self::entry($e);
            $entries[] = $e;
        }
        self::attrs(['style' => 'author-year', 'entries' => $entries]);
        return ['entries' => $entries, 'losses' => $losses, 'keyMappings' => $mapping];
    }
    public static function candidate(
        array $existing,
        array $report,
        string $mode,
        array $referencedKeys,
        bool $ackLoss = false,
        bool $ackKeys = false,
    ): array {
        if (!in_array($mode, ['merge', 'replace'], true)) {
            self::fail('CSL_MODE', 'Choose merge or replace for CSL-JSON import');
        }
        if ($report['losses'] && !$ackLoss) {
            self::fail(
                'CSL_LOSS',
                'Review and explicitly acknowledge unsupported CSL-JSON fields before adopting the candidate',
            );
        }
        if ($report['keyMappings'] && !$ackKeys) {
            self::fail(
                'CSL_KEYS',
                'Review and explicitly acknowledge the proposed citation keys before adopting the candidate',
            );
        }
        $entries =
            $mode === 'merge' ? array_merge($existing, $report['entries']) : $report['entries'];
        self::attrs(['style' => 'author-year', 'entries' => $entries]);
        $keys = array_column($entries, 'key');
        foreach ($referencedKeys as $k) {
            if (!in_array($k, $keys, true)) {
                self::fail('CSL_REFERENCED', 'The replacement would remove currently cited keys');
            }
        }
        return $entries;
    }
    public static function exportCSL(array $entries): array
    {
        self::attrs(['style' => 'author-year', 'entries' => $entries]);
        return array_map(static function ($v) {
            $e = (array) $v;
            $r = ['id' => $e['key'], 'type' => $e['type'], 'title' => $e['title']];
            if ($e['authors']) {
                $r['author'] = array_map(static function ($n) {
                    $n = (array) $n;
                    if (array_key_exists('literal', $n)) {
                        return $n;
                    }
                    $r = [];
                    foreach (
                        [
                            'family' => 'family',
                            'given' => 'given',
                            'dropping-particle' => 'droppingParticle',
                            'non-dropping-particle' => 'nonDroppingParticle',
                            'suffix' => 'suffix',
                        ]
                        as $to => $from
                    ) {
                        if ($n[$from] !== '') {
                            $r[$to] = $n[$from];
                        }
                    }
                    return $r;
                }, $e['authors']);
            }
            $d = (array) $e['issued'];
            if (!array_key_exists('literal', $d) || $d['literal'] !== '') {
                $r['issued'] = $e['issued'];
            }
            foreach (
                [
                    'container-title' => 'containerTitle',
                    'publisher' => 'publisher',
                    'volume' => 'volume',
                    'issue' => 'issue',
                    'page' => 'page',
                    'DOI' => 'doi',
                    'URL' => 'url',
                    'source' => 'source',
                ]
                as $to => $from
            ) {
                if ($e[$from] !== '') {
                    $r[$to] = $e[$from];
                }
            }
            $ids = (array) $e['identifiers'];
            foreach (self::IDENTIFIERS as $k) {
                if ($ids[$k] !== '') {
                    $r[$k] = $ids[$k];
                }
            }
            return $r;
        }, $entries);
    }
}
