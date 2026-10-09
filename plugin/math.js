(() => {
  if (window.MBB_MATH) return;
  const root = new URL('.', document.currentScript.src).href;
  let engine, ready, outputStyle;
  const cache = new Map();
  const styleDocuments = new Map();
  const styleSubscribers = new Set();
  function liveDocument(owner) {
    if (owner === document) return true;
    const frame = owner.defaultView?.frameElement;
    return !!frame && frame.isConnected && frame.contentDocument === owner;
  }
  function updateStyles(css) {
    for (const [owner, style] of styleDocuments) {
      if (!liveDocument(owner)) {
        styleDocuments.delete(owner);
        continue;
      }
      style.textContent = css;
    }
    for (const subscriber of styleSubscribers) subscriber(css);
  }
  function registerDocument(owner) {
    if (!owner?.head || owner === document || !liveDocument(owner)) return;
    let style = styleDocuments.get(owner);
    if (!style) {
      style = owner.createElement('style');
      style.dataset.mbbEditorChtml = 'true';
      owner.head.append(style);
      styleDocuments.set(owner, style);
    }
    if (outputStyle && style.textContent !== outputStyle.textContent)
      style.textContent = outputStyle.textContent;
  }
  let reader, readerSource, readerRender, readerScale, readerStatus, readerOpener;
  let readerSession = 0;
  let readerPercent = 150;
  const readerDefaultPercent = 150;
  function readerButton(action, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mbbReaderAction = action;
    button.textContent = label;
    return button;
  }
  function updateReaderScale() {
    readerRender.style.fontSize = readerPercent + '%';
    readerScale.textContent = readerPercent + '%';
    reader.querySelector('[data-mbb-reader-action="decrease"]').disabled = readerPercent <= 100;
    reader.querySelector('[data-mbb-reader-action="increase"]').disabled = readerPercent >= 300;
  }
  function createReader() {
    if (reader) return;
    reader = document.createElement('dialog');
    reader.className = 'mbb-math-reader';
    reader.setAttribute('aria-labelledby', 'mbb-math-reader-title');
    const heading = document.createElement('h2');
    heading.id = 'mbb-math-reader-title';
    heading.textContent = '公式阅读';
    const toolbar = document.createElement('div');
    toolbar.className = 'mbb-math-reader-toolbar';
    toolbar.append(
      readerButton('decrease', '缩小'),
      readerButton('reset', '重置大小'),
      readerButton('increase', '放大'),
    );
    readerScale = document.createElement('output');
    readerScale.className = 'mbb-math-reader-scale';
    readerScale.setAttribute('aria-label', '当前公式大小');
    toolbar.append(readerScale);
    readerRender = document.createElement('div');
    readerRender.className = 'mbb-math-reader-render';
    const sourceLabel = document.createElement('label');
    sourceLabel.textContent = 'TeX 源码';
    readerSource = document.createElement('textarea');
    readerSource.className = 'mbb-math-reader-source';
    readerSource.readOnly = true;
    readerSource.rows = 4;
    sourceLabel.append(readerSource);
    const footer = document.createElement('div');
    footer.className = 'mbb-math-reader-footer';
    footer.append(readerButton('copy', '复制 TeX'), readerButton('close', '关闭'));
    readerStatus = document.createElement('p');
    readerStatus.className = 'mbb-math-reader-status';
    readerStatus.setAttribute('role', 'status');
    readerStatus.setAttribute('aria-live', 'polite');
    reader.append(heading, toolbar, readerRender, sourceLabel, footer, readerStatus);
    reader.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-mbb-reader-action]')?.dataset.mbbReaderAction;
      if (action === 'close') reader.close();
      if (action === 'increase' || action === 'decrease' || action === 'reset') {
        readerPercent =
          action === 'reset'
            ? readerDefaultPercent
            : Math.max(100, Math.min(300, readerPercent + (action === 'increase' ? 25 : -25)));
        updateReaderScale();
      }
      if (action === 'copy') {
        const session = readerSession;
        try {
          await navigator.clipboard.writeText(readerSource.value);
          if (!reader.open || session !== readerSession) return;
          readerStatus.textContent = 'TeX 已复制';
        } catch {
          if (!reader.open || session !== readerSession) return;
          readerSource.focus();
          readerSource.select();
          readerStatus.textContent = '无法自动复制，已选中源码，请手动复制';
        }
      }
    });
    reader.addEventListener('close', () => {
      if (readerOpener?.isConnected) readerOpener.focus();
      readerOpener = null;
    });
    document.body.append(reader);
  }
  function openReader(node) {
    const tex = node.getAttribute('data-mbb-tex');
    if (tex == null) return;
    createReader();
    readerSession++;
    readerOpener = node;
    readerStatus.textContent = '';
    readerSource.value = tex;
    readerRender.replaceChildren();
    const typeset = node.dataset.mbbRendered === tex ? node.querySelector('.mbb-typeset') : null;
    if (typeset) readerRender.append(typeset.cloneNode(true));
    else {
      readerRender.textContent = tex;
      readerStatus.textContent =
        node.dataset.mbbMathError === 'true'
          ? '公式排版失败，显示 TeX 源码'
          : '公式正在排版，暂时显示 TeX 源码';
    }
    readerPercent = readerDefaultPercent;
    updateReaderScale();
    reader.showModal();
    reader.querySelector('[data-mbb-reader-action="close"]').focus();
  }
  function enableReader(node) {
    if (
      !window.MBB_MATH_CONFIG?.front ||
      window.MBB_MATH_CONFIG?.reader === false ||
      node.ownerDocument !== document ||
      !node.isConnected ||
      node.isContentEditable ||
      node.parentElement?.closest(
        'a,button,input,select,textarea,summary,[role="button"],[contenteditable]',
      )
    )
      return;
    node.setAttribute('aria-label', '查看公式：' + node.getAttribute('data-mbb-tex'));
    if (node.dataset.mbbReaderReady) return;
    node.dataset.mbbReaderReady = 'true';
    node.classList.add('mbb-math-readable');
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-haspopup', 'dialog');
    node.title = '点击或按 Enter 查看公式与 TeX';
    node.addEventListener('click', () => {
      if (!node.parentElement?.closest('a,button,input,select,textarea,summary,[contenteditable]'))
        openReader(node);
    });
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (node.parentElement?.closest('a,button,input,select,textarea,summary,[contenteditable]'))
        return;
      event.preventDefault();
      openReader(node);
    });
  }
  function load() {
    if (ready) return ready;
    const frame = document.createElement('iframe');
    engine = frame;
    frame.hidden = true;
    frame.title = '公式排版引擎';
    frame.setAttribute('aria-hidden', 'true');
    const origin = new URL(root).origin,
      channel = crypto.randomUUID(),
      pending = new Map();
    let sequence = 0;
    ready = new Promise((resolve, reject) => {
      let done = false,
        poll,
        timer;
      const send = (data) =>
        frame.contentWindow?.postMessage({ type: 'mbb-math-request', channel, ...data }, origin);
      const fail = (message) => {
        clearTimeout(timer);
        clearInterval(poll);
        window.removeEventListener('message', receive);
        frame.remove();
        ready = undefined;
        const error = Error(message + '。已保留源码，可重试。');
        for (const p of pending.values()) {
          clearTimeout(p.timer);
          p.reject(error);
        }
        pending.clear();
        if (!done) {
          done = true;
          reject(error);
        }
      };
      const receive = (e) => {
        const m = e.data;
        if (
          e.origin !== origin ||
          e.source !== frame.contentWindow ||
          m?.type !== 'mbb-math-response' ||
          m.channel !== channel
        )
          return;
        if (m.action === 'load-error') return fail('公式引擎加载失败：' + m.error);
        if (m.action === 'ready' && !done) {
          done = true;
          clearTimeout(timer);
          clearInterval(poll);
          resolve({
            mbbRender: (tex, display) =>
              new Promise((resolve, reject) => {
                const id = ++sequence;
                const timer = setTimeout(() => {
                  pending.delete(id);
                  reject(Error('公式排版超时，已保留源码，可重试。'));
                }, 120000);
                pending.set(id, { resolve, reject, timer });
                send({ action: 'render', id, tex, display });
              }),
          });
        }
        if (m.action === 'result') {
          const p = pending.get(m.id);
          if (!p) return;
          pending.delete(m.id);
          clearTimeout(p.timer);
          if (m.error) p.reject(Error(m.error));
          else {
            if (typeof m.css === 'string') {
              if (!outputStyle) {
                outputStyle = document.createElement('style');
                outputStyle.dataset.mbbChtml = 'true';
                document.head.append(outputStyle);
              }
              if (outputStyle.textContent !== m.css) {
                outputStyle.textContent = m.css;
                updateStyles(m.css);
              }
            }
            p.resolve(m.html);
          }
        }
      };
      window.addEventListener('message', receive);
      timer = setTimeout(() => fail('公式引擎加载超时'), 45000);
      poll = setInterval(() => send({ action: 'hello' }), 200);
      frame.onload = () => send({ action: 'hello' });
      frame.onerror = () => fail('公式引擎文档未能下载');
      frame.src = root + 'math-engine.html';
      document.body.append(frame);
    });
    return ready;
  }
  async function render(tex, display = false) {
    const key = JSON.stringify([tex, display]);
    if (!cache.has(key)) {
      const p = load().then((w) => w.mbbRender(tex, display));
      cache.set(key, p);
      if (cache.size > 256) cache.delete(cache.keys().next().value);
      p.catch(() => cache.delete(key));
    }
    return cache.get(key);
  }
  async function typeset(rootNode) {
    const nodes = [...rootNode.querySelectorAll('span.mbb-math,pre.wp-block-mbb-math')];
    await Promise.all(
      nodes.map(async (n) => {
        const display = n.tagName === 'PRE',
          tex = display
            ? (n.querySelector('code')?.textContent ?? n.getAttribute('data-mbb-tex'))
            : n.getAttribute('data-mbb-tex');
        if (tex == null) return;
        const expected = tex;
        n.setAttribute('data-mbb-tex', tex);
        enableReader(n);
        if (n.dataset.mbbRendered === tex) return;
        n.classList.add('tex2jax_ignore');
        try {
          const html = await render(tex, display);
          if (
            (display
              ? (n.querySelector('code')?.textContent ?? n.getAttribute('data-mbb-tex'))
              : n.getAttribute('data-mbb-tex')) !== expected
          )
            return;
          const wrap = document.createElement(display ? 'div' : 'span');
          wrap.className = 'mbb-typeset tex2jax_ignore';
          wrap.setAttribute('aria-label', tex);
          wrap.innerHTML = html;
          n.replaceChildren(wrap);
          n.dataset.mbbRendered = tex;
          if (n.dataset.mbbMathError) {
            delete n.dataset.mbbMathError;
            if (n.dataset.mbbReaderReady) n.title = '点击或按 Enter 查看公式与 TeX';
            else n.removeAttribute('title');
          }
        } catch (e) {
          n.dataset.mbbMathError = 'true';
          n.title = e.message + (n.dataset.mbbReaderReady ? '；点击或按 Enter 查看公式与 TeX' : '');
        }
      }),
    );
  }
  const previewFonts = new Map();
  async function previewStyle() {
    const css = outputStyle?.textContent || '';
    const urls = [...new Set([...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]))];
    const fontRoot = new URL('vendor/mathjax-newcm-font/chtml/woff2/', root);
    const replacements = await Promise.all(
      urls.map(async (url) => {
        const target = new URL(url, root);
        if (
          target.origin !== fontRoot.origin ||
          !target.pathname.startsWith(fontRoot.pathname) ||
          !/^mjx-[a-z0-9-]+\.woff2$/.test(target.pathname.slice(fontRoot.pathname.length)) ||
          target.search ||
          target.hash
        )
          throw Error('预览字体来源无效，未生成预览。');
        if (!previewFonts.has(target.href)) {
          const pending = (async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
              const response = await fetch(target.href, {
                credentials: 'omit',
                redirect: 'error',
                signal: controller.signal,
              });
              if (!response.ok) throw Error('预览数学字体加载失败，请重试。');
              const bytes = new Uint8Array(await response.arrayBuffer());
              if (bytes.length > 1000000) throw Error('预览数学字体超出大小限制。');
              if (bytes.length < 48 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'wOF2')
                throw Error('预览数学字体文件无效，请重试。');
              let binary = '';
              for (let i = 0; i < bytes.length; i += 4096)
                binary += String.fromCharCode(...bytes.subarray(i, i + 4096));
              return 'data:font/woff2;base64,' + btoa(binary);
            } finally {
              clearTimeout(timer);
            }
          })();
          previewFonts.set(target.href, pending);
          pending.catch(() => previewFonts.delete(target.href));
        }
        return [url, await previewFonts.get(target.href)];
      }),
    );
    const sources = new Map(replacements);
    const style = document.createElement('style');
    style.dataset.mbbChtml = 'true';
    style.textContent = css.replace(
      /url\(["']?([^"')]+)["']?\)/g,
      (_, url) => 'url("' + sources.get(url) + '")',
    );
    return style.outerHTML;
  }
  async function preview(html) {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = html;
    await typeset(doc.body);
    // An opaque, scriptless srcdoc cannot fetch same-site fonts without CORS.
    // Embed only our trusted font assets instead of relaxing the iframe sandbox.
    return (await previewStyle()) + doc.body.innerHTML;
  }
  const style =
    'mjx-container{display:inline-block;max-width:100%}mjx-container[display="true"]{display:block;overflow-x:auto;overflow-y:hidden;padding:8px 0}mjx-container svg{max-width:none}mjx-container[jax="CHTML"][display="true"]{display:flex;justify-content:safe center}mjx-container[jax="CHTML"][display="true"]>mjx-math{flex-shrink:0}mjx-container[display="true"]>svg{display:block;margin-inline:auto}.mbb-typeset{font-size:1em;display:inline;overflow:visible;vertical-align:baseline}pre.wp-block-mbb-math>.mbb-typeset{display:block;width:100%;font-size:1.15em}.mbb-math-preview{padding:8px;border:1px solid #ddd;overflow-x:auto}.mbb-math-preview small{display:block;color:#555}[data-mbb-math-error]{text-decoration:underline wavy #b32d2e}';
  window.MBB_MATH = {
    render,
    typeset,
    preview,
    style,
    registerDocument,
    subscribeStyles: (callback) => {
      styleSubscribers.add(callback);
      return () => styleSubscribers.delete(callback);
    },
  };
  if (window.MBB_MATH_CONFIG?.front) {
    const start = () => typeset(document);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    const s = document.createElement('style');
    s.textContent = style;
    document.head.append(s);
  }
})();
