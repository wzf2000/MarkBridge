import { technicalAttributes, technicalId } from './technical.js';
const defaults = (code, message) => {
  throw Object.assign(new Error(message), { code });
};
const failMessage = 'BibTeX is outside the supported bounded data subset';
const whitespace =
  /[ \t\r\n\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/gu;
const accents = {
  "'": '\u0301',
  '`': '\u0300',
  '"': '\u0308',
  '^': '\u0302',
  '~': '\u0303',
  '=': '\u0304',
  '.': '\u0307',
  c: '\u0327',
  v: '\u030c',
  u: '\u0306',
  H: '\u030b',
};
const commands = {
  TeX: 'TeX',
  LaTeX: 'LaTeX',
  ae: 'æ',
  AE: 'Æ',
  oe: 'œ',
  OE: 'Œ',
  aa: 'å',
  AA: 'Å',
  o: 'ø',
  O: 'Ø',
  ss: 'ß',
};
function plain(raw, fail) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '{' || c === '}') continue;
    if (c === '$') fail('BIBTEX_TEX', 'Unsupported TeX command or math in BibTeX');
    if (c !== '\\') {
      out += c === '~' ? ' ' : c;
      continue;
    }
    const next = raw[++i];
    if ('&%$#_{}'.includes(next || '\0')) {
      out += next;
      continue;
    }
    if (Object.hasOwn(accents, next)) {
      if (/[A-Za-z]/.test(next) && /[A-Za-z]/.test(raw[i + 1] || '\0'))
        fail('BIBTEX_TEX', 'Unsupported TeX command or math in BibTeX');
      while (raw[i + 1] === ' ') i++;
      const grouped = raw[i + 1] === '{';
      if (grouped) i++;
      const letter = String.fromCodePoint(raw.codePointAt(i + 1) || 0);
      if (!/^\p{L}$/u.test(letter)) fail('BIBTEX_TEX', 'Unsupported TeX command or math in BibTeX');
      i += letter.length;
      if (grouped && raw[++i] !== '}')
        fail('BIBTEX_TEX', 'Unsupported TeX command or math in BibTeX');
      out += (letter + accents[next]).normalize('NFC');
      continue;
    }
    let command = next || '';
    while (/[A-Za-z]/.test(raw[i + 1] || '\0')) command += raw[++i];
    if (!Object.hasOwn(commands, command))
      fail('BIBTEX_TEX', 'Unsupported TeX command or math in BibTeX');
    out += commands[command];
    if (raw.slice(i + 1, i + 3) === '{}') i += 2;
  }
  return out.replace(whitespace, ' ').trim();
}
function authors(raw, fail) {
  let depth = 0,
    start = 0;
  const values = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\') {
      i++;
      continue;
    }
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') depth--;
    if (
      !depth &&
      /[ \t\r\n\f\v]/.test(raw[i - 1] || '') &&
      /^and(?=[ \t\r\n\f\v])/i.test(raw.slice(i))
    ) {
      values.push(raw.slice(start, i));
      i += 2;
      start = i + 1;
    }
  }
  values.push(raw.slice(start));
  if (values.length > 8) fail('BIBTEX_AUTHORS', 'BibTeX entries support at most eight authors');
  return values.map((x) => plain(x, fail));
}
export function parseBibTeX(input, fail = defaults) {
  if (
    typeof input !== 'string' ||
    new TextEncoder().encode(input).length > 65536 ||
    /[\x00-\x08\x0e-\x1f\x7f\uD800-\uDFFF]/u.test(input)
  )
    fail('BIBTEX_LIMIT', 'BibTeX input must be UTF-8 text within 64 KiB');
  const source = input.replace(/^\ufeff/, '');
  let at = 0;
  const entries = [];
  const bad = () => fail('BIBTEX_SYNTAX', failMessage);
  const skip = () => {
    while (at < source.length) {
      if (/[ \t\r\n\f\v]/.test(source[at])) at++;
      else if (source[at] === '%') {
        while (at < source.length && source[at] !== '\n') at++;
      } else break;
    }
  };
  const take = (c) => {
    skip();
    if (source[at++] !== c) bad();
  };
  const word = () => {
    skip();
    const m = /^[A-Za-z][A-Za-z0-9_-]*/.exec(source.slice(at));
    if (!m) bad();
    at += m[0].length;
    return m[0];
  };
  function value(field) {
    skip();
    const open = source[at++];
    if (open !== '{' && open !== '"') {
      at--;
      const m = /^\d+/.exec(source.slice(at));
      if (field !== 'year' || !m) bad();
      at += m[0].length;
      return m[0];
    }
    let raw = '',
      depth = 0;
    while (at < source.length) {
      const c = source[at++];
      if (c === '\\') {
        if (at === source.length) bad();
        raw += c + source[at++];
        continue;
      }
      if (c === '{') {
        if (++depth > 16) bad();
        raw += c;
        continue;
      }
      if (c === '}') {
        if (!depth) {
          if (open === '}') bad();
          if (open === '{') return raw;
          bad();
        }
        depth--;
        raw += c;
        continue;
      }
      if (c === '"' && open === '"' && !depth) return raw;
      raw += c;
    }
    bad();
  }
  while (true) {
    skip();
    if (at === source.length) break;
    take('@');
    const type = word().toLowerCase();
    if (!['article', 'book', 'inproceedings', 'misc'].includes(type)) bad();
    skip();
    const open = source[at++];
    if (!['{', '('].includes(open)) bad();
    const close = open === '{' ? '}' : ')';
    const key = word();
    if (!technicalId.test(key)) bad();
    take(',');
    const fields = {};
    while (true) {
      skip();
      if (source[at] === close) {
        at++;
        break;
      }
      const name = word().toLowerCase();
      if (
        ![
          'author',
          'title',
          'year',
          'journal',
          'booktitle',
          'publisher',
          'doi',
          'url',
          'volume',
          'number',
          'pages',
        ].includes(name) ||
        Object.hasOwn(fields, name)
      )
        bad();
      take('=');
      fields[name] = value(name);
      skip();
      if (source[at] === ',') {
        at++;
        continue;
      }
      if (source[at] === close) {
        at++;
        break;
      }
      bad();
    }
    if (!Object.hasOwn(fields, 'title')) bad();
    const f = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, k === 'author' ? v : plain(v, fail)]),
    );
    if (Object.entries(f).some(([k, v]) => k !== 'author' && !v)) bad();
    if (f.year && !/^\d{1,4}$/.test(f.year)) bad();
    let doi = f.doi || '';
    if (doi) {
      doi = doi.replace(/^https:\/\/doi\.org\//i, '');
      if (!/^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/.test(doi))
        fail('BIBTEX_DOI', 'BibTeX DOI values must be bounded DOI identifiers');
    }
    const parts = [];
    for (const [field, label] of [
      ['journal', 'Journal'],
      ['booktitle', 'Book title'],
      ['publisher', 'Publisher'],
      ['volume', 'Volume'],
      ['number', 'Number'],
      ['pages', 'Pages'],
    ])
      if (Object.hasOwn(f, field)) {
        if (!f[field]) bad();
        parts.push(label + ': ' + f[field]);
      }
    if (doi && f.url) parts.push('DOI: ' + doi);
    entries.push({
      key,
      authors: Object.hasOwn(f, 'author') ? authors(f.author, fail) : [],
      title: f.title,
      year: f.year || '',
      source: parts.join('; '),
      url: f.url || (doi ? 'https://doi.org/' + doi : ''),
    });
    if (entries.length > 64) fail('BIBTEX_LIMIT', 'BibTeX supports one to 64 entries');
  }
  technicalAttributes('bibliography', { entries }, fail);
  return entries;
}
export function bibtexCandidate(existing, incoming, mode, referencedKeys = [], fail = defaults) {
  if (
    !['merge', 'replace'].includes(mode) ||
    !Array.isArray(existing) ||
    !Array.isArray(incoming) ||
    !Array.isArray(referencedKeys) ||
    referencedKeys.length > 64 ||
    referencedKeys.some((key) => typeof key !== 'string' || !technicalId.test(key))
  )
    fail('BIBTEX_MODE', 'Choose explicit BibTeX merge or replacement');
  const entries = mode === 'merge' ? [...existing, ...incoming] : [...incoming];
  technicalAttributes('bibliography', { entries }, fail);
  const keys = new Set(entries.map((e) => e.key));
  if (referencedKeys.some((key) => !keys.has(key)))
    fail('BIBTEX_REFERENCES', 'BibTeX replacement must preserve every currently cited key');
  return entries.map((e) => ({ ...e, authors: [...e.authors] }));
}
