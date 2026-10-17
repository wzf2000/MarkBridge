<?php
// Deterministic authorization, scope, exact-byte CAS, slot, resource and streaming models.
define('ABSPATH', sys_get_temp_dir() . '/mbb-collections-model-not-web/');
function add_action(...$args) {}
function add_filter($name, $callback, $priority = 10, $arguments = 1)
{
    $GLOBALS['modelFilters'][$name][$priority][] = $callback;
}
function do_action(...$args) {}
function mbb_t($s)
{
    return $s;
}
function mbb_error($code, $message, $status = 409)
{
    return ['error' => $code, 'status' => $status, 'message' => $message];
}
function mbb_references_fresh_user()
{
    if (!$GLOBALS['sessionValid']) {
        $GLOBALS['actor'] = 0;
    }
}
function get_current_user_id()
{
    return $GLOBALS['actor'];
}
function wp_get_session_token()
{
    return 'synthetic-session';
}
function current_user_can($cap, $id = null)
{
    if (isset($GLOBALS['capHook'])) {
        $GLOBALS['capHook']($cap, $id);
    }
    return $GLOBALS['actor'] > 0 && !in_array($cap . ':' . $id, $GLOBALS['denied'], true);
}
function get_option($key, $default = null)
{
    return $default;
}
function get_site_option($key, $default = null)
{
    return $default;
}
function wp_cache_delete(...$args)
{
    $GLOBALS['cleared'][] = $args;
}
function mbb_component_json($v)
{
    return json_encode(
        $v,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS,
    );
}
function mbb_resource_root()
{
    return $GLOBALS['privateRoot'];
}
function mbb_resource_private_owner($path)
{
    if (is_link($path) || fileowner($path) !== posix_geteuid()) {
        throw new RuntimeException('collection_storage:503');
    }
}
function mbb_references_snapshot($id, $edit = false)
{
    $s = $GLOBALS['snapshots'][$id] ?? null;
    if (!$s || ($edit && !current_user_can('edit_post', $id))) {
        throw new RuntimeException('collection_unavailable:404');
    }
    if (isset($GLOBALS['convertHook'])) {
        $GLOBALS['convertHook']($id);
    }
    return $s;
}
function mbb_references_fresh_post($id)
{
    return $GLOBALS['snapshots'][$id]['post'] ?? ($GLOBALS['attachments'][$id] ?? null);
}
function mbb_references_readable($p)
{
    return $p && current_user_can('read_post', $p->ID);
}
function mbb_references_pair_hash($p)
{
    return $GLOBALS['snapshots'][$p->ID]['hash'];
}
function mbb_token($p)
{
    return hash('sha256', serialize($p));
}
function mbb_managed($id)
{
    return isset($GLOBALS['snapshots'][$id]);
}
function mbb_id($id)
{
    return $GLOBALS['snapshots'][$id]['document']['documentId'];
}
function get_permalink($p)
{
    return 'https://collection.invalid/article/' . $p->ID;
}
function mbb_block_adapter_digest()
{
    return str_repeat('a', 64);
}
function mbb_references_control()
{
    return ['state' => 'ready', 'active_generation' => 1];
}
function mbb_references_tables()
{
    return ['claims' => 'claims'];
}
function mbb_component_descriptors($s)
{
    return [];
}
function mbb_component_provider(...$args)
{
    return null;
}
function get_posts($args)
{
    return ($args['post_type'] ?? '') === 'post' ? $GLOBALS['companionPosts'] ?? [] : [];
}
function get_post_meta($id, $key, $single = true)
{
    return $GLOBALS['companionMeta'][$id][$key] ?? '';
}
function metadata_exists($type, $id, $key)
{
    return array_key_exists($key, $GLOBALS['companionMeta'][$id] ?? []);
}
function get_locale()
{
    return 'en_US';
}
function pagenest_companion_feature($feature)
{
    return $GLOBALS['companionEnabled'] ?? true;
}
function pagenest_companion_config($key)
{
    return ['document_meta' => '_model_doc', 'series_order' => $GLOBALS['companionRank'] ?? []];
}
function pagenest_companion_post_setting($id, $key)
{
    return $GLOBALS['companionValues'][$id][$key] ?? '';
}
function get_post_field($key, $id)
{
    return ($GLOBALS['attachments'][$id] ?? null)->$key ?? null;
}
function mbb_export_media_file($file)
{
    if (!is_file($file) || is_link($file)) {
        throw new RuntimeException('collection_changed:409');
    }
    return $file;
}
function status_header($status)
{
    $GLOBALS['httpStatus'] = $status;
}
function rest_convert_error_to_response($error)
{
    return new WP_REST_Response(
        [
            'code' => $error['error'],
            'message' => $error['message'],
            'data' => ['status' => $error['status']],
        ],
        $error['status'],
    );
}
function clean_post_cache($id) {}
function mbb_export_plan($s, $format, $map = null, $fresh = false)
{
    if ($format !== 'collection-media' || $map !== [] || !$fresh) {
        throw new RuntimeException('unsafe map');
    }
    return ['retainedImages' => [], 'resources' => [], 'files' => [], 'mappings' => []];
}
function wp_salt($s)
{
    return 'synthetic-collection-model-salt';
}
class CollectionRequest implements ArrayAccess
{
    public function __construct(public array $data) {}
    public function get_route()
    {
        return '/mbb/v1/collections/jobs/' . ($this->data['token'] ?? '') . '/download';
    }
    public function get_json_params()
    {
        return array_diff_key($this->data, ['token' => true]);
    }
    public function offsetExists(mixed $k): bool
    {
        return isset($this->data[$k]);
    }
    public function offsetGet(mixed $k): mixed
    {
        return $this->data[$k] ?? null;
    }
    public function offsetSet(mixed $k, mixed $v): void
    {
        $this->data[$k] = $v;
    }
    public function offsetUnset(mixed $k): void
    {
        unset($this->data[$k]);
    }
}
class WP_REST_Response
{
    public function __construct(public $data, public $status = 200, public $headers = []) {}
    public function set_status($status)
    {
        $this->status = $status;
    }
    public function get_status()
    {
        return $this->status;
    }
    public function set_data($data)
    {
        $this->data = $data;
    }
    public function set_headers($headers)
    {
        $this->headers = $headers;
    }
    public function get_headers()
    {
        return $this->headers;
    }
    public function get_data()
    {
        return $this->data;
    }
}
// Exercise the real safe HTML projection against small canonical fragments.
require_once dirname(__DIR__) . '/plugin/static-export.php';
require_once dirname(__DIR__) . '/plugin/collections.php';
// Core installs its default CORS callback after plugin registration in real REST.
// Reproduce that order: equal priorities would send bytes before these headers.
function rest_send_cors_headers($served)
{
    check(ob_get_length() === 0, 'CORS headers must precede every response byte');
    $GLOBALS['corsHandled'] = true;
    return $served;
}
add_filter('rest_pre_serve_request', 'rest_send_cors_headers', 10, 4);
function collection_model_serve($response, $request)
{
    $filters = $GLOBALS['modelFilters']['rest_pre_serve_request'];
    ksort($filters, SORT_NUMERIC);
    $served = false;
    $GLOBALS['corsHandled'] = false;
    foreach ($filters as $callbacks) {
        foreach ($callbacks as $callback) {
            $served = $callback($served, $response, $request, null);
        }
    }
    check($GLOBALS['corsHandled'], 'actual registered filter chain includes CORS');
    return $served;
}

