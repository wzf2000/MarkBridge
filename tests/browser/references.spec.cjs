const { test, expect } = require('@playwright/test');
test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'Needs actual WordPress editor runtime.');
test('reference panel uses opening CAS, inserts closed marker and remains bounded', async ({
  page,
}, info) => {
  await page.setViewportSize(
    info.project.name.startsWith('mobile')
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
  const source = '# Original\n\nOriginal body.\n';
  let changed = false,
    prepares = 0;
  const ns = 'S_' + '1'.repeat(32),
    doc = 'D_' + '2'.repeat(32);
  await page.route('**/wp-json/mbb/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/preview'))
      return route.fulfill({
        json: { document: { source }, title: 'Original', post_status: 'draft' },
      });
    if (url.pathname.endsWith('/document'))
      return route.fulfill({
        json: {
          post_id: 12,
          expected: changed ? 'other-author' : 'baseline-1',
          title: 'Original',
          post_status: 'draft',
          featured_media: 0,
          source_managed: false,
          document: {
            schema: 1,
            documentId: 'RECOVERY',
            source,
            serialized: await page.evaluate(
              (s) => MBB.importDocument(s, 'RECOVERY').serialized,
              source,
            ),
          },
        },
      });
    if (url.pathname.endsWith('/references/status'))
      return route.fulfill({ json: { state: 'ready' } });
    if (url.pathname.endsWith('/references/search'))
      return route.fulfill({
        json: {
          items: [
            {
              target: { namespace: ns, document: doc, target: 'eq-one', kind: 'equation' },
              title: 'Energy conservation',
              article: 'Readable draft',
              label: 'Equation 1',
            },
          ],
          cursor: null,
        },
      });
    if (url.pathname.endsWith('/references/prepare')) {
      prepares++;
      return route.fulfill({ status: 500, json: { message: 'Unexpected prepare' } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/recovery-editor?locale=en_US');
  await page.evaluate(() => {
    window.MBB_REFERENCES = { manageUrl: '/settings' };
  });
  await page.getByRole('button', { name: 'Markdown edit / upload', exact: true }).click();
  await page.getByText('Find, replace and navigate', { exact: true }).click();
  const tools = page.locator('.mbb-source-tools .mbb-writing-tools');
  await tools.locator('summary').first().click();
  const panel = tools.locator('.mbb-reference-tools');
  await panel.locator('summary').first().click();
  await expect(panel).toContainText('Document identity is not enabled');
  await panel.getByRole('button', { name: 'Search reference targets', exact: true }).click();
  await expect(panel).toContainText('Energy conservation · Readable draft');
  await panel
    .getByRole('button', { name: 'Insert reference', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('reference-target-picker.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Insert reference', exact: true }).click();
  await expect(page.locator('#mbb-source')).toHaveValue(/data-mbb-version="2"/);
  changed = true;
  await panel.getByRole('button', { name: 'Enable document references', exact: true }).click();
  await expect(panel).toContainText('The article has newer changes. Reload and merge them.');
  expect(prepares).toBe(0);
  expect(await panel.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
  await page
    .locator('#mbb-dialog')
    .getByRole('button', { name: 'Close editing bridge', exact: true })
    .click();
  await page.locator('#mbb-more > summary').click();
  const nativeTools = page.locator('#mbb-toolbar .mbb-writing-tools');
  await nativeTools.locator(':scope > summary').click();
  const nativePanel = nativeTools.locator('.mbb-reference-tools');
  await nativePanel.locator(':scope > summary').click();
  await nativePanel.getByRole('button', { name: 'Search reference targets', exact: true }).click();
  await expect(nativePanel.locator('.mbb-reference-result > span')).toBeVisible();
  await expect(nativePanel.locator('.mbb-reference-result > span')).toHaveText(
    'Energy conservation · Readable draft',
  );
  await nativePanel.locator('.mbb-reference-result').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('native-reference-target-picker.png'),
    fullPage: true,
  });
});
test('neutral reader rechecks target before navigation and clears on revocation', async ({
  page,
}) => {
  await page.goto('/health');
  await page.setContent(
    '<span class="mbb-xref" data-mbb-version="2" data-mbb-target="eq-one" data-mbb-namespace="S_' +
      '1'.repeat(32) +
      '" data-mbb-document="D_' +
      '2'.repeat(32) +
      '" data-mbb-kind="equation">[eq-one]</span>',
  );
  let allowed = true;
  await page.route('**/reference-nonce', (r) => r.fulfill({ json: { nonce: null } }));
  await page.route('**/resolve', (r) =>
    r.fulfill({
      json: {
        items: [
          allowed
            ? {
                state: 'available',
                label: 'Equation 1',
                title: 'Readable title',
                article: 'Article',
                url: '/target#eq-one',
              }
            : { state: 'unavailable' },
        ],
      },
    }),
  );
  await page.evaluate(() => {
    window.MBB_REFERENCES = {
      url: location.origin + '/__route__',
      ajax: location.origin + '/reference-nonce',
    };
  });
  await page.addScriptTag({ url: '/plugin/references-ui.js' });
  await page.evaluate(() => dispatchEvent(new Event('pageshow')));
  await expect(page.getByRole('link', { name: 'Equation 1' })).toBeVisible();
  allowed = false;
  await page.getByRole('link', { name: 'Equation 1' }).click();
  await expect(page.locator('.mbb-xref')).toHaveText('[eq-one]');
  await expect(page.getByRole('link')).toHaveCount(0);
});
test('ordinary identity imports choose copy by default, retain ZIP scope and reuse prepared tuples', async ({
  page,
}) => {
  const before = { namespace: 'S_' + 'a'.repeat(32), document: 'D_' + 'b'.repeat(32) },
    after = { namespace: 'S_' + 'c'.repeat(32), document: 'D_' + 'd'.repeat(32) };
  let prepares = 0;
  await page.route('**/wp-json/mbb/v1/references/prepare', async (route) => {
    const input = route.request().postDataJSON();
    prepares++;
    const tuple = input.action === 'migrate' ? before : after;
    const source = input.source
      .replace(before.namespace, tuple.namespace)
      .replace(before.document, tuple.document);
    return route.fulfill({
      json: {
        post_id: input.post_id,
        expected: input.expected,
        document: { source, documentId: input.documentId },
        identity_receipt: 'receipt-' + input.action,
      },
    });
  });
  await page.goto('/recovery-editor?new&locale=en_US');
  await page.evaluate(() => {
    window.MBB_REFERENCES = { manageUrl: '/settings' };
  });
  await page.getByRole('button', { name: '新 Markdown 草稿', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Logical identity handling', exact: true }),
  ).toHaveValue('copy');
  const result = await page.evaluate(
    async ({ before, after }) => {
      const source = ':::mbb:v1 identity ' + JSON.stringify(before) + '\n\n:::mbb:end\n\nBody.\n',
        payload = {
          mode: 'upload',
          post_id: 0,
          expected: null,
          documentId: 'ZIP_SCOPE',
          source,
          resource_import: { schema: 1, token: 'x'.repeat(64), ack_public_media: true },
        };
      const first = await MBBReferences.prepareImport(payload, 'copy', null),
        retry = await MBBReferences.prepareImport(payload, 'copy', null),
        migrate = await MBBReferences.prepareImport(payload, 'migrate', null);
      return { first, retry, migrate };
    },
    { before, after },
  );
  expect(prepares).toBe(2);
  expect(result.first).toEqual(result.retry);
  expect(result.first.documentId).toBe('ZIP_SCOPE');
  expect(result.first.resource_import.token).toBe('x'.repeat(64));
  expect(result.first.source).toContain(after.document);
  expect(result.migrate.source).toContain(before.document);
  expect(result.first.identity_receipt).toBe('receipt-import-copy');
  expect(result.migrate.identity_receipt).toBe('receipt-migrate');
});
