const assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process'),
  path = require('node:path');
const { window: w, close } = require('./helpers/wp-runtime.cjs')(),
  plain = (v) => JSON.parse(JSON.stringify(v));
const php = (request) =>
  JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        'require $argv[1];echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(request), encoding: 'utf8' },
    ),
  );
try {
  const input = require('./fixtures/csl.json').cases.find(
      (c) => c.name === 'structured-person-institution-all-fields',
    ).input,
    entries = plain(w.MBB.parseCSL(input).entries);
  const cite = '<span data-mbb-keys="Paper" data-mbb-version="1" class="mbb-cite">[Paper]</span>';
  for (const style of ['author-year', 'numeric'])
    for (const title of ['Explicit metadata', 'A & B <literal>', 'Literal &amp; &copy; "quotes"']) {
      const list = entries.map((e) => ({ ...e, title })),
        source =
          cite +
          '\n\n:::mbb:v2 bibliography ' +
          JSON.stringify({ id: 'references', entries: list, style }) +
          '\n\n:::mbb:end\n\nNote[^last].\n\n[^last]: Final note.\n';
      const node = w.MBB.importDocument(source, 'BIBLIOGRAPHY_V2_TEST'),
        result = php({ mode: 'markdown', source, documentId: 'BIBLIOGRAPHY_V2_TEST' });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(
        node.serialized,
        result.document.serialized,
        'HTML parity ' + style + ' ' + title,
      );
      assert.equal(w.MBB.exportDocument(node, node.serialized), source);
      const blocks = w.wp.blocks.parse(node.serialized);
      assert(blocks.every((b) => b.isValid !== false));
      const bib = blocks.find((b) => b.name === 'mbb/bibliography');
      assert.equal(bib.attributes.version, 2);
      assert.equal(bib.attributes.style, style);
      assert.deepEqual(plain(bib.attributes.entries), list);
      const native = w.MBB.toMarkdown(blocks, { origin: 'markdown_import' });
      assert(native.includes(':::mbb:v2 bibliography '));
      assert.equal(
        w.MBB.importDocument(native, 'BIBLIOGRAPHY_V2_TEST').serialized,
        node.serialized,
      );
      for (const mode of ['blocks', 'paired_restore']) {
        const request = {
          mode,
          source,
          serialized: node.serialized,
          documentId: 'BIBLIOGRAPHY_V2_TEST',
          ...(mode === 'blocks' ? { base: plain(node) } : {}),
        };
        const restored = php(request);
        assert.equal(restored.ok, true, JSON.stringify(restored));
        assert.equal(restored.document.serialized, node.serialized);
        assert.deepEqual(
          plain(
            w.wp.blocks
              .parse(restored.document.serialized)
              .find((b) => b.name === 'mbb/bibliography').attributes.entries,
          ),
          list,
        );
      }
      const plan = w.MBB.technicalRenamePlan(blocks, 'key', 'Paper', 'Renamed', (c, m) => {
        throw Error(m);
      });
      assert.equal(plan.affectedReferences, 1);
      const patch = plan.patches.find((p) => p.clientId === bib.clientId);
      assert.deepEqual(plain(patch.attributes.entries[0]), { ...list[0], key: 'Renamed' });
    }
  const legacy =
    ':::mbb:v1 bibliography ' +
    JSON.stringify({
      id: 'old-bibliography',
      entries: [
        {
          key: 'Old',
          authors: ['Ludwig van Beethoven'],
          title: 'Old exact data',
          year: '2026',
          source: 'Literal source',
          url: '',
        },
      ],
    }) +
    '\n\n:::mbb:end\n';
  const old = w.MBB.importDocument(legacy, 'LEGACY_BIB');
  assert.equal(w.MBB.exportDocument(old, old.serialized), legacy);
  assert(!old.serialized.includes('"style"'));
  assert(!old.serialized.includes('"type"'));
  assert.equal(
    php({
      mode: 'paired_restore',
      documentId: 'LEGACY_BIB',
      source: legacy,
      serialized: old.serialized,
    }).ok,
    true,
  );
  const legacyURL = legacy.replace('"url":""', '"url":"https://127.1/"'),
    oldURL = w.MBB.importDocument(legacyURL, 'LEGACY_URL');
  assert.equal(w.MBB.exportDocument(oldURL, oldURL.serialized), legacyURL);
  const restoredURL = php({
    mode: 'paired_restore',
    documentId: 'LEGACY_URL',
    source: legacyURL,
    serialized: oldURL.serialized,
  });
  assert.equal(restoredURL.ok, true, JSON.stringify(restoredURL));
  assert.equal(restoredURL.document.source, legacyURL);
  for (const c of require('./fixtures/csl.json').cases.filter((v) => v.name.startsWith('url-'))) {
    const url = JSON.parse(c.input)[0].URL,
      list = [{ ...entries[0], url }],
      source =
        ':::mbb:v2 bibliography ' +
        JSON.stringify({
          id: 'url-bibliography',
          entries: list,
          style: 'author-year',
        }) +
        '\n\n:::mbb:end\n';
    const result = php({ mode: 'markdown', documentId: 'BIB_URL', source });
    assert.equal(result.ok, !c.reject, c.name + ': ' + JSON.stringify(result));
    if (c.reject) assert.throws(() => w.MBB.importDocument(source, 'BIB_URL'), c.name);
    else {
      const node = w.MBB.importDocument(source, 'BIB_URL');
      assert.equal(node.serialized, result.document.serialized, c.name);
      assert.equal(w.MBB.exportDocument(node, node.serialized), source, c.name);
    }
  }
  for (const source of [
    legacy.replace(':::mbb:v1', ':::mbb:v2'),
    legacy.replace('"id":"old-bibliography"', '"id":"old-bibliography","style":"numeric"'),
    ':::mbb:v2 collapse {"id":"x","title":"T","open":true}\n\nText.\n\n:::mbb:end\n',
  ]) {
    assert.throws(() => w.MBB.importDocument(source, 'INVALID_BIB'));
    assert.equal(php({ mode: 'markdown', documentId: 'INVALID_BIB', source }).ok, false);
  }
  console.log(
    'Bibliography v2 fixed-style, native/paired roundtrip, full metadata, literal text and v1 preservation passed in both converters.',
  );
} finally {
  close();
}
