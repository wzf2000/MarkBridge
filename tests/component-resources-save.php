<?php
// Only root's explicitly identified disposable local installation may run this script.
if (PHP_SAPI !== 'cli' || !defined('WP_CLI') || !WP_CLI) {
    exit(1);
}
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
if (
    !$root ||
    !$home ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    realpath(ABSPATH) !== realpath($root) ||
    rtrim(home_url(), '/') !== rtrim($home, '/') ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Resource v2 saves require an explicitly identified local lab.');
}
if (!function_exists('markbridge_teaching_supports_resource_groups')) {
    throw new RuntimeException('The resource v2 candidate is required.');
}
function crs_assert($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function crs_call($route, $params)
{
    $request = new WP_REST_Request('POST', $route);
    foreach ($params as $key => $value) {
        $request->set_param($key, $value);
    }
    $response = rest_do_request($request);
    crs_assert(
        $response->get_status() === 200,
        $route . ': ' . wp_json_encode($response->get_data()),
    );
    return $response->get_data();
}
$suffix = bin2hex(random_bytes(5));
$fixture = WP_PLUGIN_DIR . '/resource-v2-fixture-' . $suffix;
$previous = get_current_user_id();
$registry = mbb_component_registry();
$id = $user = 0;
try {
    mkdir($fixture . '/assets/0.1.0', 0700, true);
    $file = $fixture . '/frame.html';
    file_put_contents(
        $file,
        '<!doctype html><html><meta charset="utf-8"><p>Fixed synthetic v2 bootstrap</p></html>',
    );
    $dataFile = $fixture . '/assets/0.1.0/data.json';
    file_put_contents($dataFile, '{"value":42}');
    $manifestFile = $fixture . '/assets/0.1.0/manifest.json';
    file_put_contents(
        $manifestFile,
        wp_json_encode([
            'schema' => 'mbb-resources/v2',
            'version' => '0.1.0',
            'resources' => [
                [
                    'id' => 'data',
                    'path' => 'assets/0.1.0/data.json',
                    'type' => 'json',
                    'bytes' => filesize($dataFile),
                    'sha256' => hash_file('sha256', $dataFile),
                    'deps' => [],
                    'license' => 'CC0-1.0',
                    'version' => '0.1.0',
                ],
            ],
        ]),
    );
    crs_assert(
        markbridge_register_teaching_component('resource-save-fixture', [
            'version' => '0.1.0',
            'title' => 'Fixed v2 save fixture',
            'protocolVersion' => 2,
            'minMarkBridge' => '3.2.0-rc.3',
            'schema' => [
                'type' => 'object',
                'properties' => ['text' => ['type' => 'string']],
                'additionalProperties' => false,
            ],
            'defaults' => (object) [],
            'budgets' => mbb_component_budget_limits(),
            'resource' => [
                'file' => $file,
                'url' => plugins_url('frame.html', $file),
                'sha256' => hash_file('sha256', $file),
            ],
            'resources' => [
                'file' => $manifestFile,
                'url' => plugins_url('manifest.json', $manifestFile),
                'sha256' => hash_file('sha256', $manifestFile),
            ],
        ]),
        'Actual WordPress v2 registration failed',
    );
    $provider = mbb_component_provider('resource-save-fixture', '0.1.0');
    crs_assert($provider['status'] === 'available', 'Actual WordPress v2 not available');
    $public = mbb_component_public($provider);
    wp_set_current_user(0);
    $route =
        '/mbb/v2/component-frame/resource-save-fixture/0.1.0/' . $provider['resource']['sha256'];
    $frameRequest = new WP_REST_Request('GET', $route);
    $frameResponse = rest_do_request($frameRequest);
    crs_assert(
        $frameResponse->get_status() === 200 &&
            $frameResponse->get_headers()['Cache-Control'] === 'no-store',
        'Anonymous fixed frame route failed',
    );
    ob_start();
    $served = apply_filters(
        'rest_pre_serve_request',
        false,
        $frameResponse,
        $frameRequest,
        rest_get_server(),
    );
    $html = ob_get_clean();
    crs_assert(
        $served &&
            str_starts_with($html, file_get_contents($file)) &&
            str_contains($html, 'mbb-component/v2'),
        'Actual REST frame was wrapped or absent',
    );
    $user = wp_insert_user([
        'user_login' => 'resource-v2-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    crs_assert(!is_wp_error($user), 'Could not create synthetic author');
    wp_set_current_user($user);
    $source =
        ':::mbb:v1 component ' .
        wp_json_encode(
            [
                'id' => 'resource-example',
                'component' => 'resource-save-fixture',
                'componentVersion' => '0.1.0',
                'params' => (object) [],
            ],
            JSON_UNESCAPED_SLASHES,
        ) .
        "\n\nFixed author fallback.\n\n:::mbb:end\n";
    $request = [
        'post_id' => 0,
        'documentId' => 'Resources' . $suffix,
        'mode' => 'markdown',
        'source' => $source,
        'title' => 'Synthetic public resources',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $preview = crs_call('/mbb/v1/preview', $request);
    $request['adapter_digest'] = $preview['adapter_digest'];
    $saved = crs_call('/mbb/v1/save', $request);
    $id = (int) $saved['post_id'];
    $revision = (int) $saved['saved_revision'];
    $serialized = get_post($id)->post_content;
    crs_assert(
        get_post($id)->post_content_filtered === $source &&
            !str_contains($serialized, 'protocolVersion') &&
            !str_contains($serialized, $public['resources']['sha256']),
        'v2 transport leaked into persisted article',
    );
    $pair = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $source,
        'serialized' => $serialized,
        'documentId' => mbb_id($id),
    ]);
    crs_assert(!is_wp_error($pair) && $pair['serialized'] === $serialized, 'v2 exact pair failed');
    $edited = str_replace('Fixed author fallback.', 'Edited author fallback.', $serialized);
    crs_call('/wp/v2/posts/' . $id, [
        'content' => $edited,
        'mbb_expected' => mbb_token(get_post($id)),
    ]);
    $editedSource = get_post($id)->post_content_filtered;
    $pair = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $editedSource,
        'serialized' => $edited,
        'documentId' => mbb_id($id),
    ]);
    crs_assert(
        !is_wp_error($pair) && get_post($id)->post_content === $edited,
        'v2 native edit/reopen failed',
    );
    $restore = [
        'post_id' => $id,
        'mode' => 'restore',
        'expected' => mbb_token(get_post($id)),
        'revision_id' => $revision,
        'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
    ];
    $review = crs_call('/mbb/v1/preview', $restore);
    $restore['adapter_digest'] = $review['adapter_digest'];
    crs_call('/mbb/v1/save', $restore);
    crs_assert(
        get_post($id)->post_content === $serialized &&
            get_post($id)->post_content_filtered === $source,
        'v2 exact revision restore failed',
    );
    file_put_contents($dataFile, '{"value":43}');
    crs_assert(
        rest_do_request(new WP_REST_Request('GET', $route))->get_status() === 404,
        'Changed registered data served',
    );
    echo "Guarded resource v2 actual registry/raw REST/anonymous route/paired save/native edit/reopen/revision/late data refusal passed.\n";
} finally {
    $GLOBALS['mbb_components'] = $registry;
    if ($id) {
        wp_delete_post($id, true);
    }
    if (is_int($user) && $user > 0) {
        if (!function_exists('wp_delete_user')) {
            require_once ABSPATH . 'wp-admin/includes/user.php';
        }
        wp_delete_user($user);
    }
    wp_set_current_user($previous);
    if (is_dir($fixture)) {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($fixture, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($files as $f) {
            $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
        }
        rmdir($fixture);
    }
}
