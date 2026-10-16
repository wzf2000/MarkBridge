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
  if (!cfg) return;
  let dialog,
    status,
    format,
    preview,
    confirm,
    source,
    htmlPreview,
    previewURL = null,
    cancelPreviewLoad = null,
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
      throw Error(
        E(error) ||
          T(
            'The export request did not complete. Check permissions and the network, then prepare again.',
          ),
      );
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
    format.disabled = pending && format.value !== 'html';
    source.hidden = format.value === 'html';
    dialog.classList.toggle('mbb-export-html', format.value === 'html');
  }
  function clearHTMLPreview() {
    cancelPreviewLoad?.();
    cancelPreviewLoad = null;
    if (htmlPreview) {
      htmlPreview.querySelector('iframe')?.remove();
      htmlPreview.hidden = true;
    }
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
  }
  async function showHTMLPreview(blob, cancelled) {
    if (!(blob instanceof Blob) || blob.size > 33554432)
      throw Error(T('The static export descriptor exceeds its budget'));
    const text = await blob.text();
    if (cancelled()) return false;
    const doc = new DOMParser().parseFromString(text, 'text/html');
    // This is a read-only preview copy. The separately rebuilt download retains links.
    for (const node of doc.querySelectorAll('[href]')) {
      if (!/^#[^\x00-\x20\x7f]+$/.test(node.getAttribute('href'))) node.removeAttribute('href');
    }
    const csp = doc.createElement('meta');
    csp.httpEquiv = 'Content-Security-Policy';
    csp.content =
      "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri about:; form-action 'none'";
    const base = doc.createElement('base');
    base.href = 'about:srcdoc';
    doc.head.prepend(csp, base);
    const previewHTML = '<!doctype html>' + doc.documentElement.outerHTML.replace(/\r/g, '&#13;');
    const previewBlob = new Blob([previewHTML], { type: 'text/html;charset=utf-8' });
    if (cancelled()) return false;
    clearHTMLPreview();
    previewURL = URL.createObjectURL(previewBlob);
    const frame = el('iframe', {
      title: T('Static HTML preview'),
      sandbox: '',
      referrerpolicy: 'no-referrer',
      src: previewURL,
      // A fixed srcdoc base keeps # links within an opaque sandbox. Chromium blocks
      // blob: fragment navigation there; src remains the legacy no-srcdoc fallback.
      srcdoc: previewHTML,
    });
    htmlPreview.hidden = false;
    const loaded = new Promise((resolve) => {
      const finish = (value) => {
        clearTimeout(timer);
        frame.onload = frame.onerror = null;
        if (cancelPreviewLoad === abort) cancelPreviewLoad = null;
        resolve(value);
      };
      const abort = () => finish(false);
      const timer = setTimeout(abort, 10000);
      cancelPreviewLoad = abort;
      frame.onload = () => finish(true);
      frame.onerror = abort;
    });
    htmlPreview.append(frame);
    return (await loaded) && !cancelled();
  }
  function discard(value = prepared) {
    if (value?.token) void api('export/' + value.token, null, 'DELETE').catch(() => {});
    if (value === prepared) {
      prepared = null;
      clearHTMLPreview();
    }
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
    clearHTMLPreview();
    list.replaceChildren();
    controls();
    if (!dialog.open) dialog.showModal();
    status.textContent = T(
      'Verifying the saved article. Unsaved input is not included in the export.',
    );
    try {
      const value = await api('export/context?post_id=' + Number(postId), null, 'GET');
      if (session !== epoch || !dialog.open) return;
      if (
        value.post_id !== Number(postId) ||
        !/^[a-f0-9]{64}$/.test(value.expected || '') ||
        !value.documentId
      )
        throw Error(T('The article snapshot is incomplete.'));
      target = { post_id: value.post_id, expected: value.expected };
      status.textContent = T(
        "Export the article's current saved paired representations. Prepare the manifest and confirm the download. Unsaved editor input is unchanged.",
      );
    } catch (error) {
      if (session === epoch) status.textContent = E(error);
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
    clearHTMLPreview();
    source.value = '';
    list.replaceChildren();
    pending = true;
    controls();
    status.textContent = T('Preparing the export manifest…');
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
        throw Error(T('The export manifest is incomplete. Download was not allowed.'));
      prepared = value;
      if (chosen === 'html') {
        if (!window.MarkBridgeStaticExport?.build)
          throw Error(T('The static HTML exporter is unavailable. Prepare again.'));
        status.textContent = T('Typesetting the complete offline article…');
        if (new TextEncoder().encode(value.projectedSource).length > 33554432)
          throw Error(T('The static export descriptor exceeds its budget'));
        const cancelled = () => session !== epoch || !dialog.open || format.value !== chosen;
        const blob = await window.MarkBridgeStaticExport.build(JSON.parse(value.projectedSource), {
          cancelled,
        });
        if (cancelled()) {
          discard(value);
          return;
        }
        if (!(await showHTMLPreview(blob, cancelled))) {
          if (!cancelled())
            throw Error(
              T('The static HTML preview could not be loaded. Prepare the export again.'),
            );
          discard(value);
          return;
        }
      } else source.value = value.projectedSource;
      list.replaceChildren();
      for (const resource of value.resources)
        list.append(el('li', {}, `${resource.path} · ${resource.mime} · ${resource.bytes} bytes`));
      for (const item of value.retainedImages)
        list.append(el('li', {}, `${item.url}：${item.reason}`));
      status.textContent =
        chosen === 'markdown'
          ? T(
              'Original Markdown bytes, including header and code newlines, will be downloaded. Image URLs are preserved; images are not bundled.',
            )
          : chosen === 'portable-zip'
            ? T(
                'This preview creates a normalized cross-site copy without old attachment IDs. Import creates new local attachments and associations. The saved original is unchanged.',
              )
            : chosen === 'html'
              ? T(
                  'Static HTML embeds verified local images and typeset formulas for offline reading. External images become links and are not fetched; unverified local images are refused. All stages and code versions are included; interactive demonstrations use their static fallback.',
                )
              : F(
                  T(
                    'The ZIP includes %1$s verified images. Only image targets are replaced with portable paths. External or unrelated images retain their URLs. Verify the copy below. The manifest contains no author, private notes, or source file paths.',
                  ),
                  value.resources.length,
                );
    } catch (error) {
      if (session === epoch) {
        discard();
        clearHTMLPreview();
        status.textContent = E(error);
      }
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
    status.textContent = T('Rechecking permissions, the article, and images…');
    try {
      const result = await api(
        'export/' + value.token + '/download',
        { schema: 1, receipt: value.receipt },
        'POST',
        true,
      );
      if (session !== epoch || !dialog.open) return;
      let blob = result.blob;
      if (value.format === 'html') {
        if (!window.MarkBridgeStaticExport?.build)
          throw Error(T('The static HTML exporter is unavailable. Prepare again.'));
        status.textContent = T('Typesetting the complete offline article…');
        if (blob.size > 33554432) throw Error(T('The static export descriptor exceeds its budget'));
        const descriptor = JSON.parse(await blob.text());
        blob = await window.MarkBridgeStaticExport.build(descriptor, {
          cancelled: () => session !== epoch || !dialog.open,
        });
        if (session !== epoch || !dialog.open) return;
      }
      const object = URL.createObjectURL(blob),
        anchor = el('a', {
          href: object,
          download:
            value.format === 'html'
              ? 'markbridge.html'
              : result.filename ||
                'markbridge.' + (['zip', 'portable-zip'].includes(value.format) ? 'zip' : 'md'),
        });
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(object), 1000);
      prepared = null;
      clearHTMLPreview();
      status.textContent = T(
        'Downloaded. The saved article, source file, and unsaved input are unchanged.',
      );
    } catch (error) {
      if (session === epoch) {
        discard(value);
        status.textContent = E(error) + T(' Prepare the export again.');
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
    dialog = el('dialog', { id: 'mbb-export-dialog', 'aria-label': T('Export saved article') });
    dialog.append(
      el('h2', {}, T('Export saved article')),
      el(
        'p',
        {},
        T(
          'Markdown preserves original bytes. ZIP bundles only verifiable related images and prepares a portable copy. This does not save editor input.',
        ),
      ),
    );
    const label = el('label', { for: 'mbb-export-format' }, T('Export format'));
    format = el('select', { id: 'mbb-export-format' });
    format.append(
      el('option', { value: 'markdown' }, T('Markdown single file')),
      el('option', { value: 'zip' }, T('Markdown and images ZIP')),
      el('option', { value: 'portable-zip' }, T('Cross-site Markdown and images ZIP')),
      el('option', { value: 'html' }, T('Static HTML for offline reading')),
    );
    if (cfg.exports?.zipAvailable === false) {
      format.options[1].disabled = true;
      format.options[2].disabled = true;
      dialog.append(
        el(
          'p',
          {},
          T(
            'Optional ZIP dependencies are unavailable. Markdown single-file download remains available.',
          ),
        ),
      );
    }
    status = el('p', { role: 'status' });
    list = el('ul', { id: 'mbb-export-resources' });
    source = el('textarea', {
      id: 'mbb-export-projected-source',
      readonly: '',
      'aria-label': T('Export body copy'),
    });
    htmlPreview = el('section', { id: 'mbb-export-html-preview', hidden: '' });
    htmlPreview.append(el('h3', {}, T('Static HTML preview')));
    preview = el(
      'button',
      { id: 'mbb-export-preview', type: 'button' },
      T('Prepare export and resource manifest'),
    );
    confirm = el('button', { id: 'mbb-export-confirm', type: 'button' }, T('Confirm download'));
    const cancel = el('button', { id: 'mbb-export-cancel', type: 'button' }, T('Cancel export'));
    preview.onclick = review;
    confirm.onclick = download;
    cancel.onclick = () => dialog.close();
    dialog.addEventListener('close', close);
    format.onchange = () => {
      ++epoch;
      discard();
      clearHTMLPreview();
      pending = false;
      source.value = '';
      list.replaceChildren();
      status.textContent = T('The format changed. Prepare the export again.');
      controls();
    };
    dialog.append(label, format, preview, confirm, cancel, status, list, source, htmlPreview);
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
        const button = el(
          'button',
          { id: 'mbb-export-open', type: 'button' },
          T('Export saved article'),
        );
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
