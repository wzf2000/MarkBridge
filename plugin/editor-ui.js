(() => {
  const cfg = window.MBB_EDITOR;
  let base = null,
    mode = 'markdown',
    candidate = null,
    version = 0,
    busy = false;
  let dialog, source, title, docId, publication, status, diff, preview, save;
  const el = (tag, attrs = {}, text = '') => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    n.textContent = text;
    return n;
  };
  cfg.url = (route) => {
    const [name, query] = route.split('?');
    const u = new URL(cfg.root);
    if (u.searchParams.has('rest_route'))
      u.searchParams.set(
        'rest_route',
        u.searchParams.get('rest_route').replace(/\/$/, '') + '/' + name,
      );
    else u.pathname = u.pathname.replace(/\/$/, '') + '/' + name;
    if (query) for (const [k, v] of new URLSearchParams(query)) u.searchParams.set(k, v);
    return u.toString();
  };
  async function api(route, data) {
    const response = await fetch(cfg.url(route), {
      method: data ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const json = await response.json();
    if (!response.ok) throw Error(json.message || '请求失败');
    return json;
  }
  function invalidate() {
    version++;
    candidate = null;
    if (save) save.disabled = true;
  }
  function message(text, error = false) {
    status.textContent = text;
    status.className = error ? 'mbb-error' : 'mbb-status';
  }
  function controls() {
    dialog.querySelectorAll('button,input,textarea,select').forEach((b) => (b.disabled = busy));
    save.disabled = busy || !candidate || !!base?.source_managed;
    if (base?.source_managed) {
      source.readOnly = true;
      title.readOnly = true;
      publication.disabled = true;
    } else {
      source.readOnly = false;
      title.readOnly = false;
    }
  }
  function request() {
    return {
      post_id: base?.post_id || 0,
      documentId: docId.value,
      title: title.value,
      expected: base?.expected || null,
      mode,
      post_status: publication.value,
      featured_media:
        Number(base?.post_id) === Number(cfg.postId)
          ? (wp.data.select('core/editor').getEditedPostAttribute('featured_media') ??
            base?.featured_media ??
            0)
          : (base?.featured_media ?? 0),
      source: mode === 'blocks' ? null : source.value,
      serialized:
        mode === 'blocks'
          ? wp.blocks.serialize(wp.data.select('core/block-editor').getBlocks())
          : null,
    };
  }
  function showDiff(before, after) {
    diff.replaceChildren();
    const a = before.split('\n'),
      b = after.split('\n');
    let start = 0,
      endA = a.length,
      endB = b.length;
    while (start < Math.min(endA, endB) && a[start] === b[start]) start++;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA--;
      endB--;
    }
    diff.append(
      el(
        'p',
        {},
        start === a.length && start === b.length
          ? '正文无变化。'
          : `从第 ${start + 1} 行起：旧 ${endA - start} 行 → 新 ${endB - start} 行（含中间未变行）。`,
      ),
    );
    const grid = el('div', { class: 'mbb-diff-grid' });
    grid.append(
      el('pre', { class: 'mbb-before' }, a.slice(start, endA).join('\n')),
      el('pre', { class: 'mbb-after' }, b.slice(start, endB).join('\n')),
    );
    diff.append(grid);
  }
  async function review() {
    if (busy) return;
    busy = true;
    candidate = null;
    controls();
    message('正在由服务器校验并生成预览……');
    const serial = version;
    try {
      const payload = request();
      const result = await api('preview', payload);
      if (version !== serial) {
        message('内容已变化，请重新查看差异。');
        return;
      }
      candidate = payload;
      save.textContent =
        payload.post_status === 'publish'
          ? '确认公开发布'
          : payload.post_status === 'private'
            ? '确认私密发布'
            : payload.post_status === 'pending'
              ? '确认提交审核'
              : '确认保存草稿';
      showDiff(result.before, result.document.source);
      preview.srcdoc =
        '<!doctype html><html><head><meta charset="utf-8"><style>' +
        MBB_MATH.style +
        'body{font:16px/1.7 system-ui;padding:16px;overflow-wrap:anywhere}pre{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}img{max-width:100%}</style></head><body>' +
        (await MBB_MATH.preview(result.html)) +
        '</body></html>';
      message(
        '校验通过；目标状态：' +
          publication.selectedOptions[0].textContent +
          '。请检查差异和预览后确认。',
      );
    } catch (e) {
      message(e.message, true);
    } finally {
      busy = false;
      controls();
    }
  }
  async function persist() {
    if (busy || !candidate) return;
    busy = true;
    controls();
    message('正在保存两种表示……');
    try {
      const result = await api('save', candidate);
      message(result.noop ? '内容未变，无需重复写入。' : '已同时保存 Markdown 和区块。');
      window.location.assign(result.editor_url);
    } catch (e) {
      message(e.message, true);
      candidate = null;
    } finally {
      busy = false;
      controls();
    }
  }
  function build() {
    dialog = el('dialog', { id: 'mbb-dialog', 'aria-label': 'Markdown 与区块编辑' });
    const header = el('div', { class: 'mbb-dialog-header' });
    header.append(el('h2', {}, 'Markdown 与区块编辑'));
    const close = el('button', { type: 'button', 'aria-label': '关闭编辑桥' }, '关闭');
    close.onclick = () => dialog.close();
    header.append(close);
    dialog.append(header);
    const meta = el('div', { class: 'mbb-fields' });
    for (const [label, id] of [
      ['标题', 'mbb-title'],
      ['稳定文档 ID', 'mbb-document-id'],
    ]) {
      const l = el('label', {}, label);
      const n = el('input', { id, type: 'text' });
      n.addEventListener('input', invalidate);
      l.append(n);
      meta.append(l);
    }
    dialog.append(meta);
    title = meta.querySelector('#mbb-title');
    docId = meta.querySelector('#mbb-document-id');
    const stateLabel = el('label', {}, '保存为 ');
    publication = el('select', { id: 'mbb-publication' });
    for (const [value, label] of [
      ['draft', '草稿'],
      ['pending', '待审核'],
      ...(cfg.canPublish
        ? [
            ['publish', '公开发布'],
            ['private', '私密发布'],
          ]
        : []),
    ])
      publication.append(el('option', { value }, label));
    publication.onchange = invalidate;
    stateLabel.append(publication);
    dialog.append(stateLabel);
    const upload = el('label', {}, '上传 Markdown 文件 ');
    const file = el('input', {
      type: 'file',
      accept: '.md,.markdown,text/markdown,text/plain',
      id: 'mbb-upload',
    });
    file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      if (f.size > 1500000) {
        message('文件过大。', true);
        return;
      }
      source.value = await f.text();
      source.hidden = false;
      mode = 'upload';
      invalidate();
      message('文件已读取，尚未保存。请先查看差异。');
    };
    upload.append(file);
    dialog.append(upload);
    source = el('textarea', {
      id: 'mbb-source',
      'aria-label': 'Markdown 原文',
      spellcheck: 'false',
    });
    source.oninput = () => {
      mode = 'markdown';
      invalidate();
    };
    dialog.append(source);
    const actions = el('div', { class: 'mbb-actions' });
    const reviewButton = el('button', { type: 'button', id: 'mbb-review' }, '查看差异与预览');
    reviewButton.onclick = review;
    save = el('button', { type: 'button', id: 'mbb-save' }, '确认保存双格式');
    save.onclick = persist;
    actions.append(reviewButton, save);
    dialog.append(actions);
    status = el('p', { role: 'status' });
    diff = el('section', { 'aria-label': '修改差异' });
    preview = el('iframe', { title: '内置内容预览', sandbox: '' });
    dialog.append(status, diff, preview);
    document.body.append(dialog);
  }
  async function open(id, selectedMode = 'markdown') {
    if (!dialog) build();
    dialog.showModal();
    busy = true;
    candidate = null;
    version++;
    controls();
    message('正在读取服务器版本……');
    try {
      base = id
        ? id === cfg.postId
          ? structuredClone(cfg.state)
          : await api('document?post_id=' + id)
        : null;
      mode = selectedMode;
      title.value =
        selectedMode === 'blocks'
          ? wp.data.select('core/editor').getEditedPostAttribute('title')
          : base?.title || '';
      docId.value = base?.document.documentId || '';
      docId.readOnly = !!base;
      source.value = base?.document.source || '';
      publication.value = base?.post_status || 'draft';
      if (id && id === cfg.postId && selectedMode === 'markdown') {
        const current = wp.blocks.serialize(wp.data.select('core/block-editor').getBlocks());
        const converted = await api('preview', {
          post_id: id,
          expected: base.expected,
          mode: 'blocks',
          serialized: current,
          title: wp.data.select('core/editor').getEditedPostAttribute('title'),
        });
        source.value = converted.document.source;
        title.value = converted.title;
      }
      source.hidden = selectedMode === 'blocks';
      diff.replaceChildren();
      preview.srcdoc = '';
      message(
        base?.source_managed
          ? '此文由源文件同步：可查看原文和预览，保存请使用同步工具。'
          : selectedMode === 'blocks'
            ? '将当前区块转换回 Markdown 并预览，尚未保存。'
            : '编辑或上传 Markdown，再检查差异。',
      );
    } catch (e) {
      message(e.message, true);
    } finally {
      busy = false;
      controls();
    }
  }
  function setup() {
    document.querySelector('#mbb-new')?.addEventListener('click', () => open(0));
    document
      .querySelectorAll('.mbb-open')
      .forEach((b) => b.addEventListener('click', () => open(Number(b.dataset.post))));
    if (!Number(cfg.postId)) {
      if (document.body.classList.contains('post-new-php')) {
        const install = () => {
          const toolbar = document.querySelector(
            '.edit-post-header-toolbar, .edit-post-header__settings',
          );
          if (!toolbar || document.querySelector('#mbb-new-post')) return !!toolbar;
          const button = el(
            'button',
            { type: 'button', id: 'mbb-new-post', class: 'components-button is-secondary' },
            '导入 Markdown',
          );
          button.onclick = () => {
            const editor = wp.data.select('core/editor');
            const title = editor?.getEditedPostAttribute('title') || '';
            const content = editor?.getEditedPostContent() || '';
            if (title.trim() || content.trim()) {
              window.alert('当前新文章已有未保存内容，请先保存或清空后再导入 Markdown。');
              return;
            }
            open(0);
          };
          toolbar.prepend(button);
          return true;
        };
        if (!install()) {
          let attempts = 0;
          const timer = setInterval(() => {
            if (install() || ++attempts > 100) clearInterval(timer);
          }, 100);
        }
      }
      return;
    }
    const timer = setInterval(() => {
      const editor = wp.data.select('core/editor');
      if (!editor?.getCurrentPostId()) return;
      clearInterval(timer);
      wp.data.dispatch('core/editor').lockPostSaving('mbb-paired-save');
      wp.data.dispatch('core/editor').lockPostAutosaving('mbb-paired-save');
      const bar = el('div', { id: 'mbb-toolbar' });
      const a = el(
        'button',
        { type: 'button', id: 'mbb-markdown' },
        cfg.state?.source_managed ? 'Markdown 原文 / 预览' : 'Markdown 编辑 / 上传',
      );
      a.onclick = () => open(cfg.postId);
      const b = el(
        'button',
        { type: 'button', id: 'mbb-block-review' },
        cfg.state?.source_managed ? '区块预览' : '区块修改：预览并保存',
      );
      b.onclick = () => open(cfg.postId, 'blocks');
      const h = el('button', { type: 'button', id: 'mbb-history' }, '历史版本 / 恢复');
      h.onclick = () => window.MBB_REVISIONS.open(cfg.postId);
      bar.append(
        a,
        b,
        h,
        el('span', {}, cfg.state?.source_managed ? '正文由源文件同步' : '两种格式统一保存'),
      );
      document.body.append(bar);
      // Keep the toolbar inside the visible editor canvas, never over its settings sidebar.
      const placeBar = () => {
        const canvas = document.querySelector('.interface-interface-skeleton__content');
        if (!canvas) return;
        const bounds = canvas.getBoundingClientRect();
        let left = Math.max(0, bounds.left),
          right = Math.min(innerWidth, bounds.right);
        for (const sidebar of document.querySelectorAll('.interface-interface-skeleton__sidebar')) {
          const box = sidebar.getBoundingClientRect();
          if (box.width && box.height && box.right > left && box.left < right)
            right = Math.min(right, box.left);
        }
        const available = right - left - 24;
        bar.hidden = available < 240;
        const x = left + 12 + 'px',
          width = Math.max(0, available) + 'px';
        if (bar.style.left !== x) bar.style.left = x;
        if (bar.style.maxWidth !== width) bar.style.maxWidth = width;
      };
      let queued = false;
      const scheduleBar = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          placeBar();
        });
      };
      const layout = document.querySelector('.interface-interface-skeleton');
      if (layout)
        new MutationObserver(scheduleBar).observe(layout, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden'],
        });
      window.addEventListener('resize', scheduleBar);
      placeBar();
      const editingFingerprint = () => {
        const e = wp.data.select('core/editor');
        return JSON.stringify([
          e.getEditedPostContent(),
          e.getEditedPostAttribute('title'),
          e.getEditedPostAttribute('featured_media'),
        ]);
      };
      let previous = editingFingerprint();
      wp.data.subscribe(() => {
        const next = editingFingerprint();
        if (next !== previous) {
          previous = next;
          invalidate();
        }
      });
    }, 100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
