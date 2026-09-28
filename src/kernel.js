import MarkdownIt from 'markdown-it';
import footnotePlugin from 'markdown-it-footnote';
import { registerFootnotes } from './footnotes.js';
import { InlineMathEdit, installInlineMathDecorations } from './inline-math-editor.js';
export const VERSION = '0.2.0';
export class ConversionError extends Error {
  constructor(code, message, location = '') {
    super(message);
    this.name = 'ConversionError';
    this.code = code;
    this.location = location;
  }
}
const canonical = (s) => {
  const t = document.createElement('template');
  t.innerHTML = s;
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
  if (last === end) fail('UNCLOSED_MATH', '块公式缺少结束 $$', `line:${start + 1}`);
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
  if (state.src[start + 1] === '$') fail('MATH_DELIMITER', '块公式的 $$ 必须独占一行');
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
    fail('FOOTNOTE_LABEL', '脚注名称需为1–64位字母、数字、下划线或连字符', location);
  return label;
};
md.use(footnotePlugin);
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
  const definitions = new Set();
  const references = new Set();
  let definition = null;
  for (const token of state.tokens) {
    if (token.type === 'footnote_reference_open') {
      const label = validFootnoteLabel(token.meta?.label);
      if (definitions.has(label)) fail('FOOTNOTE_DUPLICATE', `重复的脚注定义 ${label}`);
      definitions.add(label);
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
        if (definition) fail('FOOTNOTE_NESTED', '脚注定义不能包含脚注引用');
        references.add(label);
      } else if (child.type === 'text' && /\[\^[^\]\s]+\]/u.test(child.content)) {
        fail('FOOTNOTE_MISSING', '脚注引用缺少定义');
      }
    }
  }
  for (const label of definitions)
    if (!references.has(label)) fail('FOOTNOTE_ORPHAN', `脚注定义 ${label} 未被引用`);
  state.env.mbbDefinitionOrder = [...definitions];
});
function api() {
  if (!globalThis.wp?.blocks) fail('ENVIRONMENT', '需要真实WordPress区块运行时');
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
    fail('UNSAFE_URL', '不允许的URL协议');
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
  if (/<!|<\/?(?:html|head|body)\b/i.test(html)) fail('UNSAFE_HTML', '不允许HTML文档容器');
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  const walk = (node) => {
    if (node.nodeType === 3) return;
    if (node.nodeType !== 1) fail('UNSAFE_HTML', 'HTML注释或非文本节点不受支持');
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
    if (!tags.has(tag) && !math) fail('UNSUPPORTED_HTML', `不支持HTML标签 ${tag}`);
    for (const a of node.attributes) {
      if (
        !(
          math
            ? ['class', 'data-mbb-tex']
            : footnote
              ? ['class', 'data-mbb-footnote']
              : attrs[tag] || []
        ).includes(a.name)
      )
        fail('UNSAFE_HTML_ATTRIBUTE', `不支持属性 ${tag}.${a.name}`);
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
            fail('UNSAFE_STYLE', '不支持或不安全的样式');
        }
      if (a.name === 'class' && !math && !footnote && a.value !== 'wzf-exercise-hint')
        fail('UNSAFE_HTML_ATTRIBUTE', '不支持的显示类名');
      if (a.name === 'color' && !/^(?:[a-z]+|#[0-9a-f]{3,8})$/i.test(a.value))
        fail('UNSAFE_STYLE', '不安全的颜色');
      if (['width', 'height'].includes(a.name) && !/^\d+(?:\.\d+)?(?:px|%)?$/.test(a.value))
        fail('UNSAFE_STYLE', '不安全的图片尺寸');
    }
    if (math && node.textContent !== '$' + node.getAttribute('data-mbb-tex') + '$')
      fail('MATH_MISMATCH', '行内公式源码与显示文本不一致');
    if (footnote) {
      const label = validFootnoteLabel(node.getAttribute('data-mbb-footnote'));
      if (node.textContent !== `[^${label}]` || node.children.length)
        fail('FOOTNOTE_MISMATCH', '脚注标记与名称不一致');
    }
    for (const c of node.childNodes) walk(c);
  };
  // DOMParser can relocate forbidden head nodes; inspect the entire parsed document.
  if (doc.head.childNodes.length) fail('UNSAFE_HTML', '不允许HTML头部节点');
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
const loc = (node) => (node.token.map ? `line:${node.token.map[0] + 1}` : node.token.type);
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
    'mbb_inline_math',
    'footnote_ref',
  ]);
  for (const t of token.children || []) {
    if (!allowed.has(t.type))
      fail('UNSUPPORTED_INLINE', `不支持行内语法 ${t.type}`, loc({ token }));

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
    fail('INVALID_AST', '段落解析异常', loc(node));
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
function convert(nodes, legacyTasks = false) {
  return nodes.map((node) => {
    const t = node.token;
    switch (t.type) {
      case 'paragraph_open': {
        const content = paragraph(node);
        const parts = node.children[0].token.children;
        if (/^<a id="[^"]+"><\/a>$/.test(content)) return makeHTML(content);
        if (/<a id="[^"]+"><\/a>/.test(content))
          fail('INLINE_ANCHOR', '空锚点需独立成段，避免编辑器丢失标签', loc(node));
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
          fail('CODE_INFO', '代码语言标记不支持额外参数', loc(node));
        return make('mbb/code', { code: t.content, language: t.info.trim() });
      case 'mbb_math':
        return make('mbb/math', { tex: t.content });
      case 'html_block': {
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
        return make('core/quote', {}, convert(node.children, legacyTasks));
      case 'footnote_block_open':
        return make(
          'mbb/footnotes',
          {},
          node.children.map((note) => {
            if (note.token.type !== 'footnote_open')
              fail('FOOTNOTE_STRUCTURE', '脚注定义结构不受支持', loc(note));
            const label = validFootnoteLabel(note.token.meta?.label);
            return make('mbb/footnote', { label }, convert(note.children, legacyTasks));
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
                ? make('mbb/task-item', task, convert(item.children.slice(1), legacyTasks))
                : make('mbb/list-item', {}, convert(item.children, legacyTasks));
            }),
          );
        const items = node.children.map((item) => {
          if (
            item.token.type !== 'list_item_open' ||
            item.children[0]?.token.type !== 'paragraph_open'
          )
            fail('LIST_STRUCTURE', '列表项结构不受支持', loc(item));
          if (legacyTasks && /^\[[ xX]\]\s/.test(item.children[0].children[0].token.content))
            fail('TASK_LIST', '任务列表暂不支持', loc(item));
          const content = paragraph(item.children[0]);
          const nested = item.children.slice(1);
          return make('core/list-item', { content }, convert(nested, legacyTasks));
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
        fail('UNSUPPORTED_BLOCK', `不支持Markdown节点 ${t.type}`, loc(node));
    }
  });
}
function checkSource(source) {
  if (typeof source !== 'string' || source.length > 500000)
    fail('INPUT_LIMIT', '原文必须是字符串且不超过500000字符');
  if (source.includes('\0')) fail('INVALID_INPUT', '原文包含NUL');
}
// Normalize legacy display delimiters without scanning fenced or inline code.
function displayBoundaries(source) {
  const ignored = new Set();
  for (const t of boundaryMD.parse(source, {}))
    if (['fence', 'code_block'].includes(t.type) && t.map)
      for (let i = t.map[0]; i < t.map[1]; i++) ignored.add(i);
  const htmlCode = [...source.matchAll(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi)].map((m) => [
    m.index,
    m.index + m[0].length,
  ]);
  const marks = [];
  let offset = 0,
    fence = null,
    code = 0,
    lineIndex = 0;
  for (const line of source.split('\n')) {
    if (ignored.has(lineIndex++)) {
      offset += line.length + 1;
      continue;
    }
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
  if (marks.length % 2) fail('UNCLOSED_MATH', '块公式缺少配对的 $$');
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
export function toBlocks(source, legacyTasks = false, legacyFootnotes = false) {
  checkSource(source);
  const normalized = displayBoundaries(source);
  if (!legacyFootnotes) {
    // The legacy link parser would treat [^id]: as an ordinary link target,
    // changing the nesting of [link[^id]](url). Mask only that definition
    // prefix while preserving other reference-style link definitions.
    const linkProbe = normalized.replace(/^([ \t]{0,3})\[\^[^\]\n]+\]:/gm, '$1MBBFOOTNOTE:');
    for (const token of legacyMD.parse(linkProbe, {})) {
      if (token.type !== 'inline') continue;
      let linkDepth = 0;
      for (const child of token.children || []) {
        if (child.type === 'image' && /\[\^[^\]\s]+\]/u.test(child.content))
          fail('FOOTNOTE_IN_LINK', '图片文字不能包含脚注引用');
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
          fail('FOOTNOTE_IN_LINK', '链接文字不能包含脚注引用');
      }
    }
  }
  const env = {};
  const tokens = (legacyFootnotes ? legacyMD : md).parse(normalized, env);
  if (legacyFootnotes && Object.keys(env.references || {}).some((x) => x.startsWith('^')))
    fail('UNSUPPORTED_FOOTNOTE', '脚注暂不支持');
  const roots = tree(tokens.filter((token) => token.type !== 'footnote_anchor'));
  const order = env.mbbDefinitionOrder || [];
  for (const root of roots)
    if (root.token.type === 'footnote_block_open')
      root.children.sort(
        (a, b) => order.indexOf(a.token.meta?.label) - order.indexOf(b.token.meta?.label),
      );
  return convert(roots, legacyTasks);
}
function textMD(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/[\\`*{}\[\]()#+\-.!_$|>]/g, '\\$&');
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
        return n.hasAttribute('data-mbb-tex')
          ? '$' + n.getAttribute('data-mbb-tex') + '$'
          : n.hasAttribute('data-mbb-footnote')
            ? '[^' + validFootnoteLabel(n.getAttribute('data-mbb-footnote')) + ']'
            : rawTag();
      default:
        fail('UNSUPPORTED_INLINE_HTML', `不支持回写行内HTML ${n.localName}`);
    }
  };
  return [...root.childNodes].map(walk).join('');
}
function taskItemMarkdown(item, at, includeInner = true) {
  const a = item.attributes;
  if (typeof a.content !== 'string' || typeof a.checked !== 'boolean')
    fail('TASK_STRUCTURE', '任务项状态或内容非法', at);
  const first = '[' + (a.checked ? 'x' : ' ') + '] ' + inlineMD(a.content);
  return includeInner && item.innerBlocks.length
    ? first + '\n\n' + rawMarkdown(item.innerBlocks, at)
    : first;
}
function rawMarkdown(blocks, path = 'blocks') {
  if (path === 'blocks' && blocks.filter((b) => b.name === 'mbb/footnotes').length > 1)
    fail('FOOTNOTE_STRUCTURE', '一篇文档只能有一个脚注定义区');
  if (
    path === 'blocks' &&
    blocks.some((b, i) => b.name === 'mbb/footnotes' && i !== blocks.length - 1)
  )
    fail('FOOTNOTE_STRUCTURE', '脚注定义区必须位于文档末尾');
  return (
    blocks
      .map((b, i) => {
        const at = `${path}[${i}]`;
        if (b.isValid === false) fail('INVALID_BLOCK', '无效区块不能回写', at);
        const a = b.attributes;
        const inner = b.innerBlocks || [];
        switch (b.name) {
          case 'mbb/footnotes':
            if (
              path !== 'blocks' ||
              inner.length === 0 ||
              inner.some((n) => n.name !== 'mbb/footnote')
            )
              fail('FOOTNOTE_STRUCTURE', '脚注定义区必须在文档末尾并包含定义', at);
            return inner
              .map((note, j) => {
                const label = validFootnoteLabel(note.attributes.label, `${at}[${j}]`);
                if (!note.innerBlocks?.length) fail('FOOTNOTE_STRUCTURE', '脚注定义不能为空', at);
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
            fail('FOOTNOTE_STRUCTURE', '脚注定义只能位于脚注区', at);
          case 'core/paragraph':
            return inlineMD(a.content);
          case 'core/image':
            return inlineMD(
              '<img src="' +
                esc(a.url) +
                '" alt="' +
                esc(a.alt || '') +
                '"' +
                (a.title ? ' title="' + esc(a.title) + '"' : '') +
                '>',
            );
          case 'core/heading':
            return '#'.repeat(a.level || 2) + ' ' + inlineMD(a.content);
          case 'core/separator':
            return '---';
          case 'core/more':
            if (a.customText || a.noTeaser)
              fail('MORE_OPTIONS', '更多分隔符自定义属性暂不支持', at);
            return '<!--more-->';
          case 'mbb/code': {
            if (!/^[\w+-]*$/.test(a.language || '')) fail('CODE_INFO', '代码语言非法', at);
            if (!a.code.endsWith('\n'))
              fail('CODE_TRAILING_NEWLINE', '围栏代码必须保留结尾换行', at);
            const n = Math.max(3, ...(a.code.match(/`+/g) || []).map((x) => x.length + 1));
            const f = '`'.repeat(n);
            return f + (a.language || '') + '\n' + a.code + f;
          }
          case 'mbb/math':
            if (/(^|\n)\s*\$\$\s*(\n|$)/.test(a.tex))
              fail('MATH_DELIMITER', '公式源码含独占行分隔符', at);
            return '$$\n' + a.tex + '\n$$';
          case 'core/html': {
            const html = b.innerContent?.join('') ?? a.content;
            if (typeof html !== 'string' || inner.length)
              fail('HTML_STRUCTURE', 'HTML区块结构不受支持', at);
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
                  fail('LIST_STRUCTURE', '复杂列表包含非列表项', at);
                const marker = a.ordered ? String((a.start || 1) + j) + '. ' : '- ';
                const body =
                  item.name === 'mbb/task-item'
                    ? taskItemMarkdown(item, at)
                    : rawMarkdown(item.innerBlocks, at);
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
                if (item.name !== 'core/list-item') fail('LIST_STRUCTURE', '列表包含非列表项', at);
                const marker = a.ordered ? String((a.start || 1) + j) + '. ' : '- ';
                return (
                  marker +
                  inlineMD(item.attributes.content) +
                  (item.innerBlocks.length
                    ? (item.innerBlocks.every((x) => x.name === 'core/list') ? '\n' : '\n\n') +
                      rawMarkdown(item.innerBlocks, at)
                        .split('\n')
                        .map((l) => ' '.repeat(marker.length) + l)
                        .join('\n')
                    : '')
                );
              })
              .join('\n');
          case 'core/table': {
            if (a.head?.length !== 1 || a.foot?.length)
              fail('TABLE_STRUCTURE', '表格必须有一个表头且无表尾', at);
            const rows = [...a.head, ...a.body];
            const width = a.head[0].cells.length;
            if (rows.some((r) => r.cells.length !== width))
              fail('TABLE_STRUCTURE', '表格列数不一致', at);
            const row = (r) =>
              '| ' + r.cells.map((c) => inlineMD(c.content).replace(/\n/g, ' ')).join(' | ') + ' |';
            const align =
              '| ' +
              a.head[0].cells
                .map((c) => ({ left: ':---', center: ':---:', right: '---:' })[c.align] || '---')
                .join(' | ') +
              ' |';
            return [row(a.head[0]), align, ...a.body.map(row)].join('\n');
          }
          default:
            fail('UNSUPPORTED_BLOCK', `区块 ${b.name} 不支持转回Markdown`, at);
        }
      })
      .join('\n\n') + '\n'
  );
}
export function toMarkdown(blocks, context) {
  if (context?.origin !== 'markdown_import')
    fail('ORIGIN_REQUIRED', '只有明确Markdown来源文档允许反向转换');
  const result = rawMarkdown(blocks);
  // Fail closed if formatting, attributes, nesting, or inline constructs would be lost.
  const original = api().serialize(blocks);
  const regenerated = api().serialize(toBlocks(result));
  if (canonical(original) !== canonical(regenerated)) {
    let i = 0;
    while (original[i] === regenerated[i] && i < original.length) i++;
    const e = new ConversionError(
      'LOSSY_ROUNDTRIP',
      '转换无法保留当前区块全部内容或属性，已阻止回写',
      `serialized:${i}`,
    );
    e.detail = {
      original: original.slice(Math.max(0, i - 60), i + 160),
      regenerated: regenerated.slice(Math.max(0, i - 60), i + 160),
    };
    throw e;
  }
  return result;
}
export function importDocument(source, documentId) {
  if (typeof documentId !== 'string' || !documentId.trim())
    fail('DOCUMENT_ID', '需要稳定document_id');
  const blocks = toBlocks(source);
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
function snapshotKind(source, serialized) {
  for (const [legacyTasks, legacyFootnotes] of [
    [false, false],
    [true, true],
    [false, true],
  ]) {
    try {
      if (api().serialize(toBlocks(source, legacyTasks, legacyFootnotes)) === serialized)
        return legacyFootnotes ? 'legacy' : 'current';
    } catch (_error) {
      // Only an exact complete block snapshot can use the historical parser.
    }
  }
  return null;
}
export function importPairedDocument(source, serialized, documentId) {
  if (typeof documentId !== 'string' || !documentId.trim())
    fail('DOCUMENT_ID', '需要稳定document_id');
  if (typeof serialized !== 'string' || !snapshotKind(source, serialized))
    fail('SNAPSHOT_MISMATCH', '源快照与区块快照不匹配');
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
  if (
    document?.schema !== 1 ||
    !['0.1.2', VERSION].includes(document.converter) ||
    document.origin !== 'markdown_import'
  )
    fail('DOCUMENT_MODEL', '不支持的来源或模型版本');
  const kind = snapshotKind(document.source, document.serialized);
  if (!kind) fail('SNAPSHOT_MISMATCH', '源快照与区块快照不匹配');
  if (kind === 'legacy' && canonical(serialized) === canonical(document.serialized))
    return document.source;
  const blocks = api().parse(serialized);
  const normalized = toMarkdown(blocks, document);
  return canonical(serialized) === canonical(document.serialized) ? document.source : normalized;
}
function MathPreview({ tex, display = false }) {
  const el = wp.element.createElement;
  const [html, setHTML] = wp.element.useState('');
  const [error, setError] = wp.element.useState('');
  const [retry, setRetry] = wp.element.useState(0);
  wp.element.useEffect(() => {
    let active = true;
    setHTML('');
    setError('');
    const timer = setTimeout(() => {
      if (!globalThis.MBB_MATH) return;
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
    { className: 'mbb-math-preview', contentEditable: false },
    el('small', {}, '公式预览（不写入正文）'),
    error
      ? el(
          wp.element.Fragment,
          {},
          el('code', {}, error),
          el('button', { type: 'button', onClick: () => setRetry((v) => v + 1) }, '重试公式排版'),
        )
      : html
        ? el('div', { dangerouslySetInnerHTML: { __html: html } })
        : el('code', {}, tex),
  );
}
export function register() {
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
      title: '多段落列表',
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
                        label: '删除空列表',
                        onClick: () => removeBlock(clientId),
                        children: '删除空列表',
                      })
                    : el(wp.components.ToolbarButton, {
                        label: '转换为普通列表',
                        onClick: () => replaceBlock(clientId, plain),
                        children: '转换为普通列表',
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
      title: '列表项',
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
      title: '任务项',
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
              label: '已完成',
              checked: a.checked,
              onChange: (checked) => setAttributes({ checked }),
            }),
          ),
          el(wp.blockEditor.RichText, {
            tagName: 'p',
            'aria-label': '任务内容',
            value: a.content,
            onChange: (content) => setAttributes({ content }),
            placeholder: '任务内容',
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
      title: '任务列表',
      description: '插入可勾选的任务列表。',
      scope: ['inserter'],
      innerBlocks: [['mbb/task-item', { checked: false, content: '' }]],
    });
  }
  if (api().getBlockType('mbb/math')) return;
  for (const [name, field, label] of [
    ['mbb/math', 'tex', '公式源码'],
    ['mbb/code', 'code', '代码'],
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
      edit: ({ attributes, setAttributes }) =>
        el(
          'div',
          wp.blockEditor.useBlockProps(),
          field === 'code'
            ? el(wp.components.TextControl, {
                label: '语言',
                value: attributes.language,
                onChange: (language) => setAttributes({ language }),
              })
            : null,
          el(wp.components.TextareaControl, {
            label,
            value: attributes[field],
            onChange: (value) => setAttributes({ [field]: value }),
          }),
          field === 'tex' ? el(MathPreview, { tex: attributes.tex, display: true }) : null,
        ),
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
    title: '行内公式源码',
    tagName: 'span',
    className: 'mbb-math',
    attributes: { tex: 'data-mbb-tex' },
    contentEditable: false,
    edit: InlineMathEdit,
  });
  installInlineMathDecorations();
}
register();
