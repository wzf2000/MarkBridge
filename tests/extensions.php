<?php
/** Raw request shape tests, without WordPress authentication/storage. */
function add_action(...$args) {}
function add_filter(...$args) {}
require dirname(__DIR__) . '/plugin/projections.php';
require dirname(__DIR__) . '/plugin/extensions.php';
foreach (['{"post_ids":[1,2]}', '{"post_ids":[999]}'] as $raw) {
    if (!mbb_extensions_usage_ids($raw)) {
        throw new RuntimeException('Valid IDs rejected');
    }
}
foreach (
    [
        '{}',
        '{"post_ids":[]}',
        '{"post_ids":{"0":836}}',
        '{"post_ids":[1],"post_ids":[2]}',
        '{"post_ids":[1],"extra":1}',
        '{"post_ids":[true]}',
        '{"post_ids":[1.0]}',
        '{"post_ids":[-1]}',
        '{"post_ids":["1"]}',
        '{"post_ids":[1,1]}',
        '{"post_ids":' . json_encode(range(1, 51)) . '}',
    ]
    as $raw
) {
    try {
        mbb_extensions_usage_ids($raw);
        throw new LogicException('Invalid raw request admitted: ' . $raw);
    } catch (InvalidArgumentException) {
    }
}
if (
    !mbb_register_extension_manifest('sample', [
        'version' => '0.1.0',
        'title' => 'Sample',
        'minMarkBridge' => '2.9.0-dev.1',
        'capabilities' => ['components'],
    ])
) {
    throw new RuntimeException('manifest');
}
if (
    mbb_register_extension_manifest('sample', [
        'version' => '0.1.0',
        'title' => 'Duplicate',
        'minMarkBridge' => '2.9.0-dev.1',
        'capabilities' => [],
    ])
) {
    throw new RuntimeException('override');
}
echo "Extension raw JSON and closed manifest contracts passed\n";

// Catalog status uses the same real plugin header and PHP comparison as components.
function mbb_references_fresh_user()
{
    if (isset($GLOBALS['search_refresh'])) {
        $GLOBALS['search_refresh']();
    }
}
function get_current_user_id()
{
    return $GLOBALS['search_user'] ?? 1;
}
function current_user_can($cap, $id = 0)
{
    return $cap === 'manage_options'
        ? $GLOBALS['search_manage'] ?? true
        : !in_array($id, $GLOBALS['search_denied'] ?? [], true);
}
function mbb_component_registry()
{
    return [];
}
class WP_REST_Response
{
    public function __construct(public $data, public $status) {}
    public function header(...$args) {}
}
preg_match(
    '/^ \* Version: ([^ \r\n]+)/m',
    file_get_contents(dirname(__DIR__) . '/plugin/markdown-block-bridge.php'),
    $header,
);
$current = $header[1];
$base = explode('-', $current)[0];
$rc = (int) substr(strrchr($current, '.'), 1);
foreach (
    [
        $base . '-dev.1',
        '1.9.0',
        $base . '-rc.' . max(1, $rc - 1),
        $current,
        $base . '-rc.' . ($rc + 1),
        $base,
        '99.0.0-rc.1',
    ]
    as $i => $floor
) {
    $id = 'floor-' . $i;
    if (
        !mbb_register_extension_manifest($id, [
            'version' => '0.1.0',
            'title' => 'Floor test',
            'minMarkBridge' => $floor,
            'capabilities' => [],
        ])
    ) {
        throw new RuntimeException('RC floor registration');
    }
    $expected = version_compare($current, $floor, '<') ? 'version-incompatible' : 'available';
    if (mbb_extensions_catalog()->data['extensions'][$id]['status'] !== $expected) {
        throw new RuntimeException('RC catalog status');
    }
}
foreach (
    [
        '2.9.0-rc',
        '2.9.0-rc.x',
        '2.9.0-rc.1.extra',
        '2.9.0-beta.1',
        '2.9.0-RC.1',
        '2.9.0+meta',
        "2.9.0-rc.1\n",
    ]
    as $floor
) {
    if (
        mbb_register_extension_manifest('bad-floor', [
            'version' => '0.1.0',
            'title' => 'Bad',
            'minMarkBridge' => $floor,
            'capabilities' => [],
        ])
    ) {
        throw new RuntimeException('Unknown minimum suffix accepted');
    }
}
echo "Minimum stable/dev/RC registration and real catalog version comparison passed\n";

