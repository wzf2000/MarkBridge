const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fixture = (mode = 'empty') =>
  JSON.parse(
    execFileSync('php', [path.join(__dirname, 'presentation-assets.php'), mode], {
      encoding: 'utf8',
    }),
  );
async function openEmpty(page, mode = 'empty', image = null) {
  const settings = fixture(mode);
  if (image) {
    const loader = settings.scripts.find(({ handle }) => handle === 'mbb-presentation-loader');
    expect(loader, 'Presentation loader fixture must be registered').toBeDefined();
    const prefix = 'window.MBB_PRESENTATION=';
    const matches = (loader.inline.before || [])
      .map((script, index) => ({ script, index }))
      .filter(({ script }) => script.startsWith(prefix));
    expect(matches, 'Fixture must contain exactly one presentation configuration').toHaveLength(1);
    const { script, index } = matches[0];
    const config = JSON.parse(script.slice(prefix.length, -1));
    expect(config.images, 'Fixture must begin with an empty emoji image mapping').toEqual([]);
    config.images = { custom_broken: image };
    loader.inline.before[index] = prefix + JSON.stringify(config) + ';';
    expect(loader.inline.before[index]).not.toBe(script);
  }
  const scripts = settings.scripts
    .map(
      ({ url, inline }) =>
        `${(inline.before || []).map((script) => `<script>${script}</script>`).join('')}<script defer src="${url}"></script>`,
    )
    .join('');
  await page.route('**/on-demand', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head>${scripts}</head><body><main><p>Plain text mentions footnotes.</p><pre class="wp-block-mbb-math"><code>$$x+y$$</code></pre><code>:smile:</code></main></body></html>`,
    }),
  );
  await page.goto('/on-demand');
}
test('plain and math pages skip heavy resources, later comments/code/footnotes load once', async ({
  page,
}) => {
  const requests = [];
  const failures = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => failures.push(error.message));
  await openEmpty(page);
  await page.waitForTimeout(100);
  expect(
    requests.filter((url) =>
      /\/vendor\/prism\/|\/emoji(?:-[a-f0-9]+)?\.js|\/footnotes(?:-[a-f0-9]+)?\.css|\/clipboard\//.test(
        url,
      ),
    ),
  ).toEqual([]);
  await page.evaluate(() => {
    const article = document.createElement('article');
    article.innerHTML =
      '<pre><code class="language-javascript">const late = 1;\n</code></pre><div class="comment-content">A comment :smile: and :unknown_shortcode:</div><span class="mbb-footnote-ref">1</span>';
    document.body.append(article);
  });
  await expect(page.locator('article .token.keyword')).toHaveText('const');
  await expect(page.locator('article .comment-content')).toContainText('😄');
  await expect(page.locator('article .comment-content')).toContainText(':unknown_shortcode:');
  await expect(
    page.locator('article').getByRole('button', { name: 'Copy', exact: true }),
  ).toBeVisible();
  await expect(page.locator('head link[href*="footnotes"]')).toHaveCount(1);
  await page.evaluate(() => {
    const code = document.createElement('pre');
    code.innerHTML = '<code>plain late code\n</code>';
    document.body.append(code);
  });
  await expect(page.locator('.code-toolbar')).toHaveCount(2);
  await expect(page.locator('script[src*="prism-core"]')).toHaveCount(1);
  expect(failures).toEqual([]);
});
test('dynamic code keeps disabled copy and line-number preferences', async ({ page }) => {
  await openEmpty(page, 'empty-disabled');
  await page.evaluate(() => {
    const pre = document.createElement('pre');
    pre.innerHTML = '<code class="language-javascript">const late = 1;\n</code>';
    document.body.append(pre);
  });
  await expect(page.locator('.token.keyword')).toHaveText('const');
  await expect(page.locator('.toolbar-item button,.line-numbers-rows')).toHaveCount(0);
  await expect(
    page.locator('script[src*="copy-to-clipboard"],script[src*="line-numbers"]'),
  ).toHaveCount(0);
});

test('failed custom emoji images stop retrying, and new content scans only its own subtree', async ({
  page,
}) => {
  let imageRequests = 0;
  await page.route('**/broken-custom.png', (route) => {
    imageRequests++;
    return route.fulfill({ status: 404, body: '' });
  });
  await openEmpty(page, 'empty', '/broken-custom.png');
  await page.evaluate(() => {
    const original = document.createTreeWalker.bind(document);
    window.bodyWalks = 0;
    document.createTreeWalker = (root, ...args) => {
      if (root === document.body) window.bodyWalks++;
      return original(root, ...args);
    };
    const comment = document.createElement('div');
    comment.id = 'late-broken-emoji';
    comment.textContent = ':custom_broken:';
    document.body.append(comment);
  });
  await expect.poll(() => imageRequests).toBe(1);
  await expect(page.locator('#late-broken-emoji img')).toHaveCount(0);
  await expect(page.locator('#late-broken-emoji')).toHaveText(':custom_broken:');
  await page.evaluate(() => {
    const comment = document.createElement('div');
    comment.textContent = 'again :custom_broken:';
    document.body.append(comment);
  });
  await page.waitForTimeout(150);
  expect(imageRequests).toBe(1);
  expect(await page.evaluate(() => window.bodyWalks)).toBe(0);
});
