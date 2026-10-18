(() => {
  const cfg = globalThis.MBB_EDITOR;
  if (!cfg) return;
  const T = (s) => globalThis.MBBI18n?.t(s) ?? s;
  const E = (e) => globalThis.MBBI18n?.error(e) ?? e.message;
  const node = (tag, text = '', attrs = {}) => {
    const e = document.createElement(tag);
    e.textContent = text;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const route = (part) => {
    const [name, query] = part.split('?'),
      u = new URL(cfg.root);
    if (u.searchParams.has('rest_route'))
      u.searchParams.set(
        'rest_route',
        u.searchParams.get('rest_route').replace(/\/$/, '') + '/' + name,
      );
    else u.pathname = u.pathname.replace(/\/$/, '') + '/' + name;
    if (query) for (const [k, v] of new URLSearchParams(query)) u.searchParams.set(k, v);
    return u.toString();
  };
  async function api(part, body, method = 'POST', binary = false) {
    const form = body instanceof FormData;
    const response = await fetch(route(part), {
      method,
      credentials: 'same-origin',
      headers: {
        'X-WP-Nonce': cfg.nonce,
        ...(!form ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: form ? body : JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      throw Error(
        E(e) || T('The request failed. Sign in again if necessary, then refresh batch status.'),
      );
    }
    return binary ? response : response.json();
  }
  let dialog,
    files,
    identityStrategy,
    prepare,
    refresh,
    status,
    history,
    rows,
    previewPanel,
    frame,
    source,
    ack,
    create,
    job = null,
    view = null,
    pending = false,
    epoch = 0;
  function controls() {
    prepare.disabled = pending;
    refresh.disabled = pending;
    for (const e of rows.querySelectorAll('input,button'))
      e.disabled = pending || e.dataset.locked === 'true';
    create.disabled =
      pending ||
      !view ||
      !job ||
      view.token !== job.token ||
      (view.images.length > 0 && !ack.checked);
    ack.disabled = pending || !view;
    files.disabled = pending;
    if (identityStrategy) identityStrategy.disabled = pending;
  }
  function clearPreview() {
    view = null;
    frame.removeAttribute('srcdoc');
    previewPanel.hidden = true;
    controls();
  }
  function error(e) {
    status.textContent = E(e);
  }
  async function busy(work) {
    if (pending) return;
    const session = epoch;
    pending = true;
    controls();
    try {
      await work(session);
    } catch (e) {
      if (session === epoch) error(e);
    } finally {
      if (session === epoch) {
        pending = false;
        controls();
      }
    }
  }
  const stateText = {
    ready: () => T('Ready for preview'),
    previewed: () => T('Previewed; not saved'),
    saved: () => T('Draft created'),
    blocked: () => T('File needs correction'),
    cancelled: () => T('Canceled'),
    committing: () => T('Verifying save result'),
    review: () => T('Save needs verification; do not import again'),
  };
  const warningText = {
    'duplicate-filename': () => T('Another selected file has the same name.'),
    'duplicate-source': () => T('Another selected file has identical Markdown.'),
    'duplicate-title': () => T('Another selected file has the same title.'),
    'existing-title': () =>
      T('An editable article already has this title. This operation only creates a new draft.'),
    'existing-source': () =>
      T('An editable managed article has identical Markdown. This operation does not update it.'),
    'unbundled-image': () =>
      T('Existing image URLs are preserved; the server does not download them.'),
    'metadata-not-applied': () =>
      T('Header metadata is retained in Markdown but is not applied by batch import.'),
  };
  function render() {
    rows.replaceChildren();
    if (!job) {
      controls();
      return;
    }
    rows.append(
      node(
        'p',
        T(
          'Each item creates a separate draft after preview and confirmation. Existing articles are never overwritten.',
        ),
      ),
    );
    for (const item of job.items) {
      const row = node('section', '', { class: 'mbb-batch-item', 'aria-label': item.name });
      row.append(
        node('h3', item.name),
        node('p', (stateText[item.state]?.() ?? item.state) + ' · ' + item.bytes + ' bytes'),
      );
      const label = node('label', T('Draft title')),
        title = node('input', '', {
          type: 'text',
          value: item.title,
          maxlength: '200',
          'aria-label': T('Draft title') + ' · ' + item.name,
        });
      const locked = !['ready', 'previewed'].includes(item.state) || job.state !== 'open';
      title.dataset.locked = String(locked);
      title.disabled = locked;
      title.oninput = () => {
        if (view?.index === item.index) {
          clearPreview();
          status.textContent = T('The title changed. Preview this item again.');
        }
      };
      label.append(title);
      row.append(label);
      if (item.reason)
        row.append(node('p', item.reason, { class: 'mbb-batch-error', role: 'status' }));
      for (const warning of item.warnings || [])
        row.append(node('p', warningText[warning]?.() ?? warning, { class: 'mbb-batch-warning' }));
      if (item.state === 'saved' && item.editUrl) {
        const url = new URL(item.editUrl, location.href);
        if (url.origin === location.origin)
          row.append(
            node('a', T('Open created draft'), {
              href: url.href,
              target: '_blank',
              rel: 'noopener noreferrer',
            }),
          );
      } else {
        const button = node('button', T('Preview this item'), { type: 'button' });
        button.dataset.locked = String(locked);
        button.disabled = locked;
        button.onclick = () =>
          busy(async (session) => {
            clearPreview();
            status.textContent = T(
              'Preparing this item. No article or media is created by preview.',
            );
            const result = await api('batch/' + job.token + '/preview', {
              schema: 1,
              index: item.index,
              title: title.value,
            });
            if (session !== epoch || !dialog.open) return;
            if (
              result.schema !== 1 ||
              result.item.index !== item.index ||
              typeof result.html !== 'string' ||
              !/^[a-f0-9]{64}$/.test(result.receipt || '') ||
              typeof result.source !== 'string' ||
              new TextEncoder().encode(result.source).length > 262144 ||
              !/^[A-Za-z][A-Za-z0-9_-]{2,63}$/.test(result.documentId || '') ||
              !Array.isArray(result.images) ||
              (result.images.length > 0 && !/^[a-f0-9]{64}$/.test(result.resourceToken || ''))
            )
              throw Error(T('The batch preview is incomplete. Refresh its status.'));
            await showPreview(result, session);
          });
        row.append(button);
      }
      rows.append(row);
    }
    const cancel = node('button', T('Cancel remaining items and remove staging'), {
      type: 'button',
    });
    cancel.dataset.locked = String(job.state !== 'open');
    cancel.onclick = () =>
      busy(async (session) => {
        const result = await api('batch/' + job.token, null, 'DELETE');
        if (session !== epoch) return;
        job = result;
        clearPreview();
        render();
        status.textContent = T('Canceled. Created drafts and their media were preserved.');
        await listBatches(session);
      });
    rows.append(cancel);
    controls();
  }
  async function previewImages(result, fragment, session) {
    let total = 0,
      pixels = 0;
    if (result.images.length > 32) throw Error(T('Preview images exceed their budget.'));
    for (const image of result.images) {
      if (
        !/^[a-f0-9]{64}$/.test(image.key || '') ||
        !Number.isSafeInteger(image.bytes) ||
        image.bytes < 1 ||
        image.bytes > 8388608 ||
        !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(image.mime) ||
        !Number.isSafeInteger(image.width) ||
        !Number.isSafeInteger(image.height) ||
        image.width < 1 ||
        image.height < 1 ||
        image.width * image.height > 40000000 ||
        (total += image.bytes) > 33554432 ||
        (pixels += image.width * image.height) > 64000000
      )
        throw Error(T('Preview images exceed their budget.'));
      const query = new URLSearchParams({ post_id: '0', documentId: result.documentId });
      const response = await api(
        'resource-import/' + result.resourceToken + '/image/' + image.key + '?' + query,
        null,
        'GET',
        true,
      );
      const bytes = await response.arrayBuffer();
      if (
        bytes.byteLength !== image.bytes ||
        response.headers.get('Content-Type')?.split(';')[0] !== image.mime
      )
        throw Error(T('A preview image changed or has the wrong content type.'));
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (digest !== image.sha256) throw Error(T('A preview image digest does not match.'));
      if (session !== epoch) return;
      // Opaque sandbox documents cannot read a parent-origin Blob URL. Embed only
      // these bounded, MIME- and SHA-verified bytes; keep the frame opaque.
      const data = new Uint8Array(bytes),
        chunks = [];
      for (let i = 0; i < data.length; i += 16384)
        chunks.push(String.fromCharCode(...data.subarray(i, i + 16384)));
      const uri = 'data:' + image.mime + ';base64,' + btoa(chunks.join(''));
      for (const imageNode of fragment.querySelectorAll('img'))
        if (imageNode.getAttribute('src') === 'mbb-import/' + image.key)
          imageNode.setAttribute('src', uri);
    }
  }
  async function showPreview(result, session) {
    const rendered = await globalThis.MBB_MATH.preview(result.html);
    if (session !== epoch || !dialog.open) return;
    const template = document.createElement('template');
    template.innerHTML = rendered;
    await previewImages(result, template.content, session);
    if (session !== epoch || !dialog.open) return;
    view = { ...result, index: result.item.index, token: job.token };
    job.items[result.item.index] = result.item;
    source.value = result.source;
    const previousMap = previewPanel.querySelector('.mbb-batch-identity-map');
    previousMap?.remove();
    if (result.identityMappings?.length) {
      const mapping = node('div', '', { class: 'mbb-batch-identity-map' });
      const details = node('details');
      mapping.append(
        node(
          'p',
          (result.identityStrategy === 'migrate'
            ? T('Documents retaining their logical identities: ')
            : T('Documents receiving new logical identities: ')) +
            result.identityMappings.length +
            '. ' +
            (result.identityStrategy === 'migrate'
              ? T(
                  'Existing identities are retained only if unclaimed; occupied identities block saving.',
                )
              : T(
                  'References within this batch point to its new drafts. References outside the batch are preserved.',
                )),
        ),
        details,
      );
      details.append(
        node('summary', T('Logical identity copy mapping')),
        node('pre', JSON.stringify(result.identityMappings, null, 2)),
      );
      previewPanel.append(mapping);
    }
    ack.checked = false;
    ack.closest('label').hidden = result.images.length === 0;
    const style =
      globalThis.MBB_MATH.style +
      (cfg.footnoteStyle || '') +
      (cfg.teachingStyle || '') +
      (cfg.technicalStyle || '') +
      (cfg.nativeMediaStyle || '') +
      (cfg.codeDisplayStyle || '');
    frame.srcdoc = globalThis.MBBSourceTools.frameDocument(template.content, style, null);
    previewPanel.hidden = false;
    render();
    status.textContent = T(
      'Review the content below, then create only this draft. A created draft remains saved if another item fails.',
    );
    previewPanel.scrollIntoView({ block: 'start', behavior: 'instant' });
    controls();
  }
  async function listBatches(session) {
    const result = await api('batch', null, 'GET');
    if (session !== epoch) return;
    history.replaceChildren();
    if (!job) status.textContent = T('Choose files to scan or resume one of your active batches.');
    for (const batch of result.batches) {
      const button = node(
        'button',
        T('Resume batch') +
          ' · ' +
          batch.items.length +
          ' · ' +
          new Date(batch.expiresAt * 1000).toLocaleTimeString(),
        { type: 'button' },
      );
      button.onclick = () =>
        busy(async (inner) => {
          const next = await api('batch/' + batch.token, null, 'GET');
          if (inner !== epoch) return;
          job = next;
          clearPreview();
          render();
          status.textContent = T(
            'Batch restored for the current account. Preview unfinished items again.',
          );
        });
      history.append(button);
    }
  }
  function setup() {
    dialog = node('dialog', '', { id: 'mbb-batch-dialog', 'aria-label': T('Batch import drafts') });
    const head = node('div', '', { class: 'mbb-batch-head' }),
      close = node('button', T('Close'), { type: 'button' });
    head.append(node('h2', T('Batch import drafts')), close);
    close.onclick = () => dialog.close();
    const intro = node(
      'p',
      T(
        'Choose up to ten Markdown or single-document ZIP files. Scan first, preview each item, then create drafts one at a time. Header metadata is not applied.',
      ),
    );
    files = node('input', '', {
      type: 'file',
      multiple: '',
      accept: '.md,.markdown,.zip',
      'aria-label': T('Batch files'),
    });
    identityStrategy = node('select', '', { 'aria-label': T('Logical identity handling') });
    for (const [value, label] of [
      ['copy', 'Copy with new identities (default)'],
      ['migrate', 'Explicit migration retaining identities'],
    ])
      identityStrategy.append(node('option', T(label), { value }));
    prepare = node('button', T('Scan selected files'), { type: 'button' });
    refresh = node('button', T('Refresh batch status'), { type: 'button' });
    history = node('div', '', { class: 'mbb-batch-history' });
    rows = node('div', '', { class: 'mbb-batch-items' });
    status = node('p', '', { role: 'status', 'aria-live': 'polite' });
    previewPanel = node('section', '', { class: 'mbb-batch-preview', hidden: '' });
    frame = node('iframe', '', {
      title: T('Batch item preview'),
      sandbox: '',
      referrerpolicy: 'no-referrer',
    });
    const label = node('label', T('Uploaded image URLs may become public, including for a draft.'));
    ack = node('input', '', { type: 'checkbox' });
    label.prepend(ack);
    ack.onchange = controls;
    create = node('button', T('Create this draft'), {
      type: 'button',
      class: 'button button-primary',
    });
    const details = node('details'),
      summary = node('summary', T('Original Markdown'));
    source = node('textarea', '', { readonly: '', 'aria-label': T('Batch Markdown source') });
    details.append(summary, source);
    previewPanel.append(node('h3', T('Review this item')), frame, label, create, details);
    prepare.onclick = () =>
      busy(async (session) => {
        if (
          files.files.length < 1 ||
          files.files.length > 10 ||
          [...files.files].reduce((n, f) => n + f.size, 0) > 16777216
        )
          throw Error(T('Choose one to ten files within the 16 MiB upload budget.'));
        const data = new FormData();
        for (const f of files.files) data.append('documents[]', f);
        data.append('identity_strategy', identityStrategy.value);
        clearPreview();
        status.textContent = T('Scanning files. No articles or media are created.');
        const result = await api('batch/prepare', data);
        if (session !== epoch) return;
        job = result;
        render();
        await listBatches(session);
        if (session !== epoch) return;
        status.textContent = T(
          'Scan finished. Correct blocked originals or preview valid items. Duplicate warnings do not overwrite existing articles.',
        );
      });
    refresh.onclick = () =>
      busy(async (session) => {
        if (job) {
          const value = await api('batch/' + job.token, null, 'GET');
          if (session !== epoch) return;
          job = value;
          clearPreview();
          render();
        }
        await listBatches(session);
        if (session !== epoch) return;
        status.textContent = T(
          'Status refreshed. Preview unfinished items again before confirmation.',
        );
      });
    create.onclick = () =>
      busy(async (session) => {
        if (!view || !job) return;
        const item = view;
        status.textContent = T(
          'Creating this draft. If the connection is interrupted, refresh batch status before trying again.',
        );
        const result = await api('batch/' + job.token + '/confirm', {
          schema: 1,
          index: item.index,
          receipt: item.receipt,
          ack_public_media: ack.checked,
        });
        if (session !== epoch) return;
        job.items[item.index] = result;
        clearPreview();
        render();
        status.textContent = stateText[result.state]?.() ?? result.state;
      });
    dialog.addEventListener('close', () => {
      ++epoch;
      pending = false;
      job = null;
      clearPreview();
      rows.replaceChildren();
      history.replaceChildren();
      files.value = '';
    });
    dialog.append(
      head,
      intro,
      identityStrategy,
      files,
      prepare,
      refresh,
      status,
      history,
      rows,
      previewPanel,
    );
    document.body.append(dialog);
  }
  async function open() {
    if (!dialog) setup();
    if (dialog.open) return;
    ++epoch;
    dialog.showModal();
    job = null;
    clearPreview();
    render();
    status.textContent = T('Loading your active batches…');
    await busy(listBatches);
  }
  document.addEventListener('click', (event) => {
    if (event.target.closest('#mbb-batch-new')) void open();
  });
  globalThis.MarkBridgeBatch = { open };
})();
