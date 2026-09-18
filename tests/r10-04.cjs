const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('/var/lib/markbridge-0.7.0-rc.3/node_modules/jsdom');

const source = fs.readFileSync('plugin/editor-ui.js', 'utf8');

async function loadEditor(content = '', title = '') {
  const dom = new JSDOM(
    '<!doctype html><body class="post-new-php"><div class="edit-post-header-toolbar"></div></body>',
    { url: 'https://example.test/wp-admin/post-new.php', runScripts: 'outside-only' },
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
        getEditedPostAttribute: (key) => (key === 'title' ? title : 0),
        getEditedPostContent: () => content,
      }),
    },
  };
  dom.window.MBB_EDITOR = {
    root: 'https://example.test/wp-json/mbb/v1',
    nonce: 'test',
    postId: 0,
    canPublish: false,
    state: null,
  };
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

  console.log('R10-04 new-post entry, blank import and unsaved-content guards passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
