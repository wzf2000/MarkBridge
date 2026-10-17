import { translate as T } from './i18n.js';
import patterns from '../plugin/writing-patterns.json';
// Deliberately complete block fragments only. Never infer inline dollar math or rewrite code bytes.
export function markdownSnippet(text) {
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).length > 65536 ||
    text.includes('\0')
  )
    return null;
  const value = text.replace(/\r\n?/g, '\n').trim();
  const lines = value.split('\n');
  if (
    lines.length >= 3 &&
    /^\$\$$/.test(lines[0]) &&
    lines.at(-1) === '$$' &&
    lines.slice(1, -1).every((line) => line !== '$$') &&
    /[A-Za-z\\]/.test(lines.slice(1, -1).join('\n'))
  )
    return { kind: 'math', source: text };
  const fence = /^(\`{3,}|~{3,})([A-Za-z0-9_+.-]*)$/.exec(lines[0]);
  if (
    fence &&
    lines.length >= 3 &&
    lines.at(-1) === fence[1] &&
    !lines
      .slice(1, -1)
      .some((line) => new RegExp('^' + fence[1][0] + '{' + fence[1].length + ',}\\s*$').test(line))
  )
    return { kind: 'code', source: text };
  if (lines.length >= 2 && lines.every((line) => /^(?:[-+*] |\d{1,9}\. )\S/.test(line)))
    return { kind: 'list', source: text };
  return null;
}
export const writingPatterns = patterns;
export function instantiateWritingPattern(id, instance = null) {
  const pattern = patterns.find((p) => p.id === id);
  if (!pattern) throw Error('Unknown writing pattern');
  if (!pattern.instantiate) return pattern.source;
  instance ||=
    'pattern-' +
    [...crypto.getRandomValues(new Uint8Array(12))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,39}$/.test(instance))
    throw Error('Invalid writing pattern instance');
  // Only explicit template-owned tokens are instantiated. External reference identities stay intact.
  return pattern.source.replaceAll('{{instance}}', instance);
}
export function registerWritingPatterns(toBlocks) {
  const name = 'mbb/writing-pattern';
  if (wp.blocks.getBlockType(name)) return;
  wp.blocks.registerBlockType(name, {
    apiVersion: 3,
    title: T('Writing pattern'),
    category: 'text',
    attributes: { pattern: { type: 'string' } },
    supports: { inserter: false, html: false, reusable: false },
    edit({ attributes, clientId }) {
      const registry = wp.data.useRegistry(),
        initialized = wp.element.useRef(false);
      wp.element.useEffect(() => {
        if (initialized.current) return;
        const current = registry.select('core/block-editor').getBlock(clientId);
        if (!current || current.name !== name) return;
        initialized.current = true;
        try {
          const blocks = toBlocks(instantiateWritingPattern(attributes.pattern));
          const dispatch = registry.dispatch('core/block-editor');
          dispatch.__unstableMarkNextChangeAsNotPersistent();
          dispatch.replaceBlocks(clientId, blocks);
        } catch {
          initialized.current = false;
        }
      }, [clientId, attributes.pattern, registry]);
      return wp.element.createElement(
        'p',
        wp.blockEditor.useBlockProps(),
        T('Preparing writing pattern…'),
      );
    },
    save() {
      return null;
    },
  });
}

export function writingIndex(blocks) {
  const items = [];
  const visit = (list, path = []) =>
    list.forEach((block, n) => {
      const a = block.attributes || {},
        p = [...path, n];
      const category =
        block.name === 'mbb/math'
          ? 'math'
          : block.name === 'core/image' || block.name === 'mbb/gallery'
            ? 'figure'
            : block.name === 'core/table'
              ? 'table'
              : block.name === 'mbb/statement'
                ? 'statement'
                : block.name === 'mbb/bibliography'
                  ? 'bibliography'
                  : block.name === 'mbb/object'
                    ? a.kind
                    : [
                          'mbb/component',
                          'mbb/steps',
                          'mbb/step',
                          'mbb/collapse',
                          'mbb/code-tabs',
                          'mbb/code-compare',
                        ].includes(block.name)
                      ? 'teaching'
                      : null;
      if (category)
        items.push({
          category,
          clientId: block.clientId,
          path: p,
          id: a.id || '',
          title: a.title || a.caption || a.tex || a.component || '',
          name: block.name,
          renameType: ['mbb/object', 'mbb/statement'].includes(block.name) ? 'label' : null,
        });
      if (block.name === 'mbb/bibliography')
        for (const entry of a.entries || [])
          items.push({
            category: 'bibliography',
            clientId: block.clientId,
            path: p,
            id: entry.key,
            title: entry.title,
            name: block.name,
            renameType: 'key',
          });
      visit(block.innerBlocks || [], p);
    });
  visit(blocks);
  return items;
}
export function writingAdvice(blocks) {
  const issues = [];
  const visit = (list) =>
    list.forEach((block) => {
      const a = block.attributes || {};
      if (block.name === 'core/image' && !String(a.alt || '').trim())
        issues.push({
          severity: 'advice',
          clientId: block.clientId,
          message: T(
            'Image alternative text is empty. Review whether the image needs an explanation.',
          ),
        });
      if (block.name === 'mbb/component' && !(block.innerBlocks || []).length)
        issues.push({
          severity: 'error',
          clientId: block.clientId,
          message: T('The teaching component needs static content before saving.'),
        });
      visit(block.innerBlocks || []);
    });
  visit(blocks);
  return issues.slice(0, 64);
}
