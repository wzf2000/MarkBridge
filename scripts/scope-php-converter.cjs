// Build-only orchestration; PHP conversion never invokes processes.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const library = path.join(root, 'plugin/includes/php-converter');
const input = path.join(root, '.php-build/input');
const output = path.join(library, 'scoped');
fs.rmSync(input, { recursive: true, force: true });
fs.mkdirSync(input, { recursive: true });
for (const name of ['src', 'vendor', 'composer.json', 'composer.lock'])
  fs.cpSync(path.join(library, name), path.join(input, name), { recursive: true });
fs.rmSync(output, { recursive: true, force: true });
cp.execFileSync(
  'php',
  [
    path.join(root, 'tools/php-scoper/vendor/bin/php-scoper'),
    'add-prefix',
    '--config',
    path.join(root, 'tools/php-scoper/scoper.inc.php'),
    '--output-dir',
    output,
    '--force',
    '--no-interaction',
  ],
  { cwd: input, stdio: 'inherit' },
);
// PHP-Scoper requires Composer's metadata/classmap to be regenerated afterwards.
cp.execFileSync(
  'composer',
  [
    'dump-autoload',
    '--working-dir=' + output,
    '--classmap-authoritative',
    '--no-dev',
    '--no-interaction',
    '--no-plugins',
    '--no-scripts',
  ],
  { cwd: root, stdio: 'inherit' },
);
cp.execFileSync('php', [path.join(root, 'scripts/build-scoped-autoload.php')], {
  cwd: root,
  stdio: 'inherit',
});
const inputs = [
  ...fs
    .readdirSync(path.join(library, 'src'))
    .filter((name) => name.endsWith('.php'))
    .map((name) => 'plugin/includes/php-converter/src/' + name),
  'plugin/includes/php-converter/composer.json',
  'plugin/includes/php-converter/composer.lock',
  'tools/php-scoper/composer.json',
  'tools/php-scoper/composer.lock',
  'tools/php-scoper/scoper.inc.php',
  'scripts/scope-php-converter.cjs',
  'scripts/build-scoped-autoload.php',
];
const digests = Object.fromEntries(
  inputs.sort().map((name) => [
    name,
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(root, name)))
      .digest('hex'),
  ]),
);
fs.writeFileSync(path.join(output, 'build-inputs.json'), JSON.stringify(digests, null, 2) + '\n');
cp.execFileSync('php', [path.join(root, 'scripts/build-php-converter.php')], {
  cwd: root,
  stdio: 'inherit',
});
