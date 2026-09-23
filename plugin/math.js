(() => {
  if (window.MBB_MATH) return;
  const root = new URL('.', document.currentScript.src).href;
  let engine, ready, outputStyle;
  const cache = new Map();
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
              outputStyle.textContent = m.css;
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
          tex = display ? n.querySelector('code')?.textContent : n.getAttribute('data-mbb-tex');
        if (tex == null || n.dataset.mbbRendered === tex) return;
        const expected = tex;
        n.setAttribute('data-mbb-tex', tex);
        n.classList.add('tex2jax_ignore');
        try {
          const html = await render(tex, display);
          if (
            (display ? n.querySelector('code')?.textContent : n.getAttribute('data-mbb-tex')) !==
            expected
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
            n.removeAttribute('title');
          }
        } catch (e) {
          n.dataset.mbbMathError = 'true';
          n.title = e.message;
        }
      }),
    );
  }
  async function preview(html) {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = html;
    await typeset(doc.body);
    return (outputStyle?.outerHTML || '') + doc.body.innerHTML;
  }
  const style =
    'mjx-container{display:inline-block;max-width:100%}mjx-container[display="true"]{display:block;overflow-x:auto;overflow-y:hidden;padding:8px 0}mjx-container svg{max-width:none}mjx-container[jax="CHTML"][display="true"]{display:flex;justify-content:safe center}mjx-container[jax="CHTML"][display="true"]>mjx-math{flex-shrink:0}mjx-container[display="true"]>svg{display:block;margin-inline:auto}.mbb-typeset{font-size:1em;display:inline;overflow:visible;vertical-align:baseline}pre.wp-block-mbb-math>.mbb-typeset{display:block;width:100%;font-size:1.15em}.mbb-math-preview{padding:8px;border:1px solid #ddd;overflow-x:auto}.mbb-math-preview small{display:block;color:#555}[data-mbb-math-error]{text-decoration:underline wavy #b32d2e}';
  window.MBB_MATH = { render, typeset, preview, style };
  if (window.MBB_MATH_CONFIG?.front) {
    const start = () => typeset(document);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    const s = document.createElement('style');
    s.textContent = style;
    document.head.append(s);
  }
})();
