// Inspect actual owned source calls, not an extraction-only view. Content contracts are explicit exceptions.
const fs = require('node:fs');
const path = require('node:path');
const parse = require('prettier/plugins/babel').parsers.babel.parse;
const root = path.resolve(__dirname, '..');
const messages = JSON.parse(
  fs.readFileSync(path.join(root, 'plugin/languages/messages.json'), 'utf8'),
);
const plurals = JSON.parse(
  fs.readFileSync(path.join(root, 'plugin/languages/plurals.json'), 'utf8'),
);
const keys = new Set([
  ...Object.keys(messages),
  ...plurals.flatMap((entry) => [entry.single, entry.plural]),
]);
const exceptions = {
  'src/teaching.js': ['原代码', '新代码', '标题'], // Existing initial attributes, authored once; never locale-dependent.
  'src/code-tabs.js': ['代码'], // Fixed persisted fallback caption mirrored by the PHP converter.
  'src/block-adapters.js': ['静态适配参数尚未应用'], // Existing save fallback HTML contract.
  'plugin/teaching.js': ['代码'], // Author-facing fallback shared with the persisted title; display enhancement handles chrome separately.
  'plugin/includes/php-converter/src/Converter.php': ['代码'],
};
const ignored = new Set(['vendor', 'scoped', 'languages']);
const files = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(file);
    return /\.(js|php)$/.test(file) &&
      !/-[a-f0-9]{12}\./.test(file) &&
      !/^plugin\/(kernel|emoji)\.js$/.test(path.relative(root, file))
      ? [file]
      : [];
  });
let count = 0;
function requireMessage(value, file) {
  if (typeof value === 'string' && !keys.has(value))
    throw Error('Missing localization entry in ' + file + ': ' + value);
  count++;
}
for (const file of [...files(path.join(root, 'src')), ...files(path.join(root, 'plugin'))]) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const source = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.js')) {
    const ast = parse(source);
    function walk(node, parents = []) {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'CallExpression' &&
        ['T', 'translate'].includes(node.callee?.name) &&
        node.arguments[0]?.type === 'StringLiteral'
      )
        requireMessage(node.arguments[0].value, relative);
      if (node.type === 'CallExpression' && node.callee?.name === 'N')
        node.arguments.slice(0, 2).forEach((arg) => requireMessage(arg.value, relative));
      if (node.type === 'StringLiteral') {
        const value = node.value;
        const isError = parents.some(
          (parent) =>
            (parent.type === 'CallExpression' &&
              ['fail', 'reject'].includes(parent.callee?.name)) ||
            (parent.type === 'NewExpression' &&
              ['ConversionError', 'MergeError'].includes(parent.callee?.name)),
        );
        if (isError && /[A-Za-z].* /.test(value)) requireMessage(value, relative);
        if (/\p{Script=Han}/u.test(value) && !(exceptions[relative] || []).includes(value)) {
          const engineDictionary =
            relative === 'plugin/math-engine.js' &&
            parents.some(
              (parent) =>
                parent.type === 'VariableDeclarator' && parent.id?.name === 'engineMessages',
            ) &&
            Object.values(messages).includes(value);
          if (!engineDictionary)
            throw Error('Unreviewed Chinese source literal in ' + relative + ': ' + value);
        }
        const parent = parents.at(-1);
        const immutable = parents.some(
          (entry) =>
            entry.type === 'ObjectProperty' &&
            ['save', 'default', 'attributes'].includes(entry.key?.name),
        );
        const label =
          /[a-zA-Z]/.test(value) &&
          !['MarkBridge', 'MathJax', 'TeX', 'JSON', 'slug'].includes(value);
        if (
          !immutable &&
          label &&
          parent?.type === 'AssignmentExpression' &&
          parent.right === node &&
          parent.left?.type === 'MemberExpression' &&
          ['textContent', 'title', 'ariaLabel'].includes(parent.left.property?.name)
        )
          requireMessage(value, relative);
        if (!immutable && label && parent?.type === 'CallExpression') {
          const name = parent.callee?.name;
          if (
            (['el', 'e'].includes(name) && parent.arguments.indexOf(node) >= 2) ||
            (name === 'button' && parent.arguments[0] === node) ||
            (parent.callee?.property?.name === 'setAttribute' &&
              ['aria-label', 'title', 'placeholder'].includes(parent.arguments[0]?.value) &&
              parent.arguments[1] === node)
          )
            requireMessage(value, relative);
        }
        if (
          parent?.type === 'ObjectProperty' &&
          ['title', 'label', 'description', 'placeholder'].includes(parent.key?.name) &&
          /[A-Za-z].* /.test(value) &&
          !keys.has(value) &&
          !parents.some(
            (entry) =>
              entry.type === 'ObjectProperty' &&
              ['default', 'attributes'].includes(entry.key?.name),
          )
        )
          throw Error('Unlocalized UI label in ' + relative + ': ' + value);
      }
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'comments', 'tokens'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach((item) => walk(item, [...parents, node]));
        else if (value && typeof value === 'object') walk(value, [...parents, node]);
      }
    }
    walk(ast);
  } else {
    for (const match of source.matchAll(/mbb_t\(\s*'((?:\\.|[^'\\])*)'/g))
      requireMessage(match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'), relative);
    for (const match of source.matchAll(
      /(?:new ConversionError|self::fail)\(\s*'[^']*'\s*,\s*'((?:\\.|[^'\\])*)'/g,
    ))
      requireMessage(match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'), relative);
  }
}
console.log(
  'Localization coverage verified against',
  count,
  'actual source call sites and explicit persisted exceptions.',
);