// Discovery is independent of logical-identity indexes and never converts article bodies.
class WP_Error
{
    public function __construct(public string $code, public string $message = '') {}
}
function mbb_error($code, $message, $status)
{
    return new WP_Error($code, $message);
}
function mbb_t($message)
{
    return $message;
}
function mbb_references_operation_owner()
{
    return 'session-' . get_current_user_id() . ':' . ($GLOBALS['search_session'] ?? 'initial');
}
function get_transient($key)
{
    return $GLOBALS['search_transients'][$key] ?? false;
}
function set_transient($key, $value, $ttl)
{
    if ($ttl !== 900) {
        throw new RuntimeException('Cursor TTL changed');
    }
    $GLOBALS['search_transients'][$key] = $value;
    return true;
}
function mbb_references_fresh_post($id)
{
    return $GLOBALS['search_posts'][$id] ?? null;
}
function mbb_managed($id)
{
    return !in_array($id, $GLOBALS['search_unmanaged'] ?? [], true);
}
function wp_strip_all_tags($value)
{
    return strip_tags($value);
}
function wp_html_excerpt($value, $length, $more)
{
    return strlen($value) > $length ? substr($value, 0, $length) . $more : $value;
}
class DiscoveryDB
{
    public $posts = 'wp_posts',
        $postmeta = 'wp_postmeta',
        $queries = [];
    function prepare($sql, $after)
    {
        return str_replace('%d', (string) $after, $sql);
    }
    function get_col($sql)
    {
        $this->queries[] = $sql;
        preg_match('/p.ID > (\d+)/', $sql, $match);
        return array_slice(
            array_values(
                array_filter(
                    array_keys($GLOBALS['search_posts']),
                    fn($id) => $id > (int) $match[1],
                ),
            ),
            0,
            201,
        );
    }
}
$wpdb = new DiscoveryDB();
foreach (range(1, 240) as $id) {
    $GLOBALS['search_posts'][$id] = (object) [
        'ID' => $id,
        'post_type' => 'post',
        'post_status' => $id % 2 ? 'draft' : 'private',
        'post_title' => 'Legacy article ' . $id,
    ];
}
$GLOBALS['search_denied'] = [2, 4];
$GLOBALS['search_unmanaged'] = [3];
$first = mbb_extensions_articles(['q' => 'Legacy']);
if (
    $first instanceof WP_Error ||
    count($first->data['items']) !== 20 ||
    $first->data['items'][0]['id'] !== 1 ||
    array_intersect([2, 3, 4], array_column($first->data['items'], 'id')) ||
    isset($first->data['total']) ||
    !$first->data['cursor']
) {
    throw new RuntimeException('Discovery scope, pagination or private totals');
}
foreach ($first->data['items'] as $item) {
    if (array_keys($item) !== ['id', 'title', 'status']) {
        throw new RuntimeException('Discovery exposed extra fields');
    }
}
if (
    !preg_match('/^[a-f0-9]{48}$/D', $first->data['cursor']) ||
    json_decode(base64_decode($first->data['cursor']), true) !== null
) {
    throw new RuntimeException('Client cursor contains a readable scan position');
}
$GLOBALS['search_session'] = 'signed-out-and-back-in';
if (
    !(
        mbb_extensions_articles(['q' => 'Legacy', 'cursor' => $first->data['cursor']]) instanceof
        WP_Error
    )
) {
    throw new RuntimeException('Cursor survived session replacement');
}
unset($GLOBALS['search_session']);
$next = mbb_extensions_articles(['q' => 'Legacy', 'cursor' => $first->data['cursor']]);
if (
    $next instanceof WP_Error ||
    $next->data['items'][0]['id'] <= end($first->data['items'])['id']
) {
    throw new RuntimeException('Discovery cursor repeated results');
}
if (
    !(
        mbb_extensions_articles(['q' => 'Changed', 'cursor' => $first->data['cursor']]) instanceof
        WP_Error
    )
) {
    throw new RuntimeException('Cursor accepted another query');
}
$GLOBALS['search_denied'] = range(1, 240);
$empty = mbb_extensions_articles(['q' => 'Legacy']);
if ($empty instanceof WP_Error || $empty->data['items'] !== [] || !$empty->data['cursor']) {
    throw new RuntimeException('Bounded empty scan lost continuation');
}
if (!str_contains(end($wpdb->queries), 'LIMIT 201')) {
    throw new RuntimeException('Discovery lost its scan bound');
}
$GLOBALS['search_denied'] = [];
$calls = 0;
$GLOBALS['search_refresh'] = static function () use (&$calls) {
    if (++$calls === 23) {
        $GLOBALS['search_denied'] = [1];
    }
};
if (!(mbb_extensions_articles(['q' => 'Legacy']) instanceof WP_Error)) {
    throw new RuntimeException('Late permission loss exposed a partial result');
}
unset($GLOBALS['search_refresh']);
$GLOBALS['search_manage'] = false;
if (!(mbb_extensions_articles(['q' => 'Legacy']) instanceof WP_Error)) {
    throw new RuntimeException('Non-admin discovery admitted');
}
$oldest = mbb_extensions_article_cursor(123456789, 'Legacy');
foreach (range(1, 9) as $n) {
    mbb_extensions_article_cursor(123456789 + $n, 'Legacy');
}
if (count($GLOBALS['search_transients']['mbb_ext_articles_1']) !== 8) {
    throw new RuntimeException('Cursor state exceeds its per-account budget');
}
try {
    mbb_extensions_article_cursor_after($oldest, 'Legacy');
    throw new LogicException('Evicted cursor accepted');
} catch (InvalidArgumentException) {
}
$expired = mbb_extensions_article_cursor(123456789, 'Legacy');
$GLOBALS['search_transients']['mbb_ext_articles_1'][$expired]['expires'] = time() - 1;
try {
    mbb_extensions_article_cursor_after($expired, 'Legacy');
    throw new LogicException('Expired cursor accepted');
} catch (InvalidArgumentException) {
}
echo "Managed article discovery bounds, legacy scope, private fields, cursors and final permission checks passed\n";
