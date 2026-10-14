<?php
// Product metadata/receipt logic with synthetic WordPress API models; not actual WordPress evidence.
function add_action(...$args) {}
class WP_Error
{
    public function __construct(
        public string $code,
        public string $message = '',
        public array $data = [],
    ) {}
    public function get_error_message()
    {
        return $this->message;
    }
    public function get_error_code()
    {
        return $this->code;
    }
}
function is_wp_error($v)
{
    return $v instanceof WP_Error;
}
function mbb_error($code, $message, $status = 409)
{
    return new WP_Error($code, $message, ['status' => $status]);
}
function mbb_component_json($value)
{
    return json_encode(
        $value,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS,
    );
}
function get_current_user_id()
{
    return $GLOBALS['actor'];
}
function get_current_blog_id()
{
    return $GLOBALS['blog'];
}
function home_url($suffix = '')
{
    return 'http://markbridge.invalid' . $suffix;
}
function wp_salt($scheme)
{
    return 'synthetic-test-secret-not-production';
}
function get_post_thumbnail_id($id)
{
    return 0;
}
function wp_get_object_terms($id, $tax, $args)
{
    return $args['fields'] === 'slugs' ? ['existing'] : [2];
}
function get_taxonomy($name)
{
    return (object) ['cap' => (object) ['assign_terms' => 'assign_terms']];
}
function is_object_in_taxonomy($type, $name)
{
    return $type === 'post';
}
function current_user_can($cap)
{
    return $GLOBALS['caps'][$cap] ?? true;
}
function get_term_by($field, $slug, $taxonomy)
{
    return isset($GLOBALS['terms'][$slug])
        ? (object) ['term_id' => $GLOBALS['terms'][$slug], 'slug' => $slug]
        : false;
}
function sanitize_text_field($text)
{
    return strip_tags($text);
}
function wp_kses_post($text)
{
    return str_contains($text, '<script>') ? 'removed' : $text;
}
function wp_attachment_is_image($id)
{
    return $id === 3;
}
function sanitize_title($text)
{
    return strtolower($text);
}
function wp_unique_post_slug($slug, ...$args)
{
    return $slug === 'used' ? $slug . '-2' : $slug;
}
function parse_blocks($serialized)
{
    preg_match('/^<!-- wp:mbb\/frontmatter (\{.*?\}) -->/s', $serialized, $matches);
    return $matches
        ? [['blockName' => 'mbb/frontmatter', 'attrs' => json_decode($matches[1], true)]]
        : [];
}
require dirname(__DIR__) . '/plugin/includes/php-converter/Worker.php';
require dirname(__DIR__) . '/plugin/publication.php';
require dirname(__DIR__) . '/plugin/frontmatter.php';
class FMRequest extends ArrayObject
{
    public function get_param($name)
    {
        return $this[$name] ?? null;
    }
}
function fm_assert($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
$GLOBALS['actor'] = 1;
$GLOBALS['blog'] = 1;
$GLOBALS['caps'] = [];
$GLOBALS['terms'] = ['alpha' => 11, 'tag' => 12];
$source =
    "---\nmarkbridge: 1\ntitle: \"Header title\"\nexcerpt: \"<strong>Excerpt</strong>\"\nslug: \"Target\"\nstatus: \"draft\"\ncategories: [\"alpha\"]\ntags: [\"tag\"]\nfeatured_media: 0\n---\n\nBody\n";
$doc = \MarkBridge\Probe\Worker::convert([
    'mode' => 'markdown',
    'source' => $source,
    'documentId' => 'FMTEST',
]);
fm_assert($doc['ok'], 'Converter fixture failed');
$post = (object) [
    'ID' => 7,
    'post_type' => 'post',
    'post_parent' => 0,
    'post_title' => 'Current title',
    'post_excerpt' => 'Current excerpt',
    'post_name' => 'old',
    'post_status' => 'draft',
];
$base = [
    'document' => $doc['document'],
    'title' => 'Form title',
    'post_id' => 7,
    'expected' => 'base-token',
];
$request = new FMRequest([
    'mode' => 'markdown',
    'post_id' => 7,
    'post_status' => 'draft',
    'featured_media' => 0,
]);
$none = mbb_frontmatter_candidate($request, $post, $base);
fm_assert(
    !is_wp_error($none) && $none['title'] === 'Form title' && $none['frontmatter_applied'] === [],
    'Proposal auto-applied',
);
$request['frontmatter_selected'] = [
    'title',
    'excerpt',
    'slug',
    'categories',
    'tags',
    'status',
    'featured_media',
];
$original = (array) $request;
$candidate = mbb_frontmatter_candidate($request, $post, $base);
fm_assert(!is_wp_error($candidate), 'Selected proposal rejected');
fm_assert((array) $request === $original, 'Candidate mutated the original request');
fm_assert(
    $candidate['title'] === 'Header title' &&
        $candidate['frontmatter_applied']['slug'] === 'target' &&
        $candidate['frontmatter_applied']['categories'] === [11],
    'Metadata/term resolution incorrect',
);
$receipt = mbb_frontmatter_receipt($candidate['frontmatter_binding']);
$request['frontmatter_receipt'] = $receipt;
fm_assert(mbb_frontmatter_verify_receipt($request, $candidate) === true, 'Fresh receipt failed');
foreach (['user', 'site', 'candidate', 'term', 'source', 'selection'] as $case) {
    $GLOBALS['actor'] = 1;
    $GLOBALS['blog'] = 1;
    $GLOBALS['terms']['alpha'] = 11;
    $alter = clone $request;
    $alterBase = $base;
    if ($case === 'user') {
        $GLOBALS['actor'] = 2;
    }
    if ($case === 'site') {
        $GLOBALS['blog'] = 2;
    }
    if ($case === 'candidate') {
        $alterBase['title'] = 'Changed form';
    }
    if ($case === 'term') {
        $GLOBALS['terms']['alpha'] = 13;
    }
    if ($case === 'source') {
        $alter['source_sha256'] = 'changed';
    }
    if ($case === 'selection') {
        $alter['frontmatter_selected'] = ['title'];
    }
    if ($case === 'candidate') {
        $alterBase['document']['source'] .= "Changed body\n";
    }
    $changed = mbb_frontmatter_candidate($alter, $post, $alterBase);
    fm_assert(
        is_wp_error($changed) || is_wp_error(mbb_frontmatter_verify_receipt($alter, $changed)),
        'Receipt accepted changed ' . $case,
    );
}
$GLOBALS['actor'] = 1;
$GLOBALS['blog'] = 1;
$GLOBALS['terms']['alpha'] = 11;
$expired = $candidate['frontmatter_binding'];
$expired['expires'] = time() - 1;
$request['frontmatter_receipt'] = mbb_frontmatter_receipt($expired);
fm_assert(
    is_wp_error(mbb_frontmatter_verify_receipt($request, $candidate)),
    'Expired receipt accepted',
);
$request['frontmatter_receipt'] = $receipt . '.tamper';
fm_assert(
    is_wp_error(mbb_frontmatter_verify_receipt($request, $candidate)),
    'Tampered receipt accepted',
);
$request['mode'] = 'restore';
fm_assert(
    mbb_frontmatter_candidate($request, $post, $base)->code === 'frontmatter_restore',
    'History automatically applied proposal',
);
$request['frontmatter_selected'] = [];
$restored = mbb_frontmatter_candidate($request, $post, $base);
fm_assert($restored['frontmatter']['fields'] === [], 'History exposed header application');
$request['mode'] = 'markdown';
$request['frontmatter_selected'] = ['author'];
fm_assert(
    is_wp_error(mbb_frontmatter_candidate($request, $post, $base)),
    'Unknown selection allowed',
);
$request['frontmatter_selected'] = ['categories'];
$GLOBALS['caps']['assign_terms'] = false;
fm_assert(
    mbb_frontmatter_candidate($request, $post, $base)->data['status'] === 403,
    'Taxonomy capability ignored',
);
$GLOBALS['caps'] = [];
$request['frontmatter_selected'] = ['title'];
$empty = $base;
$empty['title'] = '';
$empty['post_id'] = 0;
$empty['expected'] = null;
fm_assert(
    mbb_frontmatter_candidate($request, null, $empty)['title'] === 'Header title',
    'New empty form title blocked explicit selection',
);
$bare = mbb_frontmatter_candidate(new FMRequest(['mode' => 'markdown']), $post, $base);
fm_assert($bare['title'] === 'Form title', 'Unselected header changed title');
foreach ($bare['frontmatter']['fields'] as $row) {
    if ($row['field'] === 'slug') {
        fm_assert(
            $row['proposal'] === 'Target' && $row['resolved'] === 'target',
            'Slug normalization was not disclosed',
        );
    }
}
echo "FrontMatter explicit selection, copied requests, resolved terms/slug, permissions, site/user/candidate/source receipt binding, expiry and restore separation passed.\n";
