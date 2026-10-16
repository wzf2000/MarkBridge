// Closed, data-only technical-writing v1 contract. Presentation numbers/links
// are deliberately absent from these persisted structures.
export const technicalSchemas = {
  object: { id: 'string', kind: 'string', caption: 'string' },
  statement: { id: 'string', kind: 'string', title: 'string', open: 'boolean' },
  bibliography: { id: 'string', entries: 'object' },
};
export const technicalKind = (name) =>
  name?.startsWith('mbb/') && Object.hasOwn(technicalSchemas, name.slice(4)) ? name.slice(4) : null;
export const technicalId = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const plain = (value, limit, nonempty = false) =>
  typeof value === 'string' &&
  [...value].length <= limit &&
  !/[\r\n\x00\uD800-\uDFFF]/u.test(value) &&
  (!nonempty ||
    value.replace(
      /[ \t\r\n\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/gu,
      '',
    ).length > 0);
const bad = (fail, message) => fail('TECHNICAL_ATTRIBUTES', message);
export function technicalAttributes(kind, attrs, fail) {
  if (kind === 'object') {
    if (
      !['equation', 'figure', 'table', 'listing'].includes(attrs.kind) ||
      !plain(attrs.caption, 512, true)
    )
      bad(fail, 'An object requires a supported kind and a plain caption of 1–512 characters');
  } else if (kind === 'statement') {
    if (
      !['definition', 'theorem', 'proof'].includes(attrs.kind) ||
      !plain(attrs.title, 200, true) ||
      (attrs.kind !== 'proof' && attrs.open !== true)
    )
      bad(fail, 'A statement requires a supported kind and title; only proofs may be closed');
  } else if (kind === 'bibliography') {
    const entries = attrs.entries;
    if (
      !Array.isArray(entries) ||
      !entries.length ||
      entries.length > 64 ||
      new TextEncoder().encode(JSON.stringify(entries)).length > 65536
    )
      bad(fail, 'A bibliography requires 1–64 entries within 64 KiB');
    const keys = new Set();
    for (const entry of entries) {
      if (
        !entry ||
        Array.isArray(entry) ||
        typeof entry !== 'object' ||
        Object.keys(entry).sort().join(',') !== 'authors,key,source,title,url,year' ||
        typeof entry.key !== 'string' ||
        !technicalId.test(entry.key) ||
        keys.has(entry.key) ||
        !Array.isArray(entry.authors) ||
        entry.authors.length > 8 ||
        entry.authors.some((name) => !plain(name, 120, true)) ||
        !plain(entry.title, 512, true) ||
        !plain(entry.source, 512) ||
        !plain(entry.year, 32) ||
        !plain(entry.url, 2048)
      )
        bad(fail, 'Bibliography fields are incomplete, duplicated, or outside their bounds');
      keys.add(entry.key);
      if (entry.url) {
        let url;
        try {
          url = new URL(entry.url);
        } catch {
          bad(fail, 'Bibliography URLs must use absolute HTTP or HTTPS');
        }
        if (
          !/^https?:\/\/[^/?#]+/i.test(entry.url) ||
          !url.hostname ||
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          /[\x00-\x20\x7f\\\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/u.test(
            entry.url,
          )
        )
          bad(fail, 'Bibliography URLs must use absolute HTTP or HTTPS without credentials');
      }
    }
  }
  return attrs;
}
export function technicalReference(raw, fail, complete = true) {
  const match = /^<span((?:\s+[a-z][a-z0-9-]*="[^"<>]*")+)>([^<>\r\n]*)<\/span>/.exec(raw);
  const invalid = () =>
    fail(
      'TECHNICAL_REFERENCE',
      'The versioned reference marker is malformed or its text differs from its identity',
    );
  if (!match || (complete && match[0].length !== raw.length)) return invalid();
  const attrs = new Map();
  for (const item of match[1].matchAll(/\s+([a-z][a-z0-9-]*)="([^"<>]*)"/g)) {
    if (attrs.has(item[1])) return invalid();
    attrs.set(item[1], item[2]);
  }
  const kind =
    attrs.get('class') === 'mbb-xref' ? 'xref' : attrs.get('class') === 'mbb-cite' ? 'cite' : null;
  const identity = attrs.get(kind === 'xref' ? 'data-mbb-target' : 'data-mbb-keys');
  if (
    !kind ||
    attrs.size !== 3 ||
    attrs.get('data-mbb-version') !== '1' ||
    typeof identity !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}(?:,[A-Za-z][A-Za-z0-9_-]{0,63}){0,7}$/.test(identity) ||
    (kind === 'xref' && identity.includes(',')) ||
    match[2] !== '[' + identity + ']'
  )
    return invalid();
  const keys = identity.split(',');
  if (new Set(keys).size !== keys.length) return invalid();
  return { raw: match[0], kind, keys };
}
export function technicalReferenceOpening(raw) {
  return /^<span\b[^>]*(?:mbb-(?:xref|cite)|data-mbb-(?:target|keys|version))/i.test(raw);
}
export function technicalRawHTML(html, fail) {
  // Existing raw code blocks remain literal. Never inspect their example tags.
  const projected = html.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  for (const match of projected.matchAll(/<span\b[^>]*>/gi))
    if (technicalReferenceOpening(match[0]))
      technicalReference(projected.slice(match.index), fail, false);
}
export function installTechnicalInline(md, fail) {
  md.inline.ruler.before('html_inline', 'mbb_technical_reference', (state, silent) => {
    const raw = state.src.slice(state.pos, state.posMax);
    if (!technicalReferenceOpening(raw)) return false;
    let code = 0;
    for (const token of state.tokens)
      if (token.type === 'html_inline') {
        if (/^<(?:code|pre)(?:\s|>)/i.test(token.content)) code++;
        else if (/^<\/(?:code|pre)\s*>/i.test(token.content)) code = Math.max(0, code - 1);
      }
    if (code) return false;
    const ref = technicalReference(raw, fail, false);
    if (state.linkLevel)
      fail('TECHNICAL_REFERENCE', 'Technical references must not be inside links or images');
    if (!silent) state.push('mbb_technical_reference', '', 0).content = ref.raw;
    state.pos += ref.raw.length;
    return true;
  });
  md.renderer.rules.mbb_technical_reference = (tokens, i) => tokens[i].content;
}
export function validateTechnical(blocks, fail) {
  const objects = new Set(),
    keys = new Set(),
    refs = [];
  let bibliographies = 0,
    count = 0;
  const walk = (list, depth = 0, footnote = false) => {
    let seenFootnotes = false;
    for (const block of list) {
      const name = block.name || block.blockName,
        a = block.attributes || block.attrs || {},
        inner = block.innerBlocks || block.children || [],
        kind = technicalKind(name);
      if (name === 'mbb/footnotes') seenFootnotes = true;
      if (kind) {
        if (++count > 2048) fail('STRUCTURE_LIMIT', 'Technical objects exceed the document budget');
        technicalAttributes(kind, a, fail);
        if (kind !== 'bibliography') {
          if (footnote)
            fail(
              'TECHNICAL_STRUCTURE',
              'Technical objects and statements must not be inside footnotes',
            );
          objects.add(a.id);
        }
        if (
          kind === 'object' &&
          (inner.length !== 1 ||
            inner[0].name !==
              {
                equation: 'mbb/math',
                figure: 'core/image',
                table: 'core/table',
                listing: 'mbb/code',
              }[a.kind])
        )
          fail(
            'TECHNICAL_STRUCTURE',
            'An object must contain exactly one matching supported block',
          );
        if (kind === 'statement' && !inner.length)
          fail('TECHNICAL_STRUCTURE', 'A statement body must not be empty');
        if (kind === 'bibliography') {
          if (++bibliographies > 1 || depth || inner.length || seenFootnotes)
            fail(
              'TECHNICAL_STRUCTURE',
              'One bibliography is allowed at top level before footnotes, without body blocks',
            );
          for (const entry of a.entries) keys.add(entry.key);
        }
      }
      for (const field of technicalFields(block)) {
        const html = field.html;
        technicalRawHTML(html, fail);
        const template = document.createElement('template');
        template.innerHTML = html;
        for (const node of template.content.querySelectorAll('span.mbb-xref,span.mbb-cite')) {
          if (node.closest('code,pre')) continue;
          if (node.closest('a'))
            fail('TECHNICAL_REFERENCE', 'Technical references must not be inside links or images');
          refs.push(technicalReference(node.outerHTML, fail));
          if (refs.length > 4096)
            fail('STRUCTURE_LIMIT', 'Technical references exceed the document budget');
        }
      }
      walk(inner, depth + 1, footnote || name === 'mbb/footnote');
    }
  };
  walk(blocks);
  for (const ref of refs)
    for (const key of ref.keys)
      if (!(ref.kind === 'xref' ? objects : keys).has(key))
        fail(
          'TECHNICAL_MISSING',
          'A technical reference has no matching object or bibliography entry',
        );
}

/** Explicit inline HTML fields, including WordPress's RichText data objects. */
export function technicalFields(block) {
  const a = block.attributes || {},
    fields = [];
  const add = (path, value) => {
    if (value !== undefined && value !== null) fields.push({ path, html: String(value) });
  };
  if (['mbb/code', 'mbb/math', 'core/code', 'core/preformatted'].includes(block.name))
    return fields;
  add(['content'], a.content);
  if (block.name === 'core/html' && a.content === undefined)
    add(['content'], block.originalContent ?? block.innerContent?.join(''));
  if (block.name === 'core/image') add(['caption'], a.caption);
  if (block.name === 'core/table')
    for (const section of ['head', 'body', 'foot'])
      for (const [rowIndex, row] of (a[section] || []).entries())
        for (const [cellIndex, cell] of (row.cells || []).entries())
          add([section, rowIndex, 'cells', cellIndex, 'content'], cell.content);
  return fields;
}
export function referenceHTML(kind, keys) {
  if (
    !['xref', 'cite'].includes(kind) ||
    !Array.isArray(keys) ||
    keys.length < 1 ||
    keys.length > 8 ||
    (kind === 'xref' && keys.length !== 1) ||
    keys.some((key) => typeof key !== 'string' || !technicalId.test(key)) ||
    new Set(keys).size !== keys.length
  )
    throw Error('Reference kinds and keys must match the closed technical-writing contract');
  const identity = keys.join(',');
  return `<span data-mbb-${kind === 'xref' ? 'target' : 'keys'}="${identity}" data-mbb-version="1" class="mbb-${kind}">[${identity}]</span>`;
}
const allBlocks = (blocks) => {
  const found = [],
    stack = blocks.map((block) => ({ block, depth: 0 })).reverse();
  while (stack.length) {
    const { block, depth } = stack.pop();
    if (depth > 32 || found.length >= 10000)
      throw Error('Technical structure exceeds its depth or node budget');
    found.push(block);
    for (const child of [...(block.innerBlocks || [])].reverse())
      stack.push({ block: child, depth: depth + 1 });
  }
  return found;
};
const parsedFields = (block) =>
  technicalFields(block).map((field) => {
    const template = document.createElement('template');
    template.innerHTML = field.html;
    return { ...field, root: template.content };
  });
/** Derived preview labels only; this result must never be stored in block attrs. */
export function technicalIndex(blocks) {
  const targets = [],
    entries = [],
    counts = {},
    notes = new Map(),
    noteOrder = [],
    bodyRefs = [],
    noteRefs = new Map();
  const addRefs = (block, refs) => {
    for (const field of parsedFields(block)) {
      for (const node of field.root.querySelectorAll(
        'span.mbb-xref,span.mbb-cite,span.mbb-footnote-ref',
      )) {
        if (node.closest('code,pre')) continue;
        if (node.className === 'mbb-footnote-ref') {
          const label = node.getAttribute('data-mbb-footnote');
          if (!noteOrder.includes(label)) noteOrder.push(label);
        } else {
          // An unfinished author marker is diagnosed separately; keep valid picker targets usable.
          try {
            refs.push(
              technicalReference(node.outerHTML, (code, message) => {
                throw Error(message);
              }),
            );
          } catch {}
        }
      }
    }
  };
  const visit = (list, note = null) => {
    for (const block of list) {
      const a = block.attributes || {},
        kind = technicalKind(block.name);
      if (kind === 'object' || kind === 'statement')
        targets.push({
          id: a.id,
          kind: a.kind,
          title: a.caption ?? a.title,
          number: (counts[a.kind] = (counts[a.kind] || 0) + 1),
          clientId: block.clientId,
        });
      if (kind === 'bibliography')
        for (const entry of a.entries || []) entries.push({ ...entry, clientId: block.clientId });
      if (block.name === 'mbb/footnote') {
        notes.set(a.label, block);
        noteRefs.set(a.label, []);
        visit(block.innerBlocks || [], a.label);
        continue;
      }
      addRefs(block, note === null ? bodyRefs : noteRefs.get(note));
      visit(block.innerBlocks || [], note);
    }
  };
  visit(blocks);
  const ordered = [
    ...bodyRefs,
    ...noteOrder.flatMap((label) => noteRefs.get(label) || []),
    ...[...notes.keys()]
      .filter((label) => !noteOrder.includes(label))
      .flatMap((label) => noteRefs.get(label) || []),
  ];
  const numbers = new Map();
  for (const ref of ordered)
    if (ref.kind === 'cite')
      for (const key of ref.keys) if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
  for (const entry of entries)
    if (!numbers.has(entry.key)) numbers.set(entry.key, numbers.size + 1);
  return {
    targets,
    entries: entries.map((entry) => ({ ...entry, number: numbers.get(entry.key) })),
  };
}
/** Preflight and immutable attribute patches, committed by one block-store action. */
export function technicalRenamePlan(blocks, type, from, to, fail) {
  if (!['label', 'key'].includes(type) || !technicalId.test(from) || !technicalId.test(to))
    fail(
      'TECHNICAL_ID',
      'Labels and keys must begin with an ASCII letter and contain at most 64 letters, digits, underscores or hyphens',
    );
  const list = allBlocks(blocks),
    index = technicalIndex(blocks),
    matches =
      type === 'label'
        ? index.targets.filter((item) => item.id === from)
        : index.entries.filter((item) => item.key === from);
  if (matches.length !== 1)
    fail('TECHNICAL_ID', 'The original label or key is missing or duplicated');
  if (from === to) return { patches: [], affectedReferences: 0 };
  const ids = [];
  for (const block of list) {
    const a = block.attributes || {};
    if (a.id) ids.push(a.id);
    if (a.anchor) ids.push(a.anchor);
    for (const tab of a.tabs || []) if (tab.id) ids.push(tab.id);
    for (const field of parsedFields(block))
      for (const node of field.root.querySelectorAll('[id]')) ids.push(node.id);
  }
  if ((type === 'label' ? ids : index.entries.map((entry) => entry.key)).includes(to))
    fail('TECHNICAL_ID', 'The proposed label or key already exists');
  let affectedReferences = 0;
  const patches = [];
  for (const block of list) {
    const attrs = block.attributes || {},
      patch = {};
    if (type === 'label' && technicalKind(block.name) !== null && attrs.id === from) patch.id = to;
    if (
      type === 'key' &&
      block.name === 'mbb/bibliography' &&
      attrs.entries.some((entry) => entry.key === from)
    )
      patch.entries = attrs.entries.map((entry) =>
        entry.key === from ? { ...entry, key: to } : entry,
      );
    for (const field of technicalFields(block)) {
      const literalRanges = [...field.html.matchAll(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)].map(
        (m) => [m.index, m.index + m[0].length],
      );
      const replacements = [];
      for (const opening of field.html.matchAll(/<span\b[^>]*>/g)) {
        const offset = opening.index;
        if (
          !technicalReferenceOpening(opening[0]) ||
          literalRanges.some(([start, end]) => offset >= start && offset < end)
        )
          continue;
        const ref = technicalReference(field.html.slice(offset), fail, false);
        if (ref.kind !== (type === 'label' ? 'xref' : 'cite') || !ref.keys.includes(from)) continue;
        affectedReferences++;
        replacements.push({
          offset,
          length: ref.raw.length,
          html: referenceHTML(
            ref.kind,
            ref.keys.map((key) => (key === from ? to : key)),
          ),
        });
      }
      let updated = field.html;
      for (const replacement of replacements.reverse())
        updated =
          updated.slice(0, replacement.offset) +
          replacement.html +
          updated.slice(replacement.offset + replacement.length);
      if (updated === field.html) continue;
      const [top, ...path] = field.path;
      if (!path.length) patch[top] = updated;
      else {
        if (!Object.hasOwn(patch, top)) patch[top] = JSON.parse(JSON.stringify(attrs[top]));
        let target = patch[top];
        for (const part of path.slice(0, -1)) target = target[part];
        target[path.at(-1)] = updated;
      }
    }
    if (Object.keys(patch).length) patches.push({ clientId: block.clientId, attributes: patch });
  }
  return { patches, affectedReferences };
}
export function technicalReferenceCount(blocks, type, key) {
  let count = 0;
  for (const block of allBlocks(blocks))
    for (const field of parsedFields(block))
      for (const node of field.root.querySelectorAll(
        type === 'label' ? 'span.mbb-xref' : 'span.mbb-cite',
      )) {
        if (node.closest('code,pre')) continue;
        const ref = technicalReference(node.outerHTML, (code, message) => {
          throw Error(message);
        });
        if (ref.keys.includes(key)) count++;
      }
  return count;
}
/** Bounded author feedback; it never repairs or persists an incomplete draft. */
export function technicalDiagnostics(blocks) {
  const ids = new Map(),
    targetCounts = new Map(),
    keyCounts = new Map(),
    references = [],
    issues = [],
    invalidTargets = new Set(),
    invalidKeys = new Set();
  const add = (code, identity = '') => {
    if (issues.length < 32 && !issues.some((i) => i.code === code && i.identity === identity))
      issues.push({ code, identity });
  };
  const count = (map, key) => {
    if (typeof key === 'string') map.set(key, (map.get(key) || 0) + 1);
  };
  for (const block of allBlocks(blocks)) {
    const a = block.attributes || {},
      kind = technicalKind(block.name);
    count(ids, a.id);
    count(ids, a.anchor);
    for (const tab of a.tabs || []) count(ids, tab.id);
    if (kind === 'object' || kind === 'statement') count(targetCounts, a.id);
    if (kind === 'bibliography') for (const entry of a.entries || []) count(keyCounts, entry.key);
    if (kind) {
      try {
        technicalAttributes(kind, a, (code, message) => {
          throw Error(message);
        });
      } catch {
        add('attributes', a.id);
        if (kind === 'bibliography')
          for (const entry of a.entries || []) invalidKeys.add(entry.key);
        else invalidTargets.add(a.id);
      }
    }
    if (
      kind === 'object' &&
      ((block.innerBlocks || []).length !== 1 ||
        block.innerBlocks[0].name !==
          { equation: 'mbb/math', figure: 'core/image', table: 'core/table', listing: 'mbb/code' }[
            a.kind
          ])
    ) {
      add('object-body', a.id);
      invalidTargets.add(a.id);
    }
    if (kind === 'statement' && !(block.innerBlocks || []).length) {
      add('statement-body', a.id);
      invalidTargets.add(a.id);
    }
    for (const field of parsedFields(block)) {
      for (const node of field.root.querySelectorAll('[id]')) count(ids, node.id);
      for (const node of field.root.querySelectorAll('span.mbb-xref,span.mbb-cite')) {
        if (node.closest('code,pre')) continue;
        try {
          references.push(
            technicalReference(node.outerHTML, (code, message) => {
              throw Error(message);
            }),
          );
        } catch {
          add('reference-marker');
        }
      }
    }
  }
  for (const [id, count] of ids) if (count > 1) add('duplicate-id', id);
  for (const [key, count] of keyCounts) if (count > 1) add('duplicate-key', key);
  for (const ref of references)
    for (const key of ref.keys)
      if (!(ref.kind === 'xref' ? targetCounts : keyCounts).has(key))
        add(ref.kind === 'xref' ? 'missing-target' : 'missing-key', key);
  return {
    issues,
    validTargets: [...targetCounts.keys()].filter(
      (id) => technicalId.test(id) && ids.get(id) === 1 && !invalidTargets.has(id),
    ),
    validKeys: [...keyCounts.keys()].filter(
      (key) => technicalId.test(key) && keyCounts.get(key) === 1 && !invalidKeys.has(key),
    ),
  };
}
/** Select one author marker, even when adjacent equal formats share a run. */
export function technicalReferenceSelection(value, kind, identity) {
  referenceHTML(kind, identity.split(','));
  const candidates = [
    ...value.text.matchAll(/\[[A-Za-z][A-Za-z0-9_-]{0,63}(?:,[A-Za-z][A-Za-z0-9_-]{0,63}){0,7}\]/g),
  ].filter((match) => {
    const start = match.index,
      end = start + match[0].length;
    if (match[0] !== '[' + identity + ']' || value.start < start || value.end > end) return false;
    for (let i = start; i < end; i++)
      if (
        !value.formats[i]?.some(
          (format) => format.type === 'mbb/' + kind && format.attributes?.identity === identity,
        )
      )
        return false;
    return true;
  });
  const match =
    candidates.find((match) => value.start < match.index + match[0].length) || candidates[0];
  if (!match) throw Error('Select one reference marker before changing its target');
  return { start: match.index, end: match.index + match[0].length };
}
