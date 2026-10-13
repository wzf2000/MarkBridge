const assert = require('node:assert/strict');
const fs = require('node:fs');
const { window: w, close } = require('./helpers/wp-runtime.cjs')();
const catalog = JSON.parse(
  fs.readFileSync('plugin/languages/markbridge-zh_CN-mbb-i18n.json', 'utf8'),
).locale_data.messages;
const labels = JSON.parse(fs.readFileSync('plugin/languages/messages.json', 'utf8'));
try {
  w.eval(fs.readFileSync('plugin/i18n.js', 'utf8'));
  w.wp.i18n.resetLocaleData({}, 'markbridge');
  assert.equal(w.MBBI18n.t('Close'), 'Close');
  for (const count of [0, 1, 2])
    assert.equal(
      w.MBBI18n.n('one difference', 'many differences', count),
      count === 1 ? 'one difference' : 'many differences',
    );
  w.wp.i18n.setLocaleData(catalog, 'markbridge');
  assert.equal(w.MBBI18n.t('Close'), '关闭');
  for (const [english, chinese] of Object.entries(labels))
    assert.equal(w.MBBI18n.safe(english, chinese), true, english);
  const single = '%1$s difference: green additions, red deletions, and gray unchanged context.',
    plural = '%1$s differences: green additions, red deletions, and gray unchanged context.';
  for (const count of [0, 1, 2])
    assert.equal(
      w.MBBI18n.format(w.MBBI18n.n(single, plural, count), count),
      `共 ${count} 处差异；绿色为新增，红色为删除，灰色为未变上下文。`,
    );
  for (const invalid of ['<img onerror=x>', '关闭 %q', '\0关闭']) {
    w.wp.i18n.setLocaleData({ Close: [invalid] }, 'markbridge');
    assert.equal(w.MBBI18n.t('Close'), 'Close');
  }
  assert.equal(w.MBBI18n.safe('Value %1$s', '值 %1$s %q'), false);
  assert.equal(w.MBBI18n.safe('100% complete', '100% 完成'), true);
  for (const [source, translated, expected] of JSON.parse(
    fs.readFileSync('tests/fixtures/localization-shapes.json', 'utf8'),
  )) {
    assert.equal(w.MBBI18n.safe(source, translated), expected, source);
    w.wp.i18n.setLocaleData({ [source]: [translated] }, 'markbridge');
    assert.equal(w.MBBI18n.t(source), expected ? translated : source, source);
  }
  w.wp.i18n.setLocaleData(catalog, 'markbridge');
  let failure;
  try {
    w.MBB.toBlocks('$$\nx\n');
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, 'UNCLOSED_MATH');
  assert.equal(failure.message, 'The block formula lacks paired $$ delimiters');
  assert.equal(w.MBBI18n.error(failure), labels[failure.message]);
  assert.match(w.MBB.formatLocation(failure.location), /第 1 行/);
  const source =
    '---\r\nmarkbridge: 1\r\ntitle: "作者标题"\r\n---\r\n\r\n:::mbb:v1 code-tabs {"id":"versions","defaultTab":"one","tabs":[{"id":"one","title":"","terminalNewline":false}]}\r\n```\r\na\r\nb\r\n```\r\n:::mbb:end\r\n\r\n正文 $x$。\r\n';
  const zh = w.MBB.importDocument(source, 'LOCALE');
  assert.match(zh.serialized, /代码/); // Immutable legacy fallback caption, not locale-dependent UI.
  w.wp.i18n.resetLocaleData({}, 'markbridge');
  const en = w.MBB.importDocument(source, 'LOCALE');
  assert.equal(en.source, zh.source);
  assert.equal(en.serialized, zh.serialized);
  assert.equal(
    w.MBB.importPairedDocument(zh.source, zh.serialized, 'LOCALE').serialized,
    zh.serialized,
  );
  w.wp.i18n.setLocaleData(catalog, 'markbridge');
  assert.equal(w.MBB.importPairedDocument(en.source, en.serialized, 'LOCALE').source, source);
  const snapshot = JSON.stringify(
    JSON.parse(fs.readFileSync('tests/fixtures/block-adapters.json')).descriptors,
  );
  w.MBB.configureBlockAdapters(snapshot);
  const registryBefore = JSON.stringify(w.MBB.adapterDescriptors());
  w.wp.i18n.resetLocaleData({}, 'markbridge');
  assert.equal(JSON.stringify(w.MBB.adapterDescriptors()), registryBefore);
  console.log(
    'Localization English/Chinese/fallback/plurals and exact persisted document contracts passed.',
  );
} finally {
  close();
}
