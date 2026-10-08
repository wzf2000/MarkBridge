<?php
// Run via WP-CLI eval-file, one phase per process. Plugin switching is external.
// MARKBRIDGE_UPGRADE_PHASE (or eval-file's first argument):
// seed, check-unchanged, php-edit, node-edit, cleanup.
// MARKBRIDGE_UPGRADE_STATE must be an absolute private file outside public roots.

function upgrade_assert($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}

$expected_root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$expected_home = getenv('MARKBRIDGE_TEST_HOME');
upgrade_assert(
    $expected_root &&
        $expected_home &&
        in_array(
            parse_url($expected_home, PHP_URL_HOST),
            ['127.0.0.1', 'localhost', '::1'],
            true,
        ) &&
        realpath(ABSPATH) === realpath($expected_root) &&
        rtrim(home_url(), '/') === rtrim($expected_home, '/') &&
        wp_get_environment_type() === 'local',
    'Upgrade tests require an explicitly identified local WordPress.',
);
$phase = $args[0] ?? getenv('MARKBRIDGE_UPGRADE_PHASE');
upgrade_assert(
    in_array($phase, ['seed', 'check-unchanged', 'php-edit', 'node-edit', 'cleanup'], true),
    'Unknown upgrade test phase.',
);
$state_path = getenv('MARKBRIDGE_UPGRADE_STATE');
upgrade_assert(
    is_string($state_path) &&
        str_starts_with($state_path, '/') &&
        !str_contains($state_path, "\0") &&
        !is_link($state_path),
    'A private absolute state file is required.',
);
$state_parent = realpath(dirname($state_path));
upgrade_assert($state_parent && is_writable($state_parent), 'State directory unavailable.');
$state_path = $state_parent . '/' . basename($state_path);
$uploads = wp_upload_dir(null, false);
$public_roots = [
    ABSPATH,
    WP_CONTENT_DIR,
    $_SERVER['DOCUMENT_ROOT'] ?? '',
    $uploads['basedir'] ?? '',
];
foreach ($public_roots as $public_root) {
    $public_root = $public_root ? realpath($public_root) : false;
    upgrade_assert(
        !$public_root ||
            ($state_parent !== $public_root &&
                !str_starts_with($state_parent . '/', rtrim($public_root, '/') . '/')),
        'Upgrade state cannot be stored beneath a public directory.',
    );
}

function upgrade_write_state($path, array $state, $create = false)
{
    $bytes = wp_json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    if ($create) {
        $file = fopen($path, 'x');
        upgrade_assert(is_resource($file), 'Refusing to overwrite existing upgrade state.');
        try {
            upgrade_assert(
                chmod($path, 0600) && fwrite($file, $bytes) === strlen($bytes),
                'Could not save private state.',
            );
        } finally {
            fclose($file);
        }
        return;
    }
    $temporary = tempnam(dirname($path), 'mbb-upgrade-');
    upgrade_assert($temporary !== false, 'Could not allocate private state.');
    try {
        upgrade_assert(
            chmod($temporary, 0600) &&
                file_put_contents($temporary, $bytes, LOCK_EX) === strlen($bytes) &&
                rename($temporary, $path),
            'Could not advance private state.',
        );
    } finally {
        if (is_file($temporary)) {
            unlink($temporary);
        }
    }
}

function upgrade_request($route, array $parameters)
{
    $request = new WP_REST_Request('POST', $route);
    foreach ($parameters as $key => $value) {
        $request->set_param($key, $value);
    }
    $response = rest_do_request($request);
    upgrade_assert(
        $response instanceof WP_REST_Response && $response->get_status() === 200,
        'Synthetic paired REST request failed.',
    );
    return $response->get_data();
}

function upgrade_runtime_configuration()
{
    return [
        'constant_defined' => defined('MARKBRIDGE_RUNTIME'),
        'constant' => defined('MARKBRIDGE_RUNTIME') ? MARKBRIDGE_RUNTIME : null,
        'option' => get_option('mbb_runtime_path', ''),
    ];
}

function upgrade_snapshot($id, $comment_id)
{
    clean_post_cache($id);
    $post = get_post($id, ARRAY_A);
    upgrade_assert(is_array($post), 'Synthetic draft disappeared.');
    $metadata = get_post_meta($id);
    ksort($metadata);
    $revisions = [];
    foreach (
        wp_get_post_revisions($id, ['check_enabled' => false, 'posts_per_page' => -1])
        as $revision
    ) {
        $pair = get_metadata('post', $revision->ID, '_mbb_revision_pair', true);
        upgrade_assert(
            is_array($pair) &&
                ($pair['source_sha256'] ?? '') ===
                    hash('sha256', $revision->post_content_filtered) &&
                ($pair['blocks_sha256'] ?? '') === hash('sha256', $revision->post_content) &&
                ($pair['documentId'] ?? '') === mbb_id($id),
            'Synthetic revision lost its validated pair.',
        );
        $revision_meta = get_post_meta($revision->ID);
        ksort($revision_meta);
        $revisions[(string) $revision->ID] = [
            'post' => get_post($revision->ID, ARRAY_A),
            'meta' => $revision_meta,
        ];
    }
    ksort($revisions, SORT_NUMERIC);
    upgrade_assert(count($revisions) >= 2, 'Two synthetic paired revisions are required.');
    clean_comment_cache($comment_id);
    $comment = get_comment($comment_id, ARRAY_A);
    upgrade_assert(
        is_array($comment) && (int) $comment['comment_post_ID'] === $id,
        'Synthetic comment disappeared.',
    );
    return [
        'post' => $post,
        'meta' => $metadata,
        'comment' => $comment,
        'revisions' => $revisions,
        'permalink' => get_permalink($id),
    ];
}

