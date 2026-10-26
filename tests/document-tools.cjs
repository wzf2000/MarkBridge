// SDK session model: no WordPress, browser, database or filesystem writes.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.handlers = {};
    this.attrs = {};
    this.open = false;
    this.content = {};
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  removeAttribute(k) {
    delete this.attrs[k];
  }
  append(...nodes) {
    for (const n of nodes) {
      this.children.push(n);
      n.parent = this;
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(name, cb) {
    (this.handlers[name] ||= []).push(cb);
  }
  emit(name, event = {}) {
    for (const cb of this.handlers[name] || []) cb(event);
  }
  contains(target) {
    return this === target || this.children.some((n) => n.contains?.(target));
  }
  closest() {
    return this.parent;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.emit('close');
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
  }
}
const tick = () => new Promise((r) => setImmediate(r));
(async () => {
  const body = new Node('body'),
    document = new Node('document');
  document.body = body;
  document.createElement = (tag) => new Node(tag);
  const context = vm.createContext({
    document,
    crypto,
    TextEncoder,
    structuredClone,
    Date,
    File: class File {},
    MBB_MATH: { preview: async (html) => html },
    MBBSourceTools: { frameDocument: () => '<static>' },
  });
  vm.runInContext(
    fs.readFileSync('plugin/document-tools.js', 'utf8') +
      '\nglobalThis.install = MBBCreateDocumentTools;',
    context,
  );
  let stamp = 'a',
    dirty = false,
    disposed = 0,
    applied = 0,
    hold,
    release;
  let failure = null;
  const calls = [];
  const core = context.install({
    stamp: () => stamp,
    clean: () => !dirty,
    context: () => ({ post_id: 1, expected: 'a'.repeat(64) }),
    diff: (host, before, after) => {
      host.textContent = before + after;
    },
    styles: () => '',
    apply: () => {
      applied++;
    },
    api: async (route, payload) => {
      calls.push(route);
      if (route.endsWith('/preview') && failure) throw failure;
      if (hold) {
        hold = false;
        await new Promise((r) => {
          release = r;
        });
      }
      if (route.endsWith('capture'))
        return {
          source: '\ufeffA\r\n',
          serialized: 'blocks',
          documentId: 'Doc',
          identity: { namespace: 'x', document: 'y' },
          sourceSha256: 's',
          serializedSha256: 'b',
          receipt: 'private',
        };
      return {
        before: '\ufeffA\r\n',
        html: '<p>B</p>',
        document: { source: payload.source, serialized: 'next' },
      };
    },
  });
  const sdk = context.MarkBridgeDocumentTools;
  const menu = new Node('details');
  core.menu(menu);
  sdk.registerTool('review', {
    label: 'Review',
    render(host) {
      host.append(new Node('draft'));
      return () => disposed++;
    },
  });
  assert.throws(() => sdk.registerTool('review', {}));
  menu.children[0].children[0].onclick();
  await tick();
  let opening = await sdk.capture();
  assert.equal(opening.source, '\ufeffA\r\n');
  assert(Object.isFrozen(opening));
  assert(Object.isFrozen(opening.identity));
  assert(!('receipt' in opening));
  assert(sdk.isCurrent(opening.openingToken));
  const prior = opening;
  opening = await sdk.capture();
  assert(!sdk.isCurrent(prior.openingToken));
  assert(sdk.isCurrent(opening.openingToken));
  const previewsBeforeErrors = calls.filter((r) => r.endsWith('/preview')).length;
  for (const code of [
    'UNSUPPORTED_BLOCK',
    'document_identity',
    'document_request',
    'component_params',
    'html_policy',
  ]) {
    failure = Object.assign(Error('Editable candidate rejected'), { status: 422, code });
    await assert.rejects(
      sdk.propose({ openingToken: opening.openingToken, source: 'bad suggestion' }),
    );
    assert(
      sdk.isCurrent(opening.openingToken),
      'candidate error keeps decisions available: ' + code,
    );
  }
  for (const [status, code] of [
    [422, 'component_base'],
    [422, 'identity'],
    [403, 'export_forbidden'],
    [409, 'document_candidate'],
    [409, 'adapter_conflict'],
  ]) {
    failure = Object.assign(Error('Baseline unavailable'), { status, code });
    await assert.rejects(
      sdk.propose({ openingToken: opening.openingToken, source: 'bad suggestion' }),
    );
    assert(
      !sdk.isCurrent(opening.openingToken),
      'baseline/permission/receipt expires all decisions',
    );
    failure = null;
    opening = await sdk.capture();
  }
  failure = null;
  const rejectedPreviews =
    calls.filter((r) => r.endsWith('/preview')).length - previewsBeforeErrors;
  const pending = sdk.propose({ openingToken: opening.openingToken, source: 'B' });
  await tick();
  assert.equal(body.children.length, 2);
  body.children[1].children.at(-1).onclick();
  assert.equal((await pending).applied, false);
  assert.equal(disposed, 0);
  assert(sdk.isCurrent(opening.openingToken));
  dirty = true;
  assert(!sdk.isCurrent(opening.openingToken));
  dirty = false;
  assert(!sdk.isCurrent(opening.openingToken));
  opening = await sdk.capture();
  document.emit('input', { target: new Node('native-input') });
  assert(!sdk.isCurrent(opening.openingToken));
  hold = true;
  const late = sdk.capture();
  await tick();
  body.children[0].close();
  release();
  await assert.rejects(late);
  assert.equal(disposed, 1);
  menu.children[0].children[0].onclick();
  await tick();
  opening = await sdk.capture();
  const apply = sdk.propose({ openingToken: opening.openingToken, source: 'B' });
  await tick();
  await body.children[1].children.at(-2).onclick();
  assert.equal((await apply).applied, true);
  assert.equal(applied, 1);
  assert.equal(disposed, 2);
  assert.equal(calls.filter((r) => r.endsWith('/preview')).length, 3 + rejectedPreviews);
  assert(!calls.some((r) => r.includes('save')));
  assert(!sdk.isCurrent(opening.openingToken));
  let handed;
  context.MarkBridgeBatch = {
    open: (files) => {
      handed = files;
    },
  };
  const files = vm.runInContext('[new File()]', context);
  sdk.importFiles(files);
  assert.equal(handed, files);
  assert.throws(() => sdk.importFiles([]));
  assert.throws(() => sdk.importFiles([{}]));
  console.log('document-tools session model passed');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
