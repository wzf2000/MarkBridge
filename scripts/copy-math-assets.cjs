const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const manifest = {};
function copyFiles(source, relative) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const targetName = relative + '/' + entry.name;
    if (entry.isDirectory()) copyFiles(from, targetName);
    else if (entry.isFile()) {
      const bytes = fs.readFileSync(from);
      const to = path.join(root, 'plugin', targetName);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, bytes);
      manifest[targetName] = crypto.createHash('sha256').update(bytes).digest('hex');
    } else throw new Error('Vendor package contains a non-regular entry: ' + entry.name);
  }
}
for (const [from, to] of [
  ['mathjax', 'mathjax-4.1.3'],
  ['@mathjax/mathjax-newcm-font', 'mathjax-newcm-font'],
])
  copyFiles(path.join(root, 'node_modules', from), 'vendor/' + to);
fs.writeFileSync(
  path.join(root, 'plugin/vendor-manifest.json'),
  JSON.stringify(
    Object.fromEntries(
      Object.keys(manifest)
        .sort()
        .map((name) => [name, manifest[name]]),
    ),
    null,
    2,
  ) + '\n',
);
