const assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process'),
  path = require('node:path'),
  { window: w, close } = require('./helpers/wp-runtime.cjs')();
const relation = {
  schema: 1,
  prompt: 'question',
  options: [
    { key: 'a', target: 'option-a' },
    { key: 'b', target: 'option-b' },
  ],
  hints: ['hint-one', 'hint-two'],
  feedback: { correct: 'correct', incorrect: 'incorrect' },
  explanation: 'solution',
};
const partIds = [
  'question',
  'option-a',
  'option-b',
  'hint-one',
  'hint-two',
  'correct',
  'incorrect',
  'solution',
];
function source(activity = relation, edit = (body) => body, version = 2) {
  const attrs = {
    id: 'exercise',
    component: 'self-check-choice',
    componentVersion: '0.1.0',
    params: { correct: 'b' },
    ...(activity === undefined ? {} : { activity }),
  };
  return (
    `:::mbb:v${version} component ${JSON.stringify(attrs)}\n\n` +
    edit(
      partIds
        .map(
          (id, i) =>
            `:::mbb:v1 collapse ${JSON.stringify({ id, title: id, open: i < 3 })}\n\n` +
            (id === 'question'
              ? 'Question $x^2$ with **one** original body.'
              : id === 'solution'
                ? 'Full explanation.\n\n```js\nconst answer = 2;\n```'
                : id) +
            '\n\n:::mbb:end',
        )
        .join('\n\n'),
    ) +
    '\n\n:::mbb:end\n'
  );
}
const php = (payload) =>
  JSON.parse(
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
try {
  const raw = source(),
    doc = w.MBB.importDocument(raw, 'activity-fixture'),
    result = php({ mode: 'markdown', source: raw, documentId: doc.documentId });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.document.serialized, doc.serialized);
  assert.equal(w.MBB.exportDocument(doc, doc.serialized), raw);
  const navigation = w.MBB.sourceNavigation(raw, w.wp.blocks.parse(doc.serialized));
  assert(
    navigation.ranges.some(
      (range) =>
        range.blockPath.length === 1 &&
        raw.slice(range.start, range.end).startsWith(':::mbb:v2 component'),
    ),
    'Source navigation must locate the explicit v2 activity',
  );
  const blocks = w.wp.blocks.parse(doc.serialized);
  assert.equal(w.wp.blocks.serialize(blocks), doc.serialized);
  assert(blocks.every((b) => b.isValid !== false));
  // A text-only edit keeps bindings and the sole static body through both writers.
  blocks[0].innerBlocks[0].innerBlocks[0].attributes.content += ' Author edit.';
  const edited = w.wp.blocks.serialize(blocks),
    next = w.MBB.exportDocument(doc, edited),
    phpNext = php({ mode: 'blocks', base: doc, serialized: edited, documentId: doc.documentId });
  assert.equal(phpNext.ok, true, JSON.stringify(phpNext));
  assert.equal(phpNext.document.source, next);
  assert(next.includes(':::mbb:v2 component'));
  const invalid = [
    source({ ...relation, extra: true }),
    source({ ...relation, schema: '1' }),
    source({ ...relation, prompt: 'missing' }),
    source({
      ...relation,
      options: [
        { key: 'a', target: 'option-a' },
        { key: 'a', target: 'option-b' },
      ],
    }),
    source({ ...relation, explanation: 'question' }),
    source({ ...relation, hints: ['hint-one', 'hint-two', 'correct', 'incorrect'] }),
    source(relation, (body) =>
      body.replace(
        '"id":"question","title":"question","open":true',
        '"id":"question","title":"question","open":false',
      ),
    ),
    source(relation, (body) => body.replace('"id":"solution"', '"id":"removed-solution"')),
    source(relation, (body) => body.replace('"id":"solution"', '"id":"question"')),
    ...[false, true].map((open) =>
      source(
        relation,
        (body) =>
          ':::mbb:v1 collapse ' +
          JSON.stringify({ id: 'wrapper', title: 'Wrapper', open }) +
          '\n\n' +
          body.replace(
            ':::mbb:v1 collapse {"id":"option-a"',
            ':::mbb:end\n\n:::mbb:v1 collapse {"id":"option-a"',
          ),
      ),
    ),
    source(relation, (body) => body, 1),
  ];
  for (const raw of invalid) {
    assert.throws(
      () => w.MBB.importDocument(raw, 'activity-invalid'),
      undefined,
      raw.slice(0, 180),
    );
    assert.equal(php({ mode: 'markdown', source: raw, documentId: 'activity-invalid' }).ok, false);
  }
  // The wrapper must not acquire targets from a nested component.
  const nested = source(relation, (body) =>
    body.replace(
      /:::mbb:v1 collapse \{"id":"solution"[\s\S]*?:::mbb:end/,
      ':::mbb:v1 component {"id":"nested","component":"insertion-sort","componentVersion":"0.1.0","params":{}}\n\n:::mbb:v1 collapse {"id":"solution","title":"solution","open":false}\n\nNested explanation\n\n:::mbb:end\n\n:::mbb:end',
    ),
  );
  assert.throws(() => w.MBB.importDocument(nested, 'activity-nested'));
  assert.equal(php({ mode: 'markdown', source: nested, documentId: 'activity-nested' }).ok, false);

  const tree = w.wp.blocks.parse(doc.serialized),
    root = tree[0],
    solution = root.innerBlocks.find((b) => b.attributes.id === 'solution');
  const originalCode = 'const literal = "#py <span class=\"mbb-xref\">[eq-self]</span>";\n';
  const tabs = (id, py, js) =>
    w.wp.blocks.createBlock('mbb/code-tabs', {
      id,
      version: 1,
      defaultTab: py,
      tabs: [
        { id: py, title: 'Python', language: 'python', code: originalCode },
        { id: js, title: 'JavaScript', language: 'javascript', code: 'const x = 1;\n' },
      ],
    });
  solution.innerBlocks.push(
    tabs('code-one', 'py', 'js'),
    tabs('code-two', 'py-second', 'js-second'),
    w.wp.blocks.createBlock(
      'mbb/object',
      { version: 1, id: 'eq-self', kind: 'equation', caption: 'Local equation' },
      [w.wp.blocks.createBlock('mbb/math', { tex: '1+1=2' })],
    ),
  );
  const identity = {
    version: 1,
    namespace: 'S_' + '1'.repeat(32),
    document: 'D_' + '2'.repeat(32),
  };
  const marker = (namespace, target, kind) =>
    `<span data-mbb-target="${target}" data-mbb-version="2" data-mbb-namespace="${namespace}" data-mbb-document="${identity.document}" data-mbb-kind="${kind}" class="mbb-xref">[${target}]</span>`;
  const outside = marker('S_' + '3'.repeat(32), 'py', 'equation'),
    wrongKind = marker(identity.namespace, 'py', 'equation');
  solution.innerBlocks.push(
    w.wp.blocks.createBlock('core/paragraph', {
      content:
        '<a href="#py">Tab</a> <a href="#eq%2Dself">Encoded</a> ' +
        marker(identity.namespace, 'eq-self', 'equation') +
        ' ' +
        marker(identity.namespace, 'exercise', 'activity') +
        ' ' +
        outside +
        ' ' +
        wrongKind +
        ' ' +
        w.MBB.referenceHTML('xref', ['eq-self']),
    }),
  );
  const context = [w.wp.blocks.createBlock('mbb/identity', identity), root];
  w.MBB.toMarkdown(context, { origin: 'markdown_import' });
  const copied = w.MBB.copyActivity(context, root.clientId),
    all = [...context, ...copied.blocks];
  assert.notEqual(copied.blocks[0].attributes.id, root.attributes.id);
  const newSolution = copied.blocks[0].innerBlocks.find(
      (b) => b.attributes.id === copied.blocks[0].attributes.activity.explanation,
    ),
    newTabs = newSolution.innerBlocks.filter((b) => b.name === 'mbb/code-tabs');
  assert.equal(newTabs.length, 2);
  for (const tab of newTabs) {
    assert.equal(tab.attributes.defaultTab, tab.attributes.tabs[0].id);
    assert.equal(tab.attributes.tabs[0].code, originalCode);
  }
  assert.equal(new Set(newTabs.flatMap((b) => b.attributes.tabs.map((t) => t.id))).size, 4);
  const paragraph = newSolution.innerBlocks.at(-1).attributes.content;
  assert(paragraph.includes('href="#' + newTabs[0].attributes.tabs[0].id + '"'));
  assert(paragraph.includes(outside), 'Foreign tuple was rewritten');
  assert(
    paragraph.includes(marker(identity.namespace, copied.blocks[0].attributes.id, 'activity')),
    'Owned activity object reference was not remapped',
  );
  assert(paragraph.includes(wrongKind), 'Tab anchor was treated as an equation identity');
  assert(!paragraph.includes('href="#eq%2Dself"'), 'Encoded owned fragment was not remapped');
  assert(
    !paragraph.includes(marker(identity.namespace, 'eq-self', 'equation')),
    'Owned typed reference was not remapped',
  );
  const copiedSource = w.MBB.toMarkdown(all, { origin: 'markdown_import' }),
    copiedPHP = php({ mode: 'markdown', source: copiedSource, documentId: 'copy-tabs' });
  assert.equal(copiedPHP.ok, true, JSON.stringify(copiedPHP));
  assert.equal(copiedPHP.document.serialized, w.wp.blocks.serialize(all));
  for (const open of [false, true]) {
    const moved = w.wp.blocks.parse(doc.serialized),
      first = moved[0].innerBlocks.shift();
    moved[0].innerBlocks.unshift(
      w.wp.blocks.createBlock(
        'mbb/collapse',
        { id: 'outer', title: 'Outer wrapper', open, version: 1 },
        [first],
      ),
    );
    const serialized = w.wp.blocks.serialize(moved);
    assert.throws(() => w.MBB.exportDocument(doc, serialized));
    assert.equal(
      php({ mode: 'blocks', base: doc, serialized, documentId: doc.documentId }).ok,
      false,
      'Indirect prompt accepted',
    );
  }
  console.log(
    'Activity v2: closed roles, local ownership, unique keys/targets, static text editing and native/PHP/Node round trips passed',
  );
} finally {
  close();
}
