const assert = require('node:assert/strict');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const fixtures = require('./fixtures/technical-writing.json').cases;
const fail = (code, message) => {
  throw Error(code + ': ' + message);
};
const source = (name) => fixtures.find((item) => item.name === name).source;
const blocks = (source) =>
  w.wp.blocks.parse(w.MBB.importDocument(source, 'technical-model').serialized);
const plain = (value) => JSON.parse(JSON.stringify(value));
try {
  const counters = plain(w.MBB.technicalIndex(blocks(source('three-independent-statement-kinds'))));
  assert.deepEqual(
    counters.targets.map((item) => [item.kind, item.number]),
    [
      ['definition', 1],
      ['theorem', 1],
      ['proof', 1],
    ],
  );
  const bibliography = blocks(source('citation-order-and-unreferenced-entry'));
  assert.deepEqual(
    plain(w.MBB.technicalIndex(bibliography)).entries.map((entry) => [entry.key, entry.number]),
    [
      ['paper-a', 2],
      ['paper-b', 1],
      ['paper-c', 3],
    ],
  );
  function apply(tree, plan) {
    const updates = new Map(plan.patches.map((item) => [item.clientId, item.attributes]));
    return tree.map((block) => ({
      ...block,
      attributes: { ...block.attributes, ...updates.get(block.clientId) },
      innerBlocks: apply(block.innerBlocks || [], plan),
    }));
  }
  const objects = blocks(source('equation-and-atomic-reference')),
    before = JSON.stringify(objects);
  const plan = w.MBB.technicalRenamePlan(objects, 'label', 'eq-one', 'eq-renamed', fail);
  assert.equal(plan.affectedReferences, 1);
  assert.equal(plan.patches.length, 2);
  assert.equal(JSON.stringify(objects), before);
  const renamed = apply(objects, plan),
    serialized = w.wp.blocks.serialize(renamed),
    markdown = w.MBB.toMarkdown(renamed, { origin: 'markdown_import' });
  assert(serialized.includes('data-mbb-target="eq-renamed"'));
  assert(markdown.includes('eq-renamed'));
  assert.equal(w.MBB.importDocument(markdown, 'technical-model').serialized, serialized);
  const keyPlan = w.MBB.technicalRenamePlan(bibliography, 'key', 'paper-a', 'paper-renamed', fail);
  assert.equal(keyPlan.affectedReferences, 1);
  const keyBlocks = apply(bibliography, keyPlan);
  assert.equal(
    keyBlocks.find((b) => b.name === 'mbb/bibliography').attributes.entries[0].key,
    'paper-renamed',
  );
  const keyMarkdown = w.MBB.toMarkdown(keyBlocks, { origin: 'markdown_import' });
  assert(keyMarkdown.includes('paper-b,paper-renamed'));
  assert.throws(
    () => w.MBB.technicalRenamePlan(bibliography, 'key', 'paper-a', 'paper-b', fail),
    /already exists/,
  );
  assert.throws(
    () => w.MBB.technicalRenamePlan(objects, 'label', 'eq-one', '1-invalid', fail),
    /TECHNICAL_ID/,
  );
  const collision = [
    ...objects,
    w.wp.blocks.createBlock(
      'mbb/collapse',
      { id: 'existing-fold', title: 'Fold', open: false, version: 1 },
      [w.wp.blocks.createBlock('core/paragraph', { content: 'Body' })],
    ),
  ];
  assert.throws(
    () => w.MBB.technicalRenamePlan(collision, 'label', 'eq-one', 'existing-fold', fail),
    /already exists/,
  );
  const literal = w.wp.blocks.createBlock('core/paragraph', {
    content:
      '<code>&lt;span class="mbb-xref" data-mbb-target="eq-one" data-mbb-version="1">[eq-one]&lt;/span></code>',
  });
  assert.equal(
    w.MBB.technicalRenamePlan([...objects, literal], 'label', 'eq-one', 'eq-renamed', fail)
      .affectedReferences,
    1,
  );
  const wrapped = w.wp.blocks.createBlock('core/paragraph', {
    content: '<span style="color:red">' + w.MBB.referenceHTML('xref', ['eq-one']) + '</span>',
  });
  const wrappedPlan = w.MBB.technicalRenamePlan(
    [...objects, wrapped],
    'label',
    'eq-one',
    'eq-renamed',
    fail,
  );
  assert.equal(wrappedPlan.affectedReferences, 2);
  assert.equal(
    apply([wrapped], wrappedPlan)[0].attributes.content,
    '<span style="color:red">' + w.MBB.referenceHTML('xref', ['eq-renamed']) + '</span>',
  );
  const adjacentMarker = w.MBB.referenceHTML('xref', ['eq-one']);
  const adjacent = w.wp.richText.create({ html: adjacentMarker + adjacentMarker });
  adjacent.start = 2;
  adjacent.end = 2;
  assert.deepEqual(plain(w.MBB.technicalReferenceSelection(adjacent, 'xref', 'eq-one')), {
    start: 0,
    end: 8,
  });
  adjacent.start = 10;
  adjacent.end = 10;
  assert.deepEqual(plain(w.MBB.technicalReferenceSelection(adjacent, 'xref', 'eq-one')), {
    start: 8,
    end: 16,
  });
  for (const [kind, keys] of [
    ['bad', ['safe']],
    ['xref', []],
    ['xref', ['one', 'two']],
    ['cite', ['same', 'same']],
    ['cite', ['<script>']],
    ['xref', ['x" onclick="bad']],
    ['cite', Array.from({ length: 9 }, (_, i) => 'key-' + i)],
  ])
    assert.throws(() => w.MBB.referenceHTML(kind, keys), /closed technical-writing contract/);
  const duplicates = [
    ...objects,
    w.wp.blocks.createBlock(
      'mbb/statement',
      { id: 'eq-one', kind: 'proof', title: 'Proof', open: false, version: 1 },
      [w.wp.blocks.createBlock('core/paragraph', { content: 'Body' })],
    ),
  ];
  const diagnostics = plain(w.MBB.technicalDiagnostics(duplicates));
  assert(!diagnostics.validTargets.includes('eq-one'));
  assert(diagnostics.issues.some((issue) => issue.code === 'duplicate-id'));
  const dangling = w.wp.blocks.createBlock('core/paragraph', {
    content: w.MBB.referenceHTML('xref', ['missing']),
  });
  assert(
    plain(w.MBB.technicalDiagnostics([dangling])).issues.some(
      (issue) => issue.code === 'missing-target',
    ),
  );
  console.log(
    'Technical derived counters, bibliography order, immutable atomic rename patches, collisions and literal-code preservation passed',
  );
} finally {
  close();
}
