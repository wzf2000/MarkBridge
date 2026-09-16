<?php
if (!defined('ABSPATH')) {
    exit();
}
// New comments use the same pinned converter. Old stored comments are never rewritten.
add_filter(
    'preprocess_comment',
    function ($data) {
        $GLOBALS['mbb_comment_error'] = null;
        if (!in_array($data['comment_type'] ?? '', ['', 'comment'], true)) {
            return $data;
        }
        $source = wp_unslash($data['comment_content']);
        // Escape task markers outside fenced code; presentation turns the retained markers into checkboxes.
        $fence = null;
        $lines = explode("\n", $source);
        foreach ($lines as &$line) {
            if (preg_match('/^\s*(`{3,}|~{3,})/', $line, $m)) {
                if ($fence === null) {
                    $fence = $m[1][0];
                } elseif ($m[1][0] === $fence) {
                    $fence = null;
                }
                continue;
            }
            if ($fence === null && !preg_match('/^(?: {4}|\t)/', $line)) {
                $line = preg_replace(
                    '/^(\s*(?:[-+*]|[0-9]+[.)])\s+)\[([ xX])\](\s+)/',
                    '$1\\[$2]$3',
                    $line,
                );
            }
        }
        unset($line);
        $source = implode("\n", $lines);
        $doc = mbb_convert([
            'mode' => 'markdown',
            'source' => $source,
            'documentId' => 'comment-preview',
        ]);
        if (is_wp_error($doc)) {
            $GLOBALS['mbb_comment_error'] = new WP_Error(
                'comment_markdown',
                '评论未保存：' . $doc->get_error_message(),
                ['status' => 400],
            );
            return $data;
        }
        $html = do_blocks($doc['serialized']);
        // Store formulas as escaped TeX, independent of the page's selected formula engine.
        $dom = new DOMDocument('1.0', 'UTF-8');
        $old = libxml_use_internal_errors(true);
        $dom->loadHTML(
            '<?xml encoding="UTF-8"><div id="mbb-comment-root">' . $html . '</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD,
        );
        libxml_clear_errors();
        libxml_use_internal_errors($old);
        $xp = new DOMXPath($dom);
        foreach (iterator_to_array($xp->query('//*[@data-mbb-tex]')) as $node) {
            $node->parentNode->replaceChild(
                $dom->createTextNode('$' . $node->getAttribute('data-mbb-tex') . '$'),
                $node,
            );
        }
        foreach (
            iterator_to_array(
                $xp->query(
                    '//*[contains(concat(" ",normalize-space(@class)," ")," wp-block-mbb-math ")]',
                ),
            )
            as $node
        ) {
            $node->parentNode->replaceChild(
                $dom->createTextNode("\n$$\n" . $node->textContent . "\n$$\n"),
                $node,
            );
        }
        $root = $dom->getElementById('mbb-comment-root');
        $html = '';
        foreach ($root->childNodes as $node) {
            $html .= $dom->saveHTML($node);
        }
        $data['comment_content'] = wp_slash($html);
        return $data;
    },
    8,
);
add_filter(
    'pre_comment_approved',
    function ($approved) {
        return $GLOBALS['mbb_comment_error'] ?? $approved;
    },
    999,
);
