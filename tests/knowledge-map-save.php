<?php
/** Actual paired save/permissions/export fixture; invoke only with disposable local WP-CLI. */
if (
    PHP_SAPI !== 'cli' ||
    !defined('WP_CLI') ||
    !WP_CLI ||
    !defined('ABSPATH') ||
    !getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT') ||
    realpath(ABSPATH) !== realpath(getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT')) ||
    !getenv('MARKBRIDGE_TEST_HOME') ||
    rtrim(home_url(), '/') !== rtrim(getenv('MARKBRIDGE_TEST_HOME'), '/') ||
    !in_array(parse_url(home_url(), PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException(
        'Knowledge-map checks require the explicitly identified disposable local lab.',
    );
}
function knowledge_check($ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function knowledge_request(string $path, array $data): WP_REST_Request
{
    $r = new WP_REST_Request(
        'POST',
        str_starts_with($path, '/wp/v2/') ? $path : '/mbb/v1/' . $path,
    );
    $r->set_header('Content-Type', 'application/json');
    $r->set_body(wp_json_encode($data));
    foreach ($data as $k => $v) {
        $r->set_param($k, $v);
    }
    return $r;
}
function knowledge_save(array $payload): array
{
    if (!array_key_exists('featured_media', $payload)) {
        $thumbnail = !empty($payload['post_id'])
            ? (int) get_post_thumbnail_id($payload['post_id'])
            : 0;
        $payload['featured_media'] =
            $thumbnail ?:
            (in_array($payload['post_status'] ?? 'draft', ['publish', 'private'], true)
                ? (int) ($GLOBALS['knowledge_fixture_featured_media'] ?? 0)
                : 0);
    }
    $preview = mbb_preview(knowledge_request('preview', $payload));
    knowledge_check(
        !is_wp_error($preview),
        'paired preview: ' . (is_wp_error($preview) ? $preview->get_error_message() : ''),
    );
    $bindings = ['adapter_digest', 'frontmatter_receipt'];
    if (($payload['mode'] ?? 'markdown') !== 'restore') {
        $bindings[] = 'resource_receipt';
    }
    foreach ($bindings as $key) {
        if (array_key_exists($key, $preview)) {
            $payload[$key] = $preview[$key];
        }
    }
    // Restore must not send resource_receipt, including a null value.
    if (($payload['mode'] ?? 'markdown') === 'restore') {
        unset($payload['resource_receipt']);
    }
    $saved = mbb_save(knowledge_request('save', $payload));
    knowledge_check(
        !is_wp_error($saved),
        'paired save: ' . (is_wp_error($saved) ? $saved->get_error_message() : ''),
    );
    return $saved;
}
function knowledge_fixture_png(): string
{
    $chunk = static fn($name, $bytes) => pack('N', strlen($bytes)) .
        $name .
        $bytes .
        pack('H*', hash('crc32b', $name . $bytes));
    return "\x89PNG\r\n\x1a\n" .
        $chunk('IHDR', pack('NNCCCCC', 48, 32, 8, 2, 0, 0, 0)) .
        $chunk('IDAT', gzcompress(str_repeat("\0" . str_repeat("\x30\x68\xa0", 48), 32))) .
        $chunk('IEND', '');
}
function knowledge_state(int $id): array
{
    clean_post_cache($id);
    $p = get_post($id);
    return [
        $p->post_content,
        $p->post_content_filtered,
        mbb_token($p),
        array_keys(wp_get_post_revisions($id)),
    ];
}
function knowledge_pair(int $id): array
{
    clean_post_cache($id);
    $p = get_post($id);
    $pair = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $p->post_content_filtered,
        'serialized' => $p->post_content,
        'documentId' => mbb_id($id),
    ]);
    knowledge_check(
        !is_wp_error($pair) && $pair['source'] === $p->post_content_filtered,
        'saved pair reopens',
    );
    $native = mbb_convert([
        'mode' => 'blocks',
        'base' => $pair,
        'serialized' => $p->post_content,
        'documentId' => mbb_id($id),
    ]);
    knowledge_check(
        !is_wp_error($native) && $native['source'] === $pair['source'],
        'native export with explicit base',
    );
    return $pair;
}
function knowledge_activity_source(): string
{
    $relation = [
        'schema' => 1,
        'prompt' => 'question',
        'options' => [
            ['key' => 'a', 'target' => 'option-a'],
            ['key' => 'b', 'target' => 'option-b'],
        ],
        'hints' => ['hint-one', 'hint-two'],
        'feedback' => ['correct' => 'correct', 'incorrect' => 'incorrect'],
        'explanation' => 'solution',
    ];
    $source =
        ':::mbb:v2 component ' .
        wp_json_encode([
            'id' => 'practice-check',
            'component' => 'self-check-choice',
            'componentVersion' => '0.1.0',
            'params' => ['correct' => 'b'],
            'activity' => $relation,
        ]) .
        "\n\n";
    foreach (
        [
            'question',
            'option-a',
            'option-b',
            'hint-one',
            'hint-two',
            'correct',
            'incorrect',
            'solution',
        ]
        as $i => $id
    ) {
        $source .=
            ':::mbb:v1 collapse ' .
            wp_json_encode(['id' => $id, 'title' => $id, 'open' => $i < 3]) .
            "\n\n" .
            'SYNTHETIC_ACTIVITY_BODY_' .
            $id .
            "\n\n:::mbb:end\n\n";
    }
    return $source . ":::mbb:end\n";
}
function knowledge_indexed_target(int $id, string $kind): stdClass
{
    $document = markbridge_document_target_for_post($id, true);
    knowledge_check(
        $document && $document->kind === 'document',
        'public API proves current portable identity',
    );
    $projection = mbb_references_projection(get_post($id)->post_content);
    foreach ($projection['objects'] as $object) {
        if ($object['kind'] === $kind) {
            return (object) [
                'kind' => $object['kind'],
                'namespace' => $document->namespace,
                'document' => $document->document,
                'target' => $object['id'],
            ];
        }
    }
    throw new RuntimeException('Actual reference projection lacks ' . $kind);
}
function knowledge_new_target(string $source, string $status, array &$posts): int
{
    $saved = knowledge_save([
        'post_id' => 0,
        'documentId' => 'KNOWLEDGE_TARGET_' . wp_generate_password(10, false),
        'mode' => 'markdown',
        'source' => $source,
        'title' => 'Synthetic ' . $status . ' knowledge target',
        'post_status' => $status,
    ]);
    $id = $saved['post_id'];
    $posts[] = $id;
    $prepared = mbb_references_prepare(
        knowledge_request('references/prepare', [
            'action' => 'enable',
            'post_id' => $id,
            'expected' => $saved['expected'],
            'source' => $source,
        ]),
    );
    knowledge_check(!is_wp_error($prepared), 'logical identity preparation');
    knowledge_save([
        'post_id' => $id,
        'expected' => $prepared['expected'],
        'mode' => 'markdown',
        'source' => $prepared['document']['source'],
        'identity_receipt' => $prepared['identity_receipt'],
        'title' => 'Synthetic ' . $status . ' knowledge target',
        'post_status' => $status,
    ]);
    return $id;
}
function knowledge_map_source(stdClass $p): string
{
    return ':::mbb:v1 component ' .
        wp_json_encode([
            'id' => 'knowledge',
            'component' => 'knowledge-map',
            'componentVersion' => '0.1.0',
            'params' => $p,
        ]) .
        "\n\nAuthor explanation.\n\n:::mbb:end\n";
}
$previous = get_current_user_id();
$posts = [];
$user = 0;
$exportToken = null;
$exportReceipt = null;
$attachment = 0;
$uploadFile = null;
$uploadHash = null;
$imageRun = bin2hex(random_bytes(8));
$GLOBALS['knowledge_fixture_featured_media'] = 0;
try {
    $admin = get_users(['role' => 'administrator', 'number' => 1])[0];
    wp_set_current_user($admin->ID);
    $ready = mbb_references_initialize();
    for ($i = 0; $i < 100 && ($ready['state'] ?? null) !== 'ready'; $i++) {
        $ready = mbb_references_rebuild_batch();
    }
    knowledge_check(($ready['state'] ?? null) === 'ready', 'reference index ready');
    $user = wp_insert_user([
        'user_login' => 'knowledge-' . wp_generate_password(12, false),
        'user_pass' => wp_generate_password(32),
        'role' => 'author',
    ]);
    knowledge_check(!is_wp_error($user), 'synthetic author');
    wp_set_current_user($user);
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';
    $imageBytes = knowledge_fixture_png();
    $upload = wp_upload_bits('knowledge-map-save-' . $imageRun . '.png', null, $imageBytes);
    knowledge_check(empty($upload['error']) && !empty($upload['file']), 'create owned PNG upload');
    $uploadFile = $upload['file'];
    $uploadHash = hash('sha256', $imageBytes);
    $inserted = wp_insert_attachment(
        [
            'post_title' => 'Synthetic knowledge map image',
            'post_mime_type' => 'image/png',
            'post_status' => 'inherit',
            'post_author' => $user,
        ],
        $uploadFile,
        0,
        true,
    );
    knowledge_check(
        !is_wp_error($inserted) && $inserted > 0,
        'create owned feature image attachment',
    );
    $attachment = (int) $inserted;
    update_post_meta($attachment, '_knowledge_map_save_run', $imageRun);
    $metadata = wp_generate_attachment_metadata($attachment, $uploadFile);
    wp_update_attachment_metadata($attachment, $metadata);
    knowledge_check(
        is_array($metadata) &&
            ($metadata['width'] ?? 0) === 48 &&
            ($metadata['height'] ?? 0) === 32 &&
            wp_get_attachment_metadata($attachment) === $metadata,
        'generate actual PNG attachment metadata',
    );
    knowledge_check(wp_attachment_is_image($attachment), 'owned attachment is a valid image');
    $GLOBALS['knowledge_fixture_featured_media'] = $attachment;
    $stepSource =
        ':::mbb:v1 steps {"id":"course","title":"Course","mode":"staged","previous":true,"next":true,"full":true}' .
        "\n\n" .
        ':::mbb:v1 step {"id":"read-step","title":"Reading stage"}' .
        "\n\nSaved reading.\n\n:::mbb:end\n\n:::mbb:end\n";
    $targets = [];
    $targetIds = [];
    foreach (['publish', 'draft', 'private'] as $status) {
        $id = knowledge_new_target(
            $stepSource . "\n" . knowledge_activity_source(),
            $status,
            $posts,
        );
        $targetIds[$status] = $id;
        $document = markbridge_document_target_for_post($id, true);
        knowledge_check(
            $document && $document->kind === 'document',
            'proven ' . $status . ' document target',
        );
        $targets[$status] = [
            $document,
            knowledge_indexed_target($id, 'step'),
            knowledge_indexed_target($id, 'activity'),
        ];
        foreach ($targets[$status] as $target) {
            $resolved = mbb_controlled_map_snapshot($target);
            knowledge_check(
                $resolved && (int) $resolved['post']->ID === $id,
                'actual ' . $status . ' document/step/activity resolves',
            );
        }
    }
    // Two ordinary v1 components deliberately reuse the real activity's local ID in their own documents.
    // Their identities and component IDs come from saved authoritative projections/descriptors.
    $ordinary = [
        ['insertion-sort', ['values' => [3, 1, 2], 'order' => 'asc']],
        [
            'teaching-replay',
            [
                'title' => 'Ordinary replay',
                'code' => ['language' => 'text', 'source' => 'show'],
                'steps' => [
                    [
                        'id' => 'first',
                        'title' => 'First',
                        'explanation' => 'Fixed state',
                        'line' => 1,
                        'view' => ['kind' => 'array', 'values' => [1, 2], 'active' => 0],
                    ],
                ],
            ],
        ],
    ];
    foreach ($ordinary as [$component, $params]) {
        $raw =
            ':::mbb:v1 component ' .
            wp_json_encode([
                'id' => $targets['publish'][2]->target,
                'component' => $component,
                'componentVersion' => '0.1.0',
                'params' => $params,
            ]) .
            "\n\nOrdinary component explanation.\n\n:::mbb:end\n";
        $id = knowledge_new_target($raw, 'publish', $posts);
        $document = markbridge_document_target_for_post($id, true);
        knowledge_check(
            $document && $document->kind === 'document',
            'ordinary component identity proved by public API',
        );
        $descriptors = mbb_component_descriptors(get_post($id)->post_content);
        $ids = array_keys($descriptors);
        knowledge_check(
            count($ids) === 1 && $ids[0] === $targets['publish'][2]->target,
            'ordinary component has same local id',
        );
        $pretend = (object) [
            'kind' => 'activity',
            'namespace' => $document->namespace,
            'document' => $document->document,
            'target' => $ids[0],
        ];
        knowledge_check(
            !isset(mbb_references_projection(get_post($id)->post_content)['objects'][$ids[0]]),
            'ordinary ' . $component . ' is not indexed as activity',
        );
        knowledge_check(
            mbb_references_resolve((array) $pretend) === ['state' => 'unavailable'] &&
                mbb_controlled_map_snapshot($pretend) === null,
            'ordinary ' . $component . ' cannot masquerade as activity',
        );
    }
    $wrong = clone $targets['publish'][1];
    $wrong->kind = 'activity';
    knowledge_check(
        mbb_controlled_map_snapshot($wrong) === null,
        'stage cannot masquerade as activity',
    );
    $p = (object) [
        'format' => 'knowledge-map/v1',
        'title' => 'Knowledge fixture',
        'groups' => [],
        'nodes' => [],
        'edges' => [],
    ];
    for ($g = 0; $g < 4; $g++) {
        $p->groups[] = (object) ['id' => 'group' . $g, 'title' => 'Group ' . $g];
    }
    for ($i = 0; $i < 15; $i++) {
        $status = $i < 3 || $i >= 9 ? 'publish' : ($i < 6 ? 'draft' : 'private');
        $role = ['concept', 'reading', 'practice'][$i % 3];
        $hidden = $status !== 'publish';
        $p->nodes[] = (object) [
            'id' => 'node' . $i,
            'group' => 'group' . min(3, intdiv($i, 4)),
            'title' => ($hidden ? 'HIDDEN_' : 'PUBLIC_') . 'NODE_' . $i,
            'role' => $role,
            'target' => $targets[$status][$i % 3],
            'description' => ($hidden ? 'HIDDEN_' : 'PUBLIC_') . 'DESCRIPTION_' . $i,
        ];
        if ($i > 0) {
            $p->edges[] = (object) [
                'id' => 'edge' . $i,
                'from' => 'node' . ($i - 1),
                'to' => 'node' . $i,
                'kind' => 'prerequisite',
                'why' =>
                    ($hidden || ($i - 1 >= 3 && $i - 1 <= 8) ? 'HIDDEN_' : 'PUBLIC_') . 'WHY_' . $i,
            ];
        }
    }
    $p->edges[] = (object) [
        'id' => 'incoming',
        'from' => 'node0',
        'to' => 'node2',
        'kind' => 'prerequisite',
        'why' => 'Public multiple incoming prerequisite',
    ];
    $p->edges[] = (object) [
        'id' => 'cross',
        'from' => 'node0',
        'to' => 'node12',
        'kind' => 'explains',
        'why' => 'Public cross-group explanation',
    ];
    $p->edges[] = (object) [
        'id' => 'cycle',
        'from' => 'node2',
        'to' => 'node0',
        'kind' => 'explains',
        'why' => 'Explanation cycle is allowed',
    ];
    $p->edges[] = (object) [
        'id' => 'practice',
        'from' => 'node1',
        'to' => 'node2',
        'kind' => 'practises',
        'why' => 'Public related practice',
    ];
    knowledge_check(
        mbb_knowledge_map_valid($p),
        '15-node four-group multi-incoming cross-group model',
    );
    $view = mbb_relation_map_v2_view($p, 'fixture');
    knowledge_check(
        count($view['map']->nodes) === 15 &&
            count($view['map']->groups) === 4 &&
            count($view['map']->edges) === 18,
        'author sees full safe graph',
    );
    $source = knowledge_map_source($p);
    $saved = knowledge_save([
        'post_id' => 0,
        'documentId' => 'KNOWLEDGE_MAP_' . wp_generate_password(10, false),
        'mode' => 'markdown',
        'source' => $source,
        'title' => 'Knowledge fixture',
        'post_status' => 'draft',
    ]);
    $mapId = $saved['post_id'];
    $posts[] = $mapId;
    $pair = knowledge_pair($mapId);
    $original = get_post($mapId);
    $originalSource = $original->post_content_filtered;
    $originalBlocks = $original->post_content;
    knowledge_check(
        !str_contains(preg_replace('/<!--[\s\S]*?-->/', '', $originalBlocks), 'HIDDEN_') &&
            !str_contains($originalBlocks, 'mbb-component-params'),
        'saved HTML has no author parameter carrier',
    );
    $revision = mbb_pair_snapshot($mapId);
    knowledge_check($revision && wp_get_post_revision($revision), 'paired history snapshot');
    $opening = knowledge_state($mapId);
    $changed = json_decode(wp_json_encode($p));
    $changed->title = 'Knowledge edited candidate';
    $edit = [
        'post_id' => $mapId,
        'expected' => mbb_token(get_post($mapId)),
        'mode' => 'markdown',
        'source' => knowledge_map_source($changed),
        'title' => 'Knowledge fixture',
        'post_status' => 'draft',
    ];
    $preview = mbb_preview(knowledge_request('preview', $edit));
    knowledge_check(
        !is_wp_error($preview) && knowledge_state($mapId) === $opening,
        'preview cancellation keeps pair and revisions untouched',
    );
    $bad = json_decode(wp_json_encode($p));
    $bad->edges[0]->to = $bad->edges[0]->from;
    $invalid = $edit;
    $invalid['source'] = knowledge_map_source($bad);
    foreach (['preview', 'save'] as $operation) {
        $result =
            $operation === 'preview'
                ? mbb_preview(knowledge_request($operation, $invalid))
                : mbb_save(knowledge_request($operation, $invalid));
        knowledge_check(
            is_wp_error($result) && ($result->get_error_data()['status'] ?? null) === 422,
            'invalid knowledge graph ' . $operation . ' rejects',
        );
        knowledge_check(
            knowledge_state($mapId) === $opening,
            'invalid graph does not write pair or revisions',
        );
    }
    // The native block candidate is exported against its actual saved pair before the existing blocks save.
    $converted = mbb_convert([
        'mode' => 'markdown',
        'documentId' => mbb_id($mapId),
        'source' => knowledge_map_source($changed),
    ]);
    knowledge_check(!is_wp_error($converted), 'changed graph converts');
    $blockCandidate = mbb_convert([
        'mode' => 'blocks',
        'base' => $pair,
        'serialized' => $converted['serialized'],
        'documentId' => mbb_id($mapId),
    ]);
    knowledge_check(!is_wp_error($blockCandidate), 'changed blocks export with saved base');
    knowledge_save([
        'post_id' => $mapId,
        'expected' => mbb_token(get_post($mapId)),
        'mode' => 'blocks',
        'serialized' => $blockCandidate['serialized'],
        'title' => 'Knowledge fixture',
        'post_status' => 'draft',
    ]);
    knowledge_check(
        str_contains(knowledge_pair($mapId)['source'], 'Knowledge edited candidate'),
        'blocks-mode graph edit persists',
    );
    $staleExpected = mbb_token(get_post($mapId));
    $nativeGraph = json_decode(wp_json_encode($changed));
    $nativeGraph->title = 'Knowledge native next edit';
    $native = mbb_convert([
        'mode' => 'markdown',
        'documentId' => mbb_id($mapId),
        'source' => knowledge_map_source($nativeGraph),
    ]);
    knowledge_check(!is_wp_error($native), 'native next graph converts');
    $response = rest_do_request(
        knowledge_request('/wp/v2/posts/' . $mapId, [
            'content' => $native['serialized'],
            'mbb_expected' => $staleExpected,
        ]),
    );
    knowledge_check(
        $response->get_status() === 200,
        'native posts graph save status ' . $response->get_status(),
    );
    knowledge_check(
        str_contains(knowledge_pair($mapId)['source'], 'Knowledge native next edit'),
        'native save regenerated paired graph source',
    );
    $afterNative = knowledge_state($mapId);
    $edit['expected'] = $staleExpected;
    $conflict = mbb_save(knowledge_request('save', $edit));
    knowledge_check(
        is_wp_error($conflict) &&
            ($conflict->get_error_data()['status'] ?? null) === 409 &&
            knowledge_state($mapId) === $afterNative,
        'stale graph save 409 preserves native edit',
    );
    knowledge_save([
        'post_id' => $mapId,
        'expected' => mbb_token(get_post($mapId)),
        'mode' => 'restore',
        'revision_id' => $revision,
        'expected_revision' => mbb_revision_token(wp_get_post_revision($revision)),
        'title' => 'Knowledge fixture',
        'post_status' => 'draft',
    ]);
    $restored = knowledge_pair($mapId);
    knowledge_check(
        $restored['source'] === $originalSource && $restored['serialized'] === $originalBlocks,
        'history restores exact full graph pair',
    );
    $snapshot = mbb_export_snapshot($mapId, mbb_token(get_post($mapId)));
    $export = mbb_export_plan($snapshot, 'html');
    $before = mbb_export_plan_digest($export);
    $exportCandidate = mbb_export_prepare(
        knowledge_request('export/prepare', [
            'schema' => 1,
            'post_id' => $mapId,
            'expected' => mbb_token(get_post($mapId)),
            'format' => 'html',
        ]),
    );
    knowledge_check(!is_wp_error($exportCandidate), 'actual HTML export candidate preparation');
    $exportToken = $exportCandidate['token'];
    $exportReceipt = $exportCandidate['receipt'];

    knowledge_check(
        str_contains($export['preview'], 'HIDDEN_NODE_3') &&
            str_contains($export['preview'], 'PUBLIC_NODE_0'),
        'authorized actual export contains permitted graph nodes',
    );
    foreach ($targets['publish'] as $target) {
        knowledge_check(
            !str_contains($export['preview'], $target->namespace),
            'export does not expose target identity',
        );
    }
    knowledge_check(
        !str_contains($export['preview'], 'SYNTHETIC_ACTIVITY_BODY_'),
        'map export does not copy activity bodies',
    );
    $config = [
        'schema' => 1,
        'title' => 'Course candidate',
        'lang' => 'en-US',
        'rights' => '',
        'cover' => null,
        'privateOptIn' => true,
        'chapters' => [
            ['key' => 'C_' . bin2hex(random_bytes(16)), 'post_id' => $targetIds['draft']],
        ],
    ];
    $catalog = mbb_collections_catalog($user);
    $candidate = markbridge_prepare_collection_configuration($config);
    knowledge_check(
        !is_wp_error($candidate) && mbb_collections_catalog($user) === $catalog,
        'candidate validates without catalog write',
    );
    $config['privateOptIn'] = false;
    knowledge_check(
        is_wp_error(markbridge_prepare_collection_configuration($config)),
        'private scope requires explicit opt in',
    );
    $stamp = mbb_controlled_map_stamp(get_post($mapId)->post_content);
    wp_set_current_user(0);
    $downloadRequest = knowledge_request('export/download', [
        'schema' => 1,
        'receipt' => $exportReceipt,
    ]);
    $downloadRequest->set_param('token', $exportToken);
    $deniedDownload = mbb_export_download($downloadRequest);
    knowledge_check(
        is_wp_error($deniedDownload) &&
            ($deniedDownload->get_error_data()['status'] ?? null) === 403,
        'anonymous cannot download the authorized export candidate',
    );
    foreach (['draft', 'private'] as $status) {
        knowledge_check(
            markbridge_resolve_document_target($targets[$status][0]) === [
                'state' => 'unavailable',
            ] && markbridge_document_target_for_post($targetIds[$status]) === null,
            'anonymous ' . $status . ' document neutral',
        );
        foreach (array_slice($targets[$status], 1) as $target) {
            knowledge_check(
                mbb_controlled_map_snapshot($target) === null,
                'anonymous ' . $status . ' object neutral',
            );
        }
    }
    foreach ($targets['publish'] as $target) {
        knowledge_check(
            mbb_controlled_map_snapshot($target) !== null,
            'anonymous genuine public document/step/activity remains readable',
        );
    }
    $view = mbb_relation_map_v2_view($p, 'fixture');
    knowledge_check(
        count($view['map']->nodes) === 9 && count($view['map']->groups) === 3,
        'anonymous hides six draft/private nodes and an empty group',
    );
    knowledge_check(
        !str_contains(wp_json_encode($view), 'HIDDEN_'),
        'anonymous graph hides descriptions and related why text',
    );
    $publicExport = mbb_export_plan($snapshot, 'html');
    knowledge_check(
        !str_contains($publicExport['preview'], 'HIDDEN_') &&
            str_contains($publicExport['preview'], 'PUBLIC_NODE_0'),
        'actual export replan filters stale authorized snapshot',
    );
    knowledge_check(
        mbb_export_plan_digest($publicExport) !== $before &&
            mbb_controlled_map_stamp(get_post($mapId)->post_content) !== $stamp,
        'permission changes invalidate export digest and graph stamp',
    );
    knowledge_check(
        is_wp_error(mbb_export_permission(['post_id' => $mapId])),
        'anonymous cannot prepare private article export',
    );
    wp_set_current_user($user);
    wp_delete_post($targetIds['publish'], true);
    foreach ($targets['publish'] as $target) {
        knowledge_check(
            mbb_controlled_map_snapshot($target) === null,
            'deleted public document and exact object targets unavailable',
        );
    }
    $changedDownload = mbb_export_download($downloadRequest);
    knowledge_check(
        is_wp_error($changedDownload) &&
            ($changedDownload->get_error_data()['status'] ?? null) === 409,
        'actual prepared HTML download rejects deleted graph dependency',
    );
    $deletedExport = mbb_export_plan(
        mbb_export_snapshot($mapId, mbb_token(get_post($mapId))),
        'html',
    );
    knowledge_check(
        !str_contains($deletedExport['preview'], 'PUBLIC_NODE_0') &&
            mbb_export_plan_digest($deletedExport) !== $before,
        'actual export final re-resolution removes deleted target and relations',
    );
    echo "Knowledge-map actual WP: true activity and v1 alias rejection; 15 nodes/four groups; preview cancel, blocks/native edits, invalid/409/history, public/draft/private/deleted target and export permissions passed.\n";
} finally {
    if ($exportToken && $user && !is_wp_error($user)) {
        wp_set_current_user($user);
        $cancel = knowledge_request('export/cancel', []);
        $cancel->set_param('token', $exportToken);
        mbb_export_cancel($cancel);
    }
    wp_set_current_user($previous);
    foreach ($posts as $id) {
        wp_delete_post($id, true);
    }
    if ($attachment && get_post($attachment)) {
        knowledge_check(
            (int) get_post($attachment)->post_author === (int) $user &&
                get_post_meta($attachment, '_knowledge_map_save_run', true) === $imageRun &&
                get_attached_file($attachment) === $uploadFile,
            'delete only this fixture attachment',
        );
        knowledge_check(
            (bool) wp_delete_attachment($attachment, true),
            'delete owned fixture attachment and image files',
        );
    }
    if ($uploadFile && is_file($uploadFile)) {
        knowledge_check(
            !is_link($uploadFile) && hash_equals($uploadHash, hash_file('sha256', $uploadFile)),
            'delete only exact owned PNG bytes',
        );
        wp_delete_file($uploadFile);
    }
    unset($GLOBALS['knowledge_fixture_featured_media']);
    if ($user && !is_wp_error($user)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($user);
    }
}
