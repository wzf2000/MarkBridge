<?php
/** Public fixed HTTP frames. No account, article, nonce or caller-provided source is used. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function mbb_component_frame_profile(): string
{
    $parts = [json_encode(mbb_component_frame_headers(), JSON_THROW_ON_ERROR)];
    foreach (
        [
            'component-frame.php',
            'component-frame-v2.js',
            'component-resources.php',
            'component-resources.js',
            'components.php',
            'components.js',
        ]
        as $file
    ) {
        $parts[] = $file . ':' . hash_file('sha256', __DIR__ . '/' . $file);
    }
    return hash('sha256', implode("\n", $parts));
}
function mbb_component_identity(array $p): string
{
    return hash(
        'sha256',
        implode("\n", [
            'mbb-component/v2',
            $p['id'],
            $p['version'],
            $p['resource']['sha256'],
            $p['resourcePlan']['groupSha256'],
            mbb_component_frame_profile(),
        ]),
    );
}
/** Re-read every fixed byte before adopting a frame or final snapshot. */
function mbb_component_v2_check(array $p): array
{
    if ($p['protocolVersion'] !== 2 || $p['status'] !== 'available') {
        throw new RuntimeException('FRAME_UNAVAILABLE');
    }
    $file = $p['resource']['file'];
    $path = realpath($file);
    if (!$path || $path !== $file || !is_file($file) || !is_readable($file)) {
        throw new RuntimeException('FRAME_PATH');
    }
    for ($part = $file; $part !== dirname($part); $part = dirname($part)) {
        if (is_link($part)) {
            throw new RuntimeException('FRAME_SYMLINK');
        }
    }
    $limit = $p['budgets']['resourceBytes'];
    if (filesize($file) < 1 || filesize($file) > $limit) {
        throw new RuntimeException('FRAME_LIMIT');
    }
    $html = file_get_contents($file, false, null, 0, $limit + 1);
    if (
        $html === false ||
        strlen($html) > $limit ||
        !hash_equals($p['resource']['sha256'], hash('sha256', $html))
    ) {
        throw new RuntimeException('FRAME_SHA');
    }
    $plan = mbb_component_resource_group($p);
    if (!hash_equals($p['resourcePlan']['groupSha256'], $plan['groupSha256'])) {
        throw new RuntimeException('FRAME_GROUP');
    }
    return ['html' => $html, 'plan' => $plan];
}
function mbb_component_frame_headers(): array
{
    return [
        'Content-Type' => 'text/html; charset=UTF-8',
        'Cache-Control' => 'no-store',
        'X-Content-Type-Options' => 'nosniff',
        'Referrer-Policy' => 'no-referrer',
        'Content-Security-Policy' =>
            "sandbox allow-scripts; frame-ancestors 'self'; default-src 'none'; script-src 'unsafe-inline' blob:; worker-src 'none'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'",
    ];
}
function mbb_component_frame_body(array $p): string
{
    $checked = mbb_component_v2_check($p);
    // This fixed Main-owned bridge contains no per-article/session data. The parent supplies it only by postMessage.
    return $checked['html'] .
        "\n<script>" .
        file_get_contents(__DIR__ . '/component-frame-v2.js') .
        '</script>';
}
function mbb_component_frame_provider($request): ?array
{
    if ($request->get_method() !== 'GET' || $request->get_body() !== '') {
        return null;
    }
    $query = $request->get_query_params();
    unset($query['rest_route']); // WordPress plain-permalink routing only.
    if ($query) {
        return null;
    }
    $p = mbb_component_provider((string) $request['component'], (string) $request['version']);
    return $p &&
        $p['protocolVersion'] === 2 &&
        $p['status'] === 'available' &&
        hash_equals($p['resource']['sha256'], (string) $request['digest'])
        ? $p
        : null;
}
function mbb_component_frame_response($request)
{
    try {
        $p = mbb_component_frame_provider($request);
        if (!$p) {
            throw new RuntimeException('FRAME_NOT_FOUND');
        }
        $body = mbb_component_frame_body($p);
        $response = new WP_REST_Response(null, 200, mbb_component_frame_headers());
        $GLOBALS['mbb_component_frame_responses'][spl_object_id($response)] = [
            $response,
            $request,
            $body,
        ];
        return $response;
    } catch (Throwable $e) {
        return new WP_Error(
            'component_frame_unavailable',
            'The fixed component frame is unavailable.',
            ['status' => 404],
        );
    }
}
add_action('rest_api_init', static function () {
    register_rest_route(
        'mbb/v2',
        '/component-frame/(?P<component>[a-z][a-z0-9-]{0,63})/(?P<version>[0-9]+\.[0-9]+\.[0-9]+)/(?P<digest>[a-f0-9]{64})',
        [
            'methods' => 'GET',
            'permission_callback' => '__return_true',
            'callback' => 'mbb_component_frame_response',
        ],
    );
});
if (function_exists('add_filter')) {
    add_filter(
        'rest_pre_serve_request',
        static function ($served, $result, $request, $server) {
            $key = is_object($result) ? spl_object_id($result) : -1;
            $entry = $GLOBALS['mbb_component_frame_responses'][$key] ?? null;
            unset($GLOBALS['mbb_component_frame_responses'][$key]);
            if ($served || !$entry || $entry[0] !== $result || $entry[1] !== $request) {
                return $served;
            }
            try {
                $p = mbb_component_frame_provider($request);
                if (!$p || mbb_component_frame_body($p) !== $entry[2]) {
                    throw new RuntimeException('FRAME_STALE');
                }
                foreach (mbb_component_frame_headers() as $name => $value) {
                    $server->send_header($name, $value);
                }
                echo $entry[2]; // Fixed local bytes, checked against registered SHA; never request HTML.
            } catch (Throwable $e) {
                status_header(404);
                $server->send_header('Cache-Control', 'no-store');
            }
            return true;
        },
        10,
        4,
    );
}
