// Actual WordPress core blocks plus pure PHP conversion; no WordPress bootstrap/database.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fixture = require('./fixtures/block-adapters.json');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const snapshot = JSON.stringify(fixture.descriptors);
const php = (request, reverse = false) =>
  JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_TEST_PHP || 'php',
      [
        '-r',
        reverse
          ? 'require $argv[1];try{$c=new \\MarkBridge\\Probe\\Converter();echo json_encode(["ok"=>true,"document"=>$c->fromBlocks(stream_get_contents(STDIN))]);}catch(Throwable $e){echo json_encode(["ok"=>false,"error"=>$e->getMessage()]);}'
          : 'require $argv[1];echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      {
        input: reverse ? request : JSON.stringify({ ...request, blockAdapters: snapshot }),
        encoding: 'utf8',
        timeout: 20000,
      },
    ),
  );
const flatten = (blocks) => blocks.flatMap((b) => [b, ...flatten(b.innerBlocks || [])]);
const roundtrip = (source) => {
  const doc = w.MBB.importDocument(source, 'native-group');
  const p = php({ mode: 'markdown', source, documentId: doc.documentId });
  assert(p.ok, JSON.stringify(p));
  assert.equal(p.document.serialized, doc.serialized);
  const blocks = w.wp.blocks.parse(doc.serialized);
  assert(flatten(blocks).every((b) => b.isValid));
  assert.equal(w.MBB.exportDocument(doc, w.wp.blocks.serialize(blocks)), source);
  const restored = php({
    mode: 'paired_restore',
    source,
    serialized: doc.serialized,
    documentId: doc.documentId,
  });
  assert(restored.ok, JSON.stringify(restored));
  assert.equal(restored.document.source, source);
  return doc;
};
try {
  w.MBB.configureBlockAdapters(snapshot);
  for (const attrs of [
    {},
    { layout: { type: 'flow' } },
    { layout: { type: 'constrained' } },
    { tagName: 'section' },
    {
      anchor: 'group-anchor',
      className: 'reading-group compact',
      ariaLabel: 'Overview & <notes> "quoted" and \'apostrophe\' 中文',
    },
    { ariaLabel: '', className: '' },
    { tagName: 'section', layout: { type: 'constrained' } },
  ]) {
    for (const children of [
      [],
      [w.wp.blocks.createBlock('core/paragraph', { content: 'Inside' })],
    ]) {
      const block = w.wp.blocks.createBlock('core/group', attrs, children),
        serialized = w.wp.blocks.serialize([block]);
      const source = w.MBB.toMarkdown([block], { origin: 'markdown_import' }),
        doc = roundtrip(source);
      assert.equal(doc.serialized, serialized, 'Core group save HTML must match exactly');
      assert(!doc.serialized.includes('is-layout-'), 'Do not invent render-time layout classes');
      const p = php(serialized, true);
      assert(p.ok, JSON.stringify(p));
      assert.equal(p.document.serialized, serialized);
    }
  }
  const source =
    ':::mbb:v1 group {"anchor":"outer","tagName":"section","layout":{"type":"constrained"},"ariaLabel":"Learning"}\n\nIntro $x$.\n\n- First\n- Second\n\n```js\nconst x = 1;\n```\n\n![Diagram](https://example.invalid/a.png)\n\n:::mbb:v1 details {"summary":"Notes"}\n\n:::mbb:v1 group {}\n\nInner paragraph.\n\n:::mbb:end\n\n:::mbb:end\n\n' +
    fixture.native[1] +
    '\n\n:::mbb:v1 adapter ' +
    JSON.stringify({
      name: 'plain-card',
      version: '1.0.0',
      attrs: { text: 'Static', count: 1, enabled: false, tone: 'note' },
    }) +
    '\n:::mbb:end\n\n:::mbb:end\n';
  const base = roundtrip(source),
    blocks = w.wp.blocks.parse(base.serialized);
  const paragraph = flatten(blocks).find((b) => b.name === 'core/paragraph');
  paragraph.attributes.content = 'Edited $x$.';
  const edited = w.wp.blocks.serialize(blocks),
    out = w.MBB.exportDocument(base, edited),
    p = php({ mode: 'blocks', base, serialized: edited, documentId: base.documentId });
  assert(p.ok, JSON.stringify(p));
  assert.equal(p.document.source, out);
  assert(out.includes('Edited'));
  const mappings = [
    { from: 'https://example.invalid/a.png', to: 'https://example.invalid/new.png' },
  ];
  const rewrite = w.MBB.rewriteDocumentImages(base, mappings),
    pr = php({ mode: 'resource_images', base, mappings, documentId: base.documentId });
  assert(pr.ok, JSON.stringify(pr));
  assert.equal(pr.document.source, rewrite.source);
  assert(rewrite.source.includes('new.png'));
  const equation =
    ':::mbb:v1 object {"id":"eq-group","kind":"equation","caption":"Grouped equation"}\n\n$$\nx^2\n$$\n\n:::mbb:end\n';
  roundtrip(':::mbb:v1 group {}\n\n' + equation + '\n:::mbb:end\n');
  const stages =
    ':::mbb:v1 steps {"id":"stages","title":"Stages","mode":"staged","previous":true,"next":true,"full":true}\n:::mbb:v1 step {"id":"one","title":"One"}\nBody\n:::mbb:end\n:::mbb:end\n';
  roundtrip(stages);
  const nestedStages = ':::mbb:v1 group {}\n' + stages + '\n:::mbb:end\n';
  assert.throws(
    () => w.MBB.importDocument(nestedStages, 'bad-stages'),
    (e) => e.code === 'TEACHING_STRUCTURE',
  );
  assert.equal(
    php({ mode: 'markdown', source: nestedStages, documentId: 'bad-stages' }).code,
    'TEACHING_STRUCTURE',
  );
  const simple = roundtrip(':::mbb:v1 group {}\n\nBody.\n\n:::mbb:end\n');
  for (const attrs of [
    { style: {} },
    { metadata: { bindings: {} } },
    { lock: {} },
    { layout: { type: 'flex' } },
    { layout: { type: 'flow', contentSize: '40rem' } },
    { tagName: 'article' },
    { tagName: null },
    { ariaLabel: 2 },
    { className: 'bad" onclick=x' },
    { anchor: null },
  ]) {
    const raw = simple.serialized.replace(
      '<!-- wp:group -->',
      '<!-- wp:group ' + JSON.stringify(attrs) + ' -->',
    );
    assert.throws(
      () => w.MBB.exportDocument(simple, raw),
      'Raw attributes must not disappear through core normalization',
    );
    assert.equal(php(raw, true).ok, false);
  }
  for (const raw of [
    simple.serialized.replace('class="wp-block-group"', 'class="evil"'),
    simple.serialized.replace('<div class=', '<section class='),
    simple.serialized.replace(
      '<div class="wp-block-group">',
      '<div aria-label="forged" class="wp-block-group">',
    ),
  ]) {
    assert.throws(() => w.MBB.exportDocument(simple, raw));
    assert.equal(php(raw, true).ok, false);
  }
  for (const bad of [
    ':::mbb:v1 group {"anchor":"dup"}\n:::mbb:v1 group {"anchor":"dup"}\nBody\n:::mbb:end\n:::mbb:end\n',
    ':::mbb:v1 group {}\n:::mbb:v1 steps {"id":"stages","title":"Stages","mode":"staged","previous":true,"next":true,"full":true}\n:::mbb:v1 step {"id":"one","title":"One"}\nBody\n:::mbb:end\n:::mbb:end\n:::mbb:end\n',
    ':::mbb:v1 group {"anchor":"eq-group"}\n' + equation + '\n:::mbb:end\n',
    ':::mbb:v1 group {}\n:::mbb:v1 identity {"namespace":"S_11111111111111111111111111111111","document":"D_22222222222222222222222222222222"}\n:::mbb:end\n:::mbb:end\n',
    ':::mbb:v1 group {}\n:::mbb:v1 bibliography {"id":"refs","entries":[{"key":"paper","authors":["Author"],"title":"Example","year":"2026","source":"Journal","url":""}]}\n:::mbb:end\n:::mbb:end\n',
    ':::mbb:v1 group {}\n'.repeat(35) + 'Body\n' + ':::mbb:end\n'.repeat(35),
    ':::mbb:v1 group {}\n' + 'x'.repeat(262144) + '\n:::mbb:end\n',
  ]) {
    assert.throws(() => w.MBB.importDocument(bad, 'bad-group'));
    assert.equal(php({ mode: 'markdown', source: bad, documentId: 'bad-group' }).ok, false);
  }
  assert.throws(
    () => w.MBB.configureBlockAdapters('[]') || w.MBB.importDocument(source, 'missing-provider'),
  );
  console.log(
    'Native group: real core defaults/empty/nesting, PHP/Node exact import/reverse/edit/reopen, image rewrite, closed raw attributes/HTML, anchors/stages/budgets and missing providers passed',
  );
} finally {
  close();
}
