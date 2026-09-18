const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const contract = {};
for (const name of ['package.json', 'package-lock.json']) {
  contract[name] = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'runtime', name)))
    .digest('hex');
}
fs.writeFileSync(
  path.join(root, 'plugin/runtime-contract.json'),
  JSON.stringify(contract, null, 2) + '\n',
);
