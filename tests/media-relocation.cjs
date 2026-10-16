const assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const php = (input) =>
  JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_PHP || 'php',
      [
        '-r',
        'require $argv[1];echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        'plugin/includes/php-converter/Worker.php',
      ],
      { input: JSON.stringify(input), encoding: 'utf8' },
    ),
  );
const url = 'https://source.invalid/uploads/image.png',
  target = 'images/' + 'a'.repeat(64) + '.png';
try {
  for (const source of [
    'Text ![alt](' + url + ') after.\n',
    '<p>Text <img src="' + url + '" alt="alt"/> after.</p>\n',

    ':::mbb:v1 image {"caption":"A <strong>caption</strong>","id":42,"sizeSlug":"full","linkDestination":"none"}\n\n![alt](' +
      url +
      ')\n\n:::mbb:end\n',
    ':::mbb:v1 gallery {"columns":2}\n\n:::mbb:v1 image {"id":42,"sizeSlug":"full"}\n\n![a](' +
      url +
      ')\n\n:::mbb:end\n\n![b](' +
      url +
      ')\n\n:::mbb:end\n',
    ':::mbb:v1 collapse {"id":"fold","title":"Images","open":false}\n\n:::mbb:v1 image {"id":42}\n\n![a](' +
      url +
      ')\n\n:::mbb:end\n\n:::mbb:end\n\n```python\n  value = 1\n\n  print(value)\n```\n',
  ]) {
    const base = w.MBB.importDocument(source, 'CROSS-SITE');
    let doc = w.MBB.relocateDocumentImages(base, [{ from: url, to: target }], true);
    let result = php({
      mode: 'portable_detach',
      base,
      mappings: [{ from: url, to: target }],
      documentId: base.documentId,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), result.document);
    assert(!doc.serialized.includes('wp-image-42'));
    assert(!doc.source.includes('"id":42'));
    const bindings = [{ from: target, to: 'https://destination.invalid/new.png', id: 9001 }];
    result = php({ mode: 'media_bind', base: doc, mappings: bindings, documentId: doc.documentId });
    const rebound = w.MBB.relocateDocumentImages(doc, bindings, false);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(JSON.parse(JSON.stringify(rebound)), result.document);
    if (source.includes(':::mbb:v1 image')) assert(rebound.serialized.includes('wp-image-9001'));
    assert(!rebound.serialized.includes(url));
    assert(rebound.serialized.includes('https://destination.invalid/new.png'));
    assert(!rebound.serialized.includes('wp-image-42'));
    assert.equal(w.MBB.exportDocument(base, base.serialized), source);
    for (const mappings of [
      ...(source.includes(':::mbb:v1 image') ? [[]] : []),
      [{ from: url, to: target, id: 42 }],
      [{ from: url, to: '../escape.png' }],
    ]) {
      assert.throws(() => w.MBB.relocateDocumentImages(base, mappings, true));
      assert.equal(
        php({ mode: 'portable_detach', base, mappings, documentId: base.documentId }).ok,
        false,
      );
    }
    for (const id of [0, -1, 1.5, '42', 9007199254740992]) {
      const mappings = [{ from: target, to: 'https://destination.invalid/new.png', id }];
      assert.throws(() => w.MBB.relocateDocumentImages(doc, mappings, false));
      assert.equal(
        php({ mode: 'media_bind', base: doc, mappings, documentId: doc.documentId }).ok,
        false,
      );
    }
  }
  console.log(
    'Cross-site media: shared PHP/Node detach/rebind, captions, gallery, nested fold, code bytes, old-ID rejection and invalid associations passed',
  );
} finally {
  close();
}
