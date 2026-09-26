// The pinned runtime supplies WordPress scripts; always load the candidate kernel under test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = process.env.MARKBRIDGE_TEST_RUNTIME;
assert(runtime, 'Set MARKBRIDGE_TEST_RUNTIME to a prepared runtime.');
const { JSDOM, VirtualConsole } = require(path.join(runtime, 'node_modules/jsdom'));
const dom = new JSDOM(fs.readFileSync(path.join(runtime, 'run/worker-bootstrap.html'), 'utf8'), {
  url: 'http://markbridge.invalid',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: new VirtualConsole(),
});
const w = dom.window;
w.fetch = () => new Promise(() => {});
w.TextEncoder = TextEncoder;
w.TextDecoder = TextDecoder;
w.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});
w.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
try {
  for (const script of w.document.querySelectorAll('script')) {
    let text = script.textContent;
    if (script.src) {
      const url = new URL(script.src);
      if (url.pathname === '/wp-admin/js/editor.min.js') continue;
      assert.equal(url.origin, 'http://markbridge.invalid');
      const file =
        url.pathname === '/wp-content/plugins/markdown-block-bridge/kernel.js'
          ? path.resolve(__dirname, '../plugin/kernel.js')
          : path.resolve(runtime, 'site', '.' + decodeURIComponent(url.pathname));
      if (!file.endsWith('/plugin/kernel.js'))
        assert(file.startsWith(path.resolve(runtime, 'site') + path.sep));
      text = fs.readFileSync(file, 'utf8');
    }
    vm.runInContext(text, dom.getInternalVMContext(), { timeout: 5000 });
  }
  const flatten = (blocks) =>
    blocks.flatMap((block) => [block, ...flatten(block.innerBlocks || [])]);
  const fixtures = [
    '- [ ] unfinished\n- [x] done\n- [X] uppercase\n',
    '- ordinary **item**\n- [ ] task with $x^2$ and `code`\n- ordinary tail\n',
    '3. [x] ordered\n4. [ ] next\n',
    '- [ ] parent\n  - [x] child\n  - ordinary nested\n- ordinary outer\n',
    '- ordinary parent\n  - [ ] nested task\n',
    '- [x] first paragraph\n\n  second **paragraph**\n\n  > quote\n\n  ```js\n  const a = "[x]";\n  ```\n- [ ] next\n',
    '> - [ ] quoted task\n> - [x] checked\n',
    '- [ ]\n- [x]\n',
  ];
  const fullRuntime = !!w.wp.blocks.getBlockType('core/paragraph')?.save;
  const serializations = [];
  for (const [i, source] of fixtures.entries()) {
    const blocks = w.MBB.toBlocks(source);
    const tasks = flatten(blocks).filter((block) => block.name === 'mbb/task-item');
    assert(tasks.length, `fixture ${i} must contain semantic task items`);
    assert(tasks.every((block) => typeof block.attributes.checked === 'boolean'));
    assert.equal(blocks[0].name, i === 6 ? 'core/quote' : 'mbb/list');
    if (i === 0)
      assert.equal(tasks.map((block) => block.attributes.checked).join(','), 'false,true,true');
    if (!fullRuntime) continue;
    const document = w.MBB.importDocument(source, `task-fixture-${i}`);
    assert.equal(w.MBB.exportDocument(document, document.serialized), source);
    serializations.push(document.serialized);
    const parsed = w.wp.blocks.parse(document.serialized);
    assert(flatten(parsed).every((block) => block.isValid !== false));
    const task = flatten(parsed).find((block) => block.name === 'mbb/task-item');
    const old = task.attributes.checked;
    task.attributes.checked = !old;
    const changed = w.wp.blocks.serialize(parsed);
    const markdown = w.MBB.exportDocument(document, changed);
    const reopened = w.MBB.importDocument(markdown, document.documentId);
    const reopenedTask = flatten(w.wp.blocks.parse(reopened.serialized)).find(
      (block) => block.name === 'mbb/task-item',
    );
    assert.equal(reopenedTask.attributes.checked, !old);
    assert.equal(reopened.documentId, document.documentId);
    // A previous paired revision remains a valid, exact source/block pair.
    assert.equal(w.MBB.exportDocument(document, document.serialized), source);
  }
  const literals = '- \\[x] escaped\n- `[ ] code`\n\n```text\n- [x] literal\n```\n';
  assert.equal(
    flatten(w.MBB.toBlocks(literals)).filter((block) => block.name === 'mbb/task-item').length,
    0,
  );
  assert.equal(w.MBB.toBlocks('- ordinary\n- next\n')[0].name, 'core/list');
  if (fullRuntime) {
    const legacySource = '- first\n\n  another paragraph\n- second\n';
    const legacy = w.MBB.importDocument(legacySource, 'legacy-list');
    assert.equal(w.MBB.exportDocument(legacy, legacy.serialized), legacySource);
    // Construct the old representation independently: a complex list item kept
    // its [x] marker as paragraph text before semantic task items existed.
    const oldTaskSource = '- [x] legacy task\n\n  second paragraph\n- ordinary\n';
    const oldTaskBlocks = [
      w.wp.blocks.createBlock('mbb/list', {}, [
        w.wp.blocks.createBlock('mbb/list-item', {}, [
          w.wp.blocks.createBlock('core/paragraph', { content: '[x] legacy task' }),
          w.wp.blocks.createBlock('core/paragraph', { content: 'second paragraph' }),
        ]),
        w.wp.blocks.createBlock('mbb/list-item', {}, [
          w.wp.blocks.createBlock('core/paragraph', { content: 'ordinary' }),
        ]),
      ]),
    ];
    const oldTaskSerialized = w.wp.blocks.serialize(oldTaskBlocks);
    assert(!oldTaskSerialized.includes('mbb/task-item'));
    assert.notEqual(w.wp.blocks.serialize(w.MBB.toBlocks(oldTaskSource)), oldTaskSerialized);
    const oldTaskDocument = {
      schema: 1,
      converter: '0.2.0',
      origin: 'markdown_import',
      documentId: 'legacy-task-list',
      source: oldTaskSource,
      serialized: oldTaskSerialized,
    };
    assert.equal(w.MBB.exportDocument(oldTaskDocument, oldTaskSerialized), oldTaskSource);
    assert.equal(
      w.MBB.importPairedDocument(oldTaskSource, oldTaskSerialized, 'legacy-task-list').serialized,
      oldTaskSerialized,
    );
    assert.throws(
      () =>
        w.MBB.importPairedDocument(
          oldTaskSource.replace('ordinary', 'altered'),
          oldTaskSerialized,
          'legacy-task-list',
        ),
      { code: 'SNAPSHOT_MISMATCH' },
    );
    assert.throws(
      () =>
        w.MBB.importPairedDocument(
          oldTaskSource,
          oldTaskSerialized.replace('ordinary', 'altered'),
          'legacy-task-list',
        ),
      { code: 'SNAPSHOT_MISMATCH' },
    );
    const { execFileSync } = require('node:child_process');
    const restore = (serialized) =>
      JSON.parse(
        execFileSync(process.execPath, [path.resolve(__dirname, '../plugin/worker.cjs'), runtime], {
          input: JSON.stringify({
            mode: 'paired_restore',
            source: oldTaskSource,
            serialized,
            documentId: 'legacy-task-list',
          }),
          encoding: 'utf8',
        }),
      );
    const restored = restore(oldTaskSerialized);
    assert.equal(restored.ok, true);
    assert.equal(restored.document.serialized, oldTaskSerialized);
    assert.equal(
      restore(oldTaskSerialized.replace('ordinary', 'altered')).code,
      'SNAPSHOT_MISMATCH',
    );
    const editedLegacy = w.wp.blocks.parse(oldTaskSerialized);
    editedLegacy[0].innerBlocks[1].innerBlocks[0].attributes.content = 'edited';
    const editedLegacyMarkdown = w.MBB.exportDocument(
      oldTaskDocument,
      w.wp.blocks.serialize(editedLegacy),
    );
    assert(editedLegacyMarkdown.includes('\\[x\\] legacy task'));
    assert(editedLegacyMarkdown.includes('edited'));
    assert.equal(
      w.wp.blocks.serialize(w.MBB.toBlocks(editedLegacyMarkdown)),
      w.wp.blocks.serialize(editedLegacy),
    );
    // Adjacent separate lists would merge in Markdown; reject instead of losing block structure.
    const adjacentLists = [...w.MBB.toBlocks('- ordinary\n'), ...w.MBB.toBlocks('- [ ] task\n')];
    assert.throws(() => w.MBB.toMarkdown(adjacentLists, { origin: 'markdown_import' }), {
      code: 'LOSSY_ROUNDTRIP',
    });
    // Tampering with saved markup must not silently change task state.
    const corrupt = serializations[0].replace('[ ]', '[x]');
    assert.throws(() => w.MBB.exportDocument(w.MBB.importDocument(fixtures[0], 'tamper'), corrupt));
    if (process.env.MARKBRIDGE_WORDPRESS_SOURCE) {
      const { execFileSync } = require('node:child_process');
      const result = execFileSync(
        'php',
        [path.join(__dirname, 'task-lists-kses.php'), process.env.MARKBRIDGE_WORDPRESS_SOURCE],
        {
          input: JSON.stringify(serializations),
          encoding: 'utf8',
        },
      );
      console.log(result.trim());
    }
    console.log(
      `${fixtures.length} task-list parse/serialize/edit/reopen and paired revision fixtures passed with real WordPress scripts.`,
    );
  } else {
    console.log(
      'Task-list AST and literal guards passed; actual WordPress serialization checks require a core-script runtime.',
    );
  }
} finally {
  w.close();
}
