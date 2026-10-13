const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
function php(input) {
  return JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_PHP || 'php',
      [
        '-r',
        'require $argv[1]; try { $r=json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR); echo json_encode(\\MarkBridge\\Probe\\Worker::convert($r)); } catch (JsonException $e) { echo json_encode(["ok"=>false,"code"=>"INVALID_JSON"]); }',
        'plugin/includes/php-converter/Worker.php',
      ],
      { input: JSON.stringify(input), encoding: 'utf8' },
    ),
  );
}
const marker = 'mbb-import/' + 'a'.repeat(64);
const original =
  '---\nmarkbridge: 1\ntitle: "Image lesson"\n---\n\n![first](images/a.png)\n\n![again](images/a.png)\n\n[ordinary link](images/a.png) and `![inline](images/a.png)`.\n\n```html\n<img src="images/a.png">\n```\n\nText $x^2$ and note[^a].\n\n[^a]: Kept note.\n';
try {
  const base = w.MBB.importDocument(original, 'IMAGE-TARGETS');
  assert.equal(
    php({ mode: 'markdown', source: original, documentId: base.documentId }).document.serialized,
    base.serialized,
  );
  for (const mappings of [
    [],
    [{ from: 'images/a.png', to: marker }],
    [{ from: 'images/a.png', to: 'https://markbridge.invalid/uploads/a.png?q=1&n=2' }],
  ]) {
    const node = w.MBB.rewriteDocumentImages(base, mappings);
    const result = php({ mode: 'resource_images', base, mappings, documentId: base.documentId });
    assert.equal(result.ok, true, result.message);
    assert.deepEqual(JSON.parse(JSON.stringify(node)), result.document);
    assert.equal(
      w.MBB.parseFrontmatter(node.source, () => {
        throw Error();
      }).raw,
      w.MBB.parseFrontmatter(original, () => {
        throw Error();
      }).raw,
    );
    assert.match(node.source, /\[ordinary link\]\(<?images\/a\.png>?\)/);
    assert(node.source.includes('`![inline](images/a.png)`'));
    assert(node.source.includes('<img src="images/a.png">'));
    if (mappings.length)
      assert.equal(
        node.source.split('![').filter((s) => s.startsWith('first]') || s.startsWith('again]'))
          .length,
        2,
      );
    assert.equal(w.MBB.exportDocument(node, node.serialized), node.source);
  }
  const projected = w.MBB.rewriteDocumentImages(base, [{ from: 'images/a.png', to: marker }]);
  const dotted = w.MBB.importDocument('![relative](./images/a.png)\n', 'DOT-IMAGE');
  const dottedMappings = [{ from: './images/a.png', to: marker }];
  assert.equal(
    php({
      mode: 'resource_images',
      base: dotted,
      mappings: dottedMappings,
      documentId: dotted.documentId,
    }).document.serialized,
    w.MBB.rewriteDocumentImages(dotted, dottedMappings).serialized,
  );
  const final = [{ from: marker, to: 'https://markbridge.invalid/uploads/scaled.png' }];
  const aliases = Array.from({ length: 257 }, (_, i) => './'.repeat(i) + 'pic.png');
  for (const count of [33, 256, 257]) {
    const doc = w.MBB.importDocument(
      aliases
        .slice(0, count)
        .map((url) => '![same](' + url + ')')
        .join('\n\n') + '\n',
      'ALIAS-IMAGES',
    );
    const mappings = aliases.slice(0, count).map((from) => ({ from, to: marker }));
    const result = php({
      mode: 'resource_images',
      base: doc,
      mappings,
      documentId: doc.documentId,
    });
    if (count > 256) {
      assert.equal(result.code, 'RESOURCE_MAP');
      assert.throws(
        () => w.MBB.rewriteDocumentImages(doc, mappings),
        (error) => error.code === 'RESOURCE_MAP',
      );
    } else {
      assert.equal(result.ok, true, result.message);
      assert.equal(
        result.document.serialized,
        w.MBB.rewriteDocumentImages(doc, mappings).serialized,
      );
    }
  }
  assert.throws(
    () =>
      w.MBB.rewriteDocumentImages(
        base,
        Array.from({ length: 33 }, (_, i) => ({
          from: 'url-' + i,
          to: 'https://markbridge.invalid/' + i + '.png',
        })),
      ),
    (error) => error.code === 'RESOURCE_MAP',
  );
  assert.equal(
    php({ mode: 'resource_images', base: projected, mappings: final, documentId: base.documentId })
      .document.serialized,
    w.MBB.rewriteDocumentImages(projected, final).serialized,
  );
  for (const mappings of [
    null,
    [{ from: 'ordinary-missing.png', to: marker }],
    [{ from: 'images/a.png', to: 'javascript:alert(1)' }],
    [{ from: 'images/a.png', to: '/client-picked/path.png' }],
    [{ from: 'images/a.png', to: marker, script: 'x' }],
    [
      { from: 'images/a.png', to: marker },
      { from: 'images/a.png', to: marker },
    ],
    [{ from: '\ud800', to: marker }],
    Array.from({ length: 33 }, (_, i) => ({ from: String(i), to: marker })),
  ]) {
    assert.throws(() => w.MBB.rewriteDocumentImages(base, mappings));
    assert.equal(
      php({ mode: 'resource_images', base, mappings, documentId: base.documentId }).ok,
      false,
    );
  }
  for (const invalid of [
    { ...base, schema: 2 },
    { ...base, converter: 'client-version' },
    { ...base, origin: 'client-origin' },
    { ...base, source: 'Forged source\n' },
    { ...base, serialized: base.serialized.replace('first', 'forged') },
  ]) {
    assert.throws(() => w.MBB.rewriteDocumentImages(invalid, []));
    assert.equal(
      php({ mode: 'resource_images', base: invalid, mappings: [], documentId: base.documentId }).ok,
      false,
    );
  }
  assert.equal(
    php({ mode: 'resource_images', base, mappings: [], documentId: 'DIFFERENT' }).ok,
    false,
  );
  console.log('Resource image target dual-backend contracts passed.');
} finally {
  close();
}
