<?php
// Narrow capability model: nested instances, duplicates, permissions and authority refresh.
function mbb_references_snapshot($id)
{
    if (!$GLOBALS['readable']) {
        throw new RuntimeException('private');
    }
    return [
        'post' => (object) ['post_content' => 'synthetic', 'post_content_filtered' => 'source'],
        'hash' => 'pair',
    ];
}
function mbb_references_final(...$args)
{
    return $GLOBALS['readable'];
}
function mbb_references_fresh_post($id)
{
    return (object) ['post_content_filtered' => 'source'];
}
function parse_blocks($text)
{
    return $GLOBALS['blocks'];
}
function mbb_component_provider(...$args)
{
    return $GLOBALS['provider'];
}
function mbb_component_json($v)
{
    return json_encode($v);
}
function mbb_component_pure_params($v)
{
    return true;
}
function mbb_component_schema(...$args)
{
    return true;
}
function mbb_component_domain_valid(...$args)
{
    return true;
}
function mbb_references_source_digest(...$args)
{
    return $GLOBALS['source'];
}
function get_current_user_id()
{
    return $GLOBALS['user'];
}
function wp_get_session_token()
{
    return $GLOBALS['session'];
}
function mbb_token(...$args)
{
    return $GLOBALS['token'];
}
function markbridge_teaching_component_fingerprint(...$args)
{
    return $GLOBALS['resourceVersion'];
}
function mbb_component_projection_fingerprint(...$args)
{
    return 'typed';
}
function wp_salt(...$args)
{
    return 'synthetic-secret';
}
require dirname(__DIR__) . '/plugin/component-instances.php';
function instance_check($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
$GLOBALS['readable'] = true;
$GLOBALS['user'] = 1;
$GLOBALS['session'] = 'session';
$GLOBALS['token'] = 'version';
$GLOBALS['resourceVersion'] = 'resource';
$GLOBALS['source'] = null;
$file = tempnam(sys_get_temp_dir(), 'mbb-instance-');
file_put_contents($file, 'fixed');
$GLOBALS['provider'] = [
    'status' => 'available',
    'schema' => [],
    'protocolVersion' => 1,
    'resource' => ['file' => $file, 'sha256' => hash_file('sha256', $file)],
];
$block = [
    'blockName' => 'mbb/component',
    'attrs' => [
        'id' => 'instance',
        'component' => 'fixture',
        'componentVersion' => '0.1.0',
        'params' => (object) ['x' => 1],
    ],
];
$GLOBALS['blocks'] = [['blockName' => 'core/group', 'innerBlocks' => [$block]]];
try {
    $s = markbridge_component_instance_snapshot(17, 'instance', 'fixture', '0.1.0');
    instance_check(markbridge_component_instance_final($s), 'Valid snapshot rejected');
    foreach (
        ['params' => (object) ['x' => 2], 'token' => 'forged', 'user' => 2, 'session' => 'forged']
        as $key => $value
    ) {
        $tampered = $s;
        $tampered[$key] = $value;
        instance_check(
            !markbridge_component_instance_final($tampered),
            'Snapshot tampering accepted: ' . $key,
        );
    }
    $bad = $s;
    $bad['stamp'] = str_repeat('0', 64);
    instance_check(!markbridge_component_instance_final($bad), 'Forged stamp accepted');
    foreach (
        [
            'readable' => false,
            'user' => 2,
            'session' => 'other',
            'token' => 'changed',
            'resourceVersion' => 'changed',
            'source' => hash('sha256', 'wrong'),
        ]
        as $k => $v
    ) {
        $old = $GLOBALS[$k];
        $GLOBALS[$k] = $v;
        instance_check(!markbridge_component_instance_final($s), 'Authority changed: ' . $k);
        $GLOBALS[$k] = $old;
    }
    $GLOBALS['blocks'][] = $block;
    instance_check(!markbridge_component_instance_final($s), 'Duplicate instance accepted');
    array_pop($GLOBALS['blocks']);
    file_put_contents($file, 'changed');
    instance_check(!markbridge_component_instance_final($s), 'Changed resource accepted');
    echo "component instance capability passed\n";
} finally {
    unlink($file);
}
