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
/** External images become explicit links; never fetch or embed them. */
function mbb_static_export_external_url(string $url): bool
{
    if (!mbb_static_export_url($url)) {
        return false;
    }
    $parts = parse_url($url);
    $home = function_exists('home_url') ? parse_url(home_url('/')) : false;
    return is_array($parts) &&
        is_array($home) &&
        in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) &&
        !empty($parts['host']) &&
        !empty($home['host']) &&
        strtolower($parts['host']) !== strtolower($home['host']);
}
function mbb_static_export_styles(): string
{
    return file_get_contents(__DIR__ . '/projections.css') .
        "\n" .
        file_get_contents(__DIR__ . '/static-export.css') .
        "\n" .
        file_get_contents(__DIR__ . '/technical.css') .
        "\n" .
        file_get_contents(__DIR__ . '/media-presentation.css');
}
function mbb_static_export_body(
    string $serialized,
    array $referenceMap = [],
    array $numbering = [],
): string {
    // Canonical HTML only: never call arbitrary render_block/the_content filters.
    $html = preg_replace('/<!--[\s\S]*?-->/', '', $serialized);
    [$doc, $xpath, $root] = mbb_static_export_fragment($html);
    // Static snapshots retain version anchors, rather than runtime-only line fragments.
    $lineTargets = [];
    preg_match_all('/<!-- wp:mbb\/code-tabs (\{[^\r\n]*\}) -->/', $serialized, $codeGroups);
    foreach ($codeGroups[1] as $rawGroup) {
        $group = json_decode($rawGroup, true);
        if (
            !is_array($group) ||
            !in_array($group['version'] ?? null, [1, 2], true) ||
            !is_string($group['id'] ?? null) ||
            !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $group['id']) ||
            !is_array($group['tabs'] ?? null)
        ) {
            continue;
        }
        foreach ($group['tabs'] as $tab) {
            if (
                !is_array($tab) ||
                !is_string($tab['id'] ?? null) ||
                !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $tab['id']) ||
                !is_string($tab['code'] ?? null)
            ) {
                continue;
            }
            $start = $group['version'] === 2 ? $tab['startLine'] ?? null : 1;
            if (!is_int($start) || $start < 1 || $start > 999999) {
                continue;
            }
            $nodes = $xpath->query(
                './/div[@id="' .
                    $group['id'] .
                    '" and contains(concat(" ",normalize-space(@class)," ")," wp-block-mbb-code-tabs ")]/div[@id="' .
                    $tab['id'] .
                    '" and contains(concat(" ",normalize-space(@class)," ")," mbb-code-tab ")]/pre/code',
                $root,
            );
            if ($nodes->length !== 1) {
                continue;
            }
            $count = max(
                1,
                count(
                    explode(
                        "\n",
                        preg_replace(
                            '/\n$/',
                            '',
                            str_replace(["\r\n", "\r"], "\n", $nodes->item(0)->textContent),
                        ),
                    ),
                ),
            );
            if ($start + $count - 1 > 999999) {
                continue;
            }
            $key = $group['id'] . '/' . $tab['id'];
            $lineTargets[$key][] = [
                'start' => $start,
                'end' => $start + $count - 1,
                'id' => $tab['id'],
            ];
        }
    }
    foreach ($xpath->query('.//a[@href]', $root) as $link) {
        if (
            !preg_match(
                '~^#mbb-code/([A-Za-z][A-Za-z0-9_-]{0,63}/[A-Za-z][A-Za-z0-9_-]{0,63})/L([1-9]\d{0,5})(?:-L([1-9]\d{0,5}))?$~D',
                $link->getAttribute('href'),
                $range,
            )
        ) {
            continue;
        }
        $targets = $lineTargets[$range[1]] ?? [];
        $first = (int) $range[2];
        $last = (int) ($range[3] ?? $range[2]);
        if (
            count($targets) === 1 &&
            $first >= $targets[0]['start'] &&
            $last >= $first &&
            $last <= $targets[0]['end']
        ) {
            $link->setAttribute('href', '#' . $targets[0]['id']);
        }
    }

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
    if (function_exists('mbb_code_tabs_summary_text')) {
        foreach (
            $xpath->query('.//p[@data-mbb-generated and @class="mbb-code-line-summary"]', $root)
            as $summary
        ) {
            if (
                preg_match(
                    '/^Starting line: ([1-9]\d{0,5})(?:; highlights: ([0-9,-]+))?$/D',
                    $summary->textContent,
                    $lineSettings,
                )
            ) {
                $summary->textContent = mbb_code_tabs_summary_text(
                    (int) $lineSettings[1],
                    $lineSettings[2] ?? '',
                );
            }
        }
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
        $html = mbb_render_technical($html, $numbering);
    } elseif ($numbering) {
        throw new InvalidArgumentException('Publication numbering requires the technical renderer');
    }
    if (function_exists('mbb_references_static_links')) {
        $html = mbb_references_static_links($html, $referenceMap);
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
                $key === 'headers' &&
                in_array($n->tagName, ['td', 'th'], true) &&
                preg_match('/^[^\s<>]+(?:\s+[^\s<>]+)*$/D', $value)
            ) {
                continue;
            }
            if (
                $key === 'scope' &&
                $n->tagName === 'th' &&
                in_array($value, ['row', 'col', 'rowgroup', 'colgroup'], true)
            ) {
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
    array $linkedImages = [],
): array {
    $body = mbb_static_export_body(
        $snapshot['document']['serialized'],
        $snapshot['referenceMap'] ?? [],
    );
    $images = [];
    $encodedBytes = strlen($body) + strlen(mbb_static_export_styles());
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
    $external = [];
    foreach ($linkedImages as $item) {
        if (
            !is_array($item) ||
            !is_string($item['url'] ?? null) ||
            !mbb_static_export_external_url($item['url'])
        ) {
            mbb_export_throw('export_images', mbb_t('An external image link is unsafe'));
        }
        $external[$item['url']] = true;
    }
    foreach (iterator_to_array($xpath->query('.//img', $root)) as $n) {
        $src = $n->getAttribute('src');
        if (!isset($map[$src]) && isset($external[$src])) {
            $text = trim($n->getAttribute('alt')) ?: mbb_t('View external image');
            $link = $doc->createElement('a');
            $link->setAttribute('class', 'mbb-external-image-link');
            $link->setAttribute('href', $src);
            $link->setAttribute('rel', 'noreferrer noopener');
            $link->setAttribute('title', $src);
            $link->appendChild($doc->createTextNode($text));
            $ancestor = $n->parentNode;
            while (
                $ancestor &&
                $ancestor !== $root &&
                !($ancestor instanceof DOMElement && $ancestor->tagName === 'a')
            ) {
                $ancestor = $ancestor->parentNode;
            }
            if ($ancestor && $ancestor !== $root) {
                // Keep an authored surrounding link and add a separate image link.
                $n->parentNode->replaceChild($doc->createTextNode($text), $n);
                $link->textContent = mbb_t('View external image');
                $ancestor->parentNode->insertBefore(
                    $doc->createTextNode(' · '),
                    $ancestor->nextSibling,
                );
                $ancestor->parentNode->insertBefore($link, $ancestor->nextSibling?->nextSibling);
            } else {
                $n->parentNode->replaceChild($link, $n);
            }
            continue;
        }
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
        'schema' => function_exists('mbb_component_projection_plan') ? 2 : 1,
        'kind' => 'markbridge-static',
        'title' => strip_tags($snapshot['post']->post_title),
        'lang' => $lang,
        'body' => $body,
        'css' => mbb_static_export_styles(),
        'images' => $images,
    ];
    if ($value['schema'] === 2) {
        $value['projections'] = mbb_component_projection_plan(
            $snapshot['document']['serialized'],
            $lang,
        );
    }
    $json = mbb_component_json($value);
    if (strlen($json) > 33554432) {
        mbb_export_throw(
            'export_size',
            mbb_t('The static HTML descriptor exceeds 32 MiB. Content was not truncated'),
        );
    }
    return $value;
}
