const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
try {
  const expected = Object.keys(
    JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../plugin/includes/php-converter/block-capabilities.json'),
        'utf8',
      ),
    ),
  );
  assert.deepEqual(Array.from(w.MBB.supportedBlocks), expected);
  for (const source of [
    'Safe.\n\n<script>PRIVATE_BODY</script>\n',
    'Safe.\n\nMissing[^PRIVATE_LABEL].\n',
    '中文。\n\n$$\nx+y\n',
  ]) {
    assert.throws(
      () => w.MBB.toBlocks(source),
      (error) => {
        assert.equal(error.location, 'line:3');
        assert(!error.message.includes('PRIVATE_BODY') && !error.message.includes('PRIVATE_LABEL'));
        assert.equal(w.MBB.formatLocation(error.location), 'Markdown 第 3 行所在区块');
        return true;
      },
    );
  }
  const taskBlocks = w.MBB.toBlocks('- [ ] Task\n\n  Second paragraph.\n');
  assert(
    taskBlocks[0].innerBlocks[0].innerBlocks.length > 0,
    'Fixture must exercise a multi-paragraph task item',
  );
  const taskSource = w.MBB.toMarkdown(taskBlocks, { origin: 'markdown_import' });
  assert(taskSource.includes('Second paragraph'));
  assert.equal(
    w.wp.blocks.serialize(w.MBB.toBlocks(taskSource)),
    w.wp.blocks.serialize(taskBlocks),
  );
  const generatedMath = w.wp.blocks.createBlock('core/paragraph', {
    content: '<span class="mbb-math" data-mbb-tex="a $$ b">$a $$ b$</span>',
  });
  assert.throws(
    () => w.MBB.toMarkdown([generatedMath], { origin: 'markdown_import' }),
    (error) => {
      assert.equal(error.location, '');
      assert.equal(error.code, 'UNCLOSED_MATH');
      return true;
    },
  );
  const unknown = w.wp.blocks.createBlock('core/paragraph', { content: 'PRIVATE_BODY' });
  unknown.name = 'third-party/unsupported';
  const quote = w.wp.blocks.createBlock('core/quote', {}, [unknown]);
  assert.throws(
    () => w.MBB.toMarkdown([quote], { origin: 'markdown_import' }),
    (error) => {
      assert.equal(error.location, 'blocks[0][0]');
      assert(!error.message.includes('PRIVATE_BODY'));
      return true;
    },
  );
  const styled = w.wp.blocks.createBlock('core/paragraph', {
    content: 'PRIVATE_BODY',
    align: 'right',
  });
  assert.throws(
    () => w.MBB.toMarkdown([styled], { origin: 'markdown_import' }),
    (error) => {
      assert.equal(error.location, 'blocks[0].attributes.align');
      assert.equal(error.code, 'LOSSY_ROUNDTRIP');
      assert(!error.detail && !error.message.includes('PRIVATE_BODY'));
      return true;
    },
  );
  assert.equal(
    w.MBB.formatLocation('blocks[1][2].attributes.align'),
    '第 2 → 3 个区块，属性 align',
  );
  assert.equal(w.MBB.formatLocation('/srv/private/source.md'), '');
  console.log(
    'Parser source positions, nested block/attribute diagnostics and shared capabilities passed.',
  );
} finally {
  close();
}
