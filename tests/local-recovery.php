<?php
// Pure PHP permission/context contracts; no database, credentials or actual WordPress session.
define('ABSPATH', __DIR__ . '/synthetic/');
$logged = true;
$userId = 7;
$home = 'http://synthetic.invalid';
$caps = ['edit_posts' => true, 'edit_post' => true, 'publish_posts' => false];
$sourceCapability = 'edit_post';
$meta = [
    '_mbb_origin' => 'markdown_import',
    '_mbb_document_id' => 'RECOVERY',
    '_mbb_source_managed' => '',
    '_mbb_source_path_hash' => '',
];
$post = (object) array_fill_keys(
    [
        'post_content',
        'post_content_filtered',
        'post_title',
        'post_status',
        'post_excerpt',
        'post_name',
        'post_date',
        'post_date_gmt',
        'post_password',
        'comment_status',
        'ping_status',
    ],
    'synthetic',
);
$post->ID = 12;
$post->post_author = 7;
$post->post_type = 'post';
$post->post_status = 'draft';
$post->post_parent = $post->menu_order = 0;
class WP_Error
{
    public function __construct(public $code, public $message = '', public $data = []) {}
}
class Request
{
    public function __construct(private $id = 12, private $key = null) {}
    public function get_param($k)
    {
        return $k === 'post_id' ? $this->id : $this->key;
    }
}
function add_action(...$args) {}
// These synthetic recovery fixtures have no assigned taxonomy terms.
function wp_get_object_terms($post, $taxonomy, $args)
{
    return [];
}
function add_filter(...$args) {}
function is_user_logged_in()
{
    return $GLOBALS['logged'];
}
function current_user_can($cap, ...$args)
{
    return $GLOBALS['logged'] && ($GLOBALS['caps'][$cap] ?? false);
}
function get_current_user_id()
{
    return $GLOBALS['userId'];
}
function wp_get_current_user()
{
    return (object) ['allcaps' => $GLOBALS['caps']];
}
function home_url($path = '')
{
    return $GLOBALS['home'] . $path;
}
function get_current_blog_id()
{
    return 1;
}
function wp_salt($scheme)
{
    return 'synthetic-recovery-binding-salt';
}
function absint($value)
{
    return abs((int) $value);
}
function get_post($id)
{
    return $id === 12 ? $GLOBALS['post'] : null;
}
function get_post_meta($id, $key, ...$args)
{
    return $GLOBALS['meta'][$key] ?? '';
}
function wp_json_encode($v)
{
    return json_encode($v);
}
function is_wp_error($v)
{
    return $v instanceof WP_Error;
}
function get_object_taxonomies(...$args)
{
    return [];
}
function get_registered_meta_keys(...$args)
{
    return [];
}
function get_post_thumbnail_id(...$args)
{
    return 0;
}
function get_page_template_slug(...$args)
{
    return '';
}
function is_sticky(...$args)
{
    return false;
}
function admin_url($path)
{
    return '/admin/' . $path;
}
function get_preview_post_link(...$args)
{
    return '/preview';
}
function mbb_source_target($post)
{
    return ['path' => '/synthetic/private/source.md'];
}
function mbb_source_fingerprint($target)
{
    return ['sha256' => hash('sha256', 'synthetic file')];
}
function apply_filters($hook, $v, ...$args)
{
    return $hook === 'mbb_source_write_capability' ? $GLOBALS['sourceCapability'] : $v;
}
require __DIR__ . '/../plugin/editor-bridge.php';
function recovery_assert($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
$first = mbb_recovery_context(new Request());
recovery_assert(is_array($first) && $first['postId'] === 12, 'Authorized context rejected');
recovery_assert(
    !str_contains(wp_json_encode($first), 'synthetic') && !isset($first['document']),
    'Context leaked a body or path',
);
$post->post_title = 'changed';
$changed = mbb_recovery_context(new Request());
recovery_assert(
    $first['baseline'] !== $changed['baseline'] && $first['identity'] === $changed['identity'],
    'Content baseline changed article identity',
);
$meta['_mbb_source_managed'] = 'file';
$meta['_mbb_source_path_hash'] = hash('sha256', '/synthetic/private/source.md');
$source = mbb_recovery_context(new Request());
recovery_assert(
    $source['identity'] !== $changed['identity'] &&
        $source['sourceManaged'] &&
        $source['sourceWriteAvailable'],
    'Source binding/write scope omitted',
);
$sourceCapability = 'manage_options';
$readonly = mbb_recovery_context(new Request());
recovery_assert(
    !$readonly['sourceWriteAvailable'] && $readonly['permission'] !== $source['permission'],
    'Source write permission fingerprint stayed stale',
);
$meta['_mbb_source_path_hash'] = hash('sha256', '/synthetic/private/other.md');
recovery_assert(
    mbb_recovery_context(new Request())['identity'] !== $source['identity'],
    'Moved source binding reused a recovery identity',
);
$userId = 8;
recovery_assert(
    mbb_recovery_context(new Request())['userKey'] !== $first['userKey'],
    'Another author shared scope',
);
$home = 'http://another.invalid';
recovery_assert(
    mbb_recovery_context(new Request())['siteKey'] !== $first['siteKey'],
    'Another site shared scope',
);
$new = mbb_recovery_context(new Request(0, str_repeat('a', 32)));
recovery_assert(
    $new['identity'] === mbb_recovery_context(new Request(0, str_repeat('a', 32)))['identity'] &&
        $new['identity'] !== mbb_recovery_context(new Request(0, str_repeat('b', 32)))['identity'],
    'Unsaved identity unstable or collided',
);
recovery_assert(
    mbb_recovery_context(new Request(0, 'bad')) instanceof WP_Error,
    'Invalid new identity accepted',
);
$caps['edit_posts'] = false;
$caps['edit_pages'] = true;
$post->post_type = 'page';
recovery_assert(
    mbb_recovery_config() !== null && is_array(mbb_recovery_context(new Request())),
    'A page-only editor lost an authorized managed page context',
);
recovery_assert(
    mbb_recovery_context(new Request(0, str_repeat('a', 32)))->code === 'forbidden',
    'Page-only role gained new post permission',
);
$caps['edit_posts'] = true;
$caps['edit_pages'] = false;
$post->post_type = 'post';
$logged = false;
recovery_assert(
    mbb_recovery_config() === null &&
        mbb_recovery_context(new Request())->code === 'recovery_auth_expired',
    'Anonymous context exposed',
);
$logged = true;
$caps['edit_post'] = false;
recovery_assert(
    mbb_recovery_context(new Request())->code === 'forbidden',
    'Lost article permission admitted recovery',
);
$caps['edit_post'] = true;
$meta['_mbb_origin'] = 'native';
recovery_assert(
    mbb_recovery_context(new Request())->code === 'origin',
    'Non-managed article entered recovery',
);
$meta['_mbb_origin'] = 'markdown_import';
foreach (['trash', 'auto-draft'] as $state) {
    $post->post_status = $state;
    recovery_assert(
        mbb_recovery_context(new Request())->code === 'inactive',
        'Inactive article permitted restoration',
    );
}
$post->post_status = 'draft';
$post->post_type = 'attachment';
recovery_assert(
    mbb_recovery_context(new Request())->code === 'inactive',
    'Non-article post type admitted recovery',
);
$post = null;
recovery_assert(
    mbb_recovery_context(new Request())->code === 'not_found',
    'Deleted article admitted recreation',
);
echo "Recovery current-user permissions, article/source/new identity, baseline and private projection contracts passed.\n";
