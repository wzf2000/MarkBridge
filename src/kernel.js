import { cloneActivity } from './activity-copy.js';
export {
  parseCSL,
  cslCandidate,
  exportCSL,
  migrateBibliography,
  bibliographyEntryCanonical,
  bibliographyEntryHash,
} from './bibliography.js';
export {
  markdownSnippet,
  writingPatterns,
  instantiateWritingPattern,
  writingIndex,
  writingAdvice,
} from './writing-tools.js';
import { registerWritingPatterns } from './writing-tools.js';
import {
  mediaImageAttributes,
  mediaGalleryAttributes,
  mediaDirective,
  validateMediaSerialized,
  validateMedia,
} from './native-media.js';
export {
  technicalIndex,
  technicalDiagnostics,
  technicalRenamePlan,
  technicalReferenceSelection,
  referenceHTML,
} from './technical.js';
import { installTechnicalInline, technicalRawHTML, technicalReference } from './technical.js';
export { sourceNavigation } from './source-navigation.js';
import { describeDiagnostic } from './diagnostics.js';
import { translate as T, format as F } from './i18n.js';
import {
  nativeAdapterKind,
  buttonText,
  staticAdapterKind,
  configureBlockAdapters as configureAdapters,
  adapterDescriptors,
  registerStaticBlockAdapters,
  validateAdaptersSerialized,
  adapterDraftPending,
} from './block-adapters.js';
import {
  parseFrontmatter,
  validateFrontmatter,
  validateFrontmatterSerialized,
  registerFrontmatter,
} from './frontmatter.js';
export { parseFrontmatter, frontmatterFields } from './frontmatter.js';
import { rewriteSerializedImageURLs } from './resource-images.js';
import { portableImageSource } from './portable-images.js';
export { MergeError, planMerge, resolveMerge, mergeMetadata } from './merge.js';
import {
  validateTeachingSerialized,
  teachingJSON,
  teachingSource,
  teachingMarker,
  assembleTeaching,
  validateTeaching,
  teachingKind,
  teachingMarkdown,
  registerTeaching,
} from './teaching.js';
import blockCapabilities from '../plugin/includes/php-converter/block-capabilities.json';
import MarkdownIt from 'markdown-it';
import footnotePlugin from 'markdown-it-footnote';
import { registerFootnotes } from './footnotes.js';
import { InlineMathEdit, installInlineMathDecorations } from './inline-math-editor.js';
export { typedMathRange } from './inline-math-editor.js';
import { registerNativeMathConversion } from './native-math-ui.js';
export { inspectNativeMath, verifyNativeMathML } from './native-math-conversion.js';
export const VERSION = '0.2.0';
export class ConversionError extends Error {
  constructor(code, message, location = '') {
    super(message);
    this.name = 'ConversionError';
    this.code = code;
    this.location = location;
    const diagnostic = describeDiagnostic(message);
    this.messageId = diagnostic.id;
    this.messageArgs = diagnostic.args;
  }
}
// Block names describe the implemented content mapping, never arbitrary styles.
export const supportedBlocks = Object.keys(blockCapabilities);
export function configureBlockAdapters(snapshot, register = true) {
  configureAdapters(snapshot, fail);
  if (register) registerStaticBlockAdapters(fail);
}
export { adapterDescriptors };
export function formatLocation(location = '') {
  const line = /^line:(\d+)(?::(\d+))?$/.exec(location);
  if (line)
    return line[2]
      ? F(T('Markdown line %1$s, column %2$s'), line[1], line[2])
      : F(T('Block at Markdown line %1$s'), line[1]);
  const block = /^blocks((?:\[\d+\])+)(?:\.attributes(?:\.([a-zA-Z][a-zA-Z0-9_-]{0,63}))?)?$/.exec(
    location,
  );
  if (block) {
    const path = [...block[1].matchAll(/\[(\d+)\]/g)]
      .map((match) => Number(match[1]) + 1)
      .join(' → ');
    return location.includes('.attributes')
      ? F(T('Block %1$s, attribute %2$s'), path, block[2] || '')
      : F(T('Block %1$s'), path);
  }
  const serialized = /^serialized:(\d+)$/.exec(location);
  return serialized ? F(T('Near serialized block character %1$s'), Number(serialized[1]) + 1) : '';
}
const atLocation = (location, action) => {
  try {
    return action();
  } catch (error) {
    if (error instanceof ConversionError && !error.location) error.location = location;
    throw error;
  }
};
const canonical = (s) => {
  const t = document.createElement('template');
  t.innerHTML = s;
  // Only Gutenberg's equivalent native-gallery default may disappear in comparison.
  // Requiring canonical JSON keeps duplicate keys and all other comment differences visible.
  const comments = document.createTreeWalker(t.content, 128);
  for (let n; (n = comments.nextNode());) {
    const match = /^ wp:gallery (\{[\s\S]*\}) $/.exec(n.data);
    if (!match) continue;
    try {
      const attrs = JSON.parse(match[1]);
      if (attrs.linkTo !== 'none' || JSON.stringify(attrs) !== match[1]) continue;
      delete attrs.linkTo;
      n.data = ' wp:gallery' + (Object.keys(attrs).length ? ' ' + JSON.stringify(attrs) : '') + ' ';
    } catch (_error) {
      // Invalid comments remain unequal and are rejected by the normal strict guards.
    }
  }
  for (const n of t.content.querySelectorAll('*')) {
    const attrs = [...n.attributes]
      .map((a) => [a.name, a.value])
      .sort(([a], [b]) => a.localeCompare(b));
    for (const a of [...n.attributes]) n.removeAttribute(a.name);
    for (const [name, value] of attrs) n.setAttribute(name, value);
  }
  return t.innerHTML;
};
const fail = (code, message, location) => {
  throw new ConversionError(code, message, location);
};
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const boundaryMD = new MarkdownIt({ html: true });
const md = new MarkdownIt({ html: true, linkify: false, typographer: false, breaks: false });
const legacyMD = new MarkdownIt({ html: true, linkify: false, typographer: false, breaks: false });
// Preserve escaped punctuation in image alternative text (markdown-it text_special).
function renderInlineAsText(tokens, options, env) {
  return tokens
    .map((t) =>
      t.type === 'image'
        ? this.renderInlineAsText(t.children || [], options, env)
        : ['text', 'text_special', 'code_inline'].includes(t.type)
          ? t.content
          : ['softbreak', 'hardbreak'].includes(t.type)
            ? '\n'
            : '',
    )
    .join('');
}
md.renderer.renderInlineAsText = renderInlineAsText;
legacyMD.renderer.renderInlineAsText = renderInlineAsText;
// Math rules run inside the parser: fenced/inline code never enters these rules.
const mathBlockRule = (state, start, end, silent) => {
  const begin = state.bMarks[start] + state.tShift[start];
  if (state.src.slice(begin, state.eMarks[start]).trim() !== '$$') return false;
  let last = start + 1;
  while (
    last < end &&
    state.src.slice(state.bMarks[last] + state.tShift[last], state.eMarks[last]).trim() !== '$$'
  )
    last++;
  if (last === end)
    fail('UNCLOSED_MATH', 'The block formula closing $$ is missing', `line:${start + 1}`);
  if (silent) return true;
  const token = state.push('mbb_math', '', 0);
  token.content = state.getLines(start + 1, last, state.blkIndent, false);
  token.map = [start, last + 1];
  state.line = last + 1;
  return true;
};
const mathInlineRule = (state, silent) => {
  const start = state.pos;
  if (state.src[start] !== '$') return false;
  if (state.src[start + 1] === '$')
    fail('MATH_DELIMITER', 'Block formula delimiters $$ must each occupy their own line');
  let end = start + 1;
  for (; end < state.posMax; end++) {
    if (state.src[end] === '\n') return false;
    if (state.src[end] === '\\') {
      end++;
      continue;
    }
    if (state.src[end] === '$') break;
  }
  if (end === state.posMax || end === start + 1) return false;
  if (!silent) {
    const t = state.push('mbb_inline_math', '', 0);
    t.content = state.src.slice(start + 1, end);
  }
  state.pos = end + 1;
  return true;
};
for (const parser of [md, legacyMD]) {
  parser.block.ruler.before('fence', 'mbb_math', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  parser.inline.ruler.before('escape', 'mbb_math', mathInlineRule);
  parser.renderer.rules.mbb_inline_math = (tokens, idx) =>
    `<span class="mbb-math" data-mbb-tex="${esc(tokens[idx].content)}">${esc('$' + tokens[idx].content + '$')}</span>`;
}
const footnoteLabel = /^[\p{L}\p{N}_-]{1,64}$/u;
const validFootnoteLabel = (label, location = '') => {
  if (typeof label !== 'string' || !footnoteLabel.test(label))
    fail(
      'FOOTNOTE_LABEL',
      'A footnote name must contain 1–64 letters, digits, underscores, or hyphens',
      location,
    );
  return label;
};
md.use(footnotePlugin);
installTechnicalInline(md, fail);
installTechnicalInline(legacyMD, fail);
md.inline.ruler.before('footnote_ref', 'mbb_literal_html_code_ref', (state, silent) => {
  const match = state.src.slice(state.pos, state.posMax).match(/^\[\^[^\]\n]+\]/u);
  if (!match) return false;
  let depth = 0;
  for (const token of state.tokens) {
    if (token.type !== 'html_inline') continue;
    if (/^<(?:code|pre)(?:\s|>)/i.test(token.content)) depth++;
    else if (/^<\/(?:code|pre)\s*>/i.test(token.content)) depth = Math.max(0, depth - 1);
  }
  if (!depth) return false;
  if (!silent) state.push('text', '', 0).content = match[0];
  state.pos += match[0].length;
  return true;
});
md.renderer.rules.footnote_ref = (tokens, idx) => {
  const label = validFootnoteLabel(tokens[idx].meta?.label);
  return `<span class="mbb-footnote-ref" data-mbb-footnote="${esc(label)}">[^${esc(label)}]</span>`;
};
// Check the token stream before the plugin moves definitions to the end. Its
// default behavior intentionally ignores duplicate and unused definitions.
md.core.ruler.before('footnote_tail', 'mbb_footnote_validate', (state) => {
  const definitions = new Map();
  const references = new Set();
  let definition = null;
  for (const token of state.tokens) {
    if (token.type === 'footnote_reference_open') {
      const label = validFootnoteLabel(token.meta?.label, loc({ token }));
      if (definitions.has(label))
        fail('FOOTNOTE_DUPLICATE', 'Duplicate footnote definition', loc({ token }));
      definitions.set(label, loc({ token }));
      definition = label;
    } else if (token.type === 'footnote_reference_close') definition = null;
    if (token.type !== 'inline') continue;
    let rawCode = 0;
    for (const child of token.children || []) {
      if (child.type === 'html_inline') {
        if (/^<(?:code|pre)(?:\s|>)/i.test(child.content)) rawCode++;
        else if (/^<\/(?:code|pre)\s*>/i.test(child.content)) rawCode = Math.max(0, rawCode - 1);
      }
      if (rawCode) continue;
      if (child.type === 'footnote_ref') {
        const label = validFootnoteLabel(child.meta?.label);
        if (definition)
          fail(
            'FOOTNOTE_NESTED',
            'Footnote definitions must not contain footnote references',
            loc({ token }),
          );
        references.add(label);
      } else if (child.type === 'text' && /\[\^[^\]\s]+\]/u.test(child.content)) {
        fail('FOOTNOTE_MISSING', 'A footnote reference has no definition', loc({ token }));
      }
    }
  }
  for (const [label, location] of definitions)
    if (!references.has(label))
      fail('FOOTNOTE_ORPHAN', 'A footnote definition is not referenced', location);
  state.env.mbbDefinitionOrder = [...definitions.keys()];
});
function api() {
  if (!globalThis.wp?.blocks) fail('ENVIRONMENT', 'A real WordPress block runtime is required');
  return wp.blocks;
}
function makeHTML(content) {
  return api().createBlock('core/html', {}, [], [content]);
}
function make(name, attrs = {}, children = []) {
  return api().createBlock(name, attrs, children);
}
function safeURL(value) {
  const decoded = value.replace(/[\u0000-\u0020\u007f]/g, '');
  if (
    /^(?:javascript|vbscript|data|file):/i.test(decoded) ||
    (/^[a-z][a-z\d+.-]*:/i.test(decoded) && !/^(?:https?|mailto):/i.test(decoded))
  )
    fail('UNSAFE_URL', 'Disallowed URL scheme');
}
const tags = new Set(
  'p br strong em s del span font code pre blockquote ul ol li a img table thead tbody tr th td hr h1 h2 h3 h4 h5 h6'.split(
    ' ',
  ),
);
const attrs = {
  a: ['href', 'title', 'id'],
  img: ['src', 'alt', 'title', 'style', 'width', 'height'],
  p: ['style'],
  span: ['style', 'class'],
  font: ['color', 'style'],
  ol: ['start'],
};
function safeHTML(html, allowMath = false) {
  technicalRawHTML(html, fail);
  if (/<!|<\/?(?:html|head|body)\b/i.test(html))
    fail('UNSAFE_HTML', 'HTML document containers are not allowed');
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  const walk = (node) => {
    if (node.nodeType === 3) return;
    if (node.nodeType !== 1)
      fail('UNSAFE_HTML', 'HTML comments and non-text nodes are unsupported');
    const tag = node.localName;
    const math =
      allowMath &&
      tag === 'span' &&
      node.className === 'mbb-math' &&
      node.hasAttribute('data-mbb-tex');
    const footnote =
      tag === 'span' &&
      node.className === 'mbb-footnote-ref' &&
      node.hasAttribute('data-mbb-footnote');
    const technical = tag === 'span' && ['mbb-xref', 'mbb-cite'].includes(node.className);
    if (technical) technicalReference(node.outerHTML, fail);
    if (!tags.has(tag) && !math) fail('UNSUPPORTED_HTML', F('Unsupported HTML tag %1$s', tag));
    for (const a of node.attributes) {
      if (
        !(
          technical
            ? [
                'class',
                'data-mbb-target',
                'data-mbb-keys',
                'data-mbb-version',
                'data-mbb-namespace',
                'data-mbb-document',
                'data-mbb-kind',
              ]
            : math
              ? ['class', 'data-mbb-tex']
              : footnote
                ? ['class', 'data-mbb-footnote']
                : attrs[tag] || []
        ).includes(a.name)
      )
        fail('UNSAFE_HTML_ATTRIBUTE', F('Unsupported attribute %1$s.%2$s', tag, a.name));
      if (['href', 'src'].includes(a.name)) safeURL(a.value);
      if (a.name === 'style')
        for (const rule of a.value.split(';').filter((x) => x.trim())) {
          const parts = rule.split(':');
          const key = parts[0].trim().toLowerCase(),
            value = (parts[1] || '').trim();
          const values = {
            color: /^(?:[a-z]+|#[0-9a-f]{3,8})$/i,
            'background-color': /^(?:[a-z]+|#[0-9a-f]{3,8})$/i,
            'font-weight': /^(?:normal|bold|[1-9]00)$/,
            'font-size': /^\d+(?:\.\d+)?(?:px|em|rem|%)$/,
            'text-align': /^(?:left|right|center|justify)$/,
            zoom: /^\d+(?:\.\d+)?%?$/,
          };
          if (parts.length !== 2 || !values[key]?.test(value))
            fail('UNSAFE_STYLE', 'Unsupported or unsafe style');
        }
      if (a.name === 'class' && !math && !footnote && !technical && a.value !== 'wzf-exercise-hint')
        fail('UNSAFE_HTML_ATTRIBUTE', 'Unsupported display class');
      if (a.name === 'color' && !/^(?:[a-z]+|#[0-9a-f]{3,8})$/i.test(a.value))
        fail('UNSAFE_STYLE', 'Unsafe color');
      if (['width', 'height'].includes(a.name) && !/^\d+(?:\.\d+)?(?:px|%)?$/.test(a.value))
        fail('UNSAFE_STYLE', 'Unsafe image dimensions');
    }
    if (math && node.textContent !== '$' + node.getAttribute('data-mbb-tex') + '$')
      fail('MATH_MISMATCH', 'Inline formula source differs from its display text');
    if (footnote) {
      const label = validFootnoteLabel(node.getAttribute('data-mbb-footnote'));
      if (node.textContent !== `[^${label}]` || node.children.length)
        fail('FOOTNOTE_MISMATCH', 'The footnote marker differs from its name');
    }
    for (const c of node.childNodes) walk(c);
  };
  // DOMParser can relocate forbidden head nodes; inspect the entire parsed document.
  if (doc.head.childNodes.length) fail('UNSAFE_HTML', 'HTML head nodes are not allowed');
  for (const node of doc.body.childNodes) walk(node);
  return doc.body;
}
function htmlMath(raw) {
  return raw.replace(
    /<(pre|code)\b[^>]*>[\s\S]*?<\/\1>|<span\b[^>]*data-mbb-tex[^>]*>[\s\S]*?<\/span>|(?<!\\)\$(?!\$)(?:\\.|[^$\n])+?(?<!\\)\$/g,
    (m) => {
      if (m[0] !== '$') return m;
      const tex = m.slice(1, -1);
      return '<span class="mbb-math" data-mbb-tex="' + esc(tex) + '">' + esc(m) + '</span>';
    },
  );
}
function htmlSource(html) {
  const root = safeHTML(html, true),
    math = [];
  if (!root.querySelector('span.mbb-math[data-mbb-tex]')) return html;
  let prefix = 'MBBHTMLMATH';
  while (html.includes(prefix)) prefix += 'X';
  for (const n of root.querySelectorAll('span.mbb-math[data-mbb-tex]')) {
    const key = prefix + math.length + 'END';
    math.push('$' + n.getAttribute('data-mbb-tex') + '$');
    n.replaceWith(root.ownerDocument.createTextNode(key));
  }
  let result = root.innerHTML;
  math.forEach((tex, i) => {
    result = result.replace(prefix + i + 'END', () => tex);
  });
  return result;
}
function tree(tokens) {
  const root = { children: [] },
    stack = [root];
  for (const token of tokens) {
    if (token.nesting === -1) {
      stack.pop();
      continue;
    }
    const node = { token, children: [] };
    stack.at(-1).children.push(node);
    if (token.nesting === 1) stack.push(node);
  }
  return root.children;
}
const loc = (node) => (node.token.map ? `line:${node.token.map[0] + 1}` : '');
function inline(token) {
  const allowed = new Set([
    'text',
    'softbreak',
    'hardbreak',
    'code_inline',
    'strong_open',
    'strong_close',
    'em_open',
    'em_close',
    's_open',
    's_close',
    'link_open',
    'link_close',
    'image',
    'html_inline',
    'mbb_technical_reference',
    'mbb_inline_math',
    'footnote_ref',
  ]);
  for (const t of token.children || []) {
    if (!allowed.has(t.type))
      fail('UNSUPPORTED_INLINE', F('Unsupported inline syntax %1$s', t.type), loc({ token }));

    if (t.type === 'image' && t.children?.some((child) => child.type === 'mbb_technical_reference'))
      fail('TECHNICAL_REFERENCE', 'Technical references must not be inside links or images');
    for (const [key, value] of t.attrs || []) if (['href', 'src'].includes(key)) safeURL(value);
    if (
      t.type === 'html_inline' &&
      /^<(?:class\s+[^<>]+|sstream|stdexcept|vector|functional|optional|iostream|memory|simplecounter|int|float|t|string|typename)>$/i.test(
        t.content,
      )
    )
      t.type = 'text'; // C++ template/header literals; never authorize them as HTML.
  }
  const result = md.renderer.renderInline(token.children, md.options, {});
  safeHTML(result, true);
  return result;
}
function paragraph(node) {
  if (node.children.length !== 1 || node.children[0].token.type !== 'inline')
    fail('INVALID_AST', 'Paragraph parsing failed', loc(node));
  return inline(node.children[0].token);
}
function taskParagraph(node) {
  if (node?.token.type !== 'paragraph_open' || node.children.length !== 1) return null;
  const token = node.children[0].token;
  const marker = token.content.match(/^\[([ xX])\](?:[ \t]+|$)/);
  if (!marker || token.children?.[0]?.type !== 'text') return null;
  const first = token.children[0].content;
  if (!first.startsWith(marker[0].trimEnd())) return null;
  const children = token.children.map((child, index) =>
    index === 0 ? { ...child, content: first.slice(marker[0].length) } : child,
  );
  const content = inline({ ...token, children });
  return { checked: marker[1].toLowerCase() === 'x', content };
}
function convert(nodes, legacyTasks = false, teachingNonce = '') {
  return nodes.map((node) =>
    atLocation(loc(node), () => {
      const t = node.token;
      switch (t.type) {
        case 'paragraph_open': {
          const content = paragraph(node);
          const parts = node.children[0].token.children;
          if (/^<a id="[^"]+"><\/a>$/.test(content)) return makeHTML(content);
          if (/<a id="[^"]+"><\/a>/.test(content))
            fail(
              'INLINE_ANCHOR',
              'An empty anchor must occupy a separate paragraph to prevent editor tag loss',
              loc(node),
            );
          if (parts.length === 1 && parts[0].type === 'image') {
            const image = safeHTML(content).querySelector('img');
            return make('core/image', {
              url: image.getAttribute('src'),
              alt: image.getAttribute('alt') || '',
              ...(image.hasAttribute('title') ? { title: image.getAttribute('title') } : {}),
            });
          }
          return make('core/paragraph', { content });
        }
        case 'heading_open':
          return make('core/heading', { level: Number(t.tag.slice(1)), content: paragraph(node) });
        case 'hr':
          return make('core/separator');
        case 'fence':
        case 'code_block':
          if (!/^[\w+-]*$/.test(t.info.trim()))
            fail(
              'CODE_INFO',
              'Code language tokens do not support additional parameters',
              loc(node),
            );
          return make('mbb/code', { code: t.content, language: t.info.trim() });
        case 'mbb_math':
          return make('mbb/math', { tex: t.content });
        case 'html_block': {
          const marker = teachingMarker(t.content, teachingNonce);
          if (marker) return { teachingMarker: marker };
          if (/^<!--\s*more\s*-->\s*$/.test(t.content)) return make('core/more');
          const protectedHTML = htmlMath(t.content),
            root = safeHTML(protectedHTML, true);
          return makeHTML(
            protectedHTML.replace(
              /style=(["'])(.*?)\1/g,
              (_, q, value) => 'style=' + q + value.trim().replace(/;\s*$/, '') + q,
            ),
          );
        }
        case 'blockquote_open':
          return make('core/quote', {}, convert(node.children, legacyTasks, teachingNonce));
        case 'footnote_block_open':
          return make(
            'mbb/footnotes',
            {},
            node.children.map((note) => {
              if (note.token.type !== 'footnote_open')
                fail('FOOTNOTE_STRUCTURE', 'Unsupported footnote definition structure', loc(note));
              const label = validFootnoteLabel(note.token.meta?.label);
              return make(
                'mbb/footnote',
                { label },
                convert(note.children, legacyTasks, teachingNonce),
              );
            }),
          );
        case 'bullet_list_open':
        case 'ordered_list_open': {
          const hasTask = (items) =>
            items.some(
              (item) =>
                taskParagraph(item.children[0]) ||
                item.children.some(
                  (child) =>
                    ['bullet_list_open', 'ordered_list_open'].includes(child.token.type) &&
                    hasTask(child.children),
                ),
            );
          const complex = (items) =>
            items.some(
              (item) =>
                item.children[0]?.token.type !== 'paragraph_open' ||
                item.children
                  .slice(1)
                  .some(
                    (n) =>
                      !['bullet_list_open', 'ordered_list_open'].includes(n.token.type) ||
                      complex(n.children),
                  ),
            );
          if (complex(node.children) || (!legacyTasks && hasTask(node.children)))
            return make(
              'mbb/list',
              { ordered: t.type === 'ordered_list_open', start: Number(t.attrGet('start') || 1) },
              node.children.map((item) => {
                const task = !legacyTasks && taskParagraph(item.children[0]);
                return task
                  ? make(
                      'mbb/task-item',
                      task,
                      convert(item.children.slice(1), legacyTasks, teachingNonce),
                    )
                  : make('mbb/list-item', {}, convert(item.children, legacyTasks, teachingNonce));
              }),
            );
          const items = node.children.map((item) => {
            if (
              item.token.type !== 'list_item_open' ||
              item.children[0]?.token.type !== 'paragraph_open'
            )
              fail('LIST_STRUCTURE', 'Unsupported list item structure', loc(item));
            if (legacyTasks && /^\[[ xX]\]\s/.test(item.children[0].children[0].token.content))
              fail('TASK_LIST', 'Task lists are not supported here', loc(item));
            const content = paragraph(item.children[0]);
            const nested = item.children.slice(1);
            return make('core/list-item', { content }, convert(nested, legacyTasks, teachingNonce));
          });
          return make(
            'core/list',
            {
              ordered: t.type === 'ordered_list_open',
              ...(t.attrGet('start') ? { start: Number(t.attrGet('start')) } : {}),
            },
            items,
          );
        }
        case 'table_open': {
          const data = { head: [], body: [], foot: [] };
          for (const section of node.children) {
            const key = section.token.type === 'thead_open' ? 'head' : 'body';
            data[key] = section.children.map((row) => ({
              cells: row.children.map((cell) => {
                const style = cell.token.attrGet('style') || '';
                return {
                  content: paragraph(cell),
                  tag: cell.token.tag,
                  ...(style ? { align: style.split(':')[1] } : {}),
                };
              }),
            }));
          }
          return make('core/table', data);
        }
        default:
          fail('UNSUPPORTED_BLOCK', F('Unsupported Markdown node %1$s', t.type), loc(node));
      }
    }),
  );
}
function checkSource(source) {
  if (typeof source !== 'string' || new Blob([source]).size > 262144)
    fail('INPUT_LIMIT', 'The source must be a string of at most 256 KiB');
  if (/[\uD800-\uDFFF]/u.test(source)) fail('INPUT_ENCODING', 'The source must be valid Unicode');
  if (source.includes('\0')) fail('INVALID_INPUT', 'The source contains NUL');
}
// Normalize legacy display delimiters without scanning fenced or inline code.
function directiveDataProjection(source) {
  return source.replace(
    /(^|[\r\n])(:::mbb:v1 [a-z][a-z0-9-]* (\{[^\r\n]*\}))(?=[\r\n]|$)/g,
    (whole, prefix, header, raw) => {
      try {
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return whole;
        return prefix + ' '.repeat(header.length);
      } catch {
        return whole;
      }
    },
  );
}
function displayBoundaries(source) {
  // All scanners see the same data-only projection; slicing still uses source.
  const projection = directiveDataProjection(source);
  const ignored = new Set();
  for (const t of boundaryMD.parse(projection, {}))
    if (['fence', 'code_block'].includes(t.type) && t.map)
      for (let i = t.map[0]; i < t.map[1]; i++) ignored.add(i);
  const htmlCode = [...projection.matchAll(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi)].map((m) => [
    m.index,
    m.index + m[0].length,
  ]);
  const marks = [];
  let offset = 0,
    fence = null,
    code = 0,
    lineIndex = 0;
  for (const line of projection.split('\n')) {
    if (ignored.has(lineIndex++)) {
      offset += line.length + 1;
      continue;
    }
    // Malformed reserved directives belong to Teaching's grammar diagnostics.
    // Do not let their data (or later normalization) replace that error with math.
    if (
      line.startsWith(':::mbb:') &&
      line.replace(/\r$/, '') !== ':::mbb:end' &&
      !htmlCode.some(([a, b]) => offset >= a && offset < b)
    )
      return source;
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f && !code) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      offset += line.length + 1;
      continue;
    }
    if (!fence)
      for (let i = 0; i < line.length; i++) {
        if (htmlCode.some(([a, b]) => offset + i >= a && offset + i < b)) continue;
        if (line[i] === '\\' && !code) {
          i++;
          continue;
        }
        if (line[i] === '`') {
          let n = 1;
          while (line[i + n] === '`') n++;
          if (!code) code = n;
          else if (code === n) code = 0;
          i += n - 1;
          continue;
        }
        if (!code && line.slice(i, i + 2) === '$$') {
          // A delimiter inside a quote is already on its own logical line.
          // Leave quote markers for markdown-it to remove when entering that container.
          marks.push({
            pos: offset + i,
            own: /^(?: {0,3}>[ \t]?)*\s*\$\$\s*$/.test(line),
            indent: line.match(/^\s*/)[0],
          });
          i++;
        }
      }
    offset += line.length + 1;
  }
  if (marks.length % 2)
    fail(
      'UNCLOSED_MATH',
      'The block formula lacks paired $$ delimiters',
      `line:${source.slice(0, marks.at(-1).pos).split('\n').length}`,
    );
  for (let i = marks.length - 2; i >= 0; i -= 2) {
    const a = marks[i],
      b = marks[i + 1];
    if (a.own && b.own) continue;
    const tex = source.slice(a.pos + 2, b.pos).trim();
    source =
      source.slice(0, a.pos) +
      '\n\n' +
      a.indent +
      '$$\n' +
      tex +
      '\n' +
      a.indent +
      '$$\n\n' +
      source.slice(b.pos + 2);
  }
  return source;
}
function parseSource(
  source,
  legacyTasks = false,
  legacyFootnotes = false,
  normalized = displayBoundaries(source),
) {
  checkSource(source);
  if (!legacyFootnotes) {
    // The legacy link parser would treat [^id]: as an ordinary link target,
    // changing the nesting of [link[^id]](url). Mask only that definition
    // prefix while preserving other reference-style link definitions.
    const linkProbe = directiveDataProjection(normalized)
      .replace(/^:::mbb:[^\r\n]*/gm, (header) => ' '.repeat(header.length))
      .replace(/^([ \t]{0,3})\[\^[^\]\n]+\]:/gm, '$1MBBFOOTNOTE:');
    for (const token of legacyMD.parse(linkProbe, {})) {
      if (token.type !== 'inline') continue;
      let linkDepth = 0;
      for (const child of token.children || []) {
        if (child.type === 'image' && /\[\^[^\]\s]+\]/u.test(child.content))
          fail('FOOTNOTE_IN_LINK', 'Image text must not contain footnote references');
        if (
          child.type === 'link_open' ||
          (child.type === 'html_inline' && /^<a(?:\s|>)/i.test(child.content))
        )
          linkDepth++;
        else if (
          child.type === 'link_close' ||
          (child.type === 'html_inline' && /^<\/a\s*>/i.test(child.content))
        )
          linkDepth = Math.max(0, linkDepth - 1);
        else if (linkDepth && child.type === 'text' && /\[\^[^\]\s]+\]/u.test(child.content))
          fail('FOOTNOTE_IN_LINK', 'Link text must not contain footnote references');
      }
    }
  }
  const ignoredTeaching = new Set();
  const teachingFences = boundaryMD.parse(directiveDataProjection(normalized), {});
  for (const token of teachingFences)
    if (['fence', 'code_block'].includes(token.type) && token.map)
      for (let line = token.map[0]; line < token.map[1]; line++) ignoredTeaching.add(line);
  const teachingNonce = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  normalized = teachingSource(normalized, fail, ignoredTeaching, teachingNonce, teachingFences);
  const env = {};
  const tokens = (legacyFootnotes ? legacyMD : md).parse(normalized, env);
  if (legacyFootnotes && Object.keys(env.references || {}).some((x) => x.startsWith('^')))
    fail('UNSUPPORTED_FOOTNOTE', 'Footnotes are not supported here');
  const roots = tree(tokens.filter((token) => token.type !== 'footnote_anchor'));
  const order = env.mbbDefinitionOrder || [];
  for (const root of roots)
    if (root.token.type === 'footnote_block_open')
      root.children.sort(
        (a, b) => order.indexOf(a.token.meta?.label) - order.indexOf(b.token.meta?.label),
      );
  return assembleTeaching(convert(roots, legacyTasks, teachingNonce), make, fail);
}
function blocksFromSource(
  source,
  legacyTasks = false,
  legacyFootnotes = false,
  reportSource = true,
  legacyFrontmatter = false,
) {
  // Legacy normalization adds newlines; its generated line map is not a source location.
  checkSource(source);
  let normalized = source;
  let removedHeader = false;
  try {
    const front = legacyFrontmatter ? null : parseFrontmatter(source, fail);
    const body = front ? front.body : source;
    removedHeader = !!front;
    normalized = displayBoundaries(body);
    const blocks = parseSource(body, legacyTasks, legacyFootnotes, normalized);
    return front ? [make('mbb/frontmatter', { version: 1, raw: front.raw }), ...blocks] : blocks;
  } catch (error) {
    if (
      (!reportSource || removedHeader || normalized !== source) &&
      error instanceof ConversionError &&
      /^line:/.test(error.location)
    )
      error.location = '';
    throw error;
  }
}
export function toBlocks(
  source,
  legacyTasks = false,
  legacyFootnotes = false,
  legacyFrontmatter = false,
) {
  return blocksFromSource(source, legacyTasks, legacyFootnotes, true, legacyFrontmatter);
}
function textMD(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/[\\`*{}\[\]()#+\-.!_$|>]/g, '\\$&')
    .replace(/(^|\n)(:::mbb:)/g, '$1\\$2');
}
function codeMD(code) {
  const n = Math.max(0, ...(code.match(/`+/g) || []).map((s) => s.length)) + 1;
  const fence = '`'.repeat(n);
  const pad = /^`|`$/.test(code) || (/^ .* $/.test(code) && /\S/.test(code)) ? ' ' : '';
  return fence + pad + code + pad + fence;
}
function inlineMD(html) {
  const root = safeHTML(html, true);
  const walk = (n) => {
    if (n.nodeType === 3) return textMD(n.textContent);
    const inside = () => [...n.childNodes].map(walk).join('');
    const rawTag = () =>
      '<' +
      n.localName +
      [...n.attributes].map((a) => ' ' + a.name + '="' + esc(a.value) + '"').join('') +
      '>' +
      inside() +
      '</' +
      n.localName +
      '>';
    switch (n.localName) {
      case 'strong':
        return '**' + inside() + '**';
      case 'em':
        return '*' + inside() + '*';
      case 's':
        return '~~' + inside() + '~~';
      case 'del':
        return n.outerHTML;
      case 'code':
        return codeMD(n.textContent);
      case 'br':
        return '<br>';
      case 'a':
        if (n.hasAttribute('id')) return n.outerHTML;
        return (
          '[' +
          inside() +
          '](<' +
          n.getAttribute('href').replace(/>/g, '%3E') +
          '>' +
          (n.hasAttribute('title')
            ? ' "' + n.getAttribute('title').replace(/"/g, '&quot;') + '"'
            : '') +
          ')'
        );
      case 'img':
        if (n.hasAttribute('style') || n.hasAttribute('width') || n.hasAttribute('height'))
          return n.outerHTML;
        return (
          '![' +
          textMD(n.getAttribute('alt') || '') +
          '](<' +
          n.getAttribute('src').replace(/>/g, '%3E') +
          '>' +
          (n.hasAttribute('title')
            ? ' "' + n.getAttribute('title').replace(/"/g, '&quot;') + '"'
            : '') +
          ')'
        );
      case 'font':
        return rawTag();
      case 'span':
        if (['mbb-xref', 'mbb-cite'].includes(n.className))
          return technicalReference(n.outerHTML, fail).raw;
        return n.hasAttribute('data-mbb-tex')
          ? '$' + n.getAttribute('data-mbb-tex') + '$'
          : n.hasAttribute('data-mbb-footnote')
            ? '[^' + validFootnoteLabel(n.getAttribute('data-mbb-footnote')) + ']'
            : rawTag();
      default:
        fail('UNSUPPORTED_INLINE_HTML', F('Unsupported inline HTML export %1$s', n.localName));
    }
  };
  return [...root.childNodes].map(walk).join('');
}
function taskItemMarkdown(item, at, includeInner = true) {
  const a = item.attributes;
  if (typeof a.content !== 'string' || typeof a.checked !== 'boolean')
    fail('TASK_STRUCTURE', 'Invalid task item state or content', at);
  const first = '[' + (a.checked ? 'x' : ' ') + '] ' + inlineMD(a.content);
  return includeInner && item.innerBlocks.length
    ? first + '\n\n' + rawMarkdown(item.innerBlocks, at)
    : first;
}
function rawMarkdown(blocks, path = 'blocks') {
  if (path === 'blocks' && blocks[0]?.name === 'mbb/frontmatter') {
    const raw = blocks[0].attributes.raw;
    return (
      raw +
      (blocks.length > 1
        ? (raw.endsWith('\n') ? '\n' : '\n\n') + rawMarkdown(blocks.slice(1), 'blocks')
        : '')
    );
  }
  if (path === 'blocks' && blocks.filter((b) => b.name === 'mbb/footnotes').length > 1)
    fail('FOOTNOTE_STRUCTURE', 'A document may contain only one footnote definition section');
  if (
    path === 'blocks' &&
    blocks.some((b, i) => b.name === 'mbb/footnotes' && i !== blocks.length - 1)
  )
    fail(
      'FOOTNOTE_STRUCTURE',
      'The footnote definition section must be at the end of the document',
    );
  return (
    blocks
      .map((b, i) =>
        atLocation(`${path}[${i}]`, () => {
          const at = `${path}[${i}]`;
          if (b.isValid === false) fail('INVALID_BLOCK', 'An invalid block cannot be exported', at);
          const a = b.attributes;
          if (!Object.hasOwn(blockCapabilities, b.name) && !staticAdapterKind(b.name))
            fail('UNSUPPORTED_BLOCK', 'This block cannot yet be converted to Markdown', at);
          const inner = b.innerBlocks || [];
          if (teachingKind(b.name))
            return teachingMarkdown(
              b,
              nativeAdapterKind(b.name) === 'button'
                ? '<p>' +
                    buttonText(
                      wp.richText.RichTextData && a.text instanceof wp.richText.RichTextData
                        ? a.text.toString()
                        : a.text,
                      fail,
                    ) +
                    '</p>'
                : rawMarkdown(inner, at),
              fail,
            );
          switch (b.name) {
            case 'mbb/footnotes':
              if (
                path !== 'blocks' ||
                inner.length === 0 ||
                inner.some((n) => n.name !== 'mbb/footnote')
              )
                fail(
                  'FOOTNOTE_STRUCTURE',
                  'The footnote definition section must be last and contain definitions',
                  at,
                );
              return inner
                .map((note, j) => {
                  const label = validFootnoteLabel(note.attributes.label, `${at}[${j}]`);
                  if (!note.innerBlocks?.length)
                    fail('FOOTNOTE_STRUCTURE', 'Footnote definitions must not be empty', at);
                  const body = rawMarkdown(note.innerBlocks, `${at}[${j}]`).trimEnd().split('\n');
                  return (
                    `[^${label}]: ${body[0]}` +
                    body
                      .slice(1)
                      .map((line) => '\n' + (line ? '    ' + line : ''))
                      .join('')
                  );
                })
                .join('\n\n');
            case 'mbb/footnote':
              fail(
                'FOOTNOTE_STRUCTURE',
                'Footnote definitions must be inside the footnote section',
                at,
              );
            case 'core/paragraph':
              return inlineMD(a.content);
            case 'core/gallery':
              return mediaDirective(
                'gallery',
                mediaGalleryAttributes(a, fail),
                rawMarkdown(inner, at),
              );
            case 'core/image': {
              const metadata = mediaImageAttributes(a, fail);
              const imageSource = inlineMD(
                '<img src="' +
                  esc(a.url) +
                  '" alt="' +
                  esc(a.alt || '') +
                  '"' +
                  (a.title ? ' title="' + esc(a.title) + '"' : '') +
                  '>',
              );
              return Object.keys(metadata).length
                ? mediaDirective('image', metadata, imageSource)
                : imageSource;
            }
            case 'core/heading':
              return '#'.repeat(a.level || 2) + ' ' + inlineMD(a.content);
            case 'core/separator':
              return '---';
            case 'core/more':
              if (a.customText || a.noTeaser)
                fail('MORE_OPTIONS', 'Custom more-separator attributes are not supported', at);
              return '<!--more-->';
            case 'mbb/code': {
              if (!/^[\w+-]*$/.test(a.language || ''))
                fail('CODE_INFO', 'Invalid code language', at);
              if (!a.code.endsWith('\n'))
                fail('CODE_TRAILING_NEWLINE', 'Fenced code must preserve its trailing newline', at);
              const n = Math.max(3, ...(a.code.match(/`+/g) || []).map((x) => x.length + 1));
              const f = '`'.repeat(n);
              return f + (a.language || '') + '\n' + a.code + f;
            }
            case 'mbb/math':
              if (/(^|\n)\s*\$\$\s*(\n|$)/.test(a.tex))
                fail('MATH_DELIMITER', 'Formula source contains a standalone delimiter line', at);
              return '$$\n' + a.tex + '\n$$';
            case 'core/html': {
              const html = b.innerContent?.join('') ?? a.content;
              if (typeof html !== 'string' || inner.length)
                fail('HTML_STRUCTURE', 'Unsupported HTML block structure', at);
              return htmlSource(html).trimEnd();
            }
            case 'core/quote':
              return rawMarkdown(inner, at)
                .split('\n')
                .map((l) => '> ' + l)
                .join('\n');
            case 'mbb/list':
              return inner
                .map((item, j) => {
                  if (!['mbb/list-item', 'mbb/task-item'].includes(item.name))
                    fail('LIST_STRUCTURE', 'A complex list contains a non-list item', at);
                  const marker = a.ordered ? String((a.start || 1) + j) + '. ' : '- ';
                  const body =
                    item.name === 'mbb/task-item'
                      ? taskItemMarkdown(item, `${at}[${j}]`)
                      : rawMarkdown(item.innerBlocks, `${at}[${j}]`);
                  const lines = body.trimEnd().split('\n');
                  return (
                    marker +
                    lines[0] +
                    lines
                      .slice(1)
                      .map((l) => '\n' + ' '.repeat(marker.length) + l)
                      .join('')
                  );
                })
                .join('\n\n');
            case 'core/list':
              return inner
                .map((item, j) => {
                  if (item.name !== 'core/list-item')
                    fail('LIST_STRUCTURE', 'A list contains a non-list item', at);
                  const marker = a.ordered ? String((a.start || 1) + j) + '. ' : '- ';
                  return (
                    marker +
                    inlineMD(item.attributes.content) +
                    (item.innerBlocks.length
                      ? (item.innerBlocks.every((x) => x.name === 'core/list') ? '\n' : '\n\n') +
                        rawMarkdown(item.innerBlocks, `${at}[${j}]`)
                          .split('\n')
                          .map((l) => ' '.repeat(marker.length) + l)
                          .join('\n')
                      : '')
                  );
                })
                .join('\n');
            case 'core/table': {
              if (a.head?.length !== 1 || a.foot?.length)
                fail('TABLE_STRUCTURE', 'A table requires exactly one header and no footer', at);
              const rows = [...a.head, ...a.body];
              const width = a.head[0].cells.length;
              if (rows.some((r) => r.cells.length !== width))
                fail('TABLE_STRUCTURE', 'Table column counts differ', at);
              const row = (r) =>
                '| ' +
                r.cells.map((c) => inlineMD(c.content).replace(/\n/g, ' ')).join(' | ') +
                ' |';
              const align =
                '| ' +
                a.head[0].cells
                  .map((c) => ({ left: ':---', center: ':---:', right: '---:' })[c.align] || '---')
                  .join(' | ') +
                ' |';
              return [row(a.head[0]), align, ...a.body.map(row)].join('\n');
            }
            default:
              fail('UNSUPPORTED_BLOCK', F('Block %1$s cannot be exported to Markdown', b.name), at);
          }
        }),
      )
      .join('\n\n') + '\n'
  );
}
export function toMarkdown(blocks, context) {
  if (globalThis.MarkBridgeParameterDrafts?.pending() || adapterDraftPending())
    fail(
      'COMPONENT_DRAFT',
      'Parameters have not been applied. Apply or discard the parameter input before saving.',
    );
  if (context?.origin !== 'markdown_import')
    fail('ORIGIN_REQUIRED', 'Reverse conversion requires an explicit Markdown source document');
  validateTeaching(blocks, fail);
  validateFrontmatter(blocks, fail);
  const result = rawMarkdown(blocks);
  checkSource(result);
  // Fail closed if formatting, attributes, nesting, or inline constructs would be lost.
  const original = api().serialize(blocks);
  checkSource(original);
  validateAdaptersSerialized(original, fail, teachingJSON);
  const regenerated = api().serialize(blocksFromSource(result, false, false, false));
  if (canonical(original) !== canonical(regenerated)) {
    // Identify the first real differing block, including its nested path.
    // Do not expose a source snippet or infer a line from canonicalized HTML.
    const regeneratedBlocks = blocksFromSource(result, false, false, false);
    const difference = (left, right, path = 'blocks') => {
      for (let i = 0; i < left.length; i++) {
        const at = `${path}[${i}]`;
        if (!right[i]) return at;
        if (canonical(api().serialize([left[i]])) === canonical(api().serialize([right[i]])))
          continue;
        if (
          left[i].name !== right[i].name ||
          (left[i].innerBlocks || []).length !== (right[i].innerBlocks || []).length
        )
          return at;
        const child = difference(left[i].innerBlocks || [], right[i].innerBlocks || [], at);
        if (child) return child;
        for (const key of Object.keys(left[i].attributes || {})) {
          if (
            JSON.stringify(left[i].attributes[key]) !==
              JSON.stringify(right[i].attributes?.[key]) &&
            /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)
          )
            return `${at}.attributes.${key}`;
        }
        return at;
      }
      return '';
    };
    fail(
      'LOSSY_ROUNDTRIP',
      'Conversion cannot preserve all current block content or attributes. Export was blocked',
      difference(blocks, regeneratedBlocks),
    );
  }
  return result;
}
export function importDocument(source, documentId) {
  if (typeof documentId !== 'string' || !documentId.trim())
    fail('DOCUMENT_ID', 'A stable document_id is required');
  const blocks = toBlocks(source);
  checkSource(api().serialize(blocks));
  toMarkdown(blocks, { origin: 'markdown_import' });
  toMarkdown(api().parse(api().serialize(blocks)), { origin: 'markdown_import' });
  return {
    schema: 1,
    converter: VERSION,
    origin: 'markdown_import',
    documentId,
    source,
    serialized: api().serialize(blocks),
  };
}
export function rewriteDocumentImages(base, mappings) {
  exportDocument(base, base?.serialized); // Apply the same closed document-model validation as block edits.
  const verified = importPairedDocument(base.source, base.serialized, base.documentId);
  const serialized = rewriteSerializedImageURLs(verified.serialized, mappings, fail);
  if (serialized === verified.serialized) return verified;
  return importDocument(exportDocument(verified, serialized), base.documentId);
}
export function portableDocumentImages(base, mappings) {
  validateMedia(api().parse(base?.serialized || ''), fail, true);
  exportDocument(base, base?.serialized);
  const verified = importPairedDocument(base.source, base.serialized, base.documentId);
  const expected = rewriteSerializedImageURLs(verified.serialized, mappings, fail, true);
  if (!mappings.length) return verified;
  const source = portableImageSource(verified.source, mappings, fail);
  const result = importDocument(source, base.documentId);
  if (result.serialized !== expected)
    fail(
      'EXPORT_PROJECTION',
      'Image references cannot be reliably projected while preserving the remaining body bytes',
    );
  return result;
}
// Explicit cross-site copy: normalization is previewed; the saved original is untouched.
export function relocateDocumentImages(base, mappings, portable = false) {
  exportDocument(base, base?.serialized);
  const verified = importPairedDocument(base.source, base.serialized, base.documentId);
  const map = new Map();
  if (!Array.isArray(mappings) || mappings.length > 256)
    fail('MEDIA_RELOCATION', 'Invalid cross-site media association map');
  for (const item of mappings) {
    const keys = Object.keys(item || {})
      .sort()
      .join(',');
    if (
      keys !== (portable ? 'from,to' : 'from,id,to') ||
      typeof item.from !== 'string' ||
      typeof item.to !== 'string' ||
      (!portable && (!Number.isSafeInteger(item.id) || item.id < 1)) ||
      map.has(item.from)
    )
      fail('MEDIA_RELOCATION', 'Invalid cross-site media association map');
    map.set(item.from, item);
  }
  // Validate URLs/counts and require every mapping to address a real image.
  rewriteSerializedImageURLs(
    verified.serialized,
    mappings.map(({ from, to }) => ({ from, to })),
    fail,
    portable,
  );
  const walk = (blocks) =>
    blocks.map((block) => {
      if (block.name === 'core/image') {
        const mapping = map.get(block.attributes.url);
        if (!mapping) {
          if (portable || block.attributes.id)
            fail(
              'MEDIA_RELOCATION',
              'Every cross-site native image requires a verified association',
            );
          return block;
        }
        const attrs = { ...block.attributes };
        if (portable) delete attrs.id;
        else attrs.id = mapping.id;
        return api().createBlock(block.name, attrs);
      }
      return block.innerBlocks.length
        ? api().cloneBlock(block, {}, walk(block.innerBlocks))
        : block;
    });
  const serialized = rewriteSerializedImageURLs(
    api().serialize(walk(api().parse(verified.serialized))),
    mappings.map(({ from, to }) => ({ from, to })),
    fail,
    portable,
  );
  // Canonical copy, shared with PHP. Full source is shown before download/save.
  const copyBlocks = (blocks) =>
    blocks.map((block) => {
      if (block.name === 'core/html') {
        // Match PHP parseBlocks' ASCII wrapper-whitespace normalization in this explicit copy only.
        const content = (block.innerContent?.join('') ?? block.attributes.content).replace(
          /^[ \t\r\n\v\0]+|[ \t\r\n\v\0]+$/g,
          '',
        );
        return { ...block, attributes: { ...block.attributes, content }, innerContent: [content] };
      }
      return { ...block, innerBlocks: copyBlocks(block.innerBlocks || []) };
    });
  return importDocument(
    toMarkdown(copyBlocks(api().parse(serialized)), { origin: 'markdown_import' }),
    base.documentId,
  );
}
function snapshotKind(source, serialized) {
  for (const legacyFrontmatter of [false, true])
    for (const [legacyTasks, legacyFootnotes] of [
      [false, false],
      [true, true],
      [false, true],
    ]) {
      try {
        if (
          api().serialize(toBlocks(source, legacyTasks, legacyFootnotes, legacyFrontmatter)) ===
          serialized
        )
          return legacyFootnotes || legacyFrontmatter ? 'legacy' : 'current';
      } catch (_error) {
        // Only an exact complete block snapshot can use the historical parser.
      }
    }
  return null;
}
export function importPairedDocument(source, serialized, documentId) {
  checkSource(source);
  checkSource(serialized);
  if (typeof documentId !== 'string' || !documentId.trim())
    fail('DOCUMENT_ID', 'A stable document_id is required');
  if (typeof serialized !== 'string' || !snapshotKind(source, serialized))
    fail('SNAPSHOT_MISMATCH', 'The source and block snapshots do not match');
  return {
    schema: 1,
    converter: VERSION,
    origin: 'markdown_import',
    documentId,
    source,
    serialized,
  };
}
export function exportDocument(document, serialized) {
  if (globalThis.MarkBridgeParameterDrafts?.pending() || adapterDraftPending())
    fail(
      'COMPONENT_DRAFT',
      'Parameters have not been applied. Apply or discard the parameter input before saving.',
    );
  checkSource(serialized);
  checkSource(document?.serialized);
  checkSource(document?.source);
  if (
    document?.schema !== 1 ||
    !['0.1.2', VERSION].includes(document.converter) ||
    document.origin !== 'markdown_import'
  )
    fail('DOCUMENT_MODEL', 'Unsupported origin or model version');
  const kind = snapshotKind(document.source, document.serialized);
  if (!kind) fail('SNAPSHOT_MISMATCH', 'The source and block snapshots do not match');
  if (kind === 'legacy' && canonical(serialized) === canonical(document.serialized))
    return document.source;
  validateMediaSerialized(serialized, fail);
  validateTeachingSerialized(serialized, fail);
  validateAdaptersSerialized(serialized, fail, teachingJSON);
  validateFrontmatterSerialized(serialized, fail);
  const blocks = api().parse(serialized);
  const normalized = toMarkdown(blocks, document);
  if (
    blocks.some(function adapted(b) {
      return (
        !!nativeAdapterKind(b.name) ||
        !!staticAdapterKind(b.name) ||
        (b.innerBlocks || []).some(adapted)
      );
    }) &&
    canonical(serialized) !== canonical(api().serialize(blocksFromSource(normalized)))
  )
    fail('ROUNDTRIP', 'Native adapter serialized attributes or HTML cannot round-trip exactly');
  return canonical(serialized) === canonical(document.serialized) ? document.source : normalized;
}
function MathPreview({ tex, display = false }) {
  const el = wp.element.createElement;
  const previewRef = wp.element.useRef(null);
  const [html, setHTML] = wp.element.useState('');
  const [error, setError] = wp.element.useState('');
  const [retry, setRetry] = wp.element.useState(0);
  wp.element.useEffect(() => {
    let active = true;
    setHTML('');
    setError('');
    const timer = setTimeout(() => {
      if (!globalThis.MBB_MATH) return;
      MBB_MATH.registerDocument?.(previewRef.current?.ownerDocument);
      MBB_MATH.render(tex, display).then(
        (h) => {
          if (active) setHTML(h);
        },
        (e) => {
          if (active) setError(e.message);
        },
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tex, display, retry]);
  return el(
    'div',
    { className: 'mbb-math-preview', contentEditable: false, ref: previewRef },
    el('small', {}, T('Formula preview (not written to the body)')),
    error
      ? el(
          wp.element.Fragment,
          {},
          el('code', {}, error),
          el(
            'button',
            { type: 'button', onClick: () => setRetry((v) => v + 1) },
            T('Retry formula typesetting'),
          ),
        )
      : html
        ? el('div', { dangerouslySetInnerHTML: { __html: html } })
        : el('code', {}, tex),
  );
}
export function register() {
  registerFrontmatter();
  registerTeaching();
  registerFootnotes();
  const el = wp.element.createElement;
  const convertPlainList = (block) => {
    if (block.name === 'core/list') return block;
    if (block.name !== 'mbb/list' || !block.innerBlocks?.length) return null;
    const items = block.innerBlocks.map((item) => {
      if (item.name !== 'mbb/list-item' || item.innerBlocks?.[0]?.name !== 'core/paragraph')
        return null;
      const nested = item.innerBlocks.slice(1).map(convertPlainList);
      if (nested.some((child) => !child)) return null;
      return make('core/list-item', { content: item.innerBlocks[0].attributes.content }, nested);
    });
    if (items.some((item) => !item)) return null;
    return make(
      'core/list',
      {
        ordered: block.attributes.ordered,
        ...(block.attributes.start !== 1 ? { start: block.attributes.start } : {}),
      },
      items,
    );
  };
  if (!api().getBlockType('mbb/list')) {
    api().registerBlockType('mbb/list', {
      apiVersion: 3,
      title: T('Multi-paragraph list'),
      category: 'text',
      attributes: {
        ordered: { type: 'boolean', default: false },
        start: { type: 'number', default: 1 },
      },
      supports: { html: false },
      edit: ({ attributes: a, clientId, isSelected }) => {
        const children = wp.data.useSelect(
          (select) => select('core/block-editor').getBlocks(clientId),
          [clientId],
        );
        const { removeBlock, replaceBlock } = wp.data.useDispatch('core/block-editor');
        const plain = convertPlainList({ name: 'mbb/list', attributes: a, innerBlocks: children });
        return el(
          wp.element.Fragment,
          {},
          isSelected && (children.length === 0 || plain)
            ? el(
                wp.blockEditor.BlockControls,
                {},
                el(
                  wp.components.ToolbarGroup,
                  {},
                  children.length === 0
                    ? el(wp.components.ToolbarButton, {
                        label: T('Delete empty list'),
                        onClick: () => removeBlock(clientId),
                        children: T('Delete empty list'),
                      })
                    : el(wp.components.ToolbarButton, {
                        label: T('Convert to ordinary list'),
                        onClick: () => replaceBlock(clientId, plain),
                        children: T('Convert to ordinary list'),
                      }),
                ),
              )
            : null,
          el(
            a.ordered ? 'ol' : 'ul',
            wp.blockEditor.useInnerBlocksProps(
              wp.blockEditor.useBlockProps(a.ordered ? { start: a.start } : {}),
              {
                allowedBlocks: ['mbb/list-item', 'mbb/task-item'],
                template: [['mbb/list-item']],
                templateLock: false,
              },
            ),
          ),
        );
      },
      save: ({ attributes: a }) =>
        el(
          a.ordered ? 'ol' : 'ul',
          wp.blockEditor.useInnerBlocksProps.save(
            wp.blockEditor.useBlockProps.save(a.ordered ? { start: a.start } : {}),
          ),
        ),
    });
    api().registerBlockType('mbb/list-item', {
      apiVersion: 3,
      title: T('List item'),
      category: 'text',
      parent: ['mbb/list'],
      supports: { html: false },
      edit: () =>
        el(
          'li',
          wp.blockEditor.useInnerBlocksProps(wp.blockEditor.useBlockProps(), {
            template: [['core/paragraph']],
          }),
        ),
      save: () =>
        el('li', wp.blockEditor.useInnerBlocksProps.save(wp.blockEditor.useBlockProps.save())),
    });
    api().registerBlockType('mbb/task-item', {
      apiVersion: 3,
      title: T('Task item'),
      category: 'text',
      parent: ['mbb/list'],
      attributes: {
        content: { type: 'string', default: '' },
        checked: { type: 'boolean', default: false },
      },
      supports: { html: false },
      edit: ({ attributes: a, setAttributes }) =>
        el(
          'li',
          wp.blockEditor.useBlockProps(),
          el(
            'div',
            { className: 'mbb-task-control', contentEditable: false },
            el(wp.components.CheckboxControl, {
              label: T('Completed'),
              checked: a.checked,
              onChange: (checked) => setAttributes({ checked }),
            }),
          ),
          el(wp.blockEditor.RichText, {
            tagName: 'p',
            'aria-label': T('Task content'),
            value: a.content,
            onChange: (content) => setAttributes({ content }),
            placeholder: T('Task content'),
          }),
          el(wp.blockEditor.InnerBlocks),
        ),
      save: ({ attributes: a }) =>
        el(
          'li',
          wp.blockEditor.useBlockProps.save(),
          el(
            'p',
            {},
            '[' + (a.checked ? 'x' : ' ') + '] ',
            el(wp.blockEditor.RichText.Content, { tagName: 'span', value: a.content }),
          ),
          el(wp.blockEditor.InnerBlocks.Content),
        ),
    });
    api().registerBlockVariation('mbb/list', {
      name: 'task-list',
      title: T('Task list'),
      description: T('Insert a checkable task list.'),
      scope: ['inserter'],
      innerBlocks: [['mbb/task-item', { checked: false, content: '' }]],
    });
  }
  if (api().getBlockType('mbb/math')) return;
  for (const [name, field, label] of [
    ['mbb/math', 'tex', T('Display formula')],
    ['mbb/code', 'code', T('Code')],
  ]) {
    api().registerBlockType(name, {
      apiVersion: 3,
      title: label,
      category: 'text',
      attributes: {
        [field]: { type: 'string', default: '' },
        ...(field === 'code' ? { language: { type: 'string', default: '' } } : {}),
      },
      supports: { html: false },
      edit: ({ attributes, setAttributes, isSelected }) => {
        const sourceRef = wp.element.useRef(null);
        wp.element.useEffect(() => {
          if (field !== 'tex' || !isSelected || attributes.tex || !sourceRef.current) return;
          const owner = sourceRef.current.ownerDocument;
          // Finish the Enter event that created this block before focusing its textarea.
          const timer = owner.defaultView.setTimeout(() => sourceRef.current?.focus(), 0);
          return () => owner.defaultView.clearTimeout(timer);
        }, [isSelected]);
        return el(
          'div',
          wp.blockEditor.useBlockProps(),
          field === 'code'
            ? el(wp.components.TextControl, {
                label: T('Language'),
                value: attributes.language,
                onChange: (language) => setAttributes({ language }),
              })
            : null,
          field === 'code' || isSelected
            ? el(wp.components.TextareaControl, {
                label: field === 'tex' ? T('TeX source') : label,
                value: attributes[field],
                ref: sourceRef,
                onChange: (value) => setAttributes({ [field]: value }),
              })
            : null,
          field === 'tex' ? el(MathPreview, { tex: attributes.tex, display: true }) : null,
        );
      },
      save: ({ attributes }) =>
        el(
          'pre',
          wp.blockEditor.useBlockProps.save(),
          el(
            'code',
            field === 'code'
              ? { className: attributes.language ? 'language-' + attributes.language : undefined }
              : { className: 'mbb-tex' },
            attributes[field],
          ),
        ),
    });
  }
  wp.richText.registerFormatType('mbb/math', {
    title: T('Inline formula source'),
    tagName: 'span',
    className: 'mbb-math',
    attributes: { tex: 'data-mbb-tex' },
    contentEditable: false,
    edit: InlineMathEdit,
  });
  installInlineMathDecorations();
  registerNativeMathConversion();
  registerWritingPatterns(toBlocks);
}
const converterOnly = typeof window !== 'undefined' && window.MBB_CONVERTER_ONLY === true;
if (!converterOnly) register();
configureBlockAdapters(globalThis.MBB_ADAPTERS || [], !converterOnly);

export { parseBibTeX, bibtexCandidate } from './bibtex.js';

export { activityParts, activityRelations, validateActivity } from './activities.js';

export function copyActivity(blocks, clientId) {
  validateTeaching(blocks, fail);
  let selected, identity;
  const walk = (list) => {
    for (const b of list) {
      if (b.clientId === clientId) selected = b;
      if (b.name === 'mbb/identity') identity = b.attributes;
      walk(b.innerBlocks || []);
    }
  };
  walk(blocks);
  const copy = cloneActivity(selected, identity, api().createBlock, fail);
  validateTeaching([...blocks, copy], fail);
  const source = rawMarkdown([copy]);
  checkSource(source);
  return { source, blocks: [copy] };
}
export function createActivity(component, version) {
  const id =
    'activity-' +
    [...crypto.getRandomValues(new Uint8Array(12))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
  const source = globalThis.MarkBridgeComponentAuthors.create(component, version, id),
    blocks = toBlocks(source);
  if (
    blocks.length !== 1 ||
    blocks[0].name !== 'mbb/component' ||
    blocks[0].attributes.id !== id ||
    blocks[0].attributes.component !== component ||
    blocks[0].attributes.componentVersion !== version ||
    blocks[0].attributes.version !== 2
  )
    fail(
      'ACTIVITY_RELATION',
      'Activity relations require a closed map of unique local static targets',
    );
  return source;
}
