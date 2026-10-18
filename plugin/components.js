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
  const automaticStarting = new Set();
  let readerPageActive = true,
    readerPumpScheduled = false;
  const readerNear = (node) => {
    if (!node.isConnected || node.closest('[hidden]') || !node.getClientRects().length)
      return false;
    const bounds = node.getBoundingClientRect();
    return bounds.bottom >= -240 && bounds.top <= innerHeight + 240;
  };
  function pumpReaders() {
    if (readerPumpScheduled) return;
    readerPumpScheduled = true;
    queueMicrotask(() => {
      readerPumpScheduled = false;
      for (const instance of instances.values()) instance.readerVisibility?.();
      if (!readerPageActive || document.visibilityState === 'hidden') return;
      for (const instance of instances.values()) {
        if (automaticStarting.size >= 2 || slots.size >= 4 || active.size >= 2) break;
        instance.startAutomatic?.();
      }
    });
  }
  const readerObserver =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(pumpReaders, { rootMargin: '240px 0px' })
      : null;
  window.addEventListener('scroll', pumpReaders, { passive: true });
  window.addEventListener('resize', pumpReaders);
  document.addEventListener('visibilitychange', pumpReaders);
  const random = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join('');
  const coded = (code, message) => Object.assign(Error(T(message)), { mbbCode: code });
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
  // This fixed host presentation is applied only after the registered resource SHA matches.
  // It does not alter the immutable provider payload or accept article-supplied styles/scripts.
  function readingLayout(protocol, token, activity) {
    let active = true,
      pending = false,
      previous = 0;
    const measure = () => {
      pending = false;
      if (!active || !document.body) return;
      const body = document.body;
      const children = [...body.children].filter((n) => !['SCRIPT', 'STYLE'].includes(n.tagName));
      // height:auto/min-height:0 in the fixed reading style makes this the natural
      // body box, including padding and descendant margins collapsed past <main>.
      // Unlike scrollHeight/clientHeight it has no current-viewport floor, so it can shrink.
      const bottom = Math.max(
        body.getBoundingClientRect().bottom +
          scrollY +
          (parseFloat(getComputedStyle(body).marginBottom) || 0),
        ...children.map((n) => {
          const rect = n.getBoundingClientRect();
          return rect.bottom + scrollY + (parseFloat(getComputedStyle(n).marginBottom) || 0);
        }),
      );
      const height = Math.min(4096, Math.max(160, Math.ceil(bottom + 2)));
      if (height !== previous) {
        previous = height;
        parent.postMessage({ protocol, session: token, type: 'layout-size', height }, '*');
      }
    };
    const schedule = () => {
      if (active && !pending) {
        pending = true;
        requestAnimationFrame(measure);
      }
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    const mutations = new MutationObserver(schedule);
    const start = () => {
      if (!active) return;
      observer?.observe(document.body);
      mutations.observe(document.body, { childList: true, subtree: true, attributes: true });
      document.fonts?.ready.then(schedule);
      schedule();
    };
    const dispose = () => {
      active = false;
      observer?.disconnect();
      mutations.disconnect();
      removeEventListener('resize', schedule);
      removeEventListener('message', cancel);
      document.removeEventListener('change', answer);
      document.removeEventListener('click', reset);
    };
    const cancel = (event) => {
      if (
        event.source === parent &&
        event.data?.protocol === protocol &&
        event.data.session === token &&
        event.data.type === 'cancel'
      )
        dispose();
    };
    const answer = (event) => {
      if (active && activity && event.target.matches?.('input[type="radio"]')) {
        const check = document.getElementById('check');
        if (check && !check.disabled) check.click();
      }
    };
    const reset = (event) => {
      if (active && activity && event.target.closest?.('#reset'))
        parent.postMessage({ protocol, session: token, type: 'activity-reset' }, '*');
    };
    document.addEventListener('change', answer);
    document.addEventListener('click', reset);
    addEventListener('message', cancel);
    addEventListener('resize', schedule);
    addEventListener('pagehide', dispose, { once: true });
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
  const readingStyle =
    '<style>html,body{height:auto!important;min-height:0!important;min-block-size:0!important;overscroll-behavior:auto!important}body *:not(svg,svg *,textarea,input,select){max-height:none!important;max-block-size:none!important;overscroll-behavior:auto!important}</style>';
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
    const diagram =
      window.MBB_COMPONENTS_READER === true && config.provider?.readerMode === 'diagram';
    let readerClosed = false,
      readerFailed = false;
    if (diagram) node.classList.add('mbb-component-diagram');
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
      abort = null,
      diagnostic = null,
      startupDeadline = 0,
      runDeadline = 0,
      activityProjection = null,
      layoutHeight = 0;
    const activityHandles = new Map();
    const activityParts = () =>
      [...node.querySelectorAll('[id]')].filter(
        (part) => part.closest('[data-mbb-teaching=component]') === node,
      );
    function resetActivity() {
      if (!config.activity || config.status !== 'available') return;
      const a = config.activity,
        hidden = new Set([...a.hints, a.feedback.correct, a.feedback.incorrect, a.explanation]);
      for (const part of activityParts())
        if (hidden.has(part.id)) {
          part.hidden = true;
          part.classList.add('mbb-activity-disclosure');
          part.querySelector(':scope > .mbb-teaching-controls[data-mbb-generated]')?.remove();
          const title = part.querySelector(':scope > .mbb-teaching-title'),
            body = part.querySelector(':scope > .mbb-teaching-body');
          if (title) title.hidden = false;
          if (body) body.hidden = false;
        }
    }
    function showStaticActivity() {
      for (const part of activityParts())
        if (part.classList.contains('mbb-activity-disclosure')) part.hidden = false;
    }

    function projectActivity() {
      activityHandles.clear();
      if (!config.activity) return null;
      if (config.provider?.activityVersion !== 1) throw Error('Invalid activity provider');
      const parts = new Map(
        [...node.querySelectorAll('[id]')]
          .filter(
            (part) =>
              part.closest('[data-mbb-teaching=component]') === node &&
              part.matches('[data-mbb-teaching=collapse],.wp-block-mbb-collapse'),
          )
          .map((part) => [part.id, part]),
      );
      const handle = (id) => {
        const target = parts.get(id);
        if (!target) throw Error('Missing activity target');
        const key = random();
        activityHandles.set(key, target);
        return key;
      };
      const a = config.activity;
      return {
        schema: 1,
        prompt: handle(a.prompt),
        options: a.options.map((option) => ({
          key: option.key,
          handle: handle(option.target),
          label: [
            ...(parts.get(option.target)?.querySelector('.mbb-teaching-title,summary')
              ?.textContent || option.key),
          ]
            .slice(0, 80)
            .join(''),
        })),
        hints: a.hints.map(handle),
        feedback: { correct: handle(a.feedback.correct), incorrect: handle(a.feedback.incorrect) },
        explanation: handle(a.explanation),
      };
    }
    const send = (type, extra = {}) => {
      if (!frame?.contentWindow) return false;
      const message = { protocol: PROTOCOL, session, type, ...extra };
      try {
        if (
          new TextEncoder().encode(JSON.stringify(message)).length >
          (type === 'init' ? 20480 : 8192)
        ) {
          if (type !== 'cancel')
            failure(T('The component initialization envelope exceeds its budget.'), 'PROTOCOL');
          return false;
        }
        frame.contentWindow.postMessage(message, '*');
        return true;
      } catch {
        if (type !== 'cancel') failure(T('The component message could not be sent.'), 'PROTOCOL');
        return false;
      }
    };
    function stop(reason, preserveHeight = false) {
      const changedLayout = !!frame || loading;
      if (diagram) {
        if (preserveHeight && frame)
          controls.style.minBlockSize = controls.getBoundingClientRect().height + 'px';
        if (!preserveHeight) controls.style.removeProperty('min-block-size');
        automaticStarting.delete(node);
      }
      generation++;
      activityHandles.clear();
      activityProjection = null;
      startupDeadline = runDeadline = 0;
      layoutHeight = 0;
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
      if (readStatic) readStatic.hidden = false;
      launch.setAttribute('aria-expanded', 'false');
      close.setAttribute('aria-expanded', 'false');
      node.dataset.mbbComponentState = 'closed';
      resetActivity();
      status.classList.remove('mbb-component-complete');
      status.textContent = reason || '';
      window.MBB_DIAGNOSTICS?.clear(controls);
      delete node.dataset.mbbFailureCode;
      if (changedLayout) changed();
      pumpReaders();
    }
    function report(code) {
      showStaticActivity();
      node.dataset.mbbFailureCode = code;
      const record = diagnostic?.failure(code);
      if (record) window.MBB_DIAGNOSTICS?.show(controls, record);
    }
    function failure(message, code = 'UNAVAILABLE') {
      if (diagram) readerFailed = true;
      const record = diagnostic?.failure(code);
      stop(message + T(' Static fallback content remains readable. You can start again.'));
      showStaticActivity();
      node.dataset.mbbFailureCode = code;
      if (record) window.MBB_DIAGNOSTICS?.show(controls, record);
    }
    async function readResource(url, signal) {
      const headerGrace = Math.min(1500, Math.max(1, Math.floor(budgets.startupMs / 3)));
      for (let attempt = 0; attempt < 2; attempt++) {
        if (signal.aborted) throw coded('NETWORK', 'The component could not be loaded.');
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
          if (!response.ok) throw coded('HTTP', 'The component resource is unavailable');
          const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
          if (type && !['text/plain', 'text/html'].includes(type))
            throw coded('RESOURCE_TYPE', 'The component resource has an unexpected content type.');
          if (Number(response.headers.get('content-length')) > budgets.resourceBytes)
            throw coded('RESOURCE_SIZE', 'The component resource is too large');
          const reader = response.body?.getReader();
          if (!reader)
            throw coded('UNSUPPORTED', 'This browser does not support bounded resource reads');
          const chunks = [];
          let size = 0;
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > budgets.resourceBytes) {
              await reader.cancel();
              throw coded('RESOURCE_SIZE', 'The component resource is too large');
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
    async function launchComponent(automatic = false) {
      stop('', diagram && !readerClosed);
      if (diagram && !controls.style.minBlockSize) controls.style.minBlockSize = '280px';
      if (diagram) {
        readerClosed = false;
        readerFailed = false;
        if (automatic) automaticStarting.add(node);
      }
      const current = ++generation;
      diagnostic = window.MBB_DIAGNOSTICS?.begin('component', config.provider);
      if (config.status !== 'available' || !config.provider?.resource) {
        status.textContent = T(
          'The component is missing, incompatible, or failed resource verification. Static fallback content and configuration are preserved.',
        );
        report('UNAVAILABLE');
        if (diagram) {
          readerFailed = true;
          automaticStarting.delete(node);
          pumpReaders();
        }
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
        report('UNSUPPORTED');
        if (diagram) {
          readerFailed = true;
          automaticStarting.delete(node);
          pumpReaders();
        }
        return;
      }
      if (slots.size >= 4) {
        status.textContent = T(
          'Four interactive previews are already open. Close another preview first.',
        );
        report('BUSY');
        if (diagram) {
          readerFailed = true;
          automaticStarting.delete(node);
          pumpReaders();
        }
        return;
      }
      try {
        activityProjection = projectActivity();
      } catch {
        failure(
          T(
            'Activity targets must exist within their own component; prompts and options must be direct open static parts',
          ),
          'ACTIVITY_TARGET',
        );
        return;
      }
      slots.add(node);
      loading = true;
      startupDeadline = performance.now() + budgets.startupMs;
      node.dataset.mbbComponentState = 'loading';
      launch.setAttribute('aria-expanded', 'true');
      close.setAttribute('aria-expanded', 'true');
      launch.disabled = true;
      launch.hidden = true;
      if (readStatic) readStatic.hidden = true;
      close.hidden = false;
      status.textContent = T('Verifying component resources…');
      abort = new AbortController();
      startup = setTimeout(() => {
        if (current === generation)
          failure(T('Component initialization timed out.'), 'STARTUP_TIMEOUT');
      }, budgets.startupMs);
      try {
        const url = new URL(config.provider.resource.url, location.href);
        if (url.origin !== location.origin)
          throw coded('RESOURCE_ORIGIN', 'Only registered local resources are allowed');
        const bytes = await readResource(url, abort.signal);
        diagnostic?.stage('integrity');
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          (v) => v.toString(16).padStart(2, '0'),
        ).join('');
        if (digest !== config.provider.resource.sha256)
          throw coded('DIGEST', 'The component resource digest does not match');
        if (current !== generation || !node.isConnected) return;
        diagnostic?.stage('initialization');
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
            failure(T('The isolated component attempted unauthorized navigation.'), 'NAVIGATION');
            return;
          }
          initialized = true;
          send('init', {
            params: config.params,
            ...(activityProjection ? { activity: activityProjection } : {}),
            execution: EXECUTION_ENABLED,
            ...(diagram ? { presentation: 'diagram' } : {}),
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
          new TextDecoder().decode(bytes) +
          readingStyle +
          '<script>(' +
          readingLayout.toString() +
          ')(' +
          JSON.stringify(PROTOCOL) +
          ',' +
          JSON.stringify(session) +
          ',' +
          JSON.stringify(!!config.activity) +
          ')</scr' +
          'ipt>';
        controls.append(frame);
        close.hidden = false;
        status.textContent = T('Initializing the isolated component…');
        changed();
      } catch (error) {
        if (current === generation)
          failure(
            error.mbbCode ? error.message : T('The component could not be loaded.'),
            error.mbbCode || 'NETWORK',
          );
      }
    }
    const launch = button(diagram ? T('Show diagram') : T('Start interactive demonstration'), () =>
        launchComponent(),
      ),
      close = button(diagram ? T('Collapse diagram') : T('Close interactive preview'), () => {
        if (diagram) readerClosed = true;
        stop();
        launch.focus();
      });
    const readStatic = config.activity
      ? button(T('Read the complete activity'), () => showStaticActivity())
      : null;
    launch.className = close.className = diagram ? 'mbb-diagram-toggle' : 'mbb-component-toggle';
    launch.setAttribute('aria-expanded', 'false');
    close.setAttribute('aria-expanded', 'false');
    node.dataset.mbbComponentState = 'closed';
    close.hidden = true;
    controls.append(launch, close, ...(readStatic ? [readStatic] : []), status);
    resetActivity();
    if (config.activity) {
      const body = node.querySelector(':scope > .mbb-teaching-body'),
        roleIds = new Set([
          config.activity.prompt,
          ...(config.activity.options || []).map((o) => o.target),
        ]),
        anchor = [...(body?.children || [])].filter((part) => roleIds.has(part.id)).at(-1);
      if (anchor) anchor.after(controls);
      else (body || node).append(controls);
    } else node.insertBefore(controls, node.firstChild);
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
      if (
        (!ready && performance.now() > startupDeadline) ||
        (runId && performance.now() > runDeadline)
      ) {
        failure(T('Execution exceeded its time budget and was terminated.'), 'RUN_BUDGET');
        return;
      }
      try {
        if (new TextEncoder().encode(JSON.stringify(data)).length > 8192) {
          failure(T('The component message exceeds its budget.'), 'PROTOCOL');
          return;
        }
      } catch {
        failure(T('The component message format is invalid.'), 'PROTOCOL');
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
        failure(
          T('The execution summary exceeds its budget or has an invalid format.'),
          'PROTOCOL',
        );
        return;
      }
      if (
        (!ready && performance.now() > startupDeadline) ||
        (runId && performance.now() > runDeadline)
      ) {
        failure(T('Execution exceeded its time budget and was terminated.'), 'RUN_BUDGET');
        return;
      }
      if (data.type === 'activity-reset') {
        if (ready && config.activity && Object.keys(data).length === 3) resetActivity();
        return;
      }
      if (data.type === 'reveal-target') {
        if (
          Object.keys(data).length !== 4 ||
          Object.keys(data).some(
            (key) => !['protocol', 'session', 'type', 'handle'].includes(key),
          ) ||
          node.dataset.mbbTeachingConfig !== signature
        )
          return;
        const target = activityHandles.get(data.handle);
        if (
          !ready ||
          !config.activity ||
          !node.isConnected ||
          node.closest('[hidden]') ||
          !node.getClientRects().length ||
          !target?.isConnected ||
          target.closest('[data-mbb-teaching=component]') !== node ||
          !window.MarkBridgeTeaching?.revealTarget
        )
          return;
        if (config.activity) {
          const feedback = config.activity.feedback;
          if ([feedback.correct, feedback.incorrect].includes(target.id)) {
            for (const part of node.querySelectorAll('[id]'))
              if (
                part.closest('[data-mbb-teaching=component]') === node &&
                [feedback.correct, feedback.incorrect].includes(part.id)
              )
                part.hidden = part !== target;
          }
          target.hidden = false;
        }
        window.MarkBridgeTeaching.revealTarget(target);
        target.scrollIntoView({ block: 'nearest' });
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
        return;
      }
      // Summary validation/structured serialization can itself consume the remaining time.
      if (
        (!ready && performance.now() > startupDeadline) ||
        (runId && performance.now() > runDeadline)
      ) {
        failure(T('Execution exceeded its time budget and was terminated.'), 'RUN_BUDGET');
        return;
      }
      if (data.type === 'ready' && !ready) {
        clearTimeout(startup);
        automaticStarting.delete(node);
        pumpReaders();
        loading = false;
        ready = true;
        node.dataset.mbbComponentState = 'ready';
        status.textContent = '';
      } else if (['resize', 'layout-size'].includes(data.type)) {
        if (!Number.isFinite(data.height) || data.height < 1 || data.height > 4096) return;
        if (data.type === 'layout-size') layoutHeight = Math.ceil(data.height);
        frame.style.height =
          Math.max(diagram ? 160 : 280, layoutHeight || Math.ceil(data.height)) + 'px';
        if (diagram) controls.style.removeProperty('min-block-size');
      } else if (data.type === 'run-request') {
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
        window.MBB_DIAGNOSTICS?.clear(controls);
        delete node.dataset.mbbFailureCode;
        diagnostic = window.MBB_DIAGNOSTICS?.begin('component', config.provider);
        diagnostic?.stage('execution');
        active.add(node);
        runId = data.runId;
        status.classList.remove('mbb-component-complete');
        runDeadline = performance.now() + budgets.wallMs;
        const expectedRun = runId;
        timer = setTimeout(() => {
          if (runId === expectedRun)
            failure(T('Execution exceeded its time budget and was terminated.'), 'RUN_BUDGET');
        }, budgets.wallMs);
        send('grant', { runId });
      } else if (data.type === 'error' && !ready) {
        failure(T('Component initialization failed.'), 'INITIALIZATION');
      } else if (
        ['complete', 'error', 'stopped'].includes(data.type) &&
        runId &&
        data.runId === runId
      ) {
        if (performance.now() > runDeadline) {
          failure(T('Execution exceeded its time budget and was terminated.'), 'RUN_BUDGET');
          return;
        }
        clearTimeout(timer);
        active.delete(node);
        runId = null;
        status.classList.toggle('mbb-component-complete', data.type === 'complete');
        status.textContent =
          data.type === 'complete'
            ? diagram
              ? ''
              : T('Component execution completed.')
            : data.type === 'stopped'
              ? T('Execution stopped.')
              : T('Execution failed. Static fallback content remains readable.');
        pumpReaders();
        if (data.type === 'error') {
          if (diagram) readerFailed = true;
          node.dataset.mbbFailureCode = 'EXECUTION';
          const record = diagnostic?.failure('EXECUTION');
          if (record) window.MBB_DIAGNOSTICS?.show(controls, record);
        }
      }
    };
    window.addEventListener('message', receive);
    instances.set(node, {
      signature,
      controls,
      stop,
      readerVisibility(force = false) {
        if (!diagram || (!force && readerNear(node))) return;
        if ((frame || loading) && document.activeElement !== frame) {
          stop('', true);
          launch.hidden = true;
          node.dataset.mbbComponentState = 'suspended';
        }
      },
      startAutomatic() {
        if (
          diagram &&
          !readerClosed &&
          !readerFailed &&
          readerNear(node) &&
          !frame &&
          !loading &&
          config.status === 'available'
        )
          void launchComponent(true);
      },
      hidden() {
        if (diagram) {
          if (frame || loading) {
            stop('', true);
            launch.hidden = true;
          }
          return;
        }
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
        readerObserver?.unobserve(node);
        node.classList.remove('mbb-component-diagram');
        instances.delete(node);
      },
    });
    if (diagram) readerObserver?.observe(node);
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
    pumpReaders();
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
    readerPageActive = false;
    for (const instance of instances.values())
      instance.stop(
        T('The page is suspended. Explicitly restart the interactive preview after returning.'),
      );
  });
  document.addEventListener('mbb:teaching-change', () => {
    for (const [node, instance] of instances) if (node.closest('[hidden]')) instance.hidden();
  });
  window.addEventListener('pageshow', () => {
    readerPageActive = true;
    scan();
  });
  window.addEventListener('beforeprint', () => {
    readerPageActive = false;
    for (const instance of instances.values()) instance.readerVisibility?.(true);
  });
  window.addEventListener('afterprint', () => {
    readerPageActive = true;
    pumpReaders();
  });
  window.MarkBridgeComponents = {
    protocol: PROTOCOL,
    scan,
    activeCount: () => active.size,
    frameCount: () => slots.size,
  };
})();
