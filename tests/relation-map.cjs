const assert = require('node:assert/strict'),
  path = require('node:path'),
  cp = require('node:child_process'),
  M = require('../plugin/relation-map.js');
const clone = (x) => JSON.parse(JSON.stringify(x));
const base = {
  format: 'relation-map/v1',
  title: '通用关系图',
  groups: [{ id: 'g', title: '主题分支' }],
  nodes: ['a', 'b', 'c'].map((id) => ({
    id,
    group: 'g',
    title: '中文主题' + id,
    url: '#' + id,
    description: '',
  })),
  edges: [
    { from: 'a', to: 'c', kind: 'recommended', why: '建议阅读衔接。' },
    { from: 'b', to: 'c', kind: 'recommended', why: '另一条建议路径。' },
    { from: 'a', to: 'c', kind: 'compare', why: '同一端点仍保留思想对照。' },
  ],
};
const boundary = {
  format: 'relation-map/v1',
  title: '边界关系图',
  groups: Array.from({ length: 8 }, (_, i) => ({ id: 'g' + i, title: '组' + i })),
  nodes: Array.from({ length: 64 }, (_, i) => ({
    id: 'n' + i.toString(36),
    group: 'g' + (i % 8),
    title: '节点' + i,
    url: '#n' + i.toString(36),
    description: '',
  })),
  edges: [],
};
for (let i = 0; i < 64; i++)
  for (const delta of [1, 2])
    boundary.edges.push({
      from: boundary.nodes[i].id,
      to: boundary.nodes[(i + delta) % 64].id,
      kind: 'recommended',
      why: '',
    });
for (const n of boundary.nodes) delete n.description;
for (const e of boundary.edges) delete e.why;
assert(new TextEncoder().encode(JSON.stringify(boundary)).length < 16384);
const cycle = clone(base);
cycle.edges.push({ from: 'c', to: 'a', kind: 'recommended', why: '循环联系仍按配置顺序布局。' });
const bad = [];
const add = (fn) => {
  const p = clone(base);
  fn(p);
  bad.push(p);
};
add((p) => (p.extra = true));
add((p) => (p.nodes[0].x = 1));
add((p) => (p.nodes[0].url = 'javascript:alert(1)'));
add((p) => (p.nodes[0].group = []));
add((p) => (p.nodes[0].id = ''));
add((p) => (p.nodes[0].title = '  '));
add((p) => (p.nodes[1].id = 'a'));
add((p) => (p.edges[0].to = 'missing'));
add((p) => (p.edges[0].from = []));
add((p) => (p.edges[0].to = 'a'));
add((p) => (p.edges[0].kind = 'prerequisite'));
add((p) => p.edges.push(clone(p.edges[0])));
add((p) => p.groups.push({ id: 'empty', title: '空分支' }));
add((p) => (p.format = 'other'));
for (const whitespace of ['\u00a0', '\ufeff', '\u3000']) {
  add((p) => (p.title = whitespace));
  add((p) => (p.groups[0].title = whitespace));
}
const tooManyNodes = clone(boundary);
tooManyNodes.nodes.push({
  id: 'extra',
  group: 'g0',
  title: '额外',
  url: '#extra',
  description: '',
});
bad.push(tooManyNodes);
const tooManyGroups = clone(boundary);
tooManyGroups.groups.push({ id: 'g8', title: '额外' });
bad.push(tooManyGroups);
const tooManyEdges = clone(boundary);
tooManyEdges.edges.push({ from: 'n0', to: 'n3', kind: 'compare', why: '' });
bad.push(tooManyEdges);
const tooManyBytes = clone(boundary);
tooManyBytes.nodes.forEach((n) => (n.description = '中'.repeat(240)));
bad.push(tooManyBytes);
const urls = [
  '#start',
  '/a',
  '../主题',
  'article?x=1',
  '?x=1',
  'https://example.test/path',
  'https://[::1]/a',
  'http://127.0.0.1/',
  '/' + '中'.repeat(341),
  '/' + '中'.repeat(342),
  '',
  '//example.test',
  'javascript:alert(1)',
  'data:text/html,a',
  '/\\bad',
  '/a\nb',
  '/a%0Ab',
  'https://[bad',
  'https://[bad]',
  'https://example.test:65536/a',
  'https://u:p@example.test/',
  'http://127.1/',
  'http://999.999/',
  'https://例子.test/',
];
// Dense repeated endpoints must fit the complete static fallback, not just input JSON.
const dense = clone(base);
dense.nodes = Array.from({ length: 8 }, (_, i) => ({
  id: 'n' + i,
  group: 'g',
  title: '中'.repeat(159) + i,
  url: '#n' + i,
}));
dense.edges = [];
for (const a of dense.nodes)
  for (const b of dense.nodes)
    if (a !== b)
      for (const kind of ['recommended', 'compare', 'optimization'])
        if (dense.edges.length < 128) dense.edges.push({ from: a.id, to: b.id, kind });
