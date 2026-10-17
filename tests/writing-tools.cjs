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
    const md = w.MBB.toMarkdown(blocks, { origin: 'markdown_import' });
    const native = w.MBB.importDocument(md, 'pattern');
    const source = w.MBB.importDocument(pattern.source, 'pattern');
    assert.equal(
      native.serialized,
      source.serialized,
      pattern.id + ' same source/native structure',
    );
    assert(!pattern.content.includes('"id"'), pattern.id + ' no copied stable IDs');
  }
  const source = require('./fixtures/technical-writing.json').cases.find(
    (c) => c.name === 'equation-and-atomic-reference',
  ).source;
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
