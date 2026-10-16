const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

// Optional local observation, excluded from ordinary suites by playwright.config.cjs.
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted.at(-1) };
};
for (const fixture of [
  { name: 'small', formulas: 2, lines: 20 },
  { name: 'long', formulas: 24, lines: 400 },
]) {
  test(`fixed ${fixture.name} formula and code performance samples`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    test.skip(process.env.MARKBRIDGE_BENCHMARK !== '1', 'Opt in to local performance observation.');
    const samples = [];
    for (let repeat = 0; repeat < 5; repeat++) {
      // Separate context clears browser HTTP cache; the second navigation reuses it.
      const context = await browser.newContext({ viewport: info.project.use.viewport });
      try {
        const page = await context.newPage();
        for (const cache of ['cold-context', 'warm-context']) {
          let requests = 0;
          const count = () => requests++;
          page.on('request', count);
          const navigationStart = Date.now();
          await page.goto(new URL('/front', info.project.use.baseURL).href);
          await expect(page.locator('#inline-line mjx-container[jax="CHTML"]')).toBeVisible();
          await expect(page.locator('#long-code .token').first()).toBeVisible();
          const metrics = await page.evaluate(async ({ formulas, lines }) => {
            await document.fonts.ready;
            // Detached content keeps automatic observers from racing the timed operations.
            const host = document.createElement('section');
            for (let i = 0; i < formulas; i++) {
              const math = document.createElement('span');
              math.className = 'mbb-math';
              math.dataset.mbbTex = `\\frac{${i + 1}}{n^2}+\\sqrt{x+${i}}`;
              host.append(math);
            }
            const pre = document.createElement('pre'),
              code = document.createElement('code');
            code.className = 'language-javascript';
            code.textContent = Array.from(
              { length: lines },
              (_, i) => `const value${i} = ${i}; // synthetic benchmark`,
            ).join('\n');
            pre.append(code);
            host.append(pre);
            const sourceBytes = new TextEncoder().encode(
              host.textContent +
                [...host.querySelectorAll('.mbb-math')].map((n) => n.dataset.mbbTex).join(''),
            ).length;
            const mathStart = performance.now();
            await MBB_MATH.typeset(host);
            const mathMs = performance.now() - mathStart;
            const codeStart = performance.now();
            Prism.highlightElement(code);
            const highlightMs = performance.now() - codeStart;
            document.querySelector('article').append(host);
            await document.fonts.ready;
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            const resources = performance.getEntriesByType('resource');
            return {
              mathMs,
              highlightMs,
              sourceBytes,
              rendered: host.querySelectorAll('mjx-container[jax="CHTML"]').length,
              resourceEntries: resources.length,
              transferBytes: resources.reduce((n, r) => n + r.transferSize, 0),
              encodedBytes: resources.reduce((n, r) => n + r.encodedBodySize, 0),
              decodedBytes: resources.reduce((n, r) => n + r.decodedBodySize, 0),
            };
          }, fixture);
          expect(metrics.rendered).toBe(fixture.formulas);
          samples.push({
            repeat: repeat + 1,
            cache,
            navigationAndWorkMs: Date.now() - navigationStart,
            requests,
            ...metrics,
          });
          page.off('request', count);
        }
      } finally {
        await context.close();
      }
    }
    const distributions = Object.fromEntries(
      ['cold-context', 'warm-context'].map((cache) => [
        cache,
        Object.fromEntries(
          [
            'navigationAndWorkMs',
            'mathMs',
            'highlightMs',
            'requests',
            'resourceEntries',
            'transferBytes',
            'encodedBytes',
            'decodedBytes',
          ].map((key) => [
            key,
            summarize(
              samples.filter((sample) => sample.cache === cache).map((sample) => sample[key]),
            ),
          ]),
        ),
      ]),
    );
    const assetsPath = path.join(__dirname, '../../plugin/assets.json');
    const report = {
      schema: 1,
      fixture,
      browser: browser.browserType().name(),
      version: browser.version(),
      project: info.project.name,
      viewport: info.project.use.viewport,
      network:
        'localhost fixture, no throttling; cold/warm browser context, OS/server caches uncontrolled',
      units: { duration: 'ms', size: 'bytes' },
      builtAssetBytes: Object.values(JSON.parse(fs.readFileSync(assetsPath, 'utf8')))
        .filter((value) => typeof value === 'string')
        .reduce((total, file) => {
          const asset = path.join(__dirname, '../../plugin', file);
          return (
            total +
            (fs.existsSync(asset) && fs.statSync(asset).isFile() ? fs.statSync(asset).size : 0)
          );
        }, 0),
      samples,
      distributions,
    };
    const output = info.outputPath(`performance-${fixture.name}.json`);
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    await info.attach('performance-samples', { path: output, contentType: 'application/json' });
  });
}

