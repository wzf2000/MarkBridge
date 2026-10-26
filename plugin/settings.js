(() => {
  const discovery = (root) => {
    const messages = JSON.parse(root.dataset.messages);
    const query = root.querySelector('input[type="search"]');
    const ids = root.closest('form').querySelector('#mbb-extension-ids');
    const search = root.querySelector('[data-mbb-search]');
    const previous = root.querySelector('[data-mbb-search-previous]');
    const next = root.querySelector('[data-mbb-search-next]');
    const status = root.querySelector('[data-mbb-search-status]');
    const results = root.querySelector('[data-mbb-search-results]');
    let generation = 0,
      request,
      cursors = [null],
      nextCursor = null,
      loading = false;
    const selected = () => {
      if (!ids.value.trim()) return new Set();
      const values = ids.value.split(',').map((value) => value.trim());
      if (values.some((value) => !/^[1-9][0-9]{0,9}$/.test(value))) return null;
      return new Set(values);
    };
    const buttons = () => {
      search.disabled = loading;
      previous.disabled = loading || cursors.length < 2;
      next.disabled = loading || !nextCursor;
    };
    const notice = (message, error = false) => {
      status.setAttribute('role', error ? 'alert' : 'status');
      status.textContent = message;
    };
    const refreshSelection = () => {
      const chosen = selected();
      for (const checkbox of results.querySelectorAll('input'))
        checkbox.checked = chosen?.has(checkbox.value) || false;
    };
    const load = async () => {
      request?.abort();
      request = new AbortController();
      const current = ++generation,
        text = query.value;
      loading = true;
      results.replaceChildren();
      nextCursor = null;
      buttons();
      notice(messages.loading);
      try {
        const url = new URL(root.dataset.url, location.href);
        url.searchParams.set('q', text);
        if (cursors.at(-1)) url.searchParams.set('cursor', cursors.at(-1));
        const response = await fetch(url, {
          credentials: 'same-origin',
          headers: { 'X-WP-Nonce': root.dataset.nonce },
          signal: request.signal,
        });
        const data = await response.json();
        if (current !== generation || text !== query.value) return;
        if (!response.ok) throw new Error(data.message || messages.failed);
        if (
          !Array.isArray(data.items) ||
          data.items.length > 20 ||
          (data.cursor !== null && typeof data.cursor !== 'string')
        )
          throw new Error(messages.failed);
        results.replaceChildren();
        for (const item of data.items) {
          if (
            !Number.isSafeInteger(item.id) ||
            item.id < 1 ||
            typeof item.title !== 'string' ||
            typeof item.status !== 'string'
          )
            throw new Error(messages.failed);
          const row = document.createElement('li'),
            label = document.createElement('label'),
            checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = String(item.id);
          checkbox.addEventListener('change', () => {
            const chosen = selected();
            if (!chosen) {
              refreshSelection();
              notice(messages.invalid, true);
              return;
            }
            if (checkbox.checked) chosen.add(checkbox.value);
            else chosen.delete(checkbox.value);
            if (chosen.size > 50) {
              refreshSelection();
              notice(messages.limit, true);
              return;
            }
            ids.value = [...chosen].join(', ');
            ids.dispatchEvent(new Event('input', { bubbles: true }));
            notice('');
          });
          label.append(
            checkbox,
            ' ' +
              (item.title || messages.untitled) +
              ' · #' +
              item.id +
              ' · ' +
              (messages.statuses[item.status] || item.status),
          );
          row.append(label);
          results.append(row);
        }
        nextCursor = data.cursor;
        refreshSelection();
        notice(data.items.length ? '' : data.cursor ? messages.continue : messages.empty);
      } catch (error) {
        if (current === generation && error.name !== 'AbortError')
          notice(error.message || messages.failed, true);
      } finally {
        if (current === generation) {
          loading = false;
          buttons();
        }
      }
    };
    query.addEventListener('input', () => {
      generation++;
      request?.abort();
      loading = false;
      cursors = [null];
      nextCursor = null;
      results.replaceChildren();
      notice('');
      buttons();
    });
    query.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        cursors = [null];
        load();
      }
    });
    search.addEventListener('click', () => {
      cursors = [null];
      load();
    });
    previous.addEventListener('click', () => {
      cursors.pop();
      load();
    });
    next.addEventListener('click', () => {
      if (nextCursor) {
        cursors.push(nextCursor);
        load();
      }
    });
    ids.addEventListener('input', refreshSelection);
    buttons();
  };
  const start = () => {
    document.querySelectorAll('[data-mbb-extension-discovery]').forEach(discovery);
    for (const form of document.querySelectorAll('.mbb-settings form')) {
      const fields = form.querySelector('[data-mbb-node-fields]');
      if (!fields) continue;
      const update = () => {
        fields.hidden =
          form.querySelector('input[name="converter[backend]"]:checked')?.value === 'php';
      };
      form.addEventListener('change', update);
      update();
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
