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
