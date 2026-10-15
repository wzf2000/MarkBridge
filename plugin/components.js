(() => {
  const T = (message) => globalThis.MBBI18n?.t(message) ?? message;
  const F = (message, ...values) => {
    let next = 0;
    return String(message).replace(/%%|%(?:(\d+)\$)?([sd])/g, (token, index, kind) => {
      if (token === '%%') return '%';
      const value = values[index ? Number(index) - 1 : next++];
      return kind === 'd' ? String(Number(value)) : String(value ?? '');
    });
  };

  ('use strict');
  if (window.MarkBridgeComponents) return;
  const EXECUTION_ENABLED = true;
  const CSP =
    "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'";
  const PROTOCOL = 'mbb-component/v1',
    instances = new Map(),
    active = new Set(),
    slots = new Set();
  const random = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join('');
  const changed = () => document.dispatchEvent(new CustomEvent('mbb:teaching-change'));
  const button = (text, action) => {
    const n = document.createElement('button');
    n.type = 'button';
    n.textContent = text;
    n.onclick = action;
    return n;
  };
  function validParams(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    let nodes = 0;
    const walk = (v, depth) => {
      if (++nodes > 1024 || depth > 8) return false;
      if (v === null || typeof v === 'boolean') return true;
      if (typeof v === 'number') return Number.isFinite(v);
      if (typeof v === 'string') return !/[\uD800-\uDFFF]/u.test(v);
      if (typeof v !== 'object') return false;
      return Object.entries(v).every(
        ([key, child]) =>
          !/[\uD800-\uDFFF]/u.test(key) &&
          !['__proto__', 'prototype', 'constructor'].includes(key) &&
          walk(child, depth + 1),
      );
    };
    try {
      return walk(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= 16384;
    } catch {
      return false;
    }
  }
  function enhance(node) {
    if (instances.has(node) || !node.querySelector(':scope > .mbb-teaching-body')) return;
    const signature = node.dataset.mbbTeachingConfig || '{}';
    let config;
    try {
      config = JSON.parse(node.dataset.mbbTeachingConfig || '{}');
      if (!config || typeof config !== 'object' || Array.isArray(config)) return;
    } catch {
      return;
    }
    // Resource authority comes from the server registry, never an article descriptor.
    config.provider = (window.MBBComponents || []).find(
      (p) => p.id === config.component && p.version === config.componentVersion,
    );
    if (!config.provider || config.provider.protocolVersion !== 1) config.status = 'missing';
    const limits = {
      resourceBytes: 524288,
      startupMs: 5000,
      wallMs: 2000,
      traceFrames: 8192,
      traceBytes: 524288,
    };
    const budgets = config.provider?.budgets;
    if (
      !budgets ||
      Object.keys(limits).some(
        (key) =>
          !Number.isSafeInteger(budgets[key]) || budgets[key] < 1 || budgets[key] > limits[key],
      )
    )
      config.status = 'incompatible';
    if (!validParams(config.params)) config.status = 'invalid-params';
    const controls = document.createElement('div');
    controls.dataset.mbbGenerated = '';
    controls.className = 'mbb-component-controls';
    const status = document.createElement('p');
    status.className = 'mbb-component-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    let frame = null,
      session = null,
      runId = null,
      timer = null,
      startup = null,
      loading = false,
      ready = false,
      generation = 0,
      abort = null;
    const send = (type, extra = {}) => {
      if (!frame?.contentWindow) return false;
      const message = { protocol: PROTOCOL, session, type, ...extra };
      try {
        if (
          new TextEncoder().encode(JSON.stringify(message)).length >
          (type === 'init' ? 20480 : 8192)
        ) {
          if (type !== 'cancel')
            failure(T('The component initialization envelope exceeds its budget.'));
          return false;
        }
        frame.contentWindow.postMessage(message, '*');
        return true;
      } catch {
        if (type !== 'cancel') failure(T('The component message could not be sent.'));
        return false;
      }
    };
    function stop(reason) {
      const changedLayout = !!frame || loading;
      generation++;
      abort?.abort();
      abort = null;
      clearTimeout(timer);
      clearTimeout(startup);
      active.delete(node);
      slots.delete(node);
      send('cancel');
      frame?.remove();
      frame = null;
      session = null;
      runId = null;
      loading = false;
      ready = false;
      launch.disabled = false;
      launch.hidden = false;
      close.hidden = true;
      launch.setAttribute('aria-expanded', 'false');
      close.setAttribute('aria-expanded', 'false');
      node.dataset.mbbComponentState = 'closed';
      status.textContent = reason || '';
      if (changedLayout) changed();
    }
    function failure(message) {
      stop(message + T(' Static fallback content remains readable. You can start again.'));
    }
    async function readResource(url, signal) {
      const headerGrace = Math.min(1500, Math.max(1, Math.floor(budgets.startupMs / 3)));
      for (let attempt = 0; attempt < 2; attempt++) {
        if (signal.aborted) throw Error(T('The component could not be loaded.'));
        const request = new AbortController();
        const cancel = () => request.abort();
        signal.addEventListener('abort', cancel, { once: true });
        let headerTimeout = false;
        let headerTimer =
          attempt === 0
            ? setTimeout(() => {
                headerTimeout = true;
                request.abort();
              }, headerGrace)
            : null;
        try {
          const response = await fetch(url, {
            credentials: 'omit',
            redirect: 'error',
            signal: request.signal,
          });
          clearTimeout(headerTimer);
          headerTimer = null;
          if (!response.ok) throw Error(T('The component resource is unavailable'));
          if (Number(response.headers.get('content-length')) > budgets.resourceBytes)
            throw Error(T('The component resource is too large'));
          const reader = response.body?.getReader();
          if (!reader) throw Error(T('This browser does not support bounded resource reads'));
          const chunks = [];
          let size = 0;
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > budgets.resourceBytes) {
              await reader.cancel();
              throw Error(T('The component resource is too large'));
            }
            chunks.push(part.value);
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const part of chunks) {
            bytes.set(part, offset);
            offset += part.byteLength;
          }
          return bytes;
        } catch (error) {
          // Only a first request still waiting for headers may retry. The outer
          // startup watchdog and user cancellation still cover both requests.
          if (attempt !== 0 || !headerTimeout || signal.aborted || error.name !== 'AbortError')
            throw error;
        } finally {
          clearTimeout(headerTimer);
          signal.removeEventListener('abort', cancel);
          request.abort();
        }
      }
    }
    async function launchComponent() {
      stop();
      const current = ++generation;
      if (config.status !== 'available' || !config.provider?.resource) {
        status.textContent = T(
          'The component is missing, incompatible, or failed resource verification. Static fallback content and configuration are preserved.',
        );
        return;
      }
      if (
        !window.crypto?.subtle ||
        !window.AbortController ||
        !window.TextDecoder ||
        !window.TextEncoder
      ) {
        status.textContent = T(
          'This browser cannot safely verify the isolated component. Static fallback content is preserved.',
        );
        return;
      }
      if (slots.size >= 4) {
        status.textContent = T(
          'Four interactive previews are already open. Close another preview first.',
        );
        return;
      }
      slots.add(node);
      loading = true;
      node.dataset.mbbComponentState = 'loading';
      launch.setAttribute('aria-expanded', 'true');
      close.setAttribute('aria-expanded', 'true');
      launch.disabled = true;
      launch.hidden = true;
      close.hidden = false;
      status.textContent = T('Verifying component resources…');
      abort = new AbortController();
      startup = setTimeout(() => {
        if (current === generation) failure(T('Component initialization timed out.'));
      }, budgets.startupMs);
      try {
        const url = new URL(config.provider.resource.url, location.href);
        if (url.origin !== location.origin)
          throw Error(T('Only registered local resources are allowed'));
        const bytes = await readResource(url, abort.signal);
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          (v) => v.toString(16).padStart(2, '0'),
        ).join('');
        if (digest !== config.provider.resource.sha256)
          throw Error(T('The component resource digest does not match'));
        if (current !== generation || !node.isConnected) return;
        session = random();
        frame = document.createElement('iframe');
        frame.title = config.provider.title + T(' isolated interactive preview');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.referrerPolicy = 'no-referrer';
        frame.className = 'mbb-component-frame';
        frame.id = 'mbb-component-frame-' + session;
        launch.setAttribute('aria-controls', frame.id);
        close.setAttribute('aria-controls', frame.id);
        const launchedFrame = frame;
        let initialized = false;
        frame.onload = () => {
          if (current !== generation || frame !== launchedFrame || !node.isConnected) return;
          if (initialized) {
            failure(T('The isolated component attempted unauthorized navigation.'));
            return;
          }
          initialized = true;
          send('init', {
            params: config.params,
            execution: EXECUTION_ENABLED,
            ...(config.provider.supportsUiLocale === true
              ? { uiLocale: window.MBB_UI_LOCALE === 'zh_CN' ? 'zh_CN' : 'en_US' }
              : {}),
            component: config.component,
            componentVersion: config.componentVersion,
            budgets,
          });
        };
        frame.srcdoc =
          '<meta http-equiv="Content-Security-Policy" content="' +
          CSP +
          '">' +
          new TextDecoder().decode(bytes);
        controls.append(frame);
        close.hidden = false;
        status.textContent = T('Initializing the isolated component…');
        changed();
      } catch (error) {
        if (current === generation)
          failure(error.message || T('The component could not be loaded.'));
      }
    }
    const launch = button(T('Start interactive demonstration'), launchComponent),
      close = button(T('Close interactive preview'), () => {
        stop();
        launch.focus();
      });
    launch.className = close.className = 'mbb-component-toggle';
    launch.setAttribute('aria-expanded', 'false');
    close.setAttribute('aria-expanded', 'false');
    node.dataset.mbbComponentState = 'closed';
    close.hidden = true;
    controls.append(launch, close, status);
    node.insertBefore(controls, node.firstChild);
    status.textContent =
      config.status === 'available'
        ? ''
        : T(
            'The component is missing or incompatible. Static fallback content and configuration are preserved.',
          );
    const receive = (event) => {
      const data = event.data;
      if (
        !frame ||
        event.source !== frame.contentWindow ||
        data?.protocol !== PROTOCOL ||
        data.session !== session
      )
        return;
      try {
        if (new TextEncoder().encode(JSON.stringify(data)).length > 8192) {
          failure(T('The component message exceeds its budget.'));
          return;
        }
      } catch {
        failure(T('The component message format is invalid.'));
        return;
      }
      if (
        data.type === 'complete' &&
        runId &&
        data.runId === runId &&
        (!Number.isSafeInteger(data.frameCount) ||
          data.frameCount < 0 ||
          data.frameCount > budgets.traceFrames ||
          !Number.isSafeInteger(data.outputBytes) ||
          data.outputBytes < 0 ||
          data.outputBytes > budgets.traceBytes ||
          ['comparisons', 'moves'].some(
            (key) => data[key] !== undefined && (!Number.isSafeInteger(data[key]) || data[key] < 0),
          ) ||
          (data.matches !== undefined && typeof data.matches !== 'boolean'))
      ) {
        failure(T('The execution summary exceeds its budget or has an invalid format.'));
        return;
      }
      if (data.type === 'ready' && !ready) {
        clearTimeout(startup);
        loading = false;
        ready = true;
        node.dataset.mbbComponentState = 'ready';
        status.textContent = '';
      } else if (data.type === 'resize' && Number.isFinite(data.height))
        frame.style.height = Math.min(1200, Math.max(280, data.height)) + 'px';
      else if (data.type === 'run-request') {
        if (!/^[a-f0-9]{32}$/.test(data.runId || '')) return;
        if (runId === data.runId) return;
        if (!EXECUTION_ENABLED || !ready || runId) {
          send('denied', { runId: data.runId, code: 'UNAVAILABLE' });
          return;
        }
        if (active.size >= 2 && !active.has(node)) {
          send('denied', { runId: data.runId, code: 'BUSY' });
          return;
        }
        clearTimeout(timer);
        active.add(node);
        runId = data.runId;
        const expectedRun = runId;
        timer = setTimeout(() => {
          if (runId === expectedRun)
            failure(T('Execution exceeded its time budget and was terminated.'));
        }, budgets.wallMs);
        send('grant', { runId });
      } else if (data.type === 'error' && !ready) {
        failure(T('Component initialization failed.'));
      } else if (
        ['complete', 'error', 'stopped'].includes(data.type) &&
        runId &&
        data.runId === runId
      ) {
        clearTimeout(timer);
        active.delete(node);
        runId = null;
        status.textContent =
          data.type === 'complete'
            ? T('Execution completed. The recorded trace is ready for playback.')
            : data.type === 'stopped'
              ? T('Execution stopped.')
              : T('Execution failed. Static fallback content remains readable.');
      }
    };
    window.addEventListener('message', receive);
    instances.set(node, {
      signature,
      controls,
      stop,
      hidden() {
        if (frame || loading)
          stop(
            T(
              'The content is hidden and its interactive preview was terminated. Expand it to start again.',
            ),
          );
      },
      dispose() {
        stop();
        window.removeEventListener('message', receive);
        controls.remove();
        instances.delete(node);
      },
    });
  }
  function scan() {
    for (const [node, instance] of instances)
      if (
        !node.isConnected ||
        !instance.controls.isConnected ||
        (node.dataset.mbbTeachingConfig || '{}') !== instance.signature
      )
        instance.dispose();
    for (const node of document.querySelectorAll('[data-mbb-teaching="component"]')) enhance(node);
  }
  const observer = new MutationObserver(scan);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-mbb-teaching-config'],
  });
  scan();
  window.addEventListener('pagehide', () => {
    for (const instance of instances.values())
      instance.stop(
        T('The page is suspended. Explicitly restart the interactive preview after returning.'),
      );
  });
  document.addEventListener('mbb:teaching-change', () => {
    for (const [node, instance] of instances) if (node.closest('[hidden]')) instance.hidden();
  });
  window.addEventListener('pageshow', scan);
  window.MarkBridgeComponents = {
    protocol: PROTOCOL,
    scan,
    activeCount: () => active.size,
    frameCount: () => slots.size,
  };
})();
