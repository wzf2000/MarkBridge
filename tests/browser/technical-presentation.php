<?php
// Synthetic display fixture. Paired grammar and actual saves are tested separately.
function mbb_t($text)
{
    return $text;
}
require dirname(__DIR__, 2) . '/plugin/technical.php';
if (in_array($argv[1] ?? '', ['author-year', 'numeric'], true)) {
    require dirname(__DIR__, 2) . '/plugin/includes/php-converter/Worker.php';
    $csl = json_decode(file_get_contents(__DIR__ . '/../fixtures/csl.json'), true)['cases'][0][
        'input'
    ];
    $entries = \MarkBridge\Probe\Bibliography::parseCSL($csl)['entries'];
    $entries[] = array_replace($entries[0], [
        'key' => 'Second',
        'title' => 'A second explicit work',
    ]);
    $source =
        '<span class="mbb-cite" data-mbb-keys="Paper,Second" data-mbb-version="1">[Paper,Second]</span>' .
        "\n\n:::mbb:v2 bibliography " .
        json_encode(
            ['id' => 'references', 'entries' => $entries, 'style' => $argv[1]],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ) .
        "\n\n:::mbb:end\n";
    $pair = \MarkBridge\Probe\Worker::convert([
        'mode' => 'markdown',
        'source' => $source,
        'documentId' => 'BIB_READING',
    ]);
    if (!$pair['ok']) {
        throw new RuntimeException('Synthetic bibliography conversion failed');
    }
    if (($argv[2] ?? '') === 'static') {
        require dirname(__DIR__, 2) . '/plugin/static-export.php';
        function mbb_export_throw($code, $message): never
        {
            throw new RuntimeException($code . ':' . $message);
        }
        echo mbb_static_export_body($pair['document']['serialized']);
    } else {
        echo mbb_render_technical($pair['document']['serialized']);
    }
    exit();
}
function tech_ref($target)
{
    return '<span class="mbb-xref" data-mbb-target="' .
        $target .
        '" data-mbb-version="1">[' .
        $target .
        ']</span>';
}
$proof =
    '<details id="proof-route" class="mbb-technical-statement" data-mbb-statement-kind="proof" data-mbb-teaching="native-details"><summary class="mbb-technical-heading">A short proof with a long descriptive title</summary><div class="mbb-technical-body"><p id="proof-paragraph">Substitute the value and simplify. This authored paragraph remains the same node.</p><figure id="eq-later" class="mbb-technical-object" data-mbb-object-kind="equation"><div class="mbb-technical-body"><pre class="wp-block-mbb-math"><code>\\frac{a}{d}+x^2</code></pre></div><figcaption class="mbb-technical-caption">A ratio and a square.</figcaption></figure></div></details>';
$fold =
    '<div id="fold-proof" class="wp-block-mbb-collapse" data-mbb-teaching="collapse" data-mbb-teaching-config=\'{"open":false}\'><p class="mbb-teaching-title" data-mbb-generated>Reasoning</p><div class="mbb-teaching-body">' .
    $proof .
    '</div></div>';
$source =
    '<article class="mbb-document"><h1>Technical article</h1><p>Read ' .
    tech_ref('proof-route') .
    ', then inspect ' .
    tech_ref('eq-later') .
    '.</p><div id="technical-course" class="wp-block-mbb-steps" data-mbb-teaching="steps" data-mbb-teaching-config=\'{"mode":"staged","previous":true,"next":true,"full":true}\'><p class="mbb-teaching-title" data-mbb-generated>From statement to proof</p><div class="mbb-teaching-body"><div id="technical-one" data-mbb-teaching="step"><p class="mbb-teaching-title" data-mbb-generated>Statement</p><div class="mbb-teaching-body"><p>First consider the claim.</p></div></div><div id="technical-two" data-mbb-teaching="step"><p class="mbb-teaching-title" data-mbb-generated>Proof and equation</p><div class="mbb-teaching-body">' .
    $fold .
    '</div></div></div></div><p>A source <span class="mbb-cite" data-mbb-keys="source-one" data-mbb-version="1">[source-one]</span>.</p><section id="sources" class="mbb-bibliography"><p class="mbb-bibliography-title">Bibliography</p><ol><li data-mbb-bib-key="source-one"><span class="mbb-bib-authors">Example Author</span><span class="mbb-bib-title">A technical source</span><span class="mbb-bib-year">2026</span><span class="mbb-bib-source">A journal</span><span class="mbb-bib-url">https://example.invalid/source</span></li></ol></section></article>';
echo mbb_render_technical($source);
