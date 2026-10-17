(() => {
  'use strict';
  const T = (s) => globalThis.MBBI18n?.t(s) ?? s;
  const node = (tag, text = '') =>
    Object.assign(document.createElement(tag), { textContent: text });
  const button = (text, click) => {
    const b = node('button', T(text));
    b.type = 'button';
    b.onclick = click;
    return b;
  };
  async function api(path, data, nonce = window.MBB_EDITOR?.nonce) {
    const cfg = window.MBB_EDITOR,
      config = window.MBB_REFERENCES;
    const url = cfg?.url ? cfg.url(path) : config.url.replace('__route__', path);
    const response = await fetch(url, {
      method: data ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(nonce ? { 'X-WP-Nonce': nonce } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const value = await response.json();
    if (!response.ok)
      throw Error(value.message || T('Reference verification failed. Current input is preserved.'));
    return value;
  }
  async function adopt(prepared, current) {
    const record = {
      kind: 'markdown',
      identity_receipt: prepared.identity_receipt,
      context: {
        postId: prepared.post_id,
        expected: prepared.expected,
        sourceDigest: prepared.source_sha256,
      },
      payload: {
        content: prepared.document.source,
        documentId: prepared.document.documentId,
        title: prepared.title,
        status: prepared.post_status,
        featuredMedia: current.featured_media || 0,
      },
    };
    const verify = async () => {
      if (!prepared.post_id) return;
      const fresh = await api('document?post_id=' + prepared.post_id);
      if (
        fresh.expected !== prepared.expected ||
        (fresh.source_sha256 !== prepared.source_sha256 &&
          (fresh.source_sha256 || null) !== (prepared.source_sha256 || null))
      )
        throw Error(T('The article has newer changes. Reload and merge them.'));
    };
    await window.MarkBridgeEditorRecovery.restore(record, verify);
  }
  function create(adapter) {
    const panel = node('details'),
      status = node('p'),
      controls = node('div'),
      results = node('div');
    panel.className = 'mbb-reference-tools';
    panel.append(node('summary', T('Document references')), status, controls);
    let serial = 0;
    const read = () =>
      adapter.source?.() ?? window.MBB.toMarkdown(adapter.blocks(), { origin: 'markdown_import' });
    async function refresh() {
      const epoch = ++serial;
      status.textContent = T('Checking document references…');
      try {
        const value = await api(
          'references/status?post_id=' + Number(adapter.context?.().post_id || 0),
        );
        if (epoch !== serial) return;
        const blocks = adapter.source ? [] : adapter.blocks(),
          identity =
            value.identity ||
            blocks.find(
              (b) =>
                b.name === 'mbb/identity' ||
                (b.name === undefined && b.blockName === 'mbb/identity'),
            );
        status.textContent =
          (identity ? T('Document identity enabled') : T('Document identity is not enabled')) +
          ' · ' +
          value.state;
        controls.replaceChildren();
        const metadata = node('details');
        metadata.append(node('summary', T('Copy identity metadata')));
        if (identity) {
          const pre = node(
            'pre',
            JSON.stringify(identity.attributes || identity.attrs || identity),
          );
          metadata.append(pre);
          controls.append(metadata);
        }
        const prepare = async (action) => {
          const stamp = adapter.stamp(),
            opening = adapter.context?.();
          try {
            if (!opening) throw Error(T('The article has newer changes. Reload and merge them.'));
            const current = opening.post_id
              ? await api('document?post_id=' + opening.post_id)
              : opening;
            if (
              current.expected !== opening.expected ||
              (current.source_sha256 || null) !== (opening.source_sha256 || null)
            )
              throw Error(T('The article has newer changes. Reload and merge them.'));
            if (adapter.stamp() !== stamp)
              throw Error(T('Content changed. Prepare the operation again.'));
            const prepared = await api('references/prepare', {
              action,
              post_id: opening.post_id,
              expected: opening.expected,
              source_sha256: opening.source_sha256 || null,
              documentId: opening.documentId,
              source: read(),
            });
            if (adapter.stamp() !== stamp)
              throw Error(T('Content changed. Prepare the operation again.'));
            await adopt(prepared, current);
          } catch (error) {
            status.textContent = error.message;
          }
        };
        {
          // New imported candidates also require an explicit copy/migration decision.
          if (value.state === 'ready' && identity && !adapter.context?.().post_id)
            controls.append(
              button('Prepare explicit identity migration', () => prepare('migrate')),
            );
          if (value.state === 'ready' && !identity)
            controls.append(button('Enable document references', () => prepare('enable')));
          if (value.state === 'ready')
            controls.append(button('Prepare a copy with a new identity', () => prepare('copy')));
          if (value.state === 'conflict' && value.can_manage && identity)
            controls.append(
              button('Prepare conflict repair with a new identity', () => prepare('repair-copy')),
            );
        }
        if (value.can_manage && value.state !== 'ready') {
          const link = node('a', T('Initialize or rebuild reference index'));
          link.href = window.MBB_REFERENCES.manageUrl;
          controls.append(link);
        }
      } catch (error) {
        if (epoch === serial) status.textContent = error.message;
      }
    }
    const label = node('label', T('Find a reference target')),
      input = node('input');
    input.type = 'search';
    input.maxLength = 200;
    label.append(input);
    let cursor = null,
      query = '';
    async function search(more = false) {
      const stamp = adapter.stamp(),
        epoch = ++serial;
      try {
        if (!more) {
          results.replaceChildren();
          cursor = null;
          query = input.value;
        }
        const value = await api(
          'references/search?q=' +
            encodeURIComponent(query) +
            (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
        );
        if (epoch !== serial || adapter.stamp() !== stamp) return;
        cursor = value.cursor;
        next.hidden = !cursor;
        for (const item of value.items) {
          const row = node('div');
          row.className = 'mbb-reference-result';
          const target = item.target;
          row.append(
            node('span', [item.title || item.label, item.article].join(' · ')),
            button('Insert reference', () =>
              adapter.insert(
                '<span data-mbb-target="' +
                  target.target +
                  '" data-mbb-version="2" data-mbb-namespace="' +
                  target.namespace +
                  '" data-mbb-document="' +
                  target.document +
                  '" data-mbb-kind="' +
                  target.kind +
                  '" class="mbb-xref">[' +
                  target.target +
                  ']</span>',
              ),
            ),
          );
          results.append(row);
        }
        status.textContent = results.childElementCount
          ? T('Choose a target to insert a reference.')
          : T('No readable reference targets found.');
      } catch (error) {
        if (epoch === serial) status.textContent = error.message;
      }
    }
    const next = button('More targets', () => search(true));
    next.hidden = true;
    panel.append(
      label,
      button('Search reference targets', () => search()),
      button('Check changed targets and readable incoming references', async () => {
        const stamp = adapter.stamp();
        try {
          const value = await impact(adapter);
          if (adapter.stamp() !== stamp) return;
          results.replaceChildren();
          for (const change of value.changes) {
            const row = node('p', change.target.target);
            for (const item of change.incoming.items || []) {
              const link = node('a', item.title);
              link.href = item.url;
              row.append(document.createTextNode(' · '), link);
            }
            results.append(row);
          }
          status.textContent = T(
            'Only currently readable incoming references are shown. Other articles are not changed.',
          );
        } catch (error) {
          status.textContent = error.message;
        }
      }),
      results,
      next,
    );
    panel.addEventListener('toggle', () => {
      if (panel.open) refresh();
    });
    return panel;
  }
  async function impact(adapter, plan = null) {
    const opening = adapter.context?.();
    if (!opening?.post_id) return { changes: [] };
    let blocks = adapter.blocks();
    if (plan) {
      const patches = new Map(plan.patches.map((p) => [p.clientId, p.attributes]));
      const update = (list) =>
        list.map((b) =>
          wp.blocks.cloneBlock(b, patches.get(b.clientId) || {}, update(b.innerBlocks || [])),
        );
      blocks = update(blocks);
    }
    const source = plan
      ? window.MBB.toMarkdown(blocks, { origin: 'markdown_import' })
      : (adapter.source?.() ?? window.MBB.toMarkdown(blocks, { origin: 'markdown_import' }));
    return api('references/impact', {
      post_id: opening.post_id,
      expected: opening.expected,
      source,
    });
  }
  const importCache = new Map();
  async function prepareImport(payload, strategy, currentDocument) {
    if (
      payload.identity_receipt ||
      !['markdown', 'upload'].includes(payload.mode) ||
      typeof payload.source !== 'string'
    )
      return payload;
    if (!payload.source.includes(':::mbb:v1 identity ')) return payload;
    // Converter-only screens deliberately do not register custom editor types.
    // The server's closed parser distinguishes real directives from literal code.
    const key = JSON.stringify([
      payload.post_id,
      payload.expected,
      payload.documentId,
      payload.source,
      strategy,
    ]);
    let entry = importCache.get(key);
    if (!entry || entry.expires < Date.now()) {
      const prepared = await api('references/prepare', {
        action: strategy === 'migrate' ? 'migrate' : 'import-copy',
        allow_no_identity: true,
        post_id: payload.post_id,
        expected: payload.expected,
        source: payload.source,
        documentId: payload.documentId,
        source_sha256: payload.source_sha256,
      });
      entry = { prepared, expires: Date.now() + 840000 };
      if (importCache.size >= 4) importCache.clear();
      importCache.set(key, entry);
    }
    if (entry.prepared.unchanged) return payload;
    return {
      ...payload,
      source: entry.prepared.document.source,
      documentId: entry.prepared.document.documentId,
      identity_receipt: entry.prepared.identity_receipt,
    };
  }
  window.MBBReferences = { create, adopt, impact, prepareImport };
  // All rendered HTML stays neutral. Authorization and labels exist only in this page's memory.
  let generation = 0;
  const original = new WeakMap();
  const target = (n) => ({
    namespace: n.dataset.mbbNamespace,
    document: n.dataset.mbbDocument,
    target: n.dataset.mbbTarget,
    kind: n.dataset.mbbKind,
  });
  async function front() {
    if (!window.MBB_REFERENCES || window.MBB_EDITOR) return;
    const epoch = ++generation;
    const spans = [...document.querySelectorAll('span.mbb-xref[data-mbb-version="2"]')].filter(
      (n) => !n.closest('pre,code'),
    );
    for (const n of spans) {
      if (!original.has(n)) original.set(n, n.textContent);
      n.replaceChildren(document.createTextNode(original.get(n)));
    }
    let nonce;
    try {
      const response = await fetch(window.MBB_REFERENCES.ajax, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=mbb_reference_nonce',
      });
      const value = await response.json();
      nonce = value.nonce;
    } catch {}
    for (let i = 0; i < spans.length; i += 32) {
      const batch = spans.slice(i, i + 32);
      try {
        const result = await api('references/resolve', { targets: batch.map(target) }, nonce);
        if (epoch !== generation) return;
        batch.forEach((span, n) => {
          const item = result.items[n];
          if (item?.state !== 'available') return;
          const link = node('a', item.label);
          link.href = item.url;
          link.title = item.title || item.article;
          link.onclick = async (event) => {
            event.preventDefault();
            try {
              const fresh = await api('references/resolve', { targets: [target(span)] }, nonce);
              if (epoch !== generation) return;
              const value = fresh.items[0];
              if (value?.state === 'available') location.assign(value.url);
              else {
                span.replaceChildren(node('span', original.get(span)));
              }
            } catch {
              span.replaceChildren(node('span', original.get(span)));
            }
          };
          span.replaceChildren(link);
        });
      } catch {}
    }
  }
  window.addEventListener('pageshow', front);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      generation++;
      for (const span of document.querySelectorAll('span.mbb-xref[data-mbb-version="2"]'))
        if (original.has(span)) span.replaceChildren(document.createTextNode(original.get(span)));
    } else front();
  });
})();
