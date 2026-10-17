(() => {
  'use strict';
  const P = __MBB_PROJECTION_PROFILE__;
  const closed = (v, keys, optional = []) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).every((k) => [...keys, ...optional].includes(k)) &&
    keys.every((k) => Object.hasOwn(v, k));
  const fail = () => {
    throw Error('Invalid static component projection');
  };
  const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const text = (v, max = 1024) =>
    typeof v === 'string' &&
    new TextEncoder().encode(v).length <= max &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v) &&
    !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(v);
  function validate(value) {
    if (
      !closed(value, ['schema', 'tree']) ||
      value.schema !== 1 ||
      !Array.isArray(value.tree) ||
      new TextEncoder().encode(JSON.stringify(value)).length > 131072
    )
      fail();
    let count = 0;
    const keys = new Set(),
      refs = [];
    const walk = (n, depth, svg = false) => {
      if (++count > 4096 || depth > 16) fail();
      if (typeof n === 'string') {
        if (!text(n, 16384)) fail();
        return;
      }
      if (
        !closed(n, ['tag', 'attrs', 'children'], ['key']) ||
        typeof n.tag !== 'string' ||
        !n.attrs ||
        typeof n.attrs !== 'object' ||
        Array.isArray(n.attrs) ||
        !Array.isArray(n.children)
      )
        fail();
      svg = svg || n.tag === 'svg';
      if (!P[svg ? 'svg' : 'html'].includes(n.tag)) fail();
      if (Object.hasOwn(n, 'key')) {
        if (
          typeof n.key !== 'string' ||
          !/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(n.key) ||
          keys.has(n.key)
        )
          fail();
        keys.add(n.key);
      }
      for (const [k, v] of Object.entries(n.attrs)) {
        if (svg && P.attributeTags[k] && !P.attributeTags[k].includes(n.tag)) fail();
        let ok = false;
        if (k === 'class') ok = P.classes.includes(v);
        else if (k === 'labelledby') {
          ok =
            Array.isArray(v) &&
            v.length > 0 &&
            v.length <= 8 &&
            v.every((r) => typeof r === 'string');
          if (ok) refs.push(...v);
        } else if (P.text.includes(k)) ok = text(v);
        else if (k === 'role') ok = ['img', 'region', 'note'].includes(v);
        else if (!svg && k === 'scope' && n.tag === 'th') ok = ['row', 'col'].includes(v);
        else if (!svg && ['colspan', 'rowspan'].includes(k) && ['td', 'th'].includes(n.tag))
          ok = Number.isInteger(v) && v >= 1 && v <= 16;
        else if (svg && P.coordinates.includes(k)) ok = finite(v, -1e6, 1e6);
        else if (svg && P.sizes.includes(k)) ok = finite(v, 0, 4096);
        else if (svg && P.colors.includes(k))
          ok = typeof v === 'string' && /^(none|#[a-fA-F0-9]{6})$/.test(v);
        else if (svg && k === 'stroke-width') ok = finite(v, 0, 16);
        else if (svg && k === 'font-size') ok = finite(v, 8, 32);
        else if (svg && k === 'text-anchor') ok = ['start', 'middle', 'end'].includes(v);
        else if (svg && k === 'viewBox' && n.tag === 'svg')
          ok =
            Array.isArray(v) &&
            v.length === 4 &&
            finite(v[0], -1e6, 1e6) &&
            finite(v[1], -1e6, 1e6) &&
            finite(v[2], 1, 4096) &&
            finite(v[3], 1, 4096);
        else if (svg && k === 'points' && ['polyline', 'polygon'].includes(n.tag))
          ok =
            Array.isArray(v) &&
            v.length >= 1 &&
            v.length <= 256 &&
            v.every(
              (p) => Array.isArray(p) && p.length === 2 && p.every((x) => finite(x, -1e6, 1e6)),
            );
        if (!ok) fail();
      }
      n.children.forEach((c) => walk(c, depth + 1, svg));
    };
    value.tree.forEach((n) => walk(n, 0));
    if (refs.some((r) => !keys.has(r))) fail();
    return [...keys];
  }
  function insert(root, items) {
    if (!Array.isArray(items)) fail();
    const doc = root.ownerDocument,
      used = new Set();
    let total = 0;
    for (const n of root.querySelectorAll('[id]')) {
      if (used.has(n.id)) fail();
      used.add(n.id);
    }
    for (const item of items) {
      if (
        !closed(item, [
          'target',
          'component',
          'version',
          'fingerprint',
          'state',
          'params',
          'projection',
        ]) ||
        typeof item.target !== 'string' ||
        !['available', 'unavailable', 'author-fallback'].includes(item.state) ||
        new TextEncoder().encode(JSON.stringify(item.params)).length > 16384
      )
        fail();
      const targets = [...root.querySelectorAll('[id]')].filter((n) => n.id === item.target);
      if (targets.length !== 1) fail();
      const wrapper = doc.createElement('section');
      wrapper.className = 'mbb-projection';
      try {
        if (item.state !== 'available') fail();
        const keys = validate(item.projection),
          map = new Map();
        for (const key of keys) {
          let n = 0,
            id = 'mbb-proj-' + key;
          while (used.has(id)) id = 'mbb-proj-' + ++n + '-' + key;
          used.add(id);
          map.set(key, id);
        }
        const make = (n, svg = false) => {
          if (typeof n === 'string') return doc.createTextNode(n);
          svg = svg || n.tag === 'svg';
          const out = svg
            ? doc.createElementNS('http://www.w3.org/2000/svg', n.tag)
            : doc.createElement(n.tag);
          if (n.key) out.id = map.get(n.key);
          for (let [k, v] of Object.entries(n.attrs)) {
            if (k === 'labelledby') {
              k = 'aria-labelledby';
              v = v.map((r) => map.get(r)).join(' ');
            } else if (k === 'label') k = 'aria-label';
            else if (k === 'points') v = v.map((p) => p.join(',')).join(' ');
            else if (Array.isArray(v)) v = v.join(' ');
            out.setAttribute(k, String(v));
          }
          n.children.forEach((c) => out.append(make(c, svg)));
          return out;
        };
        item.projection.tree.forEach((n) => wrapper.append(make(n)));
        const size = new TextEncoder().encode(wrapper.outerHTML).length;
        if (size > 131072 || total + size > 524288) fail();
        total += size;
      } catch {
        wrapper.replaceChildren();
        const p = doc.createElement('p');
        p.textContent =
          globalThis.MBBI18n?.t(
            'Static view unavailable. Original content and read-only configuration are preserved.',
          ) ||
          'Static view unavailable. Original content and read-only configuration are preserved.';
        const details = doc.createElement('details'),
          summary = doc.createElement('summary'),
          pre = doc.createElement('pre');
        summary.textContent =
          globalThis.MBBI18n?.t('Configuration (read only)') || 'Configuration (read only)';
        pre.textContent = JSON.stringify(item.params);
        details.append(summary, pre);
        if (item.state !== 'author-fallback') wrapper.append(p);
        wrapper.append(details);
      }
      if (item.state === 'available') targets[0].prepend(wrapper);
      else targets[0].append(wrapper);
    }
  }
  function auditSVG(svg) {
    const ids = new Map(),
      external = [];
    for (const n of [svg, ...svg.querySelectorAll('[id]')])
      if (n.id) {
        if (ids.has(n.id)) fail();
        ids.set(n.id, 'node' + ids.size);
      }
    const number = (s) => {
      if (
        typeof s !== 'string' ||
        s.length > 64 ||
        !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(s)
      )
        fail();
      return Number(s);
    };
    const convert = (n) => {
      if (n.nodeType === 3) return n.textContent;
      if (n.nodeType !== 1 || n.namespaceURI !== 'http://www.w3.org/2000/svg') fail();
      const out = { tag: n.localName, attrs: {}, children: [...n.childNodes].map(convert) };
      if (n.id) out.key = ids.get(n.id);
      for (const a of [...n.attributes]) {
        let k = a.name,
          v = a.value;
        if (k === 'id') continue;
        if (k === 'xmlns' && n === svg && v === 'http://www.w3.org/2000/svg') continue;
        if (k === 'aria-labelledby') {
          k = 'labelledby';
          v = v.split(' ').map((id) => {
            if (!ids.has(id)) {
              const matches = [
                ...(svg.closest('.mbb-projection') || svg).querySelectorAll('[id]'),
              ].filter((n) => n.id === id);
              if (matches.length !== 1) fail();
              const key = 'node' + ids.size;
              ids.set(id, key);
              external.push({ tag: 'span', key, attrs: {}, children: [] });
            }
            return ids.get(id);
          });
        } else if (k === 'aria-label') k = 'label';
        else if (k === 'viewBox') v = v.trim().split(/\s+/).map(number);
        else if (k === 'points')
          v = v
            .trim()
            .split(/\s+/)
            .map((p) => p.split(',').map(number));
        else if ([...P.coordinates, ...P.sizes, 'stroke-width', 'font-size'].includes(k))
          v = number(v);
        out.attrs[k] = v;
      }
      return out;
    };
    const tree = convert(svg);
    validate({ schema: 1, tree: [tree, ...external] });
    return true;
  }
  globalThis.MarkBridgeProjection = Object.freeze({ version: 1, validate, insert, auditSVG });
})();
