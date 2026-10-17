<?php
// Storage/CAS model; real conversion and WP authentication are covered by paired-backups-save.php.
define('ABSPATH', __DIR__);
define('DB_NAME', 'synthetic');
define('DB_USER', 'synthetic');
define('DB_PASSWORD', 'synthetic');
define('DB_HOST', 'synthetic');
function add_action(...$args) {}
function mbb_t($s)
{
    return $s;
}
class WP_Error
{
    public function __construct(public $code, public $message) {}
}
function mbb_error($code, $message)
{
    return new WP_Error($code, $message);
}
function is_wp_error($v)
{
    return $v instanceof WP_Error;
}
$options = [];
$optionCache = [];
$negative = [];
$disconnected = false;
function get_option($k, $default = false)
{
    global $options, $optionCache, $negative;
    if (isset($negative[$k])) {
        return $default;
    }
    if (array_key_exists($k, $optionCache)) {
        return $optionCache[$k];
    }
    if (!array_key_exists($k, $options)) {
        $negative[$k] = true;
        return $default;
    }
    return $optionCache[$k] = $options[$k];
}
function add_option($k, $value, ...$args)
{
    global $options, $optionCache, $negative, $disconnected;
    if ($disconnected || get_option($k, null) !== null) {
        return false;
    }
    // Reproduce core's INSERT ... ON DUPLICATE KEY UPDATE after a stale negative read.
    $options[$k] = $optionCache[$k] = $value;
    unset($negative[$k]);
    return true;
}
function update_option($k, $v, ...$args)
{
    global $options, $optionCache, $negative, $disconnected;
    if ($disconnected) {
        return false;
    }
    $options[$k] = $optionCache[$k] = $v;
    unset($negative[$k]);
    return true;
}
function delete_option($k)
{
    global $options, $optionCache, $negative, $disconnected;
    if ($disconnected || get_option($k, null) === null) {
        return false;
    }
    unset($options[$k], $optionCache[$k]);
    $negative[$k] = true;
    return true;
}
function get_current_blog_id()
{
    return 1;
}
function get_current_user_id()
{
    return 4;
}
function absint($v)
{
    return abs((int) $v);
}
function clean_post_cache($id) {}
function clean_user_cache($id) {}
function wp_roles()
{
    return new class {
        public $role_key = 'test_user_roles';
        function for_site($id) {}
    };
}
function wp_cache_delete($key, $group)
{
    global $optionCache, $negative;
    if ($group === 'options') {
        if ($key === 'notoptions') {
            $negative = [];
        } else {
            unset($optionCache[$key]);
        }
    }
}
function wp_set_current_user($id) {}
function wp_get_session_token()
{
    return '';
}
$context = [
    'siteKey' => 's',
    'userKey' => 'u',
    'postId' => 12,
    'identity' => 'i',
    'permission' => 'p',
    'baseline' => 'b',
    'sourceManaged' => false,
    'sourceDigest' => null,
];
function mbb_recovery_context($r)
{
    global $context;
    return $context;
}
function get_post($id)
{
    return (object) ['post_modified_gmt' => '2026-10-17 00:00:00'];
}
function wp_json_encode($v)
{
    return json_encode($v);
}
function mbb_convert($v)
{
    global $onConvert;
    if ($onConvert) {
        $callback = $onConvert;
        $onConvert = null;
        $callback();
    }
    return $v;
}
$onConvert = null;
function mbb_candidate($r)
{
    return [
        'document' => ['source' => $r['source'], 'serialized' => 'blocks', 'documentId' => 'TEST'],
    ];
}
class wpdb
{
    public $prefix = 'test_';
    public $base_prefix = 'test_';
    function __construct(...$args) {}
    function set_prefix($value)
    {
        $this->prefix = $value;
    }
    function set_blog_id($value) {}
    function suppress_errors($value) {}
    function close() {}
    function prepare($sql, $v)
    {
        return $sql;
    }
    function get_var($sql)
    {
        return '1';
    }
    function check_connection($allow_bail = true)
    {
        return true;
    }
}
$wpdb = new wpdb();
require __DIR__ . '/../plugin/paired-backups.php';
class Request extends ArrayObject
{
    public function __construct(public $method, $params = [])
    {
        parent::__construct($params);
    }
    function get_param($k)
    {
        return $this[$k] ?? null;
    }
    function get_method()
    {
        return $this->method;
    }
    function has_param($k)
    {
        return $this->offsetExists($k);
    }
}
function check($v, $message)
{
    if (!$v) {
        throw new RuntimeException($message);
    }
}
$input = [
    'context' => $context,
    'mode' => 'markdown',
    'source' => 'hello',
    'title' => 'Draft',
    'status' => 'draft',
    'featured_media' => 0,
];
for ($i = 0; $i < 12; $i++) {
    $result = mbb_backup_endpoint(new Request('POST', $input));
    check(!is_wp_error($result), 'create');
}
check(count($result['items']) === 10, '10 item bound');
check(count($options) === 11, 'separate records and small index');
$key = $result['items'][0]['key'];
$negative[MBB_BACKUP_INDEX] = true;
unset($optionCache[MBB_BACKUP_INDEX]);
$fromStaleNegative = mbb_backup_endpoint(new Request('GET'));
check(
    count($fromStaleNegative['items']) === 10,
    'lock refresh defeats stale negative index overwrite',
);
check(!isset($result['items'][0]['payload']), 'list never returns body');
$context['baseline'] = 'new';
check(is_wp_error(mbb_backup_endpoint(new Request('POST', $input))), 'original baseline CAS');
$record = mbb_backup_endpoint(new Request('POST', ['key' => $key, 'context' => $context]));
check($record['context']['baseline'] === 'b', 'old backup never silently rebased');

