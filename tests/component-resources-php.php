<?php
require dirname(__DIR__) . '/plugin/component-resources.php';
try {
    $raw = stream_get_contents(STDIN);
    $plan = mbb_component_resource_manifest(mbb_component_resource_json($raw));
    echo json_encode(
        ['ok' => true, 'plan' => $plan],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
    );
} catch (Throwable $e) {
    echo json_encode(['ok' => false, 'code' => $e->getMessage()]);
}
