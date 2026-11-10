<?php
define('ABSPATH', '/synthetic/');
/** Actual preview scope and entry permission with in-memory WordPress rendering stubs. No DB. */
function add_action(...$args) {}
function add_filter($name, $callback, $priority = 10, ...$args)
{
    $GLOBALS['filters'][$name][$priority][] = $callback;
}
function remove_filter($name, $callback, $priority = 10)
{
    $GLOBALS['filters'][$name][$priority] = array_values(
        array_filter(
            $GLOBALS['filters'][$name][$priority] ?? [],
            static fn($registered) => $registered !== $callback,
        ),
    );
}
class WP_Error
{
    public function __construct(public $code, public $message, public $data = []) {}
}
function is_wp_error($value)
{
    return $value instanceof WP_Error;
}
function absint($value)
{
    return abs((int) $value);
}
function is_user_logged_in()
{
    return $GLOBALS['loggedIn'];
}
function current_user_can(...$args)
{
    return $GLOBALS['allowed'];
}
function get_post_meta($id, $key, ...$args)
{
    return $key === '_mbb_origin' ? ($GLOBALS['managed'] ? 'markdown_import' : '') : '';
}
function __($text, ...$args)
{
    return $text;
}
// Navigation HTML handling is stubbed here; actual core navigation is covered by WP integration.
class WP_HTML_Tag_Processor
{
    private bool $visited = false;
    public function __construct(private string $html) {}
    public function next_tag()
    {
        if ($this->visited) {
            return false;
        }
        return $this->visited = true;
    }
    public function get_attribute_names_with_prefix($prefix)
    {
        return [];
    }
    public function set_attribute($name, $value) {}
    public function get_updated_html()
    {
        return $this->html;
    }
}
function parse_blocks($serialized)
{
    return [
        [
            'blockName' => 'core/paragraph',
            'attrs' => [],
            'innerHTML' => $serialized,
            'innerContent' => [$serialized],
            'innerBlocks' => [],
        ],
    ];
}
function render_block($block)
{
    author_preview_check(markbridge_is_author_preview(), 'Renderer missing trusted context');
    if ($GLOBALS['during'] ?? null) {
        $GLOBALS['during']();
    }
    $html = $block['innerHTML'];
    foreach ($GLOBALS['filters']['render_block'] ?? [] as $callbacks) {
        foreach ($callbacks as $callback) {
            $html = $callback($html, $block);
        }
    }
    return $html;
}
function do_blocks($serialized)
{
    author_preview_check(markbridge_is_author_preview(), 'Fallback missing trusted context');
    $GLOBALS['fallbackCalls']++;
    if ($GLOBALS['fallbackThrows'] ?? false) {
        throw new RuntimeException('fallback-failure');
    }
    return $serialized;
}
function mbb_component_static_document($html, $serialized, $locale)
{
    author_preview_check(markbridge_is_author_preview(), 'Projection missing trusted scope');
    $GLOBALS['projectionCalls']++;
    $GLOBALS['projectionSerialized'] = $serialized;
    if ($GLOBALS['duringProjection'] ?? null) {
        $GLOBALS['duringProjection']();
    }
    return $html;
}
function mbb_render_footnotes($html)
{
    return $html;
}
require dirname(__DIR__) . '/plugin/editor-bridge.php';
function author_preview_check($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
$request = new class {
    public $postId = 0;
    public function get_param($key)
    {
        return $this->postId;
    }
};
$GLOBALS['loggedIn'] = $GLOBALS['allowed'] = $GLOBALS['managed'] = true;
$GLOBALS['fallbackCalls'] = $GLOBALS['projectionCalls'] = 0;
$document = ['source' => "Candidate\n", 'serialized' => '<p>Candidate</p>'];
author_preview_check(!markbridge_is_author_preview(), 'Context active before preview');
$result = MBB_Author_Preview::render($request, $document, $document);
author_preview_check(
    $result['html'] === $document['serialized'] && $result['navigation'] !== null,
    'Normal navigation render failed',
);
author_preview_check(!markbridge_is_author_preview(), 'Context leaked after normal preview');
author_preview_check(
    $GLOBALS['projectionCalls'] === 0,
    'Plain document entered component projection',
);
$projected = ['source' => 'different source', 'serialized' => '<p>Projected</p>'];
$result = MBB_Author_Preview::render($request, $document, $projected);
author_preview_check($result['html'] === $projected['serialized'], 'Projected fallback failed');
author_preview_check(
    $GLOBALS['projectionCalls'] === 0,
    'Plain fallback entered component projection',
);
$component = [
    'source' => "Candidate\n",
    'serialized' =>
        '<!-- wp:mbb/component {"id":"preview","component":"synthetic","componentVersion":"0.1.0","params":{}} --><section id="preview">Candidate</section><!-- /wp:mbb/component -->',
];
MBB_Author_Preview::render($request, $component, $component);
author_preview_check($GLOBALS['projectionCalls'] === 1, 'Normal component preview projected twice');
$componentProjected = ['source' => 'different source', 'serialized' => $component['serialized']];
MBB_Author_Preview::render($request, $document, $componentProjected);
author_preview_check(
    $GLOBALS['projectionSerialized'] === $componentProjected['serialized'],
    'Projection did not use projected candidate bytes',
);
author_preview_check(
    $GLOBALS['projectionCalls'] === 2,
    'Fallback component preview projected twice',
);
$GLOBALS['during'] = static function () use ($request, $document, $projected) {
    $GLOBALS['during'] = null;
    MBB_Author_Preview::render($request, $document, $projected);
    author_preview_check(markbridge_is_author_preview(), 'Nested preview cleared outer context');
    throw new RuntimeException('navigation-failure');
};
MBB_Author_Preview::render($request, $document, $document);
author_preview_check(!markbridge_is_author_preview(), 'Context leaked after navigation fallback');
author_preview_check(empty($GLOBALS['filters']['render_block'][PHP_INT_MAX]), 'Anchor hook leaked');
$GLOBALS['fallbackThrows'] = true;
try {
    MBB_Author_Preview::render($request, $document, $projected);
    throw new RuntimeException('Expected fallback exception');
} catch (RuntimeException $error) {
    author_preview_check($error->getMessage() === 'fallback-failure', 'Exception swallowed');
}
author_preview_check(!markbridge_is_author_preview(), 'Context leaked after escaping exception');
$GLOBALS['fallbackThrows'] = false;
$GLOBALS['duringProjection'] = static function () {
    throw new RuntimeException('projection-failure');
};
try {
    MBB_Author_Preview::render($request, $component, $component);
    throw new RuntimeException('Expected projection exception');
} catch (RuntimeException $error) {
    author_preview_check(
        $error->getMessage() === 'projection-failure',
        'Projection error swallowed as navigation fallback',
    );
}
author_preview_check(!markbridge_is_author_preview(), 'Projection exception leaked scope');
$GLOBALS['duringProjection'] = static function () {
    $GLOBALS['allowed'] = false;
};
author_preview_check(
    is_wp_error(MBB_Author_Preview::render($request, $component, $component)),
    'Projection permission revocation leaked result',
);
$GLOBALS['duringProjection'] = null;
$GLOBALS['allowed'] = true;
foreach (['loggedIn', 'allowed', 'managed'] as $key) {
    $GLOBALS[$key] = false;
    $request->postId = $key === 'managed' ? 42 : 0;
    author_preview_check(
        is_wp_error(mbb_preview($request)),
        'Direct preview failed permission check',
    );
    author_preview_check(
        is_wp_error(MBB_Author_Preview::render($request, $document, $document)),
        'Scope bypassed author permission',
    );
    author_preview_check(!markbridge_is_author_preview(), 'Denied preview enabled context');
    $GLOBALS[$key] = true;
}
echo "Author preview: direct permission, navigation/fallback, nested scope and exception cleanup passed\n";