test('fixed component cold and warm startup and explicit execution samples', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  test.skip(process.env.MARKBRIDGE_BENCHMARK !== '1', 'Opt in to local performance observation.');
  const crypto = require('node:crypto');
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/component.html'));
  const sha256 = crypto.createHash('sha256').update(html).digest('hex');
  const source = fs.readFileSync(path.join(__dirname, '../../plugin/components.js'), 'utf8');
  const samples = [];
  for (let repeat = 0; repeat < 5; repeat++) {
    const context = await browser.newContext({ viewport: info.project.use.viewport });
    try {
      const page = await context.newPage();
      for (const cache of ['cold-context', 'warm-context']) {
        await page.goto(new URL('/health', info.project.use.baseURL).href);
        const resource = new URL('/component-fixture.html', page.url()).href;
        const provider = {
          id: 'fixture',
          version: '0.1.0',
          title: 'Fixed fixture',
          protocolVersion: 1,
          budgets: {
            resourceBytes: 524288,
            startupMs: 5000,
            wallMs: 2000,
            traceFrames: 8192,
            traceBytes: 524288,
          },
          resource: { url: resource, sha256 },
        };
        const config = {
          status: 'available',
          component: 'fixture',
          componentVersion: '0.1.0',
          params: { value: 42, behavior: 'complete' },
        };
        await page.setContent(
          `<meta name="viewport" content="width=device-width,initial-scale=1"><article><section id="benchmark-component" data-mbb-teaching="component" data-mbb-teaching-config='${JSON.stringify(config)}'><div class="mbb-teaching-body">Synthetic static fallback.</div></section></article>`,
        );
        await page.evaluate((provider) => {
          window.MBBComponents = [provider];
        }, provider);
        await page.addScriptTag({ content: source });
        let requests = 0,
          componentRequests = 0;
        const count = (request) => {
          requests++;
          if (request.url() === resource) componentRequests++;
        };
        page.on('request', count);
        const responsePromise = page.waitForResponse((response) => response.url() === resource);
        await page.evaluate(() => {
          const node = document.getElementById('benchmark-component');
          window.componentSample = {};
          const observer = new MutationObserver(() => {
            if (node.dataset.mbbComponentState === 'ready') {
              componentSample.ready = performance.now();
              observer.disconnect();
            }
          });
          observer.observe(node, {
            attributes: true,
            attributeFilter: ['data-mbb-component-state'],
          });
          window.addEventListener('message', (event) => {
            if (
              event.source !== node.querySelector('iframe')?.contentWindow ||
              event.data?.protocol !== 'mbb-component/v1'
            )
              return;
            if (event.data.type === 'run-request') {
              componentSample.runId = event.data.runId;
              componentSample.runStart = performance.now();
            } else if (
              event.data.type === 'complete' &&
              event.data.runId === componentSample.runId
            ) {
              componentSample.complete = performance.now();
            }
          });
          componentSample.start = performance.now();
          node.querySelector('.mbb-component-toggle').click();
        });
        const component = page.locator('#benchmark-component');
        await expect(component).toHaveAttribute('data-mbb-component-state', 'ready');
        const response = await responsePromise;
        const actualResourceBytes = (await response.body()).length;
        const frame = page.frameLocator('.mbb-component-frame');
        await expect(frame.locator('#status')).toHaveText('Ready');
        // Exactly one explicit algorithm run per sample; startup never runs it.
        await frame.getByRole('button', { name: 'Run fixed fixture' }).click();
        await expect(frame.locator('#status')).toHaveText('Complete');
        await page.waitForFunction(() => Number.isFinite(window.componentSample?.complete));
        const metrics = await page.evaluate((resource) => {
          const sample = window.componentSample;
          const timing = performance.getEntriesByName(resource, 'resource').at(-1);
          if (!timing) throw Error('Component resource timing is missing');
          return {
            startupToReadyMs: sample.ready - sample.start,
            resourceDownloadMs: timing.responseEnd - timing.startTime,
            postDownloadToReadyMs: sample.ready - timing.responseEnd,
            explicitRunToCompleteMs: sample.complete - sample.runStart,
            transferBytes: timing.transferSize,
            encodedBytes: timing.encodedBodySize,
            decodedBytes: timing.decodedBodySize,
          };
        }, resource);
        samples.push({
          repeat: repeat + 1,
          cache,
          requests,
          componentRequests,
          actualResourceBytes,
          ...metrics,
        });
        page.off('request', count);
      }
    } finally {
      await context.close();
    }
  }
  const keys = [
    'startupToReadyMs',
    'resourceDownloadMs',
    'postDownloadToReadyMs',
    'explicitRunToCompleteMs',
    'requests',
    'componentRequests',
    'actualResourceBytes',
    'transferBytes',
    'encodedBytes',
    'decodedBytes',
  ];
  const distributions = Object.fromEntries(
    ['cold-context', 'warm-context'].map((cache) => [
      cache,
      Object.fromEntries(
        keys.map((key) => [
          key,
          summarize(
            samples.filter((sample) => sample.cache === cache).map((sample) => sample[key]),
          ),
        ]),
      ),
    ]),
  );
  const report = {
    schema: 1,
    fixture: 'component.html, value=42, behavior=complete',
    resourceSha256: sha256,
    browser: browser.browserType().name(),
    version: browser.version(),
    project: info.project.name,
    viewport: info.project.use.viewport,
    units: { duration: 'ms', size: 'bytes' },
    conditions:
      'Loopback HTTP fixture, no throttling or route interception; new context then same-context navigation. OS/server caches uncontrolled; server cache headers govern HTTP reuse. Component host script is preloaded from source before timing.',
    stages: {
      startupToReadyMs: 'Host launch click to parent ready state',
      resourceDownloadMs:
        'ResourceTiming startTime to responseEnd, includes scheduling/headers/body',
      postDownloadToReadyMs:
        'Download end to parent ready; mixes SHA verification, iframe construction/loading and protocol handshake',
      explicitRunToCompleteMs:
        'Parent receives explicit run-request to matching complete; includes grant and Worker startup/execution',
      actualResourceBytes:
        'Actual response body byte length, including cache-delivered bodies; not network transfer bytes',
    },
    samples,
    distributions,
  };
  const output = info.outputPath('performance-component.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  await info.attach('component-performance-samples', {
    path: output,
    contentType: 'application/json',
  });
});
