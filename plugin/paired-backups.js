(() => {
  'use strict';
  const cfg = window.MBB_EDITOR;
  if (!cfg?.recovery || !Number(cfg.postId)) return;
  const T = (s) => globalThis.MBBI18n?.t(s) ?? s;
  const el = (tag, text = '') => {
    const n = document.createElement(tag);
    n.textContent = text;
    return n;
  };
  let serial = 0,
    timer,
    lastAttempt = 0,
    enabled = true,
    context,
    panel,
    status,
    rows,
    restoreOperation = 0;
  const requests = new Set();
  function cancel() {
    serial++;
    clearTimeout(timer);
    requests.forEach((c) => c.abort());
    requests.clear();
  }
  async function api(method = 'GET', data = {}, epoch = serial) {
    const controller = new AbortController();
    requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(
        cfg.url('paired-backups' + (method === 'GET' ? '?post_id=' + Number(cfg.postId) : '')),
        {
          method,
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'X-WP-Nonce': cfg.nonce, 'Content-Type': 'application/json' },
          ...(method === 'GET'
            ? {}
            : { body: JSON.stringify({ ...data, post_id: Number(cfg.postId) }) }),
        },
      );
      const value = await response.json();
      if (epoch !== serial) throw Error(T('The recovery session changed.'));
      if (!response.ok) throw Error(globalThis.MBBI18n?.error(value) || value.message);
      return value;
    } finally {
      clearTimeout(timeout);
      requests.delete(controller);
    }
  }
  function render(value) {
    context = value.context;
    status.textContent = T('Last formal save: ') + value.saved + ' UTC';
    if (value.items.length)
      status.textContent +=
        ' · ' +
        T('Last paired backup: ') +
        new Date(value.items[0].created * 1000).toLocaleString();
    rows.replaceChildren();
    for (const entry of value.items) {
      const row = el('div');
      row.className = 'mbb-recovery-row';
      row.append(el('span', new Date(entry.created * 1000).toLocaleString()));
      const restore = el('button', T('Restore candidate and view differences'));
      restore.type = 'button';
      if (entry.baseline !== context.baseline)
        row.append(el('span', T('Older baseline; compare and resolve conflicts before saving.')));
      restore.onclick = async () => {
        const epoch = serial,
          opening = context,
          operation = ++restoreOperation;
        restore.disabled = true;
        try {
          const prepared = await api('POST', { key: entry.key, context: opening }, epoch);
          // The persisted record stays intact. Explicit adoption compares its candidate with today's pair.
          const record = { ...prepared, context: prepared.currentContext };
          if (prepared.stale)
            status.textContent = T(
              'This backup has an older baseline. Compare it with the current article before explicitly saving.',
            );
          if (epoch !== serial) return;
          const adopted = await window.MarkBridgeEditorRecovery.restore(
            record,
            async (baseline = null) => {
              const checkEpoch = serial;
              const fresh = await api('GET', {}, checkEpoch);
              const expected = baseline || prepared.currentContext;
              if (
                expected.expected !== fresh.context.expected ||
                expected.sourceDigest !== fresh.context.sourceDigest
              )
                throw Error(
                  T(
                    'Paired backup verification failed. Current input is preserved; compare the article and try again.',
                  ),
                );
              await api('POST', { key: entry.key, context: fresh.context }, checkEpoch);
            },
          );
          if (adopted && operation === restoreOperation && restore.isConnected)
            status.textContent = T(
              'The candidate is in the difference preview and has not been written to WordPress or the source file.',
            );
        } catch (error) {
          if (epoch === serial) status.textContent = error.message;
        } finally {
          if (restore.isConnected) restore.disabled = false;
        }
      };
      const remove = el('button', T('Delete candidate'));
      remove.type = 'button';
      remove.onclick = async () => {
        const epoch = serial;
        try {
          render(await api('DELETE', { key: entry.key }, epoch));
        } catch (error) {
          if (epoch === serial) status.textContent = error.message;
        }
      };
      row.append(restore, remove);
      rows.append(row);
    }
  }
  async function refresh() {
    const epoch = serial;
    try {
      render(await api('GET', {}, epoch));
    } catch (error) {
      if (epoch === serial) status.textContent = error.message;
    }
  }
  function changed(kind, capture) {
    if (!enabled) return;
    cancel();
    const epoch = serial;
    timer = setTimeout(
      async () => {
        if (!enabled || epoch !== serial) return;
        lastAttempt = Date.now();
        try {
          const snapshot = capture();
          if (
            !snapshot ||
            snapshot.postId !== Number(cfg.postId) ||
            snapshot.payload.requiresResources
          )
            return;
          const current = await api('GET', {}, epoch);
          if (
            snapshot.expected !== current.context.expected ||
            (snapshot.sourceDigest || null) !== current.context.sourceDigest
          )
            throw Error(
              T(
                'Paired backup verification failed. Current input is preserved; compare the article and try again.',
              ),
            );
          const payload = snapshot.payload;
          const value = await api(
            'POST',
            {
              context: current.context,
              expected: snapshot.expected,
              mode: kind,
              ...(kind === 'blocks'
                ? { serialized: payload.content }
                : { source: payload.content }),
              title: payload.title,
              status: payload.status,
              featured_media: payload.featuredMedia,
            },
            epoch,
          );
          if (epoch === serial) render(value);
        } catch (error) {
          if (epoch === serial)
            status.textContent =
              T('Paired backup failed. Current input remains in the editor. ') + error.message;
        }
      },
      Math.max(30000, 60000 - (Date.now() - lastAttempt)),
    );
  }
  let waiting;
  function setup() {
    if (panel) return;
    const recovery = document.querySelector('#mbb-local-recovery');
    if (!recovery) {
      if (!waiting) {
        waiting = new MutationObserver(setup);
        waiting.observe(document.body, { childList: true, subtree: true });
      }
      return;
    }
    waiting?.disconnect();
    recovery.querySelector('summary').textContent = T('Draft recovery');
    panel = el('section');
    panel.className = 'mbb-server-backups';
    panel.append(
      el('h3', T('Server paired backups')),
      el(
        'p',
        T(
          'Private to your account. Up to 10 backups per article for 7 days; site quota 32 MiB. Restoring opens a candidate for comparison. Only an explicit save can update WordPress or a source file. New drafts and unconverted input use browser recovery.',
        ),
      ),
    );
    const label = el('label', T('Enable paired backups while this page is open'));
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.onchange = () => {
      enabled = checkbox.checked;
      cancel();
    };
    label.prepend(checkbox);
    status = el('p', T('Checking paired backups…'));
    status.setAttribute('role', 'status');
    rows = el('div');
    const refreshButton = el('button', T('Refresh paired backups'));
    refreshButton.type = 'button';
    refreshButton.onclick = refresh;
    panel.append(label, status, rows, refreshButton);
    recovery.append(panel);
    refresh();
  }
  window.MarkBridgePairedBackups = {
    changed,
    ticket: () => serial,
    saved(ticket) {
      if (ticket === serial) cancel();
      refresh();
    },
  };
  window.addEventListener('pagehide', cancel);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) refresh();
  });
  window.addEventListener('mbb:saved', () => {
    cancel();
    refresh();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
