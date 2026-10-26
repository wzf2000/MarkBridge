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
const policyAccepted = [];
const flatten = (blocks) => blocks.flatMap((b) => [b, ...flatten(b.innerBlocks || [])]);
const roundtrip = (source) => {
  const doc = w.MBB.importDocument(source, 'native-group');
  const p = php({ mode: 'markdown', source, documentId: doc.documentId });
  assert(p.ok, JSON.stringify(p));
  assert.equal(p.document.serialized, doc.serialized);
  policyAccepted.push(doc.serialized);
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
  // Closed native columns reuse the same recursive pair and KSES contracts.
  const column = (attrs = {}, children = []) =>
    w.wp.blocks.createBlock('core/column', attrs, children);
  const para = (text) => w.wp.blocks.createBlock('core/paragraph', { content: text });
  const columnCases = [
    [{}, []],
    [{}, [column()]],
    [
      {},
      [
        column({ width: '40%' }, [para('Column first.')]),
        column({ width: '60%' }, [para('Column second.')]),
      ],
    ],
    ...['top', 'center', 'bottom'].map((verticalAlignment) => [
      { verticalAlignment },
      [column({ verticalAlignment }, [para('Aligned.')])],
    ]),
    [
      { anchor: 'columns-anchor', className: 'learning-columns compact', isStackedOnMobile: false },
      [
        column(
          {
            width: '33.333%',
            verticalAlignment: 'bottom',
            anchor: 'column-anchor',
            className: 'learning-column',
          },
          [para('Sized.')],
        ),
      ],
    ],
    [{ isStackedOnMobile: true }, [column({ width: '100%' })]],
    [{}, [column({ width: '0.125%' })]],
    [{}, Array.from({ length: 6 }, () => column())],
  ];
  for (const [attrs, children] of columnCases) {
    const block = w.wp.blocks.createBlock('core/columns', attrs, children);
    const serialized = w.wp.blocks.serialize([block]);
    const source = w.MBB.toMarkdown([block], { origin: 'markdown_import' });
    const doc = roundtrip(source);
    assert.equal(doc.serialized, serialized, 'Columns must match genuine core serialization');
    const reversed = php(serialized, true);
    assert(reversed.ok, JSON.stringify(reversed));
    assert.equal(reversed.document.serialized, serialized);
  }
  const columnSource =
    ':::mbb:v1 columns {"isStackedOnMobile":false}\n\n:::mbb:v1 column {"width":"40%"}\n\nColumn original.\n\n:::mbb:v1 group {}\n\nNested group.\n\n:::mbb:end\n\n:::mbb:end\n\n:::mbb:v1 column {"width":"60%"}\n\n![Nested diagram](https://example.invalid/a.png)\n\n:::mbb:end\n\n:::mbb:end\n';
  const columnBase = roundtrip(columnSource);
  const columnBlocks = w.wp.blocks.parse(columnBase.serialized);
  flatten(columnBlocks).find((b) => b.name === 'core/paragraph').attributes.content =
    'Column edited.';
  const columnEdited = w.wp.blocks.serialize(columnBlocks);
  const columnExport = w.MBB.exportDocument(columnBase, columnEdited);
  const columnPHP = php({
    mode: 'blocks',
    base: columnBase,
    serialized: columnEdited,
    documentId: columnBase.documentId,
  });
  assert(columnPHP.ok, JSON.stringify(columnPHP));
  assert.equal(columnPHP.document.source, columnExport);
  assert(columnExport.includes('Column edited'));
  const columnRewrite = w.MBB.rewriteDocumentImages(columnBase, mappings);
  const rewritePHP = php({
    mode: 'resource_images',
    base: columnBase,
    mappings,
    documentId: columnBase.documentId,
  });
  assert(rewritePHP.ok, JSON.stringify(rewritePHP));
  assert.equal(rewritePHP.document.source, columnRewrite.source);
  for (const width of [
    '0%',
    '101%',
    '-1%',
    '40px',
    'calc(50%)',
    '33.3333%',
    '40%;color:red',
    '40%\n',
    '40%\r',
    '40%\u2028',
    40,
    null,
    '',
  ]) {
    const bad =
      ':::mbb:v1 columns {}\n:::mbb:v1 column ' +
      JSON.stringify({ width }) +
      '\n:::mbb:end\n:::mbb:end\n';
    assert.throws(() => w.MBB.importDocument(bad, 'bad-width'));
    assert.equal(php({ mode: 'markdown', source: bad, documentId: 'bad-width' }).ok, false);
  }
  for (const bad of [
    ...['col\n', 'col\r', 'col\u2028'].map(
      (anchor) => ':::mbb:v1 columns ' + JSON.stringify({ anchor }) + '\n:::mbb:end\n',
    ),
    ':::mbb:v1 column {}\nBody.\n:::mbb:end\n',
    ':::mbb:v1 columns {}\nDirect paragraph.\n:::mbb:end\n',
    ...['compact\n', 'compact\r', 'compact\u2028'].map(
      (className) => ':::mbb:v1 columns ' + JSON.stringify({ className }) + '\n:::mbb:end\n',
    ),
    ':::mbb:v1 columns {}\n' + ':::mbb:v1 column {}\n:::mbb:end\n'.repeat(7) + ':::mbb:end\n',
    ':::mbb:v1 columns {"verticalAlignment":"stretch"}\n:::mbb:end\n',
    ':::mbb:v1 columns {"isStackedOnMobile":"false"}\n:::mbb:end\n',
    ':::mbb:v1 columns {"anchor":"dup-column"}\n:::mbb:v1 column {"anchor":"dup-column"}\n:::mbb:end\n:::mbb:end\n',
    ':::mbb:v1 columns {}\n:::mbb:v1 column {"style":{"width":"40%"}}\n:::mbb:end\n:::mbb:end\n',
    ':::mbb:v1 columns {}\n:::mbb:v1 column {}\n'.repeat(17) +
      ':::mbb:end\n:::mbb:end\n'.repeat(17),
  ]) {
    assert.throws(() => w.MBB.importDocument(bad, 'bad-columns'));
    assert.equal(php({ mode: 'markdown', source: bad, documentId: 'bad-columns' }).ok, false);
  }
  for (const raw of [
    columnBase.serialized.replace('flex-basis:40%', 'flex-basis:41%'),
    columnBase.serialized.replace('flex-basis:40%', 'flex-basis:40%;color:red'),
    columnBase.serialized.replace('style="flex-basis:40%"', 'onclick="alert(1)"'),
    columnBase.serialized.replace('"width":"40%"', '"width":"40%","style":{}'),
    columnBase.serialized.replace('wp-block-columns is-not-stacked-on-mobile', 'wp-block-columns'),
  ]) {
    assert.throws(() => w.MBB.exportDocument(columnBase, raw));
    assert.equal(php(raw, true).ok, false);
  }
  console.log(
    'Native columns: genuine core shells, 0–6 columns, closed percentages/alignment/stacking, nesting, PHP/Node editing/reopen/image rewrite and raw-style refusals passed',
  );
  if (process.env.MARKBRIDGE_WORDPRESS_SOURCE) {
    const group = (body) =>
      '<!-- wp:group -->\n<div class="wp-block-group">' + body + '</div>\n<!-- /wp:group -->';
    const rejected = [
      group('<script>alert(1)</script>'),
      group('<iframe src="https://example.invalid"></iframe>'),
      group('<p onclick="alert(1)">Unsafe</p>'),
      group('<p style="background-image:url(javascript:alert(1))">Unsafe</p>'),
      group('<!-- wp:unknown/safe -->\n<p>Unknown child</p>\n<!-- /wp:unknown/safe -->'),
      group('Body').replace('<div class=', '<div onclick="alert(1)" class='),
    ];
    console.log(
      execFileSync(
        process.env.MARKBRIDGE_TEST_PHP || 'php',
        [path.join(__dirname, 'native-group-kses.php'), process.env.MARKBRIDGE_WORDPRESS_SOURCE],
        { input: JSON.stringify({ accepted: policyAccepted, rejected }), encoding: 'utf8' },
      ).trim(),
    );
  } else console.log('Native group server policy check requires MARKBRIDGE_WORDPRESS_SOURCE.');
  assert.throws(
    () => w.MBB.configureBlockAdapters('[]') || w.MBB.importDocument(source, 'missing-provider'),
  );
  console.log(
    'Native group: real core defaults/empty/nesting, PHP/Node exact import/reverse/edit/reopen, image rewrite, closed raw attributes/HTML, anchors/stages/budgets and missing providers passed',
  );
} finally {
  close();
}
