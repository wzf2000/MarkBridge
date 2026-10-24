<?php
require dirname(__DIR__) . '/plugin/component-resources.php';
$input = json_decode(stream_get_contents(STDIN), false, 32, JSON_THROW_ON_ERROR);
$out = [];
foreach ($input as $case) {
    try {
        $out[] = [
            'ok' => true,
            'value' => mbb_component_resource_manifest($case->manifest, $case->profile),
        ];
    } catch (Throwable $e) {
        $out[] = ['ok' => false, 'code' => $e->getMessage()];
    }
}
echo json_encode($out, JSON_THROW_ON_ERROR);
