(() => {
  const cfg = window.MBB_EDITOR;
  if (!cfg) return;
  let dialog,
    status,
    format,
    preview,
    confirm,
    source,
    list,
    target = null,
    prepared = null,
    epoch = 0,
    pending = false;
  const el = (tag, attrs = {}, text = '') => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.textContent = text;
    return node;
  };
  function url(route) {
    if (typeof cfg.url === 'function') return cfg.url(route);
    const [name, query] = route.split('?');
    const value = new URL(cfg.root);
    if (value.searchParams.has('rest_route'))
      value.searchParams.set(
        'rest_route',
        value.searchParams.get('rest_route').replace(/\/$/, '') + '/' + name,
      );
    else value.pathname = value.pathname.replace(/\/$/, '') + '/' + name;
    if (query)
      for (const [key, item] of new URLSearchParams(query)) value.searchParams.set(key, item);
    return value.toString();
  }
  async function api(route, data, method = 'POST', binary = false) {
    const response = await fetch(url(route), {
      method,
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Error(error.message || '导出请求未完成，请检查权限与网络后重新准备。');
    }
    return binary
      ? {
          blob: await response.blob(),
          filename: response.headers
            .get('Content-Disposition')
            ?.match(/filename="([A-Za-z0-9_.-]+)"/)?.[1],
        }
      : response.json();
  }
  function controls() {
    preview.disabled = pending || !target;
    confirm.disabled = pending || !prepared;
    format.disabled = pending;
  }
  function discard(value = prepared) {
    if (value?.token) void api('export/' + value.token, null, 'DELETE').catch(() => {});
    if (value === prepared) prepared = null;
  }
  function close() {
    ++epoch;
    discard();
    target = null;
    pending = false;
    controls();
  }
  async function open(postId) {
    if (!dialog) setup();
    const session = ++epoch;
    discard();
    target = null;
    pending = true;
    source.value = '';
    list.replaceChildren();
    controls();
    if (!dialog.open) dialog.showModal();
    status.textContent = '正在核对已保存文章；未保存输入不会进入导出。';
    try {
      const value = await api('export/context?post_id=' + Number(postId), null, 'GET');
      if (session !== epoch || !dialog.open) return;
      if (
        value.post_id !== Number(postId) ||
        !/^[a-f0-9]{64}$/.test(value.expected || '') ||
        !value.documentId
      )
        throw Error('文章快照不完整。');
      target = { post_id: value.post_id, expected: value.expected };
      status.textContent =
        '导出当前服务器已保存的双格式文章。请准备清单并确认下载；编辑器未保存内容保持不变。';
    } catch (error) {
      if (session === epoch) status.textContent = error.message;
    } finally {
      if (session === epoch) {
        pending = false;
        controls();
      }
    }
  }
  async function review() {
    if (!target || pending) return;
    const session = ++epoch,
      chosen = format.value;
    discard();
    pending = true;
    controls();
    status.textContent = '正在准备导出清单…';
    try {
      const value = await api('export/prepare', { schema: 1, ...target, format: chosen });
      if (session !== epoch || !dialog.open) {
        discard(value);
        return;
      }
      if (
        value.schema !== 1 ||
        value.format !== chosen ||
        !/^[a-f0-9]{64}$/.test(value.token || '') ||
        !/^[a-f0-9]{64}$/.test(value.receipt || '') ||
        typeof value.projectedSource !== 'string' ||
        !Array.isArray(value.resources) ||
        !Array.isArray(value.retainedImages)
      )
        throw Error('导出清单不完整，未允许下载。');
      prepared = value;
      source.value = value.projectedSource;
      list.replaceChildren();
      for (const resource of value.resources)
        list.append(el('li', {}, `${resource.path} · ${resource.mime} · ${resource.bytes} bytes`));
      for (const item of value.retainedImages)
        list.append(el('li', {}, `${item.url}：${item.reason}`));
      status.textContent =
        chosen === 'markdown'
          ? '原始 Markdown 字节将完整下载，包括头部与代码换行。图片 URL 保留，图片不会打包。'
          : `ZIP 包含 ${value.resources.length} 张已核验图片；仅图片目标改为便携路径。外部或未关联图片保留 URL，请核对下方副本。清单不包含作者、私有笔记或源文件路径。`;
    } catch (error) {
      if (session === epoch) status.textContent = error.message;
    } finally {
      if (session === epoch) {
        pending = false;
        controls();
      }
    }
  }
  async function download() {
    if (!prepared || pending) return;
    const session = epoch,
      value = prepared;
    pending = true;
    controls();
    status.textContent = '正在重新鉴权并核验当前文章与图片…';
    try {
      const result = await api(
        'export/' + value.token + '/download',
        { schema: 1, receipt: value.receipt },
        'POST',
        true,
      );
      if (session !== epoch || !dialog.open) return;
      const object = URL.createObjectURL(result.blob),
        anchor = el('a', {
          href: object,
          download: result.filename || 'markbridge.' + (value.format === 'zip' ? 'zip' : 'md'),
        });
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(object), 1000);
      prepared = null;
      status.textContent = '已下载；已保存文章、源文件和未保存输入均未修改。';
    } catch (error) {
      if (session === epoch) {
        discard(value);
        status.textContent = error.message + ' 请重新准备导出。';
      }
    } finally {
      if (session === epoch) {
        pending = false;
        controls();
      }
    }
  }
  function setup() {
    if (dialog) return;
    dialog = el('dialog', { id: 'mbb-export-dialog', 'aria-label': '导出已保存文章' });
    dialog.append(
      el('h2', {}, '导出已保存文章'),
      el(
        'p',
        {},
        'Markdown 保留原始字节；ZIP 仅打包可验证的关联图片，并准备便携副本。此操作不保存编辑器输入。',
      ),
    );
    const label = el('label', { for: 'mbb-export-format' }, '导出格式');
    format = el('select', { id: 'mbb-export-format' });
    format.append(
      el('option', { value: 'markdown' }, 'Markdown 单文件'),
      el('option', { value: 'zip' }, 'Markdown 与图片 ZIP'),
    );
    if (cfg.exports?.zipAvailable === false) {
      format.options[1].disabled = true;
      dialog.append(el('p', {}, 'ZIP 所需可选环境不可用，Markdown 单文件仍可下载。'));
    }
    status = el('p', { role: 'status' });
    list = el('ul', { id: 'mbb-export-resources' });
    source = el('textarea', {
      id: 'mbb-export-projected-source',
      readonly: '',
      'aria-label': '导出正文副本',
    });
    preview = el('button', { id: 'mbb-export-preview', type: 'button' }, '准备导出与资源清单');
    confirm = el('button', { id: 'mbb-export-confirm', type: 'button' }, '确认下载');
    const cancel = el('button', { id: 'mbb-export-cancel', type: 'button' }, '取消导出');
    preview.onclick = review;
    confirm.onclick = download;
    cancel.onclick = () => dialog.close();
    dialog.addEventListener('close', close);
    format.onchange = () => {
      ++epoch;
      discard();
      source.value = '';
      list.replaceChildren();
      status.textContent = '格式已变更，请重新准备导出。';
      controls();
    };
    dialog.append(label, format, preview, confirm, cancel, status, list, source);
    document.body.append(dialog);
    const measured = new Set();
    const placeRecovery = () => {
      let top = window.innerHeight;
      for (const node of measured) {
        const bounds = node.getBoundingClientRect();
        const position = getComputedStyle(node).position;
        const bottomControl =
          position === 'fixed' &&
          (node.id === 'mbb-toolbar' || bounds.top >= window.innerHeight / 2);
        if (bottomControl && node.isConnected && bounds.width > 0 && bounds.height > 0)
          top = Math.min(top, bounds.top);
      }
      const clearance = Math.max(12, Math.ceil(window.innerHeight - top + 8));
      document.body.style.setProperty('--mbb-author-controls-clearance', clearance + 'px');
    };
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(placeRecovery) : null;
    const install = () => {
      const bar = document.querySelector('#mbb-toolbar');
      if (bar && cfg.postId && !document.querySelector('#mbb-export-open')) {
        const button = el('button', { id: 'mbb-export-open', type: 'button' }, '导出已保存文章');
        button.onclick = () => open(cfg.postId);
        bar.prepend(button);
      }
      for (const button of document.querySelectorAll('.mbb-export'))
        if (!button.dataset.mbbBound) {
          button.dataset.mbbBound = '1';
          button.onclick = () => open(button.dataset.post);
        }
      const current = new Set(document.querySelectorAll('#mbb-toolbar, #mbb-new-post'));
      for (const node of measured)
        if (!current.has(node)) {
          sizes?.unobserve(node);
          measured.delete(node);
        }
      for (const node of current)
        if (!measured.has(node)) {
          measured.add(node);
          sizes?.observe(node);
        }
      placeRecovery();
    };
    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', placeRecovery);
    window.visualViewport?.addEventListener('resize', placeRecovery);
    window.visualViewport?.addEventListener('scroll', placeRecovery);
  }
  window.MarkBridgeExport = { open };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
