/* Closed author contract. Resolution and public projection belong exclusively to the server. */
(() => {
  'use strict';
  const closed = (v, keys) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length === keys.length &&
    keys.every((k) => Object.hasOwn(v, k));
  const target = (v) =>
    (closed(v, ['kind', 'namespace', 'document']) &&
      v.kind === 'document' &&
      typeof v.namespace === 'string' &&
      typeof v.document === 'string' &&
      /^S_[a-f0-9]{32}$/.test(v.namespace) &&
      /^D_[a-f0-9]{32}$/.test(v.document)) ||
    (closed(v, ['kind', 'site', 'documentId']) &&
      v.kind === 'local-document' &&
      typeof v.site === 'string' &&
      /^S_[a-f0-9]{32}$/.test(v.site) &&
      typeof v.documentId === 'string' &&
      v.documentId.length > 0 &&
      new TextEncoder().encode(v.documentId).length <= 512 &&
      !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(v.documentId));
  function validate(p) {
    const fail = () => {
      throw Error(
        globalThis.MBBI18n?.t('Invalid controlled relationship map configuration.') ||
          'Invalid controlled relationship map configuration.',
      );
    };
    if (
      !closed(p, ['format', 'title', 'groups', 'nodes', 'edges']) ||
      p.format !== 'relation-map/v2' ||
      !Array.isArray(p.nodes) ||
      !Array.isArray(p.edges)
    )
      fail();
    const ids = new Set();
    for (const n of p.nodes) {
      if (
        !n ||
        !target(n.target) ||
        Object.keys(n).some(
          (k) => !['id', 'group', 'title', 'description', 'target'].includes(k),
        ) ||
        !['id', 'group', 'title', 'target'].every((k) => Object.hasOwn(n, k))
      )
        fail();
    }
    for (const e of p.edges) {
      if (
        !e ||
        typeof e.id !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(e.id) ||
        ids.has(e.id) ||
        Object.keys(e).some((k) => !['id', 'from', 'to', 'kind', 'why'].includes(k))
      )
        fail();
      ids.add(e.id);
    }
    const core =
      globalThis.MBBRelationMap ||
      (typeof require !== 'undefined' ? require('./relation-map.js') : null);
    core.validate({
      ...p,
      format: 'relation-map/v1',
      nodes: p.nodes.map(({ target, ...n }) => ({ ...n, url: '#controlled' })),
      edges: p.edges.map(({ id, ...e }) => e),
    });
    if (new TextEncoder().encode(JSON.stringify(p)).length > 16384) fail();
    return p;
  }
  globalThis.MBBRelationMapV2 = Object.freeze({ validate, target });
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.MBBRelationMapV2;
})();
