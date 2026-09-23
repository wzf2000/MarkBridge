const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const runtime = process.env.MARKBRIDGE_TEST_RUNTIME;
assert(runtime, 'Set MARKBRIDGE_TEST_RUNTIME to a prepared private runtime.');
function convert(items) {
  const result = spawnSync(
    path.join(runtime, 'node/bin/node'),
    [path.join(runtime, 'worker.cjs'), runtime],
    {
      input: JSON.stringify({ mode: 'batch', items }),
      encoding: 'utf8',
      timeout: 25000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert(response.ok, JSON.stringify(response));
  return response.document;
}
const fixtures = [
  '# Heading\n\n中文 **bold** and *emphasis*.\n',
  '```python\nprint("$literal$", "\\\\path")\n```\n',
  'Inline $x_i < y$ and `not $math$`.\n\n$$\n\\sum_i x_i^2\n$$\n',
  '| left | right |\n| :--- | ---: |\n| text | `code` |\n',
  '- first\n\n  another paragraph\n- second\n',
  '> A quote\n\n~~deleted~~\n\n---\n',
  'Before\n\n<!--more-->\n\nAfter\n',
  '> $$\n> \\mathrm{KL}(P\\|Q) = \\begin{cases}\n> \\int p(x)\\log \\frac{p(x)}{q(x)}\\,dx, & \\text{continuous} \\\\\n> \\sum_x p(x)\\log \\frac{p(x)}{q(x)}, & \\text{discrete}\n> \\end{cases}\n> $$\n',
  '> Outer\n>\n> > $$\n> > x > y\n> > $$\n',
  '- Item\n\n  > $$\n  > a+b\n  > $$\n',
  '> ```text\n> $$\n> literal\n> $$\n> ```\n\n> `$$` is code.\n',
];
const documents = [];
for (let start = 0; start < fixtures.length; start += 5) {
  const sources = fixtures.slice(start, start + 5);
  const results = convert(
    sources.map((source, index) => ({
      mode: 'markdown',
      source,
      documentId: 'test-' + (start + index),
    })),
  );
  results.forEach((result, index) => {
    assert(result.ok, JSON.stringify(result));
    assert.equal(result.document.source, sources[index]);
    documents.push(result.document);
  });
}
if (!process.env.MARKBRIDGE_TEST_SKIP_BLOCKS) {
  for (let start = 0; start < documents.length; start += 5) {
    const batch = documents.slice(start, start + 5);
    const results = convert(
      batch.map((base) => ({
        mode: 'blocks',
        base,
        serialized: base.serialized,
        documentId: base.documentId,
      })),
    );
    results.forEach((result, index) => {
      assert(result.ok, JSON.stringify(result));
      assert.equal(result.document.source, batch[index].source);
    });
  }
} else {
  console.log('Block export round trips skipped: no WordPress block runtime configured.');
}
const rejected = convert(
  [
    '<script>alert(1)</script>\n',
    '<img src="x" onerror="alert(1)">\n',
    'text[^1]\n\n[^1]: footnote\n',
  ].map((source) => ({ mode: 'markdown', source, documentId: 'unsafe-test' })),
);
assert(
  rejected.every((result) => !result.ok),
  'Unsafe or unsupported input must be rejected.',
);
const { JSDOM } = require(path.join(runtime, 'node_modules/jsdom'));
// Inspect the real parser's block tree independently of a host's serializer.
// The public CI uses a minimal WordPress adapter; full round trips run above
// when a site-matched runtime is supplied.
const parser = new JSDOM('', { runScripts: 'outside-only' });
parser.window.wp = {
  element: { createElement() {} },
  blockEditor: {},
  components: {},
  blocks: {
    getBlockType: () => true,
    createBlock: (name, attributes = {}, innerBlocks = []) => ({ name, attributes, innerBlocks }),
  },
};
parser.window.eval(fs.readFileSync(path.join(__dirname, '../plugin/kernel.js'), 'utf8'));
function flatten(blocks, parents = []) {
  return blocks.flatMap((block) => [
    { ...block, parents },
    ...flatten(block.innerBlocks, [...parents, block.name]),
  ]);
}
for (const [index, depth, tex] of [
  [
    7,
    1,
    '\\mathrm{KL}(P\\|Q) = \\begin{cases}\n\\int p(x)\\log \\frac{p(x)}{q(x)}\\,dx, & \\text{continuous} \\\\\n\\sum_x p(x)\\log \\frac{p(x)}{q(x)}, & \\text{discrete}\n\\end{cases}',
  ],
  [8, 2, 'x > y'],
  [9, 1, 'a+b'],
]) {
  const blocks = flatten(parser.window.MBB.toBlocks(fixtures[index]));
  const formula = blocks.find((block) => block.name === 'mbb/math');
  assert(formula, 'Display math must remain inside its quote container.');
  assert.equal(formula.parents.filter((name) => name === 'core/quote').length, depth);
  if (index === 9) assert(formula.parents.includes('mbb/list-item'));
  assert.equal(formula.attributes.tex.trim(), tex);
}
assert(
  !flatten(parser.window.MBB.toBlocks(fixtures[10])).some((block) => block.name === 'mbb/math'),
  'Quoted code is not math.',
);
parser.window.close();
const dom = new JSDOM('<p>:rocket:</p><pre>:rocket:</pre><code>:smile:</code>', {
  runScripts: 'outside-only',
});
dom.window.eval(fs.readFileSync(path.join(__dirname, '../plugin/emoji.js'), 'utf8'));
dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
assert.equal(dom.window.document.querySelector('p').textContent, '🚀');
assert.equal(dom.window.document.querySelector('pre').textContent, ':rocket:');
assert.equal(dom.window.document.querySelector('code').textContent, ':smile:');
dom.window.close();
console.log(
  `${fixtures.length} exact round trips, 3 policy rejections and math/code-boundary checks passed.`,
);
