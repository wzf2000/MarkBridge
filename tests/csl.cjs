const assert = require('node:assert/strict'),
  vm = require('node:vm'),
  { execFileSync } = require('node:child_process');
const code = require('esbuild').buildSync({
  entryPoints: ['src/bibliography.js'],
  bundle: true,
  write: false,
  format: 'cjs',
}).outputFiles[0].text;
const context = { module: { exports: {} }, TextEncoder, URL };
vm.runInNewContext(code, context);
const api = context.module.exports,
  plain = (v) => JSON.parse(JSON.stringify(v));
const php = JSON.parse(execFileSync('php', ['tests/csl.php', '--json'], { encoding: 'utf8' }));
for (const c of require('./fixtures/csl.json').cases) {
  let result;
  try {
    const report = api.parseCSL(c.input, c.keyMap ?? {});
    result = plain({
      report,
      projection: report.entries.map(api.bibliographyProjection),
      export: api.exportCSL(report.entries),
    });
  } catch (e) {
    result = { error: e.code || 'ERROR' };
  }
  assert.equal(!!result.error, !!c.reject, c.name);
  assert.deepEqual(result, php[c.name], 'PHP/Node parity: ' + c.name);
  if (!result.error)
    assert.deepEqual(
      plain(api.parseCSL(JSON.stringify(result.export)).entries),
      result.report.entries,
      'Supported subset roundtrip: ' + c.name,
    );
}
const a = api.parseCSL('[{"id":"A","type":"book","title":"A"}]'),
  b = api.parseCSL('[{"id":"B","type":"book","title":"B","abstract":"Not retained"}]'),
  mapped = api.parseCSL('[{"id":42,"type":"book","title":"C"}]');
assert.throws(() => api.cslCandidate(a.entries, b, 'merge', []));
assert.throws(() => api.cslCandidate(a.entries, mapped, 'merge', [], true, false));
assert.throws(() => api.cslCandidate(a.entries, a, 'merge', [], true, true));
assert.throws(() => api.cslCandidate(a.entries, b, 'replace', ['A'], true, true));
assert.equal(api.cslCandidate(a.entries, b, 'merge', [], true, true).length, 2);
const before = JSON.stringify([a, b, mapped]);
api.cslCandidate(a.entries, b, 'merge', [], true, true);
assert.equal(JSON.stringify([a, b, mapped]), before);
for (const input of [
  ' '.repeat(65537),
  '['.repeat(17) + '0' + ']'.repeat(17),
  JSON.stringify(Array.from({ length: 65 }, (_, i) => ({ id: 'A' + i, type: 'book', title: 'T' }))),
])
  assert.throws(() => api.parseCSL(input));
assert.equal(
  api.parseCSL(
    JSON.stringify(
      Array.from({ length: 64 }, (_, i) => ({ id: 'A' + i, type: 'book', title: 'T' })),
    ),
  ).entries.length,
  64,
);
const old = [
    {
      key: 'Old',
      authors: ['Ludwig van Beethoven', '研究机构'],
      title: 'T',
      year: 'Spring 2026',
      source: 'Legacy literal source',
      url: '',
    },
  ],
  copy = JSON.stringify(old),
  migrated = plain(api.migrateBibliography(old));
assert.deepEqual(migrated[0].authors, [
  { literal: 'Ludwig van Beethoven' },
  { literal: '研究机构' },
]);
assert.equal(migrated[0].source, old[0].source);
assert.deepEqual(migrated[0].issued, { literal: 'Spring 2026' });
assert.equal(JSON.stringify(old), copy);
const unsafeOld = [{ ...old[0], url: 'https://127.1/' }],
  unsafeBefore = JSON.stringify(unsafeOld),
  unsafeCandidate = api.migrateBibliography(unsafeOld);
assert.equal(unsafeCandidate[0].url, unsafeOld[0].url);
assert.throws(() => api.bibliographyEntry(unsafeCandidate[0]));
assert.equal(JSON.stringify(unsafeOld), unsafeBefore);
console.log('Closed bibliography v2 and bounded CSL-JSON dual-backend models passed.');
