<?php
/** Explicit owned lab with the Teaching replay renderer; no post is created or saved. */
if (
    PHP_SAPI !== 'cli' ||
    !defined('WP_CLI') ||
    !WP_CLI ||
    wp_get_environment_type() !== 'local' ||
    home_url() !== getenv('MARKBRIDGE_TEST_HOME')
) {
    throw new RuntimeException('Author projections require the explicitly owned local lab.');
}
function ap_assert($ok, $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function ap_request(array $payload)
{
    $request = new WP_REST_Request('POST', '/mbb/v1/preview');
    $request->set_header('Content-Type', 'application/json');
    $request->set_body(wp_json_encode($payload));
    return rest_do_request($request);
}
function ap_math(string $html): array
{
    $doc = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    try {
        $doc->loadHTML('<?xml encoding="UTF-8"?>' . $html, LIBXML_NONET);
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
    }
    $math = [];
    foreach (
        (new DOMXPath($doc))->query(
            '//span[@data-mbb-tex] | //pre[contains(concat(" ",normalize-space(@class)," ")," wp-block-mbb-math ")]',
        )
        as $node
    ) {
        $math[] = [$node->tagName, $node->getAttribute('data-mbb-tex'), $node->textContent];
    }
    return $math;
}
function ap_revoke_renderer(object $params, array $context): array
{
    $tree = mbbtc_replay_projection($params, $context);
    wp_set_current_user(0);
    return $tree;
}
$previous = get_current_user_id();
$registry = $GLOBALS['mbb_projection_renderers'];
try {
    wp_set_current_user(1);
    ap_assert(function_exists('mbbtc_replay_projection'), 'Teaching replay renderer missing');
    $provider = mbb_component_provider('teaching-replay', '0.1.0');
    ap_assert($provider && $provider['status'] === 'available', 'Replay provider unavailable');
    $params = json_decode(wp_json_encode($provider['defaults']));
    $params->title = 'Candidate replay title';
    foreach ($params->steps as $i => $step) {
        $step->explanation = 'Candidate explanation ' . ($i + 1);
    }
    // Keep TeX literal in this PHP fixture.
    $sourceFor = static fn($params) => '# Preview math' .
        "\n\n" .
        'Inline $x+y$ remains.' .
        "\n\n:::mbb:v1 component " .
        wp_json_encode([
            'id' => 'author-replay',
            'component' => 'teaching-replay',
            'componentVersion' => '0.1.0',
            'params' => $params,
        ]) .
        "\n\nFallback explanation.\n\n:::mbb:end\n\n" .
        '$$z^2$$' .
        "\n";
    $source = $sourceFor($params);
    $payload = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'AuthorReplayFixture',
        'source' => $source,
        'title' => 'Author projection fixture',
        'post_status' => 'draft',
    ];
    global $wpdb;
    $count = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts}");
    $preview = ap_request($payload);
    ap_assert($preview->get_status() === 200, 'Replay author preview failed');
    $data = $preview->get_data();
    $plain = html_entity_decode(strip_tags($data['html']), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $tags = new WP_HTML_Tag_Processor($data['html']);
    $anchors = [];
    while ($tags->next_tag()) {
        $anchor = $tags->get_attribute('data-mbb-preview-range');
        if ($anchor !== null) {
            $anchors[$anchor] = true;
        }
    }
    foreach ($data['navigation']['ranges'] as $range) {
        ap_assert(isset($anchors[$range['id']]), 'Projection removed a source navigation anchor');
    }
    ap_assert(
        substr_count($plain, $params->title) === 1,
        'Candidate replay title missing/duplicated',
    );
    foreach ($params->steps as $step) {
        ap_assert(
            substr_count($plain, $step->explanation) === 1,
            'Candidate step explanation missing/duplicated',
        );
    }
    ap_assert(substr_count($data['html'], 'class="mbb-projection"') === 1, 'Projection duplicated');
    $mathBefore = ap_math(do_blocks($data['document']['serialized']));
    ap_assert(
        count($mathBefore) === 2 && ap_math($data['html']) === $mathBefore,
        'Inline/block math changed during projection',
    );
    ap_assert(
        str_contains($data['html'], 'x+y') && str_contains($data['html'], 'z^2'),
        'TeX source changed',
    );
    ap_assert($data['document']['source'] === $source, 'Candidate bytes mutated');
    $params->title = 'Unsaved replacement replay title';
    $payload['source'] = $sourceFor($params);
    $replacement = ap_request($payload);
    ap_assert(
        $replacement->get_status() === 200 &&
            str_contains($replacement->get_data()['html'], $params->title),
        'Projection used old/saved params',
    );
    $projected = $replacement->get_data()['document'];
    $projected['source'] .= ' resource rewrite';
    $fallback = MBB_Author_Preview::render(
        new WP_REST_Request('POST', '/mbb/v1/preview'),
        $data['document'],
        $projected,
    );
    ap_assert(
        !is_wp_error($fallback) &&
            $fallback['navigation'] === null &&
            str_contains($fallback['html'], $params->title),
        'Navigation fallback lost projected candidate params',
    );
    wp_set_current_user(0);
    ap_assert(ap_request($payload)->get_status() === 403, 'Anonymous author projection accepted');
    wp_set_current_user(1);
    $definition = $registry['teaching-replay@0.1.0'];
    unset($GLOBALS['mbb_projection_renderers']['teaching-replay@0.1.0']);
    $definition['render'] = 'ap_revoke_renderer';
    $definition['files'][] = [
        'file' => realpath(__FILE__),
        'sha256' => hash_file('sha256', __FILE__),
    ];
    ap_assert(
        mbb_register_component_projection('teaching-replay', '0.1.0', $definition),
        'Revocation fixture registration failed',
    );
    ap_assert(
        ap_request($payload)->get_status() === 403,
        'Permission revoked during projection leaked preview',
    );
    ap_assert(
        (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts}") === $count,
        'Preview wrote post/revision',
    );
    echo "Author projection actual REST: candidate title/steps, math, one projection, resource fallback, anonymous/revoked permission and no writes passed.\n";
} finally {
    $GLOBALS['mbb_projection_renderers'] = $registry;
    wp_set_current_user($previous);
}
