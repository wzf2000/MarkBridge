const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const php = (request) =>
  JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_TEST_PHP || 'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(request), encoding: 'utf8' },
    ),
  );
const make = (tab = {}, version = 2) =>
  ':::mbb:v' +
  version +
  ' code-tabs ' +
  JSON.stringify({
    id: 'range-group',
    defaultTab: 'range-tab',
    tabs: [
      {
        id: 'range-tab',
        title: 'example.py',
        terminalNewline: false,
        startLine: 12,
        highlights: '12-13,15',
        ...tab,
      },
    ],
  }) +
  '\n\n```python\na\r\nb\nc\nd\n```\n\n:::mbb:end\n';
try {
  const source = make();
  const doc = w.MBB.importDocument(source, 'v2-ranges');
  const backend = php({ mode: 'markdown', source, documentId: doc.documentId });
  assert(backend.ok, JSON.stringify(backend));
  assert.equal(backend.document.serialized, doc.serialized);
  assert(doc.serialized.includes('Starting line: 12; highlights: 12-13,15'));
  const blocks = w.wp.blocks.parse(doc.serialized);
  assert(blocks.every((b) => b.isValid));
  assert.equal(w.wp.blocks.serialize(blocks), doc.serialized);
  assert.equal(w.MBB.exportDocument(doc, doc.serialized), source);
  assert(
    php({ mode: 'paired_restore', source, serialized: doc.serialized, documentId: doc.documentId })
      .ok,
  );
  for (const spelling of ['12.0', '1.2e1']) {
    const numericSource = source.replace('"startLine":12', '"startLine":' + spelling);
    const numericDoc = w.MBB.importDocument(numericSource, 'v2-numeric');
    const numericPHP = php({
      mode: 'markdown',
      source: numericSource,
      documentId: numericDoc.documentId,
    });
    assert(numericPHP.ok, JSON.stringify(numericPHP));
    assert.equal(numericPHP.document.serialized, numericDoc.serialized);
    assert.equal(w.MBB.exportDocument(numericDoc, numericDoc.serialized), numericSource);
  }
  for (const tab of [
    { startLine: 0 },
    { startLine: 1.1 },
    { startLine: 999999 },
    { highlights: '11' },
    { highlights: '16' },
    { highlights: '13-12' },
    { highlights: '12,12-13' },
    { highlights: '15,12' },
    { highlights: '12-' },
    { highlights: '12-999999' },
    { unknown: true },
  ]) {
    const invalid = make(tab);
    assert.throws(() => w.MBB.importDocument(invalid, 'v2-invalid'), JSON.stringify(tab));
    assert.equal(
      php({ mode: 'markdown', source: invalid, documentId: 'v2-invalid' }).ok,
      false,
      JSON.stringify(tab),
    );
  }
  assert.throws(() => w.MBB.importDocument(make({}, 1), 'v1-reject-v2'));
  assert.equal(
    php({ mode: 'markdown', source: make({}, 1), documentId: 'v1-reject-v2' }).ok,
    false,
  );
  console.log(
    'Code tabs v2 exact ranges, bounds, native serialization and PHP/Node paired restore passed.',
  );
} finally {
  close();
}
