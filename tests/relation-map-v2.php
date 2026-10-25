<?php
require dirname(__DIR__) . '/plugin/relation-map-v2.php';
$input = json_decode(stream_get_contents(STDIN), false, 32, JSON_THROW_ON_ERROR);
echo json_encode(array_map('mbb_relation_map_v2_valid', $input));
