const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const fixtures = require('./fixtures/native-media.json').cases;
const php = (payload) =>
  JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(payload), encoding: 'utf8' },
    ),
  );
const get = (name) =>
  w.MBB.importDocument(fixtures.find((x) => x.name === name).source, 'media-model');
try {
  const local = get('gallery-default'),
    parsed = w.wp.blocks.parse(local.serialized);
  assert(
    !w.MBB.technicalDiagnostics(parsed).issues.some((x) => x.code === 'duplicate-id'),
    'Repeated attachment IDs are not stable anchors',
  );
  // Real core/gallery writes this unlinked default when its author UI opens.
  parsed[0].attributes.linkTo = 'none';
  const image = parsed[0].innerBlocks[0];
  image.attributes.caption = 'An <em>edited</em> caption';
  const serialized = w.wp.blocks.serialize(parsed),
    source = w.MBB.exportDocument(local, serialized);
  const p = php({ mode: 'blocks', base: local, serialized, documentId: local.documentId });
  assert(serialized.includes('"linkTo":"none"'), 'Exercise core-added serialized default');
  assert(p.ok, JSON.stringify(p));
  assert.equal(p.document.source, source);
  assert(source.includes('An <em>edited</em> caption'));
  assert(!source.includes('linkTo'), 'Equivalent core default does not enter Markdown');
  const reopened = w.MBB.importDocument(source, local.documentId);
  assert.equal(p.document.serialized, reopened.serialized);
  assert.equal(
    w.MBB.exportDocument(reopened, w.wp.blocks.serialize(w.wp.blocks.parse(reopened.serialized))),
    source,
    'Caption edits survive reopening',
  );
  for (const linkTo of ['media', 'custom', 'file', '', true, null]) {
    const changed = serialized.replace('"linkTo":"none"', '"linkTo":' + JSON.stringify(linkTo));
    assert.throws(
      () => w.MBB.exportDocument(local, changed),
      (e) => e.code === 'MEDIA_ATTRIBUTES',
    );
    assert.equal(
      php({ mode: 'blocks', base: local, serialized: changed, documentId: local.documentId }).code,
      'MEDIA_ATTRIBUTES',
    );
  }
  const directiveDefault = fixtures
    .find((x) => x.name === 'gallery-default')
    .source.replace('gallery {}', 'gallery {"linkTo":"none"}');
  assert.throws(
    () => w.MBB.importDocument(directiveDefault, local.documentId),
    (e) => e.code === 'MEDIA_ATTRIBUTES',
  );
  assert.equal(
    php({ mode: 'markdown', source: directiveDefault, documentId: local.documentId }).code,
    'MEDIA_ATTRIBUTES',
  );
  for (const changed of [
    serialized.replace('"linkTo":"none"', '"linkTo":"none","style":{}'),
    serialized.replace('has-nested-images', 'has-nested-images unexpected'),
  ]) {
    assert.throws(
      () => w.MBB.exportDocument(local, changed),
      'Default projection cannot hide other changes',
    );
    assert.equal(
      php({ mode: 'blocks', base: local, serialized: changed, documentId: local.documentId }).ok,
      false,
    );
  }
  const changedSnapshot = local.serialized.replace(
    '<!-- wp:gallery -->',
    '<!-- wp:gallery {"linkTo":"none"} -->',
  );
  assert.notEqual(changedSnapshot, local.serialized);
  assert.throws(
    () => w.MBB.importPairedDocument(local.source, changedSnapshot, local.documentId),
    (e) => e.code === 'SNAPSHOT_MISMATCH',
    'Paired restore remains byte-exact',
  );
  assert.equal(
    php({
      mode: 'paired_restore',
      source: local.source,
      serialized: changedSnapshot,
      documentId: local.documentId,
    }).ok,
    false,
  );
  for (const mappings of [
    [],
    [{ from: 'https://example.invalid/image.png', to: 'images/' + 'a'.repeat(64) + '.png' }],
  ]) {
    assert.throws(
      () => w.MBB.portableDocumentImages(local, mappings),
      (e) => e.code === 'MEDIA_LOCAL_ID',
    );
    assert.equal(
      php({ mode: 'portable_images', base: local, mappings, documentId: local.documentId }).code,
      'MEDIA_LOCAL_ID',
    );
  }
  const noId = w.MBB.importDocument(
    ':::mbb:v1 gallery {"columns":2}\n\n:::mbb:v1 image {"caption":"<code>![literal](https://example.invalid/fake.png)</code>"}\n\n![A](https://example.invalid/image.png)\n\n:::mbb:end\n\n![B](https://example.invalid/image.png)\n\n:::mbb:end\n\n[ordinary](https://example.invalid/image.png)\n',
    'media-no-id',
  );
  const mappings = [
    { from: 'https://example.invalid/image.png', to: 'images/' + 'a'.repeat(64) + '.png' },
  ];
  const portable = w.MBB.portableDocumentImages(noId, mappings),
    pp = php({ mode: 'portable_images', base: noId, mappings, documentId: noId.documentId });
  assert(pp.ok, JSON.stringify(pp));
  assert.equal(pp.document.source, portable.source);
  assert.equal(pp.document.serialized, portable.serialized);
  assert(portable.source.includes('[ordinary](https://example.invalid/image.png)'));
  assert(portable.source.includes('https://example.invalid/fake.png'));
  const ordinary = get('ordinary-historical');
  assert.equal(
    ordinary.serialized,
    '<!-- wp:image -->\n<figure class="wp-block-image"><img src="https://example.invalid/image.png" alt="Alt" title="Title"/></figure>\n<!-- /wp:image -->',
    'Ordinary Markdown image retains its historical exact bytes',
  );
  for (const [extra, html] of [
    [{ lightbox: { enabled: true } }, null],
    [{ style: { border: { radius: '1px' } } }, null],
    [{ id: 42 }, null],
    [{ linkDestination: 'media' }, null],
    [
      {},
      '<a href="https://example.invalid/image.png"><img src="https://example.invalid/image.png" alt="Alt" title="Title"/></a>',
    ],
  ]) {
    let changed = ordinary.serialized.replace(
      '<!-- wp:image -->',
      '<!-- wp:image ' + JSON.stringify(extra) + ' -->',
    );
    if (html) changed = changed.replace(/<img[^>]+\/>/, html);
    assert.throws(() => w.MBB.exportDocument(ordinary, changed));
    assert.equal(
      php({ mode: 'blocks', base: ordinary, serialized: changed, documentId: ordinary.documentId })
        .ok,
      false,
    );
  }
  const raw = ordinary.serialized + '\n\n<!-- wp:footnotes /-->';
  assert.throws(
    () => w.MBB.exportDocument(ordinary, raw),
    (e) => e.code === 'NATIVE_FOOTNOTES',
  );
  assert.equal(
    php({ mode: 'blocks', base: ordinary, serialized: raw, documentId: ordinary.documentId }).code,
    'NATIVE_FOOTNOTES',
  );
  console.log(
    'Native media: edited core blocks, repeated local IDs, portable rejection/projection, links and unsupported native options passed',
  );
} finally {
  close();
}
