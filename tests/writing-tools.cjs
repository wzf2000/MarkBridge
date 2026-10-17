const assert = require('node:assert/strict');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const plain = (v) => JSON.parse(JSON.stringify(v));
try {
  for (const text of [
    '$5 and $10',
    '\\$x\\$',
    '`$x$`',
    '$$\n100\n$$',
    '```js\nmissing close',
    '- one\nordinary prose',
    '$x$',
  ])
    assert.equal(w.MBB.markdownSnippet(text), null, text);
  for (const [text, kind] of [
    ['$$\n\\frac{a}{b}\n$$', 'math'],
    ['```js\nconst price="$5";\n```', 'code'],
    ['- one\n- two', 'list'],
  ]) {
    assert.equal(w.MBB.markdownSnippet(text).kind, kind);
    assert.equal(w.MBB.markdownSnippet(text).source, text);
    const doc = w.MBB.importDocument(text, 'snippet');
    assert(doc.serialized.length);
  }
  const patterns = require('../plugin/writing-patterns.json');
  for (const pattern of patterns) {
    const blocks = w.wp.blocks.parse(pattern.content);
    assert(
      blocks.every((b) => b.isValid),
      pattern.id + ' native pattern valid',
    );
    const sourceText = w.MBB.instantiateWritingPattern(pattern.id, 'test-pattern');
    if (!pattern.instantiate) {
      const md = w.MBB.toMarkdown(blocks, { origin: 'markdown_import' });
      assert.equal(
        w.MBB.importDocument(md, 'pattern').serialized,
        w.MBB.importDocument(sourceText, 'pattern').serialized,
        pattern.id + ' shared structure',
      );
    } else {
      assert.equal(blocks[0].name, 'mbb/writing-pattern');
      const first = w.MBB.instantiateWritingPattern(pattern.id, 'first-pattern');
      const second = w.MBB.instantiateWritingPattern(pattern.id, 'second-pattern');
      const combined = w.MBB.toBlocks(first + '\n' + second);
      const index = plain(w.MBB.writingIndex(combined));
      assert(index.some((i) => i.id === 'first-pattern-equation'));
      assert(index.some((i) => i.id === 'second-pattern-equation'));
      assert.equal(w.MBB.technicalDiagnostics(combined).issues.length, 0);
      assert(!first.includes('second-pattern'));
      const php = require('node:child_process').spawnSync(
        'php',
        [
          '-r',
          'require "plugin/writing-patterns.php"; echo mbb_instantiate_writing_pattern("lesson", "first-pattern");',
        ],
        { encoding: 'utf8' },
      );
      assert.equal(php.status, 0, php.stderr);
      assert.equal(php.stdout, first, 'JS/PHP share identical instantiated source');
      assert(!w.MBB.instantiateWritingPattern(pattern.id).includes('{{instance}}'));
      assert.notEqual(
        w.MBB.instantiateWritingPattern(pattern.id),
        w.MBB.instantiateWritingPattern(pattern.id),
      );
    }
  }
  const source = require('./fixtures/technical-writing.json').cases.find(
    (c) => c.name === 'equation-and-atomic-reference',
  ).source;
  const external = source + '\n' + w.MBB.instantiateWritingPattern('lesson', 'owned-pattern');
  const externalBlocks = w.MBB.toBlocks(external);
  const externalSource = w.MBB.toMarkdown(externalBlocks, { origin: 'markdown_import' });
  assert(externalSource.includes('data-mbb-target="eq-one"'), 'existing external intent remains');
  assert(
    externalSource.includes('data-mbb-target="owned-pattern-equation"'),
    'owned references map internally',
  );
  assert.equal(w.MBB.technicalDiagnostics(externalBlocks).issues.length, 0);
  const tree = w.MBB.toBlocks(source);
  const index = plain(w.MBB.writingIndex(tree));
  assert(index.some((i) => i.id === 'eq-one' && i.category === 'equation'));
  const dangling = w.wp.blocks.createBlock('core/paragraph', {
    content:
      '<span class="mbb-xref" data-mbb-target="missing" data-mbb-version="1">[missing]</span>',
  });
  const issues = plain(w.MBB.technicalDiagnostics([dangling])).issues;
  assert(
    issues.some((i) => i.code === 'missing-target' && i.clientId === dangling.clientId),
    'missing reference is locatable',
  );
  console.log(
    'Writing snippets, same-source native patterns, navigation and located diagnostics OK',
  );
} finally {
  close();
}
