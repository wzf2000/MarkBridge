<?php
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
require_once __DIR__ . '/technical.php';
function mbb_static_export_fragment(string $html): array
{
    $doc = new DOMDocument('1.0', 'UTF-8');
    $old = libxml_use_internal_errors(true);
    try {
        $doc->loadHTML(
            '<?xml encoding="UTF-8"?><div id="mbb-static-root">' . $html . '</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET,
        );
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($old);
    }
    $xpath = new DOMXPath($doc);
    $root = $xpath->query('//*[@id="mbb-static-root"]')->item(0);
    if (!$root) {
        mbb_export_throw('export_html', mbb_t('The static article could not be parsed'));
    }
    return [$doc, $xpath, $root];
}
function mbb_static_export_url(string $url): bool
{
    if (preg_match('/[\x00-\x20\x7f\\\\]/', $url)) {
        return false;
    }
    if (str_starts_with($url, '#')) {
        return strlen($url) > 1;
    }
    $p = parse_url($url);
    return is_array($p) &&
        in_array(strtolower($p['scheme'] ?? ''), ['http', 'https', 'mailto'], true) &&
        !isset($p['user']) &&
        !isset($p['pass']) &&
        (strtolower($p['scheme'] ?? '') === 'mailto' || !empty($p['host']));
}
function mbb_static_export_body(string $serialized): string
{
    // Canonical HTML only: never call arbitrary render_block/the_content filters.
    $html = preg_replace('/<!--[\s\S]*?-->/', '', $serialized);
    [$doc, $xpath, $root] = mbb_static_export_fragment($html);
    foreach (
        iterator_to_array(
            $xpath->query(
                './/*[contains(concat(" ",normalize-space(@class)," ")," mbb-component-params ") or contains(concat(" ",normalize-space(@class)," ")," wp-block-mbb-frontmatter ")]',
                $root,
            ),
        )
        as $n
    ) {
        $n->parentNode->removeChild($n);
    }
    // Deterministic, collision-free footnote identity local to this saved snapshot.
    $prefix = 'mbb-static-fn-';
    $suffix = 0;
    while ($xpath->query('.//*[@id and starts-with(@id,"' . $prefix . '")]', $root)->length) {
        $prefix = 'mbb-static-fn-' . ++$suffix . '-';
    }
    $definitions = [];
    foreach ($xpath->query('.//li[@data-mbb-footnote]', $root) as $n) {
        $definitions[$n->getAttribute('data-mbb-footnote')] = $n;
    }
    $numbers = [];
    $refs = [];
    foreach (iterator_to_array($xpath->query('.//span[@data-mbb-footnote]', $root)) as $n) {
        $label = $n->getAttribute('data-mbb-footnote');
        if (!isset($definitions[$label])) {
            mbb_export_throw(
                'export_html',
                mbb_t('The static article contains an unresolved footnote'),
            );
        }
        if (!isset($numbers[$label])) {
            $numbers[$label] = count($numbers) + 1;
        }
        $number = $numbers[$label];
        $refId = $prefix . 'ref-' . $number . '-' . (count($refs[$label] ?? []) + 1);
        $a = $doc->createElement('a', (string) $number);
        $a->setAttribute('href', '#' . $prefix . $number);
        $a->setAttribute('id', $refId);
        $n->parentNode->replaceChild($a, $n);
        $refs[$label][] = $refId;
    }
    if (count($numbers) !== count($definitions)) {
        mbb_export_throw(
            'export_html',
            mbb_t('The static article contains an unresolved footnote'),
        );
    }
    foreach ($numbers as $label => $number) {
        $n = $definitions[$label];
        $n->parentNode->appendChild($n);
        if (!isset($numbers[$label])) {
            mbb_export_throw(
                'export_html',
                mbb_t('The static article contains an unresolved footnote'),
            );
        }
        $n->setAttribute('id', $prefix . $numbers[$label]);
        foreach ($refs[$label] as $id) {
            $a = $doc->createElement('a', ' ↩');
            $a->setAttribute('href', '#' . $id);
            $n->appendChild($a);
        }
    }
    $html = '';
    foreach ($root->childNodes as $n) {
        $html .= $doc->saveHTML($n);
    }
    if (function_exists('mbb_render_technical')) {
        $html = mbb_render_technical($html);
    }
    [$doc, $xpath, $root] = mbb_static_export_fragment($html);
    $allowed = explode(
        ' ',
        'p h1 h2 h3 h4 h5 h6 div section figure figcaption blockquote ul ol li pre code strong em del s sub sup span a img hr br table thead tbody tfoot tr th td details summary font',
    );
    foreach (iterator_to_array($xpath->query('.//*', $root)) as $n) {
        if (!in_array($n->tagName, $allowed, true)) {
            mbb_export_throw(
                'export_html',
                mbb_t('The article contains content outside the static HTML subset'),
            );
        }
        if ($n->tagName === 'details') {
            $n->setAttribute('open', '');
        }
        foreach (iterator_to_array($n->attributes) as $a) {
            $key = $a->name;
            $value = $a->value;
            if ($key === 'href') {
                if (!mbb_static_export_url($value)) {
                    mbb_export_throw('export_html', mbb_t('A static article link is unsafe'));
                }
                continue;
            }
            if (
                $key === 'rel' &&
                $n->tagName === 'a' &&
                preg_match('/^(?:noreferrer|noopener)(?: (?:noreferrer|noopener))?$/D', $value)
            ) {
                continue;
            }
            if (
                $key === 'value' &&
                $n->tagName === 'li' &&
                preg_match('/^[1-9][0-9]?$/D', $value) &&
                (int) $value <= 64
            ) {
                continue;
            }
            if ($key === 'src' && $n->tagName === 'img') {
                continue;
            }
            if ($key === 'style') {
                if (preg_match('/url\s*\(|@|expression|behavior|[<>\\\\]/i', $value)) {
                    mbb_export_throw(
                        'export_html',
                        mbb_t('The article contains an unsafe inline style'),
                    );
                }
                continue;
            }
            if ($key === 'data-mbb-tex' && $n->tagName === 'span') {
                continue;
            }
            if (
                in_array(
                    $key,
                    [
                        'class',
                        'id',
                        'title',
                        'alt',
                        'width',
                        'height',
                        'colspan',
                        'rowspan',
                        'start',
                        'open',
                        'lang',
                        'dir',
                        'role',
                        'hidden',
                        'color',
                        'size',
                        'face',
                    ],
                    true,
                ) ||
                preg_match('/^aria-[a-z-]+$/D', $key)
            ) {
                continue;
            }
            if (str_starts_with($key, 'data-') || $key === 'tabindex') {
                $n->removeAttribute($key);
                continue;
            }
            mbb_export_throw('export_html', mbb_t('The article contains an unsafe HTML attribute'));
        }
    }
    // Remove all remaining comments/processing instructions rather than leaking block metadata.
    foreach (
        iterator_to_array($xpath->query('.//comment() | .//processing-instruction()', $root))
        as $n
    ) {
        $n->parentNode->removeChild($n);
    }
    $out = '';
    foreach ($root->childNodes as $n) {
        $out .= $doc->saveHTML($n);
    }
    return $out;
}
function mbb_static_export_descriptor(
    array $snapshot,
    array $files,
    array $resources,
    array $mappings,
): array {
    $body = mbb_static_export_body($snapshot['document']['serialized']);
    $images = [];
    $encodedBytes =
        strlen($body) +
        strlen(
            file_get_contents(__DIR__ . '/static-export.css') .
                file_get_contents(__DIR__ . '/preview-media.css'),
        );
    foreach ($files as $path => $file) {
        $bytes = file_get_contents($file['file']);
        if (
            !is_string($bytes) ||
            strlen($bytes) > 8388608 ||
            !hash_equals($file['sha256'], hash('sha256', $bytes))
        ) {
            mbb_export_throw('export_changed', mbb_t('An image changed during static export'));
        }
        $resource = current(array_filter($resources, fn($r) => $r['path'] === $path));
        $encodedBytes += 4 * intdiv(strlen($bytes) + 2, 3);
        if ($encodedBytes > 33554432) {
            mbb_export_throw(
                'export_size',
                mbb_t('The static HTML descriptor exceeds 32 MiB. Content was not truncated'),
            );
        }
        $images[] = [
            'key' => $file['sha256'],
            'mime' => $resource['mime'],
            'bytes' => strlen($bytes),
            'data' => base64_encode($bytes),
        ];
    }
    $map = [];
    foreach ($mappings as $m) {
        $map[$m['from']] = 'mbb-static:' . pathinfo(basename($m['to']), PATHINFO_FILENAME);
    }
    [$doc, $xpath, $root] = mbb_static_export_fragment($body);
    foreach ($xpath->query('.//img', $root) as $n) {
        $src = $n->getAttribute('src');
        if (!isset($map[$src])) {
            mbb_export_throw(
                'export_images',
                mbb_t(
                    'Static HTML requires every image to be a verified local attachment of this article',
                ),
            );
        }
        $n->setAttribute('src', $map[$src]);
        $n->removeAttribute('class');
    }
    $body = '';
    foreach ($root->childNodes as $n) {
        $body .= $doc->saveHTML($n);
    }
    $lang = function_exists('get_bloginfo')
        ? str_replace('_', '-', get_bloginfo('language'))
        : 'en';
    if (!preg_match('/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/D', $lang)) {
        $lang = 'en';
    }
    $value = [
        'schema' => 1,
        'kind' => 'markbridge-static',
        'title' => strip_tags($snapshot['post']->post_title),
        'lang' => $lang,
        'body' => $body,
        'css' =>
            file_get_contents(__DIR__ . '/static-export.css') .
            file_get_contents(__DIR__ . '/preview-media.css'),
        'images' => $images,
    ];
    $json = mbb_component_json($value);
    if (strlen($json) > 33554432) {
        mbb_export_throw(
            'export_size',
            mbb_t('The static HTML descriptor exceeds 32 MiB. Content was not truncated'),
        );
    }
    return $value;
}
