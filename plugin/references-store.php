<?php
// All tables contain derived identifiers and fingerprints, never document bodies or private labels.
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
if (class_exists('wpdb')) {
    class MBB_Reference_DB extends wpdb
    {
        public function check_connection($allow_bail = true)
        {
            return false;
        }
    }
}
class MBB_Reference_Failure extends RuntimeException
{
    public function __construct(
        public string $diagnostic,
        string $message,
        public int $status = 409,
    ) {
        parent::__construct($message);
    }
}
function mbb_references_fail(string $code, string $message, int $status = 409): never
{
    throw new MBB_Reference_Failure($code, mbb_t($message), $status);
}
function mbb_references_error(Throwable $e)
{
    return mbb_error(
        $e instanceof MBB_Reference_Failure ? $e->diagnostic : 'reference_storage',
        $e instanceof MBB_Reference_Failure
            ? $e->getMessage()
            : mbb_t('The reference index could not be verified. Current input is preserved.'),
        $e instanceof MBB_Reference_Failure ? $e->status : 503,
    );
}
function mbb_references_tables(): array
{
    global $wpdb;
    return array_combine(
        ['control', 'claims', 'documents', 'objects', 'edges'],
        array_map(static fn($name) => $wpdb->prefix . 'mbb_ref_' . $name, [
            'control',
            'claims',
            'documents',
            'objects',
            'edges',
        ]),
    );
}
function mbb_references_connection(callable $callback)
{
    global $wpdb;
    if (!empty($GLOBALS['mbb_reference_connection'])) {
        return $callback();
    }
    $original = $wpdb;
    if (
        get_class($original) !== 'wpdb' ||
        (defined('WP_CONTENT_DIR') && is_file(WP_CONTENT_DIR . '/db.php'))
    ) {
        return mbb_error(
            'reference_backend',
            mbb_t(
                'Cross-document identities require the core WordPress transactional database connection. Legacy editing remains available.',
            ),
            503,
        );
    }
    $connection = new MBB_Reference_DB(DB_USER, DB_PASSWORD, DB_NAME, DB_HOST);
    $connection->set_prefix($original->base_prefix);
    $connection->set_blog_id(get_current_blog_id());
    $connection->suppress_errors(true);
    if (
        $connection->query('SET SESSION innodb_lock_wait_timeout = 3') === false ||
        $connection->query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED') === false
    ) {
        $connection->close();
        return mbb_error(
            'reference_backend',
            mbb_t('The reference database connection is unavailable. Current input is preserved.'),
            503,
        );
    }
    $wpdb = $connection;
    $GLOBALS['mbb_reference_connection'] = true;
    try {
        return $callback();
    } catch (Throwable $e) {
        return mbb_references_error($e);
    } finally {
        $connection->query('ROLLBACK');
        $wpdb = $original;
        unset(
            $GLOBALS['mbb_reference_connection'],
            $GLOBALS['mbb_reference_transaction'],
            $GLOBALS['mbb_reference_lifecycle'],
        );
        $connection->close();
    }
}
function mbb_references_sql(string $query): int|bool
{
    global $wpdb;
    $value = $wpdb->query($query);
    if ($value === false) {
        mbb_references_fail(
            'reference_storage',
            'The reference index could not be verified. Current input is preserved.',
            503,
        );
    }
    return $value;
}
function mbb_references_control(string $lock = ''): ?array
{
    global $wpdb;
    $t = mbb_references_tables();
    $row = $wpdb->get_row("SELECT * FROM {$t['control']} WHERE id=1" . $lock, ARRAY_A);
    if ($wpdb->last_error) {
        return null;
    }
    return $row;
}
function mbb_references_engines(): void
{
    global $wpdb;
    $tables = array_merge(
        [
            $wpdb->posts,
            $wpdb->postmeta,
            $wpdb->options,
            $wpdb->terms,
            $wpdb->term_taxonomy,
            $wpdb->term_relationships,
        ],
        array_values(mbb_references_tables()),
    );
    foreach ($tables as $table) {
        $engine = $wpdb->get_var(
            $wpdb->prepare(
                'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s',
                $table,
            ),
        );
        if (strcasecmp((string) $engine, 'InnoDB') !== 0) {
            mbb_references_fail(
                'reference_engine',
                'Cross-document identities require transactional tables. No existing table was changed.',
                503,
            );
        }
    }
}
function mbb_references_initialize()
{
    if (!empty($GLOBALS['mbb_reference_transaction'])) {
        return mbb_error(
            'nested_save',
            mbb_t('The reference index could not be verified. Current input is preserved.'),
            409,
        );
    }
    return mbb_references_connection(static function () {
        $GLOBALS['mbb_reference_lifecycle'] = true;
        global $wpdb;
        $t = mbb_references_tables();
        // Explicit product lifecycle only; never change the engine of an existing/core table.
        mbb_references_sql(
            "CREATE TABLE IF NOT EXISTS {$t['control']} (id tinyint unsigned NOT NULL, schema_version smallint unsigned NOT NULL, site_namespace char(34) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, active_generation bigint unsigned NOT NULL, building_generation bigint unsigned NOT NULL, cursor_id bigint unsigned NOT NULL, state varchar(16) CHARACTER SET ascii NOT NULL, error_post bigint unsigned NOT NULL DEFAULT 0, PRIMARY KEY(id)) ENGINE=InnoDB",
        );
        mbb_references_sql(
            "CREATE TABLE IF NOT EXISTS {$t['claims']} (generation bigint unsigned NOT NULL, namespace_key char(34) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, document_key char(34) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, post_id bigint unsigned NOT NULL, pair_hash char(64) CHARACTER SET ascii NOT NULL, PRIMARY KEY(generation,namespace_key,document_key), UNIQUE KEY owner(generation,post_id)) ENGINE=InnoDB",
        );
        mbb_references_sql(
            "CREATE TABLE IF NOT EXISTS {$t['documents']} (generation bigint unsigned NOT NULL, post_id bigint unsigned NOT NULL, pair_hash char(64) CHARACTER SET ascii NOT NULL, PRIMARY KEY(generation,post_id)) ENGINE=InnoDB",
        );
        mbb_references_sql(
            "CREATE TABLE IF NOT EXISTS {$t['objects']} (generation bigint unsigned NOT NULL, post_id bigint unsigned NOT NULL, target_key varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, kind varchar(16) CHARACTER SET ascii NOT NULL, PRIMARY KEY(generation,post_id,target_key)) ENGINE=InnoDB",
        );
        mbb_references_sql(
            "CREATE TABLE IF NOT EXISTS {$t['edges']} (generation bigint unsigned NOT NULL, post_id bigint unsigned NOT NULL, edge_hash char(64) CHARACTER SET ascii NOT NULL, namespace_key char(34) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, document_key char(34) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, target_key varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, kind varchar(16) CHARACTER SET ascii NOT NULL, PRIMARY KEY(generation,post_id,edge_hash), KEY incoming(generation,namespace_key,document_key,target_key)) ENGINE=InnoDB",
        );
        mbb_references_engines();
        mbb_references_sql(
            $wpdb->prepare(
                "INSERT IGNORE INTO {$t['control']} (id,schema_version,site_namespace,active_generation,building_generation,cursor_id,state) VALUES (1,1,%s,0,1,0,'building')",
                'S_' . bin2hex(random_bytes(16)),
            ),
        );
        $control = mbb_references_control();
        if ($control && $control['state'] === 'conflict') {
            return ['state' => 'conflict'];
        }
        return $control && $control['state'] === 'ready'
            ? ['state' => 'ready', 'generation' => (int) $control['active_generation']]
            : mbb_references_rebuild_batch();
    });
}
function mbb_references_pair_hash($post): string
{
    return hash('sha256', $post->post_content_filtered . "\0" . $post->post_content);
}
function mbb_references_fresh_user(): void
{
    $id = get_current_user_id();
    if (!$id) {
        return;
    }
    clean_user_cache($id);
    wp_cache_delete($id, 'user_meta');
    $token = wp_get_session_token();
    if ($token !== '' && !WP_Session_Tokens::get_instance($id)->verify($token)) {
        wp_set_current_user(0);
        return;
    }
    clean_user_cache($id);
    wp_cache_delete($id, 'user_meta');
    $roles = wp_roles();
    wp_cache_delete($roles->role_key, 'options');
    wp_cache_delete('alloptions', 'options');
    wp_cache_delete('notoptions', 'options');
    $roles->for_site(get_current_blog_id());
    $GLOBALS['current_user'] = new WP_User($id, '', get_current_blog_id());
}
function mbb_references_fresh_post(int $id)
{
    clean_post_cache($id);
    wp_cache_delete($id, 'post_meta');
    return get_post($id);
}
function mbb_references_index_post(int $generation, $post, array $projection): void
{
    global $wpdb;
    $t = mbb_references_tables();
    $id = (int) $post->ID;
    $hash = mbb_references_pair_hash($post);
    foreach (['claims', 'documents', 'objects', 'edges'] as $name) {
        mbb_references_sql(
            $wpdb->prepare(
                "DELETE FROM {$t[$name]} WHERE generation=%d AND post_id=%d",
                $generation,
                $id,
            ),
        );
    }
    if (!$projection['identity'] && !$projection['edges']) {
        return;
    }
    if ($identity = $projection['identity']) {
        $ok = $wpdb->query(
            $wpdb->prepare(
                "INSERT INTO {$t['claims']} (generation,namespace_key,document_key,post_id,pair_hash) VALUES (%d,%s,%s,%d,%s)",
                $generation,
                $identity['namespace'],
                $identity['document'],
                $id,
                $hash,
            ),
        );
        if ($ok !== 1) {
            mbb_references_fail(
                'identity_conflict',
                'This logical identity is unavailable or already claimed. Prepare a copy with a new identity.',
            );
        }
    }
    mbb_references_sql(
        $wpdb->prepare(
            "INSERT INTO {$t['documents']} (generation,post_id,pair_hash) VALUES (%d,%d,%s)",
            $generation,
            $id,
            $hash,
        ),
    );
    foreach ($projection['objects'] as $object) {
        mbb_references_sql(
            $wpdb->prepare(
                "INSERT INTO {$t['objects']} (generation,post_id,target_key,kind) VALUES (%d,%d,%s,%s)",
                $generation,
                $id,
                $object['id'],
                $object['kind'],
            ),
        );
    }
    foreach ($projection['edges'] as $edge) {
        mbb_references_sql(
            $wpdb->prepare(
                "INSERT INTO {$t['edges']} (generation,post_id,edge_hash,namespace_key,document_key,target_key,kind) VALUES (%d,%d,%s,%s,%s,%s,%s)",
                $generation,
                $id,
                hash('sha256', wp_json_encode($edge)),
                $edge['namespace'],
                $edge['document'],
                $edge['target'],
                $edge['kind'],
            ),
        );
    }
}
function mbb_references_cleanup(int $generation): bool
{
    global $wpdb;
    $t = mbb_references_tables();
    $remaining = false;
    foreach (['claims', 'documents', 'objects', 'edges'] as $name) {
        mbb_references_sql(
            $wpdb->prepare("DELETE FROM {$t[$name]} WHERE generation<>%d LIMIT 100", $generation),
        );
        if (
            $wpdb->get_var(
                $wpdb->prepare(
                    "SELECT 1 FROM {$t[$name]} WHERE generation<>%d LIMIT 1",
                    $generation,
                ),
            )
        ) {
            $remaining = true;
        }
    }
    return $remaining;
}
function mbb_references_rebuild_batch(bool $restart = false)
{
    if (!empty($GLOBALS['mbb_reference_transaction'])) {
        return mbb_error(
            'nested_save',
            mbb_t('The reference index could not be verified. Current input is preserved.'),
            409,
        );
    }
    return mbb_references_connection(static function () use ($restart) {
        $GLOBALS['mbb_reference_lifecycle'] = true;
        global $wpdb;
        $actor = get_current_user_id();
        mbb_references_fresh_user();
        if ($actor && !current_user_can('manage_options')) {
            mbb_references_fail('forbidden', 'Administrator permission is required.', 403);
        }
        $t = mbb_references_tables();
        mbb_references_engines();
        mbb_references_sql('START TRANSACTION');
        $control = mbb_references_control(' FOR UPDATE');
        if (!$control || (int) $control['schema_version'] !== 1) {
            mbb_references_fail(
                'reference_uninitialized',
                'The reference index has not been initialized.',
                503,
            );
        }
        if ($restart || in_array($control['state'], ['ready', 'conflict', 'cleanup'], true)) {
            mbb_references_sql(
                "UPDATE {$t['control']} SET state='cleanup',cursor_id=0,error_post=0 WHERE id=1",
            );
            if (mbb_references_cleanup((int) $control['active_generation'])) {
                mbb_references_sql('COMMIT');
                return ['state' => 'cleanup', 'cursor' => 0];
            }
            $control['building_generation'] = (int) $control['active_generation'] + 1;
            $control['cursor_id'] = 0;
            $control['state'] = 'building';
            mbb_references_sql(
                $wpdb->prepare(
                    "UPDATE {$t['control']} SET state='building',building_generation=%d,cursor_id=0,error_post=0 WHERE id=1",
                    $control['building_generation'],
                ),
            );
        }
        $posts = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT p.* FROM {$wpdb->posts} p WHERE p.ID>%d AND p.post_type IN ('post','page') AND EXISTS (SELECT 1 FROM {$wpdb->postmeta} m WHERE m.post_id=p.ID AND m.meta_key='_mbb_origin' AND m.meta_value='markdown_import') ORDER BY p.ID LIMIT 10",
                $control['cursor_id'],
            ),
        );
        if ($wpdb->last_error) {
            mbb_references_fail(
                'reference_storage',
                'The reference index could not be verified. Current input is preserved.',
                503,
            );
        }
        foreach ($posts as $post) {
            try {
                $pair = mbb_convert([
                    'mode' => 'paired_restore',
                    'source' => $post->post_content_filtered,
                    'serialized' => $post->post_content,
                    'documentId' => mbb_id($post->ID),
                ]);
                if (is_wp_error($pair)) {
                    throw new RuntimeException('Invalid paired document');
                }
                mbb_references_fresh_user();
                if ($actor && !current_user_can('manage_options')) {
                    mbb_references_fail('forbidden', 'Administrator permission is required.', 403);
                }
                mbb_references_index_post(
                    (int) $control['building_generation'],
                    $post,
                    mbb_references_projection($post->post_content),
                );
            } catch (Throwable $e) {
                if ($e instanceof MBB_Reference_Failure && $e->diagnostic === 'forbidden') {
                    throw $e;
                }
                mbb_references_sql(
                    $wpdb->prepare(
                        "UPDATE {$t['control']} SET state='conflict',error_post=%d WHERE id=1",
                        $post->ID,
                    ),
                );
                mbb_references_sql('COMMIT');
                return [
                    'state' => 'conflict',
                    'post_id' => current_user_can('edit_post', $post->ID) ? (int) $post->ID : null,
                ];
            }
            $control['cursor_id'] = (int) $post->ID;
        }
        $done = count($posts) < 10;
        mbb_references_sql(
            $wpdb->prepare(
                "UPDATE {$t['control']} SET cursor_id=%d,state=%s,active_generation=%d WHERE id=1",
                $control['cursor_id'],
                $done ? 'ready' : 'building',
                $done ? (int) $control['building_generation'] : (int) $control['active_generation'],
            ),
        );
        mbb_references_sql('COMMIT');
        return ['state' => $done ? 'ready' : 'building', 'cursor' => $control['cursor_id']];
    });
}
function mbb_references_request_touched($request, int $id): bool
{
    if (!empty($GLOBALS['mbb_reference_connection'])) {
        return false;
    }
    if ($id) {
        global $wpdb;
        $p = $wpdb->get_row(
            $wpdb->prepare("SELECT post_content FROM {$wpdb->posts} WHERE ID=%d", $id),
        );
        if ($p && str_contains($p->post_content, '<!-- wp:mbb/identity')) {
            return true;
        }
        if ($p && str_contains($p->post_content, 'data-mbb-version="2"')) {
            return true;
        }
    }
    foreach (['source', 'serialized', 'content'] as $field) {
        $raw = $request[$field] ?? '';
        if (is_array($raw)) {
            $raw = $raw['raw'] ?? '';
        }
        if (
            is_string($raw) &&
            (str_contains($raw, ':::mbb:v1 identity ') ||
                str_contains($raw, '<!-- wp:mbb/identity') ||
                str_contains($raw, 'data-mbb-version="2"'))
        ) {
            return true;
        }
    }
    return false;
}
function mbb_references_requires_connection(array $document): bool
{
    if (!empty($GLOBALS['mbb_reference_connection'])) {
        return false;
    }
    $projection = mbb_references_projection($document['serialized']);
    return (bool) ($projection['identity'] || $projection['edges']);
}
function mbb_references_start_sql()
{
    global $wpdb;
    if (!empty($GLOBALS['mbb_reference_transaction'])) {
        return 0;
    }
    $ok = $wpdb->query('START TRANSACTION');
    if ($ok !== false && !empty($GLOBALS['mbb_reference_connection'])) {
        $control = mbb_references_control(' LOCK IN SHARE MODE');
        if (!$control || $control['state'] !== 'ready') {
            mbb_references_fail(
                'reference_uninitialized',
                'The reference index is not ready. An administrator can initialize or rebuild it.',
                503,
            );
        }
        $GLOBALS['mbb_reference_transaction'] = [
            'generation' => (int) $control['active_generation'],
            'started_only' => true,
        ];
    }
    return $ok;
}
function mbb_references_begin(
    int $id,
    array $document,
    $request,
    bool $alreadyStarted = false,
): void {
    if (empty($GLOBALS['mbb_reference_connection'])) {
        return;
    }
    global $wpdb;
    $t = mbb_references_tables();
    mbb_references_engines();
    if (!$alreadyStarted) {
        mbb_references_sql('START TRANSACTION');
    }
    $GLOBALS['mbb_reference_transaction'] = ['preparing' => true];
    $repair = false;
    if (!empty($request['identity_receipt'])) {
        $operation = mbb_references_operation((string) $request['identity_receipt']);
        $repair =
            ($operation['action'] ?? '') === 'repair-copy' && current_user_can('manage_options');
    }
    $control = mbb_references_control($repair ? ' FOR UPDATE' : ' LOCK IN SHARE MODE');
    if (
        !$control ||
        ($control['state'] !== 'ready' && !($repair && $control['state'] === 'conflict')) ||
        (int) $control['schema_version'] !== 1
    ) {
        mbb_references_fail(
            'reference_uninitialized',
            'The reference index is not ready. An administrator can initialize or rebuild it.',
            503,
        );
    }
    $old = null;
    if ($id) {
        $row = $wpdb->get_var(
            $wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE ID=%d FOR UPDATE", $id),
        );
        $old = mbb_references_fresh_post($id);
        mbb_references_fresh_user();
        if ((int) $row !== $id || !$old || !current_user_can('edit_post', $id)) {
            mbb_references_fail('forbidden', 'This article is unavailable.', 403);
        }
        $expected = $request['expected'] ?? ($request['mbb_expected'] ?? null);
        if (!is_string($expected) || !hash_equals(mbb_token($old), $expected)) {
            mbb_references_fail(
                'conflict',
                'The article has newer changes. Reload and merge them.',
            );
        }
    }
    if ($repair && !current_user_can('manage_options')) {
        mbb_references_fail('forbidden', 'Administrator permission is required.', 403);
    }
    mbb_references_fresh_user();
    if (!$id && !current_user_can('edit_posts')) {
        mbb_references_fail('forbidden', 'This article is unavailable.', 403);
    }
    if (
        $id &&
        get_post_meta($id, '_mbb_source_managed', true) === 'file' &&
        !empty($GLOBALS['mbb_source_web_write'])
    ) {
        $capability = apply_filters('mbb_source_write_capability', 'edit_post', $id);
        if (!$capability || !current_user_can($capability, $id)) {
            mbb_references_fail('forbidden', 'This article is unavailable.', 403);
        }
    }
    $next = mbb_references_projection($document['serialized']);
    $previous = $old ? mbb_references_projection($old->post_content) : ['identity' => null];
    if ($repair) {
        mbb_references_verify_operation($request, $id, $next['identity']);
        if (($operation['previous_identity'] ?? null) !== $previous['identity']) {
            mbb_references_fail(
                'identity_receipt',
                'Prepare the identity operation again. Current input is preserved.',
            );
        }
    }
    if (!$repair && $previous['identity'] && $next['identity'] !== $previous['identity']) {
        mbb_references_fail(
            'identity_changed',
            'The current logical identity must be retained. Prepare an explicit copy candidate instead.',
        );
    }
    if (!$previous['identity'] && $next['identity']) {
        mbb_references_verify_operation($request, $id, $next['identity']);
    }
    mbb_references_fresh_user();
    if (
        ($id && !current_user_can('edit_post', $id)) ||
        (!$id && !current_user_can('edit_posts')) ||
        ($repair && !current_user_can('manage_options'))
    ) {
        mbb_references_fail('forbidden', 'This article is unavailable.', 403);
    }
    if (
        $id &&
        !hash_equals(
            mbb_token(mbb_references_fresh_post($id)),
            (string) ($request['expected'] ?? ($request['mbb_expected'] ?? '')),
        )
    ) {
        mbb_references_fail('conflict', 'The article has newer changes. Reload and merge them.');
    }
    $generation = (int) $control['active_generation'];
    if ($next['identity'] && $id) {
        $identity = $next['identity'];
        $owner = $wpdb->get_var(
            $wpdb->prepare(
                "SELECT post_id FROM {$t['claims']} WHERE generation=%d AND namespace_key=%s AND document_key=%s",
                $generation,
                $identity['namespace'],
                $identity['document'],
            ),
        );
        if (!$repair && $previous['identity'] && (int) $owner !== $id) {
            mbb_references_fail(
                'reference_stale',
                'The reference index is stale. Ask an administrator to rebuild it.',
                503,
            );
        }
        if ($repair) {
            mbb_references_sql(
                $wpdb->prepare(
                    "DELETE FROM {$t['claims']} WHERE generation=%d AND post_id=%d",
                    $generation,
                    $id,
                ),
            );
        }
        if (!$previous['identity'] || $repair) {
            if (
                $wpdb->query(
                    $wpdb->prepare(
                        "INSERT INTO {$t['claims']} (generation,namespace_key,document_key,post_id,pair_hash) VALUES (%d,%s,%s,%d,%s)",
                        $generation,
                        $identity['namespace'],
                        $identity['document'],
                        $id,
                        mbb_references_pair_hash($old),
                    ),
                ) !== 1
            ) {
                mbb_references_fail(
                    'identity_conflict',
                    'This logical identity is unavailable or already claimed. Prepare a copy with a new identity.',
                );
            }
        }
    }
    $GLOBALS['mbb_reference_transaction'] = [
        'generation' => $generation,
        'projection' => $next,
        'repair' => $repair,
    ];
}
function mbb_references_finish(int $id, array $document): void
{
    if (empty($GLOBALS['mbb_reference_transaction'])) {
        if (mbb_references_requires_connection($document)) {
            mbb_references_fail('reference_connection_required', 'Reference transaction required.');
        }
        return;
    }
    mbb_references_fresh_user();
    if (!current_user_can('edit_post', $id)) {
        mbb_references_fail('forbidden', 'This article is unavailable.', 403);
    }
    if (
        !empty($GLOBALS['mbb_reference_transaction']['repair']) &&
        !current_user_can('manage_options')
    ) {
        mbb_references_fail('forbidden', 'Administrator permission is required.', 403);
    }
    $post = mbb_references_fresh_post($id);
    if (
        $post &&
        in_array($post->post_status, ['publish', 'private'], true) &&
        !current_user_can($post->post_type === 'page' ? 'publish_pages' : 'publish_posts')
    ) {
        mbb_references_fail('forbidden', 'This article is unavailable.', 403);
    }
    if (
        get_post_meta($id, '_mbb_source_managed', true) === 'file' &&
        !empty($GLOBALS['mbb_source_web_write'])
    ) {
        $capability = apply_filters('mbb_source_write_capability', 'edit_post', $id);
        if (!$capability || !current_user_can($capability, $id)) {
            mbb_references_fail('forbidden', 'This article is unavailable.', 403);
        }
    }
    if (
        !$post ||
        $post->post_content !== $document['serialized'] ||
        $post->post_content_filtered !== $document['source']
    ) {
        mbb_references_fail(
            'reference_pair',
            'The saved document changed. The reference index was not committed.',
        );
    }
    mbb_references_index_post(
        $GLOBALS['mbb_reference_transaction']['generation'],
        $post,
        mbb_references_projection($post->post_content),
    );
    mbb_references_fresh_user();
    if (
        !current_user_can('edit_post', $id) ||
        (!empty($GLOBALS['mbb_reference_transaction']['repair']) &&
            !current_user_can('manage_options'))
    ) {
        mbb_references_fail('forbidden', 'This article is unavailable.', 403);
    }
}
