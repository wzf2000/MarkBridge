const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
function php(input) {
  return JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_PHP || 'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN), true)));',
        'plugin/includes/php-converter/Worker.php',
      ],
      { input: JSON.stringify(input), encoding: 'utf8' },
    ),
  );
}
const header = (lines, ending = '\n') => ['---', 'markbridge: 1', ...lines, '---', ''].join(ending);
const body = '\n# Body\n\nText $x^2$ and note[^a].\n\n- [ ] Task\n\n[^a]: Note\n';
const rawBoundary = header(['excerpt: ' + JSON.stringify('\\'.repeat(8175))]);
assert.equal(Buffer.byteLength(rawBoundary), 16384);
assert.equal(Buffer.byteLength(header(['excerpt: ' + JSON.stringify('\\'.repeat(8176))])), 16386);
const good = [
  rawBoundary,
  header([]),
  header([]).trimEnd(),
  header(['title: "0"']),
  header([
    'title: "😀"',
    'excerpt: "<strong>text</strong>\\nNext"',
    'slug: "中文"',
    'status: "draft"',
    'categories: ["alpha","%e4%b8%ad"]',
    'tags: []',
    'featured_media: 0',
  ]) + body,
  header(['excerpt: ' + JSON.stringify('\u2028\u2029')]) + body,
  header(['title: "CRLF"'], '\r\n') + body,
  '---\ntitle: Old YAML\n---\n\nLiteral\n',
  '```md\n' + header(['title: "Code"']) + '```\n',
];
try {
  for (const source of good) {
    const input = { mode: 'markdown', source, documentId: 'FRONTMATTER' };
    const node = w.MBB.importDocument(source, input.documentId),
      result = php(input);
    assert.equal(result.ok, true, result.message);
    assert.equal(node.serialized, result.document.serialized);
    assert.equal(node.source, source);
    assert.equal(w.MBB.exportDocument(node, node.serialized), source);
    const edit = w.MBB.toMarkdown(w.wp.blocks.parse(node.serialized), {
      origin: 'markdown_import',
    });
    const reverse = php({
      mode: 'blocks',
      serialized: node.serialized,
      documentId: input.documentId,
      base: node,
    });
    assert.equal(reverse.ok, true, reverse.message);
    assert.equal(reverse.document.source, source);
    if (source.startsWith('---\nmarkbridge:') || source.startsWith('---\r\nmarkbridge:'))
      assert.equal(
        w.wp.blocks.parse(node.serialized)[0].attributes.raw,
        w.MBB.parseFrontmatter(source, () => {
          throw Error();
        }).raw,
      );
    assert.equal(
      php({ mode: 'markdown', source: edit, documentId: input.documentId }).document.serialized,
      node.serialized,
    );
  }
  const bad = [
    header(['author: "bad"']),
    header(['date: "today"']),
    header(['meta: {}']),
    header(['title: "a"', 'title: "b"']),
    header(['title: 0']),
    header(['title: "　"']),
    header(['title: "a\\nline"']),
    header(['excerpt: "\\ud800"']),
    header(['categories: {}']),
    header(['categories: ["one","one"]']),
    header(['tags: [["one"]]']),
    header(['featured_media: 1.0']),
    header(['featured_media: -0']),
    header(['featured_media: 9007199254740992']),
    header(['status: "trash"']),
    header(['title: "x"']).replace('markbridge: 1', 'markbridge: 2'),
    '---\nmarkbridge: 1\ntitle: "unterminated"\n',
    header(['excerpt: ' + JSON.stringify('a'.repeat(8193))]),
    header(['excerpt: ' + JSON.stringify('\\'.repeat(8176))]),
  ];
  for (const prefix of ['', header(['title: "Location prefix"'])]) {
    const source = prefix + '\n$$\nx\n';
    let diagnostic;
    try {
      w.MBB.importDocument(source, 'LOCATION');
    } catch (error) {
      diagnostic = error;
    }
    assert(diagnostic, 'Unclosed display formula must fail');
    const result = php({ mode: 'markdown', source, documentId: 'LOCATION' });
    assert.equal(result.ok, false);
    assert.equal(result.code, diagnostic.code);
    assert.equal(result.location, diagnostic.location);
    if (prefix) assert.equal(result.location, '', 'A removed header has no trusted body line map');
    else
      assert.match(
        result.location,
        /^line:/,
        'Original-source diagnostics should retain their real line',
      );
  }
  for (const source of bad) {
    assert.throws(() => w.MBB.importDocument(source, 'BAD'));
    assert.equal(
      php({ mode: 'markdown', source, documentId: 'BAD' }).ok,
      false,
      source.slice(0, 80),
    );
  }
  const original = header(['title: "Legacy literal"']) + '\nBody\n';
  const legacy = w.wp.blocks.serialize(w.MBB.toBlocks(original, false, false, true));
  assert.notEqual(legacy, w.MBB.importDocument(original, 'LEGACY').serialized);
  const pair = w.MBB.importPairedDocument(original, legacy, 'LEGACY');
  assert.equal(pair.serialized, legacy);
  assert.equal(
    php({ mode: 'paired_restore', source: original, serialized: legacy, documentId: 'LEGACY' }).ok,
    true,
  );
  assert.equal(w.MBB.exportDocument(pair, legacy), original);
  assert.throws(() =>
    w.MBB.importPairedDocument(
      original,
      legacy + '\n<!-- wp:paragraph -->\n<p>Forged</p>\n<!-- /wp:paragraph -->',
      'LEGACY',
    ),
  );
  const blocks = w.MBB.toBlocks(header(['title: "Head"']) + '\nBody\n');
  for (const invalid of [
    [blocks[1], blocks[0]],
    [blocks[0], blocks[0], blocks[1]],
    [w.wp.blocks.createBlock('core/quote', {}, blocks)],
  ]) {
    assert.throws(() => w.MBB.toMarkdown(invalid, { origin: 'markdown_import' }));
    const serialized = w.wp.blocks.serialize(invalid);
    assert.equal(
      php({
        mode: 'blocks',
        serialized,
        base: w.MBB.importDocument('Base\n', 'BASE'),
        documentId: 'BASE',
      }).ok,
      false,
    );
  }
  const sample = w.MBB.importDocument(header(['title: "Raw <script>"']) + '\nBody\n', 'TEXT');
  const mutated = sample.serialized.replace(
    'data-mbb-generated=""',
    'data-mbb-generated=""><script>bad()</script><div data-extra="',
  );
  assert.throws(() => w.MBB.exportDocument(sample, mutated));
  assert.equal(
    php({ mode: 'blocks', base: sample, serialized: mutated, documentId: 'TEXT' }).ok,
    false,
  );
  assert.throws(() => w.MBB.importDocument(header([]) + 'x'.repeat(262144), 'LIMIT'));
  assert.equal(
    php({ mode: 'markdown', source: header([]) + 'x'.repeat(262144), documentId: 'LIMIT' }).ok,
    false,
  );
  console.log(
    'FrontMatter PHP/Node raw bytes, root footnotes/math/tasks, editing, closed grammar, legacy exact pairs, structure and budget contracts passed.',
  );
} finally {
  close();
}
