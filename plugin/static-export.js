(() => {
  'use strict';
  const MAX = 33554432,
    enc = new TextEncoder();
  const T = (message) => globalThis.MBBI18n?.t(message) ?? message;
  const fail = (message) => {
    throw Error(T(message));
  };
  const size = (text) => enc.encode(text).length;
  const keys = (value, expected) =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...expected].sort().join(',');
  const digest = async (bytes) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
  const bytes = (value) => {
    if (
      typeof value !== 'string' ||
      value.length > 12000000 ||
      value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
    )
      fail('The static image encoding is invalid');
    const raw = atob(value);
    if (btoa(raw) !== value) fail('The static image encoding is invalid');
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };
  const imageMagic = (mime, b) =>
    mime === 'image/png'
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n)
      : mime === 'image/jpeg'
        ? b[0] === 255 && b[1] === 216 && b[2] === 255
        : mime === 'image/gif'
          ? /^GIF8[79]a$/.test(String.fromCharCode(...b.subarray(0, 6)))
          : mime === 'image/webp' &&
            String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
            String.fromCharCode(...b.subarray(8, 12)) === 'WEBP';
  const urlSafe = (value) => {
    if (/[\x00-\x20\x7f\\]/.test(value)) return false;
    if (value.startsWith('#')) return value.length > 1;
    try {
      const u = new URL(value);
      return ['http:', 'https:', 'mailto:'].includes(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  };
  const cssSafe = (css, math = false) => {
    if (
      typeof css !== 'string' ||
      size(css) > 8000000 ||
      /<\/style|@import|expression\s*\(|behavior\s*:/i.test(css) ||
      /\\/.test(css.replace(/content\s*:\s*"(?:\\[a-f0-9]{1,6}\s?|[^"\\])*"/gi, ''))
    )
      fail('The static stylesheet is unsafe');
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (!math || !/^data:font\/woff2;base64,[A-Za-z0-9+/]+=*$/.test(match[1]))
        fail('The static stylesheet contains an external resource');
      const b = bytes(match[1].split(',')[1]);
      if (
        b.length < 48 ||
        b.length > 1000000 ||
        String.fromCharCode(...b.subarray(0, 4)) !== 'wOF2'
      )
        fail('The static math font is invalid');
    }
    // Escaped/obfuscated URL syntax is forbidden above; no other CSS resource mechanism is supported.
    if (/url\s*\(/i.test(css.replace(/url\(\s*["']?[^"')]+["']?\s*\)/g, '')))
      fail('The static stylesheet is unsafe');
    return css;
  };
  const tags = new Set(
    'p h1 h2 h3 h4 h5 h6 div section figure figcaption blockquote ul ol li pre code strong em del s sub sup span a img hr br table caption thead tbody tfoot tr th td details summary font'.split(
      ' ',
    ),
  );
  const audit = (root, rendered = false) => {
    let count = 0;
    const walk = (node, depth = 0) => {
      if (depth > 128 || ++count > 200000) fail('The static HTML exceeds its structure budget');
      if (node.nodeType === 3) return;
      if (node.nodeType !== 1) fail('The static HTML contains a forbidden node');
      if (rendered && node.localName === 'svg') {
        window.MarkBridgeProjection.auditSVG(node);
        return;
      }
      const math = rendered && /^mjx-[a-z0-9-]+$/.test(node.localName);
      if (!tags.has(node.localName) && !math) fail('The static HTML contains a forbidden element');
      for (const a of [...node.attributes]) {
        const k = a.name,
          v = a.value;
        if (k === 'href' && node.localName === 'a') {
          if (!urlSafe(v)) fail('The static HTML contains an unsafe link');
          continue;
        }
        if (
          k === 'rel' &&
          node.localName === 'a' &&
          /^(?:noreferrer|noopener)(?: (?:noreferrer|noopener))?$/.test(v)
        )
          continue;
        if (k === 'value' && node.localName === 'li' && /^[1-9][0-9]?$/.test(v) && Number(v) <= 64)
          continue;
        if (k === 'src' && node.localName === 'img') {
          if (
            !(
              rendered
                ? /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/
                : /^mbb-static:[a-f0-9]{64}$/
            ).test(v)
          )
            fail('The static HTML contains an unverified image');
          continue;
        }
        if (k === 'style') {
          if (/url\s*\(|@|expression|behavior|[<>\\]/i.test(v))
            fail('The static HTML contains an unsafe inline style');
          continue;
        }
        if (
          k === 'headers' &&
          ['td', 'th'].includes(node.localName) &&
          /^[^\s<>]+(?:\s+[^\s<>]+)*$/.test(v)
        )
          continue;
        if (
          k === 'scope' &&
          node.localName === 'th' &&
          ['row', 'col', 'rowgroup', 'colgroup'].includes(v)
        )
          continue;
        if (k === 'data-mbb-tex' && !rendered && node.localName === 'span') continue;
        if (
          [
            'class',
            'id',
            'title',
            'alt',
            'width',
            'height',
            'colspan',
            'rowspan',
            'start',
            'open',
            'lang',
            'dir',
            'role',
            'hidden',
            'color',
            'size',
            'face',
          ].includes(k) ||
          /^aria-[a-z-]+$/.test(k)
        )
          continue;
        // Fixed SRE collapse bookkeeping is inert in a scriptless artifact.
        // Remove only the pinned node/key and finite tree syntax, never source attributes.
        if (
          rendered &&
          ['mjx-math', 'mjx-msubsup'].includes(node.localName) &&
          k === 'data-semantic-collapsed' &&
          v.length <= 8192 &&
          /^[() c0-9]+$/.test(v)
        ) {
          node.removeAttribute(k);
          continue;
        }
        // Pinned MathJax 4.1.3 CHTML marks glyphs without italic correction
        // with this exact literal. This is not an author-supplied math attribute.
        if (rendered && node.localName === 'mjx-c' && k === 'noic' && v === 'true') continue;
        if (
          math &&
          (/^data-(?:speech-node|c|mjx-texclass)$/.test(k) ||
            [
              'breakable',
              'has-speech',
              'inline-breaks',
              'overflow',
              'data-braille-attached',
              'data-speech-attached',
              'jax',
              'display',
              'mathvariant',
              'mathsize',
              'mathcolor',
              'mjx-speech',
              'data-mml-node',
              'data-latex',
              'data-semantic-added',
              'data-semantic-braille',
              'data-semantic-collapsible',
              'data-semantic-domain',
              'data-semantic-domain2style',
              'data-semantic-expandable',
              'data-semantic-font',
              'data-semantic-level',
              'data-semantic-locale',
              'data-semantic-operator',
              'data-semantic-prefix',
              'data-semantic-prefix-none',
              'data-semantic-speech',
              'data-semantic-speech-none',
              'data-semantic-style',
              'data-semantic-summary',
              'data-semantic-summary-none',
              'data-semantic-type',
              'data-semantic-role',
              'data-semantic-id',
              'data-semantic-children',
              'data-semantic-content',
              'data-semantic-parent',
              'data-semantic-annotation',
              'data-semantic-attributes',
              'space',
              'rspace',
              'lspace',
              'type',
              'accent',
              'stretchy',
              'symmetric',
              'largeop',
              'movablelimits',
              'limits',
              'texclass',
              'scriptlevel',
              'scriptsizemultiplier',
              'minsize',
              'maxsize',
              'align',
              'justify',
              'rowalign',
              'columnalign',
              'columnspacing',
              'rowspacing',
              'linethickness',
              'bevelled',
              'fence',
              'separator',
            ].includes(k))
        )
          continue;
        if (rendered && k === 'data-mbb-generated' && v === '') continue;
        if (
          rendered &&
          k === 'data-mbb-math-projection' &&
          v === 'chtml/v1' &&
          node.classList.contains('mbb-typeset')
        )
          continue;
        if (rendered && (k.startsWith('data-mbb-') || k === 'tabindex')) {
          node.removeAttribute(k);
          continue;
        }
        fail('The static HTML contains a forbidden attribute');
      }
      for (const child of [...node.childNodes]) walk(child, depth + 1);
    };
    for (const node of [...root.childNodes]) walk(node);
  };
  async function build(value, { cancelled = () => false } = {}) {
    const check = () => {
      if (cancelled()) fail('The static export was canceled');
    };
    check();
    if (
      !keys(value, [
        'schema',
        'kind',
        'title',
        'lang',
        'body',
        'css',
        'images',
        ...(value?.schema === 2 ? ['projections'] : []),
      ]) ||
      ![1, 2].includes(value.schema) ||
      value.kind !== 'markbridge-static' ||
      typeof value.title !== 'string' ||
      size(value.title) > 4096 ||
      typeof value.lang !== 'string' ||
      !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value.lang) ||
      typeof value.body !== 'string' ||
      !Array.isArray(value.images) ||
      value.images.length > 32
    )
      fail('The static export descriptor is invalid or exceeds its budget');
    if (
      value.body.length +
        (typeof value.css === 'string' ? value.css.length : MAX) +
        value.images.reduce(
          (n, img) => n + (typeof img?.data === 'string' ? img.data.length : MAX),
          0,
        ) >
      MAX
    )
      fail('The static export descriptor is invalid or exceeds its budget');
    const css = cssSafe(value.css),
      images = new Map();
    for (const image of value.images) {
      check();
      if (
        !keys(image, ['key', 'mime', 'bytes', 'data']) ||
        !/^[a-f0-9]{64}$/.test(image.key) ||
        images.has(image.key) ||
        !Number.isInteger(image.bytes) ||
        image.bytes < 1 ||
        image.bytes > 8388608 ||
        !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(image.mime)
      )
        fail('The static image descriptor is invalid');
      const data = bytes(image.data);
      if (
        data.length !== image.bytes ||
        !imageMagic(image.mime, data) ||
        (await digest(data)) !== image.key
      )
        fail('The static image digest or type does not match');
      images.set(image.key, 'data:' + image.mime + ';base64,' + image.data);
    }
    check();
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = value.body;
    audit(doc.body);
    let projectedBytes = size(value.body) + size(css) + size(value.title);
    for (const img of doc.querySelectorAll('img')) {
      const uri = images.get(img.getAttribute('src').slice(11));
      if (!uri) fail('The static HTML contains an unverified image');
      projectedBytes += uri.length - img.getAttribute('src').length;
      if (projectedBytes > MAX) fail('The static HTML exceeds 32 MiB. Content was not truncated');
    }
    for (const img of doc.querySelectorAll('img')) {
      const key = img.getAttribute('src').slice(11);
      if (!images.has(key)) fail('The static HTML contains an unverified image');
      img.src = images.get(key);
    }
    const mathSources = [
      ...doc.querySelectorAll('pre.wp-block-mbb-math,span.mbb-math[data-mbb-tex]'),
    ].map((n) => ({
      tex:
        n.localName === 'pre'
          ? (n.querySelector('code')?.textContent ?? n.getAttribute('data-mbb-tex'))
          : n.getAttribute('data-mbb-tex'),
      display: n.localName === 'pre',
    }));
    const count = mathSources.length;
    if (!window.MBB_MATH?.preview)
      fail('The formula preview engine is unavailable for static export');
    const rendered = await window.MBB_MATH.preview(doc.body.innerHTML);
    check();
    if (typeof rendered !== 'string' || size(rendered) > MAX)
      fail('The static HTML exceeds 32 MiB. Content was not truncated');
    doc.body.innerHTML = rendered;
    let mathCSS = '';
    for (const style of [...doc.querySelectorAll('style')]) {
      if (style.parentElement !== doc.body || !style.hasAttribute('data-mbb-chtml'))
        fail('The static math stylesheet is invalid');
      mathCSS += cssSafe(style.textContent, true);
      style.remove();
    }
    const formulas = [...doc.querySelectorAll('pre.wp-block-mbb-math,span.mbb-math[data-mbb-tex]')];
    if (
      formulas.length !== count ||
      formulas.some(
        (n, i) =>
          n.children.length !== 1 ||
          !n.firstElementChild.classList.contains('mbb-typeset') ||
          n.firstElementChild.getAttribute('aria-label') !== mathSources[i].tex ||
          (n.localName === 'pre') !== mathSources[i].display ||
          n.hasAttribute('data-mbb-math-error') ||
          !n.querySelector('mjx-container[jax="CHTML"]') ||
          n.querySelector('[data-mml-node="merror"]'),
      )
    )
      fail('Formula typesetting failed. No incomplete HTML was downloaded');
    for (const n of formulas)
      n.firstElementChild.setAttribute('data-mbb-math-projection', 'chtml/v1');
    if (window.MarkBridgeStaticCode?.render)
      await window.MarkBridgeStaticCode.render(doc.body, { cancelled });
    if (value.schema === 2) window.MarkBridgeProjection.insert(doc.body, value.projections);
    for (const detail of doc.querySelectorAll('details')) detail.open = true;
    audit(doc.body, true);
    check();
    const escape = (s) =>
      s.replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      );
    const csp =
      "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'";
    const html =
      '<!doctype html><html lang="' +
      escape(value.lang) +
      '"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
      escape(csp) +
      '"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      escape(value.title) +
      '</title><style>' +
      css +
      mathCSS +
      '</style></head><body data-mbb-content-view><h1>' +
      escape(value.title) +
      '</h1>' +
      doc.body.innerHTML.replace(/\r/g, '&#13;') +
      '</body></html>';
    if (size(html) > MAX) fail('The static HTML exceeds 32 MiB. Content was not truncated');
    check();
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  }
  window.MarkBridgeStaticExport = { build };
})();
