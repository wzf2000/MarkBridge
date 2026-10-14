<?php
// The test creates and removes only synthetic fixtures in an explicitly named local lab.
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
if (
    !$root ||
    !$home ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    realpath(ABSPATH) !== realpath($root) ||
    rtrim(home_url(), '/') !== rtrim($home, '/') ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException(
        'Component save tests require an explicitly identified local WordPress lab.',
    );
}
if (!function_exists('mbb_convert') || !mbb_runtime_diagnostics()['ok']) {
    throw new RuntimeException('A compatible candidate converter is required.');
}
function component_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function component_request($route, $params)
{
    $r = new WP_REST_Request('POST', $route);
    foreach ($params as $key => $value) {
        $r->set_param($key, $value);
    }
    return rest_do_request($r);
}
function component_directive($kind, $attrs, $body)
{
    return ':::mbb:v1 ' .
        $kind .
        ' ' .
        wp_json_encode($attrs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) .
        "\n\n" .
        $body .
        "\n\n:::mbb:end\n";
}
$suffix = substr(hash('sha256', uniqid('', true)), 0, 10);
$previous = get_current_user_id();
$ids = [];
$author = 0;
$registry = mbb_component_registry();
try {
    component_assert(
        isset($registry['insertion-sort']) && $registry['insertion-sort']['status'] === 'available',
        'Install the independently built local teaching extension first',
    );
    $author = wp_insert_user([
        'user_login' => 'component-' . $suffix,
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    component_assert(!is_wp_error($author), 'Could not create synthetic author');
    wp_set_current_user($author);
    $source = component_directive(
        'component',
        [
            'id' => 'sort',
            'component' => 'insertion-sort',
            'componentVersion' => '0.1.0',
            'params' => ['values' => [5, 2, 4, 1, 3], 'order' => 'asc'],
        ],
        "## 静态替代\n\n原始数组和预期结果。",
    );
    $request = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'Component' . $suffix,
        'title' => 'Synthetic component',
        'source' => $source,
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $created = component_request('/mbb/v1/save', $request);
    component_assert(
        $created->get_status() === 200,
        'Component import failed: ' . wp_json_encode($created->get_data()),
    );
    $data = $created->get_data();
    $id = (int) $data['post_id'];
    $ids[] = $id;
    $post = get_post($id);
    $serialized = $post->post_content;
    $revision = (int) $data['saved_revision'];
    component_assert($post->post_content_filtered === $source, 'Component changed source');
    $pair = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $source,
        'serialized' => $serialized,
        'documentId' => mbb_id($id),
    ]);
    component_assert(!is_wp_error($pair), 'Opaque component pair could not reopen');
    $rendered = do_blocks($serialized);
    $priorGetPost = $_GET['post'] ?? null;
    $_GET['post'] = $id;
    do_action('enqueue_block_editor_assets');
    if ($priorGetPost === null) {
        unset($_GET['post']);
    } else {
        $_GET['post'] = $priorGetPost;
    }
    $priorQuery = $GLOBALS['wp_query'];
    $GLOBALS['wp_query'] = new WP_Query();
    $GLOBALS['wp_query']->queried_object = $post;
    $GLOBALS['wp_query']->queried_object_id = $id;
    do_action('enqueue_block_assets');
    $GLOBALS['wp_query'] = $priorQuery;
    $mathStyle = wp_styles()->registered['mbb-math'] ?? null;
    component_assert(
        $mathStyle &&
            $mathStyle->src ===
                plugins_url(
                    mbb_asset('math.css'),
                    (new ReflectionFunction('mbb_is_lab'))->getFileName(),
                ) &&
            $mathStyle->args === 'all' &&
            is_string($mathStyle->ver) &&
            preg_match('/^[a-f0-9]{12}$/D', $mathStyle->ver),
        'Actual WordPress math stylesheet lost its CSS URL, media or cache version',
    );
    $scripts = wp_scripts();
    $registryInline = implode("\n", $scripts->get_data('mbb-components', 'before') ?: []);
    component_assert(
        str_contains($registryInline, 'window.MBBComponents=') &&
            str_contains($registryInline, 'protocolVersion'),
        'Actual WordPress discarded the registry inline before its script handle was registered',
    );
    component_assert(
        in_array('mbb-components', $scripts->registered['mbb-kernel']->deps ?? [], true),
        'Kernel does not wait for the authoritative component registry',
    );

    component_assert(
        str_contains($rendered, 'data-mbb-teaching="component"') &&
            str_contains($rendered, 'insertion-sort') &&
            !str_contains($rendered, WP_PLUGIN_DIR),
        'Component render leaked private paths or omitted config',
    );
    $schema = [
        'type' => 'object',
        'additionalProperties' => false,
        'required' => ['empty', 'list', 'nested', '1', '01'],
        'properties' => [
            'empty' => ['type' => 'object', 'additionalProperties' => false, 'properties' => []],
            'list' => ['type' => 'array', 'items' => ['type' => 'number'], 'maxItems' => 4],
            'nested' => [
                'type' => 'object',
                'additionalProperties' => false,
                'required' => ['n', 'b', 'text'],
                'properties' => [
                    'n' => ['type' => 'null'],
                    'b' => ['type' => 'boolean'],
                    'text' => ['type' => 'string', 'maxLength' => 100],
                ],
            ],
            '1' => ['type' => 'string'],
            '01' => ['type' => 'string'],
        ],
    ];
    $params = json_decode(
        '{"empty":{},"list":[],"nested":{"n":null,"b":true,"text":"<tag> & raw"},"1":"numeric","01":"leading"}',
    );
    component_assert(
        markbridge_register_teaching_component('json-fixture', [
            'version' => '0.1.0',
            'protocolVersion' => 1,
            'minMarkBridge' => '1.6.0',
            'budgets' => [
                'resourceBytes' => 524288,
                'startupMs' => 5000,
                'wallMs' => 2000,
                'traceFrames' => 8192,
                'traceBytes' => 524288,
            ],
            'title' => 'JSON fixture',
            'schema' => $schema,
            'defaults' => $params,
            'resource' => $registry['insertion-sort']['resource'],
        ]),
        'Could not register JSON fixture provider',
    );
    $jsonSource = component_directive(
        'component',
        [
            'id' => 'json',
            'component' => 'json-fixture',
            'componentVersion' => '0.1.0',
            'params' => $params,
        ],
        '纯 JSON 合成替代。',
    );
    $expected = mbb_convert([
        'mode' => 'markdown',
        'source' => $jsonSource,
        'documentId' => 'JSON' . $suffix,
    ]);
    $jsonSave = component_request(
        '/mbb/v1/save',
        array_replace($request, ['source' => $jsonSource, 'documentId' => 'JSON' . $suffix]),
    );
    component_assert(
        $jsonSave->get_status() === 200,
        'JSON object/array/KSES save failed: ' . wp_json_encode($jsonSave->get_data()),
    );
    $jsonId = (int) $jsonSave->get_data()['post_id'];
    $ids[] = $jsonId;
    component_assert(
        get_post($jsonId)->post_content === $expected['serialized'],
        'KSES rewrote JSON types or <tag> text',
    );
    // Rendering also validates schemas for native (unmanaged) serialized blocks.
    $invalidBlocks = parse_blocks(str_replace('"order":"asc"', '"order":"sideways"', $serialized));
    $invalidHtml = render_block($invalidBlocks[0]);
    component_assert(
        str_contains($invalidHtml, 'invalid-params') &&
            !str_contains($invalidHtml, '&quot;provider&quot;'),
        'Native rendering bypassed provider schema',
    );
    $GLOBALS['mbb_components'] = [];
    $edited = str_replace('原始数组和预期结果。', '修改静态替代；参数保留。', $serialized);
    $saved = component_request('/mbb/v1/save', [
        'mode' => 'blocks',
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'serialized' => $edited,
        'title' => 'Synthetic component',
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    component_assert(
        $saved->get_status() === 200,
        'Missing provider blocked fallback edit: ' . wp_json_encode($saved->get_data()),
    );
    $changed = str_replace('[5,2,4,1,3]', '[9,2,4,1,3]', get_post($id)->post_content_filtered);
    $reject = component_request('/mbb/v1/save', [
        'mode' => 'markdown',
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'source' => $changed,
        'title' => 'Synthetic component',
        'post_status' => 'draft',
    ]);
    component_assert(
        $reject->get_status() === 422,
        'Missing provider permitted parameter modification',
    );
    $new = component_request(
        '/mbb/v1/save',
        array_replace($request, [
            'documentId' => 'Spoof' . $suffix,
            'registry' => $registry,
            'base' => mbb_document(get_post($id)),
        ]),
    );
    component_assert(
        $new->get_status() === 422,
        'Client registry/base authorized new provider: ' .
            $new->get_status() .
            ' ' .
            wp_json_encode($new->get_data()),
    );
    $r = wp_get_post_revision($revision);
    $restore = component_request('/mbb/v1/save', [
        'mode' => 'restore',
        'post_id' => $id,
        'expected' => mbb_token(get_post($id)),
        'revision_id' => $revision,
        'expected_revision' => mbb_revision_token($r),
        'post_status' => 'draft',
        'featured_media' => 0,
    ]);
    component_assert(
        $restore->get_status() === 200,
        'Missing provider blocked exact historical pair',
    );
    $GLOBALS['mbb_components'] = $registry;
    foreach (
        [
            ['values' => [], 'order' => 'asc'],
            ['values' => [1, '2'], 'order' => 'asc'],
            ['values' => [1, 2], 'order' => 'sideways'],
            ['values' => [1, 2], 'order' => 'asc', 'url' => 'https://invalid.example/'],
        ]
        as $params
    ) {
        $bad = component_directive(
            'component',
            [
                'id' => 'sort',
                'component' => 'insertion-sort',
                'componentVersion' => '0.1.0',
                'params' => $params,
            ],
            '静态替代。',
        );
        $result = component_request(
            '/mbb/v1/save',
            array_replace($request, [
                'source' => $bad,
                'documentId' => 'Invalid' . substr(hash('sha256', $bad), 0, 20) . $suffix,
            ]),
        );
        component_assert(
            $result->get_status() === 422,
            'Trusted schema admitted illegal params: ' .
                $result->get_status() .
                ' ' .
                wp_json_encode($result->get_data()),
        );
    }
    component_assert(
        !markbridge_register_teaching_component('insertion-sort', $registry['insertion-sort']),
        'Duplicate provider replaced registry',
    );
    echo 'Component ' .
        mbb_converter_backend() .
        " real WordPress paired save/reopen/render/missing-provider preservation/schema/client authority/revisions passed.\n";
} finally {
    $GLOBALS['mbb_components'] = $registry;
    wp_set_current_user($author);
    foreach ($ids as $id) {
        wp_delete_post($id, true);
    }
    if ($author && !is_wp_error($author)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($author);
    }
    wp_set_current_user($previous);
}
