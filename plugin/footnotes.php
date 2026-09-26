<?php
if (!defined('ABSPATH')) {
    exit();
}

/** Add numbered, document-scoped links only after saved block HTML is rendered. */
function mbb_render_footnotes($html)
{
    if (!is_string($html) || !str_contains($html, 'data-mbb-footnote=')) {
        return $html;
    }
    static $instance = 0;
    $document = new DOMDocument('1.0', 'UTF-8');
    $before = libxml_use_internal_errors(true);
    $document->loadHTML(
        '<?xml encoding="UTF-8"?><div id="mbb-footnote-render-root">' . $html . '</div>',
        LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET,
    );
    libxml_clear_errors();
    libxml_use_internal_errors($before);
    $xpath = new DOMXPath($document);
    $root = $xpath->query('//*[@id="mbb-footnote-render-root"]')->item(0);
    if (!$root) {
        return $html;
    }
    $section = $xpath
        ->query(
            './/section[contains(concat(" ",normalize-space(@class)," ")," mbb-footnotes ")]',
            $root,
        )
        ->item(0);
    if (!$section) {
        return $html;
    }
    $list = $xpath->query('./ol', $section)->item(0);
    if (!$list) {
        return $html;
    }
    $definitions = [];
    foreach ($xpath->query('./li[@data-mbb-footnote]', $list) as $item) {
        $label = $item->getAttribute('data-mbb-footnote');
        if (!preg_match('/\A[\p{L}\p{N}_-]{1,64}\z/uD', $label) || isset($definitions[$label])) {
            return $html;
        }
        $definitions[$label] = $item;
    }
    if (!$definitions) {
        return $html;
    }
    $references = [];
    foreach (
        $xpath->query(
            './/span[contains(concat(" ",normalize-space(@class)," ")," mbb-footnote-ref ")][@data-mbb-footnote]',
            $root,
        )
        as $marker
    ) {
        // A marker inside a code sample or link must stay literal.
        for (
            $parent = $marker->parentNode;
            $parent && $parent !== $root;
            $parent = $parent->parentNode
        ) {
            if (in_array($parent->nodeName, ['pre', 'code', 'a', 'section'], true)) {
                continue 2;
            }
        }
        $label = $marker->getAttribute('data-mbb-footnote');
        if (!isset($definitions[$label]) || $marker->textContent !== '[^' . $label . ']') {
            return $html;
        }
        $references[$label][] = $marker;
    }
    if (!$references || count($references) !== count($definitions)) {
        return $html;
    }
    $existing = [];
    foreach ($xpath->query('.//*[@id]', $root) as $element) {
        $existing[] = $element->getAttribute('id');
    }
    do {
        $prefix = 'mbb-fn-' . ++$instance . '-';
        $collision = false;
        foreach ($existing as $id) {
            if (str_starts_with($id, $prefix)) {
                $collision = true;
                break;
            }
        }
    } while ($collision);
    $number = 0;
    foreach ($references as $label => $markers) {
        $number++;
        $item = $definitions[$label];
        $target = $prefix . $number;
        $item->setAttribute('id', $target);
        $item->setAttribute('tabindex', '-1');
        $item->removeAttribute('data-mbb-footnote');
        $list->appendChild($item);
        $backlinks = $document->createElement('span');
        $backlinks->setAttribute('class', 'mbb-footnote-backrefs');
        foreach ($markers as $index => $marker) {
            $refId = $prefix . 'ref-' . $number . '-' . ($index + 1);
            $anchor = $document->createElement('a', (string) $number);
            $anchor->setAttribute('href', '#' . $target);
            $anchor->setAttribute('id', $refId);
            $anchor->setAttribute('aria-label', '脚注 ' . $number);
            $marker->removeAttribute('data-mbb-footnote');
            while ($marker->firstChild) {
                $marker->removeChild($marker->firstChild);
            }
            $marker->appendChild($anchor);
            $back = $document->createElement('a', '↩');
            $back->setAttribute('href', '#' . $refId);
            $back->setAttribute(
                'aria-label',
                '返回脚注 ' . $number . ' 的第 ' . ($index + 1) . ' 处引用',
            );
            $backlinks->appendChild($back);
        }
        $item->appendChild($backlinks);
    }
    $section->setAttribute('role', 'doc-endnotes');
    $output = '';
    foreach ($root->childNodes as $child) {
        $output .= $document->saveHTML($child);
    }
    return $output;
}

add_filter('the_content', 'mbb_render_footnotes', 29);
