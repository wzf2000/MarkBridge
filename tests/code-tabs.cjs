const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fixtures = require('./fixtures/code-tabs.json');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const php = (request) =>
  JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_TEST_PHP || 'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(request), encoding: 'utf8' },
    ),
  );
const flatten = (blocks) => blocks.flatMap((b) => [b, ...flatten(b.innerBlocks || [])]);
try {
  for (const [i, fixture] of fixtures.entries()) {
    const doc = w.MBB.importDocument(fixture.source, 'tabs-' + i);
    const blocks = w.wp.blocks.parse(doc.serialized),
      group = flatten(blocks).find((b) => b.name === 'mbb/code-tabs');
    assert.deepEqual(
      JSON.parse(JSON.stringify(group.attributes.tabs)),
      fixture.tabs,
      'Original fence bytes changed',
    );
    assert(flatten(blocks).every((b) => b.isValid));
    assert.equal(
      w.wp.blocks.serialize(blocks),
      fixture.normalizesInlineGT
        ? doc.serialized.replace(
            '<p><code>const html="&lt;pre>";</code></p>',
            '<p><code>const html="&lt;pre&gt;";</code></p>',
          )
        : doc.serialized,
      'Actual core serialization changed carrier',
    );
    const backend = php({ mode: 'markdown', source: fixture.source, documentId: doc.documentId });
    assert(backend.ok, JSON.stringify(backend));
    assert.equal(backend.document.serialized, doc.serialized, 'PHP/Node carrier bytes differ');
    assert.equal(backend.document.source, doc.source, 'PHP/Node Markdown bytes differ');
    assert.deepEqual(
      JSON.parse(
        JSON.stringify(
          flatten(
            w.wp.blocks.parse(w.MBB.importDocument(doc.source, doc.documentId).serialized),
          ).find((b) => b.name === 'mbb/code-tabs').attributes.tabs,
        ),
      ),
      fixture.tabs,
    );
    assert(
      php({
        mode: 'paired_restore',
        source: fixture.source,
        serialized: doc.serialized,
        documentId: doc.documentId,
      }).ok,
    );
    const copy = w.wp.blocks.parse(doc.serialized);
    const changed = flatten(copy).find((b) => b.name === 'mbb/code-tabs');
    changed.attributes.tabs[0].code = ' edited\r\n\t<raw> ';
    const edited = w.MBB.importDocument(
      w.MBB.exportDocument(doc, w.wp.blocks.serialize(copy)),
      doc.documentId,
    );
    assert.equal(
      flatten(w.wp.blocks.parse(edited.serialized)).find((b) => b.name === 'mbb/code-tabs')
        .attributes.tabs[0].code,
      ' edited\r\n\t<raw> ',
    );
    const out = php({
      mode: 'blocks',
      serialized: w.wp.blocks.serialize(copy),
      base: doc,
      documentId: doc.documentId,
    });
    assert(out.ok, JSON.stringify(out));
    assert.equal(out.document.serialized, edited.serialized);
  }
  const source = fixtures[0].source;
  const meta = JSON.parse(source.split('\n')[0].slice(':::mbb:v1 code-tabs '.length));
  for (const tabs of [
    Object.fromEntries(meta.tabs.map((t, i) => [i, t])),
    meta.tabs.map((t) => Object.values(t)),
  ]) {
    const invalid = source.replace(
      source.split('\n')[0],
      ':::mbb:v1 code-tabs ' + JSON.stringify({ ...meta, tabs }),
    );
    assert.throws(() => w.MBB.importDocument(invalid, 'typed-tabs'));
    assert.equal(php({ mode: 'markdown', source: invalid, documentId: 'typed-tabs' }).ok, false);
    const doc = w.MBB.importDocument(source, 'typed-blocks'),
      attrs = JSON.parse(JSON.stringify(w.wp.blocks.parse(doc.serialized)[0].attributes));
    attrs.tabs = tabs;
    const serialized = doc.serialized.replace(
      /^<!-- wp:mbb\/code-tabs .*? -->/,
      '<!-- wp:mbb/code-tabs ' + JSON.stringify(attrs) + ' -->',
    );
    assert.throws(() => w.MBB.exportDocument(doc, serialized));
    assert.equal(
      php({ mode: 'blocks', base: doc, serialized, documentId: doc.documentId }).ok,
      false,
    );
  }
  for (const raw of [
    '<pre>\n:::mbb:v1 code-tabs {}\n:::mbb:end\n</pre>\n',
    '<code>\n:::mbb:v1 collapse {}\n:::mbb:end\n</code>\n',
  ])
    for (const prefix of ['', source])
      for (const eol of ['\n', '\r\n']) {
        const input = prefix + raw.replaceAll('\n', eol),
          doc = w.MBB.importDocument(input, 'raw-protection');
        const p = php({ mode: 'markdown', source: input, documentId: 'raw-protection' });
        assert(p.ok, JSON.stringify(p));
        assert.equal(p.document.serialized, doc.serialized);
      }
  for (const bad of [
    source.replace('"defaultTab":"variant4"', '"defaultTab":"absent"'),
    source.replace('"id":"variant1"', '"id":"variant0"'),
    source.replace('"title":""', '"title":"","extra":true'),
    source.replace('```javascript', '```' + 'a'.repeat(65)),
    source.replace('\n\n:::mbb:end', '\n\nextra\n\n:::mbb:end'),
    '<a id="variant0"></a>\n\n' + source,
    source.replace('```javascript', ' ```javascript'),
  ]) {
    assert.throws(() => w.MBB.importDocument(bad, 'bad-tabs'));
    assert.equal(php({ mode: 'markdown', source: bad, documentId: 'bad-tabs' }).ok, false);
  }
  const context = w.MBB.importDocument(source, 'bounds');
  const group = w.wp.blocks.parse(context.serialized)[0];
  for (const [code, valid] of [
    ['😀'.repeat(16384), true],
    ['😀'.repeat(16384) + 'x', false],
  ]) {
    const a = {
      ...group.attributes,
      tabs: [{ id: 'byte-version', title: '', language: '', code }],
      defaultTab: 'byte-version',
    };
    const block = w.wp.blocks.createBlock('mbb/code-tabs', a);
    if (valid) {
      const raw = w.MBB.toMarkdown([block], context),
        doc = w.MBB.importDocument(raw, 'byte-limit');
      const p = php({ mode: 'markdown', source: raw, documentId: 'byte-limit' });
      assert(p.ok, JSON.stringify(p));
      assert.equal(p.document.serialized, doc.serialized);
    } else {
      assert.throws(() => w.MBB.toMarkdown([block], context), { code: 'CODE_TABS_LIMIT' });
      const raw =
        ':::mbb:v1 code-tabs ' +
        JSON.stringify({
          id: a.id,
          defaultTab: a.defaultTab,
          tabs: [{ id: 'byte-version', title: '', terminalNewline: false }],
        }) +
        '\n\n```\n' +
        code +
        '\n```\n\n:::mbb:end\n';
      const rejected = php({ mode: 'markdown', source: raw, documentId: 'byte-limit' });
      assert.equal(rejected.code, 'CODE_TABS_LIMIT');
    }
  }
  const three = Array.from({ length: 3 }, (_, i) => ({
    id: 'total-' + i,
    title: '',
    language: '',
    code: 'x'.repeat(45000),
  }));
  const overGroup =
    ':::mbb:v1 code-tabs ' +
    JSON.stringify({
      id: 'total',
      defaultTab: 'total-0',
      tabs: three.map(({ id, title }) => ({ id, title, terminalNewline: false })),
    }) +
    '\n\n' +
    three.map((t) => '```\n' + t.code + '\n```').join('\n\n') +
    '\n\n:::mbb:end\n';
  assert.throws(() => w.MBB.importDocument(overGroup, 'group-limit'));
  assert.equal(php({ mode: 'markdown', source: overGroup, documentId: 'group-limit' }).ok, false);
  for (const [error, mutate, phpError = error] of [
    ['CODE_TABS_STRUCTURE', (a) => (a.tabs = [])],
    ['CODE_TABS_LIMIT', (a) => (a.tabs[0].code = 'x'.repeat(65537))],
    ['CODE_TABS_STRUCTURE', (a) => (a.tabs = [...a.tabs, ...a.tabs])],
    ['TEACHING_ID', (a) => (a.tabs[1].id = a.tabs[0].id)],
    ['TEACHING_TITLE', (a) => (a.tabs[0].title = '😀'.repeat(201))],
    ['CODE_TABS_CODE', (a) => (a.tabs[0].code = '\ud800'), 'JSON'],
    ['CODE_TABS_CODE', (a) => (a.tabs[0].code = '\0')],
  ]) {
    const a = JSON.parse(JSON.stringify(group.attributes));
    mutate(a);
    const block = w.wp.blocks.createBlock('mbb/code-tabs', a);
    assert.throws(() => w.MBB.toMarkdown([block], context), { code: error });
    const serialized = context.serialized.replace(
      /^<!-- wp:mbb\/code-tabs .*? -->/,
      '<!-- wp:mbb/code-tabs ' + JSON.stringify(a) + ' -->',
    );
    const rejected = php({
      mode: 'blocks',
      serialized,
      base: context,
      documentId: context.documentId,
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, phpError, JSON.stringify(rejected));
  }
  // Existing code fences remain ordinary mbb/code blocks.
  assert.equal(
    w.wp.blocks.parse(w.MBB.importDocument('```js\nlet x = 1;\n```\n', 'ordinary').serialized)[0]
      .name,
    'mbb/code',
  );
  console.log(
    'Code tabs shared byte preservation, actual core serialization, edits, nesting and closed rejection contracts passed.',
  );
} finally {
  close();
}
