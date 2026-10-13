import { translate as T, format as F, translateError as E } from './i18n.js';
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
    fail('FRONTMATTER_VERSION', 'The FrontMatter version must be 1');
  let raw = lines[0] + lines[1];
  const proposal = {};
  let closed = false;
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].replace(/\r?\n$/, '');
    raw += lines[i];
    if (bytes(raw) > 16384) fail('FRONTMATTER_LIMIT', 'A FrontMatter header is limited to 16 KiB');
    if (line === '---') {
      closed = true;
      break;
    }
    const match = /^([a-z_]+): ([^\r\n]+)$/.exec(line);
    if (!match || !frontmatterFields.includes(match[1]) || Object.hasOwn(proposal, match[1]))
      fail(
        'FRONTMATTER_FIELD',
        'FrontMatter fields are unknown, duplicated, or not single-line JSON',
      );
    const key = match[1];
    let value;
    try {
      value = JSON.parse(match[2]);
    } catch {
      fail('FRONTMATTER_VALUE', 'FrontMatter values must be valid JSON');
    }
    if (key === 'featured_media') {
      if (!/^(?:0|[1-9]\d*)$/.test(match[2]) || !Number.isSafeInteger(value))
        fail('FRONTMATTER_VALUE', 'The featured image must be a nonnegative safe integer');
    } else if (key === 'categories' || key === 'tags') {
      if (
        !Array.isArray(value) ||
        value.length > 100 ||
        new Set(value).size !== value.length ||
        value.some((slug) => typeof slug !== 'string' || !/^[a-z0-9%_-]{1,200}$/.test(slug))
      )
        fail(
          'FRONTMATTER_VALUE',
          'Categories and tags require at most 100 unique existing term slugs',
        );
    } else {
      if (typeof value !== 'string' || /[\uD800-\uDFFF\x00]/u.test(value))
        fail('FRONTMATTER_VALUE', 'FrontMatter strings must be valid Unicode');
      if (
        key === 'title' &&
        (blank(value) || [...value].length > 200 || /[\x00-\x1f\x7f]/.test(value))
      )
        fail('FRONTMATTER_VALUE', 'The title must be single-line text of 1–200 characters');
      if (
        key === 'excerpt' &&
        (bytes(value) > 8192 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
      )
        fail(
          'FRONTMATTER_VALUE',
          'The excerpt is limited to 8 KiB and must not contain invalid control characters',
        );
      if (
        key === 'slug' &&
        ([...value].length > 200 || /[\p{White_Space}\uFEFF<>\\/\x00-\x1f\x7f]/u.test(value))
      )
        fail(
          'FRONTMATTER_VALUE',
          'The slug must be a single-line path name of at most 200 characters',
        );
      if (key === 'status' && !['draft', 'pending', 'publish', 'private'].includes(value))
        fail('FRONTMATTER_VALUE', 'Invalid FrontMatter status');
    }
    proposal[key] = value;
  }
  if (!closed) fail('FRONTMATTER_SYNTAX', 'The FrontMatter closing delimiter is missing');
  return { raw, body: source.slice(raw.length), proposal };
}
export function validateFrontmatter(blocks, fail) {
  let found = false;
  function walk(items, top = false) {
    items.forEach((block, index) => {
      if (block.name === 'mbb/frontmatter') {
        const attrs = block.attributes;
        if (block.isValid === false || !top || index !== 0 || found || block.innerBlocks?.length)
          fail('FRONTMATTER_STRUCTURE', 'FrontMatter must be the unique first top-level block');
        found = true;
        if (
          !attrs ||
          Object.keys(attrs).length !== 2 ||
          attrs.version !== 1 ||
          typeof attrs.raw !== 'string'
        )
          fail(
            'FRONTMATTER_ATTRIBUTES',
            'FrontMatter attributes may only contain version:1 and raw',
          );
        const parsed = parseFrontmatter(attrs.raw, fail);
        if (!parsed || parsed.body)
          fail('FRONTMATTER_ATTRIBUTES', 'raw must contain only the complete FrontMatter header');
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
    title: T('Document metadata proposal'),
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
        error = E(e);
      }
      return wp.element.createElement(
        'div',
        wp.blockEditor.useBlockProps(),
        wp.element.createElement(
          'p',
          {},
          T(
            'Metadata proposal: editing this header does not automatically change article settings. Select fields in the editing bridge, preview again, and confirm.',
          ),
        ),
        wp.element.createElement(wp.components.TextareaControl, {
          label: T('Raw FrontMatter header'),
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
