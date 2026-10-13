const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
(async () => {
  const { planMerge, resolveMerge, mergeMetadata } = await import('../src/merge.js');
  const auto = (a, b, c, expected) => {
    const plan = planMerge(a, b, c);
    assert.deepEqual(plan.conflicts, []);
    assert.equal(resolveMerge(plan), expected);
  };
  auto('one\r\ntwo\rthree', 'mine\r\ntwo\rthree', 'one\r\ntwo\rlatest', 'mine\r\ntwo\rlatest');
  auto('x\nx\n', 'x\nx\n', 'y\nx\n', 'y\nx\n');
  auto('x\nx\n', 'y\nx\n', 'x\nx\n', 'y\nx\n');
  auto('x\n', 'identical\r', 'identical\r', 'identical\r');
  auto('', 'mine', '', 'mine');
  auto('a\nb\nc\n', 'A\nb\nc\n', 'a\nB\nc\n', 'A\nB\nc\n');
  for (const [a, b, c] of [
    ['a\n', 'mine\n', 'latest\n'],
    ['a\n', 'first\na\n', 'second\na\n'],
    ['x\nx\nz\n', 'x\nz\n', 'y\nx\nz\n'],
  ]) {
    const plan = planMerge(a, b, c);
    assert(plan.conflicts.length > 0);
    assert.throws(
      () => resolveMerge(plan),
      (error) => error.code === 'MERGE_CHOICE',
    );
    assert.equal(
      resolveMerge(plan, Object.fromEntries(plan.conflicts.map((h) => [h.id, 'mine']))),
      b,
    );
  }
  const atomic = [
    '```js\none\ntwo\n```\n',
    '> ```js\n> one\n> two\n> ```\n',
    '- item\n\n    ```js\n    one\n    two\n    ```\n',
    '> - item\n>\n>     ```js\n>     one\n>     two\n>     ```\n',
    '---\nmarkbridge: 1\ntitle: "one"\nexcerpt: "two"\n---\n',
    ':::mbb:v1 collapse {"id":"fold","title":"one","open":false}\n\nBody two.\n\n:::mbb:end\n',
    '<pre>\none\ntwo\n</pre>\n',
  ];
  for (const source of atomic) {
    const mine = source.replace('one', 'mine'),
      latest = source.replace('two', 'latest');
    const plan = planMerge(source, mine, latest);
    assert.equal(plan.conflicts.length, 1, source);
    assert.equal(resolveMerge(plan, { h0: 'mine' }), mine);
    assert.equal(resolveMerge(plan, { h0: 'latest' }), latest);
    const result = JSON.parse(
      execFileSync(
        process.env.MARKBRIDGE_PHP || 'php',
        [
          '-r',
          'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
          'plugin/includes/php-converter/Worker.php',
        ],
        {
          input: JSON.stringify({ mode: 'markdown', source, documentId: 'MERGE-ATOMIC' }),
          encoding: 'utf8',
        },
      ),
    );
    assert.equal(result.ok, true, result.message);
  }
  auto(
    'Text `one`\n\nOther two.\n',
    'Text `mine`\n\nOther two.\n',
    'Text `one`\n\nOther latest.\n',
    'Text `mine`\n\nOther latest.\n',
  );
  for (const long of ['\n'.repeat(32769), '😀'.repeat(65537)])
    assert.throws(
      () => planMerge('', '', long),
      (error) => error.code === 'MERGE_BUDGET',
    );
  auto('', '', '\r\n'.repeat(32768), '\r\n'.repeat(32768));
  const a = Array.from({ length: 120 }, (_, n) => 'a' + n + '\n').join(''),
    b = a.replaceAll('a', 'b'),
    c = a.replaceAll('a', 'c');
  assert.throws(
    () => planMerge(a, b, c),
    (error) => error.code === 'MERGE_BUDGET',
  );
  const meta = { title: 'A', post_status: 'draft', featured_media: 1 };
  assert.deepEqual(
    mergeMetadata(meta, meta, { title: 'C', post_status: 'pending', featured_media: 2 }).values,
    { title: 'C', post_status: 'pending', featured_media: 2 },
  );
  const overlap = mergeMetadata(
    meta,
    { title: 'B', post_status: 'private', featured_media: 3 },
    { title: 'C', post_status: 'pending', featured_media: 2 },
  );
  assert.equal(overlap.conflicts.length, 3);
  assert.deepEqual(
    mergeMetadata(
      meta,
      { title: 'B', post_status: 'private', featured_media: 3 },
      { title: 'C', post_status: 'pending', featured_media: 2 },
      { title: 'mine', post_status: 'latest', featured_media: 'latest' },
    ).values,
    { title: 'B', post_status: 'pending', featured_media: 2 },
  );
  console.log(
    'Bounded merge exact EOL/EOF, independent/overlap/ambiguity, AST nested fences, metadata and budgets passed',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
