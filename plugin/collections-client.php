<?php
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
// This is a trusted PHP/author-browser bridge, not an HTML upload or publication endpoint.
function mbb_register_publication_client_adapter(
    string $id,
    array $descriptor,
    array $resources,
): bool {
    if (
        !$resources ||
        !array_is_list($resources) ||
        count($resources) > 8 ||
        isset($GLOBALS['mbb_publication_clients'][$id])
    ) {
        return false;
    }
    $seen = [];
    $total = 0;
    foreach ($resources as $resource) {
        if (
            !mbb_collections_closed($resource, ['file', 'sha256']) ||
            !is_string($resource['file']) ||
            !is_string($resource['sha256']) ||
            !mbb_collections_token($resource['sha256']) ||
            is_link($resource['file']) ||
            !is_file($resource['file']) ||
            realpath($resource['file']) !== $resource['file'] ||
            isset($seen[$resource['file']])
        ) {
            return false;
        }
        $seen[$resource['file']] = true;
        $bytes = filesize($resource['file']);
        $total += $bytes;
        if (
            $bytes > 524288 ||
            $total > 2097152 ||
            !hash_equals($resource['sha256'], (string) hash_file('sha256', $resource['file']))
        ) {
            return false;
        }
    }
    if (!mbb_register_publication_adapter($id, $descriptor)) {
        return false;
    }
    $GLOBALS['mbb_publication_clients'][$id] = $resources;
    return true;
}
function mbb_collections_client_core(): string
{
    $files = [];
    $assets = json_decode(
        file_get_contents(__DIR__ . '/assets.json'),
        true,
        8,
        JSON_THROW_ON_ERROR,
    );
    foreach (
        [
            'collections-ui.js',
            'static-export.js',
            'static-code.js',
            'math.js',
            'math-engine.js',
            'math-engine.html',
            'code-display.css',
        ]
        as $name
    ) {
        $file = $assets[$name] ?? null;
        if (
            !is_string($file) ||
            !preg_match('/^[a-z-]+-[a-f0-9]{12}\.(?:js|css|html)$/D', $file) ||
            is_link(__DIR__ . '/' . $file) ||
            !is_file(__DIR__ . '/' . $file)
        ) {
            mbb_collections_fail('collection_adapter', 503);
        }
        $hash = (string) hash_file('sha256', __DIR__ . '/' . $file);
        if (!str_contains($file, '-' . substr($hash, 0, 12) . '.')) {
            mbb_collections_fail('collection_changed');
        }
        $files[$file] = $hash;
    }
    $vendor = json_decode(
        file_get_contents(__DIR__ . '/vendor-manifest.json'),
        true,
        8,
        JSON_THROW_ON_ERROR,
    );
    if (!is_array($vendor) || count($vendor) > 600) {
        mbb_collections_fail('collection_adapter', 503);
    }
    foreach ($vendor as $name => $expected) {
        if (
            !is_string($name) ||
            !preg_match(
                '~^vendor/(?:mathjax-4\.1\.3|mathjax-newcm-font)/[A-Za-z0-9_./-]+$~D',
                $name,
            ) ||
            str_contains($name, '..') ||
            is_link(__DIR__ . '/' . $name) ||
            !hash_equals($expected, (string) hash_file('sha256', __DIR__ . '/' . $name))
        ) {
            mbb_collections_fail('collection_changed');
        }
        $files[$name] = $expected;
    }
    $count = 0;
    foreach (
        new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator(
                __DIR__ . '/vendor/prism',
                FilesystemIterator::SKIP_DOTS,
            ),
        )
        as $file
    ) {
        if (++$count > 600 || $file->isLink() || !$file->isFile()) {
            mbb_collections_fail('collection_adapter', 503);
        }
        $files[substr($file->getPathname(), strlen(__DIR__) + 1)] = (string) hash_file(
            'sha256',
            $file->getPathname(),
        );
    }
    ksort($files, SORT_STRING);
    return hash('sha256', mbb_collections_json($files));
}
function mbb_collections_client_metadata(string $adapter): ?array
{
    $resources = $GLOBALS['mbb_publication_clients'][$adapter] ?? null;
    if ($resources === null) {
        return null;
    }
    $provider = $GLOBALS['mbb_publication_adapters'][$adapter] ?? null;
    if (!$provider) {
        mbb_collections_fail('collection_adapter', 503);
    }
    $hashes = [];
    foreach ($resources as $resource) {
        if (
            is_link($resource['file']) ||
            !is_file($resource['file']) ||
            realpath($resource['file']) !== $resource['file'] ||
            !hash_equals($resource['sha256'], (string) hash_file('sha256', $resource['file']))
        ) {
            mbb_collections_fail('collection_changed');
        }
        $hashes[] = $resource['sha256'];
    }
    return [
        'schema' => 1,
        'version' => $provider['version'],
        'fingerprint' => hash(
            'sha256',
            mbb_collections_json([
                $provider['fingerprint'],
                $hashes,
                mbb_collections_client_core(),
            ]),
        ),
    ];
}
function mbb_collections_client_download($r)
{
    $lock = null;
    try {
        $data = mbb_collections_input($r, [
            'schema',
            'receipt',
            'snapshot_sha256',
            'provider_fingerprint',
            'projection_sha256',
            'projection_bytes',
        ]);
        foreach (
            ['receipt', 'snapshot_sha256', 'provider_fingerprint', 'projection_sha256']
            as $key
        ) {
            if (!mbb_collections_token($data[$key])) {
                mbb_collections_fail('collection_input', 422);
            }
        }
        if (
            !is_int($data['projection_bytes']) ||
            $data['projection_bytes'] < 1 ||
            $data['projection_bytes'] > MBB_COLLECTION_LIMITS['artifactBytes']
        ) {
            mbb_collections_fail('collection_quota', 413);
        }
        $token = $r['token'];
        [$job, $dir, $lock] = mbb_collections_lock($token);
        $record = mbb_collections_record($dir);
        if (
            $job['state'] !== 'confirmed' ||
            !hash_equals(
                mbb_collections_receipt($token, $job, $record['snapshot']['sha256']),
                $data['receipt'],
            ) ||
            $data['snapshot_sha256'] !== $record['snapshot']['sha256']
        ) {
            mbb_collections_fail('collection_changed');
        }
        $fresh = mbb_collections_verify($record);
        $client = mbb_collections_client_metadata($record['adapter']);
        if (
            !$client ||
            !hash_equals($client['fingerprint'], $data['provider_fingerprint']) ||
            $job['expires'] < time()
        ) {
            mbb_collections_fail('collection_changed');
        }
        $next = $job;
        $next['state'] = 'authorizing';
        if (!mbb_collections_job_update($token, $next, $job)) {
            mbb_collections_fail('collection_changed');
        }
        $payload = [
            'schema' => 1,
            'authorized' => true,
            'snapshot_sha256' => $data['snapshot_sha256'],
            'provider_fingerprint' => $client['fingerprint'],
            'projection_sha256' => $data['projection_sha256'],
            'projection_bytes' => $data['projection_bytes'],
            'expires' => $job['expires'],
        ];
        $response = new WP_REST_Response($payload, 200, [
            'Content-Type' => 'application/json; charset=UTF-8',
            'X-MBB-Collection-Client' => '1',
            'Cache-Control' => 'private, no-store, max-age=0',
            'Vary' => 'Cookie',
        ]);
        $GLOBALS['mbb_collection_client_downloads'][spl_object_id($response)] = [
            'dir' => $dir,
            'lock' => $lock,
            'token' => $token,
            'job' => $next,
            'record' => $record,
            'fresh' => $fresh,
            'payload' => $payload,
        ];
        register_shutdown_function(static function () use ($response) {
            mbb_collections_client_finish(spl_object_id($response));
        });
        $lock = null;
        return $response;
    } catch (Throwable $e) {
        return mbb_collections_error($e);
    } finally {
        if (is_resource($lock)) {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
function mbb_collections_client_finish(int $id): void
{
    $grant = $GLOBALS['mbb_collection_client_downloads'][$id] ?? null;
    if (!$grant) {
        return;
    }
    unset($GLOBALS['mbb_collection_client_downloads'][$id]);
    try {
        mbb_collections_remove($grant['dir']);
        mbb_collections_job_update($grant['token'], null, $grant['job']);
    } catch (Throwable $ignored) {
        /* A failed cleanup retains its bounded slot for lazy expiry. */
    } finally {
        flock($grant['lock'], LOCK_UN);
        fclose($grant['lock']);
    }
}
function mbb_collections_client_serve($served, $response, $request, $server)
{
    if (
        $served ||
        !str_starts_with($request->get_route(), '/mbb/v1/collections/jobs/') ||
        !($response instanceof WP_REST_Response) ||
        ($response->get_headers()['X-MBB-Collection-Client'] ?? '') !== '1'
    ) {
        return $served;
    }
    $id = spl_object_id($response);
    $grant = $GLOBALS['mbb_collection_client_downloads'][$id] ?? null;
    if (!$grant) {
        return $served;
    }
    try {
        mbb_collections_owner($grant['job']['owner']);
        [, $jobs] = mbb_collections_jobs();
        if (
            ($jobs[$grant['token']] ?? null) !== $grant['job'] ||
            $grant['job']['expires'] < time() ||
            $grant['job']['session'] !== mbb_collections_session()
        ) {
            mbb_collections_fail('collection_changed');
        }
        mbb_collections_catalog_item(
            $grant['job']['owner'],
            $grant['record']['collection_id'],
            $grant['record']['revision'],
        );
        mbb_collections_final(
            $grant['fresh'],
            $grant['record']['config'],
            $grant['record']['adapter'],
        );
        $client = mbb_collections_client_metadata($grant['record']['adapter']);
        if (
            !$client ||
            $client['fingerprint'] !== $grant['payload']['provider_fingerprint'] ||
            $grant['job']['expires'] < time()
        ) {
            mbb_collections_fail('collection_changed');
        }
        // Consume at the real JSON handoff, never at the callback. This authorization
        // binds a declared projection digest; it is not server validation of HTML.
        if (!mbb_collections_job_update($grant['token'], null, $grant['job'])) {
            mbb_collections_fail('collection_changed');
        }
        // The consume CAS can itself run database hooks. Recheck after that last
        // mutation, before the first JSON byte. A denied grant may stay consumed.
        mbb_collections_owner($grant['job']['owner']);
        if (
            $grant['job']['expires'] < time() ||
            $grant['job']['session'] !== mbb_collections_session()
        ) {
            mbb_collections_fail('collection_changed');
        }
        $terminal = mbb_collections_client_metadata($grant['record']['adapter']);
        mbb_collections_catalog_item(
            $grant['job']['owner'],
            $grant['record']['collection_id'],
            $grant['record']['revision'],
        );
        mbb_collections_final(
            $grant['fresh'],
            $grant['record']['config'],
            $grant['record']['adapter'],
        );
        mbb_collections_owner($grant['job']['owner']);
        if (
            !$terminal ||
            $terminal['fingerprint'] !== $grant['payload']['provider_fingerprint'] ||
            $grant['job']['expires'] < time() ||
            $grant['job']['session'] !== mbb_collections_session()
        ) {
            mbb_collections_fail('collection_changed');
        }
        echo mbb_collections_json($grant['payload']);
    } catch (Throwable $e) {
        $failure = rest_convert_error_to_response(mbb_collections_error($e));
        $headers = $response->get_headers();
        unset($headers['X-MBB-Collection-Client']);
        $response->set_status($failure->get_status());
        $response->set_data($failure->get_data());
        $response->set_headers($headers);
        if (!headers_sent()) {
            header_remove('X-MBB-Collection-Client');
            status_header($failure->get_status());
            header('Content-Type: application/json; charset=UTF-8');
        }
        echo mbb_collections_json($failure->get_data());
    } finally {
        mbb_collections_client_finish($id);
    }
    return true;
}
add_filter('rest_pre_serve_request', 'mbb_collections_client_serve', 10, 4);
