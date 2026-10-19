const { test, expect } = require('@playwright/test'),
  fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process'),
  { pathToFileURL } = require('node:url'),
  crypto = require('node:crypto');
const main = path.resolve(__dirname, '../..'),
  root = process.env.MARKBRIDGE_TEST_TEACHER_ROOT,
  manifest = require(path.join(root, 'assets/manifest.json')),
  templates = require(path.join(root, 'assets/self-tests-templates.js'));
const fixture = (type) =>
  JSON.parse(
    execFileSync('php', [path.join(root, 'tests/self-tests-front.php')], {
      input: templates.create(type, 'sample-' + type),
      encoding: 'utf8',
    }),
  );
async function reader(page, type, { launch = true, failure } = {}) {
  const data = fixture(type);
  await page.goto('/front?locale=en_US');
  await expect(page.locator('#inline-line mjx-container')).toBeVisible();
  await page.route('**/self-test-resource/*', async (route) => {
    const file = path.basename(new URL(route.request().url()).pathname);
    if (!Object.values(manifest.payloads).includes(file)) return route.abort();
    await route.fulfill({
      body: fs.readFileSync(path.join(root, 'assets', file)),
      contentType: 'text/html; charset=utf-8',
    });
  });
  await page.addStyleTag({ path: path.join(main, 'plugin/teaching.css') });
  await page.evaluate(
    ({ html, providers, failure }) => {
      document.querySelector('main.mbb-reading').hidden = true;
      const article = document.createElement('article');
      article.className = 'mbb-reading mbb-document';
      article.id = 'lesson';
      article.innerHTML = html;
      if (failure === 'crypto')
        Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true });
      document.body.append(article);
      window.MBBComponents = (failure === 'missing' ? [] : providers).map((p) => ({
        ...p,
        resource: {
          ...p.resource,
          url: location.origin + '/self-test-resource/' + p.resource.url.split('/').at(-1),
        },
      }));
      window.MBB_COMPONENTS_READER = true;
      window.MBB_UI_LOCALE = 'en_US';
      window.activityEvents = [];
      window.addEventListener('message', (e) => {
        if (e.data?.protocol === 'mbb-component/v1') activityEvents.push(e.data);
      });
    },
    { ...data, failure },
  );
  await page.addScriptTag({ path: path.join(main, 'plugin/teaching.js') });

  await page.addScriptTag({ path: path.join(main, 'plugin/components.js') });
  await page.evaluate(() => MBB_MATH.typeset(document.querySelector('#lesson')));
  const component = page.locator('#sample-' + type),
    controls = component.locator(':scope > .mbb-teaching-body > .mbb-component-controls');
  expect(await controls.evaluate((node) => node.previousElementSibling.id)).toBe(
    'sample-' + type + (type === 'number' ? '-question' : '-c'),
  );
  const frame = page.frameLocator('.mbb-component-frame');
  if (launch) {
    await controls
      .getByRole('button', { name: 'Start interactive demonstration', exact: true })
      .click();
    await expect(frame.getByRole('button', { name: 'Check answer', exact: true })).toBeEnabled();
  }
  return { data, frame, component, controls };
}

const roles = ['correct', 'incorrect', 'explanation', 'hint1'];
const entry = (controls) =>
  controls.getByRole('button', {
    name: 'Read the complete activity',
    exact: true,
    includeHidden: true,
  });
