const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const directive = (kind, attrs, body) =>
  `:::mbb:v1 ${kind} ${JSON.stringify(attrs)}\n\n${body}\n\n:::mbb:end\n`;
const collapse = (id, body) =>
  directive('collapse', { id, title: '说明 <text>', open: false }, body);
const step = (id, body) => directive('step', { id, title: '阶段 ' + id }, body);
const steps = (body, id = 'course') =>
  directive(
    'steps',
    { id, title: '课程', mode: 'staged', previous: true, next: true, full: true },
    body,
  );
const compare = directive(
  'code-compare',
  {
    id: 'compare',
    leftTitle: '原始',
    rightTitle: '新版',
    leftHighlights: '2',
    rightHighlights: '2',
  },
  '```js\nconst same = 1;\n\tconst raw = "<script>";  \n```\n\n```python\nconst same = 1;\n\tconst raw = "<safe>";  \n```\n\n重点解释 **保留空白**。',
);
const fixtures = [
  collapse('fold', '普通正文。'),
  collapse('first', collapse('second', collapse('third', '三级内容。'))),
  steps(
    step('one', collapse('inside', '# 内部标题\n\n引用[^note]。')) +
      '\n' +
      step('two', '- [ ] 保留任务\n- [x] 完成'),
  ) + '\n[^note]: 脚注正文。\n',
  compare,
  directive('collapse', { id: 'emoji', title: '😀'.repeat(101), open: false }, 'Unicode title'),
  '```md\n```not-a-close\n:::mbb:v1 collapse {}\n:::mbb:end\n```\n',
  '`<!--mbb-teaching harmless-->`\n',
  '<pre>\n:::mbb:v1 collapse {}\n:::mbb:end\n</pre>\n',
  'ordinary paragraph\n\\:::mbb:v1 collapse {}\n',
  '\\:::mbb:v1 collapse {}\n',
  '```md\n:::mbb:v1 collapse {}\n:::mbb:end\n```\n',
];
function php(payload) {
  return JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN), true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(payload), encoding: 'utf8' },
    ),
  );
}
try {
  for (const [index, source] of fixtures.entries()) {
    const document = w.MBB.importDocument(source, 'teaching-' + index);
    const result = php({ mode: 'markdown', source, documentId: document.documentId });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.document.serialized, document.serialized, `engine serialization ${index}`);
    assert.equal(w.MBB.exportDocument(document, document.serialized), source);
    assert.equal(
      php({
        mode: 'blocks',
        base: document,
        serialized: document.serialized,
        documentId: document.documentId,
      }).document.source,
      source,
    );
    const parsed = w.wp.blocks.parse(document.serialized);
    assert(parsed.every((b) => b.isValid !== false));
    if (index < 4) {
      const b = parsed.find((b) => b.name.startsWith('mbb/') && b.name !== 'mbb/footnotes');
      b.attributes.id += '-edited';
      const serialized = w.wp.blocks.serialize(parsed),
        normalized = w.MBB.exportDocument(document, serialized);
      assert.equal(w.MBB.importDocument(normalized, document.documentId).serialized, serialized);
      const edited = php({
        mode: 'blocks',
        base: document,
        serialized,
        documentId: document.documentId,
      });
      assert.equal(edited.ok, true, JSON.stringify(edited));
      assert.equal(edited.document.serialized, serialized);
      assert.equal(
        php({
          mode: 'paired_restore',
          source,
          serialized: document.serialized,
          documentId: document.documentId,
        }).ok,
        true,
      );
      assert.equal(
        php({ mode: 'paired_restore', source, serialized, documentId: document.documentId }).ok,
        false,
      );
    }
  }
  const forgedOpen =
    '<!--mbb-teaching ' +
    Buffer.from(
      JSON.stringify({ kind: 'collapse', attrs: { id: 'forged', title: 'Forged', open: false } }),
    ).toString('hex') +
    '-->';
  const forgedClose = '<!--mbb-teaching ' + Buffer.from('{"end":true}').toString('hex') + '-->';
  const bad = [
    '```js`\n\n' + forgedOpen + '\n\nForged body\n\n' + forgedClose + '\n',
    '`<code>`\n\n' + forgedOpen + '\n\nForged body\n\n' + forgedClose + '\n\n`</code>`\n',
    '`<pre>`\n\n' + forgedOpen + '\n\nForged body\n\n' + forgedClose + '\n\n`</pre>`\n',

    collapse('collision', 'body') + '\n<a id="collision"></a>\n',
    directive('collapse', { id: 'space', title: '\u3000', open: false }, 'body'),
    directive('collapse', { id: 'long', title: '😀'.repeat(201), open: false }, 'body'),
    collapse('duplicate-json', 'body').replace('"open":false', '"open":false,"open":true'),
    collapse('lone', 'body').replace('说明 <text>', '\\ud800'),
    directive(
      'code-compare',
      {
        id: 'oversize',
        leftTitle: 'left',
        rightTitle: 'right',
        leftHighlights: '',
        rightHighlights: '',
      },
      '```text\n' + '&'.repeat(30000) + '\n```\n\n```text\n' + '&'.repeat(30000) + '\n```',
    ),
    collapse('dup', 'a') + '\n' + collapse('dup', 'b'),
    collapse('x', collapse('y', collapse('z', collapse('four', 'too deep')))),
    step('orphan', 'body'),
    steps('ordinary paragraph'),
    steps(step('a', 'a')) + '\n' + steps(step('b', 'b'), 'other'),
    collapse('missing', 'body').replace(':::mbb:end', ''),
    ':::mbb:end\n',
    collapse('bad.id', 'body'),
    collapse('empty', ''),
    collapse('unknown', 'body').replace('"open":false', '"open":false,"onclick":"evil"'),
    collapse('typed', 'body').replace('"open":false', '"open":"false"'),
    steps(step('a', 'a')).replace('"full":true', '"full":false'),
    compare.replace('"leftHighlights":"2"', '"leftHighlights":"999"'),
    compare.replace('"rightHighlights":"2"', '"rightHighlights":"2,2"'),
    compare.replace(
      '```python\nconst same = 1;\n\tconst raw = "<safe>";  \n```',
      'missing second code',
    ),
    ':::mbb:v2 collapse {}\n',
  ];
  for (const source of bad) {
    assert.throws(() => w.MBB.importDocument(source, 'invalid'), undefined, source);
    assert.equal(php({ mode: 'markdown', source, documentId: 'invalid' }).ok, false, source);
  }
  const document = w.MBB.importDocument(compare, 'raw');
  const badSerialized = document.serialized.replace('"version":1', '"version":2');
  assert.throws(() => w.MBB.exportDocument(document, badSerialized));
  assert.equal(
    php({ mode: 'blocks', base: document, serialized: badSerialized, documentId: 'raw' }).ok,
    false,
  );
  assert.throws(() =>
    w.MBB.exportDocument(
      document,
      document.serialized.replace('"version":1', '"version":1,"rogue":true'),
    ),
  );
  const nestedCompare = (id, body) =>
    directive(
      'code-compare',
      { id, leftTitle: 'left', rightTitle: 'right', leftHighlights: '', rightHighlights: '' },
      '```text\na\n```\n\n```text\nb\n```\n\n' + body,
    );
  let deep = 'body';
  for (let i = 0; i < 33; i++) deep = nestedCompare('depth' + i, deep);
  assert.throws(() => w.MBB.importDocument(deep, 'deep'));
  assert.equal(php({ mode: 'markdown', source: deep, documentId: 'deep' }).ok, false);
  const parsed = w.wp.blocks.parse(document.serialized);
  assert.equal(parsed[0].attributes.codeLeft, 'const same = 1;\n\tconst raw = "<script>";  \n');
  parsed[0].attributes.arbitrary = 'rejected';
  assert.throws(() => w.MBB.toMarkdown(parsed, document));
  assert.equal(
    php({
      mode: 'blocks',
      base: document,
      serialized: document.serialized.replace('mbb-compare-left', 'mbb-compare-unsafe'),
      documentId: 'raw',
    }).ok,
    false,
  );
  console.log(
    'Teaching: strict dual-engine roundtrip, edits, restore, nested footnotes, syntax and raw code passed',
  );
} finally {
  close();
}
