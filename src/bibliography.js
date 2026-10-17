// Closed bibliography v2 data. Formatting is deliberately finite, not a CSL engine.
export const bibliographyTypes = [
  'article-journal',
  'book',
  'chapter',
  'paper-conference',
  'report',
  'thesis',
  'webpage',
  'dataset',
  'software',
  'document',
];
export const bibliographyFields = [
  'key',
  'type',
  'authors',
  'issued',
  'title',
  'containerTitle',
  'publisher',
  'volume',
  'issue',
  'page',
  'doi',
  'url',
  'identifiers',
  'source',
];
export const identifierFields = ['ISBN', 'ISSN', 'PMID', 'PMCID'];
const idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const whitespace = /[\p{White_Space}\uFEFF]/gu;
const bytes = (s) => new TextEncoder().encode(s).length;
const keys = (o, list) =>
  o &&
  typeof o === 'object' &&
  !Array.isArray(o) &&
  Object.keys(o).sort().join(',') === [...list].sort().join(',');
const text = (v, max, required = false) =>
  typeof v === 'string' &&
  [...v].length <= max &&
  !/[\r\n\x00\uD800-\uDFFF]/u.test(v) &&
  (!required || !!v.replace(whitespace, ''));
const failDefault = (code, message) => {
  throw Object.assign(Error(message), { code });
};
const bad = (fail, message) => fail('BIBLIOGRAPHY_V2', message);
export function bibliographyName(value, fail = failDefault) {
  if (keys(value, ['literal'])) {
    if (!text(value.literal, 120, true))
      bad(fail, 'A literal author name requires 1–120 plain characters');
    return value;
  }
  if (
    !keys(value, ['family', 'given', 'droppingParticle', 'nonDroppingParticle', 'suffix']) ||
    !text(value.family, 120, true) ||
    Object.values(value).some((v) => !text(v, 120)) ||
    [...bibliographyAuthor(value)].length > 120
  )
    bad(
      fail,
      'A structured author requires an explicit family name within the existing 120-character name budget',
    );
  return value;
}
export function bibliographyDate(value, fail = failDefault) {
  if (keys(value, ['literal'])) {
    if (!text(value.literal, 64))
      bad(fail, 'A literal issue date must be bounded single-line text');
    return value;
  }
  if (
    !keys(value, ['date-parts']) ||
    !Array.isArray(value['date-parts']) ||
    value['date-parts'].length < 1 ||
    value['date-parts'].length > 2
  )
    bad(fail, 'A structured issue date requires one or two year/month/day parts');
  for (const part of value['date-parts']) {
    if (
      !Array.isArray(part) ||
      part.length < 1 ||
      part.length > 3 ||
      part.some((v) => !Number.isSafeInteger(v)) ||
      part[0] < 1 ||
      part[0] > 9999 ||
      (part.length > 1 && (part[1] < 1 || part[1] > 12))
    )
      bad(fail, 'The structured issue date is invalid');
    const leap = part[0] % 4 === 0 && (part[0] % 100 !== 0 || part[0] % 400 === 0),
      max = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][(part[1] || 1) - 1];
    if (part.length > 2 && (part[2] < 1 || part[2] > max))
      bad(fail, 'The structured issue date is invalid');
  }
  return value;
}
export function bibliographyURL(value) {
  if (!text(value, 2048)) return false;
  if (!value) return true;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    /^https?:\/\/[^/?#]+/i.test(value) &&
    ['http:', 'https:'].includes(url.protocol) &&
    !!url.hostname &&
    !url.username &&
    !url.password &&
    !/[\p{White_Space}\uFEFF\x00-\x20\x7f\\]/u.test(value)
  );
}
export function bibliographyEntry(value, fail = failDefault) {
  if (
    !keys(value, bibliographyFields) ||
    !idPattern.test(value.key || '') ||
    !bibliographyTypes.includes(value.type) ||
    !Array.isArray(value.authors) ||
    value.authors.length > 8 ||
    !text(value.title, 512, true)
  )
    bad(
      fail,
      'Bibliography v2 entries require closed fields, a stable key, a supported type and a title',
    );
  value.authors.forEach((v) => bibliographyName(v, fail));
  bibliographyDate(value.issued, fail);
  for (const name of ['containerTitle', 'publisher', 'source'])
    if (!text(value[name], 512))
      bad(fail, 'Publication and source fields are limited to 512 plain characters');
  for (const name of ['volume', 'issue', 'page'])
    if (!text(value[name], 128))
      bad(fail, 'Volume, issue and pages are limited to 128 plain characters');
  if (
    !text(value.doi, 512) ||
    (value.doi && !/^10\.[0-9]{4,9}\/[A-Za-z0-9\-._;()/:]+$/.test(value.doi))
  )
    bad(fail, 'A DOI must be a bounded supported DOI identifier, without a URL prefix');
  if (!bibliographyURL(value.url))
    bad(fail, 'Bibliography URLs must use absolute HTTP or HTTPS without credentials');
  if (
    !keys(value.identifiers, identifierFields) ||
    Object.values(value.identifiers).some((v) => !text(v, 128))
  )
    bad(fail, 'Bibliography identifiers require bounded ISBN, ISSN, PMID and PMCID text fields');
  return value;
}
export function bibliographyV2(attrs, fail = failDefault) {
  if (
    !['author-year', 'numeric'].includes(attrs.style) ||
    !Array.isArray(attrs.entries) ||
    !attrs.entries.length ||
    attrs.entries.length > 64 ||
    bytes(JSON.stringify(attrs.entries)) > 65536
  )
    bad(fail, 'Bibliography v2 requires a fixed supported style and 1–64 entries within 64 KiB');
  const used = new Set();
  for (const entry of attrs.entries) {
    bibliographyEntry(entry, fail);
    if (used.has(entry.key)) bad(fail, 'Bibliography keys must be unique');
    used.add(entry.key);
  }
  return attrs;
}
export function emptyBibliographyEntry(key) {
  return {
    key,
    type: 'document',
    authors: [],
    issued: { literal: '' },
    title: '',
    containerTitle: '',
    publisher: '',
    volume: '',
    issue: '',
    page: '',
    doi: '',
    url: '',
    identifiers: Object.fromEntries(identifierFields.map((k) => [k, ''])),
    source: '',
  };
}
export function migrateBibliography(entries) {
  return entries.map((e) => ({
    ...emptyBibliographyEntry(e.key),
    authors: e.authors.map((literal) => ({ literal })),
    issued: { literal: e.year },
    title: e.title,
    source: e.source,
    url: e.url,
  }));
}
export function bibliographyAuthor(name) {
  return (
    name.literal ??
    [name.given, name.droppingParticle, name.nonDroppingParticle, name.family, name.suffix]
      .filter(Boolean)
      .join(' ')
  );
}
export function bibliographyYear(issued) {
  return issued.literal !== undefined
    ? issued.literal
    : issued['date-parts']
        .map((p) => String(p[0]))
        .filter((v, i, a) => i === 0 || v !== a[0])
        .join('–');
}
export function bibliographyProjection(entry) {
  const date =
    entry.issued.literal !== undefined
      ? entry.issued.literal
      : entry.issued['date-parts']
          .map((p) => p.map((v, i) => (i ? String(v).padStart(2, '0') : String(v))).join('-'))
          .join('–');
  return {
    key: entry.key,
    authors: entry.authors.map(bibliographyAuthor),
    title: entry.title,
    year: bibliographyYear(entry.issued),
    source: [
      entry.containerTitle,
      entry.publisher,
      entry.volume && 'vol. ' + entry.volume,
      entry.issue && 'no. ' + entry.issue,
      entry.page && 'pp. ' + entry.page,
      date && date !== bibliographyYear(entry.issued) ? date : '',
      ...identifierFields
        .filter((k) => entry.identifiers[k])
        .map((k) => k + ' ' + entry.identifiers[k]),
      entry.doi ? 'DOI ' + entry.doi : '',
      entry.source,
    ]
      .filter(Boolean)
      .join(' · '),
    url: entry.url || (entry.doi ? 'https://doi.org/' + entry.doi : ''),
  };
}
function cslJSON(input, fail) {
  if (typeof input !== 'string' || bytes(input) > 65536 || input.includes('\0'))
    fail('CSL_INPUT', 'CSL-JSON input must be UTF-8 JSON within 64 KiB');
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);
  const tokens = input.match(/"(?:\\.|[^"\\])*"|[^\s]/g) || [],
    stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '{' || t === '[') {
      stack.push(t === '{' ? new Set() : null);
      if (stack.length > 16) fail('CSL_DEPTH', 'CSL-JSON nesting exceeds sixteen levels');
    } else if (t === '}' || t === ']') stack.pop();
    else if (t.startsWith('"') && tokens[i + 1] === ':' && stack.at(-1)) {
      let key;
      try {
        key = JSON.parse(t);
      } catch {
        fail('CSL_JSON', 'CSL-JSON is invalid');
      }
      if (stack.at(-1).has(key)) fail('CSL_JSON', 'CSL-JSON contains a duplicate property');
      stack.at(-1).add(key);
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    fail('CSL_JSON', 'CSL-JSON is invalid');
  }
  let count = 0;
  function walk(v) {
    if (++count > 16384) fail('CSL_INPUT', 'CSL-JSON data exceeds its bounded node budget');
    if (
      (typeof v === 'string' && /[\uD800-\uDFFF]/u.test(v)) ||
      (typeof v === 'number' && !Number.isFinite(v))
    )
      fail('CSL_JSON', 'CSL-JSON contains invalid Unicode or a nonfinite number');
    if (v && typeof v === 'object') {
      for (const key of Object.keys(v))
        if ([...key].length > 128 || /[\x00\r\n\uD800-\uDFFF]/u.test(key))
          fail('CSL_JSON', 'CSL-JSON property names are invalid or too long');
      Object.values(v).forEach(walk);
    }
  }
  walk(parsed);
  return parsed;
}
const cslFields = [
  'id',
  'type',
  'author',
  'issued',
  'title',
  'container-title',
  'publisher',
  'volume',
  'issue',
  'page',
  'DOI',
  'URL',
  'ISBN',
  'ISSN',
  'PMID',
  'PMCID',
  'source',
];
export function parseCSL(input, keyMap = {}, fail = failDefault) {
  const rows = cslJSON(input, fail);
  if (!Array.isArray(rows) || !rows.length || rows.length > 64)
    fail('CSL_ITEMS', 'CSL-JSON requires an array of 1–64 records');
  if (
    !keyMap ||
    Array.isArray(keyMap) ||
    typeof keyMap !== 'object' ||
    Object.keys(keyMap).some(
      (k) =>
        !/^(?:0|[1-9]\d*)$/.test(k) ||
        Number(k) >= rows.length ||
        typeof keyMap[k] !== 'string' ||
        !idPattern.test(keyMap[k]),
    )
  )
    fail('CSL_KEYS', 'CSL-JSON key mappings are invalid');
  const losses = [],
    keyMappings = [],
    ids = new Set();
  const loss = (index, field) => {
    if (losses.length >= 256)
      fail(
        'CSL_LOSS',
        'CSL-JSON has more than 256 unsupported fields; simplify the input before importing',
      );
    losses.push({ index, field });
  };
  const entries = rows.map((row, index) => {
    if (
      !row ||
      Array.isArray(row) ||
      typeof row !== 'object' ||
      !bibliographyTypes.includes(row.type)
    )
      fail('CSL_TYPE', 'A CSL-JSON record has an unsupported or missing type');
    if (!(
      (typeof row.id === 'string' && row.id.length && bytes(row.id) <= 512) ||
      (typeof row.id === 'number' && Number.isSafeInteger(row.id))
    ))
      fail('CSL_ID', 'A CSL-JSON record requires a bounded string or safe integer id');
    const originalId = String(row.id);
    if (ids.has(originalId)) fail('CSL_ID', 'CSL-JSON record ids are duplicated');
    ids.add(originalId);
    const key =
      (Object.hasOwn(keyMap, index) ? keyMap[index] : undefined) ??
      (idPattern.test(originalId) ? originalId : 'reference-' + (index + 1));
    if (!idPattern.test(key || '')) fail('CSL_KEYS', 'A proposed CSL-JSON key is invalid');
    if (key !== originalId) keyMappings.push({ index, from: originalId, to: key });
    for (const field of Object.keys(row)) if (!cslFields.includes(field)) loss(index, field);
    const value = { ...emptyBibliographyEntry(key), type: row.type, title: row.title };
    if (row.author !== undefined) {
      if (!Array.isArray(row.author) || row.author.length > 8)
        fail('CSL_NAMES', 'CSL-JSON supports at most eight authors');
      value.authors = row.author.map((name, n) => {
        if (!name || Array.isArray(name) || typeof name !== 'object')
          fail('CSL_NAMES', 'A CSL-JSON author is invalid');
        const allowed =
          name.literal !== undefined
            ? ['literal']
            : ['family', 'given', 'dropping-particle', 'non-dropping-particle', 'suffix'];
        for (const f of Object.keys(name))
          if (!allowed.includes(f)) loss(index, 'author[' + n + '].' + f);
        return name.literal !== undefined
          ? { literal: name.literal }
          : {
              family: name.family,
              given: name.given === undefined ? '' : name.given,
              droppingParticle:
                name['dropping-particle'] === undefined ? '' : name['dropping-particle'],
              nonDroppingParticle:
                name['non-dropping-particle'] === undefined ? '' : name['non-dropping-particle'],
              suffix: name.suffix === undefined ? '' : name.suffix,
            };
      });
    }
    if (row.issued !== undefined) {
      if (!row.issued || Array.isArray(row.issued) || typeof row.issued !== 'object')
        fail('CSL_DATE', 'A CSL-JSON issue date is invalid');
      for (const f of Object.keys(row.issued))
        if (!['literal', 'date-parts'].includes(f)) loss(index, 'issued.' + f);
      if (row.issued.literal !== undefined && row.issued['date-parts'] !== undefined)
        fail('CSL_DATE', 'Choose a literal date or structured date parts, not both');
      if (row.issued['date-parts'] !== undefined && !Array.isArray(row.issued['date-parts']))
        fail('CSL_DATE', 'A CSL-JSON issue date is invalid');
      value.issued =
        row.issued.literal !== undefined
          ? { literal: row.issued.literal }
          : row.issued['date-parts'] === undefined
            ? { literal: '' }
            : {
                'date-parts': row.issued['date-parts'].map((part) => {
                  if (!Array.isArray(part)) fail('CSL_DATE', 'A CSL-JSON issue date is invalid');
                  return part.map((v) =>
                    typeof v === 'string' && /^\d{1,4}$/.test(v) ? Number(v) : v,
                  );
                }),
              };
    }
    for (const [from, to] of [
      ['container-title', 'containerTitle'],
      ['publisher', 'publisher'],
      ['DOI', 'doi'],
      ['URL', 'url'],
      ['source', 'source'],
    ])
      if (row[from] !== undefined) value[to] = row[from];
    for (const field of ['volume', 'issue', 'page'])
      if (row[field] !== undefined) {
        if (typeof row[field] !== 'string' && !Number.isSafeInteger(row[field]))
          fail('CSL_NUMBER', 'CSL-JSON numeric fields require text or safe integers');
        value[field] = String(row[field]);
      }
    for (const field of identifierFields)
      if (row[field] !== undefined) value.identifiers[field] = row[field];
    bibliographyEntry(value, fail);
    return value;
  });
  bibliographyV2({ style: 'author-year', entries }, fail);
  return { entries, losses, keyMappings };
}
export function cslCandidate(
  existing,
  report,
  mode,
  referencedKeys,
  ackLoss = false,
  ackKeys = false,
  fail = failDefault,
) {
  if (!['merge', 'replace'].includes(mode) || !report || !Array.isArray(report.entries))
    fail('CSL_MODE', 'Choose merge or replace for CSL-JSON import');
  if (report.losses.length && !ackLoss)
    fail(
      'CSL_LOSS',
      'Review and explicitly acknowledge unsupported CSL-JSON fields before adopting the candidate',
    );
  if (report.keyMappings.length && !ackKeys)
    fail(
      'CSL_KEYS',
      'Review and explicitly acknowledge the proposed citation keys before adopting the candidate',
    );
  const entries = mode === 'merge' ? [...existing, ...report.entries] : [...report.entries];
  bibliographyV2({ style: 'author-year', entries }, fail);
  const keys = new Set(entries.map((e) => e.key));
  if (referencedKeys.some((k) => !keys.has(k)))
    fail('CSL_REFERENCED', 'The replacement would remove currently cited keys');
  return entries;
}
export function exportCSL(entries, fail = failDefault) {
  bibliographyV2({ style: 'author-year', entries }, fail);
  return entries.map((e) => {
    const row = { id: e.key, type: e.type, title: e.title };
    if (e.authors.length)
      row.author = e.authors.map((n) =>
        n.literal !== undefined
          ? { literal: n.literal }
          : Object.fromEntries(
              [
                ['family', n.family],
                ['given', n.given],
                ['dropping-particle', n.droppingParticle],
                ['non-dropping-particle', n.nonDroppingParticle],
                ['suffix', n.suffix],
              ].filter(([, v]) => v !== ''),
            ),
      );
    if (e.issued.literal === undefined || e.issued.literal !== '') row.issued = e.issued;
    for (const [to, from] of [
      ['container-title', 'containerTitle'],
      ['publisher', 'publisher'],
      ['volume', 'volume'],
      ['issue', 'issue'],
      ['page', 'page'],
      ['DOI', 'doi'],
      ['URL', 'url'],
      ['source', 'source'],
    ])
      if (e[from] !== '') row[to] = e[from];
    for (const name of identifierFields) if (e.identifiers[name]) row[name] = e.identifiers[name];
    return row;
  });
}
