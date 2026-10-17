const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');

test('revision preview stays compact until verified, resets on selection, and rejects rendering failure', async ({
  page,
}, testInfo) => {
  await page.goto('/health');
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px system-ui}${fs.readFileSync(path.join(plugin, 'editor-ui.css'), 'utf8')}</style><button id="open">History</button>`,
  );
  await page.evaluate(() => {
    window.wp = { data: { select: () => ({ isEditedPostDirty: () => false }) } };
    window.MBB_EDITOR = {
      postId: 12,
      state: { post_id: 12, expected: 'current-fingerprint' },
      url: (route) => '/revision-fixture/' + route,
      nonce: 'synthetic',
    };
    window.MBB_MATH = {
      style: '',
      preview: async (html) => {
        if (window.failRender) throw Error('Synthetic preview failure');
        return html;
      },
    };
  });
  let releasePreview;
  await page.route('**/revision-fixture/**', async (route) => {
    if (route.request().url().includes('/revisions?')) {
      await route.fulfill({
        json: {
          revisions: [1, 2].map((id) => ({
            id,
            date: '2026-10-14',
            title: 'Synthetic',
            paired: true,
            expected_revision: 'revision-' + id,
          })),
        },
      });
    } else {
      const payload = route.request().postDataJSON();
      expect(payload.expected).toBe('current-fingerprint');
      expect(payload.expected_revision).toBe('revision-' + payload.revision_id);
      await new Promise((resolve) => (releasePreview = resolve));
      await route.fulfill({
        json: {
          adapter_digest: 'verified-adapter',
          before_title: 'Current',
          title: 'Revision',
          before: 'before',
          document: { source: 'after' },
          html: '<p>Verified preview</p>',
        },
      });
    }
  });
  await page.addScriptTag({ path: path.join(plugin, 'revisions-ui.js') });
  await page.evaluate(
    () => (document.getElementById('open').onclick = () => MBB_REVISIONS.open(12)),
  );
  await page.locator('#open').click();
  const dialog = page.locator('#mbb-revisions-dialog');
  const preview = dialog.locator('iframe');
  const confirm = page.locator('#mbb-revision-confirm');
  const review = page.locator('#mbb-revision-review');
  await expect(page.locator('#mbb-revision-list option')).toHaveCount(3);
  await expect(preview).toBeHidden();
  expect((await dialog.boundingBox()).height).toBeLessThan(page.viewportSize().height * 0.8);
  await expect(confirm).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('revisions-initial.png') });
  await page.locator('#mbb-revision-list').selectOption('1');
  await review.click();
  await expect(review).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(preview).toBeHidden();
  await expect.poll(() => Boolean(releasePreview)).toBe(true);
  releasePreview();
  await expect(confirm).toBeEnabled();
  await expect(preview).toBeVisible();
  await expect(page.frameLocator('#mbb-revisions-dialog iframe').locator('p')).toHaveText(
    'Verified preview',
  );
  await page.screenshot({ path: testInfo.outputPath('revisions-preview.png') });
  await page.locator('#mbb-revision-list').selectOption('2');
  await expect(preview).toBeHidden();
  await expect(confirm).toBeDisabled();
  await page.evaluate(() => (window.failRender = true));
  releasePreview = null;
  await review.click();
  await expect.poll(() => Boolean(releasePreview)).toBe(true);
  releasePreview();
  await expect(dialog.getByRole('status')).toHaveText('Synthetic preview failure');
  await expect(preview).toBeHidden();
  await expect(confirm).toBeDisabled();
  await page.locator('#mbb-revision-close').click();
  await expect(page.locator('#open')).toBeFocused();
  await page.locator('#open').click();
  await expect(preview).toBeHidden();
  await expect(confirm).toBeDisabled();
});

test('opaque revision preview hides its exact carrier with trusted styles without changing fallback or restore payload', async ({
  page,
}, info) => {
  await page.goto('/front?locale=en_US');
  await expect(page.locator('#inline-line mjx-container')).toBeVisible();
  const params = { values: [3, 2, 1], label: 'Original configuration 😀' },
    carrier = Buffer.from(JSON.stringify(params)).toString('base64'),
    html =
      '<h1 id="revision-title">Historical component</h1><p>Saved introduction.</p>' +
      '<div id="revision-component" class="wp-block-mbb-component" data-mbb-preview-range="r0">' +
      '<p data-mbb-generated="" class="mbb-component-params">' +
      carrier +
      '</p>' +
      '<div class="mbb-teaching-body"><h2 id="revision-fallback" data-mbb-preview-range="r1">Complete authored fallback</h2>' +
      '<p id="revision-explanation">Original explanation, not an interactive result.</p>' +
      '<p id="literal-carrier">Literal author text: ' +
      carrier +
      '</p>' +
      '<pre id="revision-formula" class="wp-block-mbb-math"><code>\\frac{x_i^2}{n}</code></pre>' +
      '</div></div><p><a href="#revision-fallback">Original local anchor</a></p>',
    initialPayload = {
      post_id: 12,
      expected: 'current-fingerprint',
      mode: 'restore',
      revision_id: 1,
      expected_revision: 'revision-1',
    },
    requests = [];
  await page.addStyleTag({
    content:
      'body{font:15px system-ui}' + fs.readFileSync(path.join(plugin, 'editor-ui.css'), 'utf8'),
  });
  await page.evaluate(
    (teachingStyle) => {
      window.wp = { data: { select: () => ({ isEditedPostDirty: () => false }) } };
      window.MBB_EDITOR = {
        postId: 12,
        state: { post_id: 12, expected: 'current-fingerprint' },
        url: (route) => '/revision-style-fixture/' + route,
        nonce: 'synthetic',
        teachingStyle,
      };
      const original = MBB_MATH.preview;
      window.revisionPreviewInputs = [];
      MBB_MATH.preview = async (html) => {
        revisionPreviewInputs.push(html);
        return original(html);
      };
    },
    fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8'),
  );
  await page.route('**/revision-style-fixture/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'revisions')
      return route.fulfill({
        json: {
          revisions: [
            {
              id: 1,
              date: '2026-10-18',
              title: 'Historical component',
              paired: true,
              expected_revision: 'revision-1',
            },
          ],
        },
      });
    const payload = route.request().postDataJSON();
    requests.push({ name, payload });
    if (name === 'save')
      return route.fulfill({
        status: 409,
        json: { message: 'Synthetic capture only; nothing written' },
      });
    expect(payload).toEqual(initialPayload);
    await route.fulfill({
      json: {
        adapter_digest: 'verified-adapter',
        before_title: 'Current',
        title: 'Historical component',
        before: 'current source',
        document: { source: 'exact historical source' },
        html,
      },
    });
  });
  await page.addScriptTag({ path: path.join(plugin, 'revisions-ui.js') });
  await page.evaluate(() => MBB_REVISIONS.open(12));
  await page.locator('#mbb-revision-list').selectOption('1');
  await page.locator('#mbb-revision-review').click();
  await expect(page.locator('#mbb-revision-confirm')).toBeEnabled();
  const preview = page.locator('#mbb-revisions-dialog iframe'),
    frame = page.frameLocator('#mbb-revisions-dialog iframe');
  expect(await preview.getAttribute('sandbox')).toBe('');
  await expect(frame.locator('.mbb-component-params')).toHaveCount(1);
  await expect(frame.locator('.mbb-component-params')).toHaveText(carrier);
  await expect(frame.locator('.mbb-component-params')).toBeHidden();
  await expect(frame.locator('#revision-fallback')).toBeVisible();
  await expect(frame.locator('#revision-explanation')).toHaveText(
    'Original explanation, not an interactive result.',
  );
  await expect(frame.locator('#literal-carrier')).toBeVisible();
  await expect(frame.locator('#literal-carrier')).toHaveText('Literal author text: ' + carrier);
  await expect(frame.locator('#revision-component')).toHaveAttribute(
    'data-mbb-preview-range',
    'r0',
  );
  await expect(frame.locator('#revision-fallback')).toHaveAttribute('data-mbb-preview-range', 'r1');
  await expect(frame.locator('a')).toHaveAttribute('href', '#revision-fallback');
  await expect(frame.locator('#revision-formula mjx-container[jax="CHTML"]')).toBeVisible();
  await expect(frame.locator('#revision-formula .mbb-typeset')).toHaveAttribute(
    'aria-label',
    '\\frac{x_i^2}{n}',
  );
  expect(await frame.locator('script,iframe').count()).toBe(0);
  expect(await page.evaluate(() => revisionPreviewInputs)).toEqual([html]);
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('revision-carrier-hidden.png') });
  await page.locator('#mbb-revision-confirm').click();
  await expect(page.locator('#mbb-revisions-dialog [role="status"]')).toHaveText(
    'Synthetic capture only; nothing written',
  );
  expect(requests).toEqual([
    { name: 'preview', payload: initialPayload },
    { name: 'save', payload: { ...initialPayload, adapter_digest: 'verified-adapter' } },
  ]);
});
