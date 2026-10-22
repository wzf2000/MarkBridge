import { activityRelations, validateActivity, activityParts } from './activities.js';
import { mediaKinds, mediaAttributes, assembleMedia, validateMedia } from './native-media.js';
import {
  technicalSchemas,
  technicalKind,
  technicalAttributes,
  validateTechnical,
} from './technical.js';
import { registerTechnical } from './technical-editor.js';
import { createParameterEditor } from './component-parameters.js';
import { translate as T, format as F } from './i18n.js';
import {
  nativeAdapterKind,
  nativeAdapterName,
  nativeAdapterKinds,
  nativeAttributes,
  nativeBlockAttributes,
  buttonText,
  buttonParagraph,
  staticAdapterKind,
  staticAdapterAttributes,
  adapterSourceAttributes,
} from './block-adapters.js';
import { componentParams } from './component-data.js';
import { codeTabsAttributes, codeTabsMarkdown, registerCodeTabs } from './code-tabs.js';
// Versioned teaching syntax has a closed schema. Bodies use the ordinary parser.
export const teachingSchemas = {
  identity: { namespace: 'string', document: 'string' },
  image: {},
  gallery: {},
  ...technicalSchemas,
  group: {},
  details: { summary: 'string', showContent: 'boolean' },
  buttons: {},
  button: { url: 'string' },
  adapter: { name: 'string', version: 'string', attrs: 'object' },
  'code-tabs': { id: 'string', defaultTab: 'string', tabs: 'object' },
  component: { id: 'string', component: 'string', componentVersion: 'string', params: 'object' },
  collapse: { id: 'string', title: 'string', open: 'boolean' },
  steps: {
    id: 'string',
    title: 'string',
    mode: 'string',
    previous: 'boolean',
    next: 'boolean',
    full: 'boolean',
  },
  step: { id: 'string', title: 'string' },
  'code-compare': {
    id: 'string',
    leftTitle: 'string',
    rightTitle: 'string',
    leftHighlights: 'string',
    rightHighlights: 'string',
  },
};
export const sourceFields = {
  codeLeft: 'string',
  languageLeft: 'string',
  codeRight: 'string',
  languageRight: 'string',
};
export const teachingKind = (name) =>
  nativeAdapterKind(name) ||
  (staticAdapterKind(name) ? 'adapter' : null) ||
  (name?.startsWith('mbb/') && Object.hasOwn(teachingSchemas, name.slice(4))
    ? name.slice(4)
    : null);