function upgrade_unchanged(array $state)
{
    upgrade_assert(
        upgrade_runtime_configuration() === $state['runtime'],
        'Existing Node runtime configuration changed.',
    );
    upgrade_assert(
        upgrade_snapshot($state['post_id'], $state['comment_id']) === $state['snapshot'],
        'A plugin-only switch changed content, identity, comments, metadata or revisions.',
    );
}

function upgrade_retained(array $before, array $after)
{
    foreach (
        [
            'ID',
            'post_author',
            'post_name',
            'post_type',
            'post_status',
            'post_date',
            'post_date_gmt',
            'guid',
            'post_title',
            'comment_status',
            'ping_status',
            'post_password',
        ]
        as $field
    ) {
        upgrade_assert(
            $after['post'][$field] === $before['post'][$field],
            'A paired edit changed stable draft identity.',
        );
    }
    upgrade_assert(
        $after['permalink'] === $before['permalink'] &&
            $after['comment'] === $before['comment'] &&
            ($after['meta']['_portable_upgrade_private'] ?? null) ===
                ($before['meta']['_portable_upgrade_private'] ?? null) &&
            ($after['meta']['_portable_upgrade_run'] ?? null) ===
                ($before['meta']['_portable_upgrade_run'] ?? null),
        'A paired edit changed comments, private metadata or the fixture identity.',
    );
    foreach ($before['revisions'] as $id => $revision) {
        upgrade_assert(
            ($after['revisions'][$id] ?? null) === $revision,
            'A paired edit replaced earlier revision history.',
        );
    }
    upgrade_assert(
        count($after['revisions']) > count($before['revisions']),
        'A paired edit did not append a revision.',
    );
}

function upgrade_edit(array &$state, $marker)
{
    upgrade_unchanged($state);
    $before = $state['snapshot'];
    $base = mbb_document(get_post($state['post_id']));
    $old_marker = $state['marker'];
    upgrade_assert(
        substr_count($base['serialized'], $old_marker) === 1,
        'Synthetic edit marker is ambiguous.',
    );
    $changed = str_replace($old_marker, $marker, $base['serialized']);
    $expected_pair = mbb_convert([
        'mode' => 'blocks',
        'serialized' => $changed,
        'documentId' => $state['document_id'],
        'base' => $base,
    ]);
    upgrade_assert(
        !is_wp_error($expected_pair),
        'Selected backend could not reverse the changed synthetic blocks.',
    );
    upgrade_request('/wp/v2/posts/' . $state['post_id'], [
        'mbb_expected' => mbb_token(get_post($state['post_id'])),
        'content' => $changed,
    ]);
    $after = upgrade_snapshot($state['post_id'], $state['comment_id']);
    upgrade_assert(
        $after['post']['post_content'] === $expected_pair['serialized'] &&
            $after['post']['post_content_filtered'] === $expected_pair['source'] &&
            str_contains($after['post']['post_content_filtered'], $marker) &&
            !str_contains($after['post']['post_content_filtered'], $old_marker),
        'Selected backend did not save the actual block edit as a valid pair.',
    );
    upgrade_retained($before, $after);
    $state['marker'] = $marker;
    $state['snapshot'] = $after;
}

