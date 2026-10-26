const assert = require('node:assert/strict'),
  cp = require('node:child_process'),
  path = require('node:path');
const base = require('./fixtures/knowledge-map.json').find((c) => c.id === 'defaults').params;
const runtime = require('./helpers/wp-runtime.cjs')();
try {
  const source =
    ':::mbb:v1 component ' +
    JSON.stringify({
      id: 'controlled-map',
      component: 'knowledge-map',
      componentVersion: '0.1.0',
      params: base,
    }) +
    '\n\n独立合成说明。\n\n:::mbb:end\n';
  const doc = runtime.window.MBB.importDocument(source, 'KNOWLEDGE_ROUNDTRIP');
  assert(!doc.serialized.includes('mbb-component-params'));
  const html = doc.serialized.replace(/<!--[\s\S]*?-->/g, '');
  assert(
    !html.includes('namespace') &&
      !html.includes(base.nodes[0].title) &&
      !html.includes('knowledge-map/v1'),
  );
  const convert = (p) =>
    JSON.parse(
      cp.execFileSync(
        process.env.MARKBRIDGE_TEST_PHP || 'php',
        [
          '-r',
          'require $argv[1];echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
          path.join(__dirname, '../plugin/includes/php-converter/Worker.php'),
        ],
        { input: JSON.stringify(p), encoding: 'utf8' },
      ),
    );
  const imported = convert({ mode: 'markdown', source, documentId: doc.documentId });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  assert.equal(imported.document.serialized, doc.serialized);
  assert.equal(runtime.window.MBB.exportDocument(doc, doc.serialized), source);
  const exported = convert({
    mode: 'blocks',
    serialized: doc.serialized,
    base: doc,
    documentId: doc.documentId,
  });
  assert.equal(exported.ok, true, JSON.stringify(exported));
  assert.equal(exported.document.source, source);
  console.log('Knowledge-map raw-free native shell and real JS/PHP Markdown↔blocks bytes passed.');
} finally {
  runtime.close();
}
