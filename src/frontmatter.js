import { teachingJSON } from './teaching.js';
export const frontmatterFields = [
  'title',
  'excerpt',
  'slug',
  'status',
  'categories',
  'tags',
  'featured_media',
];
const bytes = (text) => new TextEncoder().encode(text).length;
const blank = (text) => !text.replace(/[\p{White_Space}\uFEFF]/gu, '');
export function parseFrontmatter(source, fail) {
  const lines = source.match(/[^\n]*(?:\n|$)/g) || [];
  if (!/^---\r?\n$/.test(lines[0] || '') || !/^markbridge:/.test(lines[1] || '')) return null;
  if (!/^markbridge: 1\r?\n$/.test(lines[1]))
    fail('FRONTMATTER_VERSION', 'FrontMatter 版本必须为 1');
  let raw = lines[0] + lines[1];
  const proposal = {};
  let closed = false;
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].replace(/\r?\n$/, '');
    raw += lines[i];
    if (bytes(raw) > 16384) fail('FRONTMATTER_LIMIT', 'FrontMatter 头最多 16 KiB');
    if (line === '---') {
      closed = true;
      break;
    }
    const match = /^([a-z_]+): ([^\r\n]+)$/.exec(line);
    if (!match || !frontmatterFields.includes(match[1]) || Object.hasOwn(proposal, match[1]))
      fail('FRONTMATTER_FIELD', 'FrontMatter 字段未知、重复或不是单行 JSON');
    const key = match[1];
    let value;
    try {
      value = JSON.parse(match[2]);
    } catch {
      fail('FRONTMATTER_VALUE', 'FrontMatter 值必须是合法 JSON');
    }
    if (key === 'featured_media') {
      if (!/^(?:0|[1-9]\d*)$/.test(match[2]) || !Number.isSafeInteger(value))
        fail('FRONTMATTER_VALUE', '特色图片需为非负安全整数');
    } else if (key === 'categories' || key === 'tags') {
      if (
        !Array.isArray(value) ||
        value.length > 100 ||
        new Set(value).size !== value.length ||
        value.some((slug) => typeof slug !== 'string' || !/^[a-z0-9%_-]{1,200}$/.test(slug))
      )
        fail('FRONTMATTER_VALUE', '分类和标签需为最多 100 个不重复的现有 term slug');
    } else {
      if (typeof value !== 'string' || /[\uD800-\uDFFF\x00]/u.test(value))
        fail('FRONTMATTER_VALUE', 'FrontMatter 字符串需为有效 Unicode');
      if (
        key === 'title' &&
        (blank(value) || [...value].length > 200 || /[\x00-\x1f\x7f]/.test(value))
      )
        fail('FRONTMATTER_VALUE', '标题需为 1–200 字符的单行文字');
      if (
        key === 'excerpt' &&
        (bytes(value) > 8192 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
      )
        fail('FRONTMATTER_VALUE', '摘要最多 8 KiB，不能含非法控制字符');
      if (
        key === 'slug' &&
        ([...value].length > 200 || /[\p{White_Space}\uFEFF<>\\/\x00-\x1f\x7f]/u.test(value))
      )
        fail('FRONTMATTER_VALUE', 'slug 需为最多 200 字符的单行路径名称');
      if (key === 'status' && !['draft', 'pending', 'publish', 'private'].includes(value))
        fail('FRONTMATTER_VALUE', 'FrontMatter 状态非法');
    }
    proposal[key] = value;
  }
  if (!closed) fail('FRONTMATTER_SYNTAX', 'FrontMatter 缺少结束分隔线');
  return { raw, body: source.slice(raw.length), proposal };
}
export function validateFrontmatter(blocks, fail) {
  let found = false;
  function walk(items, top = false) {
    items.forEach((block, index) => {
      if (block.name === 'mbb/frontmatter') {
        const attrs = block.attributes;
        if (block.isValid === false || !top || index !== 0 || found || block.innerBlocks?.length)
          fail('FRONTMATTER_STRUCTURE', 'FrontMatter 只能是唯一的第一个顶层区块');
        found = true;
        if (
          !attrs ||
          Object.keys(attrs).length !== 2 ||
          attrs.version !== 1 ||
          typeof attrs.raw !== 'string'
        )
          fail('FRONTMATTER_ATTRIBUTES', 'FrontMatter 属性只能包含 version:1 和 raw');
        const parsed = parseFrontmatter(attrs.raw, fail);
        if (!parsed || parsed.body)
          fail('FRONTMATTER_ATTRIBUTES', 'raw 必须只包含完整 FrontMatter 头');
      }
      walk(block.innerBlocks || []);
    });
  }
  walk(blocks, true);
}
export function validateFrontmatterSerialized(serialized, fail) {
  for (const match of serialized.matchAll(
    /<!-- wp:mbb\/frontmatter(?: (\{[\s\S]*?\}))? (?:\/)?-->/g,
  )) {
    const attrs = teachingJSON(match[1] || '{}', fail);
    validateFrontmatter([{ name: 'mbb/frontmatter', attributes: attrs, innerBlocks: [] }], fail);
  }
}
export function registerFrontmatter() {
  if (wp.blocks.getBlockType('mbb/frontmatter')) return;
  wp.blocks.registerBlockType('mbb/frontmatter', {
    apiVersion: 3,
    title: '文档元数据提案',
    category: 'text',
    attributes: {
      version: { type: 'number' },
      raw: { type: 'string' },
    },
    supports: { html: false, reusable: false },
    edit: ({ attributes, setAttributes }) => {
      wp.element.useEffect(() => {
        if (attributes.version === undefined && attributes.raw === undefined)
          setAttributes({ version: 1, raw: '---\nmarkbridge: 1\n---\n' });
      }, []);
      let error = '';
      try {
        validateFrontmatter(
          [{ name: 'mbb/frontmatter', attributes, innerBlocks: [] }],
          (code, message) => {
            throw Error(message);
          },
        );
      } catch (e) {
        error = e.message;
      }
      return wp.element.createElement(
        'div',
        wp.blockEditor.useBlockProps(),
        wp.element.createElement(
          'p',
          {},
          '元数据提案：修改此头不会自动更改文章设置。请在编辑桥中逐项选择、重新预览并确认。',
        ),
        wp.element.createElement(wp.components.TextareaControl, {
          label: 'FrontMatter 原始头',
          value: attributes.raw || '',
          onChange: (raw) => setAttributes({ raw }),
        }),
        error ? wp.element.createElement('p', { role: 'alert' }, error) : null,
      );
    },
    save: () =>
      wp.element.createElement('div', {
        className: 'wp-block-mbb-frontmatter',
        'data-mbb-generated': '',
      }),
  });
}
