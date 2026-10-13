const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const target = 'images/' + 'a'.repeat(64) + '.png';
const url = 'https://markbridge.invalid/uploads/a.png?q&b';
function php(input) {
  return JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_PHP || 'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR)));',
        'plugin/includes/php-converter/Worker.php',
      ],
      { input: JSON.stringify(input), encoding: 'utf8' },
    ),
  );
}
try {
  const cases = [
    {
      source: `多字节 😀 ![a](  <${url}>   't'  )\r\n\r\n[link](<${url}>)\r\n`,
      expected: `多字节 😀 ![a](  <${target}>   't'  )\r\n\r\n[link](<${url}>)\r\n`,
    },
    ...['\n', '\r\n', '\r'].map((eol) => ({
      source: `![a][r]${eol}${eol}[link][r]${eol}${eol}[r]: <${url}> 't'${eol}`,
      expected: `![a](${target} 't')${eol}${eol}[link][r]${eol}${eol}[r]: <${url}> 't'${eol}`,
    })),
    {
      source: `<img alt="a" src='${url.replace('&', '&amp;')}' />\r\n`,
      expected: `<img alt="a" src='${target}' />\r\n`,
    },
    {
      source: `<img src=${url.replace('&', '&amp;')} alt="a">\n`,
      expected: `<img src=${target} alt="a">\n`,
    },
    {
      source: `---\nmarkbridge: 1\ntitle: "![fake](${url})"\n---\n\n:::mbb:v1 collapse {"id":"fold","title":"<img src='${url}'>","open":false}\n\n![real](${url})\n\n:::mbb:end\n\n\`![literal](${url})\`\n\n\`\`\`md\n![literal](${url})\r\n\`\`\`\n`,
      expected: null,
    },
  ];
  for (const [index, item] of cases.entries()) {
    const base = w.MBB.importDocument(item.source, 'EXPORT-' + index);
    const importPHP = php({ mode: 'markdown', source: item.source, documentId: base.documentId });
    assert.equal(importPHP.ok, true, importPHP.message);
    assert.equal(importPHP.document.serialized, base.serialized);
    const mappings = [{ from: url, to: target }];
    const node = w.MBB.portableDocumentImages(base, mappings);
    const backend = php({ mode: 'portable_images', base, mappings, documentId: base.documentId });
    assert.equal(backend.ok, true, backend.message);
    assert.deepEqual(JSON.parse(JSON.stringify(node)), backend.document);
    if (item.expected) assert.equal(node.source, item.expected);
    else {
      assert(node.source.includes(`title: "![fake](${url})"`));
      assert(node.source.includes(`"title":"<img src='${url}'>"`));
      assert(node.source.includes(`\`![literal](${url})\``));
      assert(node.source.includes(`![literal](${url})\r\n`));
    }
    assert.equal(w.MBB.portableDocumentImages(base, []).source, item.source);
    for (const mappings of [
      [{ from: url, to: '../escape.png' }],
      [{ from: 'not-an-image', to: target }],
    ]) {
      const code = mappings[0].from === url ? 'RESOURCE_MAP' : 'RESOURCE_TARGET';
      assert.throws(
        () => w.MBB.portableDocumentImages(base, mappings),
        (error) => error.code === code,
      );
      assert.equal(
        php({ mode: 'portable_images', base, mappings, documentId: base.documentId }).code,
        code,
      );
    }
    const broken = { ...base, serialized: base.serialized + '<p>unpaired</p>' };
    assert.throws(() => w.MBB.portableDocumentImages(broken, []));
    assert.equal(
      php({ mode: 'portable_images', base: broken, mappings: [], documentId: base.documentId }).ok,
      false,
    );
  }
  console.log(
    'Portable export: exact target ranges, shared references, HTML entities, Unicode, CRLF/CR, protected prose and paired provenance passed',
  );
} finally {
  close();
}
