const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  esbuild = require('esbuild');
const code = esbuild.buildSync({
  entryPoints: ['src/author-tools.js'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Tools',
}).outputFiles[0].text;
let cleanup, ref;
const c = {
  TextEncoder,
  wp: {
    element: {
      useRef: (v) => (ref ||= { current: v }),
      useEffect: (f) => {
        cleanup = f();
      },
      createElement: (type, props, ...children) => ({ type, props, children }),
    },
  },
  MBB_EDITOR: { postId: 3, state: { expected: 'base', source_sha256: 'source' } },
};
vm.createContext(c);
vm.runInContext(code, c);
const f = c.Tools;
function Editor() {}
f.registerAuthorTool({ id: 'sample', version: '1.0.0', slot: 'bibliography/v2', Editor });
assert.throws(() =>
  f.registerAuthorTool({ id: ['other'], version: '1.0.0', slot: 'bibliography/v2', Editor }),
);
const writes = [],
  draft = { entries: [], style: 'numeric' };
const render = () =>
  f.AuthorTools({
    slot: 'bibliography/v2',
    draft,
    change: (p) => writes.push(p),
    clientId: 'block',
  });
let patch = render().children[0].props.change;
patch({ style: 'author-year' });
assert.equal(writes.length, 1);
assert.throws(() => patch({ style: 'numeric' }), 'single generation patch');
patch = render().children[0].props.change;
c.MBB_EDITOR.state.expected = 'new';
assert.throws(() => patch({ style: 'numeric' }), 'baseline changed');
patch = render().children[0].props.change;
cleanup();
assert.throws(() => patch({ style: 'numeric' }), 'destroyed candidate');
assert.equal(writes.length, 1);
assert.ok(!fs.readFileSync('src/technical-editor.js', 'utf8').includes('MBBScholarlyTool'));
console.log(
  'Generic author tools: closed registration, candidate-only patch, generation/baseline and destroyed candidate guards passed',
);

ref = undefined;
let failed = true;
const retry = f.AuthorTools({
  slot: 'bibliography/v2',
  draft,
  clientId: 'retry',
  change: (value) => {
    if (failed) {
      failed = false;
      throw Error('Candidate kept');
    }
    writes.push(value);
  },
}).children[0].props.change;
assert.throws(() => retry({ entries: null }));
assert.throws(() => retry({ style: 'numeric' }));
retry({ style: 'numeric' });
assert.equal(writes.length, 2, 'A rejected parent patch must remain retryable');
