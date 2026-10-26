const { test, expect } = require('@playwright/test');
const id = 'B_' + 'a'.repeat(32);
const candidate = {
  schema: 1,
  title: 'Course candidate',
  lang: 'en-US',
  rights: '',
  cover: null,
  privateOptIn: false,
  chapters: [{ key: 'C_' + 'b'.repeat(32), post_id: 12 }],
};
test('collection configuration candidate cancels intact, adopts a new unsaved ID and loses stale authority', async ({
  page,
}) => {
  let saved = { ...candidate, title: 'Existing collection' },
    posts = [],
    checks = 0,
    hold,
    release;
  const summary = (c) =>
    c.chapters.map((ch) => ({
      key: ch.key,
      state: 'available',
      title: 'Available article',
      status: 'publish',
    }));
  await page.route(
    (url) => url.pathname.startsWith('/wp-json/mbb/v1/collections'),
    async (route) => {
      const req = route.request(),
        p = new URL(req.url()).pathname.split('/collections')[1] || '';
      let data;
      if (p === '/configuration-candidate') {
        checks++;
        if (hold) await hold;
        data = { config: req.postDataJSON().config, chapterSummaries: summary(candidate) };
      } else if (p === '/' + id)
        data = {
          collection_id: id,
          revision: null,
          config: saved,
          chapterSummaries: summary(saved),
        };
      else if (req.method() === 'POST') {
        posts.push(req.postDataJSON());
        data = {
          collection_id: id,
          revision: null,
          config: req.postDataJSON().config,
          chapterSummaries: summary(candidate),
        };
      } else
        data = {
          schema: 1,
          revision: null,
          items: [{ id, title: saved.title, chapters: 1 }],
          limits: {},
          adapters: {},
        };
      await route.fulfill({ json: data });
    },
  );
  await page.goto('/collections-editor?locale=en_US');
  await expect(page.getByLabel('Saved collections', { exact: true })).toBeVisible();
  await page.getByLabel('Saved collections', { exact: true }).selectOption(id);
  await expect(page.getByLabel('Collection title', { exact: true })).toHaveValue(
    'Existing collection',
  );
  const propose = () =>
    page.evaluate((c) => {
      window.candidateResult = null;
      MarkBridgeCollections.proposeConfiguration(c).then((v) => {
        window.candidateResult = v;
      });
    }, candidate);
  await propose();
  await expect(
    page.getByRole('heading', { name: 'Collection configuration candidate' }),
  ).toBeVisible();
  expect(posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.candidateResult)).toBe(false);
  await expect(page.getByLabel('Saved collections', { exact: true })).toHaveValue(id);
  await expect(page.getByLabel('Collection title', { exact: true })).toHaveValue(
    'Existing collection',
  );
  await propose();
  await page.getByRole('button', { name: 'Adopt as new collection' }).click();
  await expect.poll(() => page.evaluate(() => window.candidateResult)).toBe(true);
  await expect(page.getByLabel('Saved collections', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Collection title', { exact: true })).toHaveValue(
    'Course candidate',
  );
  expect(posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Save collection configuration' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].collection_id).toBe(null);
  await expect(page.getByLabel('Saved collections', { exact: true })).toHaveValue(id);
  hold = new Promise((r) => {
    release = r;
  });
  await propose();
  await page.getByLabel('Collection title', { exact: true }).fill('Later input');
  release();
  hold = null;
  await expect.poll(() => page.evaluate(() => window.candidateResult)).toBe(false);
  await expect(
    page.getByRole('heading', { name: 'Collection configuration candidate' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Collection title', { exact: true })).toHaveValue('Later input');
  expect(checks).toBeGreaterThanOrEqual(4);
});
