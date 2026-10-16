const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const kernel = fs.readFileSync(path.join(root, 'src/kernel.js'), 'utf8');
const start = kernel.indexOf('function directiveDataProjection(source) {');
const end = kernel.indexOf('\nfunction parseSource(', start);
const context = {
  boundaryMD: new (require('markdown-it'))({ html: true }),
  fail(code, message, location) {
    throw Object.assign(Error(message), { code, location });
  },
};
vm.createContext(context);
vm.runInContext(kernel.slice(start, end) + '\nthis.normalize = displayBoundaries;', context);
const normalize = (source) => context.normalize(source);
const directive = (kind, attrs, body) =>
  `:::mbb:v1 ${kind} ${JSON.stringify(attrs)}\n\n${body}\n\n:::mbb:end\n`;
const fold = (id, title, body = 'Before $$x+1$$ after.') =>
  directive('collapse', { id, title, open: true }, body);
const titles = [
  'Price $$',
  'Uses $$x$$',
  '`',
  '```',
  '<code>',
  '<pre>$$`',
  'Quote " and 😀 中文 $$ <code> `',
];
const fixtures = titles.map((title, i) => ({
  id: 'header-' + i,
  source: fold('fold-' + i, title),
  title,
}));
fixtures.push(
  {
    id: 'unicode-crlf',
    source: ('前😀文。\n\n' + fold('unicode', '标题😀 $$ ` <code>')).replace(/\n/g, '\r\n'),
    title: '标题😀 $$ ` <code>',
  },
  {
    id: 'nested',
    source: fold(
      'outer',
      'Outer $$ ` <code>',
      fold('inner', 'Inner $$x$$', 'Before $$x+1$$ after.'),
    ),
    title: 'Outer $$ ` <code>',
  },
  {
    id: 'nested-json',
    source: directive(
      'component',
      {
        id: 'demo',
        component: 'absent-provider',
        componentVersion: '0.1.0',
        params: { text: '$$ ` <code> 😀', nested: [{ text: '$$x$$' }] },
      },
      'Before $$x+1$$ after.',
    ),
    params: { text: '$$ ` <code> 😀', nested: [{ text: '$$x$$' }] },
  },
  {
    id: 'html-code-guard',
    source: fold('rawguard', '<code>', 'Before $$x+1$$ after.\n\n`</code>`'),
    title: '<code>',
  },
  {
    id: 'fenced-legal-fake',
    source:
      '```md\n:::mbb:v1 collapse {"id":"fake","title":"$$ ` <code>","open":true}\n:::mbb:end\n```\n\nBefore $$x+1$$ after.\n',
    code: ':::mbb:v1 collapse {"id":"fake","title":"$$ ` <code>","open":true}\n:::mbb:end\n',
  },
  {
    id: 'fenced-invalid-fake',
    source: '~~~md\n:::mbb:v1 collapse {"title":"$$",}\n:::mbb:end\n~~~\n\nBefore $$x+1$$ after.\n',
    code: ':::mbb:v1 collapse {"title":"$$",}\n:::mbb:end\n',
  },
);
fixtures.push({
  id: 'html-code-fake',
  source:
    '<pre><code>\n:::mbb:v1 collapse {"id":"fake","title":"$$ ` 😀","open":true}\n:::mbb:end\n</code></pre>\n\nBefore $$x+1$$ after.\n',
  literal: ':::mbb:v1 collapse {"id":"fake","title":"$$ ` 😀","open":true}',
});
for (const title of titles) {
  const source = fold('data-only', title, 'Ordinary body.');
  assert.equal(normalize(source), source, 'Header data changed: ' + title);
}
for (const item of fixtures) {
  const normalized = normalize(item.source);
  assert(
    normalized.includes('$$\nx+1\n$$'),
    item.id + ': actual body math was hidden or displaced',
  );
  if (item.code) assert(normalized.includes(item.code), item.id + ': fenced bytes changed');
  if (item.title)
    assert(normalized.includes(JSON.stringify(item.title)), item.id + ': header data changed');
}
fixtures.push({
  id: 'footnote-data',
  source:
    fold('footnote-data', 'Data [^metadata] $$', 'Body[^real].') + '\n[^real]: Actual note.\n',
  title: 'Data [^metadata] $$',
  math: false,
});
const invalid = [
  ':::mbb:v1 collapse {"id":"bad","title":"$$",}\n\nBody.\n\n:::mbb:end\n',
  ':::mbb:v2 collapse {"id":"bad","title":"$$","open":true}\n\nBody.\n\n:::mbb:end\n',
  ':::mbb:v1 collapse {"id":"bad","title":"$$"\n\nBody.\n\n:::mbb:end\n',
];
for (const source of invalid)
  assert.equal(normalize(source), source, 'Invalid directive was rewritten before Teaching');
