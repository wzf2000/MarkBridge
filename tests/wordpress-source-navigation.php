<?php
// Run only in an explicitly owned synthetic WordPress lab, via wp eval-file.
if (!defined('WP_CLI') || !WP_CLI || !defined('MBB_SYNTHETIC_LAB')) {
    throw new RuntimeException('An owned synthetic lab is required.');
}
if (!function_exists('mbb_preview_navigation')) {
    require_once dirname(__DIR__) . '/plugin/preview-navigation.php';
}
require_once WP_PLUGIN_DIR . '/markbridge/includes/php-converter/Worker.php';
$fixtures = json_decode(file_get_contents(__DIR__ . '/fixtures/source-navigation.json'), true)[
    'cases'
];
foreach ($fixtures as $fixture) {
    if (($fixture['conversion'] ?? true) === false) {
        continue;
    }
    $result = \MarkBridge\Probe\Worker::convert([
        'mode' => 'markdown',
        'source' => $fixture['source'],
        'documentId' => 'NavigationLab',
    ]);
    if (!$result['ok']) {
        throw new RuntimeException('Conversion failed: ' . $fixture['id']);
    }
    $doc = $result['document'];
    $before = serialize($doc);
    $preview = mbb_preview_navigation($doc, $doc);
    if (!$preview['navigation'] || $before !== serialize($doc)) {
        throw new RuntimeException('Mutation or absent navigation.');
    }
    $tags = new WP_HTML_Tag_Processor($preview['html']);
    $seen = [];
    while ($tags->next_tag()) {
        $id = $tags->get_attribute('data-mbb-preview-range');
        if ($id !== null) {
            if (isset($seen[$id])) {
                throw new RuntimeException('Duplicate anchor.');
            }
            $seen[$id] = true;
        }
    }
    foreach ($preview['navigation']['ranges'] as $range) {
        if (!isset($seen[$range['id']])) {
            throw new RuntimeException('Missing anchor ' . $fixture['id'] . ':' . $range['id']);
        }
    }
    $projected = $doc;
    $projected['source'] .= '\n';
    if (mbb_preview_navigation($doc, $projected)['navigation'] !== null) {
        throw new RuntimeException('Projected source offset was admitted.');
    }
}
$html = '<p data-mbb-preview-range="r9" data-mbb-preview-session="spoof">text</p>';
if (str_contains(mbb_preview_strip_navigation($html), 'data-mbb-preview-')) {
    throw new RuntimeException('Authored reserved attributes survived.');
}
echo "Actual WordPress preview anchors, footnote reorder, no document mutation, projection fallback and attribute sanitation passed.\n";
