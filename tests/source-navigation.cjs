const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const built = require('esbuild').buildSync({
  entryPoints: [path.join(root, 'src/source-navigation.js')],
  bundle: true,
  format: 'cjs',
  write: false,
});
const sandbox = { module: { exports: {} }, TextEncoder };
vm.runInNewContext(built.outputFiles[0].text, sandbox);
const navigate = (source, blocks) =>
  JSON.parse(JSON.stringify(sandbox.module.exports.sourceNavigation(source, blocks)));
const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/source-navigation.json'), 'utf8'),
).cases;
const php = (source, blocks) =>
  JSON.parse(
    execFileSync('php', [path.join(__dirname, 'source-navigation.php'), '--map'], {
      input: JSON.stringify({ source, blocks }),
      encoding: 'utf8',
    }),
  );
const wordpressShape = (blocks) =>
  blocks.map((b) => ({
    blockName: b.name,
    attrs: b.attributes || {},
    innerBlocks: wordpressShape(b.innerBlocks || []),
    innerHTML: '',
  }));
for (const item of fixtures) {
  const before = JSON.stringify(item);
  const actual = navigate(item.source, item.blocks);
  assert.deepEqual(actual, item.expected, item.id);
  assert.deepEqual(
    php(item.source, wordpressShape(item.blocks)),
    actual,
    `${item.id}: PHP shape/parity`,
  );
  assert.equal(JSON.stringify(item), before, `${item.id}: no mutation`);
  for (const range of actual.ranges) {
    assert(range.start >= 0 && range.end <= item.source.length && range.start < range.end);
    assert(['exact', 'coarse'].includes(range.precision));
  }
}
const columnsSource =
  ':::mbb:v1 columns {}\n\n:::mbb:v1 column {}\n\nLeft.\n\n:::mbb:end\n\n:::mbb:v1 column {}\n\nRight.\n\n:::mbb:end\n\n:::mbb:end\n';
const columnsBlocks = [
  {
    name: 'core/columns',
    innerBlocks: [
      { name: 'core/column', innerBlocks: [{ name: 'core/paragraph' }] },
      { name: 'core/column', innerBlocks: [{ name: 'core/paragraph' }] },
    ],
  },
];
const columnsMap = navigate(columnsSource, columnsBlocks);
assert.deepEqual(
  columnsMap.ranges.map((range) => range.blockPath),
  [[0], [0, 0], [0, 0, 0], [0, 1], [0, 1, 0]],
);
assert.equal(columnsMap.unmapped.length, 0);
assert.deepEqual(
  php(columnsSource, wordpressShape(columnsBlocks)),
  columnsMap,
  'Column source provenance must match both backends',
);
assert.equal(navigate('x\0y', []).unmapped[0].reason, 'invalid-input');
assert.equal(navigate('\ud800', []).unmapped[0].reason, 'invalid-input');
assert.equal(navigate('x'.repeat(262145), []).unmapped[0].reason, 'invalid-input');
// Whitespace free blocks do not consume semantic blockPath indexes.
assert.deepEqual(
  navigate('text\n', [{ blockName: null, innerHTML: '\n' }, { blockName: 'core/paragraph' }])
    .ranges[0].blockPath,
  [0],
);

// Bounded response growth keeps the proven prefix rather than losing all navigation.
const manySource = Array(2050).fill('Text.').join('\n\n') + '\n';
const manyBlocks = Array.from({ length: 2050 }, () => ({ name: 'core/paragraph' }));
const capped = navigate(manySource, manyBlocks);
assert.equal(capped.ranges.length, 2048);
assert.equal(capped.ranges.at(-1).id, 'r2047');
assert(capped.unmapped.some((item) => item.reason === 'structure-limit'));
assert.deepEqual(php(manySource, wordpressShape(manyBlocks)), capped);
const unsupported = navigate('<a id="raw"></a>\n', manyBlocks);
assert.equal(unsupported.ranges.length, 0);
assert.equal(unsupported.unmapped.length, 2048);
assert(unsupported.unmapped.some((item) => item.reason === 'structure-limit'));
assert.deepEqual(php('<a id="raw"></a>\n', wordpressShape(manyBlocks)), unsupported);
assert.equal(navigate('text', [{ blockName: null, innerHTML: 'unexpected' }]).ranges.length, 0);

// Actual conversion uses existing kernel + sanitized WordPress scripts; no save endpoint.
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
try {
  for (const item of fixtures.filter((item) => item.conversion !== false)) {
    const document = w.MBB.importDocument(item.source, 'navigation-' + item.id);
    assert.equal(w.MBB.exportDocument(document, document.serialized), item.source);
    const actual = w.wp.blocks.parse(document.serialized);
    if (item.footnoteOrder) {
      const group = actual.find((b) => b.name === 'mbb/footnotes');
      group.innerBlocks.sort(
        (a, b) =>
          item.footnoteOrder.indexOf(a.attributes.label) -
          item.footnoteOrder.indexOf(b.attributes.label),
      );
    }
    const before = JSON.stringify(actual);
    assert.deepEqual(
      navigate(item.source, actual),
      item.expected,
      `${item.id}: real Node conversion`,
    );
    const response = JSON.parse(
      execFileSync(
        'php',
        [
          '-r',
          'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN), true)));',
          path.join(root, 'plugin/includes/php-converter/Worker.php'),
        ],
        {
          input: JSON.stringify({
            mode: 'markdown',
            source: item.source,
            documentId: 'navigation-' + item.id,
          }),
          encoding: 'utf8',
        },
      ),
    );
    assert.equal(response.ok, true, `${item.id}: real PHP conversion ${JSON.stringify(response)}`);
    assert.equal(
      response.document.source,
      item.source,
      `${item.id}: original source bytes preserved`,
    );
    const phpBlocks = w.wp.blocks.parse(response.document.serialized);
    if (item.footnoteOrder) {
      const group = phpBlocks.find((b) => b.name === 'mbb/footnotes');
      group.innerBlocks.sort(
        (a, b) =>
          item.footnoteOrder.indexOf(a.attributes.label) -
          item.footnoteOrder.indexOf(b.attributes.label),
      );
    }
    assert.deepEqual(
      php(item.source, wordpressShape(phpBlocks)),
      item.expected,
      `${item.id}: real PHP block tree`,
    );
    assert.equal(JSON.stringify(actual), before, `${item.id}: converted blocks unchanged`);
  }
} finally {
  close();
}
console.log(
  `Source navigation Node/PHP: ${fixtures.length} shared fixtures and real converter parity passed`,
);
