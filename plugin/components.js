(() => {
  'use strict';
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
          if (type !== 'cancel') failure('组件初始化信封超过预算。');
          return false;
        }
        frame.contentWindow.postMessage(message, '*');
        return true;
      } catch {
        if (type !== 'cancel') failure('组件消息无法发送。');
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
      close.hidden = true;
      if (reason) status.textContent = reason;
      if (changedLayout) changed();
    }
    function failure(message) {
      stop(message + ' 静态替代内容仍可阅读；可重新启动。');
    }
    async function launchComponent() {
      stop();
      const current = ++generation;
      if (config.status !== 'available' || !config.provider?.resource) {
        status.textContent = '组件缺失、版本不兼容或资源校验失败。保留静态替代与原配置。';
        return;
      }
      if (
        !window.crypto?.subtle ||
        !window.AbortController ||
        !window.TextDecoder ||
        !window.TextEncoder
      ) {
        status.textContent = '浏览器无法安全验证隔离组件，保留静态替代。';
        return;
      }
      if (slots.size >= 4) {
        status.textContent = '已打开 4 个交互预览，请先关闭其他预览。';
        return;
      }
      slots.add(node);
      loading = true;
      launch.disabled = true;
      status.textContent = '正在验证组件资源…';
      abort = new AbortController();
      startup = setTimeout(() => {
        if (current === generation) failure('组件初始化超时。');
      }, budgets.startupMs);
      try {
        const url = new URL(config.provider.resource.url, location.href);
        if (url.origin !== location.origin) throw Error('仅允许本地登记资源');
        const response = await fetch(url, {
          credentials: 'omit',
          redirect: 'error',
          signal: abort.signal,
        });
        if (!response.ok) throw Error('组件资源不可用');
        if (Number(response.headers.get('content-length')) > budgets.resourceBytes)
          throw Error('组件资源过大');
        const reader = response.body?.getReader();
        if (!reader) throw Error('浏览器不支持有界资源读取');
        const chunks = [];
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > budgets.resourceBytes) {
            await reader.cancel();
            throw Error('组件资源过大');
          }
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) {
          bytes.set(part, offset);
          offset += part.byteLength;
        }
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          (v) => v.toString(16).padStart(2, '0'),
        ).join('');
        if (digest !== config.provider.resource.sha256) throw Error('组件资源摘要不匹配');
        if (current !== generation || !node.isConnected) return;
        session = random();
        frame = document.createElement('iframe');
        frame.title = config.provider.title + ' 隔离交互预览';
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.referrerPolicy = 'no-referrer';
        frame.className = 'mbb-component-frame';
        let initialized = false;
        frame.onload = () => {
          if (initialized) {
            failure('隔离组件发生未授权导航。');
            return;
          }
          initialized = true;
          send('init', {
            params: config.params,
            execution: EXECUTION_ENABLED,
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
        status.textContent = '正在初始化隔离组件…';
        changed();
      } catch (error) {
        if (current === generation) failure(error.message || '组件无法加载。');
      }
    }
    const launch = button('启动交互演示', launchComponent),
      close = button('关闭交互预览', () => {
        stop('交互预览已关闭。');
        launch.focus();
      });
    close.hidden = true;
    controls.append(launch, close, status);
    node.insertBefore(controls, node.firstChild);
    status.textContent =
      config.status === 'available'
        ? '静态替代始终保留；交互组件需显式启动。'
        : '组件缺失或版本不兼容；静态替代与原配置保留。';
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
          failure('组件消息超过预算。');
          return;
        }
      } catch {
        failure('组件消息格式无效。');
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
        failure('组件执行摘要超过预算或格式无效。');
        return;
      }
      if (data.type === 'ready' && !ready) {
        clearTimeout(startup);
        loading = false;
        ready = true;
        status.textContent = '隔离组件已就绪。';
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
          if (runId === expectedRun) failure('执行超过时间预算，已终止。');
        }, budgets.wallMs);
        send('grant', { runId });
      } else if (data.type === 'error' && !ready) {
        failure('组件初始化失败。');
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
            ? '组件执行完成。'
            : data.type === 'stopped'
              ? '执行已停止。'
              : '执行失败；静态替代仍可阅读。';
      }
    };
    window.addEventListener('message', receive);
    instances.set(node, {
      signature,
      controls,
      stop,
      hidden() {
        if (frame || loading) stop('内容已隐藏，交互预览已终止；展开后可重新启动。');
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
      instance.stop('页面已暂停；返回后请显式重启交互预览。');
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
