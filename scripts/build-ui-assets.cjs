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
asset('kernel.js');
asset('emoji.js');
asset('editor-ui.js');
asset('editor-ui.css');
asset('math.css');
fs.writeFileSync(path.join(root, 'assets.json'), JSON.stringify(map, null, 2) + '\n');
