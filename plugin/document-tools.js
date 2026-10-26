/** Core-owned author tool sessions. Concatenated with editor-ui.js at build time. */
const MBBCreateDocumentTools = (core) => {
  const T = (s) => globalThis.MBBI18n?.t(s) ?? s;
  const tools = new Map();
  let session = 0,
    request = 0,
    generation = 0,
    current = null,
    toolDialog = null,
    candidateDialog = null,
    disposal = null;
  const menus = new Set();
  const node = (tag, text = '', attrs = {}) => {
    const e = document.createElement(tag);
    e.textContent = text;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const stale = () =>
    Error(
      T(
        'The document candidate is unavailable or expired. Save current edits and reopen the tool.',
      ),
    );
  const freeze = (v) => {
    if (v && typeof v === 'object') {
      for (const child of Object.values(v)) freeze(child);
      Object.freeze(v);
    }
    return v;
  };
  const invalidate = () => {
    generation++;
    current = null;
  };
  const isCurrent = (token) => {
    if (!current || token !== current.token) return false;
    if (
      !toolDialog?.open ||
      current.session !== session ||
      current.generation !== generation ||
      current.stamp !== core.stamp() ||
      Date.now() >= current.expires ||
      !core.clean()
    ) {
      if (current) invalidate();
      return false;
    }
    return true;
  };
  async function capture() {
    invalidate();
    const serial = ++request,
      openingSession = session,
      openingGeneration = generation,
      stamp = core.stamp();
    if (!toolDialog?.open || !core.clean()) throw stale();
    const context = core.context();
    const result = await core.api('document-tools/capture', context);
    if (
      serial !== request ||
      session !== openingSession ||
      generation !== openingGeneration ||
      !toolDialog?.open ||
      stamp !== core.stamp() ||
      !core.clean()
    )
      throw stale();
    const token = crypto.randomUUID();
    current = {
      token,
      session,
      generation,
      stamp,
      receipt: result.receipt,
      context,
      expires: Date.now() + 900000,
    };
    const { receipt, ...snapshot } = result;
    return freeze(structuredClone({ ...snapshot, openingToken: token }));
  }
  function closeCandidate() {
    if (candidateDialog?.open) candidateDialog.close();
    candidateDialog?.remove();
    candidateDialog = null;
  }
  // Preview 422s describe editable candidate input. These two legacy 422 codes
  // instead describe the saved document ID/pair; they cannot authorize a retry.
  // Permission/source/receipt/adapter conflicts use non-422 statuses and expire the batch.
  const editableRejection = (error) =>
    error?.status === 422 && !['component_base', 'identity'].includes(error.code);
  async function propose({ openingToken, source } = {}) {
    const serial = ++request;
    closeCandidate();
    if (
      !isCurrent(openingToken) ||
      typeof source !== 'string' ||
      new TextEncoder().encode(source).length > 262144
    )
      throw stale();
    const opening = current;
    const payload = { ...opening.context, receipt: opening.receipt, source };
    let preview;
    try {
      preview = await core.api('document-tools/preview', payload);
    } catch (error) {
      if (serial === request && current === opening && !editableRejection(error)) invalidate();
      throw error;
    }
    if (serial !== request || !isCurrent(openingToken)) throw stale();
    const html = await globalThis.MBB_MATH.preview(preview.html);
    if (serial !== request || !isCurrent(openingToken)) throw stale();
    const dialog = node('dialog', '', {
      class: 'mbb-document-dialog',
      'aria-label': T('Review document candidate'),
    });
    candidateDialog = dialog;
    const status = node('p', T('Apply changes to the editor, then use the normal save action.'), {
      role: 'status',
    });
    const diff = node('div', '', { class: 'mbb-diff' });
    core.diff(diff, preview.before, source);
    const fragment = document.createElement('template');
    fragment.innerHTML = html;
    const frame = node('iframe', '', {
      title: T('Built-in content preview'),
      sandbox: '',
      referrerpolicy: 'no-referrer',
    });
    frame.srcdoc = globalThis.MBBSourceTools.frameDocument(fragment.content, core.styles(), null);
    const apply = node('button', T('Apply to editor'), {
      type: 'button',
      class: 'button button-primary',
    });
    const cancel = node('button', T('Cancel'), { type: 'button' });
    let settled = false;
    return new Promise((resolve, reject) => {
      const finish = (value) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      cancel.onclick = () => dialog.close();
      dialog.addEventListener(
        'close',
        () => {
          frame.srcdoc = '';
          dialog.remove();
          if (candidateDialog === dialog) candidateDialog = null;
          finish({ applied: false });
        },
        { once: true },
      );
      apply.onclick = async () => {
        apply.disabled = true;
        try {
          if (serial !== request || !isCurrent(openingToken)) throw stale();
          // Recheck authority, baseline pins and bytes immediately before local application.
          const checked = await core.api('document-tools/preview', payload);
          if (
            serial !== request ||
            candidateDialog !== dialog ||
            !dialog.open ||
            !isCurrent(openingToken) ||
            checked.document.serialized !== preview.document.serialized ||
            checked.document.source !== source
          )
            throw stale();
          invalidate(); // Consume before dispatch, never revive through Undo.
          core.apply(checked.document);
          finish({ applied: true });
          dialog.close();
          toolDialog.close();
        } catch (error) {
          if (serial === request && current === opening && !editableRejection(error)) invalidate();
          status.textContent = error.message;
          // Keep editable candidate errors retryable; baseline failures require a new capture.
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      };
      dialog.append(node('h2', T('Review document candidate')), status, diff, frame, apply, cancel);
      document.body.append(dialog);
      dialog.showModal();
    });
  }
  const api = Object.freeze({
    apiVersion: 1,
    capture,
    propose,
    isCurrent,
    importFiles(files) {
      if (
        !Array.isArray(files) ||
        files.length < 1 ||
        files.length > 10 ||
        !files.every((file) => file instanceof File) ||
        !globalThis.MarkBridgeBatch
      )
        throw Error(T('Choose one to ten files within the 16 MiB upload budget.'));
      return globalThis.MarkBridgeBatch.open(files);
    },
  });
  async function open(id) {
    if (toolDialog?.open) return;
    const tool = tools.get(id);
    if (!tool) return;
    invalidate();
    const openingSession = ++session;
    await core.prepare?.();
    if (openingSession !== session) return;
    toolDialog = node('dialog', '', { class: 'mbb-document-dialog', 'aria-label': tool.label });
    const dialog = toolDialog,
      host = node('div', '', { class: 'mbb-document-tool-host' });
    const close = node('button', T('Close'), { type: 'button' });
    close.onclick = () => dialog.close();
    dialog.append(node('h2', tool.label), close, host);
    dialog.addEventListener(
      'close',
      () => {
        ++session;
        ++request;
        invalidate();
        closeCandidate();
        const dispose = disposal;
        disposal = null;
        try {
          if (typeof dispose === 'function') dispose();
        } finally {
          host.replaceChildren();
          dialog.remove();
          if (toolDialog === dialog) toolDialog = null;
        }
      },
      { once: true },
    );
    document.body.append(dialog);
    dialog.showModal();
    try {
      disposal = tool.render(host, api);
    } catch (error) {
      host.append(node('p', error.message, { role: 'alert' }));
    }
  }
  function renderMenu() {
    for (const menu of menus) {
      menu.replaceChildren();
      if (menu.mbbDedicated) menu.parentElement.hidden = tools.size === 0;
      for (const [id, tool] of tools) {
        const button = node('button', tool.label, { type: 'button' });
        button.onclick = () => {
          menu.closest('details')?.removeAttribute('open');
          open(id);
        };
        menu.append(button);
      }
    }
  }
  document.addEventListener(
    'input',
    (event) => {
      if (!toolDialog?.contains(event.target) && !candidateDialog?.contains(event.target))
        invalidate();
    },
    true,
  );
  globalThis.MarkBridgeDocumentTools = Object.freeze({
    ...api,
    registerTool(id, tool) {
      if (
        !/^[a-z][a-z0-9-]{0,63}$/.test(id) ||
        tools.has(id) ||
        tools.size >= 32 ||
        !tool ||
        typeof tool.label !== 'string' ||
        !tool.label.trim() ||
        tool.label.length > 100 ||
        typeof tool.render !== 'function'
      )
        throw Error(T('Invalid or duplicate document tool registration.'));
      tools.set(id, { label: tool.label, render: tool.render });
      renderMenu();
    },
  });
  return {
    invalidate,
    menu(host) {
      const menu = node('div', '', { class: 'mbb-document-tools' });
      menu.mbbDedicated = host.classList?.contains('mbb-document-more');
      menus.add(menu);
      host.append(menu);
      renderMenu();
    },
  };
};
