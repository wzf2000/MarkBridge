const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const runtime = process.env.MARKBRIDGE_TEST_RUNTIME;
assert(runtime, 'Set MARKBRIDGE_TEST_RUNTIME to a prepared private runtime.');
const { JSDOM } = require(require('node:path').join(runtime, 'node_modules/jsdom'));

const source = fs.readFileSync('plugin/editor-ui.js', 'utf8');

async function loadEditor(content = '', title = '', options = {}) {
  const dom = new JSDOM(
    '<!doctype html><body class="post-new-php"><div class="edit-post-header-toolbar"></div></body>',
    {
      url: options.postId
        ? 'https://example.test/wp-admin/post.php'
        : 'https://example.test/wp-admin/post-new.php',
      runScripts: 'outside-only',
    },
  );
  const alerts = [];
  const opened = [];
  dom.window.alert = (message) => alerts.push(message);
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
    opened.push(this);
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  dom.window.wp = {
    data: {
      select: () => ({
        getCurrentPostId: () => options.postId || 0,
        getEditedPostAttribute: (key) => (key === 'title' ? title : 0),
        getEditedPostContent: () => content,
      }),
      dispatch: () => ({ lockPostSaving() {}, lockPostAutosaving() {} }),
      subscribe: () => () => {},
    },
  };
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(callback, 0);
  dom.window.structuredClone = structuredClone;
  dom.window.MBB_EDITOR = {
    root: 'https://example.test/wp-json/mbb/v1',
    nonce: 'test',
    postId: options.postId || 0,
    canPublish: false,
    state: options.state || null,
  };
  dom.window.fetch = options.fetch || (() => Promise.reject(new Error('unexpected request')));
  dom.window.MBB_MATH = { style: '', preview: async (html) => html };
  vm.runInContext(source, dom.getInternalVMContext());
  await new Promise((resolve) => dom.window.setTimeout(resolve, 150));
  return { dom, alerts, opened };
}

(async () => {
  const blank = await loadEditor();
  const button = blank.dom.window.document.querySelector('#mbb-new-post');
  assert(button, 'new-post import button is visible');
  button.click();
  assert.equal(blank.alerts.length, 0, 'blank draft does not alert');
  assert.equal(blank.opened.length, 1, 'blank draft opens import dialog');

  const dirty = await loadEditor('<!-- wp:paragraph --><p>Draft</p><!-- /wp:paragraph -->');
  dirty.dom.window.document.querySelector('#mbb-new-post').click();
  assert.equal(dirty.opened.length, 0, 'unsaved block content does not open import');
  assert.equal(dirty.alerts.length, 1, 'unsaved block content is protected');

  const titled = await loadEditor('', 'Un保存标题');
  titled.dom.window.document.querySelector('#mbb-new-post').click();
  assert.equal(titled.opened.length, 0, 'unsaved title does not open import');
  assert.equal(titled.alerts.length, 1, 'unsaved title is protected');

  const managedState = {
    post_id: 42,
    source_managed: true,
    source_write_available: true,
    expected: 'stored-token',
    title: 'Managed',
    post_status: 'draft',
    document: { documentId: 'managed-42', source: '# Stored Markdown', serialized: '' },
  };
  const unavailable = await loadEditor('', '', {
    postId: 42,
    state: managedState,
    fetch: async () => {
      throw new Error('source unavailable');
    },
  });
  await new Promise((resolve) => unavailable.dom.window.setTimeout(resolve, 180));
  unavailable.dom.window.document.querySelector('#mbb-markdown').click();
  await new Promise((resolve) => unavailable.dom.window.setTimeout(resolve, 20));
  assert.equal(
    unavailable.dom.window.document.querySelector('#mbb-source').value,
    '# Stored Markdown',
    'source failure falls back to stored Markdown instead of blank or stale text: ' +
      unavailable.dom.window.document.querySelector('#mbb-dialog [role="status"]').textContent,
  );
  assert.equal(
    unavailable.dom.window.document.querySelector('#mbb-save').disabled,
    true,
    'unavailable managed source remains read-only',
  );

  const fresh = await loadEditor('', '', {
    postId: 42,
    state: managedState,
    fetch: async (url) => ({
      ok: true,
      async json() {
        assert.match(url, /source\?post_id=42$/);
        return {
          expected: 'fresh-token',
          source_sha256: 'fresh-source-hash',
          source: '# Fresh Markdown',
        };
      },
    }),
  });
  await new Promise((resolve) => fresh.dom.window.setTimeout(resolve, 180));
  fresh.dom.window.document.querySelector('#mbb-markdown').click();
  await new Promise((resolve) => fresh.dom.window.setTimeout(resolve, 20));
  assert.equal(
    fresh.dom.window.document.querySelector('#mbb-source').value,
    '# Fresh Markdown',
    'fresh source content takes precedence over stored fallback',
  );

  console.log('R10-04 new-post guards and managed-source fallback reads passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