function wp_json_encode($value)
{
    return mbb_component_json($value);
}
$referenceFunctions = file_get_contents(dirname(__DIR__) . '/plugin/references.php');
$begin = strpos($referenceFunctions, 'function mbb_references_static_links(');
$end = strpos($referenceFunctions, 'function mbb_references_provenance(', $begin);
eval(substr($referenceFunctions, $begin, $end - $begin));
class CollectionModelDB
{
    public $options = 'wp_options',
        $last_error = '';
    public $data = [],
        $claims = [],
        $race = null;
    function prepare($sql, ...$args)
    {
        return ['sql' => $sql, 'args' => $args];
    }
    function get_var($q)
    {
        return $this->data[$q['args'][0]] ?? null;
    }
    function get_row($q, $mode = null)
    {
        return $this->claims[$q['args'][1] . ':' . $q['args'][2]] ?? null;
    }
    function query($q)
    {
        [$sql, $a] = [$q['sql'], $q['args']];
        if ($this->race) {
            $f = $this->race;
            $this->race = null;
            $f($this);
        }
        if (str_starts_with($sql, 'INSERT')) {
            if (isset($this->data[$a[0]])) {
                return 0;
            }
            $this->data[$a[0]] = $a[1];
            return 1;
        }
        if (!str_contains($sql, 'BINARY option_value=BINARY')) {
            throw new RuntimeException('Missing binary CAS');
        }
        if (str_starts_with($sql, 'DELETE')) {
            if (($this->data[$a[0]] ?? null) !== $a[1]) {
                return 0;
            }
            unset($this->data[$a[0]]);
            return 1;
        }
        if (($this->data[$a[1]] ?? null) !== $a[2]) {
            return 0;
        }
        $this->data[$a[1]] = $a[0];
        return 1;
    }
}
define('ARRAY_A', 'ARRAY_A');
$GLOBALS['wpdb'] = new CollectionModelDB();
$GLOBALS['actor'] = 7;
$GLOBALS['sessionValid'] = true;
$GLOBALS['denied'] = [];
$GLOBALS['cleared'] = [];
$GLOBALS['privateRoot'] = sys_get_temp_dir() . '/mbb-collection-model-' . bin2hex(random_bytes(8));
mkdir($GLOBALS['privateRoot'], 0700);
function check($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function rejects(callable $fn, $code = null)
{
    try {
        $fn();
    } catch (Throwable $e) {
        if ($code !== null) {
            check(str_starts_with($e->getMessage(), $code), 'Wrong rejection: ' . $e->getMessage());
        }
        return;
    }
    throw new RuntimeException('Expected rejection');
}
function snapshot($id, $status = 'publish')
{
    $p = (object) [
        'ID' => $id,
        'post_type' => 'post',
        'post_status' => $status,
        'post_password' => '',
        'post_title' => 'Chapter ' . $id,
    ];
    return [
        'post' => $p,
        'document' => [
            'source' => '# Chapter ' . $id,
            'serialized' => '<p>Chapter ' . $id . '</p>',
            'documentId' => 'MODEL-' . $id,
        ],
        'hash' => hash('sha256', 'pair' . $id),
        'expected' => hash('sha256', serialize($p)),
        'projection' => ['identity' => null, 'objects' => [], 'edges' => []],
    ];
}
$config = [
    'schema' => 1,
    'title' => 'Collection',
    'lang' => 'zh-CN',
    'rights' => '作者声明',
    'cover' => null,
    'privateOptIn' => false,
    'chapters' => [['key' => 'C_' . str_repeat('1', 32), 'post_id' => 12]],
];
$GLOBALS['snapshots'] = [12 => snapshot(12), 13 => snapshot(13, 'draft'), 14 => snapshot(14)];
try {
    check(mbb_collections_config($config) === $config, 'config exact');
    foreach (
        [
            'privateOptIn' => 1,
            'cover' => true,
            'lang' => 'x',
            'chapters' => [['key' => 'C_' . str_repeat('1', 32), 'post_id' => '12']],
        ]
        as $key => $bad
    ) {
        $c = $config;
        $c[$key] = $bad;
        rejects(fn() => mbb_collections_config($c));
    }
    $c = $config;
    $c['unknown'] = 'x';
    rejects(fn() => mbb_collections_config($c));
    $c = $config;
    $c['chapters'][] = $c['chapters'][0];
    rejects(fn() => mbb_collections_config($c));
    check(
        mbb_collections_id('B_' . str_repeat('a', 32)) &&
            !mbb_collections_token('B_' . str_repeat('a', 32)),
        'disjoint routes',
    );
    check(mbb_collections_cas('test', null, 'Case'), 'first insert');
    check(!mbb_collections_cas('test', null, 'other'), 'insert conflict');
    check(!mbb_collections_cas('test', 'case', 'other'), 'case-sensitive compare');
    $GLOBALS['wpdb']->race = fn($db) => ($db->data['test'] = 'newer');
    check(!mbb_collections_cas('test', 'Case', 'lost'), 'update race');
    check($GLOBALS['wpdb']->data['test'] === 'newer', 'winner preserved');
    check(count($GLOBALS['cleared']) > 0, 'option caches cleared');
    $s = mbb_collections_snapshot($config, 'snapshot-v1');
    check($s['manifest']['chapters'][0]['scope'] === 'public', 'public scope');
    check(
        !str_contains(mbb_collections_json($s['manifest']), 'post_id'),
        'manifest excludes post ids',
    );
    check(
        $s['sha256'] === mbb_collections_snapshot($config, 'snapshot-v1')['sha256'],
        'deterministic manifest',
    );
    $c = $config;
    $c['chapters'][0]['post_id'] = 13;
    rejects(fn() => mbb_collections_snapshot($c, 'snapshot-v1'), 'collection_scope');
    $c['privateOptIn'] = true;
    check(
        mbb_collections_snapshot($c, 'snapshot-v1')['manifest']['chapters'][0]['scope'] ===
            'selected-private',
        'explicit private',
    );
    $GLOBALS['snapshots'][12]['post']->post_password = 'secret';
    rejects(fn() => mbb_collections_snapshot($config, 'snapshot-v1'), 'collection_scope');
    $GLOBALS['snapshots'][12]['post']->post_password = '';
    $GLOBALS['denied'] = ['edit_post:12'];
    rejects(fn() => mbb_collections_snapshot($config, 'snapshot-v1'), 'collection_unavailable');
    $GLOBALS['denied'] = [];
    $GLOBALS['convertHook'] = function ($id) {
        if ($id === 14) {
            $GLOBALS['denied'] = ['edit_post:12'];
        }
    };
    $c = $config;
    $c['chapters'][] = ['key' => 'C_' . str_repeat('2', 32), 'post_id' => 14];
    rejects(fn() => mbb_collections_snapshot($c, 'snapshot-v1'));
    unset($GLOBALS['convertHook']);
    $GLOBALS['denied'] = [];
    $GLOBALS['snapshots'][12]['post']->post_title = 'changed';
    check(
        !mbb_collections_final_stamp($s['stamps'][$config['chapters'][0]['key']], true, false),
        'model expected baseline',
    );
    $GLOBALS['snapshots'][12]['post']->post_title = 'Chapter 12';
    $target = [
        'namespace' => 'S_' . str_repeat('a', 32),
        'document' => 'D_' . str_repeat('b', 32),
        'target' => 'eq',
        'kind' => 'equation',
    ];
    $tuple = mbb_collections_tuple($target);
    $object = [
        'id' => 'eq',
        'title' => 'Secret title',
        'kind' => 'equation',
        'displayKind' => 'equation',
        'number' => 1,
    ];
    $GLOBALS['snapshots'][13]['projection'] = [
        'identity' => array_intersect_key($target, array_flip(['namespace', 'document'])),
        'objects' => ['eq' => $object],
        'edges' => [],
    ];
    $GLOBALS['wpdb']->claims[$tuple] = [
        'post_id' => 13,
        'pair_hash' => $GLOBALS['snapshots'][13]['hash'],
    ];
    $outside = [];
    check(
        mbb_collections_references([$target], [], $outside)[0]['resolved'] === [
            'state' => 'unavailable',
        ],
        'unselected private target unavailable',
    );
    check($outside[$tuple] === null, 'private title not retained');
    $outside = [];
    $map = mbb_collections_references(
        [$target],
        [
            $tuple => [
                'key' => 'C_' . str_repeat('2', 32),
                'title' => 'Selected',
                'objects' => ['eq' => $object],
            ],
        ],
        $outside,
    );
    check(str_starts_with($map[0]['resolved']['url'], 'chapters/C_'), 'selected target internal');
    require_once dirname(__DIR__) . '/plugin/references-data.php';
    $body = mbb_collections_body('<p>' . mbb_references_marker($target) . '</p>', $map, [], []);
    check(
        str_contains($body, 'href="chapters/C_') && !str_contains($body, 'data-mbb-namespace'),
        'real static link adapter keeps selected cross-chapter links',
    );
    $token = str_repeat('a', 64);
    $j = mbb_collections_reserve(7, $token);
    $dir = mbb_collections_directory($token, true);
    $lock = fopen($dir . '/lock', 'x+b');
    chmod($dir . '/lock', 0600);
    flock($lock, LOCK_EX);
    mbb_collections_write($dir . '/one', 'a');
    $second = str_repeat('b', 64);
    mbb_collections_reserve(7, $second);
    rejects(fn() => mbb_collections_reserve(7, str_repeat('c', 64)), 'collection_quota');
    $GLOBALS['actor'] = 8;
    mbb_collections_reserve(8, str_repeat('c', 64));
    mbb_collections_reserve(8, str_repeat('d', 64));
    $GLOBALS['actor'] = 9;
    rejects(fn() => mbb_collections_reserve(9, str_repeat('e', 64)), 'collection_quota');
    $expired = $j;
    $expired['expires'] = time() - 1;
    mbb_collections_job_update($token, $expired, $j);
    mbb_collections_cleanup();
    check(is_dir($dir), 'cleanup does not delete in-flight lock');
    flock($lock, LOCK_UN);
    fclose($lock);
    mbb_collections_cleanup();
    check(!is_dir($dir), 'expired private files cleaned');
    $GLOBALS['actor'] = 7;
    $GLOBALS['sessionValid'] = false;
    rejects(fn() => mbb_collections_owner(), 'collection_unavailable');
    $GLOBALS['sessionValid'] = true;
    $GLOBALS['actor'] = 7;
    check(!mbb_register_publication_adapter('unsafe', ['callback' => 'client']), 'adapter closed');
    $GLOBALS['wpdb']->data['mbb_collection_jobs_v1'] = '[]';
    $bid = 'B_' . str_repeat('f', 32);
    $raw = mbb_collections_json(['schema' => 1, 'items' => [$bid => $config]]);
    $GLOBALS['wpdb']->data[mbb_collections_key(7)] = $raw;
    $request = new CollectionRequest([
        'schema' => 1,
        'collection_id' => $bid,
        'revision' => hash('sha256', $raw),
        'adapter' => 'snapshot-v1',
    ]);
    $made = mbb_collections_prepare($request);
    check(isset($made['token']), 'real prepare chain: ' . mbb_component_json($made));
    $request = new CollectionRequest([
        'schema' => 1,
        'receipt' => $made['receipt'],
        'token' => $made['token'],
    ]);
    check(mbb_collections_claim($request, 'confirm')['confirmed'] === true, 'confirm');
    $GLOBALS['snapshots'][12]['post']->post_title = 'late change';
    check(
        (mbb_collections_claim($request, 'download')['error'] ?? null) === 'collection_changed',
        'late baseline rejects download',
    );
    $GLOBALS['snapshots'][12]['post']->post_title = 'Chapter 12';
    $response = mbb_collections_claim($request, 'download');
    check($response instanceof WP_REST_Response, 'stream response');
    $stream = $GLOBALS['mbb_collection_downloads'][spl_object_id($response)];
    $hash = hash_init('sha256');
    hash_update_stream($hash, $stream['handle']);
    check(hash_final($hash) === $made['artifact']['sha256'], 'actual staged ZIP hash');
    $zip = new ZipArchive();
    check($zip->open($stream['dir'] . '/artifact') === true, 'actual snapshot ZIP');
    $manifest = json_decode($zip->getFromName('manifest.json'), true);
    check($manifest['kind'] === 'markbridge-publication-snapshot', 'fixed manifest');
    check($zip->numFiles === 3, 'manifest/css/chapter only');
    $zip->close();
    ob_start();
    check(collection_model_serve($response, $request), 'real stream serve after headers');
    $binary = ob_get_clean();
    check(
        hash('sha256', $binary) === $made['artifact']['sha256'],
        'served bytes exactly match ZIP',
    );
    check(!is_dir($stream['dir']), 'stream cleanup');
    check(!mbb_collections_jobs()[1], 'slot released after streaming');
    foreach (['logout', 'capability', 'catalog', 'body', 'artifact', 'expiry'] as $scenario) {
        $made = mbb_collections_prepare(
            new CollectionRequest([
                'schema' => 1,
                'collection_id' => $bid,
                'revision' => hash('sha256', $raw),
                'adapter' => 'snapshot-v1',
            ]),
        );
        check(isset($made['token']), 'late prepare ' . $scenario);
        $request = new CollectionRequest([
            'schema' => 1,
            'receipt' => $made['receipt'],
            'token' => $made['token'],
        ]);
        check(mbb_collections_claim($request, 'confirm')['confirmed'] === true, 'late confirm');
        $response = mbb_collections_claim($request, 'download');
        check($response instanceof WP_REST_Response, 'late claim');
        $oid = spl_object_id($response);
        if ($scenario === 'logout') {
            $GLOBALS['actor'] = 0;
        }
        if ($scenario === 'capability') {
            $GLOBALS['denied'] = ['edit_post:12'];
        }
        if ($scenario === 'catalog') {
            $GLOBALS['wpdb']->data[mbb_collections_key(7)] = $raw . ' ';
        }
        if ($scenario === 'body') {
            $GLOBALS['snapshots'][12]['post']->post_title = 'changed after dispatch';
        }
        if ($scenario === 'artifact') {
            file_put_contents(
                $GLOBALS['mbb_collection_downloads'][$oid]['dir'] . '/artifact',
                'PRIVATE_ARTIFACT',
            );
        }
        if ($scenario === 'expiry') {
            $GLOBALS['mbb_collection_downloads'][$oid]['job']['expires'] = time() - 1;
            [$jr, $jobs] = mbb_collections_jobs();
            $jobs[$made['token']] = $GLOBALS['mbb_collection_downloads'][$oid]['job'];
            $GLOBALS['wpdb']->data['mbb_collection_jobs_v1'] = mbb_collections_json($jobs);
        }
        ob_start();
        $served = mbb_collections_serve(false, $response, $request, null);
        $output = ob_get_clean();
        check(
            $served &&
                $response->get_status() >= 400 &&
                !isset(
                    $response->headers['Content-Length'],
                    $response->headers['Content-Disposition'],
                    $response->headers['X-MBB-Collection'],
                ) &&
                !str_starts_with($output, 'PK') &&
                !str_contains($output, 'PRIVATE_ARTIFACT') &&
                is_array(json_decode($output, true)),
            'serve boundary blocks ' . $scenario,
        );
        check(!isset($GLOBALS['mbb_collection_downloads'][$oid]), 'failed handoff cleaned');
        $GLOBALS['actor'] = 7;
        $GLOBALS['denied'] = [];
        $GLOBALS['wpdb']->data[mbb_collections_key(7)] = $raw;
        $GLOBALS['snapshots'][12]['post']->post_title = 'Chapter 12';
    }
    $asset = $GLOBALS['privateRoot'] . '/asset';
    file_put_contents($asset, 'synthetic attachment bytes');
    $GLOBALS['attachments'][99] = (object) [
        'ID' => 99,
        'post_type' => 'attachment',
        'post_parent' => 12,
    ];
    $terminal = mbb_collections_snapshot($config, 'snapshot-v1');
    $terminal['outside'] = [mbb_collections_stamp($GLOBALS['snapshots'][14])];
    $terminal['assets'] = [
        [
            'id' => 99,
            'file' => $asset,
            'sha256' => hash_file('sha256', $asset),
            'bytes' => filesize($asset),
            'parent' => 12,
            'edit' => false,
            'binding' => hash('sha256', mbb_collections_json(['', ''])),
        ],
    ];
    $GLOBALS['capHook'] = function ($cap, $id) {
        if ($cap === 'read_post' && $id === 99) {
            $GLOBALS['snapshots'][14]['post']->post_status = 'private';
        }
    };
    rejects(fn() => mbb_collections_final($terminal, $config, 'snapshot-v1'), 'collection_changed');
    check(
        $GLOBALS['snapshots'][14]['post']->post_status === 'private',
        'attachment capability hook executed',
    );
    unset($GLOBALS['capHook']);
    $GLOBALS['snapshots'][14]['post']->post_status = 'publish';
    unlink($asset);
    // The author client may fetch fixed inputs repeatedly, but only a fresh,
    // confirmed projection receives a one-shot download authorization.
    $clientFile = $GLOBALS['privateRoot'] . '/client.js';
    file_put_contents($clientFile, 'fixed provider code');
    check(
        mbb_register_publication_client_adapter(
            'model-client',
            [
                'contract' => 'mbb-publication-adapter/v1',
                'version' => '0.1.0',
                'fingerprint' => hash('sha256', 'model-client'),
                'title' => 'Model client',
                'extension' => 'zip',
                'mime' => 'application/zip',
                'build' => 'mbb_collections_snapshot_zip',
            ],
            [['file' => $clientFile, 'sha256' => hash_file('sha256', $clientFile)]],
        ),
        'trusted client registration',
    );
    foreach (
        ['success', 'logout', 'consume-session', 'consume-capability', 'consume-body']
        as $scenario
    ) {
        $GLOBALS['actor'] = 7;
        $GLOBALS['sessionValid'] = true;
        $GLOBALS['denied'] = [];
        $made = mbb_collections_prepare(
            new CollectionRequest([
                'schema' => 1,
                'collection_id' => $bid,
                'revision' => hash('sha256', $raw),
                'adapter' => 'model-client',
            ]),
        );
        check(
            isset($made['client']['fingerprint']),
            'client prepare ' . $scenario . ':' . json_encode($made),
        );
        $request = new CollectionRequest([
            'schema' => 1,
            'receipt' => $made['receipt'],
            'token' => $made['token'],
        ]);
        for ($fetch = 0; $fetch < 2; $fetch++) {
            $response = mbb_collections_claim($request, 'inputs');
            check($response instanceof WP_REST_Response, 'nonconsuming input claim');
            ob_start();
            mbb_collections_serve(false, $response, $request, null);
            $input = ob_get_clean();
            check(hash('sha256', $input) === $made['artifact']['sha256'], 'fixed input bytes');
            check(isset(mbb_collections_jobs()[1][$made['token']]), 'input did not consume job');
        }
        check(mbb_collections_claim($request, 'confirm')['confirmed'] === true, 'client confirm');
        $request = new CollectionRequest([
            'schema' => 1,
            'token' => $made['token'],
            'receipt' => $made['receipt'],
            'snapshot_sha256' => $made['snapshot_sha256'],
            'provider_fingerprint' => $made['client']['fingerprint'],
            'projection_sha256' => str_repeat('a', 64),
            'projection_bytes' => 1234,
        ]);
        $response = mbb_collections_client_download($request);
        check($response instanceof WP_REST_Response, 'client grant callback');
        if ($scenario === 'logout') {
            $GLOBALS['actor'] = 0;
        }
        if (str_starts_with($scenario, 'consume-')) {
            $GLOBALS['wpdb']->race = function () use ($scenario) {
                if ($scenario === 'consume-session') {
                    $GLOBALS['sessionValid'] = false;
                }
                if ($scenario === 'consume-capability') {
                    $GLOBALS['denied'] = ['edit_post:12'];
                }
                if ($scenario === 'consume-body') {
                    $GLOBALS['snapshots'][12]['post']->post_title = 'CAS hook mutation';
                }
            };
        }
        ob_start();
        collection_model_serve($response, $request);
        $grant = json_decode(ob_get_clean(), true);
        check(
            ($grant['authorized'] ?? false) === ($scenario === 'success'),
            'terminal grant ' . $scenario . ':' . json_encode($grant),
        );
        check(!mbb_collections_jobs()[1], 'client slot released');
        $GLOBALS['actor'] = 7;
        $GLOBALS['sessionValid'] = true;
        $GLOBALS['denied'] = [];
        $GLOBALS['snapshots'][12]['post']->post_title = 'Chapter 12';
    }
    unlink($clientFile);
    $GLOBALS['companionPosts'] = [
        $GLOBALS['snapshots'][12]['post'],
        $GLOBALS['snapshots'][14]['post'],
    ];
    $GLOBALS['companionMeta'] = [12 => ['_model_doc' => 'B'], 14 => ['_model_doc' => 'A']];
    $GLOBALS['companionValues'] = [
        12 => ['series' => 'Series', 'order' => '1'],
        14 => ['series' => 'Series', 'order' => '2'],
    ];
    $GLOBALS['companionRank'] = ['A', 'B'];
    $importRequest = new CollectionRequest(['schema' => 1, 'post_id' => 12]);
    $imported = mbb_collections_import_companion($importRequest);
    check(
        array_column($imported['config']['chapters'], 'post_id') === [14, 12],
        'Companion explicit rank before numeric order',
    );
    $GLOBALS['companionRank'] = [];
    $imported = mbb_collections_import_companion($importRequest);
    check(
        array_column($imported['config']['chapters'], 'post_id') === [12, 14],
        'Companion numeric order',
    );
    $GLOBALS['companionValues'][12]['order'] = '2';
    $imported = mbb_collections_import_companion($importRequest);
    check(
        array_column($imported['config']['chapters'], 'post_id') === [14, 12],
        'Companion doc marker tie break',
    );
    $GLOBALS['companionValues'][12]['series'] = '';
    $imported = mbb_collections_import_companion($importRequest);
    check(
        count($imported['config']['chapters']) === 2,
        'Empty seed series includes marked public candidates as Companion does',
    );
    $GLOBALS['companionPosts'] = array_fill(0, 201, $GLOBALS['snapshots'][12]['post']);
    check(
        (mbb_collections_import_companion($importRequest)['error'] ?? '') ===
            'collection_companion',
        'bounded candidate admission',
    );
    $GLOBALS['companionPosts'] = [
        $GLOBALS['snapshots'][12]['post'],
        $GLOBALS['snapshots'][14]['post'],
    ];
    $GLOBALS['companionEnabled'] = false;
    check(
        (mbb_collections_import_companion($importRequest)['error'] ?? '') ===
            'collection_companion',
        'disabled provider',
    );
    $GLOBALS['companionEnabled'] = true;
    $GLOBALS['companionValues'][12]['order'] = '1';
    $GLOBALS['convertHook'] = function ($id) {
        if ($id === 14) {
            $GLOBALS['denied'] = ['edit_post:12'];
        }
    };
    check(
        (mbb_collections_import_companion($importRequest)['error'] ?? '') === 'collection_changed',
        'Companion late first chapter permission revoke',
    );
    unset($GLOBALS['convertHook']);
    $GLOBALS['denied'] = [];
    echo "Collection config, exact CAS, scoped references, fresh permissions, bounded slots and cleanup models passed\n";
} finally {
    foreach (glob($GLOBALS['privateRoot'] . '/collections-v1/*') ?: [] as $d) {
        if (is_dir($d)) {
            mbb_collections_remove($d);
        }
    }
    if (is_dir($GLOBALS['privateRoot'] . '/collections-v1')) {
        rmdir($GLOBALS['privateRoot'] . '/collections-v1');
    }
    rmdir($GLOBALS['privateRoot']);
}
