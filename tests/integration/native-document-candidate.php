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
/** Counts/booleans only: never dump provider declarations, paths, URLs or article values. */
function ndc_registration_diagnostic(
    string $provider,
    array $definition,
    int $rejectionStart,
): array {
    $entries = mbb_component_index_entries();
    $counts = array_count_values(array_column($entries, 'id'));
    $reason = 'unreported';
    $allowed = [
        'invalid-registration',
        'invalid-budget',
        'invalid-schema',
        'invalid-resource',
        'invalid-resource-url',
        'invalid-defaults',
        'invalid-resource-group',
        'catalog-limit',
        'invalid-execution-profile',
        'duplicate-provider',
    ];
    foreach (
        array_slice($GLOBALS['mbb_component_rejections'] ?? [], $rejectionStart)
        as $rejection
    ) {
        if (
            ($rejection['id'] ?? null) === $provider &&
            in_array($rejection['reason'] ?? null, $allowed, true)
        ) {
            $reason = $rejection['reason'];
        }
    }
    $nodes = 0;
    $defaults = json_decode(
        mbb_component_json($definition['defaults']),
        false,
        16,
        JSON_THROW_ON_ERROR,
    );
    $file = $definition['resource']['file'];
    $budgets = true;
    foreach (mbb_component_budget_limits() as $key => $limit) {
        $value = $definition['budgets'][$key] ?? null;
        $budgets = $budgets && is_int($value) && $value >= 1 && $value <= $limit;
    }
    return [
        'reason' => $reason,
        'counts' => [
            'legacy' => count(mbb_component_registry()),
            'entries' => count($entries),
            'types' => count($counts),
            'maxVersionsPerType' => $counts ? max($counts) : 0,
            'indexBytes' => mbb_component_index_bytes($entries),
            'rejections' => count($GLOBALS['mbb_component_rejections'] ?? []),
        ],
        'checks' => [
            'legacyRoom' => count(mbb_component_registry()) < 32,
            'catalogRoom' => mbb_component_index_room($provider, $definition['version']),
            'duplicate' => mbb_component_index_has($provider, $definition['version']),
            'schema' => mbb_component_schema_definition($definition['schema'], 0, $nodes),
            'defaults' =>
                mbb_component_pure_params($defaults) &&
                mbb_component_schema($defaults, $definition['schema']),
            'budgets' => $budgets,
            'resourceRegular' => is_file($file) && !is_link($file) && is_readable($file),
            'resourceBudget' => filesize($file) <= $definition['budgets']['resourceBytes'],
            'resourceHash' => hash_equals(
                $definition['resource']['sha256'],
                (string) hash_file('sha256', $file),
            ),
            'resourceUrl' =>
                $definition['resource']['url'] === plugins_url(basename($file), $file) &&
                parse_url($definition['resource']['url'], PHP_URL_HOST) ===
                    parse_url(site_url(), PHP_URL_HOST),
        ],
    ];
}
function ndc_component_state(): array
{
    $state = [];
    foreach (array_keys($GLOBALS) as $name) {
        if (str_starts_with($name, 'mbb_component')) {
            $state[$name] = $GLOBALS[$name];
        }
    }
    return $state;
}
function ndc_restore_component_state(array $state): void
{
    foreach (array_keys($GLOBALS) as $name) {
        if (str_starts_with($name, 'mbb_component')) {
            unset($GLOBALS[$name]);
        }
    }
    foreach ($state as $name => $value) {
        $GLOBALS[$name] = $value;
    }
}
function ndc_run(): void
{
    $previous = get_current_user_id();
    $user = $id = 0;
    $componentState = ndc_component_state();
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
        $definition = [
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
        ];
        $rejectionStart = count($GLOBALS['mbb_component_rejections'] ?? []);
        $registered = markbridge_register_teaching_component($provider, $definition);
        if (!$registered) {
            $diagnostic = ndc_registration_diagnostic($provider, $definition, $rejectionStart);
            echo wp_json_encode([
                'nativeProviderRegistration' =>
                    ['context' => 'installed-components', 'registered' => false] + $diagnostic,
            ]) . "\n";
            $capacity =
                !$diagnostic['checks']['legacyRoom'] ||
                !$diagnostic['checks']['catalogRoom'] ||
                $diagnostic['reason'] === 'catalog-limit';
            $validFixture = !$diagnostic['checks']['duplicate'];
            foreach (
                [
                    'schema',
                    'defaults',
                    'budgets',
                    'resourceRegular',
                    'resourceBudget',
                    'resourceHash',
                    'resourceUrl',
                ]
                as $key
            ) {
                $validFixture = $validFixture && $diagnostic['checks'][$key];
            }
            ndc_assert(
                $capacity && $validFixture,
                'Synthetic native provider failed outside an isolated capacity condition: ' .
                    wp_json_encode($diagnostic),
            );
            // This fixture tests one synthetic exact dependency, not installed-directory capacity.
            // Re-run the unchanged public registration/admission against an isolated in-memory
            // catalog only after proving the installed capacity condition. Limits stay unchanged.
            ndc_restore_component_state([]);
            $registered = markbridge_register_teaching_component($provider, $definition);
            $isolated = ndc_registration_diagnostic($provider, $definition, 0);
            if ($registered) {
                $isolated['reason'] = null;
            }
            echo wp_json_encode([
                'nativeProviderRegistration' =>
                    ['context' => 'isolated-synthetic', 'registered' => $registered] + $isolated,
            ]) . "\n";
            ndc_assert(
                $registered,
                'Synthetic native provider failed after isolation: ' . wp_json_encode($isolated),
            );
        }

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
        ndc_restore_component_state($componentState);
        $componentRestored = ndc_component_state() === $componentState;
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
        ndc_assert($componentRestored, 'Native fixture component state was not restored');
    }
}
ndc_run();