async function expectClosed(component, controls, type) {
  await expect(
    controls.getByRole('button', { name: 'Start interactive demonstration', exact: true }),
  ).toBeVisible();
  await expect(entry(controls)).toBeHidden();
  await expect(component.locator('iframe')).toHaveCount(0);
  for (const role of roles)
    await expect(component.locator('#sample-' + type + '-' + role)).toBeHidden();
}
test('normal activity sessions keep static reading out of closed controls, mutually reveal feedback and reset on close', async ({
  page,
}, info) => {
  for (const type of ['choice', 'order', 'number']) {
    const { data, frame, component, controls } = await reader(page, type, { launch: false }),
      prefix = '#sample-' + type;
    await expectClosed(component, controls, type);
    await controls
      .getByRole('button', { name: 'Start interactive demonstration', exact: true })
      .click();
    await expect(frame.locator('#check')).toBeEnabled();
    const oldSession = await page.evaluate(
      () => activityEvents.filter((e) => e.type === 'ready').at(-1).session,
    );
    const check = async (correct) => {
      if (type === 'choice')
        await frame
          .getByRole('radio')
          .nth(correct ? 1 : 0)
          .check();
      else if (type === 'number') {
        await frame.getByRole('textbox').fill(correct ? '2' : '1');
        await frame.locator('#check').click();
      } else {
        if (correct) {
          await frame.getByRole('button', { name: 'Move up: b', exact: true }).click();
          await frame.getByRole('button', { name: 'Move up: c', exact: true }).click();
        } else if (
          await frame.getByRole('button', { name: 'Move up: b', exact: true }).isDisabled()
        )
          await frame.getByRole('button', { name: 'Move up: a', exact: true }).click();
        await frame.locator('#check').click();
      }
      await expect(frame.locator('#status')).toContainText(
        correct ? 'This answer matches.' : 'does not match yet',
      );
      await expect(controls.locator('.mbb-component-status')).toHaveClass(/mbb-component-complete/);
      await expect(component.locator(prefix + (correct ? '-correct' : '-incorrect'))).toBeVisible();
      await expect(component.locator(prefix + (correct ? '-incorrect' : '-correct'))).toBeHidden();
      await expect(component.locator(prefix + '-explanation')).toBeHidden();
    };
    await check(false);
    await check(true);
    await check(false);
    await frame.locator('#hint').click();
    await expect(component.locator(prefix + '-hint1')).toBeVisible();
    await frame.locator('#explain').click();
    await expect(component.locator(prefix + '-explanation')).toBeVisible();
    const explanation = component.locator(prefix + '-explanation');
    await expect(explanation.locator(':scope > .mbb-teaching-title')).toHaveCSS(
      'font-weight',
      '600',
    );
    for (const selector of [':scope > .mbb-teaching-title', ':scope > .mbb-teaching-body'])
      expect(
        await explanation
          .locator(selector)
          .evaluate((n) => parseFloat(getComputedStyle(n).paddingInlineStart)),
      ).toBeGreaterThanOrEqual(12);
    await explanation.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(type + '-disclosure-' + info.project.name + '.png'),
      fullPage: true,
    });
    await frame.locator('#reset').click();
    for (const role of roles) await expect(component.locator(prefix + '-' + role)).toBeHidden();
    await controls.getByRole('button', { name: 'Close interactive preview', exact: true }).click();
    await expectClosed(component, controls, type);
    await controls
      .getByRole('button', { name: 'Start interactive demonstration', exact: true })
      .click();
    await expect(frame.locator('#check')).toBeEnabled();
    expect(
      await page.evaluate(() => activityEvents.filter((e) => e.type === 'ready').at(-1).session),
    ).not.toBe(oldSession);
    for (const role of roles) await expect(component.locator(prefix + '-' + role)).toBeHidden();
    await controls.getByRole('button', { name: 'Close interactive preview', exact: true }).click();
    await page.emulateMedia({ media: 'print' });
    for (const role of roles) await expect(component.locator(prefix + '-' + role)).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
    // Existing article Full text remains an explicit way to read all authored roles.
    await page.evaluate(() => {
      const lesson = document.querySelector('#lesson'),
        course = document.createElement('div');
      course.dataset.mbbTeaching = 'steps';
      course.dataset.mbbTeachingConfig = JSON.stringify({
        mode: 'staged',
        previous: true,
        next: true,
        full: true,
      });
      course.innerHTML =
        '<p class="mbb-teaching-title">Static reading</p><div class="mbb-teaching-body"><div data-mbb-teaching="step"><p class="mbb-teaching-title">Question</p><div class="mbb-teaching-body"></div></div></div>';
      const part = lesson.querySelector('[data-mbb-teaching=component]');
      lesson.append(course);
      course.querySelector('[data-mbb-teaching=step] > .mbb-teaching-body').append(part);
      MarkBridgeTeaching.scan?.();
    });
    await page.getByRole('button', { name: 'Full text', exact: true }).click();
    for (const role of roles) await expect(component.locator(prefix + '-' + role)).toBeVisible();
    expect(data.document.source).toContain('self-check-' + type);
  }
});

