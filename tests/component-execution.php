<?php
/** Reuse the existing full registry/frame model shell. Synthetic files only; no WP DB. */
$savedArgv = $argv;
$argv = [__FILE__];
ob_start();
require __DIR__ . '/component-frame.php';
ob_end_clean();
$argv = $savedArgv;
if (($argv[1] ?? '') === '--fixture') {
    if (!preg_match('~^http://127\.0\.0\.1:[0-9]{4,5}$~D', $argv[2] ?? '')) {
        throw new RuntimeException('Local fixture origin required');
    }
    $GLOBALS['fixtureOrigin'] = $argv[2];
}
mkdir($directory . '/execution/assets/0.1.0', 0700, true);
$root = $directory . '/execution';
$bootstrap = $root . '/frame.html';
$manifest = $root . '/assets/0.1.0/manifest.json';
try {
    file_put_contents($bootstrap, file_get_contents(__DIR__ . '/fixtures/execution-v2/frame.html'));
    $bytes = [
        'worker' => file_get_contents(__DIR__ . '/fixtures/execution-v2/worker.js'),
        'module' => hex2bin('0061736d01000000'),
        'data' => '{"value":42}',
    ];
    $types = [
        'worker' => ['javascript', 'js'],
        'module' => ['webassembly', 'wasm'],
        'data' => ['json', 'json'],
    ];
    $resources = [];
    foreach ($bytes as $id => $body) {
        [$type, $ext] = $types[$id];
        $path = 'assets/0.1.0/' . $id . '.' . $ext;
        file_put_contents($root . '/' . $path, $body);
        $resources[] = [
            'id' => $id,
            'path' => $path,
            'type' => $type,
            'bytes' => strlen($body),
            'sha256' => hash('sha256', $body),
            'deps' => [],
            'license' => 'GPL-3.0-or-later',
            'version' => '0.1.0',
        ];
    }
    file_put_contents(
        $manifest,
        json_encode([
            'schema' => 'mbb-resources/v2',
            'version' => '0.1.0',
            'resources' => $resources,
        ]),
    );
    $provider = [
        'version' => '0.1.0',
        'title' => 'Execution profile fixture',
        'schema' => ['type' => 'object', 'properties' => [], 'additionalProperties' => false],
        'defaults' => (object) [],
        'protocolVersion' => 2,
        'minMarkBridge' => '3.2.0-rc.5',
        'executionProfile' => 'fixed-wasm/v1',
        'budgets' => mbb_component_budget_limits(),
        'resource' => [
            'file' => $bootstrap,
            'url' => plugins_url('frame.html', $bootstrap),
            'sha256' => hash_file('sha256', $bootstrap),
        ],
        'resources' => [
            'file' => $manifest,
            'url' => plugins_url('manifest.json', $manifest),
            'sha256' => hash_file('sha256', $manifest),
        ],
    ];
    check_frame(
        markbridge_register_teaching_component('execution-fixture', $provider),
        'Execution registration refused',
    );
    $p = mbb_component_provider('execution-fixture', '0.1.0');
    $public = mbb_component_public($p);
    check_frame(
        $p['status'] === 'available' && $public['executionProfile'] === 'fixed-wasm/v1',
        'Profile public descriptor/availability',
    );
    $default = mbb_component_frame_headers();
    $execution = mbb_component_frame_headers('fixed-wasm/v1');
    check_frame(
        str_contains($default['Content-Security-Policy'], "worker-src 'none'") &&
            !str_contains($default['Content-Security-Policy'], 'wasm-unsafe-eval'),
        'Default profile was relaxed',
    );
    check_frame(
        str_contains($execution['Content-Security-Policy'], "'wasm-unsafe-eval'") &&
            str_contains($execution['Content-Security-Policy'], 'worker-src blob:') &&
            !str_contains($execution['Content-Security-Policy'], "'unsafe-eval'") &&
            !str_contains($execution['Content-Security-Policy'], 'allow-same-origin'),
        'Execution CSP grant',
    );
    check_frame(
        markbridge_teaching_supports_execution_profile('fixed-wasm/v1') &&
            !markbridge_teaching_supports_execution_profile('unknown'),
        'Capability helper',
    );
    foreach (
        [
            array_diff_key($provider, ['executionProfile' => true]),
            array_replace($provider, ['executionProfile' => 'unknown']),
            array_replace($provider, ['executionProfile' => null]),
            array_replace($provider, ['protocolVersion' => 1]),
            array_replace($provider, ['minMarkBridge' => '3.2.0-rc.4']),
        ]
        as $i => $bad
    ) {
        check_frame(
            !markbridge_register_teaching_component('execution-invalid-' . $i, $bad),
            'Invalid/default/v1/old minimum profile admitted',
        );
    }
    foreach (['worker', 'module'] as $id) {
        $refused = false;
        try {
            markbridge_teaching_resource_bytes('execution-fixture', '0.1.0', $id);
        } catch (Throwable $e) {
            $refused = $e->getMessage() === 'RESOURCE_NOT_DATA';
        }
        check_frame($refused, 'Executable resource leaked through fixed-data API');
    }
    check_frame(
        markbridge_teaching_resource_bytes('execution-fixture', '0.1.0', 'data') === '{"value":42}',
        'Data API refused allowed fixed JSON',
    );
    $other = $p;
    unset($other['executionProfile']);
    check_frame(
        mbb_component_identity($p) !== mbb_component_identity($other),
        'Profile absent from complete identity',
    );
    $attrs = [
        'component' => 'execution-fixture',
        'version' => '0.1.0',
        'digest' => $provider['resource']['sha256'],
    ];
    $core =
        getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT') ?:
        (($argv[1] ?? '') === '--core'
            ? $argv[2] ?? ''
            : '');
    if ($core) {
        require_once rtrim($core, '/') . '/wp-includes/rest-api/class-wp-rest-request.php';
        $request = new WP_REST_Request(
            'GET',
            '/mbb/v2/component-frame/execution-fixture/0.1.0/' . $provider['resource']['sha256'],
        );
        $request->set_url_params($attrs);
    } else {
        $request = new FrameRequest($attrs);
    }
    $response = mbb_component_frame_response($request);
    check_frame(
        $response instanceof WP_REST_Response && $response->headers === $execution,
        'Raw REST route did not select registered profile CSP',
    );
    $sent = new class {
        public array $headers = [];
        public function send_header($name, $value)
        {
            $this->headers[$name] = $value;
        }
    };
    ob_start();
    $served = $GLOBALS['filters']['rest_pre_serve_request'](false, $response, $request, $sent);
    $raw = ob_get_clean();
    check_frame(
        $served && $sent->headers === $execution && $raw === mbb_component_frame_body($p),
        'Actual raw serve headers/body lost registered profile',
    );
    $serialized =
        '<!-- wp:mbb/component ' .
        json_encode([
            'id' => 'execution',
            'component' => 'execution-fixture',
            'componentVersion' => '0.1.0',
            'params' => (object) [],
        ]) .
        ' -->';
    $snapshot = mbb_collections_components($serialized);
    check_frame(
        $snapshot[0]['executionProfile'] === 'fixed-wasm/v1' &&
            $snapshot[0]['componentIdentity'] === $public['identity'],
        'Snapshot profile binding',
    );
    if (($argv[1] ?? '') === '--fixture') {
        echo json_encode(
            [
                'provider' => $public,
                'headers' => $execution,
                'html' => mbb_component_frame_body($p),
                'manifest' => file_get_contents($manifest),
                'bundle' => base64_encode(mbb_component_bundle_body($p)),
                'bundleHeaders' => mbb_component_bundle_headers(),
                'worker' => $bytes['worker'],
                'module' => base64_encode($bytes['module']),
                'data' => $bytes['data'],
            ],
            JSON_THROW_ON_ERROR,
        );
    } else {
        echo "Execution profile real registry/raw REST/CSP/public and snapshot identity, v1/default refusals and executable data-API refusal passed.\n";
    }
} finally {
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST,
    );
    foreach ($files as $f) {
        $f->isDir() && !$f->isLink() ? rmdir($f->getPathname()) : unlink($f->getPathname());
    }
    rmdir($directory);
}
