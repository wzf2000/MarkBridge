const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const ns = 'S_' + '1'.repeat(32),
  doc = 'D_' + '2'.repeat(32);
const identity =
  ':::mbb:v1 identity ' + JSON.stringify({ namespace: ns, document: doc }) + '\n\n:::mbb:end\n\n';
const reference =
  '<span data-mbb-target="equation-one" data-mbb-version="2" data-mbb-namespace="' +
  ns +
  '" data-mbb-document="' +
  doc +
  '" data-mbb-kind="equation" class="mbb-xref">[equation-one]</span>';
const php = (payload) =>
  JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(payload), encoding: 'utf8' },
    ),
  );
try {
  const cases = [
    identity + '# Title\n\n' + reference + '\n',
    '---\nmarkbridge: 1\ntitle: "Proposal"\n---\n\n' +
      identity +
      'Footnote[^a]. ' +
      reference +
      '\n\n[^a]: End note.\n',
    reference + '\n',
    '```html\n' + reference + '\n```\n',
  ];
  for (const source of cases) {
    const node = w.MBB.importDocument(source, 'REFERENCE_TEST'),
      result = php({ mode: 'markdown', source, documentId: 'REFERENCE_TEST' });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(node.serialized, result.document.serialized);
    const blocks = w.wp.blocks.parse(node.serialized);
    assert(!blocks.some((b) => b.isValid === false));
    assert.equal(w.MBB.exportDocument(node, node.serialized), source);
    const native = w.MBB.toMarkdown(blocks, { origin: 'markdown_import' });
    const back = w.MBB.importDocument(native, 'REFERENCE_TEST');
    assert.equal(back.serialized, node.serialized);
    assert.equal(
      php({
        mode: 'paired_restore',
        source,
        serialized: node.serialized,
        documentId: 'REFERENCE_TEST',
      }).ok,
      true,
    );
    assert.equal(w.MBB.technicalDiagnostics(blocks).issues.length, 0);
  }
  for (const source of [
    identity + identity + 'Body\n',
    identity.replace('S_', 'https://') + 'Body\n',
    reference.replace('data-mbb-kind="equation"', 'data-mbb-kind="arbitrary"') + '\n',
    reference.replace('>[equation-one]', '>secret') + '\n',
    reference.replace('class="mbb-xref"', 'class="mbb-xref" onclick="alert(1)"') + '\n',
  ]) {
    assert.throws(() => w.MBB.importDocument(source, 'REFERENCE_TEST'));
    assert.equal(php({ mode: 'markdown', source, documentId: 'REFERENCE_TEST' }).ok, false, source);
  }
  console.log(
    'Closed logical identity/v2 reference dual-backend, exact pair/native roundtrip, FrontMatter/footnotes and literal code passed.',
  );
} finally {
  close();
}
