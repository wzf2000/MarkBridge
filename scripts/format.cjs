const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const prettier = require('prettier');
const beautify = require('js-beautify').html;
const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
const ignored = new Set([
  '.git',
  '.venv',
  'node_modules',
  'vendor',
  'licenses',
  'dist',
  '.runtime',
  '__pycache__',
]);
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(file);
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    if (/^plugin\/(kernel\.js|emoji\.js|assets\.json|.*-[a-f0-9]{12}\.)/.test(relative)) return [];
    return /\.(php|js|cjs|css|json|md|html|svg|yml|yaml)$/.test(file) ? [file] : [];
  });
}
(async () => {
  let changed = 0;
  for (const file of files(root)) {
    const input = fs.readFileSync(file, 'utf8');
    const output = file.endsWith('.html')
      ? beautify(input, {
          indent_size: 2,
          wrap_line_length: 100,
          end_with_newline: true,
          preserve_newlines: true,
        })
      : await prettier.format(input, {
          ...(await prettier.resolveConfig(file)),
          filepath: file,
          ...(file.endsWith('.svg') ? { parser: 'html' } : {}),
        });
    if (input === output) continue;
    changed++;
    if (check) console.error(path.relative(root, file));
    else fs.writeFileSync(file, output);
  }
  const python = process.env.MARKBRIDGE_PYTHON || path.join(root, '.venv', 'bin', 'python');
  const black = cp.spawnSync(
    python,
    ['-m', 'black', ...(check ? ['--check'] : []), 'scripts', 'tests'],
    { cwd: root, stdio: 'inherit' },
  );
  if (black.error)
    console.error('Install requirements-dev.txt in .venv, or set MARKBRIDGE_PYTHON.');
  if ((check && changed) || black.status !== 0) process.exitCode = 1;
  console.log(
    `${check ? 'Checked' : 'Formatted'} first-party source; ${changed} files ${check ? 'need changes' : 'updated'}.`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
