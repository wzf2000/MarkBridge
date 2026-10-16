<?php
/** Pure host-guard tests: real core block/HTML parsers, stubbed local media/capability services; no DB. */
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
if (!$root || !is_file($root . '/wp-includes/class-wp-block-parser.php')) {
    throw new RuntimeException('Set MARKBRIDGE_TEST_WORDPRESS_ROOT to a local core checkout');
}
define('ABSPATH', $root . '/');
foreach (['block', 'frame'] as $name) {
    require $root . '/wp-includes/class-wp-block-parser-' . $name . '.php';
}
require $root . '/wp-includes/class-wp-block-parser.php';
foreach (['span', 'text-replacement', 'attribute-token', 'decoder', 'tag-processor'] as $name) {
    require $root . '/wp-includes/html-api/class-wp-html-' . $name . '.php';
}
class WP_Error
{
    public function __construct(public $code, public $message, public $data) {}
}
function is_wp_error($v)
{
    return $v instanceof WP_Error;
}
function mbb_t($v)
{
    return $v;
}
function parse_blocks($s)
{
    return (new WP_Block_Parser())->parse($s);
}
function get_post_type($id)
{
    return $GLOBALS['media'][$id]['type'] ?? null;
}
function get_post_mime_type($id)
{
    return $GLOBALS['media'][$id]['mime'] ?? false;
}
function current_user_can($cap, $id)
{
    return $GLOBALS['caps'][$cap][$id] ?? false;
}
function get_post($id)
{
    return isset($GLOBALS['media'][$id])
        ? (object) ($GLOBALS['media'][$id] + [
            'ID' => $id,
            'post_parent' => 0,
            'post_password' => '',
        ])
        : null;
}
function wp_get_attachment_url($id)
{
    return $GLOBALS['media'][$id]['url'] ?? false;
}
function wp_get_original_image_url($id)
{
    return $GLOBALS['media'][$id]['original'] ?? false;
}
function wp_get_attachment_image_src($id, $size)
{
    return isset($GLOBALS['media'][$id]['sizes'][$size])
        ? [$GLOBALS['media'][$id]['sizes'][$size], 10, 10]
        : false;
}
require dirname(__DIR__) . '/plugin/native-media.php';
function check($v, $message)
{
    if (!$v) {
        throw new RuntimeException($message);
    }
}
function image($id = 42, $url = 'https://example.invalid/full.png', $size = 'full')
{
    return '<!-- wp:image ' .
        json_encode(['id' => $id, 'sizeSlug' => $size]) .
        ' --><figure class="wp-block-image size-' .
        $size .
        '"><img src="' .
        $url .
        '" class="wp-image-' .
        $id .
        '"/></figure><!-- /wp:image -->';
}
$media = [
    42 => [
        'type' => 'attachment',
        'mime' => 'image/png',
        'url' => 'https://example.invalid/full.png',
        'original' => 'https://example.invalid/original.png',
        'sizes' => ['large' => 'https://example.invalid/large.png'],
    ],
];
$caps = ['edit_post' => [42 => true], 'read_post' => []];
check(mbb_native_media_validate_candidate(image()) === true, 'Owned full attachment');
check(
    mbb_native_media_validate_candidate(image(42, 'https://example.invalid/large.png', 'large')) ===
        true,
    'Exact selected local size',
);
check(
    mbb_native_media_validate_candidate(image(42, 'https://example.invalid/original.png')) === true,
    'Original local image',
);
check(
    mbb_native_media_validate_candidate(
        '<!-- wp:gallery --><figure>' . image() . image() . '</figure><!-- /wp:gallery -->',
    ) === true,
    'Same attachment may appear twice',
);
$error = mbb_native_media_validate_candidate(image(42, 'https://example.invalid/other.png'));
check(is_wp_error($error) && $error->data['status'] === 422, 'Mismatched local URL is rejected');
$caps['edit_post'][42] = false;
$error = mbb_native_media_validate_candidate(image());
check(
    is_wp_error($error) && $error->data['status'] === 403,
    'Current attachment permission is required',
);
$caps['edit_post'][42] = true;
$media[42]['post_parent'] = 7;
$media[7] = ['type' => 'post', 'post_password' => 'secret'];
check(is_wp_error(mbb_native_media_validate_candidate(image())), 'Private parent unreadable');
$caps['read_post'][7] = true;
check(
    is_wp_error(mbb_native_media_validate_candidate(image())),
    'Password parent requires edit permission',
);
$caps['edit_post'][7] = true;
check(mbb_native_media_validate_candidate(image()) === true, 'Authorized password parent');
$error = mbb_native_media_portable_admission(
    '<!-- wp:gallery --><figure>' . image() . '</figure><!-- /wp:gallery -->',
);
check(
    is_wp_error($error) && $error->code === 'media_local_id' && $error->data['status'] === 422,
    'Nested local IDs cannot be portable',
);
check(
    mbb_native_media_portable_admission(
        '<!-- wp:image --><figure><img src="images/a.png"/></figure><!-- /wp:image -->',
    ) === true,
    'No-ID portable image',
);
check(
    is_wp_error(mbb_native_media_validate_candidate(image('42'))),
    'String IDs cannot authorize attachments',
);
echo "Native media host guard: actual core parsers, attachment URL/size, current capability, parent protection, repeated IDs and portable rejection passed\n";
