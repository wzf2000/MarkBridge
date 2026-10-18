const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const runtime = process.env.MARKBRIDGE_TEST_RUNTIME;
assert(runtime);
const { JSDOM } = require(runtime + '/node_modules/jsdom');
const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' }),
  w = dom.window;
w.TextEncoder = TextEncoder;
vm.runInContext(fs.readFileSync('plugin/math-explorer.js', 'utf8'), dom.getInternalVMContext());
const root = w.document.querySelector('main');
const valid =
  '<mjx-container jax="CHTML"><mjx-mfrac data-semantic-id="2" data-semantic-type="fraction" data-semantic-children="0,1" data-semantic-speech-none="a over d"><mjx-mi data-semantic-id="0" data-semantic-parent="2" data-semantic-type="identifier" data-latex="a" data-semantic-speech-none="a"></mjx-mi><mjx-mi data-semantic-id="1" data-semantic-parent="2" data-semantic-type="identifier" data-latex="d" data-semantic-speech-none="d"></mjx-mi></mjx-mfrac></mjx-container>';
root.innerHTML = valid;
let tree = w.MBBMathExplorer.semanticTree(root);
assert.equal(w.MBBMathExplorer.chineseReading(tree), '分数开始；分子 a；分母 d；分数结束');
for (const bad of [
  valid.replace('id="1"', 'id="0"'),
  valid.replace('children="0,1"', 'children="0,99"'),
  valid.replace('parent="2"', 'parent="0"'),
  valid.replace('children="0,1"', 'children="0,0"'),
]) {
  root.innerHTML = bad;
  assert.throws(() => w.MBBMathExplorer.semanticTree(root));
}
root.innerHTML = valid.replace('type="fraction"', 'type="unknown"');
assert.equal(w.MBBMathExplorer.chineseReading(w.MBBMathExplorer.semanticTree(root)), null);
root.innerHTML = valid;
const panel = w.MBBMathExplorer.create(root);
w.document.body.append(panel.element);
panel.load();
panel.element.open = true;
const region = panel.element.querySelector('[role=group]');
region.focus();
region.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
assert.equal(
  root.querySelector('.mbb-math-explorer-current').getAttribute('data-semantic-id'),
  '0',
);
region.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
assert.equal(
  root.querySelector('.mbb-math-explorer-current').getAttribute('data-semantic-id'),
  '1',
);
region.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
assert.equal(
  root.querySelector('.mbb-math-explorer-current').getAttribute('data-semantic-id'),
  '2',
);
panel.clear();
assert.equal(root.querySelector('.mbb-math-explorer-current'), null);
assert.equal(panel.element.open, false);
w.document.documentElement.lang = 'zh-CN';
w.MBBI18n = {
  t: (s) =>
    s === 'Semantic exploration is unavailable for this formula.' ? '此公式暂不支持结构探索。' : s,
};
root.innerHTML = '';
panel.load();
assert.equal(region.querySelector('span').lang, 'zh-CN');
root.innerHTML = '<mjx-container jax="CHTML" data-semantic-speech-none="a over d"></mjx-container>';
panel.load();
assert.equal(region.textContent, 'a over d');
assert.equal(region.querySelector('span').lang, 'en');
w.close();
console.log(
  'Math exploration: graph identity/relationships, unsupported fallback, Chinese fraction, keyboard state and cleanup passed',
);
