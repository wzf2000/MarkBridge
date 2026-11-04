<?php
// Real read/write resolvers and digest: no WordPress database or filesystem writes outside fixtures.
class WP_Error
{
    public function __construct(public $code, public $message, public $data = []) {}
}
function get_post($id)
{
    return (object) ['ID' => $id];
}
function get_post_meta($id, $key, $single = true)
{
    return $GLOBALS['meta'][$key] ?? '';
}
function apply_filters($name, $value, ...$args)
{
    if ($name === 'mbb_source_write_capability') {
        return $GLOBALS['writeCapability'] ?? 'edit_post';
    }
    if ($name === 'mbb_source_write_target') {
        $GLOBALS['writeCalls']++;
        return $GLOBALS['writeTarget'];
    }
    return $GLOBALS['readTarget'];
}
function register_activation_hook(...$args) {}
function add_action(...$args) {}
function add_filter(...$args) {}
function current_user_can(...$args)
{
    return $GLOBALS['canWrite'] ?? true;
}
function is_wp_error($v)
{
    return $v instanceof WP_Error;
}
require dirname(__DIR__) . '/plugin/source-sync.php';
require dirname(__DIR__) . '/plugin/references.php';
function read_check($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function digest_denied($post)
{
    try {
        mbb_references_source_digest($post, true);
        throw new RuntimeException('Invalid source accepted');
    } catch (MBB_Reference_Failure $e) {
        read_check($e->diagnostic === 'source_conflict', 'Unexpected source error');
    }
}
$dir = sys_get_temp_dir() . '/mbb-source-read-' . bin2hex(random_bytes(4));
mkdir($dir, 0700);
$path = $dir . '/source.md';
$link = $dir . '/link.md';
file_put_contents($path, "saved source\n");
chmod($path, 0400);
$post = get_post(7);
$post->post_content_filtered = "saved source\n";
$GLOBALS['meta'] = [
    '_mbb_source_managed' => 'file',
    '_mbb_source_path_hash' => hash('sha256', realpath($path)),
];
$GLOBALS['readTarget'] = $path;
$GLOBALS['writeTarget'] = false;
$GLOBALS['writeCalls'] = 0;
try {
    read_check(is_readable($path) && !is_writable($path), 'Run fixture as an unprivileged user');
    read_check(mbb_source_read_target($post) === realpath($path), 'Read-only file rejected');
    read_check(
        mbb_references_source_digest($post, true) === hash('sha256', "saved source\n"),
        'Read-only digest rejected',
    );
    read_check(is_wp_error(mbb_source_target($post)), 'Read target granted writeback');
    $source = mbb_source_editor_read($post);
    read_check(
        !is_wp_error($source) &&
            $source['contents'] === $post->post_content_filtered &&
            !$source['write_available'],
        'Editor read-only source was not available',
    );
    $post->post_content_filtered = 'different saved bytes';
    read_check(
        is_wp_error(mbb_source_editor_read($post)),
        'Read-only editor exposed unsaved bytes',
    );
    $post->post_content_filtered = "saved source\n";
    $GLOBALS['writeTarget'] = $path;
    read_check(is_wp_error(mbb_source_target($post)), 'Write gate accepted read-only file');
    try {
        mbb_references_source_digest($post);
        throw new RuntimeException('Default mutation digest used read authority');
    } catch (MBB_Reference_Failure) {
    }
    $GLOBALS['readTarget'] = null;
    read_check(
        mbb_source_read_target($post) === realpath($path),
        'Legacy write-only mapping rejected',
    );
    foreach ([false, '', new WP_Error('deny', 'denied')] as $deny) {
        $GLOBALS['readTarget'] = $deny;
        $before = $GLOBALS['writeCalls'];
        digest_denied($post);
        read_check(
            $before === $GLOBALS['writeCalls'],
            'Explicit read denial fell back to write mapping',
        );
    }
    $GLOBALS['readTarget'] = $path;
    $GLOBALS['meta']['_mbb_source_path_hash'] = hash('sha256', 'wrong');
    digest_denied($post);
    $GLOBALS['meta']['_mbb_source_path_hash'] = hash('sha256', realpath($path));
    symlink($path, $link);
    $GLOBALS['readTarget'] = $link;
    digest_denied($post);
    $GLOBALS['readTarget'] = $path;
    chmod($path, 0000);
    digest_denied($post);
    chmod($path, 0600);
    $before = mbb_references_source_digest($post, true);
    file_put_contents($path, "changed source\n");
    read_check(
        mbb_references_source_digest($post, true) !== $before,
        'Changed source digest reused',
    );
    // Existing writable integrations must still expose external edits for conflict comparison.
    $source = mbb_source_editor_read($post);
    read_check(
        !is_wp_error($source) &&
            $source['contents'] === "changed source\n" &&
            $source['write_available'],
        'Writable external-edit comparison was disabled',
    );
    $GLOBALS['canWrite'] = false;
    $source = mbb_source_editor_read($post);
    read_check(!is_wp_error($source) && !$source['write_available'], 'Write capability ignored');
    $GLOBALS['canWrite'] = true;
    $other = $dir . '/other.md';
    file_put_contents($other, "changed source\n");
    $GLOBALS['writeTarget'] = $other;
    $post->post_content_filtered = "changed source\n";
    $source = mbb_source_editor_read($post);
    read_check(
        !is_wp_error($source) && !$source['write_available'],
        'Read digest enabled a different write target',
    );
    unlink($other);
    $GLOBALS['writeTarget'] = $path;
    unlink($path);
    digest_denied($post);
    echo "Read-only source, write isolation, legacy mapping, denial, binding, symlink, revoked read and fresh digest passed\n";
} finally {
    if (file_exists($path)) {
        chmod($path, 0600);
        unlink($path);
    }
    if (is_link($link)) {
        unlink($link);
    }
    rmdir($dir);
}
