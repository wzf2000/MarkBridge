// Pure native-body provenance model. No editor runtime or browser required.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const context = vm.createContext({ Date });
vm.runInContext(
  fs.readFileSync('plugin/native-document-candidate.js', 'utf8') +
    '\nglobalThis.create = MBBCreateNativeDocumentCandidate;',
  context,
);
let counter = 0,
  now = 1000,
  postId = 7,
  expected = 'saved',
  content,
  mode = 'visual',
  entityBlocks,
  blocks = [{ clientId: 'old', text: 'old' }],
  memory;
const serialize = (value) => JSON.stringify(value.map((b) => b.text));
const original = blocks;
const source = '\ufeffnew-literal-marker\r\n';
assert.equal(source.charCodeAt(0), 0xfeff);
assert(source.includes('\r\n'));
const document = { source, serialized: '["new-literal-marker"]' };
const opening = { context: { post_id: 7, expected: 'saved' }, receipt: 'signed', expires: 2000 };
memory = context.create({
  view: () => ({
    postId,
    expected,
    blocks,
    mode,
    entityBlocks: entityBlocks === undefined ? blocks : entityBlocks,
    content: content === undefined ? serialize(entityBlocks || blocks) : content,
  }),
  serialize,
  parse: (value) => JSON.parse(value).map((text) => ({ text, clientId: 'new-' + ++counter })),
  apply: (value) => {
    blocks = value;
    memory.changed();
  },
  encode: (value) => Buffer.from(value).toString('base64'),
  now: () => now,
});
assert.deepEqual(Object.keys(memory.request({ content: serialize(blocks) })), []); // Cancel creates no provenance.
assert.throws(
  () => memory.validate({ source: '\ufeffold\r\n', serialized: '["old"]' }),
  (e) => e.code === 'document_source_only',
);
assert.equal(blocks, original);
memory.adopt(document, opening);
const adopted = blocks;
let payload = memory.request({ content: serialize(blocks) });
assert.equal(Buffer.from(payload.mbb_document_candidate.sourceBase64, 'base64').toString(), source);
assert.equal(payload.mbb_document_candidate.receipt, 'signed');
blocks = original;
memory.changed(); // Native Undo: ordinary saved source, no attachment.
assert.equal(Object.keys(memory.request({ content: serialize(blocks) })).length, 0);
blocks = adopted;
memory.changed(); // Native Redo: same adopted client IDs and exact body.
assert(memory.request({ content: serialize(blocks) }).mbb_document_candidate);
now = 2000;
assert.throws(
  () => memory.request({ content: serialize(blocks) }),
  (e) => e.code === 'document_native_candidate',
);
now = 1000;
assert.throws(
  () => memory.request({ title: 'metadata-only' }),
  (e) => e.code === 'document_native_candidate',
);
blocks = [{ ...adopted[0], text: 'ordinary body edit' }];
memory.changed();
blocks = adopted;
memory.changed();
assert.throws(
  () => memory.request({ content: serialize(blocks) }),
  'third body permanently invalidates provenance and blocks fallback',
);
blocks = original;
memory.changed();
assert.equal(
  Object.keys(memory.request({ content: serialize(blocks) })).length,
  0,
  'full Undo to saved original needs no candidate attachment',
);
blocks = original;
memory.adopt(document, opening);
const sameTextOtherIds = blocks.map((b) => ({ ...b, clientId: 'other' }));
blocks = sameTextOtherIds;
memory.changed();
assert.throws(
  () => memory.request({ content: serialize(blocks) }),
  'same bytes cannot revive different client IDs',
);
blocks = original;
memory.adopt(document, opening);
expected = 'external';
memory.changed();
expected = 'saved';
assert.throws(
  () => memory.request({ content: serialize(blocks) }),
  'expected changes cannot revive provenance',
);
blocks = original;
memory.adopt(document, opening);
postId = 8;
memory.changed();
postId = 7;
assert.equal(
  Object.keys(memory.request({ content: serialize(blocks) })).length,
  0,
  'post switches cannot revive provenance',
);
blocks = original;
memory.adopt(document, opening);
content = 'code editor buffer changed';
memory.changed();
content = undefined;
assert.throws(
  () => memory.request({ content: serialize(blocks) }),
  'ordinary code buffer edits invalidate provenance without fallback',
);
blocks = original;
memory.adopt(document, opening);
memory.clear();
assert.equal(
  Object.keys(memory.request({ content: serialize(blocks) })).length,
  0,
  'successful save clears provenance',
);
console.log('native document candidate provenance model passed');

// Apply B -> Undo A -> successful metadata/original save -> Redo B must not
// fall back to canonical Markdown, even if Gutenberg retained its Redo branch.
blocks = original;
memory.adopt(document, opening);
const unsavedB = blocks;
blocks = original;
memory.changed();
assert.equal(Object.keys(memory.request({ title: 'metadata on A' })).length, 0);
memory.saved('saved-A-next', false);
expected = 'saved-A-next';
assert.equal(Object.keys(memory.request({ content: serialize(blocks) })).length, 0);
blocks = unsavedB;
memory.changed();
assert.throws(
  () => memory.request({ content: serialize(blocks) }),
  'Redo of never-saved B remains blocked after A was saved',
);
blocks = original.map((block) => ({ ...block, text: 'ordinary new edit of A' }));
memory.changed();
assert.equal(
  Object.keys(memory.request({ content: serialize(blocks) })).length,
  0,
  'ordinary A editing without B client IDs remains unchanged',
);
memory.saved('saved-A-again', false);
expected = 'saved-A-again';
blocks = unsavedB;
memory.changed();
assert.throws(
  () => memory.request({ content: serialize(blocks) }),
  'later ordinary saves cannot erase the abandoned B marker',
);
memory.clear();
expected = 'saved';
blocks = original;
memory.adopt(document, opening);
const actualProof = memory.request({ content: serialize(blocks) });
assert(actualProof.mbb_document_candidate);
memory.saved('saved-B', true);
expected = 'saved-B';
assert.equal(
  Object.keys(memory.request({ content: serialize(blocks) })).length,
  0,
  'saving B itself clears its pending proof',
);
console.log('native original-save/Redo tombstone model passed');

