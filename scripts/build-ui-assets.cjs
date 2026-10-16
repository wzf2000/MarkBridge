const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto'),
  root = path.resolve(__dirname, '../plugin');
const read = (n) => fs.readFileSync(path.join(root, n), 'utf8');
const map = {};
function asset(name, body = read(name)) {
  const ext = path.extname(name),
    file =
      name.slice(0, -ext.length) +
      '-' +
      crypto.createHash('sha256').update(body).digest('hex').slice(0, 12) +
      ext;
  fs.writeFileSync(path.join(root, file), body);
  map[name] = file;
  return file;
}
const config = asset('math-engine.js'),
  engine = asset('math-engine.html', read('math-engine.html').replace('math-engine.js', config));
asset(
  'math.js',
  read('math.js').replace(
    /root\s*\+\s*['"]math-engine\.html['"]/,
    'root + ' + JSON.stringify(engine),
  ),
);
asset('i18n.js');
asset('diagnostics.js');
asset('diagnostics.css');
asset('kernel.js');
asset('emoji.js');
asset('presentation-loader.js');
asset('editor-ui.js');
asset('source-tools.js');
asset('resource-ui.js');
asset('static-export.js');
asset('static-export.css');
asset('export-ui.js');
asset('batch-ui.js');
asset('batch-ui.css');
asset('local-recovery.js');
asset('editor-ui.css');
asset('math.css');
asset('footnotes.css');
asset('teaching.js');
asset('components.js');
asset('teaching.css');
asset('technical.css');
asset('settings.css');
asset('settings.js');
asset('code-display.css');
fs.writeFileSync(path.join(root, 'assets.json'), JSON.stringify(map, null, 2) + '\n');
