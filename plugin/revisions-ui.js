(() => {
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
    if (!r.ok) throw Error(j.message || '请求失败');
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
    preview.srcdoc = '';
    diff.replaceChildren();
    controls();
  }
  function dirty() {
    return cfg.postId && wp.data.select('core/editor')?.isEditedPostDirty();
  }
  function build() {
    dialog = el('dialog', { id: 'mbb-revisions-dialog', 'aria-label': '恢复历史版本' });
    dialog.addEventListener('cancel', (e) => {
      if (busy) e.preventDefault();
    });
    const header = el('div', { class: 'mbb-dialog-header' }),
      close = el('button', { type: 'button', id: 'mbb-revision-close' }, '关闭，不恢复');
    close.onclick = () => dialog.close();
    header.append(el('h2', {}, '恢复历史版本'), close);
    dialog.append(header);
    dialog.append(
      el(
        'p',
        {},
        '恢复所选版本的标题、Markdown 和区块；当前已保存版本会保留在历史记录中。文章 ID、作者和可见性保持不变。',
      ),
    );
    const label = el('label', {}, '选择历史版本（最近 100 条）');
    list = el('select', { id: 'mbb-revision-list' });
    label.append(list);
    dialog.append(label);
    list.onchange = () => {
      invalidate();
      message('请选择查看差异，校验通过后才能恢复。');
    };
    const actions = el('div', { class: 'mbb-actions' });
    review = el('button', { type: 'button', id: 'mbb-revision-review' }, '查看恢复差异与预览');
    confirm = el('button', { type: 'button', id: 'mbb-revision-confirm' }, '确认恢复两种格式');
    review.onclick = compare;
    confirm.onclick = restore;
    actions.append(review, confirm);
    dialog.append(actions);
    status = el('p', { role: 'status' });
    diff = el('section', { 'aria-label': '恢复差异' });
    preview = el('iframe', { title: '历史版本内容预览', sandbox: '' });
    dialog.append(status, diff, preview);
    document.body.append(dialog);
  }
  async function open(id) {
    if (!dialog) build();
    if (dialog.open) return;
    dialog.showModal();
    list.replaceChildren();
    candidate = null;
    busy = true;
    controls();
    diff.replaceChildren();
    preview.srcdoc = '';
    message('正在读取历史版本……');
    try {
      if (dirty()) throw Error('区块编辑器有未保存修改，请先用编辑桥保存，再恢复历史版本。');
      base = id === cfg.postId ? structuredClone(cfg.state) : await api('document?post_id=' + id);
      rows = (await api('revisions?post_id=' + id)).revisions;
      list.append(el('option', { value: '' }, '请选择历史版本'));
      for (const r of rows)
        list.append(
          el(
            'option',
            { value: r.id },
            `${r.date} · #${r.id} · ${r.title}${r.restored_from ? ' · 恢复自 #' + r.restored_from : ''}${r.paired ? '' : ' · 旧记录待校验'}`,
          ),
        );
      message(rows.length ? '选择版本后查看差异；此时尚未恢复。' : '没有可选择的历史版本。');
    } catch (e) {
      message(e.message, true);
    } finally {
      busy = false;
      controls();
    }
  }
  async function compare() {
    if (busy || !list.value) return;
    candidate = null;
    busy = true;
    controls();
    message('正在校验历史版本的两种格式……');
    try {
      if (dirty()) throw Error('有未保存修改，请先保存后再恢复。');
      const v = rows.find((r) => String(r.id) === list.value);
      const payload = {
        post_id: base.post_id,
        expected: base.expected,
        mode: 'restore',
        revision_id: v.id,
        expected_revision: v.expected_revision,
      };
      const result = await api('preview', payload);
      candidate = payload;
      diff.replaceChildren();
      diff.append(el('p', {}, `标题：${result.before_title} → ${result.title}`));
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
            ? '正文相同。'
            : `第 ${start + 1} 行起：当前 ${ae - start} 行 → 历史 ${be - start} 行（含中间未变行）。`,
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
        'body{font:16px/1.7 system-ui;padding:16px;overflow-wrap:anywhere}pre{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}img{max-width:100%}</style>' +
        (await MBB_MATH.preview(result.html));
      message('两种格式校验一致。请检查差异，再确认恢复。');
    } catch (e) {
      message(e.message, true);
    } finally {
      busy = false;
      controls();
    }
  }
  async function restore() {
    if (busy || !candidate) return;
    busy = true;
    controls();
    message('正在同时恢复两种格式……');
    try {
      if (dirty()) throw Error('有未保存修改，请先保存后再恢复。');
      const r = await api('save', candidate);
      window.location.assign(r.editor_url);
    } catch (e) {
      candidate = null;
      message(e.message, true);
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
