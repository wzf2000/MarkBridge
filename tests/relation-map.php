<?php
if (PHP_SAPI !== 'cli') {
    exit();
}
require dirname(__DIR__) . '/plugin/relation-map.php';
$input = json_decode(stream_get_contents(STDIN), false, 32, JSON_THROW_ON_ERROR);
$rendered = [];
foreach ($input->render as $p) {
    foreach (['en', 'zh'] as $locale) {
        $doc = new DOMDocument('1.0', 'UTF-8');
        $root = $doc->createElement('section');
        $root->setAttribute('class', 'mbb-projection');
        $root->setAttribute('data-mbb-generated', '');
        $doc->appendChild($root);
        mbb_relation_map_append($doc, $root, mbb_relation_map_envelope($p, $locale));
        $rendered[] = [
            'bytes' => strlen($doc->saveHTML($root)),
            'estimate' => mbb_relation_map_static_bytes($p),
            'links' => $doc->getElementsByTagName('a')->length,
            'expectedLinks' => count($p->nodes) + 2 * count($p->edges),
            'locale' => $locale,
        ];
    }
}
echo json_encode(
    [
        'estimates' => array_map('mbb_relation_map_static_bytes', $input->budgets),
        'rendered' => $rendered,
        'maps' => array_map('mbb_relation_map_valid', $input->maps),
        'urls' => array_map('mbb_relation_map_url', $input->urls),
    ],
    JSON_THROW_ON_ERROR,
);
