const assert = require('node:assert/strict'),
  crypto = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const plain = (v) => JSON.parse(JSON.stringify(v));
const php = (request) =>
  JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        'require "plugin/includes/php-converter/Worker.php";echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
      ],
      { input: JSON.stringify(request), encoding: 'utf8' },
    ),
  );
try {
  const fixture = require('./fixtures/bibliography-origins.json');
  const entry = fixture.entry;
  const canonical = w.MBB.bibliographyEntryCanonical(entry),
    hash = crypto.createHash('sha256').update(canonical).digest('hex');
  assert.equal(canonical, fixture.canonical);
  assert.equal(hash, fixture.hash);
  const phpHash = JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        'require "plugin/includes/php-converter/Worker.php";$e=json_decode(stream_get_contents(STDIN));echo json_encode([\\MarkBridge\\Probe\\Bibliography::canonical($e),\\MarkBridge\\Probe\\Bibliography::hash($e)]);',
      ],
      { input: JSON.stringify(entry), encoding: 'utf8' },
    ),
  );
  assert.deepEqual(phpHash, [canonical, hash]);
  assert.equal(w.MBB.bibliographyEntryCanonical({ ...entry, key: 'Other' }), canonical);
  assert.equal(
    w.MBB.bibliographyEntryCanonical(Object.fromEntries(Object.entries(entry).reverse())),
    canonical,
  );
  const origin = {
    key: entry.key,
    namespace: 'L_' + 'a'.repeat(32),
    item: 'I_' + 'b'.repeat(32),
    version: 1,
    hash,
  };
  const sourceFor = (attrs) =>
    ':::mbb:v2 bibliography ' +
    JSON.stringify({ id: 'refs', style: 'author-year', entries: [entry], ...attrs }) +
    '\n\n:::mbb:end\n';
  for (const origins of [undefined, [], [origin], [{ ...origin, hash: 'c'.repeat(64) }]]) {
    const source = sourceFor(origins === undefined ? {} : { origins }),
      js = w.MBB.importDocument(source, 'ORIGINS_TEST'),
      result = php({ mode: 'markdown', source, documentId: 'ORIGINS_TEST' });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.document.serialized, js.serialized);
    const blocks = w.wp.blocks.parse(js.serialized),
      bib = blocks[0];
    assert.equal(Object.hasOwn(bib.attributes, 'origins'), origins !== undefined);
    assert.equal(w.MBB.exportDocument(js, js.serialized), source);
    assert.equal(
      w.MBB.importDocument(w.MBB.toMarkdown(blocks, { origin: 'markdown_import' }), 'ORIGINS_TEST')
        .serialized,
      js.serialized,
    );
    assert.equal(
      php({ mode: 'paired_restore', source, serialized: js.serialized, documentId: 'ORIGINS_TEST' })
        .ok,
      true,
    );
    if (origins?.length) {
      const plan = w.MBB.technicalRenamePlan(blocks, 'key', entry.key, 'Renamed', (c, m) => {
        throw Error(m);
      });
      assert.equal(plan.patches[0].attributes.origins[0].key, 'Renamed');
      assert.equal(
        plan.patches[0].attributes.origins[0].hash,
        origin.hash === origins[0].hash ? hash : origins[0].hash,
      );
    }
  }
  const bad = [
    null,
    {},
    [origin, origin],
    [{ ...origin, key: 'Missing' }],
    [{ ...origin, owner: 1 }],
    [{ ...origin, namespace: 'owner-1' }],
    [{ ...origin, version: 0 }],
    [{ ...origin, version: 1.5 }],
    [{ ...origin, item: ['I_' + 'b'.repeat(32)] }],
    [{ ...origin, hash: 'A'.repeat(64) }],
  ];
  for (const origins of bad) {
    const source = sourceFor({ origins });
    assert.throws(() => w.MBB.importDocument(source, 'ORIGINS_BAD'));
    assert.equal(php({ mode: 'markdown', source, documentId: 'ORIGINS_BAD' }).ok, false);
  }
  console.log(
    'Origins: cross-backend hash, UTF-8 canonical JSON, absent/explicit source preservation, mismatch, rename and closed negative cases passed',
  );
} finally {
  close();
}
