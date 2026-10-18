const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fixture = require('./fixtures/native-media.json');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
function php(payload) {
  return JSON.parse(
    execFileSync(
      'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN), true)));',
        path.resolve('plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(payload), encoding: 'utf8' },
    ),
  );
}
const errors = [];
try {
  for (const test of fixture.cases) {
    try {
      let document, nodeError;
      try {
        document = w.MBB.importDocument(test.source, 'technical-fixture');
      } catch (e) {
        nodeError = e;
      }
      const result = php({
        mode: 'markdown',
        source: test.source,
        documentId: 'technical-fixture',
      });
      if (!test.valid) {
        assert(nodeError, 'Node accepted invalid fixture');
        assert.equal(result.ok, false, 'PHP accepted invalid fixture');
        continue;
      }
      assert(!nodeError, nodeError?.code + ': ' + nodeError?.message);
      assert.equal(result.ok, true, JSON.stringify(result));
      if (result.document.serialized !== document.serialized) {
        let i = 0;
        while (result.document.serialized[i] === document.serialized[i]) i++;
        assert.fail(
          'PHP/Node serialization differs at ' +
            i +
            '\nPHP ' +
            result.document.serialized.slice(i - 40, i + 180) +
            '\nNode ' +
            document.serialized.slice(i - 40, i + 180),
        );
      }
      const parsed = w.wp.blocks.parse(document.serialized);
      const walk = (blocks) => {
        for (const b of blocks) {
          assert.notEqual(b.isValid, false, b.name + ' is invalid');
          walk(b.innerBlocks || []);
        }
      };
      walk(parsed);
      assert.equal(w.MBB.exportDocument(document, document.serialized), test.source);
      const restored = php({
        mode: 'paired_restore',
        source: test.source,
        serialized: document.serialized,
        documentId: 'technical-fixture',
      });
      assert.equal(restored.ok, true, JSON.stringify(restored));
      const reopened = php({
        mode: 'blocks',
        base: document,
        serialized: document.serialized,
        documentId: 'technical-fixture',
      });
      assert.equal(reopened.ok, true, JSON.stringify(reopened));
      assert.equal(reopened.document.source, test.source);
    } catch (error) {
      errors.push(test.name + ': ' + error.message);
    }
  }
} finally {
  close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Native media: ' +
      fixture.cases.length +
      ' shared Node/PHP format and paired restore cases passed',
  );
