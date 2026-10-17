(function () {
  'use strict';
  const cfg = window.MBB_COLLECTIONS,
    root = document.getElementById('mbb-collections');
  if (!cfg || !root) return;
  const T = (s) => window.MBBI18n?.t(s) || s;
  let serial = 0,
    loading = null,
    catalog = [],
    revision = null,
    id = null,
    job = null,
    confirmed = false,
    dirty = false,
    adapters = {},
    adapter = 'snapshot-v1',
    projection = null,
    previewReady = false;
  let summaries = [],
    config = fresh(),
    results = [],
    query = '',
    nextPage = null,
    page = 1;
  function fresh() {
    return {
      schema: 1,
      title: '',
      lang: cfg.lang || 'en-US',
      rights: '',
      cover: null,
      privateOptIn: false,
      chapters: [],
    };
  }
  function key() {
    return (
      'C_' +
      Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
        n.toString(16).padStart(2, '0'),
      ).join('')
    );
  }
  function url(path = '') {
    const u = new URL(cfg.url, location.href);
    if (u.searchParams.has('rest_route'))
      u.searchParams.set('rest_route', u.searchParams.get('rest_route') + path);
    else u.pathname += path;
    return u;
  }
  async function api(path = '', method = 'GET', body, params) {
    const target = url(path);
    for (const [k, v] of Object.entries(params || {})) target.searchParams.set(k, v);
    const response = await fetch(target, {
      method,
      credentials: 'same-origin',
      headers: { 'X-WP-Nonce': cfg.nonce, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw Error(
        data.message || T('The collection operation failed. Current fields are preserved.'),
      );
    }
    return path.endsWith('/download') || path.endsWith('/inputs')
      ? response.blob()
      : response.json();
  }
  function el(tag, text, attrs = {}) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }
  function button(text, action, disabled = false) {
    const n = el('button', T(text), { type: 'button', class: 'button' });
    n.disabled = disabled;
    n.onclick = action;
    return n;
  }
  const status = el('p', '', { role: 'status', class: 'mbbc-status' }),
    workspace = el('div', undefined, { class: 'mbbc-grid' });
  root.append(status, workspace);
  function discardProjection() {
    projection?.dispose?.();
    projection = null;
    previewReady = false;
  }
  const clients = new Map();
  window.MarkBridgeCollections = {
    registerClient(id, value) {
      if (
        typeof id !== 'string' ||
        !/^[a-z][a-z0-9-]{0,31}$/.test(id) ||
        clients.has(id) ||
        !value ||
        Object.keys(value).sort().join(',') !==
          ['schema', 'version', 'fingerprint', 'label', 'build'].sort().join(',') ||
        value.schema !== 1 ||
        typeof value.build !== 'function' ||
        !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
        typeof value.label !== 'string' ||
        value.label.length > 200
      )
        return false;
      clients.set(id, value);
      renderActions();
      return true;
    },
  };
  if (!window.MarkBridgeExtensions)
    window.MarkBridgeExtensions = Object.freeze({
      apiVersion: 1,
      registerPublicationClient(id, descriptor) {
        return window.MarkBridgeCollections.registerClient(id, descriptor);
      },
    });
  function invalidate(changed = true) {
    discardProjection();
    serial++;
    loading = null;
    confirmed = false;
    if (changed) dirty = true;
    const old = job;
    job = null;
    if (old) api('/jobs/' + old.token, 'DELETE').catch(() => {});
  }
  function change(action) {
    invalidate();
    action();
    render();
  }
  async function run(action, done) {
    const ticket = ++serial;
    loading = ticket;
    status.textContent = T('Working…');
    render();
    try {
      const value = await action({
        cancelled: () => ticket !== serial,
        progress: (message) => {
          if (ticket === serial) status.textContent = message;
        },
      });
      if (ticket !== serial) {
        if (value?.token) api('/jobs/' + value.token, 'DELETE').catch(() => {});
        value?.dispose?.();
        return;
      }
      done(value);
      status.textContent = '';
    } catch (e) {
      if (ticket === serial) status.textContent = e.message;
    } finally {
      if (loading === ticket) loading = null;
      render();
    }
  }
  function field(label, value, apply, type = 'text') {
    const wrap = el('label', T(label)),
      input = el(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.value = value;
    input.oninput = () => {
      invalidate();
      apply(input.value);
      renderActions();
    };
    wrap.append(input);
    return wrap;
  }
  function section(title) {
    const n = el('section', undefined, { class: 'mbbc-panel' });
    n.append(el('h2', T(title)));
    workspace.append(n);
    return n;
  }
  function renderActions() {
    const a = document.getElementById('mbbc-actions');
    if (a) a.replaceWith(actions());
  }
  function actions() {
    const n = el('div', undefined, { id: 'mbbc-actions', class: 'mbbc-actions' });
    const formatLabel = el('label', T('Export format')),
      formats = el('select', undefined, { 'aria-label': T('Export format') });
    for (const [key, value] of Object.entries(adapters))
      formats.append(
        el(
          'option',
          clients.get(key)?.label || (key === 'snapshot-v1' ? T('Snapshot ZIP') : value.title),
          { value: key },
        ),
      );
    formats.value = adapter;
    formats.onchange = () => {
      invalidate(false);
      adapter = formats.value;
      render();
    };
    formatLabel.append(formats);
    n.append(formatLabel);
    n.append(
      button(
        'Save collection configuration',
        () =>
          run(
            () => api('', 'POST', { schema: 1, revision, collection_id: id, config }),
            (data) => {
              id = data.collection_id;
              revision = data.revision;
              config = data.config;
              summaries = data.chapterSummaries || [];
              dirty = false;
              catalog = [
                ...catalog.filter((c) => c.id !== id),
                { id, title: config.title, chapters: config.chapters.length },
              ];
            },
          ),
        !!loading || !config.title.trim(),
      ),
      button(
        'Prepare snapshot',
        () =>
          run(
            () =>
              api('/prepare', 'POST', {
                schema: 1,
                collection_id: id,
                revision,
                adapter,
              }),
            (data) => {
              job = data;
              confirmed = false;
            },
          ),
        !!loading || dirty || !id || !config.chapters.length,
      ),
    );
    if (job) {
      const report = el('div', undefined, { class: 'mbbc-scope' });
      report.append(el('h3', T('Check the snapshot scope')));
      const list = el('ol');
      for (const chapter of job.scope)
        list.append(
          el(
            'li',
            chapter.title +
              ' · ' +
              T(chapter.scope === 'public' ? 'Public' : 'Explicitly selected private article'),
          ),
        );
      report.append(list);
      report.append(
        el(
          'p',
          T('Verified image resources: ') +
            job.resourceCount +
            ' · ' +
            (job.resourceBytes / 1048576).toFixed(2) +
            ' MiB',
        ),
      );
      report.append(
        el(
          'p',
          T(
            'Comments, private notes, and source paths are excluded. Unselected private reference targets remain unavailable.',
          ),
        ),
      );
      const client = job.client ? clients.get(job.adapter) : null;
      const clientAvailable =
        client &&
        client.version === job.client.version &&
        client.fingerprint === job.client.fingerprint;
      if (job.client) {
        report.append(
          button(
            'Generate web book',
            () =>
              run(
                async ({ cancelled, progress }) => {
                  if (!clientAvailable)
                    throw Error(
                      T(
                        'The publication client is unavailable. Enable its matching version and prepare again.',
                      ),
                    );
                  discardProjection();
                  const input = await api('/jobs/' + job.token + '/inputs', 'POST', {
                    schema: 1,
                    receipt: job.receipt,
                  });
                  if (cancelled()) return null;
                  const result = await client.build(input, { prepared: job, cancelled, progress });
                  if (cancelled()) {
                    result?.dispose?.();
                    return null;
                  }
                  if (
                    !(result?.blob instanceof Blob) ||
                    result.blob.size < 1 ||
                    result.blob.size > 25165824 ||
                    typeof result.previewHTML !== 'string'
                  ) {
                    result?.dispose?.();
                    throw Error(T('The publication output is invalid or exceeds its budget.'));
                  }
                  const sha = [
                    ...new Uint8Array(
                      await crypto.subtle.digest('SHA-256', await result.blob.arrayBuffer()),
                    ),
                  ]
                    .map((n) => n.toString(16).padStart(2, '0'))
                    .join('');
                  return { ...result, sha };
                },
                (value) => {
                  projection = value;
                  previewReady = false;
                  confirmed = false;
                },
              ),
            !!loading || !clientAvailable,
          ),
        );
        if (!clientAvailable)
          report.append(
            el(
              'p',
              T(
                'The publication client is unavailable. Enable its matching version and prepare again.',
              ),
            ),
          );
        const explanation = el('details');
        explanation.append(
          el('summary', T('About the input and final download')),
          el(
            'p',
            T(
              'Input already delivered to your browser cannot be recalled. Final authorization checks this plugin download, not the authenticity of arbitrary client HTML.',
            ),
          ),
        );
        report.append(explanation);
        if (projection) {
          const frame = el('iframe', undefined, {
            title: T('Web book preview'),
            sandbox: '',
            referrerpolicy: 'no-referrer',
            class: 'mbbc-book-preview',
          });
          const inspected = projection,
            token = job.token;
          frame.srcdoc = projection.previewHTML;
          frame.onload = () => {
            if (projection !== inspected || job?.token !== token || !frame.isConnected) return;
            previewReady = true;
            const b = document.querySelector('[data-mbbc-confirm]');
            if (b) b.disabled = !!loading || confirmed;
          };
          report.append(frame);
        }
      }
      report.append(
        button(
          'Confirm this snapshot',
          () =>
            run(
              () =>
                api('/jobs/' + job.token + '/confirm', 'POST', { schema: 1, receipt: job.receipt }),
              () => {
                confirmed = true;
              },
            ),
          !!loading || confirmed || (!!job.client && (!projection || !previewReady)),
        ),
        button(
          job.client ? 'Download web book ZIP' : 'Download snapshot ZIP',
          () =>
            run(
              async ({ cancelled }) => {
                if (!job.client)
                  return api('/jobs/' + job.token + '/download', 'POST', {
                    schema: 1,
                    receipt: job.receipt,
                  });
                if (!projection || !previewReady)
                  throw Error(T('Generate and inspect the web book first.'));
                const bound = {
                  schema: 1,
                  receipt: job.receipt,
                  snapshot_sha256: job.snapshot_sha256,
                  provider_fingerprint: job.client.fingerprint,
                  projection_sha256: projection.sha,
                  projection_bytes: projection.blob.size,
                };
                const authorized = await api(
                  '/jobs/' + job.token + '/client-download',
                  'POST',
                  bound,
                );
                if (cancelled()) return null;
                if (
                  authorized.authorized !== true ||
                  [
                    'snapshot_sha256',
                    'provider_fingerprint',
                    'projection_sha256',
                    'projection_bytes',
                  ].some((k) => authorized[k] !== bound[k])
                )
                  throw Error(T('Final publication authorization did not match. Prepare again.'));
                return projection.blob;
              },
              (blob) => {
                const href = URL.createObjectURL(blob),
                  a = el('a', undefined, {
                    href,
                    download: job.client ? 'markbridge-webbook.zip' : 'markbridge-collection.zip',
                  });
                document.body.append(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(href), 1000);
                job = null;
                discardProjection();
                confirmed = false;
              },
            ),
          !!loading || !confirmed || (!!job.client && (!projection || !previewReady)),
        ),
        button('Cancel snapshot', () => {
          invalidate(false);
          render();
        }),
      );
      const confirmButton = [...report.querySelectorAll('button')].find(
        (b) => b.textContent === T('Confirm this snapshot'),
      );
      if (confirmButton) confirmButton.dataset.mbbcConfirm = '';
      n.append(report);
    }
    return n;
  }
  function render() {
    workspace.replaceChildren();
    const saved = section('Saved collections');
    const select = el('select', undefined, { 'aria-label': T('Saved collections') });
    select.append(el('option', T('New collection'), { value: '' }));
    for (const c of catalog) select.append(el('option', c.title, { value: c.id }));
    select.value = id || '';
    select.disabled = !!loading;
    select.onchange = () => {
      invalidate(false);
      if (!select.value) {
        id = null;
        config = fresh();
        summaries = [];
        dirty = false;
        render();
      } else
        run(
          () => api('/' + select.value),
          (data) => {
            id = data.collection_id;
            revision = data.revision;
            config = data.config;
            summaries = data.chapterSummaries || [];
            dirty = false;
          },
        );
    };
    saved.append(
      select,
      button(
        'Refresh collections',
        () =>
          run(
            () => api(),
            (data) => {
              catalog = data.items;
              adapters = data.adapters || adapters;
              if (!id) revision = data.revision;
            },
          ),
        !!loading,
      ),
    );
    if (id)
      saved.append(
        button(
          'Delete configuration',
          () =>
            run(
              () => api('/' + id, 'DELETE', { schema: 1, revision }),
              (data) => {
                catalog = data.items;
                adapters = data.adapters || adapters;
                revision = data.revision;
                id = null;
                config = fresh();
                summaries = [];
                dirty = false;
                invalidate(false);
              },
            ),
          !!loading,
        ),
      );
    saved.append(
      el(
        'p',
        T(
          'Deleting configuration never deletes articles. Maximum 10 chapters; verified image bytes total at most 16 MiB.',
        ),
      ),
    );
    const edit = section('1. Select and order articles');
    const search = el('form');
    const input = el('input', undefined, {
      type: 'search',
      'aria-label': T('Search editable articles'),
    });
    input.value = query;
    input.oninput = () => {
      query = input.value;
    };
    const go = button(
      'Search',
      () => {
        page = 1;
        run(
          () => api('/search', 'GET', null, { q: query, page }),
          (data) => {
            results = data.items;
            nextPage = data.nextPage;
          },
        );
      },
      !!loading,
    );
    search.onsubmit = (e) => {
      e.preventDefault();
      go.click();
    };
    search.append(input, go);
    edit.append(search);
    const found = el('ul', undefined, { class: 'mbbc-results' });
    for (const item of results) {
      const row = el('li');
      row.append(
        el('span', item.title + ' · ' + item.status),
        button(
          'Add article',
          () =>
            change(() => {
              const chapterKey = key();
              config.chapters.push({ key: chapterKey, post_id: item.post_id });
              summaries.push({
                key: chapterKey,
                state: 'available',
                title: item.title,
                status: item.status,
              });
            }),
          config.chapters.length >= 10 || config.chapters.some((c) => c.post_id === item.post_id),
        ),
        button(
          'Import Companion series',
          () =>
            run(
              () => api('/import-companion', 'POST', { schema: 1, post_id: item.post_id }),
              (data) => {
                invalidate();
                config = data.config;
                id = null;
                dirty = true;
              },
            ),
          !!loading,
        ),
      );
      found.append(row);
    }
    if (!results.length) found.append(el('li', T('Search for saved articles you can edit.')));
    edit.append(found);
    if (nextPage)
      edit.append(
        button(
          'Next page',
          () => {
            page = nextPage;
            run(
              () => api('/search', 'GET', null, { q: query, page }),
              (data) => {
                results = data.items;
                nextPage = data.nextPage;
              },
            );
          },
          !!loading,
        ),
      );
    const chosen = el('ol', undefined, { class: 'mbbc-selected' });
    config.chapters.forEach((c, index) => {
      const row = el('li');
      const found = summaries.find((r) => r.key === c.key);
      row.append(
        el('span', found?.state === 'available' ? found.title : T('Unavailable article')),
        button(
          'Move up',
          () =>
            change(() => {
              [config.chapters[index - 1], config.chapters[index]] = [
                c,
                config.chapters[index - 1],
              ];
            }),
          index === 0 || !!loading,
        ),
        button(
          'Move down',
          () =>
            change(() => {
              [config.chapters[index + 1], config.chapters[index]] = [
                c,
                config.chapters[index + 1],
              ];
            }),
          index === config.chapters.length - 1 || !!loading,
        ),
        button('Remove article', () => change(() => config.chapters.splice(index, 1)), !!loading),
      );
      chosen.append(row);
    });
    edit.append(chosen);
    if (!config.chapters.length) edit.append(el('p', T('No articles selected.')));
    const meta = section('2. Metadata and scope');
    meta.append(
      field('Collection title', config.title, (v) => {
        config.title = v;
      }),
      field('Language tag', config.lang, (v) => {
        config.lang = v;
      }),
      field(
        'Rights statement',
        config.rights,
        (v) => {
          config.rights = v;
        },
        'textarea',
      ),
      field(
        'Optional cover attachment ID',
        config.cover || '',
        (v) => {
          config.cover = v === '' ? null : Number(v);
        },
        'number',
      ),
    );
    const label = el('label', T('Explicitly include the selected private drafts')),
      check = el('input', undefined, { type: 'checkbox' });
    check.checked = config.privateOptIn;
    check.onchange = () =>
      change(() => {
        config.privateOptIn = check.checked;
      });
    label.prepend(check);
    meta.append(
      label,
      el(
        'p',
        T(
          'Default scope is public, password-free, editable articles. Private selection never includes unselected private reference targets.',
        ),
      ),
    );
    const prepare = section('3. Prepare, confirm, download');
    prepare.append(
      el(
        'p',
        T(
          adapter === 'snapshot-v1'
            ? 'This ZIP is a fixed publication snapshot for an export adapter, not yet a complete reading website. Articles and resource bytes are checked again before confirmation and download.'
            : 'Generate a complete offline web book in your browser, inspect its static preview, then confirm and download. Articles and resources are checked again before download.',
        ),
      ),
      actions(),
    );
  }
  run(
    () => api(),
    (data) => {
      catalog = data.items;
      adapters = data.adapters || { 'snapshot-v1': { title: 'Snapshot ZIP' } };
      revision = data.revision;
    },
  );
  window.addEventListener('pagehide', () => {
    if (job)
      fetch(url('/jobs/' + job.token), {
        method: 'DELETE',
        headers: { 'X-WP-Nonce': cfg.nonce },
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => {});
  });
})();
