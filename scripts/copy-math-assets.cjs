const fs = require('fs'),
  path = require('path');
const root = path.resolve(__dirname, '..');
for (const [from, to] of [
  ['mathjax', 'mathjax-4.1.3'],
  ['@mathjax/mathjax-newcm-font', 'mathjax-newcm-font'],
])
  fs.cpSync(path.join(root, 'node_modules', from), path.join(root, 'plugin/vendor', to), {
    recursive: true,
  });
