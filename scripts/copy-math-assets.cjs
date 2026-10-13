// Keep the locked CHTML runtime and readable font modules, without changing upstream packages.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'plugin/vendor');
const manifestFile = path.join(root, 'plugin/vendor-manifest.json');
const packages = [
  {
    source: 'mathjax',
    target: 'mathjax-4.1.3',
    paths: [
      'tex-chtml.js',
      'core.js',
      'loader.js',
      'startup.js',
      'LICENSE',
      'README.md',
      'package.json',
      'input',
      'output',
      'sre',
      'a11y',
      'adaptors',
      'ui',
    ],
  },
  {
    source: '@mathjax/mathjax-newcm-font',
    target: 'mathjax-newcm-font',
    paths: [
      'chtml.js',
      'package.json',
      'chtml',
      'mjs/chtml',
      'mjs/chtml.js',
      'mjs/chtml.d.ts',
      'mjs/chtml.js.map',
      'mjs/common.js',
      'mjs/common.d.ts',
      'mjs/common.js.map',
      'mjs/package.json',
      'def',
    ],
  },
];
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function inventory(directory, prefix, result = {}) {
  let stat;
  try {
    stat = fs.lstatSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return result;
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Non-directory vendor root');
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name),
      name = prefix + '/' + item.name;
    if (item.isDirectory()) inventory(file, name, result);
    else if (item.isFile()) result[name] = digest(fs.readFileSync(file));
    else throw new Error('Non-regular vendor entry');
  }
  return result;
}
function copy(source, target) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error('Linked upstream resource');
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source))
      copy(path.join(source, name), path.join(target, name));
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  } else throw new Error('Non-regular upstream resource');
}
function main() {
  if (fs.lstatSync(vendor).isSymbolicLink()) throw new Error('Linked vendor root');
  try {
    if (!fs.lstatSync(manifestFile).isFile()) throw new Error('Non-regular vendor manifest');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const old = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  const current = {};
  for (const spec of packages)
    inventory(path.join(vendor, spec.target), 'vendor/' + spec.target, current);
  if (JSON.stringify(Object.entries(old).sort()) !== JSON.stringify(Object.entries(current).sort()))
    throw new Error('Refusing to overwrite changed or unlisted generated math resources');
  const temporary = fs.mkdtempSync(path.join(vendor, '.mbb-math-build-'));
  const moved = [];
  let committed = false;
  try {
    const manifest = {};
    for (const spec of packages) {
      const source = path.join(root, 'node_modules', spec.source);
      if (
        JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version !== '4.1.3'
      )
        throw new Error('Math resource version differs from reviewed policy');
      for (const name of spec.paths)
        copy(path.join(source, name), path.join(temporary, spec.target, name));
      inventory(path.join(temporary, spec.target), 'vendor/' + spec.target, manifest);
    }
    for (const spec of packages) {
      const destination = path.join(vendor, spec.target),
        previous = path.join(temporary, 'old-' + spec.target);
      if (fs.existsSync(destination)) fs.renameSync(destination, previous);
      moved.push({ destination, previous });
      fs.renameSync(path.join(temporary, spec.target), destination);
    }
    const bytes =
      JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + '\n';
    fs.writeFileSync(path.join(temporary, 'vendor-manifest.json'), bytes);
    fs.renameSync(path.join(temporary, 'vendor-manifest.json'), manifestFile);
    committed = true;
    console.log(
      'Locked CHTML runtime and readable font modules:',
      Object.keys(manifest).length,
      'files',
    );
  } finally {
    if (!committed) {
      for (const item of moved.reverse()) {
        fs.rmSync(item.destination, { recursive: true, force: true });
        if (fs.existsSync(item.previous)) fs.renameSync(item.previous, item.destination);
      }
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (require.main === module) main();
