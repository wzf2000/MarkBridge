// Only generated Presentation MathML enters here. Authored source remains subject to its original sanitizer.
(() => {
  'use strict';
  const T = (message) => window.MBBI18n?.t(message) ?? message;
  const NS = 'http://www.w3.org/1998/Math/MathML',
    enc = new TextEncoder();
  const tags = new Set(
    'math semantics annotation mrow mi mn mo mtext ms mspace mfrac msqrt mroot msub msup msubsup munder mover munderover mmultiscripts mprescripts none mtable mtr mlabeledtr mtd mstyle mpadded mphantom menclose'.split(
      ' ',
    ),
  );
  const metadata = new Set(
    'data-latex data-mjx-texclass data-semantic-type data-semantic-role data-semantic-annotation data-semantic-id data-semantic-children data-semantic-content data-semantic-attributes data-semantic-parent data-semantic-operator data-semantic-added data-semantic-font'.split(
      ' ',
    ),
  );
  const unsupported = () => {
    throw Object.assign(Error(T('Unsupported Presentation MathML')), {
      mbbCode: 'MATHML_UNSUPPORTED',
    });
  };
  const unsafe = () => {
    throw Object.assign(Error(T('Unsafe or malformed Presentation MathML')), {
      mbbCode: 'MATHML_UNSAFE',
    });
  };
  const dimension = (v) =>
    /^[-+]?(?:\d{1,3}(?:\.\d{1,6})?|\.\d{1,6})(?:em|ex|px|pt|%)?$/.test(v) &&
    Math.abs(parseFloat(v)) <= 100;
  function attribute(tag, key, v) {
    const scoped = {
      display: ['math'],
      alttext: ['math'],
      encoding: ['annotation'],
      accent: ['mo', 'mover', 'munderover'],
      accentunder: ['munder', 'munderover'],
      stretchy: ['mo'],
      symmetric: ['mo'],
      largeop: ['mo'],
      movablelimits: ['mo'],
      fence: ['mo'],
      separator: ['mo'],
      form: ['mo'],
      bevelled: ['mfrac'],
      linethickness: ['mfrac'],
      width: ['mspace', 'mpadded', 'mtable'],
      height: ['mspace', 'mpadded'],
      depth: ['mspace', 'mpadded'],
      lspace: ['mo', 'mpadded'],
      rspace: ['mo'],
      voffset: ['mpadded'],
      minsize: ['mo'],
      maxsize: ['mo'],
      rowspacing: ['mtable'],
      columnspacing: ['mtable'],
      framespacing: ['mtable'],
      rowalign: ['mtable', 'mtr', 'mtd'],
      columnalign: ['mtable', 'mtr', 'mtd'],
      align: ['mtable'],
      rowlines: ['mtable'],
      columnlines: ['mtable'],
      frame: ['mtable'],
      equalrows: ['mtable'],
      equalcolumns: ['mtable'],
      rowspan: ['mtd'],
      columnspan: ['mtd'],
      notation: ['menclose'],
    };
    if (scoped[key] && !scoped[key].includes(tag)) return false;
    if (['rowspan', 'columnspan'].includes(key)) return /^[1-9][0-9]?$/.test(v) && Number(v) <= 64;
    if (key === 'form') return ['prefix', 'infix', 'postfix'].includes(v);

    if (key === 'xmlns') return v === NS;
    if (tag === 'math' && key === 'display') return ['inline', 'block'].includes(v);
    if (tag === 'math' && key === 'alttext') return enc.encode(v).length <= 80000;
    if (tag === 'annotation' && key === 'encoding') return v === 'application/x-tex';
    if (key === 'mathvariant')
      return 'normal bold italic bold-italic double-struck bold-fraktur script bold-script fraktur sans-serif bold-sans-serif sans-serif-italic sans-serif-bold-italic monospace initial tailed looped stretched'
        .split(' ')
        .includes(v);
    if (key === 'mathsize' || key === 'scriptsizemultiplier' || key === 'scriptminsize')
      return dimension(v);
    if (['mathcolor', 'mathbackground'].includes(key))
      return /^(?:#[a-fA-F0-9]{6}|black|white|red|green|blue|transparent)$/.test(v);
    if (key === 'dir') return ['ltr', 'rtl'].includes(v);
    if (key === 'scriptlevel') return /^[+-]?[0-9]$/.test(v);
    if (
      [
        'displaystyle',
        'accent',
        'accentunder',
        'stretchy',
        'symmetric',
        'largeop',
        'movablelimits',
        'fence',
        'separator',
        'bevelled',
        'equalrows',
        'equalcolumns',
      ].includes(key)
    )
      return ['true', 'false'].includes(v);
    if (
      [
        'width',
        'height',
        'depth',
        'lspace',
        'rspace',
        'voffset',
        'minsize',
        'maxsize',
        'linethickness',
      ].includes(key)
    )
      return dimension(v);
    if (['rowspacing', 'columnspacing', 'framespacing'].includes(key))
      return v.split(/\s+/).length <= 32 && v.split(/\s+/).every(dimension);
    if (['rowalign', 'columnalign', 'align'].includes(key))
      return (
        v.split(/\s+/).length <= 32 &&
        v
          .split(/\s+/)
          .every((x) =>
            ['left', 'right', 'center', 'top', 'bottom', 'baseline', 'axis'].includes(x),
          )
      );
    if (['rowlines', 'columnlines', 'frame'].includes(key))
      return (
        v.split(/\s+/).length <= 32 &&
        v.split(/\s+/).every((x) => ['none', 'solid', 'dashed'].includes(x))
      );
    if (key === 'notation' && tag === 'menclose')
      return (
        v.split(/\s+/).length <= 8 &&
        v
          .split(/\s+/)
          .every((x) =>
            [
              'longdiv',
              'actuarial',
              'radical',
              'box',
              'roundedbox',
              'circle',
              'left',
              'right',
              'top',
              'bottom',
              'updiagonalstrike',
              'downdiagonalstrike',
              'verticalstrike',
              'horizontalstrike',
            ].includes(x),
          )
      );
    return false;
  }
  function clean(root, strip = false) {
    let count = 0;
    const visit = (node, depth) => {
      if (++count > 4096 || depth > 32) unsupported();
      if (node.nodeType === 3) {
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(node.data)) unsafe();
        return;
      }
      if (node.nodeType !== 1 || node.namespaceURI !== NS) unsafe();
      const tag = node.localName;
      if (
        ['maction', 'annotation-xml', 'script', 'style', 'foreignObject', 'a', 'mglyph'].includes(
          tag,
        )
      )
        unsafe();
      if (tag === 'merror' || !tags.has(tag)) unsupported();
      for (const a of [...node.attributes]) {
        if (a.name === 'xmlns' && a.value === NS) continue;
        if (/^(?:on|href$|src$|style$)/i.test(a.name) || a.namespaceURI) unsafe();
        if (
          strip &&
          a.name === 'data-semantic-collapsed' &&
          a.value.length <= 8192 &&
          /^[() c0-9]+$/.test(a.value)
        ) {
          node.removeAttribute(a.name);
          continue;
        }
        if (strip && metadata.has(a.name)) {
          node.removeAttribute(a.name);
          continue;
        }
        if (!attribute(tag, a.name, a.value)) unsupported();
      }
      const children = [...node.children];
      const arity = {
        mfrac: 2,
        mroot: 2,
        msub: 2,
        msup: 2,
        msubsup: 3,
        munder: 2,
        mover: 2,
        munderover: 3,
      };
      if (arity[tag] && children.length !== arity[tag]) unsafe();
      if (['mi', 'mn', 'mo', 'mtext', 'ms', 'annotation'].includes(tag) && children.length)
        unsafe();
      if (['mspace', 'none', 'mprescripts'].includes(tag) && node.textContent.trim()) unsafe();
      if (tag === 'math' && (!children.length || node !== root)) unsafe();
      if (tag === 'mtable' && children.some((x) => !['mtr', 'mlabeledtr'].includes(x.localName)))
        unsafe();
      if (['mtr', 'mlabeledtr'].includes(tag) && children.some((x) => x.localName !== 'mtd'))
        unsafe();
      if (
        tag === 'semantics' &&
        (!children.length || children.slice(1).some((x) => x.localName !== 'annotation'))
      )
        unsafe();
      if (
        !['mi', 'mn', 'mo', 'mtext', 'ms', 'annotation'].includes(tag) &&
        [...node.childNodes].some((n) => n.nodeType === 3 && n.data.trim())
      )
        unsafe();
      for (const child of [...node.childNodes]) visit(child, depth + 1);
    };
    visit(root, 0);
    if (enc.encode(new XMLSerializer().serializeToString(root)).length > 131072) unsupported();
    return root;
  }
  function validate(raw, tex, display = false) {
    if (
      typeof raw !== 'string' ||
      typeof tex !== 'string' ||
      tex.length > 20000 ||
      enc.encode(raw).length > 131072
    )
      unsupported();
    if (
      typeof display !== 'boolean' ||
      new TextDecoder('utf-8', { fatal: true }).decode(enc.encode(raw)) !== raw ||
      new TextDecoder('utf-8', { fatal: true }).decode(enc.encode(tex)) !== tex
    )
      unsafe();
    if (/<!|<\?/.test(raw)) unsafe();
    const doc = new DOMParser().parseFromString(raw, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'math') unsafe();
    const root = clean(doc.documentElement, true);
    root.setAttribute('display', display ? 'block' : 'inline');
    root.setAttribute('alttext', tex);
    const semantics = doc.createElementNS(NS, 'semantics'),
      row = doc.createElementNS(NS, 'mrow'),
      annotation = doc.createElementNS(NS, 'annotation');
    row.append(...root.childNodes);
    semantics.append(row);
    annotation.setAttribute('encoding', 'application/x-tex');
    annotation.textContent = tex;
    semantics.append(annotation);
    root.append(semantics);
    clean(root);
    return new XMLSerializer().serializeToString(root);
  }
  window.MarkBridgeMathML = Object.freeze({ validate, audit: clean });
})();

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

  if (window.MBB_MATH) return;
  const root = new URL('.', document.currentScript.src).href;
  let engine, ready, outputStyle;
  const cache = new Map();
  const mathFailures = new WeakMap();
  const coded = (code, message) => Object.assign(Error(message), { mbbCode: code });
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
  let readerExplorer;
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
    heading.textContent = T('Formula reader');
    const toolbar = document.createElement('div');
    toolbar.className = 'mbb-math-reader-toolbar';
    toolbar.append(
      readerButton('decrease', T('Zoom out')),
      readerButton('reset', T('Reset size')),
      readerButton('increase', T('Zoom in')),
    );
    readerScale = document.createElement('output');
    readerScale.className = 'mbb-math-reader-scale';
    readerScale.setAttribute('aria-label', T('Current formula size'));
    toolbar.append(readerScale);
    readerRender = document.createElement('div');
    readerRender.className = 'mbb-math-reader-render';
    const sourceLabel = document.createElement('label');
    sourceLabel.textContent = T('TeX source');
    readerSource = document.createElement('textarea');
    readerSource.className = 'mbb-math-reader-source';
    readerSource.readOnly = true;
    readerSource.rows = 4;
    sourceLabel.append(readerSource);
    const footer = document.createElement('div');
    footer.className = 'mbb-math-reader-footer';
    footer.append(
      readerButton('copy', T('Copy TeX')),
      readerButton('retry', T('Retry formula typesetting')),
      readerButton('close', T('Close')),
    );
    readerStatus = document.createElement('p');
    readerStatus.className = 'mbb-math-reader-status';
    readerStatus.setAttribute('role', 'status');
    readerStatus.setAttribute('aria-live', 'polite');
    readerExplorer = window.MBBMathExplorer?.create(readerRender);
    reader.append(heading, toolbar, readerRender);
    if (readerExplorer) reader.append(readerExplorer.element);
    reader.append(sourceLabel, footer, readerStatus);
    reader.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-mbb-reader-action]')?.dataset.mbbReaderAction;
      if (action === 'close') reader.close();
      if (action === 'retry') {
        const opener = readerOpener,
          session = readerSession;
        if (!opener?.isConnected) return;
        const expected = opener.getAttribute('data-mbb-tex');
        const retry = reader.querySelector('[data-mbb-reader-action=retry]');
        retry.disabled = true;
        try {
          await typeset(opener.parentNode);
          if (
            !reader.open ||
            readerSession !== session ||
            readerOpener !== opener ||
            opener.getAttribute('data-mbb-tex') !== expected
          )
            return;
          const result = opener.querySelector('.mbb-typeset');
          if (opener.dataset.mbbMathError || !result) {
            readerStatus.textContent = T('Formula typesetting failed; showing TeX source');
            const record = mathFailures.get(opener);
            if (record) window.MBB_DIAGNOSTICS?.show(reader, record);
          } else {
            readerRender.replaceChildren(result.cloneNode(true));
            readerExplorer?.load();
            readerStatus.textContent = '';
            window.MBB_DIAGNOSTICS?.clear(reader);
            retry.hidden = true;
            reader.querySelector('[data-mbb-reader-action=close]').focus();
          }
        } finally {
          if (readerSession === session) {
            retry.disabled = false;
            if (
              reader.open &&
              !retry.hidden &&
              [document.body, reader, retry].includes(document.activeElement)
            )
              retry.focus();
          }
        }
      }
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
          readerStatus.textContent = T('TeX copied');
        } catch {
          if (!reader.open || session !== readerSession) return;
          readerSource.focus();
          readerSource.select();
          readerStatus.textContent = T(
            'Automatic copy failed. The source is selected for manual copying',
          );
        }
      }
    });
    reader.addEventListener('close', () => {
      readerExplorer?.clear();
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
    window.MBB_DIAGNOSTICS?.clear(reader);
    const retry = reader.querySelector('[data-mbb-reader-action=retry]');
    retry.hidden = node.dataset.mbbMathError !== 'true';
    retry.disabled = false;
    const failure = mathFailures.get(node);
    if (failure) window.MBB_DIAGNOSTICS?.show(reader, failure);
    readerSource.value = tex;
    readerRender.replaceChildren();
    const typeset = node.dataset.mbbRendered === tex ? node.querySelector('.mbb-typeset') : null;
    if (typeset) readerRender.append(typeset.cloneNode(true));
    else {
      readerRender.textContent = tex;
      readerStatus.textContent =
        node.dataset.mbbMathError === 'true'
          ? T('Formula typesetting failed; showing TeX source')
          : T('The formula is being typeset; showing TeX source temporarily');
    }
    readerExplorer?.load();
    readerPercent = readerDefaultPercent;
    updateReaderScale();
    reader.showModal();
    reader.querySelector('[data-mbb-reader-action="close"]').focus();
  }
  function enableReader(node) {
    if (
      !window.MBB_MATH_CONFIG?.front ||
      window.MBB_MATH_CONFIG?.reader !== true ||
      node.ownerDocument !== document ||
      !node.isConnected ||
      node.isContentEditable ||
      node.parentElement?.closest(
        'a,button,input,select,textarea,summary,[role="button"],[contenteditable]',
      )
    )
      return;
    node.setAttribute('aria-label', T('View formula: ') + node.getAttribute('data-mbb-tex'));
    if (node.dataset.mbbReaderReady) return;
    node.dataset.mbbReaderReady = 'true';
    node.classList.add('mbb-math-readable');
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-haspopup', 'dialog');
    node.title = T('Click or press Enter to view the formula and TeX');
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
    frame.title = T('Formula typesetting engine');
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
      const fail = (message, code = 'INITIALIZATION') => {
        clearTimeout(timer);
        clearInterval(poll);
        window.removeEventListener('message', receive);
        frame.remove();
        ready = undefined;
        const error = coded(code, T(message) + T('. The source is preserved. You can retry.'));
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
        if (m.action === 'load-error')
          return fail('Formula engine failed to load: ' + m.error, 'NETWORK');
        if (m.action === 'ready' && !done) {
          done = true;
          frame.dataset.mbbInitialized = 'true';
          clearTimeout(timer);
          clearInterval(poll);
          resolve({
            request: (action, tex, display) =>
              new Promise((resolve, reject) => {
                const id = ++sequence;
                const timer = setTimeout(() => {
                  pending.delete(id);
                  reject(
                    coded(
                      'TYPESET_TIMEOUT',
                      'Formula typesetting timed out. The source is preserved. You can retry.',
                    ),
                  );
                }, 120000);
                pending.set(id, { resolve, reject, timer, action });
                send({ action, id, tex, display });
              }),
          });
        }
        if (m.action === 'result') {
          const p = pending.get(m.id);
          if (!p) return;
          pending.delete(m.id);
          clearTimeout(p.timer);
          if (m.error) p.reject(coded('TYPESET', m.error));
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
            p.resolve(p.action === 'mathml' ? m.mathml : m.html);
          }
        }
      };
      window.addEventListener('message', receive);
      timer = setTimeout(() => fail('Formula engine load timed out', 'STARTUP_TIMEOUT'), 45000);
      poll = setInterval(() => send({ action: 'hello' }), 200);
      frame.onload = () => send({ action: 'hello' });
      frame.onerror = () => fail('The formula engine document could not be loaded', 'NETWORK');
      frame.src =
        root + "math-engine-01578bd54d1c.html" +
        '?uiLocale=' +
        (window.MBB_UI_LOCALE === 'zh_CN' ? 'zh_CN' : 'en_US');
      document.body.append(frame);
    });
    return ready;
  }
  async function render(tex, display = false, stage) {
    const key = JSON.stringify([tex, display]);
    if (!cache.has(key)) {
      const p = load().then((w) => {
        stage?.('typesetting');
        return w.request('render', tex, display);
      });
      cache.set(key, p);
      if (cache.size > 256) cache.delete(cache.keys().next().value);
      p.catch(() => cache.delete(key));
    }
    return cache.get(key);
  }
  async function typeset(rootNode) {
    const selector = 'span.mbb-math,pre.wp-block-mbb-math';
    const nodes = [
      ...(rootNode.matches?.(selector) ? [rootNode] : []),
      ...rootNode.querySelectorAll(selector),
    ];
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
        if (n.dataset.mbbRendered === tex && n.querySelector(':scope > .mbb-typeset')) return;
        n.classList.add('tex2jax_ignore');
        const diagnostic = window.MBB_DIAGNOSTICS?.begin('math');
        try {
          if (engine?.isConnected && engine.dataset.mbbInitialized === 'true')
            diagnostic?.stage('typesetting');
          const html = await render(tex, display, (stage) => diagnostic?.stage(stage));
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
          mathFailures.delete(n);
          if (n.dataset.mbbMathError) {
            delete n.dataset.mbbMathError;
            if (n.dataset.mbbReaderReady)
              n.title = T('Click or press Enter to view the formula and TeX');
            else n.removeAttribute('title');
          }
        } catch (e) {
          if (
            n.getAttribute('data-mbb-tex') !== expected ||
            (!n.isConnected && n.ownerDocument === document)
          )
            return;
          const record = diagnostic?.failure(e.mbbCode || 'TYPESET');
          if (record) mathFailures.set(n, record);
          n.dataset.mbbMathError = 'true';
          n.title =
            e.message +
            (n.dataset.mbbReaderReady
              ? T('; click or press Enter to view the formula and TeX')
              : '');
        }
      }),
    );
  }
  // Project an already-readable DOM excerpt, never HTML from a comment or API response.
  // Keep TeX and its display mode, not the renderer's generated DOM or original identities.
  function createReference(source) {
    if (!source || source.nodeType !== 1) throw new TypeError('Expected an excerpt element');
    const owner = source.ownerDocument;
    const reference = owner.createElement('div');
    reference.className = 'mbb-math-reference';
    const allowed = new Set([
      'P',
      'SPAN',
      'STRONG',
      'EM',
      'B',
      'I',
      'S',
      'DEL',
      'SUB',
      'SUP',
      'CODE',
      'PRE',
      'BLOCKQUOTE',
      'UL',
      'OL',
      'LI',
      'BR',
      'A',
    ]);
    function project(node, parent) {
      if (node.nodeType === 3) {
        parent.append(owner.createTextNode(node.nodeValue));
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.matches('span.mbb-math,pre.wp-block-mbb-math')) {
        const display = node.tagName === 'PRE';
        const tex = display
          ? (node.querySelector('code')?.textContent ?? node.getAttribute('data-mbb-tex'))
          : node.getAttribute('data-mbb-tex');
        if (tex === null) return;
        const math = owner.createElement(display ? 'pre' : 'span');
        math.className = display ? 'wp-block-mbb-math' : 'mbb-math';
        math.setAttribute('data-mbb-tex', tex);
        if (display) {
          const code = owner.createElement('code');
          code.textContent = tex;
          math.append(code);
        } else math.textContent = tex;
        parent.append(math);
        return;
      }
      if (
        node.matches(
          'script,style,iframe,object,embed,svg,math,template,button,input,textarea,select,' +
            '[data-mbb-generated],.mbb-typeset,mjx-container',
        )
      )
        return;
      const copy = allowed.has(node.tagName) ? owner.createElement(node.localName) : null;
      if (copy?.tagName === 'A') {
        try {
          const url = new URL(node.getAttribute('href'), source.baseURI);
          if (node.hasAttribute('href') && ['http:', 'https:'].includes(url.protocol)) {
            copy.href = url.href;
            copy.rel = 'noopener noreferrer';
          }
        } catch {
          /* An unusable link remains readable text. */
        }
      }
      for (const child of node.childNodes) project(child, copy || parent);
      if (copy) parent.append(copy);
    }
    project(source, reference);
    return reference;
  }
  const previewFonts = new Map();
  async function previewStyle() {
    const diagnostic = window.MBB_DIAGNOSTICS?.begin('math');
    diagnostic?.stage('font');
    try {
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
            throw coded(
              'FONT_INVALID',
              T('The preview font origin is invalid. No preview was generated.'),
            );
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
                if (!response.ok)
                  throw coded('FONT', T('Preview math fonts failed to load. Try again.'));
                const bytes = new Uint8Array(await response.arrayBuffer());
                if (bytes.length > 1000000)
                  throw coded('FONT_SIZE', T('Preview math fonts exceed their size budget.'));
                if (bytes.length < 48 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'wOF2')
                  throw coded('FONT_INVALID', T('Preview math font files are invalid. Try again.'));
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
    } catch (error) {
      error.mbbDiagnostic = diagnostic?.failure(error.mbbCode || 'FONT');
      throw error;
    }
  }
  async function preview(html) {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = html;
    await typeset(doc.body);
    for (const code of doc.querySelectorAll('pre code')) {
      if (code.closest('.wp-block-mbb-math')) continue;
      code.parentElement.classList.add('mbb-code-display');
      code.parentElement.tabIndex = 0;
    }
    // An opaque, scriptless srcdoc cannot fetch same-site fonts without CORS.
    // Embed only our trusted font assets instead of relaxing the iframe sandbox.
    return (await previewStyle()) + doc.body.innerHTML;
  }
  const style =
    'mjx-container{display:inline-block;max-width:100%}mjx-container[display="true"]{display:block;overflow-x:auto;overflow-y:hidden;padding:8px 0}mjx-container svg{max-width:none}mjx-container[jax="CHTML"][display="true"]{display:flex;justify-content:safe center}mjx-container[jax="CHTML"][display="true"]>mjx-math{flex-shrink:0}mjx-container[display="true"]>svg{display:block;margin-inline:auto}.mbb-typeset{font-size:1em;display:inline;overflow:visible;vertical-align:baseline}pre.wp-block-mbb-math>.mbb-typeset{display:block;width:100%;font-size:1.15em}.mbb-math-preview{padding:8px;border:1px solid #ddd;overflow-x:auto}.mbb-math-preview small{display:block;color:#555}[data-mbb-math-error]{text-decoration:underline wavy #b32d2e}';
  window.MBB_MATH = {
    render,
    typeset,
    createReference,
    preview,
    presentationMathML: async (tex, display = false) => {
      if (typeof tex !== 'string' || tex.length > 20000 || typeof display !== 'boolean')
        throw coded('MATHML_INPUT', T('Invalid MathML conversion input'));
      try {
        const raw = await (await load()).request('mathml', tex, display);
        if (!window.MarkBridgeMathML)
          throw coded('MATHML_UNSAFE', T('MathML validator unavailable'));
        return { mathml: window.MarkBridgeMathML.validate(raw, tex, display), reason: null };
      } catch (error) {
        if (error.mbbCode === 'MATHML_UNSUPPORTED' || error.mbbCode === 'TYPESET')
          return { mathml: null, reason: error.mbbCode };
        throw error;
      }
    },
    diagnostic: (error) => {
      const d = window.MBB_DIAGNOSTICS?.begin('math');
      d?.stage(error?.mbbCode?.startsWith('FONT') ? 'font' : 'typesetting');
      return d?.failure(error?.mbbCode || 'TYPESET');
    },
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
