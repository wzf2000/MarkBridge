import { translate as T } from './i18n.js';
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
export { default as writingPatterns } from '../plugin/writing-patterns.json';
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
