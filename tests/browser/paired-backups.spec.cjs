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
test('real recovery adoption reviews after its own change and remains reusable after closing', async ({
  page,
}, info) => {
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
  const payload = {
    content: '# Restored candidate\n',
    title: 'Restored',
    status: 'draft',
    featuredMedia: 0,
    documentId: 'RECOVERY',
  };
  const key = '_mbb_backup_' + 'f'.repeat(32);
  let previews = 0;
  await page.route('**/wp-json/mbb/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/recovery-context')) return route.fulfill({ json: context });
    if (path.endsWith('/paired-backups')) {
      if (route.request().method() === 'POST')
        return route.fulfill({
          json: { kind: 'markdown', context, currentContext: context, payload, stale: false },
        });
      return route.fulfill({
        json: {
          context,
          items: [{ key, created: 1780000000, baseline: context.baseline }],
          saved: '2026-10-17 00:00:00',
        },
      });
    }
    if (path.endsWith('/document'))
      return route.fulfill({ json: await page.evaluate(() => MBB_EDITOR.state) });
    if (path.endsWith('/preview')) {
      const body = route.request().postDataJSON();
      if (body.mode !== 'blocks') previews++;
      return route.fulfill({
        json: {
          document: await page.evaluate(
            (s) => MBB.importDocument(s, 'RECOVERY'),
            body.mode === 'blocks' ? '# Original\n\nOriginal body.\n' : body.source,
          ),
          title: body.title,
          post_status: 'draft',
          before: '# Original\n',
          html: '<p>Restored candidate</p>',
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/recovery-editor?locale=en_US&serverBackups');
  await page.locator('#mbb-more > summary').click();
  await page.locator('#mbb-recovery-open').click();
  const restore = page.getByRole('button', {
    name: 'Restore candidate and view differences',
    exact: true,
  });
  for (let n = 0; n < 2; n++) {
    await restore.click();
    await expect(page.locator('#mbb-source')).toHaveValue(payload.content);
    await expect(page.locator('#mbb-save')).toBeEnabled();
    await expect(page.locator('.mbb-server-backups')).toContainText(
      'The candidate is in the difference preview',
    );
    await expect(restore).toBeEnabled();
    await page.screenshot({ path: info.outputPath('restored-' + n + '.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close editing bridge', exact: true }).click();
  }
  expect(previews).toBe(2);
});
