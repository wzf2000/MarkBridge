<?php
// Synthetic fixed plugin files and REST hooks only; no WordPress bootstrap/database.
$directory = sys_get_temp_dir() . '/mbb-frame-' . bin2hex(random_bytes(8));
mkdir($directory . '/fixture/assets/0.1.0', 0700, true);
define('WP_PLUGIN_DIR', $directory);
function add_action(...$args) {}
function add_filter($hook, $callback, ...$args)
{
    $GLOBALS['filters'][$hook] = $callback;
}
function apply_filters($hook, $value, ...$args)
{
    return $value;
}
function wp_normalize_path($path)
{
    return $path;
}
function wp_json_encode($v, $flags = 0)
{
    return json_encode($v, $flags);
}
function site_url()
{
    return $GLOBALS['fixtureOrigin'] ?? 'http://frame.invalid';
}
if (($argv[1] ?? '') === '--fixture') {
    if (!preg_match('~^http://127\.0\.0\.1:[0-9]{4,5}$~D', $argv[2] ?? '')) {
        throw new RuntimeException('Local fixture origin required');
    }
    $GLOBALS['fixtureOrigin'] = $argv[2];
}
function rest_url($path)
{
    return site_url() . '/wp-json/' . $path;
}
function plugins_url($name, $file)
{
    return site_url() .
        '/plugins/' .
        substr(dirname($file), strlen(WP_PLUGIN_DIR) + 1) .
        '/' .
        $name;
}
function status_header($n)
{
    $GLOBALS['status'] = $n;
}
class WP_Error
{
    public function __construct(public $code, ...$args) {}
}
function mbb_error($code, ...$args)
{
    return new WP_Error($code);
}
class WP_REST_Response
{
    public function __construct(public $data, public $status, public $headers) {}
}
class FrameRequest implements ArrayAccess
{
    public function __construct(
        public array $attrs,
        public array $query = [],
        public string $method = 'GET',
        public ?string $body = null,
    ) {}
    public function get_query_params()
    {
        return $this->query;
    }
    public function get_body()
    {
        return $this->body;
    }
    public function get_method()
    {
        return $this->method;
    }
    public function offsetExists(mixed $offset): bool
    {
        return isset($this->attrs[$offset]);
    }
    public function offsetGet(mixed $offset): mixed
    {
        return $this->attrs[$offset] ?? null;
    }
    public function offsetSet(mixed $offset, mixed $value): void
    {
        $this->attrs[$offset] = $value;
    }
    public function offsetUnset(mixed $offset): void
    {
        unset($this->attrs[$offset]);
    }
}
require dirname(__DIR__) . '/plugin/components.php';
function resource_frame_projection($params, $context)
{
    $data = json_decode(
        markbridge_teaching_resource_bytes('resource-fixture', '0.1.0', 'data'),
        true,
        8,
        JSON_THROW_ON_ERROR,
    );
    return [
        'schema' => 1,
        'tree' => [
            [
                'tag' => 'p',
                'attrs' => (object) [],
                'children' => ['Fixed value: ' . $data['value']],
            ],
        ],
    ];
}

