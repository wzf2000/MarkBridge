const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
// Source-only pure data model: no generated kernel or WordPress/runtime writes.
const code = require('esbuild').buildSync({
  entryPoints: ['src/bibtex.js'],
  bundle: true,
  write: false,
  format: 'cjs',
}).outputFiles[0].text;
const context = { module: { exports: {} }, exports: {}, TextEncoder, URL };
vm.runInNewContext(code, context);
const { parseBibTeX, bibtexCandidate } = context.module.exports;
const fixture = require('./fixtures/bibtex.json');
const php = JSON.parse(execFileSync('php', ['tests/bibtex.php', '--json'], { encoding: 'utf8' }));
const json = (x) => JSON.parse(JSON.stringify(x));
for (const c of fixture.cases) {
  let result;
  try {
    result = { entries: json(parseBibTeX(c.input)) };
  } catch (e) {
    result = { error: e.code || 'ERROR' };
  }
  if (c.entries) assert.deepEqual(result.entries, c.entries, c.name);
  else assert(result.error, c.name);
  assert.deepEqual(result, php[c.name], 'Backend parity: ' + c.name);
}
for (const input of [
  ' '.repeat(65537),
  Array.from({ length: 65 }, (_, i) => '@misc{A' + i + ',title={A}}').join(''),
  '@misc{A,title={' + '{'.repeat(17) + 'A' + '}'.repeat(17) + '}}',
  '@misc{A,title={A\ud800}}',
])
  assert.throws(() => parseBibTeX(input));
assert.equal(
  parseBibTeX(Array.from({ length: 64 }, (_, i) => '@misc{A' + i + ',title={A}}').join('')).length,
  64,
);
const a = json(parseBibTeX('@misc{A,title={A}}')),
  b = json(parseBibTeX('@misc{B,title={B}}'));
const before = JSON.stringify([a, b]);
assert.equal(bibtexCandidate(a, b, 'merge', ['A']).length, 2);
assert.deepEqual(json(bibtexCandidate(a, b, 'replace', [])), b);
for (const args of [
  [a, a, 'merge', []],
  [a, b, 'replace', ['A']],
  [a, b, 'unknown', []],
])
  assert.throws(() => bibtexCandidate(...args));
assert.equal(JSON.stringify([a, b]), before, 'Pure candidate does not modify input');
console.log(
  'BibTeX Node/PHP:',
  fixture.cases.length,
  'shared cases, bounded source model and candidate safety passed',
);
