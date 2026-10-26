<?php
if (PHP_SAPI !== 'cli') {
    exit(1);
}
require __DIR__ . '/../plugin/knowledge-map.php';
$cases = json_decode(file_get_contents(__DIR__ . '/fixtures/knowledge-map.json'));
$out = [];
foreach ($cases as $case) {
    $valid = mbb_knowledge_map_valid($case->params);
    if ($valid !== $case->valid) {
        throw new RuntimeException($case->id);
    }
    $out[] = $valid;
}
echo json_encode($out);
