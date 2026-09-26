const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { window: w, close, runtime } = require('./helpers/wp-runtime.cjs')();
const flatten = (blocks) => blocks.flatMap((block) => [block, ...flatten(block.innerBlocks || [])]);
const fixtures = [
  'Text[^note].\n\n[^note]: A simple note.\n',
  'Adjacent[^a][^a] markers.\n\n[^a]: Shared note.\n',
  '![image](https://example.org/a.png) followed by note[^image].\n\n[^image]: After an image.\n',
  'First[^b], again[^b], second[^a].\n\n[^a]: Defined first.\n\n[^b]: Referenced first.\n',
  'A note[^long].\n\n[^long]: First **paragraph** and *emphasis*.\n\n    Second paragraph with [a link](https://example.org/).\n',
  'Math[^math].\n\n[^math]: Inline $x^2$ and `[^literal]`.\n\n    $$\n    x+y=z\n    $$\n',
  'Source[^code].\n\n[^code]: Code follows.\n\n    ```js\n    const marker = "[^not-a-note]";\n    ```\n',
  'Checklist[^tasks].\n\n[^tasks]: Tasks\n\n    - [ ] one\n    - [x] two\n',
  '> Quoted ref[^q].\n\n[^q]: A quote.\n\n    > Nested body quote\n',
  '# Heading[^h]\n\n| column | value |\n| --- | --- |\n| a | ref[^h] |\n\n[^h]: Heading and table note.\n',
  '中文[^说明] 和引用[^説明].\n\n[^说明]: 中文说明。\n\n[^説明]: 別の説明。\n',
];
try {
  const fullRuntime = !!w.wp.blocks.getBlockType('core/paragraph')?.save;
  const serializations = [];
  for (const [index, source] of fixtures.entries()) {
    const blocks = w.MBB.toBlocks(source);
    const defs = flatten(blocks).filter((b) => b.name === 'mbb/footnote');
    assert(defs.length, `fixture ${index} must have semantic definitions`);
    assert.equal(blocks.at(-1).name, 'mbb/footnotes');
    assert(defs.every((b) => typeof b.attributes.label === 'string'));
    if (!fullRuntime) continue;
    const original = w.MBB.importDocument(source, `footnote-${index}`);
    serializations.push(original.serialized);
    assert.equal(w.MBB.exportDocument(original, original.serialized), source);
    const parsed = w.wp.blocks.parse(original.serialized);
    assert(flatten(parsed).every((b) => b.isValid !== false));
    const def = flatten(parsed).find((b) => b.name === 'mbb/footnote');
    const paragraph = flatten(def.innerBlocks).find((b) => b.name === 'core/paragraph');
    paragraph.attributes.content += ' Updated.';
    const edited = w.wp.blocks.serialize(parsed);
    const markdown = w.MBB.exportDocument(original, edited);
    assert(markdown.includes('Updated'));
    const reopened = w.MBB.importDocument(markdown, original.documentId);
    assert.equal(reopened.serialized, edited);
    assert.equal(
      w.MBB.importPairedDocument(source, original.serialized, original.documentId).serialized,
      original.serialized,
    );
    assert.throws(() =>
      w.MBB.importPairedDocument(
        source,
        original.serialized.replace('mbb/footnote', 'mbb/invalid'),
        original.documentId,
      ),
    );
  }
  const invalid = [
    'Missing[^missing].\n',
    'Inline anonymous ^[unsupported note].\n',
    'Text[^bad.name].\n\n[^bad.name]: Invalid label.\n',
    'Text[^a].\n\n[^a]: First.\n\n[^a]: Duplicate.\n',
    'No reference.\n\n[^unused]: Must not disappear.\n',
    'Text[^a].\n\n[^a]: Nested[^b].\n\n[^b]: Nested definition.\n',
    '[Text[^a]](https://example.org)\n\n[^a]: Link note.\n',
    '[Text[^a]][link]\n\n[link]: https://example.org\n\n[^a]: Link note.\n',
    '<a href="https://example.org">Text[^a]</a>\n\n[^a]: Link note.\n',
    'Text[^a].\n\n[^a]: <script>alert(1)</script>\n',
    'Text[^a].\n\n[^a]: <a href="javascript:alert(1)">unsafe</a>\n',
  ];
  for (const source of invalid) assert.throws(() => w.MBB.toBlocks(source), undefined, source);
  for (const source of [
    'Escaped \\[^literal].\n',
    '`[^literal]`\n',
    '<code>[^literal]</code>\n',
    '<pre>[^literal]: definition</pre>\n',
    '```md\n[^literal]: definition\n```\n',
  ]) {
    assert.equal(
      flatten(w.MBB.toBlocks(source)).filter((b) => b.name.startsWith('mbb/footnote')).length,
      0,
    );
    if (fullRuntime) assert.equal(w.MBB.importDocument(source, 'literal').source, source);
  }
  if (fullRuntime) {
    const source = 'Old literal [^missing].\n';
    const serialized = w.wp.blocks.serialize([
      w.wp.blocks.createBlock('core/paragraph', { content: 'Old literal [^missing].' }),
    ]);
    const restored = w.MBB.importPairedDocument(source, serialized, 'legacy-footnote-literal');
    assert.equal(w.MBB.exportDocument(restored, serialized), source);
    assert.throws(() =>
      w.MBB.importPairedDocument(
        source,
        serialized.replace('literal', 'tamper'),
        'legacy-footnote-literal',
      ),
    );
    const response = JSON.parse(
      execFileSync(process.execPath, [path.resolve(__dirname, '../plugin/worker.cjs'), runtime], {
        input: JSON.stringify({
          mode: 'paired_restore',
          source,
          serialized,
          documentId: 'legacy-footnote-literal',
        }),
        encoding: 'utf8',
      }),
    );
    assert.equal(response.ok, true);
    assert.equal(response.document.serialized, serialized);
    const adjacent = w.MBB.importDocument(
      'Adjacent[^a][^a] markers.\n\n[^a]: Shared note.\n',
      'adjacent',
    );
    const adjacentBlocks = w.wp.blocks.parse(adjacent.serialized);
    adjacentBlocks[0].attributes.content = w.wp.richText.toHTMLString({
      value: w.wp.richText.create({ html: adjacentBlocks[0].attributes.content }),
    });
    const normalizedAdjacent = w.MBB.exportDocument(
      adjacent,
      w.wp.blocks.serialize(adjacentBlocks),
    );
    assert.equal((normalizedAdjacent.match(/\[\^a\]/g) || []).length, 3);
    const reorderBase = w.MBB.importDocument(
      'First[^a] and second[^b].\n\n[^a]: A.\n\n[^b]: B.\n',
      'reorder',
    );
    const reordered = w.wp.blocks.parse(reorderBase.serialized);
    reordered[0].attributes.content = reordered[0].attributes.content
      .replaceAll('footnote="a"', 'footnote="TEMP"')
      .replaceAll('[^a]', '[^TEMP]')
      .replaceAll('footnote="b"', 'footnote="a"')
      .replaceAll('[^b]', '[^a]')
      .replaceAll('footnote="TEMP"', 'footnote="b"')
      .replaceAll('[^TEMP]', '[^b]');
    const reorderHTML = w.wp.blocks.serialize(reordered);
    const reorderMarkdown = w.MBB.exportDocument(reorderBase, reorderHTML);
    assert.equal(w.MBB.importDocument(reorderMarkdown, 'reorder').serialized, reorderHTML);
    const base = w.MBB.importDocument(fixtures[0], 'broken-ref');
    const missingDefinition = w.wp.blocks
      .parse(base.serialized)
      .filter((b) => b.name !== 'mbb/footnotes');
    assert.throws(() => w.MBB.exportDocument(base, w.wp.blocks.serialize(missingDefinition)));
    if (process.env.MARKBRIDGE_WORDPRESS_SOURCE) {
      console.log(
        execFileSync(
          'php',
          [path.join(__dirname, 'footnotes-kses.php'), process.env.MARKBRIDGE_WORDPRESS_SOURCE],
          {
            input: JSON.stringify(serializations),
            encoding: 'utf8',
          },
        ).trim(),
      );
    }
    console.log(
      `${fixtures.length} real WordPress footnote round trips, edits, legacy restore and ${invalid.length} rejection cases passed.`,
    );
  } else
    console.log(
      'Footnote AST and rejection checks passed; serialization requires real WordPress scripts.',
    );
} finally {
  close();
}
