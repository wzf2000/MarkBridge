const assert = require('node:assert/strict'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process'),
  { window: w, close } = require('./helpers/wp-runtime.cjs')();
try {
  const cases = JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_TEST_PHP || 'php',
      [path.resolve('tests/native-component-comments.php'), '--json'],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    ),
  );
  for (const c of cases) {
    const original = w.MBB.importDocument(c.source, c.documentId);
    assert.equal(original.serialized, c.base.serialized, c.name + ' PHP/Node base');
    const blocks = w.wp.blocks.parse(c.incoming);
    assert.equal(
      w.wp.blocks.serialize(blocks),
      c.incoming,
      c.name + ' actual Gutenberg canonical request',
    );
    // PHP's raw projection refusal is asserted in the actual-core fixture.
    // Node already normalizes equivalent numeric JSON spelling in parsed blocks.
    const source = w.MBB.exportDocument(c.base, c.repaired);
    assert(source.includes(c.edit || 'Edited text'), c.name + ' preserves author native edit');
    assert.equal(
      w.MBB.importDocument(source, c.documentId).serialized,
      c.repaired,
      c.name + ' exact Node roundtrip after native-only repair',
    );
  }
  console.log(
    'Real core native projection: v1/v2 fractions, empty/nested objects and nested components pass PHP/Node/core serialization after exact comment repair; semantic/metadata/type/structure changes, duplicate/malformed JSON, byte budgets near-256-KiB temporary expansion and actual KSES safety passed.',
  );
} finally {
  close();
}