const longURL = clone(dense);
longURL.nodes.forEach((n) => {
  n.title = '节点';
  n.url = '#' + '&'.repeat(180);
});
const escapedTitles = clone(dense);
escapedTitles.nodes.forEach((n) => {
  n.title = '&<>"\''.repeat(32);
});
for (const p of [dense, longURL, escapedTitles]) {
  assert(Buffer.byteLength(JSON.stringify(p)) < 16384);
  assert.throws(() => M.validate(p), /static output budget/);
  bad.push(p);
}
const acceptedDense = clone(dense);
while (M.staticBytes(acceptedDense) > 122880) acceptedDense.edges.pop();
assert(acceptedDense.edges.length > 0 && acceptedDense.edges.length < 128);
M.validate(acceptedDense);
const maps = [base, boundary, cycle, acceptedDense, ...bad];
const expected = [true, true, true, true, ...bad.map(() => false)];
assert.deepEqual(
  maps.map((p) => {
    try {
      M.validate(p);
      return true;
    } catch {
      return false;
    }
  }),
  expected,
);
const wire = JSON.stringify({
  maps,
  urls,
  budgets: [dense, longURL, escapedTitles, acceptedDense, boundary],
  render: [acceptedDense, boundary],
});
const php = JSON.parse(
  cp.execFileSync(
    process.env.MARKBRIDGE_TEST_PHP || 'php',
    [path.join(__dirname, 'relation-map.php')],
    { input: wire, encoding: 'utf8' },
  ),
);
assert.deepEqual(php.maps, expected);
assert.deepEqual(
  php.estimates,
  [dense, longURL, escapedTitles, acceptedDense, boundary].map(M.staticBytes),
);
for (const rendered of php.rendered) {
  assert(rendered.bytes < 131072);
  assert(rendered.bytes <= rendered.estimate);
  assert.equal(rendered.links, rendered.expectedLinks);
}
console.log(
  'Dense Chinese titles / long escaped URLs / HTML text: JS/PHP reject oversized fallback; accepted boundary retains all links in both locales.',
  php.rendered,
);
assert.deepEqual(php.urls, urls.map(M.safeURL));
assert(M.safeURL('/' + '中'.repeat(341)));
assert(!M.safeURL('/' + '中'.repeat(342)));
assert(!M.safeURL('https://[bad'));
console.log(
  'relation-map: JS/PHP closed model, 64 nodes/8 groups/128 edges within 16 KiB, same-kind multiple parents/multiple relations/cycles and UTF-8 URL boundaries passed.',
);

assert.throws(
  () =>
    M.validate({ ...base, nodes: base.nodes.map((n, i) => (i ? n : { ...n, group: 'deleted' })) }),
  /existing group/,
);
assert.throws(
  () => M.validate({ ...base, edges: [{ from: 'a', to: 'deleted', kind: 'recommended' }] }),
  /existing, different endpoints/,
);

// Exercise the maximum-count example through the existing real core runtime and PHP converter.
// Empty optional descriptions are omitted so the unchanged 1024-value budget also applies.
const runtime = require('./helpers/wp-runtime.cjs')();
try {
  const source =
    ':::mbb:v1 component ' +
    JSON.stringify({
      id: 'map-boundary',
      component: 'navigation-map',
      componentVersion: '0.1.0',
      params: boundary,
    }) +
    '\n\n合成边界说明。\n\n:::mbb:end\n';
  const doc = runtime.window.MBB.importDocument(source, 'MAP_BOUNDARY');
  const convert = (payload) =>
    JSON.parse(
      cp.execFileSync(
        process.env.MARKBRIDGE_TEST_PHP || 'php',
        [
          '-r',
          'require $argv[1];echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
          path.join(__dirname, '../plugin/includes/php-converter/Worker.php'),
        ],
        { input: JSON.stringify(payload), encoding: 'utf8' },
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
    '64/8/128 with omitted empty optional descriptions: real core JS/PHP Markdown↔blocks bytes passed under unchanged 1024-value/16 KiB limits.',
  );
} finally {
  runtime.close();
}
