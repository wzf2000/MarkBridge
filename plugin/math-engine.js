const engineLocale =
  new URL(location.href).searchParams.get('uiLocale') === 'zh_CN' ? 'zh_CN' : 'en_US';
const engineMessages = {
  'Formula syntax error: ': '公式语法错误：',
  'The formula is too long': '公式过长',
  'The formula syntax cannot be typeset': '公式语法无法排版',
  'The MathJax script could not be loaded': 'MathJax脚本未能下载',
  'The formula interface is not ready': '公式接口未就绪',
};
const T = (message) => (engineLocale === 'zh_CN' ? (engineMessages[message] ?? message) : message);
const F = (message, ...values) => {
  let next = 0;
  return String(message).replace(/%%|%(?:(\d+)\$)?([sd])/g, (token, index, kind) => {
    if (token === '%%') return '%';
    const value = values[index ? Number(index) - 1 : next++];
    return kind === 'd' ? String(Number(value)) : String(value ?? '');
  });
};
// A dedicated document owns MathJax; the theme's v2 global is never overwritten.
window.MathJax = {
  loader: { paths: { fonts: new URL('vendor', location.href).href } },
  startup: { typeset: false },
  tex: {
    packages: {
      '[-]': ['newcommand', 'textmacros', 'noundefined', 'require', 'autoload', 'configmacros'],
    },
    maxBuffer: 20000,
    maxMacros: 1000,
    formatError: (_jax, error) => {
      throw Error(T('Formula syntax error: ') + error.message);
    },
  },
  output: {
    font: 'mathjax-newcm',
    fontPath: new URL('vendor/mathjax-newcm-font', location.href).href,
  },
  chtml: { adaptiveCSS: true },
  options: { enableMenu: false, enableExplorer: false },
};
let renderQueue = Promise.resolve();
const renderOne = async (tex, display) => {
  if (typeof tex !== 'string' || tex.length > 20000) throw Error(T('The formula is too long'));
  await MathJax.startup.promise;
  // MathJax adds later glyph rules through CSSOM, which requires a live sheet.
  if (!document.getElementById('MJX-CHTML-styles')) {
    document.head.appendChild(MathJax.chtmlStylesheet());
  }
  const node = await MathJax.tex2chtmlPromise(tex, { display });
  if (node.querySelector('[data-mml-node="merror"]'))
    throw Error(T('The formula syntax cannot be typeset'));
  // CHTML can request additional font data while producing its stylesheet.
  // Its synchronous API signals this with a retry promise, not a TeX error.
  for (;;) {
    try {
      const style = MathJax.chtmlStylesheet();
      return {
        html: node.outerHTML,
        // textContent omits rules inserted with CSSStyleSheet.insertRule().
        css: Array.from(style.sheet.cssRules, (rule) => rule.cssText).join('\n'),
      };
    } catch (error) {
      if (!error.retry || typeof error.retry.then !== 'function') throw error;
      await error.retry;
    }
  }
};

window.mbbRender = (tex, display) => {
  const result = renderQueue.then(() => renderOne(tex, display));
  renderQueue = result.catch(() => {});
  return result;
};

// No direct parent/child DOM access: browsers can isolate frame Window objects.
let mbbChannel,
  mbbBooting = false,
  mbbReady = false,
  mbbEngineError;
const reply = (data) => {
  if (mbbChannel)
    parent.postMessage(
      { type: 'mbb-math-response', channel: mbbChannel, ...data },
      location.origin,
    );
};
window.addEventListener(
  'error',
  (event) => {
    const src = event.target?.tagName === 'SCRIPT' ? event.target.src : '';
    // A blocked analytics injection is not a failed MathJax resource.
    if (
      src &&
      new URL(src, location.href).pathname.endsWith('/vendor/mathjax-4.1.3/tex-chtml.js')
    ) {
      mbbEngineError = T('The MathJax script could not be loaded');
      reply({ action: 'load-error', error: mbbEngineError });
    }
  },
  true,
);
window.addEventListener('message', (event) => {
  const m = event.data;
  if (
    event.source !== parent ||
    event.origin !== location.origin ||
    m?.type !== 'mbb-math-request' ||
    typeof m.channel !== 'string'
  )
    return;
  if (mbbChannel && mbbChannel !== m.channel) return;
  mbbChannel = m.channel;
  if (m.action === 'hello') {
    if (mbbEngineError) return reply({ action: 'load-error', error: mbbEngineError });
    if (mbbReady) return reply({ action: 'ready' });
    if (mbbBooting || !MathJax.startup?.promise) return;
    mbbBooting = true;
    MathJax.startup.promise
      .then(() => {
        if (typeof MathJax.tex2chtmlPromise !== 'function')
          throw Error(T('The formula interface is not ready'));
        mbbReady = true;
        reply({ action: 'ready' });
      })
      .catch((e) => {
        mbbEngineError = e.message;
        reply({ action: 'load-error', error: e.message });
      });
  }
  if (m.action === 'render' && mbbReady && Number.isSafeInteger(m.id))
    mbbRender(m.tex, !!m.display).then(
      (result) => reply({ action: 'result', id: m.id, ...result }),
      (e) => reply({ action: 'result', id: m.id, error: e.message }),
    );
});
