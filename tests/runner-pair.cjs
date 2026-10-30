const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const php = (payload) =>
  JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        'require $argv[1];echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(payload), encoding: 'utf8' },
    ),
  );
try {
  for (const language of ['python', 'cpp']) {
    const code =
      '\ufeff' +
      (language === 'python'
        ? "print('你好')"
        : '#include <iostream>\r\nint main(){std::cout << "你好";}') +
      '\r\n \t';
    const params = {
      version: 1,
      language,
      title: '完整示例',
      sourceChunks: [code.slice(0, 1), code.slice(1)],
      stdinChunks: [' x\r\n  '],
    };
    const source =
      ':::mbb:v1 component ' +
      JSON.stringify({
        id: 'example',
        component: 'code-runner',
        componentVersion: '0.1.0',
        params,
      }) +
      '\n\n单文件示例；禁用执行时仍可阅读。\n\n```' +
      language +
      '\n' +
      code +
      '\n```\n\n:::mbb:end\n';
    const doc = w.MBB.importDocument(source, 'runner-fixture');
    const converted = php({ mode: 'markdown', source, documentId: 'runner-fixture' });
    assert.equal(converted.ok, true, JSON.stringify(converted));
    assert.equal(converted.document.serialized, doc.serialized);
    const block = w.wp.blocks.parse(doc.serialized)[0];
    assert.deepEqual(JSON.parse(JSON.stringify(block.attributes.params)), params);
    assert.equal(w.MBB.exportDocument(doc, doc.serialized), source);
    assert.equal(
      php({
        mode: 'paired_restore',
        source,
        serialized: doc.serialized,
        documentId: 'runner-fixture',
      }).ok,
      true,
    );
    const edited = structuredClone(params);
    edited.sourceChunks = ['# changed\r\n  '];
    block.attributes.params = edited;
    const serialized = w.wp.blocks.serialize([block]);
    const nodeSource = w.MBB.exportDocument(doc, serialized);
    const changed = php({ mode: 'blocks', serialized, base: doc, documentId: 'runner-fixture' });
    assert.equal(changed.ok, true, JSON.stringify(changed));
    assert.equal(changed.document.source, nodeSource);
  }
  console.log('Runner paired PHP/Node format passed');
} finally {
  close();
}
