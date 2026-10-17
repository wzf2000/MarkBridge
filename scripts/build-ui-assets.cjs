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
  (read('mathml.js') + '\n' + read('math.js')).replace(
    /root\s*\+\s*['"]math-engine\.html['"]/,
    'root + ' + JSON.stringify(engine),
  ),
);
asset('i18n.js');
asset('math-explorer.js');
asset('diagnostics.js');
asset('diagnostics.css');
asset('kernel.js');
asset('emoji.js');
asset('presentation-loader.js');
asset('editor-ui.js');
asset('source-tools.js');
asset('writing-ui.js');
asset('references-ui.js');
asset('resource-ui.js');
asset(
  'projections.js',
  read('projections.js').replace('__MBB_PROJECTION_PROFILE__', read('projections-profile.json')),
);
asset(
  'static-export.js',
  read('projections.js').replace('__MBB_PROJECTION_PROFILE__', read('projections-profile.json')) +
    '\n' +
    read('static-export.js'),
);
asset('projections.css');
asset('static-export.css');
asset('export-ui.js');
asset('batch-ui.js');
asset('collections-ui.js');
asset('collections-ui.css');
asset('batch-ui.css');
asset('local-recovery.js');
asset('paired-backups.js');
asset('editor-ui.css');
asset('math.css');
asset('footnotes.css');
asset('teaching.js');
asset('components.js');
asset('teaching.css');
asset('technical.css');
asset('media-presentation.css');
asset('reader-diagrams.css');
asset('static-code.js');
asset('settings.css');
asset('settings.js');
asset('code-display.css');
fs.writeFileSync(path.join(root, 'assets.json'), JSON.stringify(map, null, 2) + '\n');