const unclosed = fold('line-check', '😀 $$ `', 'Body.\n\nUnclosed $$');
assert.throws(
  () => normalize(unclosed),
  (error) => error.code === 'UNCLOSED_MATH' && error.location === 'line:5',
);
console.log(
  'Source boundary projection: header strings, UTF-16/CRLF offsets, nested JSON, raw-code guard, fenced literals and invalid grammar preservation passed.',
);
if (process.argv.includes('--boundary-only')) process.exit(0);
const php = (payload) =>
  JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        'require $argv[1];echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.join(root, 'plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(payload), encoding: 'utf8' },
    ),
  );
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
try {
  const flatten = (blocks) =>
    blocks.flatMap((block) => [block, ...flatten(block.innerBlocks || [])]);
  for (const item of fixtures) {
    const document = w.MBB.importDocument(item.source, 'directive-data-' + item.id);
    const server = php({ mode: 'markdown', source: item.source, documentId: document.documentId });
    assert.equal(server.ok, true, JSON.stringify(server));
    assert.equal(
      server.document.serialized,
      document.serialized,
      item.id + ': Node/PHP serialization',
    );
    assert.equal(
      w.MBB.exportDocument(document, document.serialized),
      item.source,
      item.id + ': exact original source',
    );
    const paired = php({
      mode: 'paired_restore',
      source: item.source,
      serialized: document.serialized,
      documentId: document.documentId,
    });
    assert.equal(paired.ok, true, JSON.stringify(paired));
    assert.equal(paired.document.source, item.source, item.id + ': PHP paired source');
    const parsed = flatten(w.wp.blocks.parse(document.serialized));
    assert(
      item.math === false ||
        parsed.some((b) => b.name === 'mbb/math' && b.attributes.tex === 'x+1'),
      item.id + ': formula body',
    );
    if (item.title)
      assert(
        parsed.some((b) => b.attributes.title === item.title),
        item.id + ': exact attribute value',
      );
    if (item.params)
      assert.deepEqual(
        JSON.parse(
          JSON.stringify(parsed.find((b) => b.name === 'mbb/component').attributes.params),
        ),
        item.params,
        item.id + ': nested attributes',
      );
    if (item.literal)
      assert(
        parsed.some(
          (b) =>
            b.name === 'core/html' &&
            (b.originalContent ?? b.attributes.content ?? '').includes(item.literal),
        ),
        item.id + ': raw HTML code literal',
      );
    if (item.code)
      assert.equal(
        parsed.find((b) => b.name === 'mbb/code').attributes.code,
        item.code,
        item.id + ': exact fenced content',
      );
  }
  for (const source of invalid) {
    assert.throws(
      () => w.MBB.toBlocks(source),
      (error) => error.code.startsWith('TEACHING_'),
    );
    const server = php({ mode: 'markdown', source, documentId: 'directive-invalid' });
    assert.equal(server.ok, false);
    assert(server.code.startsWith('TEACHING_'), JSON.stringify(server));
  }
  const linkedNote =
    fold('linked-note', 'Data [^metadata] $$', '[link[^real]](https://example.invalid/)') +
    '\n[^real]: Actual note.\n';
  assert.throws(
    () => w.MBB.toBlocks(linkedNote),
    (error) => error.code === 'FOOTNOTE_IN_LINK',
  );
  const linkedFailure = php({
    mode: 'markdown',
    source: linkedNote,
    documentId: 'directive-footnote-link',
  });
  assert.equal(linkedFailure.ok, false);
  assert.equal(linkedFailure.code, 'FOOTNOTE_IN_LINK');
  assert.throws(
    () => w.MBB.toBlocks(unclosed),
    (error) => error.code === 'UNCLOSED_MATH' && error.location === 'line:5',
  );
  const failure = php({ mode: 'markdown', source: unclosed, documentId: 'directive-location' });
  assert.equal(failure.ok, false);
  assert.equal(failure.code, 'UNCLOSED_MATH');
  assert.equal(failure.location, 'line:5');
  console.log(
    `Real Node/PHP directive data conversion: ${fixtures.length} shared cases, paired raw source, attributes, grammar errors and physical locations passed.`,
  );
} finally {
  close();
}
