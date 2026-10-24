const assert = require('node:assert/strict'),
  crypto = require('node:crypto'),
  { execFileSync } = require('node:child_process'),
  path = require('node:path');
const R = require('../plugin/component-resources.js');
const fs = require('node:fs');
const fixtureRoot = path.join(__dirname, 'fixtures/resource-v2-provider');
const fixtureRaw = fs.readFileSync(path.join(fixtureRoot, 'assets/0.1.0/manifest.json'));
const fixturePlan = R.manifest(R.strictJSON(fixtureRaw.toString('utf8')));
for (const spec of fixturePlan.resources) {
  const bytes = fs.readFileSync(path.join(fixtureRoot, spec.path));
  assert.equal(bytes.length, spec.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), spec.sha256);
}
const fixturePHP = fs.readFileSync(path.join(fixtureRoot, 'resource-v2-provider.php'), 'utf8');
for (const bytes of [fixtureRaw, fs.readFileSync(path.join(fixtureRoot, 'frame.html'))])
  assert(
    fixturePHP.includes(crypto.createHash('sha256').update(bytes).digest('hex')),
    'Fixture fixed pin stale',
  );
const item = (id = 'data', extra = {}) => ({
  id,
  path: 'assets/0.1.0/' + id + '.json',
  type: 'json',
  bytes: 10,
  sha256: 'a'.repeat(64),
  deps: [],
  license: 'CC0-1.0',
  version: '0.1.0',
  ...extra,
});
const manifest = (resources = [item()]) => ({
  schema: 'mbb-resources/v2',
  version: '0.1.0',
  resources,
});
const valid = [
  manifest(),
  manifest([
    item('data'),
    item('program', {
      path: 'assets/0.1.0/program.js',
      type: 'javascript',
      deps: ['data'],
      license: 'GPL-3.0-or-later',
    }),
  ]),
  manifest([item('one', { bytes: 1048576 }), item('two', { bytes: 1048576 })]),
  manifest(Array.from({ length: 8 }, (_, i) => item('a' + i))),
];
const invalid = [
  manifest([]),
  manifest(Array.from({ length: 9 }, (_, i) => item('a' + i))),
  manifest([item('data', { bytes: 1048577 })]),
  manifest([item('a', { bytes: 1048576 }), item('b', { bytes: 1048576 }), item('c')]),
  manifest([item(), item()]),
  manifest([item('data', { deps: ['missing'] })]),
  manifest([item('a', { deps: ['b'] }), item('b', { deps: ['a'] })]),
  manifest([item('a', { path: 'assets/0.1.0/../x.json' })]),
  manifest([item('a', { path: 'assets/0.1.0/%61.json' })]),
  manifest([item('a', { path: 'https://example.invalid/a.json' })]),
  manifest([item('a', { path: 'assets/0.1.0/a.wasm', type: 'wasm' })]),
  manifest([item('a', { path: 'assets/0.1.0/a.js', type: 'worker' })]),
  manifest([item('a', { version: '0.2.0' })]),
  manifest([item('a', { deps: ['a', 'a'] })]),
  manifest([item('a', { license: 'unknown' })]),
  manifest([item('a', { extra: 1 })]),
  { ...manifest(), extra: 1 },
  manifest([item('a', { bytes: 0 })]),
  manifest([item('a', { bytes: '10' })]),
];
for (const raw of [
  ...valid.map((x) => JSON.stringify(x)),
  ...invalid.map((x) => JSON.stringify(x)),
  '{"schema":"mbb-resources/v2","version":"0.1.0","version":"0.2.0","resources":[]}',
  '{"schema":"mbb-resources/v2","version":"0.1.0","resources":[],"x":"\\ud800"}',
  JSON.stringify(manifest()).replace('"bytes":10', '"bytes":1e999'),
  '{"a":1,"\\u0061":2}',
  JSON.stringify(manifest()) + 'x',
  '\ufeff' + JSON.stringify(manifest()),
  ' '.repeat(16385),
]) {
  let plan,
    ok = true;
  try {
    if (Buffer.byteLength(raw) > R.LIMITS.manifest) throw Error('limit');
    plan = R.manifest(R.strictJSON(raw));
  } catch {
    ok = false;
  }
  for (const php of [process.env.MARKBRIDGE_TEST_PHP || 'php']) {
    const actual = JSON.parse(
      execFileSync(php, [path.join(__dirname, 'component-resources-php.php')], {
        input: raw,
        encoding: 'utf8',
      }),
    );
    assert.equal(actual.ok, ok, raw);
    if (ok) assert.deepEqual(actual.plan, JSON.parse(JSON.stringify(plan)));
  }
}
(async () => {
  global.location = { href: 'http://component.invalid/', origin: 'http://component.invalid' };
  const body = Buffer.from('{"n":123}'),
    spec = item('data', {
      bytes: body.length,
      sha256: crypto.createHash('sha256').update(body).digest('hex'),
    }),
    raw = Buffer.from(JSON.stringify(manifest([spec]))),
    sha = crypto.createHash('sha256').update(raw).digest('hex'),
    registration = {
      url: 'http://component.invalid/assets/0.1.0/manifest.json',
      baseUrl: 'http://component.invalid/',
      version: '0.1.0',
      sha256: sha,
      groupSha256: crypto
        .createHash('sha256')
        .update('mbb-resources/v2\n0.1.0\n' + sha)
        .digest('hex'),
    };
  let bodies = 0,
    manifests = 0;
  const fetcher = async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    if (url === registration.url) {
      manifests++;
      return new Response(raw);
    }
    bodies++;
    return new Response(body);
  };
  for (const response of [new Response('denied', { status: 403 }), new Response(null)]) {
    let requestSignal;
    await assert.rejects(
      R.readBounded(registration.url, 16384, new R.Context(), async (url, options) => {
        requestSignal = options.signal;
        return response;
      }),
    );
    assert.equal(requestSignal.aborted, true, 'Rejected response left its network request active');
  }
  const cache = new R.PublicCache();
  const one = await R.load(registration, { cache, fetcher });
  assert.equal(one.diagnostics.downloaded, 1);
  const transfer = one.resources[0].buffer;
  structuredClone(transfer, { transfer: [transfer] });
  assert.equal(transfer.byteLength, 0);
  const two = await R.load(registration, { cache, fetcher });
  assert.equal(two.diagnostics.hits, 1);
  assert.equal(bodies, 1);
  assert.equal(manifests, 2);
  assert.deepEqual(Buffer.from(two.resources[0].buffer), body);
  const before = cache.stats();
  await assert.rejects(R.load({ ...registration, sha256: 'f'.repeat(64) }, { cache, fetcher }));
  assert.deepEqual(cache.stats(), before);
  const canceled = new AbortController();
  canceled.abort();
  await assert.rejects(
    R.load(registration, { cache, fetcher, context: new R.Context({ signal: canceled.signal }) }),
  );
  let now = 0;
  const delayed = {
    subtle: {
      digest: async (...args) => {
        const digest = await crypto.webcrypto.subtle.digest(...args);
        now = 1001;
        return digest;
      },
    },
  };
  const cold = new R.PublicCache();
  await assert.rejects(
    R.load(registration, {
      cache: cold,
      fetcher,
      context: new R.Context({ now: () => now }),
      cryptoProvider: delayed,
    }),
  );
  assert.equal(cold.stats().bytes, 0);
  // A canceled generation may finish an uncancelable SHA; a concurrent fresh generation remains independent.
  let release,
    adopted = true;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const oldCache = new R.PublicCache();
  const old = R.load(registration, {
    cache: oldCache,
    fetcher,
    context: new R.Context({ current: () => adopted }),
    cryptoProvider: {
      subtle: {
        digest: async (...args) => {
          await waiting;
          return crypto.webcrypto.subtle.digest(...args);
        },
      },
    },
  });
  const rejection = assert.rejects(old, (error) => error.code === 'CANCELED');
  const fresh = await R.load(registration, { cache: new R.PublicCache(), fetcher });
  adopted = false;
  release();
  await rejection;
  assert.equal(oldCache.stats().bytes, 0);
  assert.deepEqual(Buffer.from(fresh.resources[0].buffer), body);
  // Download and total phases are independently bounded, including mixed phases.
  const phase = new R.Context({ now: () => now });
  now += 2501;
  assert.throws(() => phase.check('download', 2501));
  now = 0;
  const total = new R.Context({ now: () => now });
  now = 5001;
  assert.throws(() => total.check());

  const lru = new R.PublicCache();
  for (let i = 0; i < 5; i++)
    lru.commit('0.1.0', [
      { spec: item('a' + i, { sha256: String(i).repeat(64) }), buffer: new ArrayBuffer(1048576) },
    ]);
  assert.equal(lru.stats().bytes, 4194304);
  assert.equal(lru.get('0.1.0', item('a', { sha256: '0'.repeat(64) })), null);
  await assert.rejects(
    R.load(registration, {
      cache: new R.PublicCache(),
      fetcher: async (url, o) =>
        url === registration.url ? new Response(raw) : new Response(Buffer.alloc(body.length + 1)),
    }),
  );
  // One HTTP bundle, with declaration order distinct from dependency order.
  const rawBundle = (m, payloads) => {
    const bytes = Buffer.from(JSON.stringify(m)),
      header = Buffer.alloc(12);
    header.set([77, 66, 66, 82, 50, 0, 13, 10]);
    header.writeUInt32BE(bytes.length, 8);
    return Buffer.concat([header, bytes, ...payloads]);
  };
  const program = Buffer.from('fixed()'),
    programSpec = item('program', {
      path: 'assets/0.1.0/program.js',
      type: 'javascript',
      deps: ['data'],
      bytes: program.length,
      sha256: crypto.createHash('sha256').update(program).digest('hex'),
    });
  const bundleManifest = manifest([programSpec, spec]),
    bundleRaw = Buffer.from(JSON.stringify(bundleManifest)),
    bundleSha = crypto.createHash('sha256').update(bundleRaw).digest('hex'),
    bundleRegistration = {
      ...registration,
      sha256: bundleSha,
      groupSha256: crypto
        .createHash('sha256')
        .update('mbb-resources/v2\n0.1.0\n' + bundleSha)
        .digest('hex'),
      bundleUrl:
        'http://component.invalid/?rest_route=/mbb/v2/component-resources/fixture/0.1.0/' +
        bundleSha,
    },
    bundleBytes = rawBundle(bundleManifest, [program, body]),
    bundleCache = new R.PublicCache();
  let bundleRequests = 0,
    hashes = 0;
  const bundleOptions = {
    cache: bundleCache,
    fetcher: async (url, options) => {
      assert.equal(url, bundleRegistration.bundleUrl);
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      bundleRequests++;
      return new Response(bundleBytes);
    },
    cryptoProvider: {
      subtle: {
        digest: (...args) => {
          hashes++;
          return crypto.webcrypto.subtle.digest(...args);
        },
      },
    },
  };
  const bundled = await R.load(bundleRegistration, bundleOptions);
  assert.deepEqual(
    bundled.resources.map((r) => r.spec.id),
    ['data', 'program'],
  );
  assert.equal(bundleRequests, 1);
  assert.equal(bundleCache.stats().bytes, bundleRaw.length + body.length + program.length);
  const warmed = await R.load(bundleRegistration, bundleOptions);
  assert.equal(bundleRequests, 1, 'Warm group fetched again');
  assert.equal(warmed.diagnostics.hits, 2);
  assert(hashes >= 8, 'Warm manifest/resources were not rehashed');
  structuredClone(bundled.resources[0].buffer, { transfer: [bundled.resources[0].buffer] });
  assert.deepEqual(Buffer.from(warmed.resources[0].buffer), body);
  // Never trust even a cache hit without a fresh hash, and never commit partial groups.
  const corruptCache = new R.PublicCache();
  corruptCache.commit('0.1.0', [
    {
      spec: { type: 'manifest', sha256: bundleSha },
      buffer: bundleRaw.buffer.slice(
        bundleRaw.byteOffset,
        bundleRaw.byteOffset + bundleRaw.byteLength,
      ),
    },
    { spec, buffer: new ArrayBuffer(body.length) },
    {
      spec: programSpec,
      buffer: program.buffer.slice(program.byteOffset, program.byteOffset + program.byteLength),
    },
  ]);
  await assert.rejects(
    R.load(bundleRegistration, { ...bundleOptions, cache: corruptCache }),
    (e) => e.code === 'RESOURCE_SHA',
  );
  for (const bad of [
    Buffer.from('bad'),
    bundleBytes.subarray(0, -1),
    Buffer.concat([bundleBytes, Buffer.from('extra')]),
    Buffer.from(bundleBytes).fill(0, 12, 13),
    Buffer.concat([bundleBytes.subarray(0, -1), Buffer.from('!')]),
    Buffer.from(bundleBytes).fill(255, 8, 12),
    Buffer.alloc(12 + R.LIMITS.manifest + R.LIMITS.total + 1),
  ]) {
    const rejected = new R.PublicCache();
    await assert.rejects(
      R.load(bundleRegistration, {
        cache: rejected,
        fetcher: async () => new Response(bad),
      }),
    );
    assert.deepEqual(rejected.stats(), { entries: 0, bytes: 0 });
  }
  await assert.rejects(
    R.load({ ...bundleRegistration, groupSha256: 'f'.repeat(64) }, bundleOptions),
  );
  for (const bundleUrl of [
    'https://evil.invalid/bundle',
    'http://user@component.invalid/bundle',
    'http://component.invalid/bundle?article=1',
    'http://component.invalid/bundle#fragment',
  ])
    await assert.rejects(R.load({ ...bundleRegistration, bundleUrl }, bundleOptions));
  for (const property of ['url', 'redirected']) {
    const response = new Response(bundleBytes);
    Object.defineProperty(response, property, {
      value: property === 'url' ? 'http://component.invalid/redirected' : true,
    });
    await assert.rejects(R.load(bundleRegistration, { fetcher: async () => response }));
  }
  let clock = 0;
  for (const elapsed of [2501, 5001]) {
    clock = 0;
    const rejected = new R.PublicCache();
    await assert.rejects(
      R.load(bundleRegistration, {
        cache: rejected,
        context: new R.Context({ now: () => clock }),
        fetcher: async () => {
          clock = elapsed;
          return new Response(bundleBytes);
        },
      }),
    );
    assert.equal(rejected.stats().bytes, 0);
  }
  let live = true,
    releaseBundle;
  const waitBundle = new Promise((resolve) => {
    releaseBundle = resolve;
  });
  const canceledBundleCache = new R.PublicCache();
  const pendingBundle = R.load(bundleRegistration, {
    cache: canceledBundleCache,
    context: new R.Context({ current: () => live }),
    fetcher: async () => {
      await waitBundle;
      return new Response(bundleBytes);
    },
  });
  const canceledBundle = assert.rejects(pendingBundle, (e) => e.code === 'CANCELED');
  live = false;
  releaseBundle();
  await canceledBundle;
  assert.equal(canceledBundleCache.stats().bytes, 0);
  console.log(
    'Resource v2 PHP+JS closed/strict manifest, pins, omit/no-redirect, bounded stream, atomic cache/LRU, transfer copy, cancellation and late hash passed.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
