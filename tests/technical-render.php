<?php
// Derived display tests deliberately do not load WordPress or write a document.
function mbb_t($text)
{
    return $text === 'Proof' && ($GLOBALS['technical_fixture_locale'] ?? '') === 'zh_CN'
        ? '证明'
        : $text;
}
require dirname(__DIR__) . '/plugin/technical.php';
function technical_assert($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function technical_object($id, $kind, $caption)
{
    return '<figure id="' .
        $id .
        '" class="mbb-technical-object" data-mbb-object-kind="' .
        $kind .
        '"><div class="mbb-technical-body"><pre><code>x</code></pre></div><figcaption class="mbb-technical-caption">' .
        $caption .
        '</figcaption></figure>';
}
function technical_ref($id)
{
    return '<span class="mbb-xref" data-mbb-target="' .
        $id .
        '" data-mbb-version="1">[' .
        $id .
        ']</span>';
}
function technical_cite($keys)
{
    return '<span class="mbb-cite" data-mbb-keys="' .
        $keys .
        '" data-mbb-version="1">[' .
        $keys .
        ']</span>';
}
function technical_document($html)
{
    $dom = new DOMDocument();
    $old = libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8"?><main>' . $html . '</main>');
    libxml_clear_errors();
    libxml_use_internal_errors($old);
    return [$dom, new DOMXPath($dom)];
}
$bib =
    '<section id="refs" class="mbb-bibliography"><p class="mbb-bibliography-title">Bibliography</p><ol>';
foreach (['unused', 'alpha', 'beta'] as $key) {
    $url = $key === 'alpha' ? 'https://example.test/paper?a=1&amp;b=2' : '';
    $bib .=
        '<li data-mbb-bib-key="' .
        $key .
        '"><span class="mbb-bib-authors">A &amp; B</span><span class="mbb-bib-title">&lt;img src=x onerror=bad()&gt; ' .
        $key .
        '</span><span class="mbb-bib-year">2026</span><span class="mbb-bib-source">Journal</span><span class="mbb-bib-url">' .
        $url .
        '</span></li>';
}
$bib .= '</ol></section>';
$source =
    '<p>See ' .
    technical_ref('eq-b') .
    ' and ' .
    technical_cite('beta,alpha') .
    '.</p>' .
    technical_object('eq-a', 'equation', 'First equation') .
    technical_object('fig-a', 'figure', 'Figure') .
    technical_object('eq-b', 'equation', 'Second equation') .
    '<details id="proof-a" class="mbb-technical-statement" data-mbb-statement-kind="proof"><summary class="mbb-technical-heading">Reason</summary><div class="mbb-technical-body"><p>Proof body.</p></div></details>' .
    '<p>' .
    technical_ref('proof-a') .
    ' ' .
    technical_cite('alpha,beta') .
    '</p>' .
    $bib;
$rendered = mbb_render_technical($source);
[$dom, $xpath] = technical_document($rendered);
technical_assert(
    $xpath->query('//span[@class="mbb-xref"]//a')->item(0)->textContent === 'Equation 2',
    'References must use target order, not reference encounter order.',
);
technical_assert(
    $xpath->query('//*[@id="fig-a"]//span[@class="mbb-technical-number"]')->item(0)->textContent ===
        'Figure 1. ',
    'Object kinds require independent counters.',
);
technical_assert(
    $xpath->query('//span[@class="mbb-xref"]//a')->item(1)->textContent === 'Proof 1',
    'Proof is a separately numbered target.',
);
technical_assert(
    !$dom->getElementById('proof-a')->hasAttribute('open'),
    'Numbering cannot open a proof.',
);
foreach ($xpath->query('//span[@class="mbb-cite"]/span[@data-mbb-generated]') as $cite) {
    technical_assert(
        $cite->textContent === '(A & B, 2026a; A & B, 2026b)',
        'Groups use authored author/year labels and disambiguation without changing saved keys.',
    );
}
$keys = [];
foreach ($xpath->query('//section[@id="refs"]/ol/li') as $entry) {
    $keys[] = $entry->getAttribute('data-mbb-bib-key');
}
technical_assert(
    $keys === ['beta', 'alpha', 'unused'],
    'First cited entries precede unreferenced entries.',
);
technical_assert($xpath->query('//img')->length === 0, 'Bibliographic HTML must remain literal.');
technical_assert(
    $xpath->query('//span[@class="mbb-bib-url"]/a')->length === 1,
    'Only a safe URL becomes a link.',
);
technical_assert(
    $xpath->query('//span[@class="mbb-cite"]//a')->item(0)->getAttribute('href') ===
        '#' . $xpath->query('//section[@id="refs"]/ol/li')->item(0)->getAttribute('id'),
    'Citations must link to the matching entry.',
);
[$authored, $authoredXPath] = technical_document($source);
$projection = $dom->cloneNode(true);
$projectionXPath = new DOMXPath($projection);
foreach (iterator_to_array($projectionXPath->query('//*[@data-mbb-generated]')) as $generated) {
    $generated->parentNode->removeChild($generated);
}
technical_assert(
    $projectionXPath->query('//p')->item(0)->textContent ===
        $authoredXPath->query('//p')->item(0)->textContent,
    'Derived numbers changed the authored paragraph identity.',
);
technical_assert(
    mbb_render_technical($rendered) === $rendered,
    'Derived rendering must be idempotent.',
);
$moved = mbb_render_technical(
    str_replace(technical_object('eq-a', 'equation', 'First equation'), '', $source),
);
technical_assert(
    str_contains($moved, '>Equation 1</a>'),
    'Removing an earlier object updates its reference label.',
);
foreach (
    [
        $source . '<div id="eq-a">Duplicate</div>',
        technical_ref('missing') . $source,
        technical_cite('missing') . $source,
        technical_cite('alpha,alpha') . $source,
    ]
    as $invalid
) {
    technical_assert(
        mbb_render_technical($invalid) === $invalid,
        'Ambiguous legacy display must not acquire guessed links.',
    );
}
$literal = '<pre><code>&lt;span class="mbb-xref"&gt;[literal]&lt;/span&gt;</code></pre>';
technical_assert(
    mbb_render_technical($literal) === $literal,
    'Code samples must stay byte-identical.',
);
foreach (
    [
        'javascript:bad()',
        'https://name:secret@example.test/',
        'data:text/html,bad',
        "https://example.test/\nx",
    ]
    as $url
) {
    technical_assert(!mbb_technical_url($url), 'Unsafe or credential-bearing URL admitted.');
}
require dirname(__DIR__) . '/plugin/includes/php-converter/Worker.php';
require dirname(__DIR__) . '/plugin/static-export.php';
function mbb_export_throw($code, $message): never
{
    throw new RuntimeException($code . ':' . $message);
}
$csl = json_decode(file_get_contents(__DIR__ . '/fixtures/csl.json'), true)['cases'][0]['input'];
$entries = \MarkBridge\Probe\Bibliography::parseCSL($csl)['entries'];
$entries[] = array_replace($entries[0], ['key' => 'Second', 'title' => 'Second work']);
foreach (['author-year', 'numeric'] as $style) {
    $source =
        technical_cite('Second,Paper') .
        "\n\n:::mbb:v2 bibliography " .
        json_encode(
            ['id' => 'v2-refs', 'entries' => $entries, 'style' => $style],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ) .
        "\n\n:::mbb:end\n";
    $pair = \MarkBridge\Probe\Worker::convert([
        'mode' => 'markdown',
        'source' => $source,
        'documentId' => 'RENDER_BIB_V2',
    ]);
    technical_assert($pair['ok'], 'v2 render conversion');
    $html = mbb_render_technical($pair['document']['serialized']);
    [$dom, $xp] = technical_document($html);
    $label = $xp->query('//span[@class="mbb-reference-label"]')->item(0)->textContent;
    technical_assert(
        $xp->query('//span[@class="mbb-bib-number"]')->length === ($style === 'numeric' ? 2 : 0),
        'numeric entries have explicit generated numbers only',
    );
    technical_assert(
        !str_contains($pair['document']['serialized'], 'mbb-bib-number'),
        'numbers are never canonical data',
    );
    technical_assert(
        $style === 'numeric'
            ? $label === '[1, 2]'
            : str_contains($label, '2024a') &&
                str_contains($label, '2024b') &&
                str_contains($label, 'Ada de Lovelace Jr.'),
        'fixed citation style',
    );
    technical_assert(
        str_contains($html, 'DOI 10.1234/example') &&
            str_contains($html, 'Proceedings') &&
            str_contains($html, '2024-02-29'),
        'full metadata remains readable',
    );
    technical_assert(mbb_render_technical($html) === $html, 'v2 rendering is idempotent');
    $static = mbb_static_export_body($pair['document']['serialized']);
    [$staticDom, $staticXp] = technical_document($static);
    technical_assert(
        $staticXp->query('//span[@class="mbb-bib-number"]')->length ===
            ($style === 'numeric' ? 2 : 0),
        'static export preserves numeric entry labels',
    );
    technical_assert(
        $staticXp->query('//span[@class="mbb-reference-label"]')->item(0)->textContent === $label,
        'static export uses the same fixed style',
    );
}
echo "Technical display: independent order, citation styles, safe URLs, literal code, bibliography v2 metadata/static parity and idempotence passed.\n";

// Reading placement is derived only: original title children, body IDs and ref numbering survive.
foreach (['en_US', 'zh_CN'] as $locale) {
    $GLOBALS['technical_fixture_locale'] = $locale;
    foreach (
        ['Proof', '证明', '證明', '<em id="authored-title-node">By induction</em>']
        as $title
    ) {
        $input =
            '<details id="proof-title" class="mbb-technical-statement" data-mbb-statement-kind="proof"><summary class="mbb-technical-heading">' .
            $title .
            '</summary><div class="mbb-technical-body"><p id="authored-proof-body">Exact authored body.</p></div></details>' .
            technical_ref('proof-title');
        $before = $input;
        $output = mbb_render_technical($input);
        [$d, $xp] = technical_document($output);
        $summary = $xp->query('//*[@id="proof-title"]/summary')->item(0);
        technical_assert(
            $summary->textContent === ($locale === 'zh_CN' ? '证明1.' : 'Proof 1.'),
            'Proof bar duplicates title or changes locale number',
        );
        technical_assert(
            $input === $before &&
                $d->getElementById('authored-proof-body')->textContent === 'Exact authored body.',
            'Derived proof changed source/body',
        );
        technical_assert(
            $xp->query('//span[@class="mbb-xref"]//a')->item(0)->textContent ===
                ($locale === 'zh_CN' ? '证明 1' : 'Proof 1'),
            'Proof reference label changed',
        );
        if (str_contains($title, 'By induction')) {
            $node = $d->getElementById('authored-title-node');
            technical_assert(
                $node &&
                    $node->parentNode->getAttribute('class') === 'mbb-proof-title' &&
                    $node->parentNode->parentNode->getAttribute('class') === 'mbb-technical-body',
                'Authored title node was lost rather than moved into body',
            );
        } else {
            $stored = $xp->query('//*[contains(@class,"mbb-proof-default-title")]')->item(0);
            technical_assert(
                $stored && $stored->hasAttribute('hidden') && $stored->textContent === $title,
                'Default title must remain present but visually omitted',
            );
        }
        technical_assert(
            mbb_render_technical($output) === $output,
            'Proof reading render not idempotent',
        );
    }
}
unset($GLOBALS['technical_fixture_locale']);
echo "Proof title placement/default retention, locale bar/ref labels and exact body/source passed.\n";