test('only an explicit failed start offers complete static reading for missing, crypto, HTTP, digest and slot failures', async ({
  page,
}) => {
  for (const mode of ['missing', 'crypto', 'http', 'digest', 'busy']) {
    const { component, controls } = await reader(page, 'choice', { launch: false, failure: mode });
    await expectClosed(component, controls, 'choice');
    if (mode === 'http' || mode === 'digest') {
      await page.unroute('**/self-test-resource/*');
      await page.route('**/self-test-resource/*', (r) =>
        r.fulfill(
          mode === 'http'
            ? { status: 404, body: 'Missing' }
            : { contentType: 'text/plain', body: 'Changed immutable payload' },
        ),
      );
    }
    if (mode === 'busy') {
      const raw = fs.readFileSync(path.join(main, 'tests/browser/fixtures/component.html'), 'utf8'),
        sha = crypto.createHash('sha256').update(raw).digest('hex');
      await page.route('**/busy-resource.html.txt', (r) =>
        r.fulfill({ contentType: 'text/plain', body: raw }),
      );
      await page.evaluate((sha) => {
        const provider = {
          id: 'bounded-slot-fixture',
          version: '0.1.0',
          title: 'Bounded slots',
          protocolVersion: 1,
          minMarkBridge: '2.0.3',
          resource: { url: location.origin + '/busy-resource.html.txt', sha256: sha },
          budgets: {
            resourceBytes: 524288,
            startupMs: 5000,
            wallMs: 2000,
            traceFrames: 8192,
            traceBytes: 524288,
          },
        };
        MBBComponents.push(provider);
        for (let i = 0; i < 4; i++) {
          const node = document.createElement('div');
          node.id = 'slot-' + i;
          node.dataset.mbbTeaching = 'component';
          node.dataset.mbbTeachingConfig = JSON.stringify({
            component: provider.id,
            componentVersion: provider.version,
            params: { value: 42, behavior: 'complete' },
            status: 'available',
          });
          node.innerHTML = '<div class="mbb-teaching-body"><p>Static slot</p></div>';
          document.body.append(node);
        }
        MarkBridgeComponents.scan();
      }, sha);
      for (let i = 0; i < 4; i++) {
        const node = page.locator('#slot-' + i);
        await node
          .getByRole('button', { name: 'Start interactive demonstration', exact: true })
          .click();
        await expect(node).toHaveAttribute('data-mbb-component-state', 'ready');
      }
    }
    await controls
      .getByRole('button', { name: 'Start interactive demonstration', exact: true })
      .click();
    await expect(component).toHaveAttribute(
      'data-mbb-failure-code',
      {
        missing: 'UNAVAILABLE',
        crypto: 'UNSUPPORTED',
        http: 'HTTP',
        digest: 'DIGEST',
        busy: 'BUSY',
      }[mode],
    );
    await expect(entry(controls)).toBeVisible();
    for (const role of roles)
      await expect(component.locator('#sample-choice-' + role)).toBeHidden();
    await entry(controls).click();
    for (const role of roles)
      await expect(component.locator('#sample-choice-' + role)).toBeVisible();
    await expect(component.locator('iframe')).toHaveCount(0);
  }
});

test('static activity output remains complete without scripts and through the normal static builder', async ({
  page,
  browser,
}, info) => {
  const { data } = await reader(page, 'choice', { launch: false });
  const assets = JSON.parse(fs.readFileSync(path.join(main, 'plugin/assets.json')));
  await page.addScriptTag({ path: path.join(main, 'plugin', assets['static-export.js']) });
  const html = await page.evaluate(
      async (d) => (await MarkBridgeStaticExport.build(d)).text(),
      data.descriptor,
    ),
    file = info.outputPath('activity-static.html');
  fs.writeFileSync(file, html);
  expect(html).not.toMatch(/<script|<iframe/);
  const context = await browser.newContext({
      javaScriptEnabled: false,
      offline: true,
      viewport: info.project.use.viewport,
    }),
    p = await context.newPage();
  await p.goto(pathToFileURL(file).href);
  for (const role of roles) await expect(p.locator('#sample-choice-' + role)).toBeVisible();
  await p.setContent(
    '<style>' +
      fs.readFileSync(path.join(main, 'plugin/teaching.css'), 'utf8') +
      '</style>' +
      data.html,
  );
  for (const role of roles) await expect(p.locator('#sample-choice-' + role)).toBeVisible();
  await context.close();
});
