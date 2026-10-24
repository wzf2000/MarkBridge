<?php
if (PHP_SAPI !== 'cli') {
    exit();
}
require dirname(__DIR__) . '/plugin/relation-map.php';
$input = json_decode(stream_get_contents(STDIN), false, 32, JSON_THROW_ON_ERROR);
echo json_encode(
    [
        'maps' => array_map('mbb_relation_map_valid', $input->maps),
        'urls' => array_map('mbb_relation_map_url', $input->urls),
    ],
    JSON_THROW_ON_ERROR,
);
