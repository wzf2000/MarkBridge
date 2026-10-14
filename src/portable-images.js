// Edit only image syntax. The caller must verify the complete resulting block snapshot.
export function portableImageSource(source, mappings, fail) {
  const map = new Map(mappings.map(({ from, to }) => [from, to]));
  const chars = source.split('');
  const mask = (start, end) => {
    for (let n = start; n < end; n++) if (!/[\r\n]/.test(chars[n])) chars[n] = ' ';
  };
  let offset = 0,
    fence = null,
    button = false,
    paragraph = false;
  for (const raw of source.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || []) {
    const line = raw.replace(/(?:\r\n|\r|\n)$/, '');
    if (button) {
      mask(offset, offset + raw.length);
      if (line.startsWith('<p>')) paragraph = true;
      if (paragraph && line.endsWith('</p>')) paragraph = false;
      else if (!paragraph && line === ':::mbb:end') button = false;
      offset += raw.length;
      continue;
    }
    if (/^:::mbb:v1 button /.test(line)) button = true;
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      mask(offset, offset + raw.length);
      if (new RegExp('^ {0,3}' + fence.char + '{' + fence.length + ',}[ \\t\\r]*$').test(line))
        fence = null;
    } else if (opening && (opening[1][0] !== '`' || !opening[2].includes('`'))) {
      fence = { char: opening[1][0], length: opening[1].length };
      mask(offset, offset + raw.length);
    } else if (/^(?: {4}|\t|:::mbb:)/.test(line)) mask(offset, offset + raw.length);
    offset += raw.length;
  }
  const header = source.match(/^---\r?\nmarkbridge: 1\r?\n[\s\S]*?^---(?:\r?\n|$)/m);
  if (header?.index === 0) mask(0, header[0].length);
  // Code spans and raw code elements are never image targets.
  let visible = chars.join('');
  for (const item of visible.matchAll(/(`+)([\s\S]*?)\1(?!`)/g))
    mask(item.index, item.index + item[0].length);
  visible = chars.join('');
  for (const item of visible.matchAll(/<!--[\s\S]*?-->|<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi))
    mask(item.index, item.index + item[0].length);
  visible = chars.join('');
  // Equal-length line view: preserve every original target offset, including CRLF/lone CR.
  visible = visible.replace(/\r\n/g, ' \n').replace(/\r/g, '\n');
  const decode = (value) => {
    const box = document.createElement('textarea');
    box.innerHTML = value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
    return box.value;
  };
  const label = (value) => value.replace(/\s+/g, ' ').trim().toUpperCase();
  const definitions = new Map();
  const destination = String.raw`(?:<((?:\\.|[^\\<>\r\n])*)>|((?:\\.|[^\\\s()])+))`;
  for (const item of visible.matchAll(
    new RegExp(
      '^ {0,3}\\[([^\\]\\r\\n]+)\\]:[ \\t]*' +
        destination +
        '([ \\t]+(?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\'|\\([^\\r\\n]*\\)))?[ \\t]*$',
      'gm',
    ),
  ))
    if (!definitions.has(label(item[1])))
      definitions.set(label(item[1]), { url: decode(item[2] ?? item[3]), title: item[4] || '' });
  const edits = [];
  const pattern = new RegExp(
    String.raw`!\[((?:\\.|[^\\\]\r\n])*)\](?:\([ \t]*` +
      destination +
      '([ \\t]+(?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\'|\\([^\\r\\n]*\\)))?[ \\t]*\\)|\\[([^\\]\\r\\n]*)\\])?',
    'gd',
  );
  for (const item of visible.matchAll(pattern)) {
    if (item.index && source[item.index - 1] === '\\') continue;
    const ref =
      item[2] === undefined && item[3] === undefined
        ? definitions.get(label(item[5] || item[1]))
        : null;
    const url = ref?.url ?? decode(item[2] ?? item[3] ?? '');
    if (!map.has(url)) continue;
    if (ref) {
      const alt = source.slice(item.index + 2, item.index + 2 + item[1].length);
      edits.push({
        start: item.index,
        end: item.index + item[0].length,
        value: '![' + alt + '](' + map.get(url) + ref.title + ')',
      });
    } else {
      const range = item.indices[item[2] === undefined ? 3 : 2];
      edits.push({ start: range[0], end: range[1], value: map.get(url) });
    }
  }
  for (const item of visible.matchAll(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const original = source.slice(item.index, item.index + item[0].length);
    const value = original.replace(
      /(\s+src\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (all, prefix, a, b, c) =>
        map.has(decode(a ?? b ?? c))
          ? all.slice(0, prefix.length + (a !== undefined || b !== undefined ? 1 : 0)) +
            map.get(decode(a ?? b ?? c)) +
            (a !== undefined ? '"' : b !== undefined ? "'" : '')
          : all,
    );
    if (value !== original)
      edits.push({ start: item.index, end: item.index + item[0].length, value });
  }
  edits.sort((a, b) => b.start - a.start);
  let end = source.length,
    result = source;
  for (const edit of edits) {
    if (edit.end > end)
      fail('EXPORT_PROJECTION', 'Overlapping image syntax cannot be projected reliably');
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
    end = edit.start;
  }
  return result;
}
