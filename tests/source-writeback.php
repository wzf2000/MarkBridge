<?php
// Isolated checks for the source target and atomic write safety primitives.
class WP_Error
{
    public function __construct(public $code, public $message, public $data = []) {}
}

$mbb_test_meta = [];
$mbb_test_filters = [];
function get_post($id)
{
    return (object) ['ID' => $id];
}
function get_post_meta($id, $key, $single = true)
{
    global $mbb_test_meta;
    return $mbb_test_meta[$id][$key] ?? '';
}
function add_filter($tag, $callback)
{
    global $mbb_test_filters;
    $mbb_test_filters[$tag] = $callback;
}
function apply_filters($tag, $value, ...$args)
{
    global $mbb_test_filters;
    return isset($mbb_test_filters[$tag]) ? $mbb_test_filters[$tag]($value, ...$args) : $value;
}
function mbb_managed($id)
{
    return true;
}
function mbb_is_lab()
{
    return false;
}
function mbb_save($request)
{
    return null;
}
require __DIR__ . '/../plugin/source-sync.php';

$dir = sys_get_temp_dir() . '/mbb-source-writeback-' . bin2hex(random_bytes(4));
mkdir($dir, 0700);
$path = $dir . '/source.md';
file_put_contents($path, "before\n");
$real = realpath($path);
$mbb_test_meta[7] = [
    '_mbb_source_managed' => 'file',
    '_mbb_source_path_hash' => hash('sha256', $real),
];
add_filter('mbb_source_write_target', function ($unused, $post) use (&$path) {
    return $path;
});

assert(mbb_source_target(7) === $real);
assert(mbb_source_fingerprint($real)['contents'] === "before\n");
assert(mbb_source_atomic_write($real, "after\n") === true);
assert(file_get_contents($real) === "after\n");

$mbb_test_meta[7]['_mbb_source_path_hash'] = hash('sha256', $real . 'changed');
$error = mbb_source_target(7);
assert($error instanceof WP_Error && $error->code === 'source_binding');
$mbb_test_meta[7]['_mbb_source_path_hash'] = hash('sha256', $real);
$link = $dir . '/link.md';
symlink($real, $link);
$path = $link;
$error = mbb_source_target(7);
assert($error instanceof WP_Error && $error->code === 'source_target_unavailable');

unlink($link);
unlink($real);
rmdir($dir);
echo "source target, fingerprint, atomic write and symlink checks passed.\n";
