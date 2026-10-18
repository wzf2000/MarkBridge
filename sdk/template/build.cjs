const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = __dirname,
  script = fs.readFileSync(path.join(root, 'provider.js'), 'utf8');
const body =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SDK bounded sum</title><main><h1>Bounded sum</h1><p>Temporary result; original explanation remains in the article.</p><button id="run">Run</button> <button id="stop">Stop</button><p><output aria-live="polite">Waiting for host</output></p></main><script>' +
  script +
  '</script></html>\n';
const sha256 = crypto.createHash('sha256').update(body).digest('hex'),
  file = 'sum-' + sha256.slice(0, 12) + '.html.txt';
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
for (const old of fs.readdirSync(path.join(root, 'assets')))
  if (/^sum-[a-f0-9]{12}\.html\.txt$/.test(old) && old !== file)
    fs.unlinkSync(path.join(root, 'assets', old));
fs.writeFileSync(path.join(root, 'assets', file), body);
fs.writeFileSync(
  path.join(root, 'manifest.json'),
  JSON.stringify({ file, sha256 }, null, 2) + '\n',
);
