// Real WordPress core save/parse plus PHP conversion; no WordPress bootstrap or DB.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const php = (request) =>
  JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_TEST_PHP || 'php',
      [
        '-r',
        'require $argv[1];echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(request), encoding: 'utf8', timeout: 20000 },
    ),
  );
const accepted = [],
  rejected = [];
const directive = (kind, text, attrs = {}) =>
  ':::mbb:v1 ' + kind + ' ' + JSON.stringify({ ...attrs, text }) + '\n:::mbb:end\n';
const check = (source) => {
  const doc = w.MBB.importDocument(source, 'native-text'),
    p = php({ mode: 'markdown', source, documentId: doc.documentId });
  assert(p.ok, JSON.stringify(p));
  assert.equal(p.document.serialized, doc.serialized);
  const blocks = w.wp.blocks.parse(doc.serialized);
  assert(blocks.every((b) => b.isValid));
  assert.equal(w.MBB.exportDocument(doc, w.wp.blocks.serialize(blocks)), source);
  const restore = php({
    mode: 'paired_restore',
    source,
    serialized: doc.serialized,
    documentId: doc.documentId,
  });
  assert(restore.ok, JSON.stringify(restore));
  assert.equal(restore.document.source, source);
  accepted.push(doc.serialized);
  return doc;
};
try {
  for (const kind of ['native-code', 'preformatted']) {
    const name = kind === 'native-code' ? 'core/code' : 'core/preformatted';
    for (const text of [
      '',
      'one',
      '\n',
      '\n\nleading\n\tsecond  \n\n',
      '  <tag> & "quote" \'single\' > \u00a0 中 😀\n',
      '$x$ ![x](https://example.invalid/literal.png)\n:::mbb:end\n```js\n<!-- wp:paragraph -->\ntext\n```\nhttps://example.invalid/alone\nhttps://example.invalid/second',
      ...require('./fixtures/native-text-unicode-urls.json').map((item) => item.text),
    ]) {
      const source = directive(kind, text, { anchor: 'native-text', className: 'text-sample' }),
        doc = check(source);
      const content = text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('\n', kind === 'preformatted' ? '<br>' : '\n');
      const actual = w.wp.blocks.serialize([
        w.wp.blocks.createBlock(name, {
          anchor: 'native-text',
          className: 'text-sample',
          content: w.wp.richText.RichTextData.fromHTMLElement(
            Object.assign(w.document.createElement('span'), { innerHTML: content }),
            { preserveWhiteSpace: true },
          ),
        }),
      ]);
      assert.equal(doc.serialized, actual, 'Save HTML must equal real core');
      if (
        kind === 'native-code' &&
        require('./fixtures/native-text-unicode-urls.json').some((item) => item.text === text)
      )
        assert.equal(
          (doc.serialized.match(/&#47;&#47;/g) || []).length,
          1,
          'Core protects only the first isolated URL',
        );
      const blocks = w.wp.blocks.parse(actual);
      blocks[0].attributes.content = w.wp.richText.RichTextData.fromHTMLElement(
        Object.assign(w.document.createElement('span'), {
          innerHTML: kind === 'preformatted' ? 'edited<br>\ttext' : 'edited\n\ttext',
        }),
        { preserveWhiteSpace: true },
      );
      const edited = w.wp.blocks.serialize(blocks),
        out = w.MBB.exportDocument(doc, edited),
        p = php({ mode: 'blocks', base: doc, serialized: edited, documentId: doc.documentId });
      assert(p.ok, JSON.stringify(p));
      assert.equal(p.document.source, out);
      assert.equal(w.MBB.importDocument(out, 'native-text').serialized, edited);
    }
    check(':::mbb:v1 group {}\n' + directive(kind, 'nested\n\ttext') + '\n:::mbb:end\n');
    const base = check(directive(kind, 'Plain'));
    rejected.push(
      base.serialized.replace('Plain', '<script>alert(1)</script>'),
      base.serialized.replace('class="wp-block-', 'onclick="alert(1)" class="wp-block-'),
    );
    for (const attrs of [
      { style: {} },
      { language: 'js' },
      { metadata: { bindings: {} } },
      { lock: {} },
      { content: 'lost' },
      { anchor: null },
      { className: 'bad" onclick="x' },
    ]) {
      const raw = base.serialized.replace(
        '<!-- wp:' + name.slice(5) + ' -->',
        '<!-- wp:' + name.slice(5) + ' ' + JSON.stringify(attrs) + ' -->',
      );
      assert.throws(() => w.MBB.exportDocument(base, raw));
      assert.equal(
        php({ mode: 'blocks', base, serialized: raw, documentId: base.documentId }).ok,
        false,
      );
    }
    const rawVariants = [
      base.serialized.replace('Plain', '<strong>Plain</strong>'),
      base.serialized.replace('Plain', 'P&#108;ain'),
      base.serialized.replace('Plain', 'Plain\r\n'),
      base.serialized.replace('class="wp-block-', 'onclick="x" class="wp-block-'),
    ];
    for (const raw of rawVariants) {
      assert.throws(() => w.MBB.exportDocument(base, raw));
      assert.equal(
        php({ mode: 'blocks', base, serialized: raw, documentId: base.documentId }).ok,
        false,
      );
    }
    for (const source of [
      directive(kind, 'CR\rLF'),
      directive(kind, 'x'.repeat(262144)),
      directive(kind, 'duplicate', { anchor: 'dup' }) +
        '\n' +
        directive(kind, 'duplicate', { anchor: 'dup' }),
      directive(kind, 'ok').replace(':::mbb:end', 'Body\n:::mbb:end'),
    ]) {
      assert.throws(() => w.MBB.importDocument(source, 'native-text'));
      assert.equal(php({ mode: 'markdown', source, documentId: 'native-text' }).ok, false);
    }
    const url = 'https://example.invalid/literal.png',
      to = 'https://example.invalid/rewritten.png';
    const literal = directive(
      kind,
      '$x$ ![x](' + url + ')\n:::mbb:end\n`code` <!-- wp:paragraph -->',
    );
    const imageBase = check(literal + '\n![Actual](' + url + ')\n');
    const rewritten = w.MBB.rewriteDocumentImages(imageBase, [{ from: url, to }]);
    const headerText = (source) =>
      JSON.parse(source.split('\n')[0].slice((':::mbb:v1 ' + kind + ' ').length)).text;
    assert.equal(headerText(rewritten.source), headerText(literal));
    assert.equal(w.MBB.toBlocks(rewritten.source)[1].attributes.url, to);
    const rewrittenPHP = php({
      mode: 'resource_images',
      base: imageBase,
      mappings: [{ from: url, to }],
      documentId: imageBase.documentId,
    });
    assert(rewrittenPHP.ok, JSON.stringify(rewrittenPHP));
    assert.equal(rewrittenPHP.document.source, rewritten.source);
    const special = check(directive(kind, '>\u00a0'));
    for (const raw of [
      special.serialized.replace('&gt;', '>'),
      special.serialized.replace('&nbsp;', '\u00a0'),
    ]) {
      assert.throws(() => w.MBB.exportDocument(special, raw));
      assert.equal(
        php({ mode: 'blocks', base: special, serialized: raw, documentId: special.documentId }).ok,
        false,
      );
      assert.equal(
        php({
          mode: 'paired_restore',
          source: special.source,
          serialized: raw,
          documentId: special.documentId,
        }).ok,
        false,
      );
    }
    const rich = w.wp.blocks.createBlock(name, { content: '<em>formatted</em>' });
    assert.throws(() => w.MBB.toMarkdown([rich], { origin: 'markdown_import' }));
  }
  if (process.env.MARKBRIDGE_WORDPRESS_SOURCE)
    console.log(
      execFileSync(
        process.env.MARKBRIDGE_TEST_PHP || 'php',
        [path.join(__dirname, 'native-group-kses.php'), process.env.MARKBRIDGE_WORDPRESS_SOURCE],
        { input: JSON.stringify({ accepted, rejected }), encoding: 'utf8' },
      ).trim(),
    );
  console.log(
    'Native text: exact core identity, whitespace, PHP/Node import/edit/reopen/paired restore, nested groups, closed attrs/HTML, anchors and budgets passed.',
  );
} finally {
  close();
}