$onConvert = function () {
    global $context;
    $context['permission'] = 'revoked';
};
check(
    is_wp_error(mbb_backup_endpoint(new Request('POST', ['key' => $key, 'context' => $context]))),
    'prepare rechecks permissions after conversion',
);
$context['permission'] = 'p';
$onConvert = function () {
    global $context;
    $context['baseline'] = 'raced';
};
$raceInput = $input;
$raceInput['context'] = $context;
check(
    is_wp_error(mbb_backup_endpoint(new Request('POST', $raceInput))),
    'candidate baseline rechecked after conversion',
);
$context['baseline'] = 'new';
$context['userKey'] = 'another';
check(
    is_wp_error(mbb_backup_endpoint(new Request('POST', ['key' => $key, 'context' => $context]))),
    'account isolation',
);
$context['userKey'] = 'u';
$index = mbb_backup_index();
$index[$key]['expires'] = time() - 1;
mbb_backup_store_index($index);
$result = mbb_backup_endpoint(new Request('GET'));
check(count($result['items']) === 9 && get_option($key, null) === null, 'lazy expiry');
$index = mbb_backup_index();
$index['_mbb_backup_' . str_repeat('0', 32)] = [
    'post' => 13,
    'user' => 8,
    'expires' => time() + 100,
    'bytes' => MBB_BACKUP_BYTES,
    'ready' => true,
];
mbb_backup_store_index($index);
$input['context'] = $context;
check(is_wp_error(mbb_backup_endpoint(new Request('POST', $input))), 'global byte quota');
check(
    count(array_filter(mbb_backup_index(), fn($e) => $e['post'] === 12)) === 9,
    'quota failure preserves old recovery points',
);
check(
    (new MBB_Backup_DB())->check_connection() === false,
    'no automatic reconnect or SQL replay while locked',
);

$index = mbb_backup_index();
unset($index['_mbb_backup_' . str_repeat('0', 32)]);
mbb_backup_store_index($index);
$disconnected = true;
$lost = mbb_backup_endpoint(new Request('POST', $input));
check(is_wp_error($lost), 'lost locked connection fails instead of replaying writes');
$disconnected = false;
echo "paired backups model OK\n";
