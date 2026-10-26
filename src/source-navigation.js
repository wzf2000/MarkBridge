/* Preview-only source provenance. Input must be the already validated source/block pair.
 * No rendered text search, source normalization, or block attribute mutation occurs here. */
const NATIVE = {
  'native-code': 'core/code',
  preformatted: 'core/preformatted',
  group: 'core/group',
  columns: 'core/columns',
  column: 'core/column',
  image: 'core/image',
  gallery: 'core/gallery',
  details: 'core/details',
  buttons: 'core/buttons',
  button: 'core/button',
};
const NAMES = {
  paragraph: ['core/paragraph'],
  heading: ['core/heading'],
  code: ['mbb/code'],
  math: ['mbb/math'],
  quote: ['core/quote'],
  list: ['core/list', 'mbb/list'],
  separator: ['core/separator'],
  frontmatter: ['mbb/frontmatter'],
};
const blank = (line) => /^[ \t]*$/.test(line);
const fence = (line) => /^ {0,3}(`{3,}|~{3,})[^\r\n]*$/.exec(line);
const heading = (line) => /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line);
const list = (line) => /^ {0,3}(?:[-+*][ \t]+|\d{1,9}[.)][ \t]+)/.test(line);
const quote = (line) => /^ {0,3}>/.test(line);
const definition = (line) => /^ {0,3}\[\^([^\]\r\n]+)\]:/.exec(line);
const directive = (line) => /^:::mbb:v[12] ([a-z-]+) (\{.*\})$/.exec(line);
const separator = (line) =>
  /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
const setext = (line) => /^ {0,3}(?:=+|-+)[ \t]*$/.test(line);
const ownMath = (line) => /^[ \t]*\$\$[ \t]*$/.test(line);
const boundary = (line) =>
  blank(line) ||
  !!fence(line) ||
  heading(line) ||
  list(line) ||
  quote(line) ||
  !!definition(line) ||
  !!directive(line) ||
  line === ':::mbb:end' ||
  separator(line) ||
  ownMath(line) ||
  /^ {0,3}</.test(line);

// Display-boundary normalization may split one raw paragraph into several blocks.
// Preserve its whole raw envelope rather than inventing normalized-source offsets.
function paragraphKinds(text) {
  const marks = [];
  let ticks = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && !ticks) {
      i++;
      continue;
    }
    if (text[i] === '`') {
      let count = 1;
      while (text[i + count] === '`') count++;
      if (!ticks) ticks = count;
      else if (ticks === count) ticks = 0;
      i += count - 1;
      continue;
    }
    if (!ticks && text.slice(i, i + 2) === '$$') {
      marks.push(i);
      i++;
    }
  }
  if (!marks.length) return ['paragraph'];
  if (marks.length % 2) return ['unknown'];
  const kinds = [];
  let cursor = 0;
  for (let i = 0; i < marks.length; i += 2) {
    if (text.slice(cursor, marks[i]).trim()) kinds.push('paragraph');
    kinds.push('math');
    cursor = marks[i + 1] + 2;
  }
  if (text.slice(cursor).trim()) kinds.push('paragraph');
  return kinds;
}

/**
 * Raw-source UTF-16 [start,end) offsets; physical startLine/endLine are inclusive.
 * blockPath counts named semantic siblings (not whitespace free blocks).
 * IDs are preview-local r0..r2047; no digest or content is included.
 * Call only after validating the source/block pair with the normal converter.
 */
