// Explicit optional-extension integration contract; no network or WordPress writes.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  zlib = require('node:zlib');
const root = process.env.MARKBRIDGE_TEST_MERMAID_ROOT
  ? path.resolve(process.env.MARKBRIDGE_TEST_MERMAID_ROOT)
  : path.resolve(__dirname, '../../mermaid-extension');
assert(
  fs.existsSync(path.join(root, 'assets/manifest.json')),
  'Build the separate Mermaid extension or set MARKBRIDGE_TEST_MERMAID_ROOT',
);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
const data = fs.readFileSync(path.join(root, 'assets', manifest.resource.file));
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
assert.equal(manifest.component, 'mermaid');
assert.equal(manifest.componentVersion, '0.2.0');
assert.deepEqual(manifest.componentVersions, ['0.1.0', '0.2.0']);
assert(data.length <= 524288);
assert.equal(sha(data), manifest.resource.sha256);
const packed = [...data.toString().matchAll(/"([A-Za-z0-9+/]{1000,}={0,2})"/g)].map((m) => m[1]);
assert.equal(packed.length, 1);
const decoded = zlib.gunzipSync(Buffer.from(packed[0], 'base64'), { maxOutputLength: 1100000 });
assert.equal(decoded.length, manifest.code.bytes);
assert.equal(sha(decoded), manifest.code.sha256);
assert(
  !/\b(?:eval\s*\(|new Function\s*\()/.test(decoded.toString()),
  'Selected official code must not require CSP unsafe-eval',
);
for (const kind of ['flowDiagram', 'sequenceDiagram', 'dagre'])
  assert(manifest.includedDynamicModules.some((x) => x.includes('/' + kind + '-')));
const { validate } = require(path.join(root, 'assets/model.js'));
assert(validate({ source: 'flowchart LR\nA[Start] --> B[Finish]' }));
assert.throws(() =>
  validate({ source: 'flowchart LR\nA --> B\nclick A href https://example.invalid' }),
);
console.log(
  'Optional Mermaid extension: fixed official selected code hash, decoded/raw bounds and no unsafe-eval passed',
);

const examples = [
  ...fs
    .readFileSync(path.resolve(__dirname, '../docs/MERMAID.md'), 'utf8')
    .matchAll(/```markdown\n([\s\S]*?)```/g),
].map((m) => m[1]);
assert.equal(examples.length, 2, 'Both complete author examples are checked');
for (const source of examples) {
  assert(source.includes('\n:::mbb:end\n'), 'Use the versioned container end marker');
  assert(!/^:::\s*$/m.test(source), 'Bare fence cannot close a MarkBridge container');
  const attrs = JSON.parse(source.split('\n')[0].slice(':::mbb:v1 component '.length));
  assert.equal(attrs.component, 'mermaid');
  assert.equal(attrs.componentVersion, '0.1.0');
  validate(attrs.params);
}
if (process.env.MARKBRIDGE_TEST_RUNTIME) {
  const { execFileSync } = require('node:child_process');
  const { window: w, close } = require('./helpers/wp-runtime.cjs')();
  try {
    for (const [i, source] of examples.entries()) {
      const documentId = 'mermaid-example-' + i;
      const node = w.MBB.importDocument(source, documentId);
      const php = JSON.parse(
        execFileSync(
          'php',
          [
            '-r',
            'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
            path.resolve(__dirname, '../plugin/includes/php-converter/Worker.php'),
          ],
          { input: JSON.stringify({ mode: 'markdown', source, documentId }), encoding: 'utf8' },
        ),
      );
      assert(php.ok, JSON.stringify(php));
      assert.equal(php.document.serialized, node.serialized, 'Real core Node/PHP example parity');
      assert.equal(php.document.source, source);
      assert.equal(
        w.MBB.exportDocument(node, node.serialized),
        source,
        'Example retains exact source',
      );
      const restored = JSON.parse(
        execFileSync(
          'php',
          [
            '-r',
            'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
            path.resolve(__dirname, '../plugin/includes/php-converter/Worker.php'),
          ],
          {
            input: JSON.stringify({
              mode: 'paired_restore',
              source,
              serialized: node.serialized,
              documentId,
            }),
            encoding: 'utf8',
          },
        ),
      );
      assert(restored.ok, JSON.stringify(restored));
      assert.equal(restored.document.source, source);
    }
  } finally {
    close();
  }
  console.log(
    'Both documented Mermaid examples: real-core Node/PHP import and paired restore passed',
  );
} else {
  console.log(
    'Documentation syntax checked; real-core Node/PHP parity not run (MARKBRIDGE_TEST_RUNTIME missing)',
  );
}
