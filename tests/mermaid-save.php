<?php
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
if (
    !$root ||
    !$home ||
    realpath(ABSPATH) !== realpath($root) ||
    rtrim(home_url(), '/') !== $home ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost'], true) ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Explicit owned lab required');
}
function mermaid_save_check($ok, $why)
{
    if (!$ok) {
        throw new RuntimeException($why);
    }
}
function mermaid_save_call($route, $data)
{
    $r = new WP_REST_Request('POST', '/mbb/v1/' . $route);
    $r->set_header('Content-Type', 'application/json');
    $r->set_body(wp_json_encode($data));
    return rest_do_request($r);
}
function mermaid_save_ok($r)
{
    mermaid_save_check($r->get_status() === 200, 'REST: ' . wp_json_encode($r->get_data()));
    return $r->get_data();
}
$previous = get_current_user_id();
$id = 0;
try {
    wp_set_current_user(get_user_by('login', 'markbridge_ci')->ID);
    $p = mbb_component_provider('mermaid', '0.1.0');
    mermaid_save_check($p && $p['status'] === 'available', 'Actual provider rejected');
    foreach (
        [
            "flowchart LR\nA[Start] --> B[Finish]",
            "sequenceDiagram\nparticipant A as Author\nparticipant B as Server\nA->>B: Request\nB-->>A: Response",
        ]
        as $diagram
    ) {
        $c = [
            'id' => 'diagram-test',
            'component' => 'mermaid',
            'componentVersion' => '0.1.0',
            'params' => ['source' => $diagram],
        ];
        $source =
            ':::mbb:v1 collapse {"id":"diagram-fold","title":"Diagram","open":false}' .
            "\n\n:::mbb:v1 component " .
            wp_json_encode($c, JSON_UNESCAPED_SLASHES) .
            "\n\nStatic explanation. Formula \$x^2\$ and note[^n].\n\n:::mbb:end\n\n:::mbb:end\n\n[^n]: Static note.\n";
        $params = [
            'mode' => 'markdown',
            'post_id' => 0,
            'documentId' => 'Mermaid' . bin2hex(random_bytes(5)),
            'source' => $source,
            'title' => 'Synthetic Mermaid save',
            'post_status' => 'draft',
            'featured_media' => 0,
        ];
        $preview = mermaid_save_ok(mermaid_save_call('preview', $params));
        $saved = mermaid_save_ok(mermaid_save_call('save', $params));
        $id = $saved['post_id'];
        $post = get_post($id);
        mermaid_save_check(
            $post->post_status === 'draft' && $post->post_content_filtered === $source,
            'Saved source/status changed',
        );
        $paired = mbb_convert([
            'mode' => 'paired_restore',
            'documentId' => mbb_id($id),
            'source' => $source,
            'serialized' => $post->post_content,
        ]);
        mermaid_save_check(
            !is_wp_error($paired) && $paired['source'] === $source,
            'Pair did not reopen',
        );
        $before = [$post->post_content, $post->post_content_filtered, mbb_token($post)];
        $bad = $params;
        $bad['post_id'] = $id;
        $bad['expected'] = mbb_token($post);
        $bad['source'] = str_replace('Start', '<script>', $source);
        if ($bad['source'] === $source) {
            $bad['source'] = str_replace('Request', 'https://external.invalid', $source);
        }
        mermaid_save_check(
            mermaid_save_call('save', $bad)->get_status() >= 400,
            'Unsafe diagram source was saved',
        );
        clean_post_cache($id);
        $after = get_post($id);
        mermaid_save_check(
            [$after->post_content, $after->post_content_filtered, mbb_token($after)] === $before,
            'Rejected diagram changed pair',
        );
        $edited = mermaid_save_ok(
            mermaid_save_call('save', [
                'mode' => 'blocks',
                'post_id' => $id,
                'expected' => mbb_token($post),
                'serialized' => str_replace(
                    'Static explanation.',
                    'Changed static explanation.',
                    $post->post_content,
                ),
                'title' => $post->post_title,
                'post_status' => 'draft',
                'featured_media' => 0,
            ]),
        );
        mermaid_save_check($edited['saved_revision'] > 0, 'Revision missing');
        mermaid_save_check(
            mermaid_save_call('save', [
                'mode' => 'blocks',
                'post_id' => $id,
                'expected' => $before[2],
                'serialized' => $post->post_content,
                'title' => $post->post_title,
                'post_status' => 'draft',
                'featured_media' => 0,
            ])->get_status() === 409,
            'Stale candidate accepted',
        );
        $initial = wp_get_post_revision($saved['saved_revision']);
        mermaid_save_check($initial instanceof WP_Post, 'Initial paired revision missing');
        mermaid_save_ok(
            mermaid_save_call('save', [
                'mode' => 'restore',
                'post_id' => $id,
                'expected' => mbb_token(get_post($id)),
                'revision_id' => $initial->ID,
                'expected_revision' => mbb_revision_token($initial),
                'post_status' => 'draft',
                'featured_media' => 0,
            ]),
        );
        clean_post_cache($id);
        $restored = get_post($id);
        mermaid_save_check(
            $restored->post_content === $before[0] &&
                $restored->post_content_filtered === $before[1],
            'Diagram revision did not restore exact pair',
        );
        wp_delete_post($id, true);
        $id = 0;
    }
    echo "Actual WordPress Mermaid: exact registry, flow/sequence, nested formula/footnote, paired save/reopen, exact revision restore, stale conflict and unsafe source rejection passed\n";
} finally {
    if ($id) {
        wp_delete_post($id, true);
    }
    wp_set_current_user($previous);
}
