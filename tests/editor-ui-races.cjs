// Actual candidate editor-ui in JSDOM; modeled responses do not assert WordPress authorization.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const loadRuntime = require('./helpers/wp-runtime.cjs');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
(async () => {
  for (const [phase, status, code] of [
    ['preview', 409, 'conflict'],
    ['preview', 422, 'conversion_failed'],
    ['save', 409, 'conflict'],
    ['save', 500, 'save_failed'],
    ['cleanup', 200, null],
  ]) {
    const runtime = loadRuntime(),
      w = runtime.window,
      errors = [],
      requests = [];
    try {
      w.addEventListener('error', (event) => errors.push(event.error));
      w.structuredClone = structuredClone;
      // The tool screen has no mounted core/editor store; provide only its read projection.
      const select = w.wp.data.select;
      w.wp = {
        ...w.wp,
        data: {
          ...w.wp.data,
          select: (store, ...args) =>
            store === 'core/editor' ? { getEditedPostAttribute: () => 0 } : select(store, ...args),
        },
      };
      w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
        this.dispatchEvent(new w.Event('close'));
      };
      w.MBB_EDITOR = {
        postId: 0,
        state: null,
        root: 'http://merge-model.invalid/',
        nonce: 'synthetic-model-only',
        url: (route) => 'http://merge-model.invalid/' + route,
      };
      w.MBB_MATH = { style: '', preview: async (html) => html };
      w.MarkBridgeLocalRecovery = {
        changed() {},
        setPost() {},
        ticket() {
          return {};
        },
        async saved() {
          if (phase === 'cleanup') throw Error('Synthetic cleanup failure');
        },
      };
      const button = w.document.createElement('button');
      button.id = 'mbb-new';
      w.document.body.append(button);
      let release,
        waiting = null,
        held = false;
      w.fetch = async (url, options) => {
        const endpoint = new URL(url).pathname.slice(1),
          body = JSON.parse(options.body);
        requests.push({ endpoint, body });
        if (held && (endpoint === phase || (phase === 'cleanup' && endpoint === 'save')))
          await waiting;
        const failure = held && endpoint === phase && phase !== 'cleanup';
        const document = w.MBB.importDocument(body.source, body.documentId);
        return {
          ok: !failure,
          status: failure ? status : 200,
          async json() {
            if (failure) return { code, message: 'Synthetic delayed failure' };
            if (endpoint === 'save')
              return {
                post_id: 12,
                expected: 'c'.repeat(64),
                document,
                title: body.title,
                post_status: body.post_status,
                featured_media: 0,
              };
            return {
              document,
              title: body.title,
              post_status: body.post_status,
              featured_media: 0,
              before: '',
              html: '<p>Modeled preview</p>',
            };
          },
        };
      };
      w.eval(fs.readFileSync('plugin/editor-ui.js', 'utf8'));
      await tick();
      button.click();
      await tick();
      const el = (selector) => w.document.querySelector(selector);
      const input = (selector, value) => {
        el(selector).value = value;
        el(selector).dispatchEvent(new w.Event('input', { bubbles: true }));
      };
      input('#mbb-title', 'Title B1');
      input('#mbb-document-id', 'RACE-MODEL');
      input('#mbb-source', 'B1.\r\n');
      if (phase !== 'preview') {
        await el('#mbb-review').onclick();
        assert.equal(el('#mbb-save').disabled, false);
      }
      held = true;
      waiting = new Promise((resolve) => {
        release = resolve;
      });
      const pending = el(phase === 'preview' ? '#mbb-review' : '#mbb-save').onclick();
      await tick();
      input('#mbb-source', 'B2 latest.\n');
      input('#mbb-title', 'Title B2');
      input('#mbb-publication', 'pending');
      release();
      await pending;
      assert.equal(el('#mbb-source').value, 'B2 latest.\n');
      assert.equal(el('#mbb-title').value, 'Title B2');
      assert.equal(el('#mbb-publication').value, 'pending');
      assert.equal(el('#mbb-source').readOnly, false);
      assert.equal(el('#mbb-conflict').hidden, true);
      assert.equal(el('#mbb-save').disabled, true);
      assert.equal(
        el('#mbb-dialog > p[role=status]').textContent,
        phase === 'cleanup'
          ? 'The confirmed candidate was saved, but subsequent local recovery cleanup did not complete. Current input is preserved. Preview again or download it.'
          : phase === 'preview'
            ? 'The earlier candidate preview did not complete. New input is preserved. Preview the differences again.'
            : 'The earlier candidate was not confirmed as saved. New input is preserved. Preview the differences again.',
      );
      held = false;
      await el('#mbb-review').onclick();
      const fresh = requests.filter((request) => request.endpoint === 'preview').at(-1).body;
      assert.equal(fresh.source, 'B2 latest.\n');
      assert.equal(fresh.title, 'Title B2');
      assert.equal(fresh.post_status, 'pending');
      assert.equal(fresh.featured_media, 0);
      assert.equal(
        requests.filter((request) => request.endpoint === 'save').length,
        phase === 'preview' ? 0 : 1,
      );
      assert.equal(errors.length, 0);
    } finally {
      runtime.close();
    }
  }
  for (const rejectFinal of [false, true]) {
    const runtime = loadRuntime(),
      w = runtime.window,
      requests = [],
      errors = [];
    try {
      w.addEventListener('error', (event) => errors.push(event.error));
      w.structuredClone = structuredClone;
      w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      w.MBB_EDITOR = {
        postId: 0,
        canPublish: true,
        state: null,
        root: 'http://merge-model.invalid/',
        nonce: 'synthetic-model-only',
      };
      w.MBB_MATH = { style: '', preview: async (html) => html };
      const sourceA = 'First.\n\nSecond.\n';
      const make = (source, token, label, cover, status) => ({
        post_id: 12,
        expected: token.repeat(64),
        document: w.MBB.importDocument(source, 'RACE-TOOL'),
        title: label + ' title',
        post_status: status,
        featured_media: cover,
        source_managed: true,
        source_write_available: true,
        source_sha256: require('node:crypto').createHash('sha256').update(source).digest('hex'),
      });
      let current = make(sourceA, 'a', 'A', 1, 'draft'),
        sourceReads = 0,
        openingReads = 0;
      const envelope = (value) => ({
        schema: 1,
        document: value.document,
        expected: value.expected,
        title: value.title,
        post_status: value.post_status,
        featured_media: value.featured_media,
        source_managed: true,
        source_sha256: value.source_sha256,
        claims: { post: 12 },
        signature: 'f'.repeat(64),
      });
      const reply = (value, status = 200) => ({
        ok: status === 200,
        status,
        json: async () => value,
      });
      w.fetch = async (url, options) => {
        const endpoint = new URL(url).pathname.slice(1),
          body = options.body ? JSON.parse(options.body) : {};
        requests.push({ endpoint, body });
        if (endpoint === 'document') return reply(current);
        if (endpoint === 'source') {
          if (++sourceReads === 1)
            current = make(sourceA.replace('Second', 'C second'), 'c', 'C', 2, 'pending');
          return reply({
            expected: current.expected,
            source: current.document.source,
            source_sha256: current.source_sha256,
          });
        }
        if (endpoint === 'merge/open') {
          if (++openingReads > 1 && rejectFinal)
            return reply({ code: 'merge_conflict', message: 'Synthetic second race' }, 409);
          assert.equal(body.expected, current.expected);
          return reply(envelope(current));
        }
        if (endpoint === 'preview') {
          if (body.expected !== current.expected)
            return reply({ code: 'conflict', message: 'Synthetic later D' }, 409);
          return reply({
            document: w.MBB.importDocument(body.source, 'RACE-TOOL'),
            title: body.title,
            post_status: body.post_status,
            html: '<p>Preview</p>',
            before: current.document.source,
          });
        }
        if (endpoint === 'merge/latest') {
          assert.equal(body.opening.featured_media, 2);
          return reply(envelope(current));
        }
        if (endpoint === 'merge/adopt')
          return reply({
            schema: 1,
            saved: false,
            document: w.MBB.importDocument(body.source, 'RACE-TOOL'),
            newbase: current,
          });
        throw Error('Unexpected modeled endpoint ' + endpoint);
      };
      const button = w.document.createElement('button');
      button.className = 'mbb-open';
      button.dataset.post = '12';
      w.document.body.append(button);
      w.eval(fs.readFileSync('plugin/editor-ui.js', 'utf8'));
      await tick();
      button.click();
      for (let n = 0; n < 30 && w.document.querySelector('#mbb-review')?.disabled !== false; n++)
        await tick();
      await tick();
      const el = (selector) => w.document.querySelector(selector);
      assert.equal(openingReads, 2);
      assert.equal(el('#mbb-source').value, sourceA.replace('Second', 'C second'));
      assert.equal(el('#mbb-title').value, 'C title');
      assert.equal(el('#mbb-publication').value, 'pending');
      el('#mbb-source').value = sourceA.replace('First', 'Mine').replace('Second', 'C second');
      el('#mbb-source').dispatchEvent(new w.Event('input'));
      current = make(sourceA.replace('Second', 'D second'), 'd', 'D', 3, 'private');
      await el('#mbb-review').onclick();
      await tick();
      if (rejectFinal) {
        assert.equal(el('#mbb-merge-open').disabled, true);
      } else {
        assert.equal(el('#mbb-merge-open').disabled, false);
        await el('#mbb-merge-open').onclick();
        assert.equal(el('#mbb-merge-adopt').disabled, false);
        assert.equal(w.document.querySelectorAll('#mbb-merge-panel select').length, 0);
        await el('#mbb-merge-adopt').onclick();
        assert.equal(el('#mbb-title').value, 'D title');
        assert.equal(el('#mbb-publication').value, 'private');
        await el('#mbb-review').onclick();
        assert.equal(
          requests.filter((r) => r.endpoint === 'preview').at(-1).body.featured_media,
          3,
        );
      }
      assert.equal(
        requests.filter((r) => r.endpoint === 'save' || r.endpoint === 'source-save').length,
        0,
      );
      assert.equal(errors.length, 0);
    } finally {
      runtime.close();
    }
  }
  console.log(
    'Editor actual-script late preview/save failures preserve newer source/metadata; acknowledged save survives cleanup failure models passed',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