function check_frame($ok, $why)
{
    if (!$ok) {
        throw new RuntimeException($why);
    }
}
$root = $directory . '/fixture';
$bootstrap = $root . '/frame.html';
$data = $root . '/assets/0.1.0/data.json';
$manifest = $root . '/assets/0.1.0/manifest.json';
$program = $root . '/assets/0.1.0/program.js';
$binary = $root . '/assets/0.1.0/values.bin';
file_put_contents(
    $bootstrap,
    ($argv[1] ?? '') === '--fixture'
        ? file_get_contents(__DIR__ . '/fixtures/resource-v2-provider/frame.html')
        : '<!doctype html><p>Fixed public bootstrap</p>',
);
file_put_contents(
    $data,
    ($argv[1] ?? '') === '--fixture'
        ? file_get_contents(__DIR__ . '/fixtures/resource-v2-provider/assets/0.1.0/data.json')
        : '{"value":42}',
);
$plan = [
    'schema' => 'mbb-resources/v2',
    'version' => '0.1.0',
    'resources' => [
        [
            'id' => 'data',
            'path' => 'assets/0.1.0/data.json',
            'type' => 'json',
            'bytes' => filesize($data),
            'sha256' => hash_file('sha256', $data),
            'deps' => [],
            'license' => 'CC0-1.0',
            'version' => '0.1.0',
        ],
    ],
];
if (($argv[1] ?? '') === '--fixture') {
    copy(__DIR__ . '/fixtures/resource-v2-provider/assets/0.1.0/program.js', $program);
    copy(__DIR__ . '/fixtures/resource-v2-provider/assets/0.1.0/values.bin', $binary);
    $plan = json_decode(
        file_get_contents(__DIR__ . '/fixtures/resource-v2-provider/assets/0.1.0/manifest.json'),
        true,
        16,
        JSON_THROW_ON_ERROR,
    );
}
file_put_contents(
    $manifest,
    ($argv[1] ?? '') === '--fixture'
        ? file_get_contents(__DIR__ . '/fixtures/resource-v2-provider/assets/0.1.0/manifest.json')
        : json_encode($plan),
);
$p = [
    'version' => '0.1.0',
    'title' => 'Fixed resource v2',
    'schema' => [
        'type' => 'object',
        'properties' => ['text' => ['type' => 'string']],
        'additionalProperties' => false,
    ],
    'defaults' => (object) [],
    'protocolVersion' => 2,
    'minMarkBridge' => '3.2.0-rc.3',
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
try {
    check_frame(markbridge_register_teaching_component('resource-fixture', $p), 'v2 rejected');
    $registered = mbb_component_provider('resource-fixture', '0.1.0');
    check_frame($registered['status'] === 'available', 'v2 unavailable');
    foreach (
        [
            array_diff_key($p, ['resources' => true]),
            array_replace($p, ['protocolVersion' => 1]),
            array_replace($p, ['resources' => $p['resources'] + ['unexpected' => true]]),
            array_replace($p, [
                'resources' => array_replace($p['resources'], ['url' => site_url() . '/arbitrary']),
            ]),
        ]
        as $bad
    ) {
        check_frame(
            !markbridge_register_teaching_component('invalid-resource-fixture', $bad),
            'Malformed v2 registration accepted',
        );
    }
    $public = mbb_component_public($registered);
    if (($argv[1] ?? '') === '--fixture') {
        echo json_encode(
            [
                'provider' => $public,
                'html' => mbb_component_frame_body($registered),
                'headers' => mbb_component_frame_headers(),
                'manifest' => file_get_contents($manifest),
                'data' => file_get_contents($data),
                'program' => file_get_contents($program),
                'binary' => base64_encode(file_get_contents($binary)),
                'bundle' => base64_encode(mbb_component_bundle_body($registered)),
                'bundleHeaders' => mbb_component_bundle_headers(),
            ],
            JSON_THROW_ON_ERROR,
        );
    } else {
        check_frame(!str_contains(json_encode($public), $directory), 'Private path leaked');
        check_frame(
            $public['resources']['baseUrl'] === site_url() . '/plugins/fixture/',
            'Wrong base URL',
        );
        $request = new FrameRequest([
            'component' => 'resource-fixture',
            'version' => '0.1.0',
            'digest' => $p['resource']['sha256'],
        ]);
        check_frame(
            mbb_component_frame_provider(new FrameRequest($request->attrs, [], 'GET', '')) !== null,
            'Explicit empty GET body rejected',
        );
        $bundleRequest = new FrameRequest([
            ...$request->attrs,
            'digest' => $p['resources']['sha256'],
        ]);
        $bundleResponse = mbb_component_bundle_response($bundleRequest);
        check_frame($bundleResponse instanceof WP_REST_Response, 'Bundle did not resolve');
        $serve = $GLOBALS['filters']['rest_pre_serve_request'];
        $bundleServer = new class {
            public array $headers = [];
            public function send_header($k, $v)
            {
                $this->headers[$k] = $v;
            }
        };
        ob_start();
        $serve(false, $bundleResponse, $bundleRequest, $bundleServer);
        $bundle = ob_get_clean();
        $rawManifest = file_get_contents($manifest);
        check_frame(
            $bundle ===
                "MBBR2\0\r\n" .
                    pack('N', strlen($rawManifest)) .
                    $rawManifest .
                    file_get_contents($data),
            'Bundle framing/raw bytes',
        );
        check_frame($bundleServer->headers === mbb_component_bundle_headers(), 'Bundle headers');
        foreach (
            [
                new FrameRequest($bundleRequest->attrs, ['path' => 'assets/0.1.0/data.json']),
                new FrameRequest($bundleRequest->attrs, [], 'POST'),
                new FrameRequest($bundleRequest->attrs, [], 'GET', 'x'),
                new FrameRequest([...$bundleRequest->attrs, 'digest' => $p['resource']['sha256']]),
                new FrameRequest([...$bundleRequest->attrs, 'component' => 'unknown']),
                new FrameRequest([...$bundleRequest->attrs, 'version' => '0.2.0']),
            ]
            as $bad
        ) {
            check_frame(
                mbb_component_bundle_response($bad) instanceof WP_Error,
                'Unfixed bundle request accepted',
            );
        }
        check_frame(
            mbb_component_bundle_response(
                new FrameRequest($bundleRequest->attrs, [
                    'rest_route' => '/mbb/v2/component-resources/x',
                ]),
            ) instanceof WP_REST_Response,
            'Plain routing rejected',
        );
        $response = mbb_component_frame_response($request);
        check_frame(
            $response instanceof WP_REST_Response && $response->status === 200,
            'Frame did not resolve',
        );
        $server = new class {
            public array $headers = [];
            public function send_header($k, $v)
            {
                $this->headers[$k] = $v;
            }
        };
        $serve = $GLOBALS['filters']['rest_pre_serve_request'];
        ob_start();
        $served = $serve(false, $response, $request, $server);
        $html = ob_get_clean();
        check_frame(
            $served &&
                str_starts_with($html, file_get_contents($bootstrap)) &&
                str_contains($html, 'mbb-component/v2'),
            'Response was JSON wrapped or bridge absent',
        );
        check_frame(
            str_contains($server->headers['Content-Security-Policy'], 'sandbox allow-scripts') &&
                str_contains($server->headers['Content-Security-Policy'], "worker-src 'none'") &&
                !str_contains($server->headers['Content-Security-Policy'], 'wasm'),
            'Frame CSP',
        );
        check_frame($server->headers['Cache-Control'] === 'no-store', 'Public frame cached');
        foreach (
            [
                new FrameRequest($request->attrs, ['source' => 'x']),
                new FrameRequest($request->attrs, [], 'POST'),
                new FrameRequest($request->attrs, [], 'GET', 'x'),
                new FrameRequest([...$request->attrs, 'digest' => str_repeat('a', 64)]),
            ]
            as $bad
        ) {
            check_frame(
                mbb_component_frame_response($bad) instanceof WP_Error,
                'Unfixed request accepted',
            );
        }
        $response = mbb_component_frame_response($request);
        ob_start();
        check_frame(
            $serve(true, $response, $request, $server) === true,
            'Prior serve not respected',
        );
        $prior = ob_get_clean();
        check_frame(
            $prior === '' &&
                !isset($GLOBALS['mbb_component_frame_responses'][spl_object_id($response)]),
            'Prior serve duplicated output or leaked entry',
        );
        check_frame(
            markbridge_teaching_resource_bytes('resource-fixture', '0.1.0', 'data') ===
                '{"value":42}',
            'Fixed projection data read failed',
        );
        check_frame(
            mbb_register_component_projection('resource-fixture', '0.1.0', [
                'contract' => 'mbb-component-projection/v1',
                'version' => '1.0.0',
                'render' => 'resource_frame_projection',
                'files' => [
                    ['file' => realpath(__FILE__), 'sha256' => hash_file('sha256', __FILE__)],
                ],
            ]),
            'Projection registration failed',
        );
        $fingerprint = mbb_component_projection_fingerprint('resource-fixture', '0.1.0');
        $serialized =
            '<!-- wp:mbb/component ' .
            json_encode([
                'id' => 'demo',
                'component' => 'resource-fixture',
                'componentVersion' => '0.1.0',
                'params' => (object) [],
            ]) .
            ' -->';
        check_frame(
            mbb_component_admit($serialized, '') === true,
            'Fresh v2 configuration refused',
        );
        $projection = mbb_component_projection_plan($serialized);
        check_frame(
            $projection[0]['state'] === 'available' &&
                $projection[0]['projection']['tree'][0]['children'] === ['Fixed value: 42'],
            'Fixed data typed projection unavailable',
        );
        require dirname(__DIR__) . '/plugin/collections-snapshot.php';
        $snapshot = mbb_collections_components($serialized);
        check_frame(
            $snapshot[0]['componentIdentity'] === $public['identity'] &&
                $snapshot[0]['resourceGroup']['resources'][0]['sha256'] ===
                    hash_file('sha256', $data) &&
                !str_contains(json_encode($snapshot), $directory),
            'Snapshot fixed identity/provenance',
        );
        $response = mbb_component_frame_response($request);
        $bundleResponse = mbb_component_bundle_response($bundleRequest);
        file_put_contents($data, '{"value":43}');
        ob_start();
        $serve(false, $bundleResponse, $bundleRequest, $bundleServer);
        $staleBundle = ob_get_clean();
        check_frame(
            $staleBundle === '' && $GLOBALS['status'] === 404,
            'Late changed bundle served',
        );
        check_frame(
            mbb_component_bundle_response($bundleRequest) instanceof WP_Error,
            'Changed bundle accepted',
        );
        check_frame(
            mbb_component_projection_fingerprint('resource-fixture', '0.1.0') === null,
            'Changed data retained static projection fingerprint',
        );
        check_frame(
            mbb_component_projection_plan($serialized)[0]['state'] === 'unavailable',
            'Stale projection served',
        );
        try {
            mbb_collections_components($serialized);
            throw new LogicException('Stale snapshot accepted');
        } catch (RuntimeException $e) {
            check_frame($e->getMessage() === 'collection_changed:409', 'Wrong snapshot rejection');
        }

        ob_start();
        $serve(false, $response, $request, $server);
        $html = ob_get_clean();
        check_frame($html === '' && $GLOBALS['status'] === 404, 'Late fixed data mutation served');
        check_frame(
            mbb_component_frame_response($request) instanceof WP_Error,
            'Stale data accepted',
        );
        file_put_contents($data, '{"value":42}');
        $other = $registered;
        $other['resource']['sha256'] = str_repeat('a', 64);
        check_frame(
            mbb_component_identity($registered) !== mbb_component_identity($other),
            'Bootstrap missing from identity',
        );
        $other['protocolVersion'] = 1; // identity fixed profile remains v2-only, called only for v2 providers.
        unlink($data);
        symlink($bootstrap, $data);
        check_frame(
            mbb_component_frame_response($request) instanceof WP_Error,
            'Resource symlink accepted',
        );
        echo "Resource v2 registry/public identity/raw REST frame/CSP/request closure/late hash/symlink checks passed.\n";
    }
} finally {
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST,
    );
    foreach ($files as $file) {
        $file->isDir() && !$file->isLink()
            ? rmdir($file->getPathname())
            : unlink($file->getPathname());
    }
    rmdir($directory);
}
