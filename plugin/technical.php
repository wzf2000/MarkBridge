<?php
/** Derived numbering and links. This module never edits a saved document. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}

function mbb_technical_label(string $kind): string
{
    return match ($kind) {
        'equation' => mbb_t('Equation'),
        'figure' => mbb_t('Figure'),
        'table' => mbb_t('Table'),
        'listing' => mbb_t('Listing'),
        'definition' => mbb_t('Definition'),
        'theorem' => mbb_t('Theorem'),
        'proof' => mbb_t('Proof'),
        default => '',
    };
}

function mbb_technical_has_class(DOMElement $node, string $name): bool
{
    return in_array($name, preg_split('/\s+/', trim($node->getAttribute('class'))), true);
}

function mbb_technical_url(string $url): bool
{
    if ($url === '' || strlen($url) > 8192 || preg_match('/[\x00-\x20\x7f]/', $url)) {
        return false;
    }
    $parts = parse_url($url);
    return is_array($parts) &&
        in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) &&
        !empty($parts['host']) &&
        !isset($parts['user']) &&
        !isset($parts['pass']);
}

function mbb_render_technical($html)
{
    if (!is_string($html) || !preg_match('/mbb-(?:technical-|bibliography|xref|cite)/', $html)) {
        return $html;
    }
    if (strlen($html) > 4194304) {
        return $html;
    }
    $document = new DOMDocument('1.0', 'UTF-8');
    $previous = libxml_use_internal_errors(true);
    try {
        $document->loadHTML(
            '<?xml encoding="UTF-8"?><div id="mbb-technical-render-root">' . $html . '</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET,
        );
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
    }
    $root = $document->getElementById('mbb-technical-render-root');
    if (!$root) {
        return $html;
    }
    $xpath = new DOMXPath($document);
    $all = $xpath->query('.//*', $root);
    if ($all->length > 20000) {
        return $html;
    }
    $ids = [];
    $objects = [];
    $references = [];
    $citations = [];
    $bibliography = null;
    // Validate the complete render graph before changing any node. Malformed legacy
    // HTML remains readable rather than acquiring guessed links or partial numbering.
    foreach ($all as $node) {
        if ($node->hasAttribute('id')) {
            $id = $node->getAttribute('id');
            if (isset($ids[$id])) {
                return $html;
            }
            $ids[$id] = true;
        }
        if ($node->getAttribute('data-mbb-technical-rendered') === '1') {
            return $html;
        }
        if (
            mbb_technical_has_class($node, 'mbb-technical-object') ||
            mbb_technical_has_class($node, 'mbb-technical-statement')
        ) {
            $id = $node->getAttribute('id');
            $kind =
                $node->getAttribute('data-mbb-object-kind') ?:
                $node->getAttribute('data-mbb-statement-kind');
            if (
                !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $id) ||
                !mbb_technical_label($kind)
            ) {
                return $html;
            }
            $heading = null;
            foreach ($node->childNodes as $child) {
                if (
                    $child instanceof DOMElement &&
                    (mbb_technical_has_class($child, 'mbb-technical-caption') ||
                        mbb_technical_has_class($child, 'mbb-technical-heading'))
                ) {
                    $heading = $child;
                    break;
                }
            }
            if (!$heading) {
                return $html;
            }
            $objects[$id] = ['node' => $node, 'kind' => $kind, 'heading' => $heading];
        }
        if (mbb_technical_has_class($node, 'mbb-bibliography')) {
            if (
                $bibliography ||
                !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $node->getAttribute('id'))
            ) {
                return $html;
            }
            $bibliography = $node;
        }
        if (
            mbb_technical_has_class($node, 'mbb-xref') ||
            mbb_technical_has_class($node, 'mbb-cite')
        ) {
            for (
                $parent = $node->parentNode;
                $parent && $parent !== $root;
                $parent = $parent->parentNode
            ) {
                if (in_array($parent->nodeName, ['code', 'pre', 'a', 'script', 'style'], true)) {
                    continue 2;
                }
            }
            if ($node->tagName === 'span' && $node->getAttribute('data-mbb-version') === '2') {
                continue;
            }
            if ($node->tagName !== 'span' || $node->getAttribute('data-mbb-version') !== '1') {
                return $html;
            }
            if (mbb_technical_has_class($node, 'mbb-xref')) {
                $references[] = $node;
            } else {
                $citations[] = $node;
            }
        }
    }
    if (count($objects) > 2048 || count($references) + count($citations) > 4096) {
        return $html;
    }
    if (!$objects && !$bibliography && !$references && !$citations) {
        return $html;
    }
    foreach ($references as $reference) {
        $id = $reference->getAttribute('data-mbb-target');
        if (!isset($objects[$id]) || $reference->textContent !== '[' . $id . ']') {
            return $html;
        }
    }
    $entries = [];
    $list = null;
    if ($bibliography) {
        foreach ($bibliography->childNodes as $child) {
            if ($child instanceof DOMElement && $child->tagName === 'ol') {
                $list = $child;
                break;
            }
        }
        if (!$list) {
            return $html;
        }
        foreach ($list->childNodes as $item) {
            if (!($item instanceof DOMElement)) {
                continue;
            }
            $key = $item->getAttribute('data-mbb-bib-key');
            if (
                $item->tagName !== 'li' ||
                !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $key) ||
                isset($entries[$key])
            ) {
                return $html;
            }
            $entries[$key] = $item;
        }
        if (!$entries || count($entries) > 64) {
            return $html;
        }
    }
    $order = [];
    foreach ($citations as $citation) {
        $keys = explode(',', $citation->getAttribute('data-mbb-keys'));
        if (
            count($keys) > 8 ||
            count($keys) !== count(array_unique($keys)) ||
            $citation->textContent !== '[' . implode(',', $keys) . ']'
        ) {
            return $html;
        }
        foreach ($keys as $key) {
            if (!isset($entries[$key])) {
                return $html;
            }
            $order[$key] ??= count($order) + 1;
        }
    }
    foreach ($entries as $key => $_) {
        $order[$key] ??= count($order) + 1;
    }
    $referenceLabels = [];
    $labelGroups = [];
    $referenceYears = [];
    foreach ($order as $key => $_) {
        $field = static function ($name) use ($xpath, $entries, $key): string {
            return trim(
                $xpath
                    ->query(
                        './span[contains(concat(" ",normalize-space(@class)," ")," mbb-bib-' .
                            $name .
                            ' ")]',
                        $entries[$key],
                    )
                    ->item(0)?->textContent ?? '',
            );
        };
        $author = $field('authors') ?: $field('title');
        // Use authored text, not a guessed family name; long labels visibly abbreviate.
        if (mb_strlen($author, 'UTF-8') > 64) {
            $author = rtrim(mb_substr($author, 0, 63, 'UTF-8')) . '…';
        }
        $year = $field('year') ?: mbb_t('Undated');
        $base = $author . "\0" . $year;
        $labelGroups[$base][] = $key;
        $referenceLabels[$key] = $author;
        $referenceYears[$key] = $year;
    }
    foreach ($labelGroups as $group) {
        if (count($group) < 2) {
            continue;
        }
        foreach ($group as $i => $key) {
            $n = $i + 1;
            $suffix = '';
            while ($n > 0) {
                $n--;
                $suffix = chr(97 + ($n % 26)) . $suffix;
                $n = intdiv($n, 26);
            }
            $referenceYears[$key] .= $suffix;
            $yearNode = $xpath
                ->query(
                    './span[contains(concat(" ",normalize-space(@class)," ")," mbb-bib-year ")]',
                    $entries[$key],
                )
                ->item(0);
            if ($yearNode) {
                $yearNode->textContent = $referenceYears[$key];
                $yearNode->setAttribute('data-mbb-generated', '');
            }
        }
    }
    $counts = [];
    foreach ($objects as $id => &$item) {
        $kind = $item['kind'];
        $counts[$kind] = ($counts[$kind] ?? 0) + 1;
        $item['label'] = mbb_technical_label($kind) . ' ' . $counts[$kind];
        $prefix = $document->createElement('span');
        $prefix->setAttribute('class', 'mbb-technical-number');
        $prefix->setAttribute('data-mbb-generated', '');
        $prefix->appendChild($document->createTextNode($item['label'] . '. '));
        $item['heading']->insertBefore($prefix, $item['heading']->firstChild);
        $item['node']->setAttribute('data-mbb-technical-rendered', '1');
        if (in_array($kind, ['definition', 'theorem', 'proof'], true)) {
            $item['node']->setAttribute(
                'class',
                $item['node']->getAttribute('class') . ' mbb-statement-' . $kind,
            );
        }
        if ($kind === 'proof') {
            $body = $xpath
                ->query(
                    './div[contains(concat(" ",normalize-space(@class)," ")," mbb-technical-body ")]',
                    $item['node'],
                )
                ->item(0);
            if ($body) {
                $end = $document->createElement('span', '□');
                $end->setAttribute('class', 'mbb-proof-end');
                $end->setAttribute('aria-hidden', 'true');
                $end->setAttribute('data-mbb-generated', '');
                $body->appendChild($end);
            }
        }
    }
    unset($item);
    $clear = static function (DOMElement $node) use ($document): DOMElement {
        $source = $node->textContent;
        while ($node->firstChild) {
            $node->removeChild($node->firstChild);
        }
        // Preserve the authored identity for paragraph-comment adapters. Their
        // author-text projection ignores generated descendants; reordering an
        // equation must not change the identity of a paragraph that cites it.
        $original = $document->createElement('span');
        $original->setAttribute('hidden', '');
        $original->setAttribute('aria-hidden', 'true');
        $original->setAttribute('class', 'mbb-technical-source');
        $original->appendChild($document->createTextNode($source));
        $node->appendChild($original);
        $display = $document->createElement('span');
        $display->setAttribute('class', 'mbb-reference-label');
        $display->setAttribute('data-mbb-generated', '');
        $node->appendChild($display);
        $node->setAttribute('data-mbb-technical-rendered', '1');
        return $display;
    };
    foreach ($references as $reference) {
        $id = $reference->getAttribute('data-mbb-target');
        $display = $clear($reference);
        $link = $document->createElement('a');
        $link->appendChild($document->createTextNode($objects[$id]['label']));
        $link->setAttribute('href', '#' . $id);
        $display->appendChild($link);
    }
    $targets = [];
    foreach ($order as $key => $number) {
        $id =
            'mbb-bib-' .
            substr(hash('sha256', $bibliography->getAttribute('id') . ':' . $key), 0, 16);
        $base = $id;
        $suffix = 1;
        while (isset($ids[$id])) {
            $id = $base . '-' . ++$suffix;
        }
        $ids[$id] = true;
        $targets[$key] = $id;
        $item = $entries[$key];
        $item->setAttribute('id', $id);
        $item->setAttribute('value', (string) $number);
        $item->setAttribute('tabindex', '-1');
        foreach (
            $xpath->query(
                './span[contains(concat(" ",normalize-space(@class)," ")," mbb-bib-url ")]',
                $item,
            )
            as $urlNode
        ) {
            $url = $urlNode->textContent;
            if (mbb_technical_url($url)) {
                $link = $document->createElement('a');
                $link->setAttribute('href', $url);
                $link->setAttribute('rel', 'noreferrer noopener');
                $link->setAttribute('title', $url);
                $link->appendChild(
                    $document->createTextNode(
                        parse_url($url, PHP_URL_HOST) ?: mbb_t('Read source'),
                    ),
                );
                $urlNode->textContent = '';
                $urlNode->appendChild($link);
            }
        }
        $list->appendChild($item);
    }
    if ($bibliography) {
        $bibliography->setAttribute('data-mbb-technical-rendered', '1');
        $bibliography->setAttribute('role', 'doc-bibliography');
        // Entries are a view of structured data, not independently writable
        // paragraphs. Comment adapters must not replace their reference anchors.
        $list->setAttribute('data-mbb-generated', '');
        $list->setAttribute('role', 'list');
        foreach ($bibliography->childNodes as $child) {
            if (
                $child instanceof DOMElement &&
                mbb_technical_has_class($child, 'mbb-bibliography-title')
            ) {
                $child->textContent = mbb_t('Bibliography');
                $child->setAttribute('data-mbb-generated', '');
            }
        }
    }
    foreach ($citations as $citation) {
        $keys = explode(',', $citation->getAttribute('data-mbb-keys'));
        usort($keys, static fn($a, $b) => $order[$a] <=> $order[$b]);
        $display = $clear($citation);
        $display->appendChild($document->createTextNode('('));
        foreach ($keys as $i => $key) {
            if ($i) {
                $display->appendChild($document->createTextNode('; '));
            }
            $label = $referenceLabels[$key] . ', ' . $referenceYears[$key];
            $link = $document->createElement('a');
            $link->appendChild($document->createTextNode($label));
            $link->setAttribute('href', '#' . $targets[$key]);
            $link->setAttribute('role', 'doc-biblioref');
            $link->setAttribute('aria-label', mbb_t('Reference') . ': ' . $label);
            $display->appendChild($link);
        }
        $display->appendChild($document->createTextNode(')'));
    }
    $output = '';
    foreach ($root->childNodes as $child) {
        $output .= $document->saveHTML($child);
    }
    return $output;
}

if (function_exists('add_filter')) {
    // Footnotes establish their reading order at 29. Number only the final view.
    add_filter('the_content', 'mbb_render_technical', 30);
    add_filter(
        'render_block',
        static function ($html, $block) {
            if (
                !in_array(
                    $block['blockName'] ?? '',
                    ['mbb/object', 'mbb/statement', 'mbb/bibliography'],
                    true,
                )
            ) {
                return $html;
            }
            if (!is_admin()) {
                mbb_enqueue_technical_assets();
            }
            if (
                ($block['blockName'] ?? '') === 'mbb/statement' &&
                ($block['attrs']['kind'] ?? '') === 'proof'
            ) {
                $tags = new WP_HTML_Tag_Processor($html);
                if ($tags->next_tag('DETAILS')) {
                    $tags->set_attribute('data-mbb-teaching', 'native-details');
                    $html = $tags->get_updated_html();
                }
            }
            return $html;
        },
        10,
        2,
    );
    add_action('enqueue_block_assets', static function () {
        if (is_admin()) {
            mbb_enqueue_technical_assets(false);
        }
    });
    add_action('wp_enqueue_scripts', static function () {
        global $wp_query;
        foreach ($wp_query->posts ?? [] as $post) {
            if (
                is_object($post) &&
                preg_match(
                    '/mbb\/(?:object|statement|bibliography)\b|class="mbb-(?:xref|cite)"/',
                    $post->post_content ?? '',
                )
            ) {
                mbb_enqueue_technical_assets();
                break;
            }
        }
    });
}

function mbb_enqueue_technical_assets(bool $navigation = true): void
{
    wp_enqueue_style(
        'mbb-technical',
        plugins_url(mbb_asset('technical.css'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/technical.css'), 0, 12),
    );
    if ($navigation) {
        wp_enqueue_script(
            'mbb-teaching',
            plugins_url(mbb_asset('teaching.js'), __FILE__),
            [],
            substr(hash_file('sha256', __DIR__ . '/teaching.js'), 0, 12),
            true,
        );
    }
}
