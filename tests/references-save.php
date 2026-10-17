<?php
// Run with wp eval-file in the explicitly owned disposable local WordPress only.
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
if (
    !$root ||
    !$home ||
    realpath(ABSPATH) !== realpath($root) ||
    rtrim(home_url(), '/') !== rtrim($home, '/') ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException(
        'References save checks require the identified disposable local lab.',
    );
}
function reference_assert($value, string $message): void
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function reference_request(string $route, array $body, string $method = 'POST')
{
    $r = new WP_REST_Request($method, '/mbb/v1/' . $route);
    $r->set_header('Content-Type', 'application/json');
    $r->set_body(wp_json_encode($body));
    foreach ($body as $k => $v) {
        $r->set_param($k, $v);
    }
    return $r;
}
function reference_save(array $payload): array
{
    $preview = mbb_preview(reference_request('preview', $payload));
    reference_assert(
        !is_wp_error($preview),
        'preview: ' . (is_wp_error($preview) ? $preview->get_error_message() : ''),
    );
    foreach (['adapter_digest', 'frontmatter_receipt', 'resource_receipt'] as $field) {
        $payload[$field] = $preview[$field] ?? null;
    }
    $saved = mbb_save(reference_request('save', $payload));
    reference_assert(
        !is_wp_error($saved),
        'save: ' .
            (is_wp_error($saved)
                ? $saved->get_error_code() . ':' . $saved->get_error_message()
                : ''),
    );
    return $saved;
}
$previous = get_current_user_id();
$posts = [];
$paths = [];
$tokens = [];
$user = 0;
try {
    $admin = get_users(['role' => 'administrator', 'number' => 1])[0];
    wp_set_current_user($admin->ID);
    $result = mbb_references_initialize();
    reference_assert(!is_wp_error($result), 'initialize');
    for ($i = 0; $i < 100 && ($result['state'] ?? null) !== 'ready'; $i++) {
        $result = mbb_references_rebuild_batch();
    }
    reference_assert(($result['state'] ?? null) === 'ready', 'bounded rebuild ready');
    $control = mbb_references_control();
    $again = mbb_references_initialize();
    reference_assert(
        !is_wp_error($again) &&
            mbb_references_control()['active_generation'] === $control['active_generation'],
        'idempotent initialize',
    );
    $user = wp_insert_user([
        'user_login' => 'references-' . wp_generate_password(12, false),
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    reference_assert(!is_wp_error($user), 'author');
    wp_set_current_user($user);
    $source =
        "---\nmarkbridge: 1\ntitle: \"Proposal only\"\n---\n\n:::mbb:v1 object {\"id\":\"equation-one\",\"kind\":\"equation\",\"caption\":\"Equation title\"}\n\n$$\nx^2\n$$\n\n:::mbb:end\n\nNote[^last].\n\n[^last]: Last definition.\n";
    $saved = reference_save([
        'post_id' => 0,
        'documentId' => 'REFERENCE_' . wp_generate_password(10, false),
        'mode' => 'markdown',
        'source' => $source,
        'title' => 'Reference fixture',
        'post_status' => 'draft',
    ]);
    $id = $saved['post_id'];
    $posts[] = $id;
    $before = get_post($id, ARRAY_A);
    $revision = mbb_pair_snapshot($id);
    $prepared = mbb_references_prepare(
        reference_request('references/prepare', [
            'action' => 'enable',
            'post_id' => $id,
            'expected' => $saved['expected'],
            'source' => $source,
        ]),
    );
    reference_assert(!is_wp_error($prepared), 'enable candidate');
    reference_assert(get_post($id, ARRAY_A) === $before, 'prepare must not write pair');
    reference_assert(
        str_starts_with($prepared['document']['source'], "---\nmarkbridge: 1\n"),
        'FrontMatter first',
    );
    reference_assert(
        str_ends_with($prepared['document']['source'], "[^last]: Last definition.\n"),
        'footnote last',
    );
    $saved = reference_save([
        'post_id' => $id,
        'expected' => $prepared['expected'],
        'mode' => 'markdown',
        'source' => $prepared['document']['source'],
        'identity_receipt' => $prepared['identity_receipt'],
        'title' => 'Reference fixture',
        'post_status' => 'draft',
    ]);
    reference_assert(
        mbb_id($id) === $prepared['document']['documentId'],
        'legacy documentId retained',
    );
    $projection = mbb_references_projection(get_post($id)->post_content);
    $target = $projection['identity'] + ['target' => 'equation-one', 'kind' => 'equation'];
    $beforeMissing = get_post($id, ARRAY_A);
    $missingPayload = [
        'post_id' => $id,
        'expected' => $saved['expected'],
        'mode' => 'markdown',
        'source' => $source,
        'title' => 'Reference fixture',
        'post_status' => 'draft',
    ];
    $missingPreview = mbb_preview(reference_request('preview', $missingPayload));
    reference_assert(
        !is_wp_error($missingPreview),
        'preidentity backup candidate remains comparable',
    );
    foreach (['adapter_digest', 'frontmatter_receipt', 'resource_receipt'] as $field) {
        $missingPayload[$field] = $missingPreview[$field] ?? null;
    }
    $missing = mbb_save(reference_request('save', $missingPayload));
    reference_assert(
        is_wp_error($missing) &&
            $missing->get_error_code() === 'identity_changed' &&
            get_post($id, ARRAY_A) === $beforeMissing,
        'preidentity backup cannot erase identity',
    );
    $manual = mbb_references_insert_identity($source, $projection['identity']);
    $saved = reference_save([
        'post_id' => $id,
        'expected' => $saved['expected'],
        'mode' => 'markdown',
        'source' => $manual,
        'title' => 'Reference fixture',
        'post_status' => 'draft',
    ]);
    reference_assert(
        mbb_references_projection(get_post($id)->post_content)['identity'] ===
            $projection['identity'],
        'explicit current identity candidate is accepted',
    );
    $resolved = mbb_references_resolve($target);
    reference_assert(
        $resolved['state'] === 'available' && str_contains($resolved['url'], 'preview=true'),
        'readable draft preview',
    );
    wp_set_current_user(0);
    reference_assert(
        mbb_references_resolve($target) === ['state' => 'unavailable'],
        'anonymous draft neutral',
    );
    wp_set_current_user($user);
    $historical = mbb_preview(
        reference_request('preview', [
            'post_id' => $id,
            'expected' => $saved['expected'],
            'mode' => 'restore',
            'revision_id' => $revision,
            'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
        ]),
    );
    reference_assert(
        !is_wp_error($historical) && $historical['identity_restore'] === 'adopt-history',
        'exact preidentity comparison',
    );
    $adopt = mbb_references_prepare(
        reference_request('references/prepare', [
            'action' => 'adopt-history',
            'post_id' => $id,
            'expected' => $saved['expected'],
            'revision_id' => $revision,
            'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
        ]),
    );
    reference_assert(!is_wp_error($adopt), 'explicit history candidate');
    reference_assert(
        mbb_references_projection($adopt['document']['serialized'])['identity'] ===
            $projection['identity'],
        'history candidate retains current identity',
    );
    // New documents only obtain their post ID inside the transaction. A duplicate
    // migration therefore fails at the final unique claim, after provisional pair
    // and revision writes, and must report a conflict with no surviving writes.
    $duplicate = mbb_references_prepare(
        reference_request('references/prepare', [
            'action' => 'migrate',
            'post_id' => 0,
            'documentId' => 'MIGRATION_' . wp_generate_password(10, false),
            'source' => get_post($id)->post_content_filtered,
        ]),
    );
    reference_assert(!is_wp_error($duplicate), 'duplicate migration candidate');
    $migrationPayload = [
        'post_id' => 0,
        'documentId' => $duplicate['document']['documentId'],
        'identity_receipt' => $duplicate['identity_receipt'],
        'mode' => 'markdown',
        'source' => $duplicate['document']['source'],
        'title' => 'Rejected duplicate migration',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    $preview = mbb_preview(reference_request('preview', $migrationPayload));
    reference_assert(!is_wp_error($preview), 'migration preview remains available');
    foreach (['adapter_digest', 'frontmatter_receipt', 'resource_receipt'] as $field) {
        $migrationPayload[$field] = $preview[$field] ?? null;
    }
    $snapshot = static function () use ($wpdb) {
        $tables = array_merge(
            [$wpdb->posts, $wpdb->postmeta, $wpdb->term_relationships],
            array_values(mbb_references_tables()),
        );
        return array_map(
            static fn($table) => $wpdb->get_results("SELECT * FROM {$table} ORDER BY 1,2", ARRAY_A),
            $tables,
        );
    };
    $beforeMigration = $snapshot();
    for ($attempt = 0; $attempt < 2; $attempt++) {
        $rejected = mbb_save(reference_request('save', $migrationPayload));
        reference_assert(
            is_wp_error($rejected) &&
                $rejected->get_error_code() === 'identity_conflict' &&
                ($rejected->get_error_data()['status'] ?? null) === 409,
            'duplicate migration is a typed 409 after rollback',
        );
        reference_assert(
            $snapshot() === $beforeMigration,
            'rejected migration leaves no article, revision, metadata, terms or index writes',
        );
    }
    $copy = mbb_references_prepare(
        reference_request('references/prepare', [
            'action' => 'copy',
            'post_id' => $id,
            'expected' => $saved['expected'],
        ]),
    );
    reference_assert(!is_wp_error($copy) && $copy['post_id'] === 0, 'copy candidate');
    $copied = reference_save([
        'post_id' => 0,
        'documentId' => $copy['document']['documentId'],
        'expected' => null,
        'identity_receipt' => $copy['identity_receipt'],
        'mode' => 'markdown',
        'source' => $copy['document']['source'],
        'title' => 'Copy fixture',
        'post_status' => 'draft',
    ]);
    $posts[] = $copied['post_id'];
    reference_assert(
        mbb_references_projection(get_post($copied['post_id'])->post_content)['identity'] !==
            $projection['identity'],
        'copy independent tuple',
    );
    $a = [
        'namespace' => 'S_' . str_repeat('a', 32),
        'document' => 'D_' . bin2hex(random_bytes(16)),
    ];
    $b = [
        'namespace' => 'S_' . str_repeat('b', 32),
        'document' => 'D_' . bin2hex(random_bytes(16)),
    ];
    $uploads = ['name' => [], 'tmp_name' => [], 'error' => [], 'size' => [], 'type' => []];
    foreach ([[$a, $b], [$b, $a]] as $i => [$own, $other]) {
        $body = mbb_references_insert_identity(
            ":::mbb:v1 object {\"id\":\"eq-one\",\"kind\":\"equation\",\"caption\":\"Batch equation\"}\n\n$$\nx\n$$\n\n:::mbb:end\n\n" .
                mbb_references_marker($other + ['target' => 'eq-one', 'kind' => 'equation']) .
                "\n",
            $own,
        );
        $path = tempnam(sys_get_temp_dir(), 'reference-batch-');
        file_put_contents($path, $body);
        chmod($path, 0600);
        $paths[] = $path;
        foreach (
            [
                'name' => 'reference-' . $i . '.md',
                'tmp_name' => $path,
                'error' => UPLOAD_ERR_OK,
                'size' => strlen($body),
                'type' => 'text/markdown',
            ]
            as $key => $value
        ) {
            $uploads[$key][] = $value;
        }
    }
    $request = reference_request('batch/prepare', ['identity_strategy' => 'copy']);
    $request->set_file_params(['documents' => $uploads]);
    $response = rest_do_request($request);
    reference_assert(
        $response->get_status() === 200,
        'batch prepare: ' . wp_json_encode($response->get_data()),
    );
    $batch = $response->get_data();
    $tokens[] = $batch['token'];
    reference_assert(count($batch['identityMappings']) === 2, 'frozen union map');
    foreach ($batch['items'] as $i => $item) {
        $preview = rest_do_request(
            reference_request('batch/' . $batch['token'] . '/preview', [
                'schema' => 1,
                'index' => $i,
                'title' => 'Reference batch ' . $i,
            ]),
        );
        reference_assert(
            $preview->get_status() === 200,
            'batch preview: ' . wp_json_encode($preview->get_data()),
        );
        $value = $preview->get_data();
        reference_assert(
            $value['identityMappings'] === $batch['identityMappings'],
            'preview reuses map',
        );
        $pair = mbb_convert([
            'mode' => 'markdown',
            'source' => $value['source'],
            'documentId' => $value['documentId'],
        ]);
        $projection = mbb_references_projection($pair['serialized']);
        reference_assert(
            $projection['identity'] === $batch['identityMappings'][$i]['after'],
            'own copied tuple',
        );
        reference_assert(
            $projection['edges'][0]['document'] ===
                $batch['identityMappings'][1 - $i]['after']['document'],
            'selected set internal reference',
        );
        $confirm = rest_do_request(
            reference_request('batch/' . $batch['token'] . '/confirm', [
                'schema' => 1,
                'index' => $i,
                'receipt' => $value['receipt'],
                'ack_public_media' => true,
            ]),
        );
        reference_assert(
            $confirm->get_status() === 200,
            'batch confirm: ' . wp_json_encode($confirm->get_data()),
        );
        $posts[] = $confirm->get_data()['post_id'];
    }
    echo "References lifecycle, candidate/no early write, FrontMatter/footnotes, identity claim/save, draft privacy/preview, preidentity history and copy passed.\n";
} finally {
    foreach ($tokens as $token) {
        rest_do_request(reference_request('batch/' . $token, [], 'DELETE'));
    }
    foreach ($paths as $path) {
        if (is_file($path)) {
            unlink($path);
        }
    }
    wp_set_current_user($previous);
    foreach ($posts as $id) {
        wp_delete_post($id, true);
    }
    if ($user && !is_wp_error($user)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
}
