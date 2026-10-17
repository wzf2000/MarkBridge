import { technicalFields, technicalReference } from './technical.js';
// Copy only the selected owned subtree. External references retain their intent.
export function cloneActivity(block, identity, create, fail) {
  if (block?.name !== 'mbb/component' || block.attributes?.version !== 2)
    fail(
      'ACTIVITY_RELATION',
      'Activity relations require a closed map of unique local static targets',
    );
  const prefix =
      'activity-' +
      [...crypto.getRandomValues(new Uint8Array(12))]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join(''),
    mapping = new Map(),
    referenceKinds = new Map(),
    list = [];
  const visit = (b) => {
    list.push(b);
    for (const c of b.innerBlocks || []) visit(c);
  };
  visit(block);
  const own = (id) => {
    if (typeof id === 'string' && !mapping.has(id)) mapping.set(id, prefix + '-' + mapping.size);
  };
  for (const b of list) {
    const kind =
      b.name === 'mbb/object'
        ? b.attributes.kind
        : b.name === 'mbb/statement'
          ? 'statement'
          : b.name === 'mbb/step'
            ? 'step'
            : b.name === 'mbb/component' && b.attributes.version === 2
              ? 'activity'
              : null;
    if (kind) referenceKinds.set(b.attributes.id, kind);
    own(b.attributes.id);
    own(b.attributes.anchor);
    for (const tab of b.attributes.tabs || []) own(tab.id);
    for (const f of technicalFields(b)) {
      const doc = document.createElement('template');
      doc.innerHTML = f.html;
      for (const node of doc.content.querySelectorAll('[id]'))
        if (!node.closest('pre,code')) own(node.id);
    }
  }
  const rewrite = (html) => {
    // Preserve original bytes except explicit attributes/closed reference markers; never parse code as prose.
    const literals = [...html.matchAll(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)].map((m) => [
      m.index,
      m.index + m[0].length,
    ]);
    return html.replace(/<span\b[^>]*>\[[^<>]*\]<\/span>|<[A-Za-z][^>]*>/g, (raw, offset) => {
      if (literals.some(([a, b]) => offset >= a && offset < b)) return raw;
      if (raw.startsWith('<span') && raw.includes('mbb-xref')) {
        let ref;
        try {
          ref = technicalReference(raw, fail);
        } catch {
          return raw;
        }
        if (
          ref.kind === 'xref' &&
          mapping.has(ref.keys[0]) &&
          referenceKinds.has(ref.keys[0]) &&
          (ref.version !== 2 ||
            (ref.namespace === identity?.namespace &&
              ref.document === identity?.document &&
              ref.targetKind === referenceKinds.get(ref.keys[0])))
        ) {
          const from = ref.keys[0],
            to = mapping.get(from);
          return raw
            .replace('data-mbb-target="' + from + '"', 'data-mbb-target="' + to + '"')
            .replace('>[' + from + ']<', '>[' + to + ']<');
        }
        return raw;
      }
      return raw.replace(
        /\b(id|href|aria-labelledby|aria-describedby|aria-controls|headers)="([^"]*)"/g,
        (match, key, value) => {
          let fragment;
          if (key === 'href' && value.startsWith('#')) {
            try {
              fragment = decodeURIComponent(value.slice(1));
            } catch {}
          }
          const next =
            key === 'href'
              ? mapping.has(fragment)
                ? '#' + mapping.get(fragment)
                : value
              : value
                  .split(/\s+/)
                  .map((id) => mapping.get(id) || id)
                  .join(' ');
          return next === value ? match : key + '="' + next + '"';
        },
      );
    });
  };
  const copy = (b) => {
    const a = JSON.parse(JSON.stringify(b.attributes));
    if (mapping.has(a.id)) a.id = mapping.get(a.id);
    if (mapping.has(a.anchor)) a.anchor = mapping.get(a.anchor);
    for (const tab of a.tabs || []) tab.id = mapping.get(tab.id) || tab.id;
    if (b.name === 'mbb/code-tabs') a.defaultTab = mapping.get(a.defaultTab) || a.defaultTab;
    if (a.activity) {
      const r = a.activity;
      r.prompt = mapping.get(r.prompt);
      r.explanation = mapping.get(r.explanation);
      r.hints = r.hints.map((id) => mapping.get(id));
      r.options = r.options.map((o) => ({ ...o, target: mapping.get(o.target) }));
      for (const key of ['correct', 'incorrect']) r.feedback[key] = mapping.get(r.feedback[key]);
    }
    for (const f of technicalFields(b)) {
      let target = a;
      for (const key of f.path.slice(0, -1)) target = target[key];
      target[f.path.at(-1)] = rewrite(f.html);
    }
    return create(b.name, a, (b.innerBlocks || []).map(copy));
  };
  return copy(block);
}
