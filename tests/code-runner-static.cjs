const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const source =
  fs.readFileSync('src/component-data.js', 'utf8').replace(/export /g, '') +
  '\n' +
  fs
    .readFileSync('src/code-runner-static.js', 'utf8')
    .replace(/^import .*\n/gm, '')
    .replace(/export /g, '') +
  '\nglobalThis.model = codeRunnerModel;globalThis.render = codeRunnerStaticElement;';
const context = { TextEncoder, T: (s) => s };
vm.runInNewContext(source, context);
const p = {
  version: 1,
  language: 'cpp',
  title: '标题',
  sourceChunks: ['\ufeff<script>\r\n  '],
  stdinChunks: ['x\r\n'],
};
const php = (params) =>
  execFileSync(
    'php',
    [
      '-r',
      'require "plugin/code-runner-static.php";echo mbb_code_runner_model(json_decode(stream_get_contents(STDIN))) ? "yes" : "no";',
    ],
    { input: JSON.stringify(params), encoding: 'utf8' },
  );
for (const params of [
  p,
  { ...p, url: 'https://example.invalid' },
  { ...p, version: 2 },
  { ...p, sourceChunks: ['x'.repeat(1025)] },
  { ...p, sourceChunks: ['你'.repeat(342)] },
  { ...p, title: '\0' },
  { ...p, title: '你'.repeat(54) },
  { ...p, sourceChunks: ['\x01'] },
  {
    ...p,
    sourceChunks: Array(8).fill('\t'.repeat(1024)),
    stdinChunks: Array(4).fill('\t'.repeat(1024)),
  },
  { ...p, stdinChunks: ['\0'] },
  { ...p, language: 'javascript' },
]) {
  assert.equal(!!context.model(params), php(params) === 'yes', 'PHP/JS closed static model');
}
const nodes = [];
const el = (tag, props, ...children) => {
  const node = { tag, props, children };
  nodes.push(node);
  return node;
};
context.render(el, p);
assert.equal(nodes.find((n) => n.tag === 'code').children[0], p.sourceChunks[0]);
assert.equal(
  nodes.some((n) => n.props && n.props.dangerouslySetInnerHTML),
  false,
);
assert.equal(
  nodes.some((n) => ['iframe', 'script', 'button'].includes(n.tag)),
  false,
);
console.log('PHP/JS exact static Runner model and text-only preview passed');
