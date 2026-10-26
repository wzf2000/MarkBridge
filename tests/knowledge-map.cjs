const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const model = require('../plugin/knowledge-map.js');
const corpus = require('./fixtures/knowledge-map.json');
const values = corpus.map(({ id, valid, params }) => {
  let actual = true;
  try {
    model.validate(params);
  } catch {
    actual = false;
  }
  assert.equal(actual, valid, id);
  return actual;
});
assert.deepEqual(
  JSON.parse(
    cp.execFileSync(
      process.env.MARKBRIDGE_TEST_PHP || 'php',
      [path.join(__dirname, 'knowledge-map.php')],
      { encoding: 'utf8' },
    ),
  ),
  values,
);
console.log(`Knowledge-map PHP/JS: ${values.length} paired cases`);
