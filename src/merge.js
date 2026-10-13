// Pure bounded candidate merge. It does not authorize or save any content.
import MarkdownIt from 'markdown-it';
import footnotes from 'markdown-it-footnote';
const MAX_BYTES = 262144,
  MAX_LINES = 32768,
  MAX_CELLS = 12000,
  MAX_WORK = 2000000,
  MAX_MS = 250;
export class MergeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const byteCount = (value) => new TextEncoder().encode(value).length;
function validate(value) {
  if (typeof value !== 'string' || /[\uD800-\uDFFF\0]/u.test(value))
    throw new MergeError('MERGE_INPUT', '候选必须为有效 UTF-8 文本');
  if (byteCount(value) > MAX_BYTES)
    throw new MergeError('MERGE_BUDGET', '每份候选最多 256 KiB，请下载后手动比较');
  const lines = value.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [];
  if (lines.length > MAX_LINES) throw new MergeError('MERGE_BUDGET', '每份候选最多 32,768 行');
  return lines;
}
function units(lines, charge) {
  const parser = new MarkdownIt({ html: true, maxNesting: 32 }).use(footnotes);
  const tokens = [];
  charge();
  parser.block.parse(lines.join('').replace(/\r\n|\r/g, '\n'), parser, {}, tokens);
  charge(tokens.length);
  const fences = new Map(),
    html = new Map();
  for (const token of tokens) {
    if (!token.map || token.map[0] < 0 || token.map[1] > lines.length) continue;
    if (token.type === 'fence') fences.set(token.map[0], token.map[1]);
    if (token.type === 'html_block') html.set(token.map[0], token.map[1]);
  }
  const out = [];
  for (let n = 0; n < lines.length; n++) {
    charge();
    const start = n,
      text = lines[n].replace(/[\r\n]+$/, '');
    if (n === 0 && text === '---' && /^markbridge: 1(?:\r\n|\r|\n)$/.test(lines[n + 1] || '')) {
      while (++n < lines.length && lines[n].replace(/[\r\n]+$/, '') !== '---') charge();
    } else if (html.has(n)) n = html.get(n) - 1;
    else if (/^:::mbb:v1\b/.test(text)) {
      let depth = 1;
      while (++n < lines.length) {
        charge();
        const content = lines[n].replace(/[\r\n]+$/, '');
        if (fences.has(n)) n = fences.get(n) - 1;
        else if (html.has(n)) n = html.get(n) - 1;
        else if (/^:::mbb:v1\b/.test(content)) depth++;
        else if (/^:::mbb:end[ \t]*$/.test(content) && --depth === 0) break;
      }
    } else if (fences.has(n)) n = fences.get(n) - 1;
    n = Math.min(n, lines.length - 1);
    out.push({ text: lines.slice(start, n + 1).join(''), line: start + 1 });
  }
  return out;
}
export function planMerge(base, mine, latest) {
  const begin = Date.now();
  let work = 0;
  const charge = (amount = 1) => {
    work += amount;
    if (work > MAX_WORK || Date.now() - begin > MAX_MS)
      throw new MergeError('MERGE_BUDGET', '合并计算超出预算，请保留候选并手动比较');
  };
  const linesA = validate(base),
    linesB = validate(mine),
    linesC = validate(latest);
  if (mine === base) return { schema: 1, parts: [{ text: latest }], conflicts: [] };
  if (latest === base) return { schema: 1, parts: [{ text: mine }], conflicts: [] };
  if (mine === latest) return { schema: 1, parts: [{ text: mine }], conflicts: [] };
  const a = units(linesA, charge),
    b = units(linesB, charge),
    c = units(linesC, charge);
  const changes = (other, side) => {
    const counts = (array) => {
      const map = new Map();
      array.forEach(({ text }, index) => {
        charge();
        const prev = map.get(text);
        map.set(text, { count: (prev?.count || 0) + 1, index });
      });
      return map;
    };
    const ca = counts(a),
      cb = counts(other),
      pairs = [];
    for (const [text, entry] of ca)
      if (entry.count === 1 && cb.get(text)?.count === 1)
        pairs.push([entry.index, cb.get(text).index]);
    pairs.sort((x, y) => x[0] - y[0]);
    const tails = [],
      previous = new Int32Array(pairs.length);
    pairs.forEach(([_, index], n) => {
      let lo = 0,
        hi = tails.length;
      while (lo < hi) {
        charge();
        const middle = (lo + hi) >>> 1;
        if (pairs[tails[middle]][1] < index) lo = middle + 1;
        else hi = middle;
      }
      previous[n] = lo ? tails[lo - 1] : -1;
      tails[lo] = n;
    });
    const anchors = [];
    for (let n = tails.at(-1) ?? -1; n >= 0; n = previous[n]) anchors.push(pairs[n]);
    anchors.reverse();
    const edits = [];
    let ambiguous = false;
    const gap = (as, ae, bs, be) => {
      while (as < ae && bs < be && a[as].text === other[bs].text) {
        charge();
        as++;
        bs++;
      }
      while (as < ae && bs < be && a[ae - 1].text === other[be - 1].text) {
        charge();
        ae--;
        be--;
      }
      if (as === ae && bs === be) return;
      for (let n = as; n < ae; n++)
        if (a[n].text.trim() && ca.get(a[n].text).count > 1) ambiguous = true;
      for (let n = bs; n < be; n++)
        if (other[n].text.trim() && cb.get(other[n].text).count > 1) ambiguous = true;
      const na = ae - as,
        nb = be - bs;
      if (!na || !nb) {
        edits.push({
          start: as,
          end: ae,
          text: other
            .slice(bs, be)
            .map((v) => v.text)
            .join(''),
          side,
        });
        return;
      }
      if ((na + 1) * (nb + 1) > MAX_CELLS)
        throw new MergeError('MERGE_BUDGET', '局部差异超过 12,000 单元，请手动比较');
      const width = nb + 1,
        table = new Uint16Array((na + 1) * width);
      for (let i = na - 1; i >= 0; i--)
        for (let j = nb - 1; j >= 0; j--) {
          charge();
          table[i * width + j] =
            a[as + i].text === other[bs + j].text
              ? 1 + table[(i + 1) * width + j + 1]
              : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        }
      let i = 0,
        j = 0,
        pending = null;
      const flush = () => {
        if (pending) edits.push(pending);
        pending = null;
      };
      while (i < na || j < nb) {
        charge();
        if (i < na && j < nb && a[as + i].text === other[bs + j].text) {
          flush();
          i++;
          j++;
        } else {
          pending ||= { start: as + i, end: as + i, text: '', side };
          if (i < na && (j === nb || table[(i + 1) * width + j] >= table[i * width + j + 1]))
            pending.end = as + ++i;
          else pending.text += other[bs + j++].text;
        }
      }
      flush();
    };
    let ai = 0,
      bi = 0;
    for (const [an, bn] of anchors) {
      gap(ai, an, bi, bn);
      ai = an + 1;
      bi = bn + 1;
    }
    gap(ai, a.length, bi, other.length);
    return ambiguous && edits.length
      ? [
          {
            start: 0,
            end: a.length,
            text: other.map((v) => v.text).join(''),
            side,
            ambiguous: true,
          },
        ]
      : edits;
  };
  const edits = [...changes(b, 'mine'), ...changes(c, 'latest')].sort(
    (x, y) => x.start - y.start || x.end - y.end,
  );
  const groups = [];
  for (const edit of edits) {
    charge();
    const last = groups.at(-1);
    if (
      last &&
      ((edit.start < last.end && edit.end > last.start) ||
        ((edit.start === edit.end || last.start === last.end) && edit.start === last.start))
    ) {
      last.edits.push(edit);
      last.end = Math.max(last.end, edit.end);
    } else groups.push({ start: edit.start, end: edit.end, edits: [edit] });
  }
  const parts = [],
    conflicts = [];
  let cursor = 0;
  const slice = (start, end) =>
    a
      .slice(start, end)
      .map((v) => v.text)
      .join('');
  const apply = (group, side) => {
    let cursor = group.start,
      value = '';
    for (const edit of group.edits.filter((v) => v.side === side)) {
      value += slice(cursor, edit.start) + edit.text;
      cursor = edit.end;
    }
    return value + slice(cursor, group.end);
  };
  for (const group of groups) {
    parts.push({ text: slice(cursor, group.start) });
    const mineText = apply(group, 'mine'),
      latestText = apply(group, 'latest');
    const mineChanged = group.edits.some((v) => v.side === 'mine'),
      latestChanged = group.edits.some((v) => v.side === 'latest');
    if (
      (mineChanged && latestChanged && mineText !== latestText) ||
      group.edits.some((v) => v.ambiguous)
    ) {
      if (conflicts.length >= 128)
        throw new MergeError('MERGE_BUDGET', '冲突超过 128 处，请下载候选后手动处理');
      const hunk = {
        id: 'h' + conflicts.length,
        base: slice(group.start, group.end),
        mine: mineText,
        latest: latestText,
        line: a[group.start]?.line || validate(base).length + 1,
        ambiguous: group.edits.some((v) => v.ambiguous),
      };
      conflicts.push(hunk);
      parts.push({ conflict: hunk.id });
    } else parts.push({ text: mineChanged ? mineText : latestText });
    cursor = group.end;
  }
  parts.push({ text: slice(cursor, a.length) });
  charge();
  return { schema: 1, parts, conflicts };
}
export function resolveMerge(plan, choices = {}) {
  if (Object.keys(choices).some((id) => !plan.conflicts.some((v) => v.id === id)))
    throw new MergeError('MERGE_CHOICE', '未知冲突选择');
  const conflicts = new Map(plan.conflicts.map((h) => [h.id, h]));
  const source = plan.parts
    .map((part) => {
      if (!part.conflict) return part.text;
      const choice = choices[part.conflict];
      if (!['mine', 'latest', 'base'].includes(choice))
        throw new MergeError('MERGE_CHOICE', '请逐项选择全部冲突');
      return conflicts.get(part.conflict)[choice];
    })
    .join('');
  validate(source);
  return source;
}
export function mergeMetadata(base, mine, latest, choices = {}) {
  const values = {},
    conflicts = [];
  for (const key of ['title', 'post_status', 'featured_media']) {
    if (mine[key] === base[key]) values[key] = latest[key];
    else if (latest[key] === base[key] || mine[key] === latest[key]) values[key] = mine[key];
    else if (['mine', 'latest', 'base'].includes(choices[key]))
      values[key] = { mine, latest, base }[choices[key]][key];
    else conflicts.push({ key, base: base[key], mine: mine[key], latest: latest[key] });
  }
  return { values, conflicts };
}
