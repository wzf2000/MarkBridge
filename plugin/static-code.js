/* Export-time only. The serialized artifact keeps token spans/CSS and no scripts. */
(() => {
  'use strict';
  const MAX_BLOCK_BYTES = 32768,
    MAX_TOTAL_BYTES = 196608,
    MAX_LINES = 2048,
    MAX_TOTAL_LINES = 10000,
    MAX_TOKENS = 50000,
    MAX_HIGHLIGHT_MS = 1500,
    WAIT_MS = 4000,
    MAX_LOAD_MS = 6000;
  const encoder = new TextEncoder(),
    loads = new Map();
  function configuration() {
    const input = window.MBB_STATIC_CODE;
    if (!input || !Array.isArray(input.known) || input.known.length > 1024) return null;
    try {
      const urls = {};
      for (const key of ['core', 'autoloader', 'languages']) {
        const url = new URL(input[key], document.baseURI);
        if (
          typeof input[key] !== 'string' ||
          url.origin !== location.origin ||
          !/^https?:$/.test(url.protocol) ||
          url.username ||
          url.password ||
          url.hash
        )
          return null;
        urls[key] = url;
      }
      const suffix = '/components/prism-core.min.js';
      if (!urls.core.pathname.endsWith('/vendor/prism' + suffix)) return null;
      const base = urls.core.pathname.slice(0, -suffix.length);
      if (
        urls.autoloader.pathname !== base + '/plugins/autoloader/prism-autoloader.min.js' ||
        urls.languages.pathname !== base + '/components/' ||
        urls.languages.search
      )
        return null;
      if (input.known.some((id) => typeof id !== 'string' || !/^[a-z0-9_+-]{1,64}$/.test(id)))
        return null;
      return {
        core: urls.core.href,
        autoloader: urls.autoloader.href,
        languages: urls.languages.href,
        known: new Set(input.known),
      };
    } catch {
      return null;
    }
  }
  function script(url, attributes = {}, deadline = Infinity) {
    if (loads.has(url)) return loads.get(url);
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement('script');
      node.src = url;
      node.async = true;
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      const timer = setTimeout(
        () => {
          node.remove();
          reject(Error('Static syntax resource timeout'));
        },
        Math.min(WAIT_MS, Math.max(1, deadline - performance.now())),
      );
      const finish = (error) => {
        clearTimeout(timer);
        node.remove();
        error ? reject(error) : resolve();
      };
      node.onload = () => finish();
      node.onerror = () => finish(Error('Static syntax resource unavailable'));
      document.head.append(node);
    });
    loads.set(url, promise);
    return promise;
  }
  async function engine(config, deadline) {
    if (!window.Prism?.tokenize) await script(config.core, { 'data-manual': 'true' }, deadline);
    const prism = window.Prism;
    if (!prism?.tokenize || !prism.languages) throw Error('Static syntax engine unavailable');
    return prism;
  }
  async function grammar(prism, language, config, deadline) {
    if (prism.languages[language]) return prism.languages[language];
    if (performance.now() >= deadline) return null;
    if (!prism.plugins?.autoloader)
      await script(config.autoloader, { 'data-autoloader-path': config.languages }, deadline);
    const loader = prism.plugins?.autoloader;
    // Never repoint an existing page's loader or pass article-supplied paths/dependencies.
    if (
      !loader ||
      new URL(loader.languages_path, document.baseURI).href !== config.languages ||
      loader.use_minified !== true
    )
      return null;
    await new Promise((resolve) => {
      const timer = setTimeout(
        resolve,
        Math.min(WAIT_MS, Math.max(1, deadline - performance.now())),
      );
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      loader.loadLanguages([language], finish, finish);
    });
    return prism.languages[language] || null;
  }
  function tokenDOM(tokens, doc) {
    const fragment = doc.createDocumentFragment();
    let count = 0;
    function append(parent, value, depth) {
      if (++count > MAX_TOKENS || depth > 32) throw Error('Static syntax token budget');
      if (typeof value === 'string') {
        parent.append(doc.createTextNode(value));
        return;
      }
      if (Array.isArray(value)) {
        for (const child of value) append(parent, child, depth + 1);
        return;
      }
      if (!value || typeof value !== 'object') throw Error('Invalid static syntax token');
      const names = [
        value.type,
        ...(value.alias ? (Array.isArray(value.alias) ? value.alias : [value.alias]) : []),
      ];
      if (
        names.length > 16 ||
        names.some((name) => typeof name !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/i.test(name))
      )
        throw Error('Invalid static syntax class');
      const span = doc.createElement('span');
      span.className = 'token ' + names.join(' ');
      append(span, value.content, depth + 1);
      parent.append(span);
    }
    append(fragment, tokens, 0);
    return fragment;
  }
  const languageOf = (code) => {
    for (const node of [code, code.parentElement]) {
      for (const name of node.classList) {
        const match = /^(?:lang|language)-([a-z0-9_+-]{1,64})$/i.exec(name);
        if (match) return match[1].toLowerCase();
      }
    }
    return 'none';
  };
  async function render(root, { cancelled = () => false } = {}) {
    if (!root?.querySelectorAll || typeof cancelled !== 'function' || cancelled()) return;
    const config = configuration(),
      deadline = performance.now() + MAX_LOAD_MS;
    let prism = null,
      highlightedBytes = 0,
      decoratedLines = 0,
      highlightTime = 0;
    for (const code of [...root.querySelectorAll('pre > code')]) {
      if (cancelled()) return;
      const pre = code.parentElement;
      if (pre.classList.contains('wp-block-mbb-math')) continue;
      const source = code.textContent,
        language = languageOf(code);
      const bytes = encoder.encode(source).length;
      const lines = source.split(/\r\n|\r|\n/).length - (/(?:\r\n|\r|\n)$/.test(source) ? 1 : 0);
      let fragment = null;
      if (
        config &&
        config.known.has(language) &&
        !['none', 'plain', 'plaintext', 'text'].includes(language) &&
        bytes <= MAX_BLOCK_BYTES &&
        highlightedBytes + bytes <= MAX_TOTAL_BYTES &&
        highlightTime < MAX_HIGHLIGHT_MS &&
        performance.now() < deadline
      ) {
        try {
          prism ||= await engine(config, deadline);
          if (cancelled()) return;
          const definition = await grammar(prism, language, config, deadline);
          if (cancelled()) return;
          if (definition) {
            highlightedBytes += bytes;
            const start = performance.now();
            try {
              fragment = tokenDOM(prism.tokenize(source, definition), code.ownerDocument);
            } finally {
              highlightTime += performance.now() - start;
            }
            if (fragment.textContent !== source) fragment = null;
          }
        } catch {
          fragment = null;
        }
      }
      if (cancelled()) return;
      // Build off-tree. Commit only after asynchronous loading and exact text checks.
      const doc = code.ownerDocument;
      if (!fragment) fragment = doc.createTextNode(source);
      code.replaceChildren(fragment);
      pre.classList.add('mbb-static-code');
      for (const old of [...pre.children])
        if (old.classList.contains('mbb-static-code-numbers')) old.remove();
      pre.classList.remove('mbb-static-code-numbered');
      const count = Math.max(1, lines);
      if (count <= MAX_LINES && decoratedLines + count <= MAX_TOTAL_LINES) {
        const gutter = doc.createElement('span');
        gutter.className = 'mbb-static-code-numbers';
        gutter.setAttribute('aria-hidden', 'true');
        for (let index = 0; index < count; index++) gutter.append(doc.createElement('span'));
        pre.append(gutter);
        pre.classList.add('mbb-static-code-numbered');
        decoratedLines += count;
      }
      // Yield between blocks so cancellation can stop any later DOM commit.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  window.MarkBridgeStaticCode = { render };
})();
