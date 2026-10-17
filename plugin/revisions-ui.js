(() => {
  const E = (error) => globalThis.MBBI18n?.error(error) ?? error.message;
  const T = (message) => globalThis.MBBI18n?.t(message) ?? message;
  const F = (message, ...values) => {
    let next = 0;
    return String(message).replace(/%%|%(?:(\d+)\$)?([sd])/g, (token, index, kind) => {
      if (token === '%%') return '%';
      const value = values[index ? Number(index) - 1 : next++];
      return kind === 'd' ? String(Number(value)) : String(value ?? '');
    });
  };

  const cfg = window.MBB_EDITOR;
  let dialog,
    list,
    status,
    diff,
    preview,
    confirm,
    review,
    base,
    rows = [],
    candidate = null,
    busy = false;
  const el = (tag, attrs = {}, text = '') => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.textContent = text;
    return n;
  };
  async function api(route, data) {
    const r = await fetch(cfg.url(route), {
      method: data ? 'POST' : 'GET',
      headers: { 'X-WP-Nonce': cfg.nonce, 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const j = await r.json();
    if (!r.ok) throw Error(j.message || T('Request failed'));
    return j;
  }
  const message = (text, error = false) => {
    status.textContent = text;
    status.className = error ? 'mbb-error' : 'mbb-status';
  };
  function controls() {
    dialog.querySelectorAll('button,select').forEach((x) => (x.disabled = busy));
    confirm.disabled = busy || !candidate;
    review.disabled = busy || !list.value;
  }
  function invalidate() {
    candidate = null;
    preview.hidden = true;
    preview.srcdoc = '';
    diff.replaceChildren();
    controls();
  }
  function dirty() {
    return cfg.postId && wp.data.select('core/editor')?.isEditedPostDirty();
  }
  function build() {
    dialog = el('dialog', { id: 'mbb-revisions-dialog', 'aria-label': T('Restore revision') });
    dialog.addEventListener('cancel', (e) => {
      if (busy) e.preventDefault();
    });
    const header = el('div', { class: 'mbb-dialog-header' }),
      close = el(
        'button',
        { type: 'button', id: 'mbb-revision-close' },
        T('Close without restoring'),
      );
    close.onclick = () => dialog.close();
    header.append(el('h2', {}, T('Restore revision')), close);
    dialog.append(header);
    dialog.append(
      el(
        'p',
        {},
        T(
          "Restore the selected revision's title, Markdown, and blocks. The current saved version is preserved in history. Article ID, author, and visibility remain unchanged.",
        ),
      ),
    );
    const label = el('label', {}, T('Choose a revision (latest 100)'));
    list = el('select', { id: 'mbb-revision-list' });
    label.append(list);
    dialog.append(label);
    list.onchange = () => {
      invalidate();
      message(T('View differences first. Restoration requires successful verification.'));
    };
    const actions = el('div', { class: 'mbb-actions' });
    review = el(
      'button',
      { type: 'button', id: 'mbb-revision-review' },
      T('View restoration differences and preview'),
    );
    confirm = el(
      'button',
      { type: 'button', id: 'mbb-revision-confirm' },
      T('Confirm restoration of both representations'),
    );
    review.onclick = compare;
    confirm.onclick = restore;
    actions.append(review, confirm);
    dialog.append(actions);
    status = el('p', { role: 'status' });
    diff = el('section', { 'aria-label': T('Restoration differences') });
    preview = el('iframe', { title: T('Revision content preview'), sandbox: '', hidden: '' });
    dialog.append(status, diff, preview);
    document.body.append(dialog);
  }
  async function open(id) {
    if (!dialog) build();
    if (dialog.open) return;
    dialog.showModal();
    list.replaceChildren();
    busy = true;
    invalidate();
    message(T('Reading revisions…'));
    try {
      if (dirty())
        throw Error(
          T(
            'The block editor has unsaved changes. Save through the bridge before restoring a revision.',
          ),
        );
      base = id === cfg.postId ? structuredClone(cfg.state) : await api('document?post_id=' + id);
      rows = (await api('revisions?post_id=' + id)).revisions;
      list.append(el('option', { value: '' }, T('Choose a revision')));
      for (const r of rows)
        list.append(
          el(
            'option',
            { value: r.id },
            `${r.date} · #${r.id} · ${r.title}${r.restored_from ? T(' · Restored from #') + r.restored_from : ''}${r.paired ? '' : T(' · Older record awaiting verification')}`,
          ),
        );
      message(
        rows.length
          ? T('Choose a revision and view its differences. Nothing has been restored yet.')
          : T('No selectable revision exists.'),
      );
    } catch (e) {
      message(E(e), true);
    } finally {
      busy = false;
      controls();
    }
  }
  async function compare() {
    if (busy || !list.value) return;
    busy = true;
    invalidate();
    message(T('Validating both representations of the revision…'));
    try {
      if (dirty()) throw Error(T('There are unsaved changes. Save before restoring.'));
      const v = rows.find((r) => String(r.id) === list.value);
      const payload = {
        post_id: base.post_id,
        expected: base.expected,
        mode: 'restore',
        revision_id: v.id,
        expected_revision: v.expected_revision,
      };
      const result = await api('preview', payload);
      payload.adapter_digest = result.adapter_digest;
      diff.replaceChildren();
      diff.append(el('p', {}, F(T('Title: %1$s → %2$s'), result.before_title, result.title)));
      const a = result.before.split('\n'),
        b = result.document.source.split('\n');
      let start = 0,
        ae = a.length,
        be = b.length;
      while (start < Math.min(ae, be) && a[start] === b[start]) start++;
      while (ae > start && be > start && a[ae - 1] === b[be - 1]) {
        ae--;
        be--;
      }
      diff.append(
        el(
          'p',
          {},
          start === a.length && start === b.length
            ? T('The body is identical.')
            : F(
                T(
                  'From line %1$s: current %2$s lines → revision %3$s lines (including unchanged lines between changes).',
                ),
                start + 1,
                ae - start,
                be - start,
              ),
        ),
      );
      const grid = el('div', { class: 'mbb-diff-grid' });
      grid.append(
        el('pre', { class: 'mbb-before' }, a.slice(start, ae).join('\n')),
        el('pre', { class: 'mbb-after' }, b.slice(start, be).join('\n')),
      );
      diff.append(grid);
      preview.srcdoc =
        '<!doctype html><meta charset="utf-8"><style>' +
        MBB_MATH.style +
        (cfg.teachingStyle || '') +
        'body{font:16px/1.7 system-ui;padding:16px;overflow-wrap:anywhere}pre{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}img{max-width:100%}</style>' +
        (await MBB_MATH.preview(result.html));
      preview.hidden = false;
      candidate = result.identity_restore && result.identity_restore !== 'exact' ? null : payload;
      if (result.identity_restore === 'adopt-history') {
        const adopt = el(
          'button',
          { type: 'button' },
          T('Copy revision content into the current identity'),
        );
        adopt.onclick = async () => {
          try {
            const prepared = await api('references/prepare', {
              ...payload,
              action: 'adopt-history',
            });
            dialog.close();
            await window.MBBReferences.adopt(prepared, base);
          } catch (error) {
            message(E(error), true);
          }
        };
        diff.append(adopt);
        message(
          T(
            'This revision predates document identity. The exact historical pair is read-only; prepare an explicit candidate to retain the current identity.',
          ),
        );
        return;
      }
      if (result.identity_restore === 'incompatible') {
        message(
          T(
            'The historical identity differs. Compare the exact revision without changing the current identity.',
          ),
        );
        return;
      }
      message(T('Both representations match. Check the differences and confirm restoration.'));
    } catch (e) {
      message(E(e), true);
    } finally {
      busy = false;
      controls();
    }
  }
  async function restore() {
    if (busy || !candidate) return;
    busy = true;
    controls();
    message(T('Restoring both representations together…'));
    try {
      if (dirty()) throw Error(T('There are unsaved changes. Save before restoring.'));
      const r = await api('save', candidate);
      window.location.assign(r.editor_url);
    } catch (e) {
      candidate = null;
      message(E(e), true);
    } finally {
      busy = false;
      controls();
    }
  }
  window.MBB_REVISIONS = { open };
  function setup() {
    document
      .querySelectorAll('.mbb-history')
      .forEach((b) => (b.onclick = () => open(Number(b.dataset.post))));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
