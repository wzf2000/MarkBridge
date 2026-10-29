(() => {
  'use strict';
  function validate(p) {
    const closed = (v, keys) =>
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === keys.length &&
      keys.every((k) => Object.hasOwn(v, k));
    const fail = () => {
      throw Error('Invalid relationship map display configuration.');
    };
    if (
      !closed(p, ['format', 'title', 'groups', 'nodes', 'edges', 'display']) ||
      p.format !== 'relation-map/v3' ||
      !closed(p.display, ['mobileStart']) ||
      !closed(p.display.mobileStart, ['kind', 'id'])
    )
      fail();
    const { kind, id } = p.display.mobileStart;
    if (
      typeof id !== 'string' ||
      !['auto', 'group', 'node'].includes(kind) ||
      (kind === 'auto'
        ? id !== ''
        : !(kind === 'group' ? p.groups : p.nodes)?.some((n) => n.id === id))
    )
      fail();
    const { display, ...copy } = p;
    const core =
      globalThis.MBBRelationMapV2 ||
      (typeof require !== 'undefined' ? require('./relation-map-v2.js') : null);
    core.validate({ ...copy, format: 'relation-map/v2' });
    if (new TextEncoder().encode(JSON.stringify(p)).length > 16384) fail();
    return p;
  }
  function publicDisplay(display, map) {
    const keys = (v, expected) =>
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === expected.length &&
      expected.every((k) => Object.hasOwn(v, k));
    if (!keys(display, ['mobileStart'])) return false;
    const h = display.mobileStart;
    if (h === null) return true;
    if (!keys(h, ['kind', 'id']) || typeof h.id !== 'string' || !['group', 'node'].includes(h.kind))
      return false;
    return h.kind === 'group'
      ? /^g_[a-f0-9]{32}$/.test(h.id) && !!map?.groups?.some((n) => n.id === h.id)
      : /^n_[a-f0-9]{32}$/.test(h.id) && !!map?.nodes?.some((n) => n.id === h.id);
  }
  globalThis.MBBRelationMapV3 = Object.freeze({ validate, publicDisplay });
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.MBBRelationMapV3;
})();
