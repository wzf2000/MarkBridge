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
