const { test, expect } = require('@playwright/test');
test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'Needs the real WordPress editor runtime.');
for (const plain of [false, true]) {
  test(
    'paired backup ' +
      (plain ? 'plain' : 'pretty') +
      ' URLs, debounce, invalid input, old save tickets and cancellation preserve editing',
    async ({ page }, info) => {
      const context = {
        schema: 1,
        siteKey: 'a'.repeat(64),
        userKey: 'b'.repeat(64),
        postId: 12,
        newKey: null,
        identity: 'c'.repeat(64),
        baseline: 'd'.repeat(64),
        permission: 'e'.repeat(64),
        expected: 'baseline-1',
        sourceDigest: null,
        sourceManaged: false,
        sourceWriteAvailable: false,
      };
      const writes = [];
      let fail = false;
      await page.route(/\/(?:wp-json\/mbb\/v1\/|index\.php\?rest_route=)/, async (route) => {
        const url = new URL(route.request().url());
        const path = url.searchParams.get('rest_route') || url.pathname;
        if (path.endsWith('/recovery-context')) return route.fulfill({ json: context });
        if (path.endsWith('/paired-backups')) {
          if (route.request().method() === 'POST') {
            writes.push(route.request().postDataJSON());
            if (fail)
              return route.fulfill({ status: 422, json: { message: 'Invalid synthetic input' } });
          }
          return route.fulfill({
            json: {
              context,
              items:
                writes.length && !fail
                  ? [
                      {
                        key: '_mbb_backup_' + 'f'.repeat(32),
                        kind: 'markdown',
                        baseline: context.baseline,
                        created: 1780000000,
                        expires: 1780604800,
                      },
                    ]
                  : [],
              saved: '2026-10-17 00:00:00',
            },
          });
        }
        return route.fulfill({ json: {} });
      });
      await page.clock.install();
      await page.goto('/recovery-editor?locale=en_US&serverBackups' + (plain ? '&plainRest' : ''));
      await expect(page.locator('.mbb-server-backups')).toHaveCount(1);
      await page.locator('#mbb-more > summary').click();
      await page.locator('#mbb-recovery-open').click();
      await expect(page.locator('.mbb-server-backups')).toContainText('Last formal save:');
      const capture = () =>
        page.evaluate(() => {
          window.backupCapture = () => ({
            postId: 12,
            expected: 'baseline-1',
            sourceDigest: null,
            payload: {
              content: '# Unsaved\n',
              title: 'Unsaved',
              status: 'draft',
              featuredMedia: 0,
              documentId: 'RECOVERY',
            },
          });
          window.oldBackupTicket = MarkBridgePairedBackups.ticket();
          MarkBridgePairedBackups.changed('markdown', backupCapture);
        });
      await capture();
      await page.clock.fastForward(29999);
      expect(writes).toHaveLength(0);
      await page.clock.fastForward(1);
      await expect.poll(() => writes.length).toBe(1);
      await expect(page.locator('.mbb-server-backups')).toContainText('Last paired backup:');
      await capture();
      await page.evaluate(() => MarkBridgePairedBackups.saved(oldBackupTicket));
      await page.clock.fastForward(60000);
      await expect.poll(() => writes.length).toBe(2);
      fail = true;
      await capture();
      await page.clock.fastForward(60000);
      await expect(page.locator('.mbb-server-backups')).toContainText(
        'Paired backup failed. Current input remains in the editor.',
      );
      await capture();
      await page
        .getByRole('checkbox', { name: 'Enable paired backups while this page is open' })
        .uncheck();
      await page.clock.fastForward(60000);
      expect(writes).toHaveLength(3);
      await page.screenshot({ path: info.outputPath('paired-backups.png'), fullPage: true });
    },
  );
}