$administrators = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
upgrade_assert((bool) $administrators, 'An isolated administrator is required.');
$previous_user = get_current_user_id();
wp_set_current_user((int) $administrators[0]);
try {
    if ($phase === 'seed') {
        upgrade_assert(!file_exists($state_path), 'Upgrade state already exists.');
        upgrade_assert(
            !function_exists('mbb_converter_backend') && mbb_runtime_diagnostics()['ok'],
            'Seed requires the old Node plugin and compatible runtime.',
        );
        $run = bin2hex(random_bytes(12));
        $state = [
            'schema' => 1,
            'root' => realpath(ABSPATH),
            'home' => rtrim(home_url(), '/'),
            'run' => $run,
            'post_id' => 0,
            'comment_id' => 0,
            'document_id' => 'Upgrade' . $run,
            'runtime' => upgrade_runtime_configuration(),
            'stage' => 'seed-pending',
        ];
        upgrade_write_state($state_path, $state, true);
        $source =
            "# Synthetic upgrade\n\nOld Node baseline and **retained emphasis**, $" .
            "x^2$.\n\n- [x] Retained task\n\nNote[^upgrade].\n\n[^upgrade]: Retained footnote.\n";
        $created = upgrade_request('/mbb/v1/save', [
            'mode' => 'markdown',
            'post_id' => 0,
            'documentId' => $state['document_id'],
            'title' => 'Synthetic upgrade ' . $run,
            'source' => $source,
            'post_status' => 'draft',
            'featured_media' => 0,
        ]);
        $state['post_id'] = (int) ($created['post_id'] ?? 0);
        upgrade_assert($state['post_id'] > 0, 'Synthetic draft was not created.');
        update_post_meta($state['post_id'], '_portable_upgrade_run', $run);
        update_post_meta(
            $state['post_id'],
            '_portable_upgrade_private',
            'Private synthetic value ' . $run,
        );
        upgrade_write_state($state_path, $state);
        $state['comment_id'] = wp_insert_comment([
            'comment_post_ID' => $state['post_id'],
            'comment_content' => 'Synthetic retained comment ' . $run,
            'comment_approved' => 1,
        ]);
        upgrade_assert($state['comment_id'] > 0, 'Synthetic comment was not created.');
        upgrade_write_state($state_path, $state);
        $state['marker'] = 'Node seeded continuation';
        upgrade_request('/mbb/v1/save', [
            'mode' => 'markdown',
            'post_id' => $state['post_id'],
            'expected' => mbb_token(get_post($state['post_id'])),
            'source' => str_replace('Old Node baseline', $state['marker'], $source),
            'title' => get_post($state['post_id'])->post_title,
            'post_status' => 'draft',
            'featured_media' => 0,
        ]);
        $state['snapshot'] = upgrade_snapshot($state['post_id'], $state['comment_id']);
        $state['stage'] = 'seeded';
        upgrade_write_state($state_path, $state);
    } else {
        upgrade_assert(
            is_file($state_path) &&
                filesize($state_path) <= 1048576 &&
                (fileperms($state_path) & 0077) === 0,
            'Private upgrade state is unavailable or exposed.',
        );
        $state = json_decode(file_get_contents($state_path), true, 512, JSON_THROW_ON_ERROR);
        upgrade_assert(
            is_array($state) &&
                ($state['schema'] ?? null) === 1 &&
                ($state['root'] ?? '') === realpath(ABSPATH) &&
                ($state['home'] ?? '') === rtrim(home_url(), '/'),
            'Upgrade state belongs to another installation.',
        );
        if ($state['post_id']) {
            upgrade_assert(
                get_post_meta($state['post_id'], '_portable_upgrade_run', true) === $state['run'] &&
                    mbb_id($state['post_id']) === $state['document_id'],
                'Refusing to operate on an unowned fixture.',
            );
        }
        if ($phase === 'cleanup') {
            if ($state['post_id']) {
                upgrade_assert(
                    wp_delete_post($state['post_id'], true) !== false,
                    'Synthetic cleanup failed.',
                );
            }
            upgrade_assert(unlink($state_path), 'Could not remove private upgrade state.');
        } elseif ($phase === 'check-unchanged') {
            upgrade_assert(
                !defined('MARKBRIDGE_CONVERTER_BACKEND'),
                'Unchanged check must use configured engine selection.',
            );
            if ($state['stage'] === 'seeded') {
                upgrade_assert(
                    function_exists('mbb_converter_backend') && mbb_converter_backend() === 'node',
                    'Candidate did not preserve the configured Node engine.',
                );
            } else {
                upgrade_assert(
                    $state['stage'] === 'php-edited' && !function_exists('mbb_converter_backend'),
                    'Rollback check requires the old plugin after PHP editing.',
                );
            }
            upgrade_assert(mbb_runtime_diagnostics()['ok'], 'Configured Node runtime unavailable.');
            upgrade_unchanged($state);
        } elseif ($phase === 'php-edit') {
            upgrade_assert(
                $state['stage'] === 'seeded' &&
                    defined('MARKBRIDGE_CONVERTER_BACKEND') &&
                    MARKBRIDGE_CONVERTER_BACKEND === 'php' &&
                    function_exists('mbb_converter_backend') &&
                    mbb_converter_backend() === 'php',
                'PHP edit requires explicit candidate selection after seeding.',
            );
            upgrade_edit($state, 'PHP later continuation');
            $state['stage'] = 'php-edited';
            upgrade_write_state($state_path, $state);
        } else {
            upgrade_assert(
                $state['stage'] === 'php-edited' &&
                    !function_exists('mbb_converter_backend') &&
                    !defined('MARKBRIDGE_CONVERTER_BACKEND') &&
                    mbb_runtime_diagnostics()['ok'],
                'Node edit requires old plugin rollback after PHP editing.',
            );
            upgrade_edit($state, 'Old Node final continuation');
            $state['stage'] = 'node-edited';
            upgrade_write_state($state_path, $state);
        }
    }
    echo 'Portable upgrade phase ' . $phase . " assertions passed.\n";
} finally {
    wp_set_current_user($previous_user);
}