export function teachingAttributes(kind, attrs, fail, source = false, blockName = null) {
  if (mediaKinds.has(kind)) return mediaAttributes(kind, attrs, fail, source);
  if (nativeAdapterKinds.has(kind)) return nativeAttributes(kind, attrs, fail, source);
  if (kind === 'adapter') {
    if (source) {
      const a = adapterSourceAttributes(attrs, fail);
      return {
        name: a.descriptor.name,
        version: a.descriptor.version,
        attrs: Object.fromEntries(
          Object.keys(a.descriptor.attributes).map((key) => [key, a.attributes[key]]),
        ),
      };
    }
    const d = staticAdapterKind(blockName);
    if (!d) fail('ADAPTER_VERSION', 'The static adapter is missing or incompatible');
    return staticAdapterAttributes(d, attrs, fail);
  }
  const schema = {
    ...teachingSchemas[kind],
    ...(kind === 'component' &&
    (attrs?.version === 2 || (source && Object.hasOwn(attrs || {}, 'activity')))
      ? { activity: 'object' }
      : {}),
    ...(kind === 'bibliography' &&
    (attrs?.version === 2 || (source && Object.hasOwn(attrs || {}, 'style')))
      ? { style: 'string', ...(Object.hasOwn(attrs || {}, 'origins') ? { origins: 'object' } : {}) }
      : {}),
    ...(!source ? { version: 'number' } : {}),
    ...(kind === 'code-compare' && !source ? sourceFields : {}),
  };
  if (
    !attrs ||
    Array.isArray(attrs) ||
    typeof attrs !== 'object' ||
    Object.keys(attrs).length !== Object.keys(schema).length ||
    Object.keys(attrs).some((k) => !Object.hasOwn(schema, k) || typeof attrs[k] !== schema[k])
  )
    fail(
      'TEACHING_ATTRIBUTES',
      'Teaching container attributes are incomplete, unknown, or have invalid types',
    );
  if (
    !source &&
    attrs.version !== 1 &&
    !(['bibliography', 'component'].includes(kind) && attrs.version === 2)
  )
    fail('TEACHING_VERSION', 'The teaching block version must be 1');
  if (Object.values(attrs).some((v) => typeof v === 'string' && /[\uD800-\uDFFF]/u.test(v)))
    fail('TEACHING_ATTRIBUTES', 'Teaching attributes must be valid Unicode');
  const out = Object.fromEntries(Object.keys(schema).map((key) => [key, attrs[key]]));
  if (kind === 'identity') {
    if (!/^S_[a-f0-9]{32}$/.test(out.namespace) || !/^D_[a-f0-9]{32}$/.test(out.document))
      fail(
        'DOCUMENT_IDENTITY',
        'A logical identity requires a closed namespace and document tuple',
      );
    return out;
  }
  if (technicalKind('mbb/' + kind)) technicalAttributes(kind, out, fail);
  if (kind === 'code-tabs') out.tabs = codeTabsAttributes(out, source, fail);
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(out.id))
    fail(
      'TEACHING_ID',
      'A teaching ID must begin with a letter and contain 1–64 ASCII letters, digits, underscores, or hyphens',
    );
  for (const key of ['title', 'leftTitle', 'rightTitle'])
    if (
      key in out &&
      (!out[key].replace(
        /[ \t\r\n\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/gu,
        '',
      ) ||
        [...out[key]].length > 200 ||
        /[\r\n\x00]/.test(out[key]))
    )
      fail('TEACHING_TITLE', 'A teaching title must be single-line plain text of 1–200 characters');
  if (kind === 'component') {
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(out.component) ||
      !/^\d+\.\d+\.\d+$/.test(out.componentVersion)
    )
      fail('COMPONENT_VERSION', 'Invalid component name or version');
    componentParams(out.params, fail);
    if (Object.hasOwn(out, 'activity')) activityRelations(out.activity, fail);
  }
  if (kind === 'steps' && (!['full', 'staged'].includes(out.mode) || out.full !== true))
    fail('TEACHING_MODE', 'Stage mode must be full/staged and the full-text entry must be enabled');
  if (kind === 'code-compare') {
    for (const key of ['leftHighlights', 'rightHighlights'])
      if (
        !/^(?:[1-9]\d*(?:,[1-9]\d*)*)?$/.test(out[key]) ||
        new Set(out[key].split(',')).size !== out[key].split(',').length
      )
        fail(
          'TEACHING_LINES',
          'Highlighted lines must be unique positive integers separated by commas',
        );
    if (!source)
      for (const side of ['Left', 'Right'])
        if (!/^[\w+-]*$/.test(out['language' + side]) || !out['code' + side].endsWith('\n'))
          fail('TEACHING_CODE', 'The code language is invalid or the trailing newline is missing');
  }
  return out;
}
export function teachingJSON(raw, fail) {
  const tokens = raw.match(/"(?:\\.|[^"\\])*"|[^\s]/g) || [];
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ':' && stack.at(-1)) {
      let key;
      try {
        key = JSON.parse(token);
      } catch {
        fail('TEACHING_ATTRIBUTES', 'Invalid JSON property');
      }
      if (stack.at(-1).has(key)) fail('TEACHING_ATTRIBUTES', 'Duplicate teaching JSON property');
      stack.at(-1).add(key);
    }
  }

  try {
    return JSON.parse(raw);
  } catch {
    fail('TEACHING_ATTRIBUTES', 'Teaching attributes must be a valid JSON object');
  }
}
export function validateTeachingSerialized(serialized, fail) {
  for (const m of serialized.matchAll(
    /<!-- wp:mbb\/(collapse|steps|step|code-compare|component|code-tabs|object|statement|bibliography)(?: (\{[\s\S]*?\}))? -->/g,
  ))
    teachingAttributes(m[1], teachingJSON(m[2] || '{}', fail), fail);
}
export function teachingSource(source, fail, ignored = new Set(), nonce, fences = []) {
  const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [];
  if (lines.at(-1) === '') lines.pop();
  const text = (i) => lines[i]?.replace(/[\r\n]+$/, '');
  const marker = (data) =>
    '<!--mbb-teaching ' +
    nonce +
    ':' +
    [...new TextEncoder().encode(JSON.stringify(data))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('') +
    '-->';
  const replacements = new Map();
  const offsets = [];
  let cursor = 0;
  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length;
  }
  const inlineLiterals = [];
  for (const token of fences) {
    if (
      token.type !== 'inline' ||
      !token.map ||
      !token.children?.some((t) => t.type === 'code_inline')
    )
      continue;
    const begin = offsets[token.map[0]],
      raw = source.slice(begin, offsets[token.map[1]] ?? source.length),
      runs = [...raw.matchAll(/`+/g)];
    for (let i = 0; i < runs.length; i++) {
      let slashes = 0;
      for (let p = runs[i].index - 1; p >= 0 && raw[p] === '\\'; p--) slashes++;
      if (slashes % 2) continue;
      let end = -1;
      for (let j = i + 1; j < runs.length; j++)
        if (runs[j][0].length === runs[i][0].length) {
          end = j;
          break;
        }
      if (end < 0) continue;
      inlineLiterals.push([begin + runs[i].index, begin + runs[end].index + runs[end][0].length]);
      i = end;
    }
  }
  const protectedHTML = [];
  let consumed = 0;
  const closes = { pre: [], code: [] };
  for (const close of source.matchAll(/<\/(pre|code)>/gi))
    closes[close[1].toLowerCase()].push([close.index, close.index + close[0].length]);
  for (const m of source.matchAll(/<(pre|code)\b[^>]*>/gi)) {
    if (m.index < consumed) continue;
    let lo = 0,
      hi = offsets.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (offsets[mid] <= m.index) lo = mid + 1;
      else hi = mid;
    }
    if (
      ignored.has(lo - 1) ||
      text(lo - 1)?.startsWith(':::mbb:') ||
      inlineLiterals.some(([a, b]) => m.index >= a && m.index < b)
    )
      continue;
    const after = m.index + m[0].length,
      ends = closes[m[1].toLowerCase()];
    let left = 0,
      right = ends.length;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (ends[mid][0] < after) left = mid + 1;
      else right = mid;
    }
    if (!ends[left]) continue;
    consumed = ends[left][1];
    protectedHTML.push([m.index, consumed]);
  }
  const ranges = new Map(
    fences.filter((t) => t.type === 'fence' && t.map).map((t) => [t.map[0], t.map[1]]),
  );
  for (let i = 0; i < lines.length; i++) {
    if (ignored.has(i) || protectedHTML.some(([a, b]) => offsets[i] >= a && offsets[i] < b))
      continue;
    const match = /^:::mbb:v1 code-tabs (\{[^\r\n]*\})$/.exec(text(i));
    if (!match) continue;
    const a = teachingAttributes('code-tabs', teachingJSON(match[1], fail), fail, true);
    let next = i + 1;
    for (const tab of a.tabs) {
      while (next < lines.length && /^[ \t]*$/.test(text(next))) next++;
      const end = ranges.get(next),
        open = /^(`{3,}|~{3,})[ \t]*([A-Za-z0-9_+-]{0,64})[ \t]*$/.exec(text(next));
      if (
        !end ||
        !open ||
        !new RegExp('^' + open[1][0] + '{' + open[1].length + ',}[ \\t]*$').test(text(end - 1))
      )
        fail(
          'CODE_TABS_STRUCTURE',
          'Each code version requires a complete corresponding fence without container prefixes',
        );
      let code = lines.slice(next + 1, end - 1).join('');
      if (tab.terminalNewline) {
        if (!code.endsWith('\n'))
          fail('CODE_TABS_CODE', 'The terminal newline marker does not match the code');
      } else {
        if (code && !code.endsWith('\n'))
          fail('CODE_TABS_CODE', 'Code requires an explicit structural LF separator');
        if (code) code = code.slice(0, -1);
      }
      replacements.set(next, marker({ rawCode: { code, language: open[2] } }));
      for (let line = next + 1; line < end; line++) replacements.set(line, '');
      next = end;
    }
    while (next < lines.length && /^[ \t]*$/.test(text(next))) next++;
    if (text(next) !== ':::mbb:end')
      fail(
        'CODE_TABS_STRUCTURE',
        'A code group may contain only the corresponding number of fences',
      );
  }
  // A controlled raw paragraph in a button is pure link text, never math or image syntax.
  for (let i = 0; i < lines.length; i++) {
    if (
      ignored.has(i) ||
      protectedHTML.some(([a, b]) => offsets[i] >= a && offsets[i] < b) ||
      !/^:::mbb:v1 button /.test(text(i))
    )
      continue;
    let begin = i + 1;
    while (/^[ \t]*$/.test(text(begin) || '') && begin < lines.length) begin++;
    if (!text(begin)?.startsWith('<p>')) continue;
    let end = begin;
    while (end < lines.length && !text(end)?.endsWith('</p>')) end++;
    if (end === lines.length) fail('ADAPTER_STRUCTURE', 'The button text paragraph is unclosed');
    const html = lines
      .slice(begin, end + 1)
      .join('')
      .replace(/[\r\n]+$/, '');
    replacements.set(begin, marker({ rawButton: buttonParagraph(html, fail) }));
    for (let n = begin + 1; n <= end; n++) replacements.set(n, '');
  }
  let offset = 0;
  let definitionBeforeBibliography = false;
  return source
    .match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)
    .map((raw, index) => {
      const line = raw.replace(/[\r\n]+$/, '');
      const start = offset;
      offset += raw.length;
      if (replacements.has(index)) return replacements.get(index);
      if (ignored.has(index) || protectedHTML.some(([a, b]) => start >= a && start < b))
        return line;
      if (/^ {0,3}<!--mbb-teaching/.test(line))
        fail('TEACHING_SYNTAX', 'Reserved internal teaching markers cannot be Markdown input');
      if (/^ {0,3}\[\^[^\]\r\n]+\]:[ \t]*:::mbb:v1 (?:object|statement) \{/.test(line))
        fail(
          'TECHNICAL_STRUCTURE',
          'Technical objects and statements must not be inside footnotes',
        );
      if (/^ {0,3}\[\^[^\]\r\n]+\]:/.test(line)) definitionBeforeBibliography = true;
      if (definitionBeforeBibliography && /^:::mbb:v[12] bibliography /.test(line))
        fail('TECHNICAL_STRUCTURE', 'The bibliography must precede footnote definitions');
      if (!line.startsWith(':::mbb:')) return line;
      let data;
      if (line === ':::mbb:end') data = { end: true };
      else {
        const match =
          /^:::mbb:v([12]) (identity|collapse|steps|step|code-compare|component|code-tabs|group|details|buttons|button|adapter|object|statement|bibliography|image|gallery) (\{[^\r\n]*\})$/.exec(
            line,
          );
        if (!match)
          fail(
            'TEACHING_SYNTAX',
            'Teaching containers require a complete :::mbb:v1 name and JSON attributes',
          );
        let attrs;
        try {
          attrs = teachingJSON(match[3], fail);
        } catch {
          fail('TEACHING_ATTRIBUTES', 'Teaching attributes must be a valid JSON object');
        }
        if (match[1] === '2' && !['bibliography', 'component'].includes(match[2]))
          fail('TEACHING_VERSION', 'The teaching block version must be 1');
        if (match[2] === 'component' && (match[1] === '2') !== Object.hasOwn(attrs, 'activity'))
          fail(
            'ACTIVITY_RELATION',
            'Activity relations require a closed map of unique local static targets',
          );
        if (match[2] === 'bibliography' && (match[1] === '2') !== Object.hasOwn(attrs, 'style'))
          fail(
            'TEACHING_ATTRIBUTES',
            'Teaching container attributes are incomplete, unknown, or have invalid types',
          );
        data = {
          kind: match[2],
          version: Number(match[1]),
          attrs: teachingAttributes(match[2], attrs, fail, true),
        };
      }
      const hex = [...new TextEncoder().encode(JSON.stringify(data))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return '<!--mbb-teaching ' + nonce + ':' + hex + '-->';
    })
    .join('\n');
}
export function teachingMarker(raw, nonce) {
  const m = /^<!--mbb-teaching ([0-9a-f]{32}):([0-9a-f]+)-->\s*$/.exec(raw);
  if (!m || m[1] !== nonce) return null;
  return JSON.parse(
    new TextDecoder().decode(Uint8Array.from(m[2].match(/../g), (v) => parseInt(v, 16))),
  );
}
export function assembleTeaching(blocks, make, fail) {
  const root = [],
    stack = [{ children: root }];
  for (const b of blocks) {
    if (!b.teachingMarker) {
      stack.at(-1).children.push(b);
      continue;
    }
    const data = b.teachingMarker;
    if (Object.hasOwn(data, 'rawButton')) {
      stack
        .at(-1)
        .children.push(make('core/paragraph', { content: buttonText(data.rawButton, fail) }));
      continue;
    }
    if (data.rawCode) {
      stack.at(-1).children.push({ name: 'mbb/code', attributes: data.rawCode, exactCode: true });
      continue;
    }
    if (!data.end) {
      if (stack.length >= 32)
        fail('STRUCTURE_LIMIT', 'Teaching container depth must not exceed 31 levels');
      stack.push({ ...data, children: [] });
      continue;
    }
    if (stack.length === 1)
      fail('TEACHING_STRUCTURE', 'The teaching closing marker has no corresponding opening marker');
    const item = stack.pop();
    if (mediaKinds.has(item.kind)) {
      stack.at(-1).children.push(assembleMedia(item, make, fail));
      continue;
    }
    if (nativeAdapterKinds.has(item.kind)) {
      let attrs = nativeBlockAttributes(item.kind, item.attrs, fail);
      if (item.kind === 'button') {
        if (
          item.children.length !== 1 ||
          !['core/paragraph', 'core/html'].includes(item.children[0].name) ||
          item.children[0].innerBlocks?.length
        )
          fail(
            'ADAPTER_STRUCTURE',
            'A link button must contain exactly one controlled text paragraph',
          );
        attrs.text =
          item.children[0].name === 'core/html'
            ? buttonParagraph(
                item.children[0].innerContent?.join('') ??
                  item.children[0].attributes.content ??
                  item.children[0].originalContent,
                fail,
              )
            : buttonText(item.children[0].attributes.content, fail);
        item.children = [];
      }
      stack.at(-1).children.push(make(nativeAdapterName(item.kind), attrs, item.children));
      continue;
    }
    if (item.kind === 'adapter') {
      if (item.children.length)
        fail('ADAPTER_STRUCTURE', 'Static adapter containers must not contain body content');
      const a = adapterSourceAttributes(item.attrs, fail);
      stack.at(-1).children.push(make(a.descriptor.blockName, a.attributes, []));
      continue;
    }
    item.attrs.version = item.version || 1;
    if (item.kind === 'code-tabs') {
      if (
        item.children.length !== item.attrs.tabs.length ||
        item.children.some((b) => !b.exactCode)
      )
        fail('CODE_TABS_STRUCTURE', 'The code group fence structure is incomplete');
      item.attrs.tabs = item.attrs.tabs.map((t, i) => ({
        id: t.id,
        title: t.title,
        language: item.children[i].attributes.language,
        code: item.children[i].attributes.code,
      }));
      item.children = [];
    }
    if (item.kind === 'code-compare') {
      const [left, right, ...body] = item.children;
      if (left?.name !== 'mbb/code' || right?.name !== 'mbb/code')
        fail('TEACHING_CODE', 'A code comparison must begin with two fenced code blocks');
      Object.assign(item.attrs, {
        codeLeft: left.attributes.code,
        languageLeft: left.attributes.language || '',
        codeRight: right.attributes.code,
        languageRight: right.attributes.language || '',
      });
      item.children = body;
    }
    stack.at(-1).children.push(make('mbb/' + item.kind, item.attrs, item.children));
  }
  if (stack.length !== 1)
    fail('TEACHING_STRUCTURE', 'The teaching container closing marker is missing');
  validateTeaching(root, fail);
  return root;
}
export function validateTeaching(blocks, fail) {
  validateMedia(blocks, fail);
  const ids = new Set();
  let count = 0;
  let groups = 0;
  let identities = 0;
  function walk(list, parent = '', depth = 0, collapseDepth = 0, detailsDepth = 0) {
    for (const b of list) {
      if (depth > 32 || ++count > 10000)
        fail('STRUCTURE_LIMIT', 'Teaching structure exceeds its depth or node budget');
      const kind = teachingKind(b.name),
        inner = b.innerBlocks || [];
      if (parent === 'steps' && kind !== 'step')
        fail('TEACHING_STRUCTURE', 'A stage group may only contain stages');
      if (kind) {
        const a = teachingAttributes(kind, b.attributes, fail, false, b.name);
        if (kind === 'component') validateActivity(b, fail);
        if (kind === 'identity') {
          if (depth || ++identities > 1 || inner.length)
            fail('DOCUMENT_IDENTITY', 'A document permits one empty top-level logical identity');
          continue;
        }
        if (nativeAdapterKinds.has(kind) || kind === 'adapter') {
          if (kind === 'details' && detailsDepth >= 8)
            fail('ADAPTER_LIMIT', 'Native details are limited to 8 nested levels');
          if (a.anchor) {
            if (ids.has(a.anchor)) fail('ADAPTER_ANCHOR', 'The anchor duplicates a document ID');
            ids.add(a.anchor);
          }
          if (
            kind === 'buttons' &&
            (!inner.length ||
              inner.length > 32 ||
              inner.some((child) => child.name !== 'core/button'))
          )
            fail('ADAPTER_STRUCTURE', 'A button group requires 1–32 direct link buttons');
          if (kind === 'button' && (parent !== 'buttons' || inner.length))
            fail('ADAPTER_STRUCTURE', 'A link button must be a direct leaf of a button group');
          if (kind === 'adapter' && inner.length)
            fail('ADAPTER_STRUCTURE', 'Static adapters must not contain nested blocks');
          walk(inner, kind, depth + 1, collapseDepth, detailsDepth + (kind === 'details' ? 1 : 0));
          continue;
        }
        if (ids.has(a.id)) fail('TEACHING_ID', 'Teaching IDs must be unique within the document');
        ids.add(a.id);
        if (kind === 'code-tabs') {
          if (inner.length)
            fail('CODE_TABS_STRUCTURE', 'Code groups must not contain nested body content');
          for (const tab of a.tabs) {
            if (ids.has(tab.id))
              fail('TEACHING_ID', 'A code version ID duplicates a document anchor');
            ids.add(tab.id);
          }
        }
        if (kind === 'steps' && (depth || ++groups > 1 || !inner.length))
          fail(
            'TEACHING_STRUCTURE',
            'Each document may contain only one nonempty top-level stage group',
          );
        if (kind === 'step' && parent !== 'steps')
          fail('TEACHING_STRUCTURE', 'A stage must be a direct child of a stage group');
        if ((kind === 'collapse' || kind === 'step' || kind === 'component') && !inner.length)
          fail('TEACHING_STRUCTURE', 'Teaching body content must not be empty');
        if (kind === 'collapse' && collapseDepth >= 3)
          fail('TEACHING_DEPTH', 'Collapsible content is limited to three nested levels');
        if (kind === 'code-compare')
          for (const side of ['Left', 'Right'])
            if (
              a[side.toLowerCase() + 'Highlights']
                .split(',')
                .filter(Boolean)
                .some((v) => Number(v) > a['code' + side].split('\n').length - 1)
            )
              fail('TEACHING_LINES', 'Highlighted lines exceed the corresponding code range');
      }
      walk(
        inner,
        kind || b.name,
        depth + 1,
        collapseDepth + (kind === 'collapse' ? 1 : 0),
        detailsDepth,
      );
    }
  }
  const anchors = [];
  function collect(list) {
    for (const b of list) {
      if (!teachingKind(b.name)) {
        const raw =
          b.name === 'core/html'
            ? (b.innerContent?.join('') ?? b.attributes?.content)
            : b.attributes?.content;
        if (typeof raw === 'string') {
          const template = document.createElement('template');
          template.innerHTML = raw;
          for (const node of template.content.querySelectorAll('[id]')) anchors.push(node.id);
        }
      }
      collect(b.innerBlocks || []);
    }
  }
  collect(blocks);
  walk(blocks);
  validateTechnical(blocks, fail);
  if (anchors.some((id) => ids.has(id)))
    fail('TEACHING_ID', 'A teaching ID conflicts with a body anchor');
}
export function teachingMarkdown(b, body, fail) {
  const kind = teachingKind(b.name);
  const a = teachingAttributes(kind, b.attributes, fail, false, b.name);
  if (nativeAdapterKinds.has(kind) || kind === 'adapter') {
    const header =
      kind === 'adapter'
        ? {
            name: staticAdapterKind(b.name).name,
            version: a.mbbAdapterVersion,
            attrs: Object.fromEntries(
              Object.keys(staticAdapterKind(b.name).attributes).map((key) => [key, a[key]]),
            ),
          }
        : Object.fromEntries(Object.entries(a).filter(([key]) => key !== 'text'));
    return (
      ':::mbb:v1 ' +
      kind +
      ' ' +
      JSON.stringify(header) +
      '\n\n' +
      body.trimEnd() +
      '\n\n:::mbb:end'
    );
  }
  if (kind === 'code-tabs') return codeTabsMarkdown(a);
  const attrs = Object.fromEntries(
    [
      ...Object.keys(teachingSchemas[kind]),
      ...(kind === 'component' && a.version === 2 ? ['activity'] : []),
      ...(kind === 'bibliography' && a.version === 2 ? ['style'] : []),
      ...(kind === 'bibliography' && a.version === 2 && Object.hasOwn(a, 'origins')
        ? ['origins']
        : []),
    ].map((key) => [key, a[key]]),
  );
  const code = (side) => {
    const value = a['code' + side];
    const fence = '`'.repeat(Math.max(3, ...(value.match(/`+/g) || []).map((s) => s.length + 1)));
    return fence + a['language' + side] + '\n' + value + fence + '\n\n';
  };
  return (
    ':::mbb:v' +
    (['bibliography', 'component'].includes(kind) ? a.version : 1) +
    ' ' +
    kind +
    ' ' +
    JSON.stringify(attrs) +
    '\n\n' +
    (kind === 'code-compare' ? code('Left') + code('Right') : '') +
    body.trimEnd() +
    '\n\n:::mbb:end'
  );
}
export function registerTeaching() {
  if (!wp.blocks.getBlockType('mbb/code-tabs')) registerCodeTabs();
  const el = wp.element.createElement;
  const drafts = new Map();
  const syncDraftLock = () => {
    window.MarkBridgeParameterDrafts = { pending: () => drafts.size > 0 };
    try {
      const editor = wp.data.dispatch('core/editor');
      if (drafts.size) editor.lockPostSaving('mbb-component-params');
      else editor.unlockPostSaving('mbb-component-params');
    } catch {}
  };
  // An Edit can remount while its block remains in the provider (notably when
  // the editor iframe is established). Draft lifetime follows that provider's
  // block store, rather than a particular React instance.
  const draftRegistries = new WeakMap();
  const draftOwners = new Map();
  const retainDraftOwner = (registry, clientId) => {
    let state = draftRegistries.get(registry);
    if (!state) {
      state = { clients: new Map(), checking: false, unsubscribe: null };
      const release = () => {
        if (!state.clients.size) {
          state.unsubscribe?.();
          draftRegistries.delete(registry);
        }
      };
      const check = () => {
        if (state.checking) return;
        state.checking = true;
        let changed = false;
        try {
          const blocks = registry.select('core/block-editor');
          for (const [id, mounted] of state.clients) {
            if (draftOwners.get(id) !== registry) {
              state.clients.delete(id);
              continue;
            }
            if (drafts.has(id) && !blocks.getBlock(id)) {
              drafts.delete(id);
              changed = true;
            }
            if (!mounted && !drafts.has(id)) {
              state.clients.delete(id);
              draftOwners.delete(id);
            }
          }
          if (changed) syncDraftLock();
          release();
        } finally {
          state.checking = false;
        }
      };
      state.check = check;
      draftRegistries.set(registry, state);
      state.unsubscribe = registry.subscribe(check, 'core/block-editor');
    }
    draftOwners.set(clientId, registry);
    state.clients.set(clientId, (state.clients.get(clientId) || 0) + 1);
    return () => {
      state.clients.set(clientId, Math.max(0, (state.clients.get(clientId) || 1) - 1));
      state.check();
    };
  };
  registerTechnical({ drafts, syncDraftLock, retainDraftOwner });
  const ParameterEditor = createParameterEditor({
    wp,
    drafts,
    syncDraftLock,
    parse: (raw) =>
      teachingJSON(raw, (code, message) => {
        throw Error(message);
      }),
  });

  for (const [kind, schema] of Object.entries(teachingSchemas)) {
    if (nativeAdapterKinds.has(kind) || kind === 'adapter') continue;
    if (kind === 'code-tabs' || mediaKinds.has(kind) || technicalKind('mbb/' + kind)) continue;
    if (kind === 'identity') {
      if (!wp.blocks.getBlockType('mbb/identity'))
        wp.blocks.registerBlockType('mbb/identity', {
          apiVersion: 3,
          title: T('Logical document identity'),
          category: 'text',
          attributes: {
            namespace: { type: 'string' },
            document: { type: 'string' },
            version: { type: 'number' },
          },
          supports: { inserter: false, html: false, reusable: false, customClassName: false },
          edit: () =>
            el(
              'p',
              wp.blockEditor.useBlockProps({ className: 'mbb-identity-indicator' }),
              T('Document identity enabled'),
            ),
          save: () => null,
        });
      continue;
    }
    const name = 'mbb/' + kind;
    if (wp.blocks.getBlockType(name)) continue;
    wp.blocks.registerBlockType(name, {
      apiVersion: 3,
      title: {
        component: T('Teaching component'),
        collapse: T('Collapsible content'),
        steps: T('Stage navigation'),
        step: T('Stage'),
        'code-compare': T('Code comparison'),
      }[kind],
      category: 'text',
      ...(kind === 'step' ? { parent: ['mbb/steps'] } : {}),
      attributes: Object.fromEntries(
        Object.entries({
          ...schema,
          ...(kind === 'component' ? { activity: 'object' } : {}),
          version: 'number',
          ...(kind === 'code-compare' ? sourceFields : {}),
        }).map(([key, type]) => [key, { type }]),
      ),
      supports: { html: false, customClassName: false, anchor: false },
      edit: ({ attributes: a, setAttributes, clientId }) => {
        const registry = wp.data.useRegistry();
        const currentBlock = wp.data.useSelect(
          (select) => select('core/block-editor').getBlock(clientId),
          [clientId],
        );
        wp.element.useEffect(() => retainDraftOwner(registry, clientId), [registry, clientId]);
        wp.element.useEffect(() => {
          const initial = a.version === undefined ? { version: 1 } : {};
          for (const [key, type] of Object.entries(schema))
            if (a[key] === undefined)
              initial[key] =
                key === 'params'
                  ? window.MBBComponents?.[0]?.defaults || {}
                  : key === 'component'
                    ? window.MBBComponents?.[0]?.id || ''
                    : key === 'componentVersion'
                      ? window.MBBComponents?.[0]?.version || ''
                      : key === 'id'
                        ? 'mbb-' + clientId
                        : type === 'boolean'
                          ? key !== 'open'
                          : key.endsWith('Highlights')
                            ? ''
                            : key === 'mode'
                              ? 'full'
                              : kind === 'code-compare'
                                ? key === 'leftTitle'
                                  ? '原代码'
                                  : '新代码'
                                : '标题';
          if (kind === 'code-compare')
            for (const key of Object.keys(sourceFields))
              if (a[key] === undefined) initial[key] = key.startsWith('code') ? '\n' : '';
          if (Object.keys(initial).length) setAttributes(initial);
        }, []);
        const controls = Object.entries({
          ...schema,
          ...(kind === 'code-compare' ? sourceFields : {}),
        })
          .filter(
            ([key]) =>
              key !== 'full' &&
              !(kind === 'component' && ['component', 'componentVersion'].includes(key)),
          )
          .map(([key, type]) =>
            key === 'params'
              ? el(ParameterEditor, {
                  key,
                  value: a.params,
                  component: a.component,
                  componentVersion: a.componentVersion,
                  instanceId: a.id,
                  clientId,
                  activity: a.activity,
                  parts: [...activityParts(currentBlock || { innerBlocks: [] })].map(([id, b]) => ({
                    id,
                    title: b.attributes.title,
                    open: b.attributes.open,
                    direct: (currentBlock?.innerBlocks || []).some(
                      (child) => child.clientId === b.clientId,
                    ),
                  })),
                  onCommit: (params, meta) => {
                    if (meta?.activity)
                      validateActivity(
                        {
                          ...registry.select('core/block-editor').getBlock(clientId),
                          attributes: { ...a, params, version: 2, activity: meta.activity },
                        },
                        (code, message) => {
                          throw Error(message);
                        },
                      );
                    setAttributes({
                      params,
                      ...(meta?.activity ? { activity: meta.activity, version: 2 } : {}),
                      ...(meta?.componentVersion
                        ? { componentVersion: meta.componentVersion }
                        : {}),
                    });
                  },
                })
              : el(
                  key === 'mode'
                    ? wp.components.SelectControl
                    : type === 'boolean'
                      ? wp.components.ToggleControl
                      : key === 'params' || key.startsWith('code')
                        ? wp.components.TextareaControl
                        : wp.components.TextControl,
                  {
                    key,
                    ...(key === 'mode'
                      ? {
                          options: [
                            { label: T('Full text'), value: 'full' },
                            { label: T('By stage'), value: 'staged' },
                          ],
                        }
                      : {}),
                    help:
                      key === 'params' || key.startsWith('code')
                        ? T(
                            'Source must preserve its trailing newline. Use the button below to add it explicitly.',
                          )
                        : undefined,
                    label: {
                      component: T('Component type'),
                      componentVersion: T('Component version'),
                      params: T('Parameter JSON (data only; verified on save)'),
                      id: T('Stable ID'),
                      title: T('Title'),
                      open: T('Initially open'),
                      previous: T('Previous stage'),
                      next: T('Next stage'),
                      full: T('Full-text mode'),
                      leftTitle: T('Left title'),
                      rightTitle: T('Right title'),
                      mode: T('Reading mode (full / staged)'),
                      leftHighlights: T('Left highlighted lines (comma-separated)'),
                      rightHighlights: T('Right highlighted lines (comma-separated)'),
                      codeLeft: T('Left original code'),
                      codeRight: T('Right original code'),
                      languageLeft: T('Left language'),
                      languageRight: T('Right language'),
                    }[key],
                    ...(type === 'boolean'
                      ? { checked: !!a[key] }
                      : {
                          value:
                            key === 'params' ? JSON.stringify(a[key] || {}, null, 2) : a[key] || '',
                        }),
                    onChange: (value) => {
                      if (key === 'params') {
                        try {
                          const parsed = teachingJSON(value, () => {
                            throw new Error('JSON');
                          });
                          componentParams(parsed, () => {
                            throw new Error('params');
                          });
                          setAttributes({ params: parsed });
                        } catch {}
                      } else setAttributes({ [key]: value });
                    },
                  },
                ),
          );
        const field = (key) => controls.find((control) => control.key === key);
        const visible =
          kind === 'code-compare'
            ? ['leftTitle', 'rightTitle', 'codeLeft', 'codeRight', 'languageLeft', 'languageRight']
            : ['title'];
        const appendNewline = (side) =>
          el(
            wp.components.Button,
            {
              variant: 'secondary',
              disabled: (a['code' + side] || '').endsWith('\n'),
              onClick: () => setAttributes({ ['code' + side]: (a['code' + side] || '') + '\n' }),
            },
            T('Add a trailing newline to the ') +
              (side === 'Left' ? T('left') : T('right')) +
              T(' source'),
          );
        return el(
          'div',
          wp.blockEditor.useBlockProps({ className: 'mbb-teaching-editor' }),
          el(
            wp.blockEditor.InspectorControls,
            {},
            el(
              wp.components.PanelBody,
              { title: T('Teaching settings'), initialOpen: true },
              kind === 'component'
                ? el(wp.components.SelectControl, {
                    label: T('Registered teaching component'),
                    disabled: !!a.activity,
                    value: (a.component || '') + '@' + (a.componentVersion || ''),
                    options: [
                      ...((window.MBBComponents || []).some(
                        (p) => p.id === a.component && p.version === a.componentVersion,
                      )
                        ? []
                        : [
                            {
                              label:
                                T('Preserve current component ') +
                                (a.component || T('Awaiting selection')) +
                                ' ' +
                                (a.componentVersion || ''),
                              value: (a.component || '') + '@' + (a.componentVersion || ''),
                            },
                          ]),
                      ...(window.MBBComponents || []).map((p) => ({
                        label: p.title + ' ' + p.version,
                        value: p.id + '@' + p.version,
                      })),
                    ],
                    onChange: (key) => {
                      const p = (window.MBBComponents || []).find(
                        (p) => p.id + '@' + p.version === key,
                      );
                      if (p)
                        setAttributes({
                          component: p.id,
                          componentVersion: p.version,
                          params: p.defaults,
                        });
                    },
                  })
                : null,
              ...controls.filter((control) => !visible.includes(control.key)),
              kind === 'component' && !a.activity
                ? el(
                    'div',
                    {
                      'data-mbb-generated': '',
                      'data-mbb-teaching': 'component',
                      'data-mbb-teaching-config': JSON.stringify({
                        component: a.component,
                        componentVersion: a.componentVersion,
                        params: a.params,
                        status: (window.MBBComponents || []).some(
                          (p) => p.id === a.component && p.version === a.componentVersion,
                        )
                          ? 'available'
                          : 'missing',
                        provider: (window.MBBComponents || []).find(
                          (p) => p.id === a.component && p.version === a.componentVersion,
                        ),
                      }),
                    },
                    el(
                      'div',
                      { className: 'mbb-teaching-body' },
                      T('Interactive editor preview. Edit the static fallback body below.'),
                    ),
                  )
                : null,
            ),
          ),
          el(
            'p',
            { className: 'mbb-teaching-editor-label' },
            {
              component: T('Teaching component'),
              collapse: T('Collapsible content'),
              steps: T('Stage navigation'),
              step: T('Stage'),
              'code-compare': T('Code comparison'),
            }[kind],
          ),
          kind === 'code-compare'
            ? el(
                'div',
                { className: 'mbb-teaching-editor-columns' },
                ...['Left', 'Right'].map((side) =>
                  el(
                    'div',
                    { key: side },
                    field(side.toLowerCase() + 'Title'),
                    field('language' + side),
                    field('code' + side),
                    appendNewline(side),
                  ),
                ),
              )
            : kind === 'component'
              ? el(
                  'p',
                  {},
                  (window.MBBComponents || []).find(
                    (p) => p.id === a.component && p.version === a.componentVersion,
                  )?.title ||
                    a.component ||
                    T('Choose a teaching component in the sidebar'),
                )
              : field('title'),

          el(
            wp.blockEditor.InnerBlocks,
            kind === 'steps'
              ? { allowedBlocks: ['mbb/step'], template: [['mbb/step']], templateLock: false }
              : {},
          ),
        );
      },
      save: ({ attributes: a }) =>
        el(
          'div',
          wp.blockEditor.useBlockProps.save({ id: a.id }),
          kind === 'code-compare'
            ? ['Left', 'Right'].map((side) =>
                el(
                  'div',
                  { key: side, className: 'mbb-compare-' + side.toLowerCase() },
                  el('p', { 'data-mbb-generated': '' }, a[side.toLowerCase() + 'Title']),
                  el(
                    'pre',
                    {},
                    el(
                      'code',
                      a['language' + side] ? { className: 'language-' + a['language' + side] } : {},
                      a['code' + side],
                    ),
                  ),
                ),
              )
            : kind === 'component'
              ? el(
                  'p',
                  { 'data-mbb-generated': '', className: 'mbb-component-params' },
                  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(a.params)))),
                )
              : el('p', { className: 'mbb-teaching-title', 'data-mbb-generated': '' }, a.title),
          el('div', { className: 'mbb-teaching-body' }, el(wp.blockEditor.InnerBlocks.Content)),
        ),
    });
  }
}
