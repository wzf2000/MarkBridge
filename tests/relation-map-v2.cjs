const assert = require('node:assert/strict'),
  cp = require('node:child_process'),
  path = require('node:path'),
  M = require('../plugin/relation-map-v2.js');
const clone = (v) => JSON.parse(JSON.stringify(v));
const base = {
  format: 'relation-map/v2',
  title: '受控关系图',
  groups: [{ id: 'group', title: '分组' }],
  nodes: [
    {
      id: 'node-a',
      group: 'group',
      title: '文章甲',
      target: {
        kind: 'document',
        namespace: 'S_' + 'a'.repeat(32),
        document: 'D_' + 'b'.repeat(32),
      },
    },
    {
      id: 'node-b',
      group: 'group',
      title: '文章乙',
      target: { kind: 'local-document', site: 'S_' + 'a'.repeat(32), documentId: 'LEGACY_B' },
    },
  ],
  edges: [{ id: 'edge-a', from: 'node-a', to: 'node-b', kind: 'recommended' }],
};
const good = [base];
for (const change of [
  (p) => p.nodes.reverse(),
  (p) => (p.nodes[0].title = '修改题名'),
  (p) => (p.edges[0].kind = 'optimization'),
]) {
  const p = clone(base);
  change(p);
  good.push(p);
  assert.deepEqual(new Set(p.nodes.map((n) => n.id)), new Set(base.nodes.map((n) => n.id)));
  assert.equal(p.edges[0].id, 'edge-a');
}
for (const legacy of ['123', 'namespace:old', '旧文档编号：一', ' legacy exact ']) {
  const p = clone(base);
  p.nodes[1].target.documentId = legacy;
  good.push(p);
}
const bad = [];
for (const change of [
  (p) => delete p.edges[0].id,
  (p) => p.edges.push({ ...p.edges[0], from: 'node-b', to: 'node-a' }),
  (p) =>
    (p.nodes[0].target = {
      kind: 'document',
      namespace: 'S_' + 'a'.repeat(32),
      document: 'LEGACY_B',
    }),
  (p) => delete p.nodes[1].target.site,
  (p) => (p.nodes[0].target.url = 'javascript:bad'),
  (p) => (p.nodes[0].url = '#bad'),
  (p) => (p.nodes[1].target.kind = 'url'),
  (p) => (p.nodes[1].target.documentId = 'bad\nID'),
]) {
  const p = clone(base);
  change(p);
  bad.push(p);
}
const maps = [...good, ...bad],
  expected = maps.map((_, i) => i < good.length);
const valid = (p) => {
  try {
    M.validate(p);
    return true;
  } catch {
    return false;
  }
};
assert.deepEqual(maps.map(valid), expected);
assert.deepEqual(
  JSON.parse(
    cp.execFileSync(
      process.env.MARKBRIDGE_TEST_PHP || 'php',
      [path.join(__dirname, 'relation-map-v2.php')],
      { input: JSON.stringify(maps), encoding: 'utf8' },
    ),
  ),
  expected,
);
const runtime = require('./helpers/wp-runtime.cjs')();
try {
  const source =
    ':::mbb:v1 component ' +
    JSON.stringify({
      id: 'controlled-map',
      component: 'navigation-map',
      componentVersion: '0.2.0',
      params: base,
    }) +
    '\n\n独立合成说明。\n\n:::mbb:end\n';
  const doc = runtime.window.MBB.importDocument(source, 'V2_ROUNDTRIP');
  assert(!doc.serialized.includes('mbb-component-params'));
  const html = doc.serialized.replace(/<!--[\s\S]*?-->/g, '');
  assert(!html.includes('LEGACY_B') && !html.includes('文章甲') && !html.includes('node-a'));
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
  console.log(
    'v2 shared closed targets, stable author IDs, invalid identities, raw-free native HTML shell and real JS/PHP Markdown↔blocks bytes passed.',
  );
} finally {
  runtime.close();
}
