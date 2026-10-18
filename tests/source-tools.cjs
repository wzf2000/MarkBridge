const assert = require('node:assert/strict');
const fs = require('node:fs');
const runtime = require('./helpers/wp-runtime.cjs')();
try {
  const w = runtime.window;
  w.eval(fs.readFileSync('plugin/source-tools.js', 'utf8'));
  const tools = w.MBBSourceTools;
  const raw = '标题😀\r\nrepeat\r\nrepeat\r\ntail\r';
  const shown = raw.replace(/\r\n?/g, '\n');
  for (let offset = 0; offset <= shown.length; offset++) {
    assert.equal(tools.displayOffset(raw, tools.rawOffset(raw, offset)), offset);
  }
  const first = shown.indexOf('repeat'),
    second = shown.lastIndexOf('repeat');
  assert.equal(
    tools.replaceRanges(raw, [[second, second + 6]], '改\n行'),
    '标题😀\r\nrepeat\r\n改\r\n行\r\ntail\r',
  );
  assert.equal(
    tools.replaceRanges(
      raw,
      [
        [first, first + 6],
        [second, second + 6],
      ],
      'x',
    ),
    '标题😀\r\nx\r\nx\r\ntail\r',
  );
  const template = w.document.createElement('template');
  template.innerHTML =
    '<meta http-equiv="refresh" content="0;url=https://example.invalid"><p data-mbb-preview-session="spoof" data-mbb-preview-range="r0" onclick="alert(1)">A</p><script>alert(1)</script><iframe src="https://example.invalid"></iframe><a href="https://example.invalid">external</a><a href="#one">local</a>';
  const html = tools.frameDocument(template.content, '', null);
  assert(
    !html.includes('onclick') &&
      !html.includes('alert(1)') &&
      !html.includes('<iframe') &&
      !html.includes('refresh'),
  );
  assert(!html.includes('spoof') && html.includes('data-mbb-preview-range="r0"'));
  assert(!html.includes('href="https:') && html.includes('href="about:srcdoc#one"'));
  assert(html.includes("worker-src 'none'") && html.includes("script-src 'none'"));
  console.log(
    'Raw UTF-16/LF projection, byte-preserving replacements and inert preview sanitation passed.',
  );
} finally {
  runtime.close();
}
