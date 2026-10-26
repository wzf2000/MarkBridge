<?php
// Read-only synthetic server projection for Publisher browser fixtures; no WordPress/database.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
define('ABSPATH', __DIR__ . '/');
function add_action(...$args) {}
function add_filter(...$args) {}
function register_activation_hook(...$args) {}
function mbb_t($text)
{
    return $text;
}
function wp_json_encode($value)
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
require dirname(__DIR__) . '/plugin/technical.php';
require dirname(__DIR__) . '/plugin/static-export.php';
require dirname(__DIR__) . '/plugin/references.php';
require dirname(__DIR__) . '/plugin/collections-snapshot.php';
$object = [
    'id' => 'pub-eq',
    'kind' => 'equation',
    'displayKind' => 'equation',
    'number' => 1,
    'title' => 'Publication equation',
];
$target = [
    'namespace' => 'S_' . str_repeat('a', 32),
    'document' => 'D_' . str_repeat('b', 32),
    'target' => 'pub-eq',
    'kind' => 'equation',
];
$source =
    '<figure id="pub-eq" class="mbb-technical-object" data-mbb-object-kind="equation"><div class="mbb-technical-body">x</div><figcaption class="mbb-technical-caption">Publication equation</figcaption></figure><p><span class="mbb-xref" data-mbb-target="pub-eq" data-mbb-version="1">[pub-eq]</span> · <a href="#pub-eq">Author wording 42</a></p><p><span class="mbb-xref" data-mbb-version="2" data-mbb-namespace="' .
    $target['namespace'] .
    '" data-mbb-document="' .
    $target['document'] .
    '" data-mbb-target="pub-eq" data-mbb-kind="equation">[pub-eq]</span></p>';
$out = [];
foreach (
    ['body' => ['1', 'A', '2'], 'appendix' => ['A', '1', '1'], 'preface' => [null, '1', '1']]
    as $role => [$prefix, $otherPrefix, $otherKey]
) {
    $plan = mbb_collections_number_objects(['pub-eq' => $object], $prefix);
    $other = $object;
    $other['number'] = $otherPrefix . '.1';
    $resolved = mbb_collections_object(
        $other,
        $target,
        'Other chapter',
        'chapters/C_' . str_repeat($otherKey, 32) . '.html',
    );
    $body = mbb_collections_body(
        $source,
        [['target' => $target, 'resolved' => $resolved]],
        [],
        [],
        $plan['numbers'],
    );
    $out[$role] = [
        'body' => $body,
        'objects' => array_values($plan['objects']),
        'numbering' => [
            'mode' => 'chapter',
            'applied' => array_keys($plan['numbers']),
            'retained' => $plan['retained'],
        ],
    ];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
