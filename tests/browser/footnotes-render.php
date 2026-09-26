<?php
// Render synthetic stored markup with the production renderer, without WordPress or a database.
define('ABSPATH', __DIR__);
function add_filter($name, $callback, $priority = 10, $args = 1) {}
function add_action($name, $callback, $priority = 10, $args = 1) {}
function esc_attr($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function esc_html($value)
{
    return esc_attr($value);
}
require __DIR__ . '/../../plugin/footnotes.php';
$body = <<<'HTML'
<p>First<span class="mbb-footnote-ref" data-mbb-footnote="note">[^note]</span>, repeated<span class="mbb-footnote-ref" data-mbb-footnote="note">[^note]</span>, other<span class="mbb-footnote-ref" data-mbb-footnote="other">[^other]</span>.</p>
<div style="height:900px" aria-hidden="true"></div>
<section class="wp-block-mbb-footnotes mbb-footnotes"><ol>
<li class="wp-block-mbb-footnote" data-mbb-footnote="other"><p>Defined first but referenced second.</p></li>
<li class="wp-block-mbb-footnote" data-mbb-footnote="note"><p>First note with <strong>bold</strong> and <code>[^literal]</code>.</p><p>Second note paragraph.</p></li>
</ol></section>
HTML;
echo '<article id="document-one">' . mbb_render_footnotes($body) . '</article>';
echo '<article id="document-two">' . mbb_render_footnotes($body) . '</article>';