// Real Gutenberg Undo/Redo updates core-data before its block-editor projection.
// Two complete byte/recursive-ID endpoints may diverge temporarily, never save.
function freshAdoption() {
  memory.clear();
  expected = 'saved';
  postId = 7;
  mode = 'visual';
  content = undefined;
  entityBlocks = undefined;
  blocks = original;
  memory.adopt(document, opening);
  return blocks;
}
const transitionB = freshAdoption();
entityBlocks = original; // Undo has reached core-data; block-editor still holds B.
memory.changed();
assert.throws(
  () => memory.request({ content: serialize(original) }),
  (e) => e.code === 'document_native_transition',
  'saving during Undo transition is rejected without consuming provenance',
);
memory.changed(); // More than one subscription/microtask may observe the split.
blocks = original;
memory.changed();
assert.equal(Object.keys(memory.request({ content: serialize(original) })).length, 0);
entityBlocks = transitionB; // Redo core-data has B; block-editor still holds A.
memory.changed();
assert.throws(
  () => memory.request({ content: serialize(transitionB) }),
  (e) => e.code === 'document_native_transition',
);
blocks = transitionB;
memory.changed();
assert(memory.request({ content: serialize(transitionB) }).mbb_document_candidate);
// A transition may also return to its starting endpoint without becoming a third body.
entityBlocks = original;
memory.changed();
entityBlocks = transitionB;
memory.changed();
assert(memory.request({ content: serialize(transitionB) }).mbb_document_candidate);

// Every relaxing condition is required, and observing a failure is permanent.
for (const mutate of [
  () => {
    mode = 'text';
    entityBlocks = original;
  },
  () => {
    entityBlocks = null;
    content = serialize(original);
  },
  () => {
    mode = undefined;
  },
  () => {
    entityBlocks = [{ ...original[0], clientId: 'unknown-original-id' }];
  },
  () => {
    entityBlocks = [
      { ...original[0], innerBlocks: [{ clientId: 'unknown-entity-child', text: '' }] },
    ];
  },
  () => {
    entityBlocks = [{ ...original[0], clientId: undefined }];
  },
  () => {
    entityBlocks = [{ ...original[0], text: 'unreviewed entity body' }];
  },
  () => {
    entityBlocks = original;
    content = serialize(blocks);
  },
  () => {
    entityBlocks = original;
    expected = 'external-baseline';
  },
]) {
  const b = freshAdoption();
  mutate();
  memory.changed();
  mode = 'visual';
  expected = 'saved';
  entityBlocks = b;
  blocks = b;
  content = serialize(b);
  memory.changed();
  assert.throws(
    () => memory.request({ content: serialize(b) }),
    (e) => e.code === 'document_native_candidate',
    'unknown projection/mode/body cannot revive B by returning to its bytes',
  );
  blocks = original;
  entityBlocks = original;
  content = serialize(original);
  memory.changed();
  assert.equal(
    Object.keys(memory.request({ content: serialize(original) })).length,
    0,
    'complete original A remains a safe way back after invalidation',
  );
}

// A user typing an exact endpoint in code mode cannot masquerade as native history.
const codeB = freshAdoption();
mode = 'text';
entityBlocks = null; // Core PostTextEditor onChange explicitly clears blocks.
content = serialize(original);
memory.changed();
mode = 'visual';
entityBlocks = codeB;
blocks = codeB;
content = serialize(codeB);
assert.throws(() => memory.request({ content: serialize(codeB) }));

// IDs are recursive, even when a third block projection has equal serialized bytes.
const nestedB = freshAdoption();
blocks = [{ ...nestedB[0], innerBlocks: [{ clientId: 'unregistered-child', text: '' }] }];
entityBlocks = original;
content = serialize(original);
memory.changed();
blocks = nestedB;
entityBlocks = nestedB;
content = serialize(nestedB);
assert.throws(() => memory.request({ content: serialize(nestedB) }));

// Save A -> Redo B is blocked at the first (core-data-only) half of Redo too.
const abandonedB = freshAdoption();
blocks = original;
entityBlocks = original;
content = serialize(original);
memory.changed();
memory.saved('saved-A-transition', false);
expected = 'saved-A-transition';
entityBlocks = abandonedB;
content = serialize(abandonedB);
memory.changed();
assert.throws(() => memory.request({ content: serialize(abandonedB) }));

// Missing optional WordPress APIs do not throw before adoption; adoption fails closed.
memory.clear();
mode = undefined;
entityBlocks = null;
assert.doesNotThrow(() => memory.changed());
assert.equal(Object.keys(memory.request({ title: 'ordinary update' })).length, 0);
assert.throws(
  () => memory.validate(document),
  (e) => e.code === 'document_native_candidate',
);
console.log('native cross-store transition provenance model passed');
