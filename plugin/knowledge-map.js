/* Closed knowledge-map model; authorization belongs to the server. */
(() => {
  'use strict';
  const id = (v) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
  const target = (v) => {
    const base =
      globalThis.MBBRelationMapV2 ||
      (typeof require !== 'undefined' ? require('./relation-map-v2.js') : null);
    return (
      base.target(v) ||
      (v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Object.keys(v).sort().join(',') === 'document,kind,namespace,target' &&
        ['step', 'activity'].includes(v.kind) &&
        typeof v.namespace === 'string' &&
        /^S_[a-f0-9]{32}$/.test(v.namespace) &&
        typeof v.document === 'string' &&
        /^D_[a-f0-9]{32}$/.test(v.document) &&
        id(v.target))
    );
  };
  function validate(p) {
    const fail = () => {
      throw Error(
        globalThis.MBBI18n?.t('Invalid knowledge map configuration.') ||
          'Invalid knowledge map configuration.',
      );
    };
    if (
      !p ||
      p.format !== 'knowledge-map/v1' ||
      !Array.isArray(p.nodes) ||
      p.nodes.length > 32 ||
      !Array.isArray(p.edges) ||
      p.edges.length > 32
    )
      fail();
    for (const n of p.nodes) {
      if (
        !n ||
        Array.isArray(n) ||
        !target(n.target) ||
        !['concept', 'reading', 'practice'].includes(n.role) ||
        typeof n.title !== 'string' ||
        [...n.title].length > 96 ||
        Object.keys(n).some(
          (k) => !['id', 'group', 'title', 'role', 'target', 'description'].includes(k),
        )
      )
        fail();
    }
    const kinds = { prerequisite: 'recommended', explains: 'compare', practises: 'optimization' },
      seen = new Set(),
      adj = new Map();
    for (const e of p.edges) {
      if (!e || Array.isArray(e) || !id(e.id) || seen.has(e.id) || !Object.hasOwn(kinds, e.kind))
        fail();
      seen.add(e.id);
      if (e.kind === 'prerequisite') adj.set(e.from, [...(adj.get(e.from) || []), e.to]);
    }
    const core =
      globalThis.MBBRelationMap ||
      (typeof require !== 'undefined' ? require('./relation-map.js') : null);
    core.validate({
      ...p,
      format: 'relation-map/v1',
      nodes: p.nodes.map(({ target, role, ...n }) => ({ ...n, url: '#controlled' })),
      edges: p.edges.map(({ id, ...e }) => ({ ...e, kind: kinds[e.kind] })),
    });
    const marks = new Map();
    const visit = (id) => {
      if (marks.get(id) === 1) fail();
      if (marks.get(id) === 2) return;
      marks.set(id, 1);
      for (const to of adj.get(id) || []) visit(to);
      marks.set(id, 2);
    };
    p.nodes.forEach((n) => visit(n.id));
    if (new TextEncoder().encode(JSON.stringify(p)).length > 16384) fail();
    return p;
  }
  globalThis.MBBKnowledgeMap = Object.freeze({ validate, target });
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.MBBKnowledgeMap;
})();
