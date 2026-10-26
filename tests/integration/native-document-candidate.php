<?php
// Explicit local REST integration; only this fixture's user/post/resource are written.
if (
    PHP_SAPI !== 'cli' ||
    !getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT') ||
    realpath(ABSPATH) !== realpath(getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT')) ||
    home_url() !== rtrim((string) getenv('MARKBRIDGE_TEST_HOME'), '/') ||
    !in_array(parse_url(home_url(), PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Native source checks require the explicitly owned local lab.');
}
function ndc_assert($value, string $message): void
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function ndc_request(string $route, array $data)
{
    $r = new WP_REST_Request('POST', $route);
    $r->set_header('Content-Type', 'application/json');
    $r->set_body(wp_json_encode($data));
    return rest_do_request($r);
}
function ndc_run(): void
{
    $previous = get_current_user_id();
    $user = $id = 0;
    $registry = $GLOBALS['mbb_components'] ?? [];
    $defaults = $GLOBALS['mbb_component_defaults'] ?? [];
    $suffix = bin2hex(random_bytes(6));
    $provider = 'native-exact-' . $suffix;
    $fixture = WP_PLUGIN_DIR . '/markbridge-native-exact-' . $suffix;
    $file = $fixture . '/frame.html';
    $hook = null;
    try {
        ndc_assert(mkdir($fixture, 0700), 'Synthetic native resource directory failed');
        $frame = file_get_contents(dirname(__DIR__) . '/browser/fixtures/component.html');
        ndc_assert(
            file_put_contents($file, $frame) === strlen($frame),
            'Synthetic native resource failed',
        );
        ndc_assert(
            markbridge_register_teaching_component($provider, [
                'version' => '0.1.0',
                'protocolVersion' => 1,
                'minMarkBridge' => '1.6.0',
                'budgets' => mbb_component_budget_limits(),
                'title' => 'Native exact-source fixture',
                'schema' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['value'],
                    'properties' => [
                        'value' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 10],
                    ],
                ],
                'defaults' => ['value' => 1],
                'resource' => [
                    'file' => $file,
                    'url' => plugins_url('frame.html', $file),
                    'sha256' => hash_file('sha256', $file),
                ],
            ]),
            'Synthetic native provider failed',
        );
        $user = wp_insert_user([
            'user_login' => 'native-exact-' . $suffix,
            'user_pass' => wp_generate_password(32),
            'role' => 'author',
        ]);
        ndc_assert(!is_wp_error($user), 'Synthetic native author failed');
        wp_set_current_user($user);
        $attrs = [
            'id' => 'exact-fixture',
            'component' => $provider,
            'componentVersion' => '0.1.0',
            'params' => ['value' => 1],
        ];
        $source =
            "\xef\xbb\xbf# Original\r\n\r\noriginal-literal-marker\r\n\r\n:::mbb:v1 component " .
            wp_json_encode($attrs, JSON_UNESCAPED_SLASHES) .
            "\r\n\r\nStatic explanation.\r\n\r\n:::mbb:end\r\n";
        $created = ndc_request('/mbb/v1/save', [
            'post_id' => 0,
            'mode' => 'markdown',
            'documentId' => 'NativeExact' . $suffix,
            'source' => $source,
            'title' => 'Native exact-source',
            'post_status' => 'draft',
        ]);
        ndc_assert($created->get_status() === 200, 'Initial native fixture save failed');
        $id = (int) $created->get_data()['post_id'];
        $original = mbb_document(get_post($id));
        $candidateSource = str_replace(
            'original-literal-marker',
            'adopted-literal-marker',
            $source,
        );
        $capture = static function () use ($id) {
            $expected = mbb_token(get_post($id));
            $r = ndc_request('/mbb/v1/document-tools/capture', [
                'post_id' => $id,
                'expected' => $expected,
            ]);
            ndc_assert($r->get_status() === 200, 'Native fixture capture failed');
            return [$expected, $r->get_data()['receipt']];
        };
        [$expected, $receipt] = $capture();
        $preview = ndc_request('/mbb/v1/document-tools/preview', [
            'post_id' => $id,
            'expected' => $expected,
            'receipt' => $receipt,
            'source' => $candidateSource,
        ]);
        ndc_assert(
            $preview->get_status() === 200 && mbb_document(get_post($id)) === $original,
            'Preview/cancel changed native fixture',
        );
        $serialized = $preview->get_data()['document']['serialized'];
        $payload = [
            'mbb_expected' => $expected,
            'content' => $serialized,
            'mbb_document_candidate' => [
                'schema' => 1,
                'sourceBase64' => base64_encode($candidateSource),
                'receipt' => $receipt,
            ],
        ];
        $route = '/wp/v2/posts/' . $id;
        wp_set_current_user(0);
        ndc_assert(
            ndc_request($route, $payload)->get_status() === 403,
            'Anonymous native source save accepted',
        );
        wp_set_current_user($user);
        $bad = $payload;
        $bad['mbb_document_candidate']['extra'] = true;
        ndc_assert(
            ndc_request($route, $bad)->get_status() === 422,
            'Open native proof object accepted',
        );
        $bad = $payload;
        $bad['mbb_document_candidate']['receipt'] .= 'x';
        ndc_assert(
            ndc_request($route, $bad)->get_status() === 409,
            'Tampered native receipt accepted',
        );
        $expired = mbb_document_tools_verify($receipt);
        $expired['expires'] = time() - 1;
        $bad = $payload;
        $bad['mbb_document_candidate']['receipt'] = mbb_document_tools_receipt($expired);
        ndc_assert(
            ndc_request($route, $bad)->get_status() === 409,
            'Expired native receipt accepted',
        );
        $other = mbb_convert([
            'mode' => 'markdown',
            'source' => "# Different body\n",
            'documentId' => mbb_id($id),
        ]);
        ndc_assert(!is_wp_error($other), 'Mismatch fixture conversion failed');
        $bad = $payload;
        $bad['content'] = $other['serialized'];
        ndc_assert(
            ndc_request($route, $bad)->get_status() !== 200,
            'Unrelated native body used a stale source candidate',
        );
        ndc_assert(
            mbb_document(get_post($id)) === $original,
            'Rejected native candidates wrote body',
        );
        // A regular native Undo save carries no candidate; the saved original remains exact.
        $undo = ndc_request($route, [
            'mbb_expected' => $expected,
            'content' => $original['serialized'],
        ]);
        ndc_assert(
            $undo->get_status() === 200 && get_post($id)->post_content_filtered === $source,
            'Native original path lost exact source',
        );
        [$expected, $receipt] = $capture();
        $payload['mbb_expected'] = $expected;
        $payload['mbb_document_candidate']['receipt'] = $receipt;
        file_put_contents($file, $frame . '\nchanged exact resource');
        clearstatcache(true, $file);
        ndc_assert(
            ndc_request($route, $payload)->get_status() === 409,
            'Changed original exact resource accepted',
        );
        file_put_contents($file, $frame);
        clearstatcache(true, $file);
        $metadata = ndc_request('/mbb/v1/save', [
            'post_id' => $id,
            'expected' => $expected,
            'mode' => 'markdown',
            'source' => $source,
            'title' => 'External metadata change',
            'post_status' => 'draft',
        ]);
        ndc_assert($metadata->get_status() === 200, 'External metadata fixture failed');
        ndc_assert(
            ndc_request($route, $payload)->get_status() === 409,
            'External baseline accepted old source proof',
        );
        [$expected, $receipt] = $capture();
        $payload['mbb_expected'] = $expected;
        $payload['mbb_document_candidate']['receipt'] = $receipt;
        // Pins are checked again after the core controller writes, before COMMIT.
        $hook = static function ($post) use ($id, $file, $frame) {
            if ((int) $post->ID === $id) {
                file_put_contents($file, $frame . ' changed during save');
                clearstatcache(true, $file);
            }
        };
        add_action('rest_after_insert_post', $hook, 1000);
        ndc_assert(
            ndc_request($route, $payload)->get_status() === 409,
            'Resource changed during save was committed',
        );
        remove_action('rest_after_insert_post', $hook, 1000);
        $hook = null;
        file_put_contents($file, $frame);
        clearstatcache(true, $file);
        ndc_assert(
            mbb_document(get_post($id)) === $original,
            'Final pin rejection failed rollback',
        );
        $saved = ndc_request($route, $payload);
        ndc_assert($saved->get_status() === 200, 'Exact native candidate save failed');
        $post = get_post($id);
        ndc_assert(
            $post->post_content_filtered === $candidateSource &&
                $post->post_content === $serialized,
            'Native save normalized literal Markdown, BOM or CRLF',
        );
        $restored = mbb_convert([
            'mode' => 'paired_restore',
            'source' => $post->post_content_filtered,
            'serialized' => $post->post_content,
            'documentId' => mbb_id($id),
        ]);
        ndc_assert(!is_wp_error($restored), 'Exact native saved pair cannot reopen');
        $data = $saved->get_data();
        ndc_assert(
            get_post($data['mbb_saved_revision'])->post_content_filtered === $candidateSource &&
                get_post($data['mbb_before_revision'])->post_content_filtered === $source,
            'Native paired revisions lost source bytes',
        );
        echo "native exact-source real REST and revision checks passed\n";
    } finally {
        if ($hook) {
            remove_action('rest_after_insert_post', $hook, 1000);
        }
        $GLOBALS['mbb_components'] = $registry;
        $GLOBALS['mbb_component_defaults'] = $defaults;
        wp_set_current_user($previous);
        if ($id) {
            wp_delete_post($id, true);
        }
        if ($user && !is_wp_error($user)) {
            require_once ABSPATH . 'wp-admin/includes/user.php';
            wp_delete_user($user);
        }
        if (is_file($file)) {
            unlink($file);
        }
        if (is_dir($fixture)) {
            rmdir($fixture);
        }
    }
}
ndc_run();
