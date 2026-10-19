<?php
// Pure display fixture: no WordPress bootstrap, database or saved document mutation.
$locale = ($argv[1] ?? '') === 'zh_CN' ? 'zh_CN' : 'en_US';
function mbb_t($text)
{
    return $text === 'Proof' && $GLOBALS['locale'] === 'zh_CN' ? '证明' : $text;
}
function mbb_export_throw($code, $message): never
{
    throw new RuntimeException($code . ':' . $message);
}
require dirname(__DIR__, 2) . '/plugin/technical.php';
require dirname(__DIR__, 2) . '/plugin/static-export.php';
$source = '';
foreach (
    ['Proof', '证明', '證明', '<em id="named-title-child">An induction argument</em>']
    as $i => $title
) {
    $source .=
        '<details id="proof-example-' .
        $i .
        '" class="mbb-technical-statement" data-mbb-statement-kind="proof"><summary class="mbb-technical-heading">' .
        $title .
        '</summary><div class="mbb-technical-body"><p id="proof-body-' .
        $i .
        '">The authored argument keeps its original paragraph and anchor.</p></div></details>';
}
$source .=
    '<p><span class="mbb-xref" data-mbb-target="proof-example-3" data-mbb-version="1">[proof-example-3]</span></p>';
echo json_encode(
    [
        'html' => mbb_render_technical($source),
        'static' => mbb_static_export_body($source),
        'sourceSha256' => hash('sha256', $source),
    ],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
);
