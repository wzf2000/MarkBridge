// Real pinned core block scripts plus pure PHP/Node contracts, never a WordPress DB test.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fixture = require('./fixtures/block-adapters.json');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const snapshot = JSON.stringify(fixture.descriptors);
const php = (request) =>
  JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_TEST_PHP || 'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      {
        input: JSON.stringify({ ...request, blockAdapters: snapshot }),
        encoding: 'utf8',
        timeout: 20000,
      },
    ),
  );
const flatten = (blocks) => blocks.flatMap((b) => [b, ...flatten(b.innerBlocks || [])]);
const same = (source) => {
  const doc = w.MBB.importDocument(source, 'adapter-tests');
  const result = php({ mode: 'markdown', source, documentId: doc.documentId });
  assert(result.ok, JSON.stringify(result));
  assert.equal(result.document.source, doc.source);
  assert.equal(result.document.serialized, doc.serialized);
  const blocks = w.wp.blocks.parse(doc.serialized);
  assert(
    flatten(blocks).every((b) => b.isValid),
    'Real core parse invalid',
  );
  const serialized = w.wp.blocks.serialize(blocks);
  assert.equal(w.MBB.exportDocument(doc, serialized), doc.source);
  const reverse = php({ mode: 'blocks', base: doc, serialized, documentId: doc.documentId });
  assert(reverse.ok, JSON.stringify(reverse));
  assert.equal(reverse.document.source, doc.source);
  assert.equal(reverse.document.serialized, doc.serialized);
  return doc;
};
const rejects = (source, code) => {
  assert.throws(
    () => w.MBB.importDocument(source, 'bad-adapter'),
    (e) => e.code === code,
    source,
  );
  const r = php({ mode: 'markdown', source, documentId: 'bad-adapter' });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.code, code, JSON.stringify(r));
};
try {
  w.MBB.configureBlockAdapters(snapshot);
  for (const source of fixture.native) same(source);
  const source =
    ':::mbb:v1 adapter ' +
    JSON.stringify({
      name: 'plain-card',
      version: '1.0.0',
      attrs: {
        text: 'Plain <tag> & ![literal](https://example.invalid/image.png) $x$ \u2028',
        count: 1,
        enabled: false,
        tone: 'note',
      },
    }) +
    '\n:::mbb:end\n';
  const doc = same(source);
  assert(doc.serialized.includes('false'), 'False must not render empty text');
  for (const spelling of ['1.0', '1e0', '-0']) {
    const raw = source.replace('"count":1', '"count":' + spelling),
      d = same(raw);
    assert.equal(
      JSON.parse(JSON.stringify(w.wp.blocks.parse(d.serialized)[0].attributes)).count,
      Number(spelling) === 0 ? 0 : Number(spelling),
    );
  }
  for (const [attrs, code] of [
    [{ summary: 123 }, 'ADAPTER_ATTRIBUTES'],
    [{ summary: null }, 'ADAPTER_ATTRIBUTES'],
    [{ summary: 'Safe', anchor: null }, 'ADAPTER_ANCHOR'],
    [{ summary: 'Safe', name: 'group' }, 'ADAPTER_ATTRIBUTES'],
    [{ summary: '\u3000' }, 'ADAPTER_ATTRIBUTES'],
  ])
    rejects(':::mbb:v1 details ' + JSON.stringify(attrs) + '\nBody\n:::mbb:end\n', code);
  rejects(':::mbb:v1 buttons {"layout":{"type":"grid"}}\n:::mbb:end\n', 'ADAPTER_ATTRIBUTES');
  rejects(':::mbb:v1 button {"url":"javascript:alert(1)"}\nRead\n:::mbb:end\n', 'ADAPTER_URL');
  rejects(
    ':::mbb:v1 buttons {}\n:::mbb:v1 button {"url":"#x"}\n<p>Safe</div><script>alert(1)</script><div></p>\n:::mbb:end\n:::mbb:end\n',
    'ADAPTER_STRUCTURE',
  );
  rejects(source.replace('"enabled":false', '"enabled":null'), 'ADAPTER_ATTRIBUTES');
  rejects(source.replace('"version":"1.0.0"', '"version":"9.0.0"'), 'ADAPTER_VERSION');
  const neutral = same(':::mbb:v1 details {"summary":"Safe"}\nBody\n:::mbb:end\n');
  for (const attrs of [
    { anchor: 123 },
    { anchor: null },
    { showContent: 'false' },
    { name: 'group' },
    { style: { color: 'red' } },
  ]) {
    const serialized = neutral.serialized.replace(
      '<!-- wp:details -->',
      '<!-- wp:details ' + JSON.stringify(attrs) + ' -->',
    );
    assert.throws(
      () => w.MBB.exportDocument(neutral, serialized),
      (e) => ['ADAPTER_ATTRIBUTES', 'ADAPTER_ANCHOR'].includes(e.code),
    );
    assert.equal(
      php({ mode: 'blocks', serialized, base: neutral, documentId: neutral.documentId }).ok,
      false,
    );
  }
  const url = 'https://example.invalid/image.png',
    nested =
      ':::mbb:v1 details {"summary":' +
      JSON.stringify('![literal](' + url + ')') +
      '}\n\n' +
      source +
      '\n![real](' +
      url +
      ')\n\n:::mbb:end\n';
  const buttonLiteral =
    ':::mbb:v1 buttons {}\n\n:::mbb:v1 button {"url":"#real"}\n\n<p>![literal](' +
    url +
    ')</p>\n\n:::mbb:end\n\n:::mbb:end\n';
  const image = same(nested + '\n' + buttonLiteral),
    mappings = [{ from: url, to: 'images/' + 'a'.repeat(64) + '.png' }];
  const portable = w.MBB.portableDocumentImages(image, mappings),
    p = php({ mode: 'portable_images', base: image, mappings, documentId: image.documentId });
  assert(p.ok, JSON.stringify(p));
  assert.equal(p.document.source, portable.source);
  assert.equal(p.document.serialized, portable.serialized);
  assert(portable.source.includes(JSON.stringify('![literal](' + url + ')')));
  assert(portable.source.includes('https://example.invalid/image.png) $x$'));
  assert(portable.source.includes('<p>![literal](' + url + ')</p>'));
  const rewritten = w.MBB.rewriteDocumentImages(image, [
    { from: url, to: 'https://example.invalid/new.png' },
  ]);
  const rewrittenPHP = php({
    mode: 'resource_images',
    base: image,
    mappings: [{ from: url, to: 'https://example.invalid/new.png' }],
    documentId: image.documentId,
  });
  assert(rewrittenPHP.ok, JSON.stringify(rewrittenPHP));
  assert.equal(rewrittenPHP.document.serialized, rewritten.serialized);
  assert.equal(rewrittenPHP.document.source, rewritten.source);
  assert(rewritten.source.includes('<p>![literal](' + url + ')</p>'));
  const batch = php({
    mode: 'batch',
    items: [
      {
        mode: 'paired_restore',
        source: doc.source,
        serialized: doc.serialized,
        documentId: doc.documentId,
      },
      { mode: 'blocks', base: doc, serialized: doc.serialized, documentId: doc.documentId },
      { mode: 'markdown', source, documentId: doc.documentId },
    ],
  });
  assert(batch.ok && batch.document.every((item) => item.ok), JSON.stringify(batch));
  for (const item of [
    { mode: 'markdown', source, documentId: doc.documentId, blockAdapters: '[]' },
    { mode: 'batch', items: [] },
  ])
    assert.equal(php({ mode: 'batch', items: [item] }).document[0].code, 'REQUEST');
  for (const eol of ['\r', '\r\n', '\n']) {
    const original = (
      ':::mbb:v1 buttons {}\n:::mbb:v1 button {"url":"#ok"}\n\n<p>![literal](' +
      url +
      ')</p>\n\n:::mbb:end\n:::mbb:end\n\n![real](' +
      url +
      ')\n'
    ).replaceAll('\n', eol);
    const base = same(original),
      projected = w.MBB.portableDocumentImages(base, mappings);
    const converted = php({ mode: 'portable_images', base, mappings, documentId: base.documentId });
    assert(converted.ok, JSON.stringify(converted));
    assert.equal(converted.document.source, projected.source);
    assert.equal(converted.document.serialized, projected.serialized);
    assert.equal(
      projected.source,
      original.replace('![real](' + url + ')', '![real](' + mappings[0].to + ')'),
      'Projection changed non-target bytes or EOL',
    );
  }
  const workerRequest = {
    mode: 'batch',
    blockAdapters: snapshot,
    items: [
      { mode: 'markdown', source: image.source, documentId: image.documentId },
      {
        mode: 'paired_restore',
        source: image.source,
        serialized: image.serialized,
        documentId: image.documentId,
      },
      { mode: 'blocks', base: image, serialized: image.serialized, documentId: image.documentId },
      { mode: 'portable_images', base: image, mappings, documentId: image.documentId },
      {
        mode: 'resource_images',
        base: image,
        mappings: [{ from: url, to: 'https://example.invalid/new.png' }],
        documentId: image.documentId,
      },
    ],
  };
  const actualNode = JSON.parse(
    execFileSync(
      process.execPath,
      [path.resolve('plugin/worker.cjs'), path.resolve(process.env.MARKBRIDGE_TEST_RUNTIME)],
      { input: JSON.stringify(workerRequest), encoding: 'utf8', timeout: 20000 },
    ),
  );
  const actualPHP = php(workerRequest);
  assert(actualNode.ok && actualNode.document.every((item) => item.ok), JSON.stringify(actualNode));
  assert(actualPHP.ok && actualPHP.document.every((item) => item.ok), JSON.stringify(actualPHP));
  assert.deepEqual(
    actualPHP,
    actualNode,
    'Batch lost the trusted outer snapshot in one engine/mode',
  );
  // Template descriptors cannot reinterpret existing core blocks, coerce field arrays, or repair nesting.
  for (const mutate of [
    (d) => (d.blockName = 'core/paragraph'),
    (d) => (d.template.children[0].children[0].field = ['text']),
    (d) => (d.template = { tag: 'p', children: [{ tag: 'div', children: [] }] }),
    (d) => (d.attributes.style = { type: 'plainText', maxLength: 10 }),
    (d) => (d.attributes.count.maximum = 9007199254740992),
  ]) {
    const copy = structuredClone(fixture.descriptors);
    mutate(copy[0]);
    assert.throws(
      () => w.MBB.configureBlockAdapters(JSON.stringify(copy)),
      (e) => e.code === 'ADAPTER_REGISTRY',
    );
    const r = JSON.parse(
      execFileSync(
        process.env.MARKBRIDGE_TEST_PHP || 'php',
        [
          '-r',
          'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
          path.resolve('plugin/includes/php-converter/Worker.php'),
        ],
        {
          input: JSON.stringify({
            mode: 'markdown',
            source: 'Safe',
            documentId: 'invalid-registry',
            blockAdapters: JSON.stringify(copy),
          }),
          encoding: 'utf8',
          timeout: 20000,
        },
      ),
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'ADAPTER_REGISTRY');
  }
  w.MBB.configureBlockAdapters(snapshot);
  assert.throws(
    () => w.MBB.configureBlockAdapters('[]') || w.MBB.importDocument(source, 'missing'),
    (e) => e.code === 'ADAPTER_VERSION',
  );
  console.log('Native blocks/static adapters shared contracts passed.');
} finally {
  close();
}
