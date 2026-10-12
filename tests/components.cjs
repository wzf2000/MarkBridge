const assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process'),
  path = require('node:path');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const source = (params, extra = {}) =>
  ':::mbb:v1 component ' +
  JSON.stringify({
    id: 'demo',
    component: 'insertion-sort',
    componentVersion: '0.1.0',
    params,
    ...extra,
  }) +
  '\n\n## 静态说明\n\n原始数组与插入排序解释。\n\n:::mbb:end\n';
const php = (payload) =>
  JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        'ini_set("serialize_precision","14");require $argv[1];echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(payload), encoding: 'utf8' },
    ),
  );
try {
  for (const params of [
    {},
    { text: '\u2028'.repeat(3000) },
    { text: '\u2029'.repeat(3000) },
    { empty: {}, array: [], nested: { n: null, b: true }, 20: 'twenty', 3: 'three', '01': 'first' },
    { values: [5, 2, 4, 1, 3], order: 'asc' },
    {
      numbers: [
        -0, 1.5, 1e-7, 1e-6, 1e20, 1e21, 1e308, -1e308, 0.00000123, 1000000000000000128,
        -1000000000000000128,
      ],
    },
  ]) {
    const raw = source(params),
      doc = w.MBB.importDocument(raw, 'component-data'),
      p = php({ mode: 'markdown', source: raw, documentId: doc.documentId });
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.equal(p.document.serialized, doc.serialized, 'PHP/Node bytes');
    assert.equal(w.MBB.exportDocument(doc, doc.serialized), raw);
    const blocks = w.wp.blocks.parse(doc.serialized);
    assert.equal(blocks[0].isValid, true);
    assert.deepEqual(
      JSON.parse(JSON.stringify(blocks[0].attributes.params)),
      JSON.parse(JSON.stringify(params)),
    );
    blocks[0].innerBlocks[1].attributes.content = '改过的静态替代';
    const serialized = w.wp.blocks.serialize(blocks),
      updated = w.MBB.exportDocument(doc, serialized);
    const edit = php({ mode: 'blocks', serialized, base: doc, documentId: doc.documentId });
    assert.equal(edit.ok, true, JSON.stringify(edit));
    assert.equal(edit.document.source, updated);
    assert.equal(w.MBB.importDocument(updated, doc.documentId).serialized, serialized);
    assert.equal(
      php({
        mode: 'paired_restore',
        source: raw,
        serialized: doc.serialized,
        documentId: doc.documentId,
      }).ok,
      true,
    );
  }
  const large = source({ n: 1 }).replace('"n":1', '"n":9007199254740993');
  const largeDoc = w.MBB.importDocument(large, 'component-large');
  assert.equal(
    php({ mode: 'markdown', source: large, documentId: 'component-large' }).document.serialized,
    largeDoc.serialized,
  );
  let deep = {};
  for (let i = 0; i < 9; i++) deep = { nested: deep };
  for (const raw of [
    source([]),
    source(null),
    source({ x: 'a'.repeat(16385) }),
    source(deep),
    source({ x: Array(1024).fill(1) }),
    source({ constructor: 'x' }),
    source({}, { url: 'evil' }),
    source({}, { componentVersion: 'latest' }),
    source({}, { component: 'Bad' }),
    source({}).replace('"params":{}', '"params":{"a":{"x":1,"x":2}}'),
    source({}).replace('"params":{}', '"params":{"n":1e999}'),
    source({}).replace('"params":{}', '"params":{"s":"\\ud800"}'),
  ]) {
    assert.throws(() => w.MBB.importDocument(raw, 'invalid'));
    assert.equal(
      php({ mode: 'markdown', source: raw, documentId: 'invalid' }).ok,
      false,
      raw.slice(0, 180),
    );
  }
  console.log(
    'Component opaque conversion, nested JSON types/numeric spelling, editing and strict budgets passed.',
  );
} finally {
  close();
}