export function sourceNavigation(source, blocks) {
  const result = { schema: 1, offsetUnit: 'utf16', ranges: [], unmapped: [] };
  if (
    typeof source !== 'string' ||
    new TextEncoder().encode(source).length > 262144 ||
    /[\uD800-\uDFFF\0]/u.test(source) ||
    !Array.isArray(blocks)
  ) {
    result.unmapped.push({ blockPath: [], reason: 'invalid-input' });
    return result;
  }
  const lines = [];
  let offset = 0;
  for (const raw of source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || []) {
    if (!raw) continue;
    lines.push({ text: raw.replace(/[\r\n]+$/, ''), start: offset, end: offset + raw.length });
    offset += raw.length;
  }
  const definitions = new Map();
  let duplicateDefinition = false;
  let unsupportedSyntax = false;
  const unit = (kind, start, end, extra = {}) => ({
    kind,
    start: lines[start].start,
    end: lines[end - 1].end,
    startLine: start + 1,
    endLine: end,
    precision: ['quote', 'list', 'teaching'].includes(kind) ? 'coarse' : 'exact',
    ...extra,
  });
  function scan(from, until, depth = 0) {
    const units = [];
    if (depth > 32) return [{ kind: 'unknown' }];
    let i = from;
    while (i < until) {
      const line = lines[i].text;
      if (blank(line)) {
        i++;
        continue;
      }
      const start = i,
        f = fence(line),
        d = directive(line),
        note = definition(line);
      if (i === 0 && line === '---' && lines[i + 1]?.text === 'markbridge: 1') {
        i += 2;
        while (i < until && lines[i].text !== '---') i++;
        if (i === until) {
          units.push(unit('unknown', start, i));
          break;
        }
        units.push(unit('frontmatter', start, ++i));
        continue;
      }
      if (f) {
        i++;
        const close = new RegExp('^ {0,3}' + f[1][0] + '{' + f[1].length + ',}[ \\t]*$');
        while (i < until && !close.test(lines[i].text)) i++;
        units.push(unit(i < until ? 'code' : 'unknown', start, i < until ? ++i : i));
        continue;
      }
      if (d) {
        let attrs;
        try {
          attrs = JSON.parse(d[2]);
        } catch {
          attrs = {};
        }
        i++;
        let level = 1;
        while (i < until && level) {
          const nestedFence = fence(lines[i].text);
          if (nestedFence) {
            const close = new RegExp(
              '^ {0,3}' + nestedFence[1][0] + '{' + nestedFence[1].length + ',}[ \\t]*$',
            );
            i++;
            while (i < until && !close.test(lines[i].text)) i++;
            if (i < until) i++;
            continue;
          }
          if (directive(lines[i].text)) level++;
          if (lines[i].text === ':::mbb:end') level--;
          if (level) i++;
        }
        if (i === until) {
          units.push(unit('unknown', start, i));
          break;
        }
        const children = scan(start + 1, i, depth + 1);
        units.push(
          unit('teaching', start, ++i, {
            teachingKind: d[1],
            stableId: attrs.id,
            anchor: attrs.anchor,
            children,
          }),
        );
        continue;
      }
      if (note) {
        i++;
        while (
          i < until &&
          (/^(?: {4}|\t)/.test(lines[i].text) ||
            (blank(lines[i].text) && i + 1 < until && /^(?: {4}|\t)/.test(lines[i + 1].text)))
        )
          i++;
        // A lazy unindented definition continuation is not a proven line boundary.
        if (i < until && !boundary(lines[i].text)) unsupportedSyntax = true;
        if (definitions.has(note[1])) duplicateDefinition = true;
        definitions.set(note[1], unit('footnote', start, i));
        continue;
      }
      if (ownMath(line)) {
        i++;
        while (i < until && !ownMath(lines[i].text)) i++;
        units.push(unit(i < until ? 'math' : 'unknown', start, i < until ? ++i : i));
        continue;
      }
      if (heading(line)) {
        units.push(unit('heading', start, ++i));
        continue;
      }
      if (separator(line)) {
        units.push(unit('separator', start, ++i));
        continue;
      }
      if (quote(line) || list(line)) {
        const kind = quote(line) ? 'quote' : 'list';
        i++;
        while (i < until) {
          const next = lines[i].text;
          if (kind === 'quote') {
            if (!quote(next)) break;
          } else if (blank(next)) {
            if (
              i + 1 >= until ||
              (!list(lines[i + 1].text) && !/^[ \t]+\S/.test(lines[i + 1].text))
            )
              break;
          } else if (!list(next) && !/^[ \t]+/.test(next) && boundary(next)) break;
          i++;
        }
        units.push(unit(kind, start, i));
        continue;
      }
      if (/^ {0,3}</.test(line) || /^ {4}\S|^\t\S/.test(line) || line === ':::mbb:end') {
        i++;
        while (i < until && !blank(lines[i].text)) i++;
        units.push(unit('unknown', start, i));
        continue;
      }
      i++;
      if (i < until && setext(lines[i].text)) {
        units.push(unit('heading', start, ++i));
        continue;
      }
      while (i < until && !boundary(lines[i].text)) i++;
      const span = unit('paragraph', start, i);
      const kinds = paragraphKinds(source.slice(span.start, span.end));
      for (const kind of kinds)
        units.push({ ...span, kind, precision: kinds.length > 1 ? 'coarse' : span.precision });
    }
    return units;
  }
  const syntax = scan(0, lines.length);
  let normalizedCount = 0;
  const normalize = (items, depth = 0) => {
    if (depth > 32) throw Error('limit');
    return items
      .filter(
        (b) => b && (b.name || b.blockName || !/^[ \t\r\n]*$/.test(String(b.innerHTML || ''))),
      )
      .map((b) => {
        if (++normalizedCount > 10000 || !(b.name || b.blockName)) throw Error('shape');
        return {
          name: b.name || b.blockName || '',
          attrs: b.attributes || b.attrs || {},
          children: normalize(b.innerBlocks || b.children || [], depth + 1),
        };
      });
  };
  let count = 0;
  const recordUnmapped = (path, reason) => {
    if (result.unmapped.length >= 2048) throw Error('range-limit');
    result.unmapped.push({ blockPath: path, reason });
  };
  const unmapped = (node, path, reason) => {
    if (++count > 10000) throw Error('range-limit');
    recordUnmapped(path, reason);
    node.children.forEach((child, i) => unmapped(child, [...path, i], reason));
  };
  const add = (node, path, span, precision = span.precision) => {
    if (++count > 10000) throw Error('range-limit');
    if (result.ranges.length >= 2048) throw Error('range-limit');
    result.ranges.push({
      id: 'r' + result.ranges.length,
      blockPath: path,
      kind: span.kind,
      start: span.start,
      end: span.end,
      startLine: span.startLine,
      endLine: span.endLine,
      precision,
    });
  };
  const coarseChildren = (node, path, span) =>
    node.children.forEach((child, i) => {
      const childPath = [...path, i];
      add(child, childPath, span, 'coarse');
      coarseChildren(child, childPath, span);
    });
  function bind(items, units, parentPath = []) {
    const ordinary = [];
    items.forEach((node, i) => {
      const path = [...parentPath, i];
      if (node.name !== 'mbb/footnotes') {
        ordinary.push({ node, path });
        return;
      }
      recordUnmapped(path, 'definition-group');
      node.children.forEach((note, j) => {
        const notePath = [...path, j],
          span = definitions.get(note.attrs.label);
        if (note.name !== 'mbb/footnote' || !span || duplicateDefinition)
          unmapped(note, notePath, 'definition-identity');
        else {
          add(note, notePath, span);
          coarseChildren(note, notePath, span);
        }
      });
    });
    if (ordinary.length !== units.length) {
      ordinary.forEach(({ node, path }) => unmapped(node, path, 'structure-mismatch'));
      return;
    }
    let blocked = false;
    ordinary.forEach(({ node, path }, i) => {
      const span = units[i];
      const allowed =
        span.kind === 'teaching'
          ? [NATIVE[span.teachingKind] || 'mbb/' + span.teachingKind]
          : NAMES[span.kind] || [];
      const identity =
        span.kind !== 'teaching' ||
        (NATIVE[span.teachingKind]
          ? !span.anchor || span.anchor === node.attrs.anchor
          : typeof span.stableId === 'string' && span.stableId === node.attrs.id);
      if (blocked || !allowed.includes(node.name) || !identity) {
        blocked = true;
        unmapped(node, path, 'unsupported-structure');
        return;
      }
      if (
        span.kind === 'teaching' &&
        ['code-tabs', 'button', 'bibliography', 'image'].includes(span.teachingKind) &&
        node.children.length
      ) {
        blocked = true;
        unmapped(node, path, 'unsupported-structure');
        return;
      }
      add(node, path, span);
      if (span.kind === 'teaching') {
        if (['code-tabs', 'button', 'bibliography', 'image'].includes(span.teachingKind)) {
          /* body is stored as attributes */
        } else if (span.teachingKind === 'code-compare')
          bind(node.children, span.children.slice(2), path);
        else bind(node.children, span.children, path);
      } else coarseChildren(node, path, span);
    });
  }
  const uncertain = (units) =>
    units.some((u) => u.kind === 'unknown' || uncertain(u.children || []));
  try {
    const tree = normalize(blocks);
    if (unsupportedSyntax || uncertain(syntax))
      tree.forEach((node, i) => unmapped(node, [i], 'unsupported-syntax'));
    else bind(tree, syntax);
  } catch (error) {
    if (error.message !== 'range-limit') {
      result.ranges = [];
      result.unmapped = [];
    }
    result.unmapped = result.unmapped.slice(0, 2047);
    result.unmapped.push({ blockPath: [], reason: 'structure-limit' });
  }
  const comparePath = (a, b) => {
    for (let i = 0; i < Math.min(a.blockPath.length, b.blockPath.length); i++) {
      if (a.blockPath[i] !== b.blockPath[i]) return a.blockPath[i] - b.blockPath[i];
    }
    return a.blockPath.length - b.blockPath.length;
  };
  result.ranges.sort(comparePath).forEach((range, i) => {
    range.id = 'r' + i;
  });
  result.unmapped.sort(comparePath);
  return result;
}
