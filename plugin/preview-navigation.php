<?php
/** Ephemeral source anchors. Nothing in this module is a saved block attribute. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
require_once __DIR__ . '/source-navigation.php';

function mbb_preview_strip_navigation(string $html): string
{
    $tags = new WP_HTML_Tag_Processor($html);
    while ($tags->next_tag()) {
        foreach ($tags->get_attribute_names_with_prefix('data-mbb-preview-') ?? [] as $name) {
            $tags->remove_attribute($name);
        }
    }
    return $tags->get_updated_html();
}

function mbb_preview_navigation(array $document, array $projected): array
{
    $source = $document['source'];
    $fallback = static fn(): array => [
        'html' => mbb_render_footnotes(do_blocks($projected['serialized'])),
        'navigation' => null,
    ];
    // Resource projection can rewrite source offsets. Never attach those to the original upload.
    if ($source !== $projected['source']) {
        return $fallback();
    }
    try {
        $blocks = parse_blocks($document['serialized']);
        $navigation = mbb_source_navigation($source, $blocks);
        $navigation['sourceSha256'] = hash('sha256', $source);
        $ranges = [];
        foreach ($navigation['ranges'] as $range) {
            $ranges[implode('.', $range['blockPath'])] = $range['id'];
        }
        $clean = static function (array $siblings, array $parent = []) use (
            &$clean,
            $ranges,
        ): array {
            $index = 0;
            foreach ($siblings as &$block) {
                $path = null;
                if (!empty($block['blockName'])) {
                    $path = array_merge($parent, [$index++]);
                }
                // Strip author-supplied reserved attributes before any child anchors are rendered.
                $block['innerHTML'] = mbb_preview_strip_navigation($block['innerHTML'] ?? '');
                foreach ($block['innerContent'] ?? [] as $i => $part) {
                    if (is_string($part)) {
                        $block['innerContent'][$i] = mbb_preview_strip_navigation($part);
                    }
                }
                if ($path !== null) {
                    $block['innerBlocks'] = $clean($block['innerBlocks'] ?? [], $path);
                    if (isset($ranges[implode('.', $path)])) {
                        $block['_mbb_preview_range'] = $ranges[implode('.', $path)];
                    }
                }
            }
            unset($block);
            return $siblings;
        };
        $blocks = $clean($blocks);
        $anchored = [];
        $mark = static function (string $html, array $block) use (&$anchored): string {
            if (!isset($block['_mbb_preview_range'])) {
                return $html;
            }
            $tags = new WP_HTML_Tag_Processor($html);
            if ($tags->next_tag()) {
                $tags->set_attribute('data-mbb-preview-range', $block['_mbb_preview_range']);
                $anchored[$block['_mbb_preview_range']] = true;
            }
            return $tags->get_updated_html();
        };
        add_filter('render_block', $mark, PHP_INT_MAX, 2);
        try {
            $html = '';
            foreach ($blocks as $block) {
                $html .= render_block($block);
            }
        } finally {
            remove_filter('render_block', $mark, PHP_INT_MAX);
        }
        $navigation['ranges'] = array_values(
            array_filter($navigation['ranges'], static function (array $range) use (
                $anchored,
                &$navigation,
            ): bool {
                if (isset($anchored[$range['id']])) {
                    return true;
                }
                if (count($navigation['unmapped']) < 2048) {
                    $navigation['unmapped'][] = [
                        'blockPath' => $range['blockPath'],
                        'reason' => 'not-rendered',
                    ];
                }
                return false;
            }),
        );
        return ['html' => mbb_render_footnotes($html), 'navigation' => $navigation];
    } catch (Throwable $e) {
        // Position hints must never turn a valid preview into a failed conversion/save.
        return $fallback();
    }
}
