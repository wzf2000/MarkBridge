// The fixture never leaves localhost. Exclude it from developer/CI HTTP proxies.
for (const key of ['NO_PROXY', 'no_proxy'])
  process.env[key] = [process.env[key], '127.0.0.1', 'localhost'].filter(Boolean).join(',');
const { defineConfig, devices } = require('@playwright/test');
const fixturePort = Number(process.env.MARKBRIDGE_TEST_BROWSER_PORT || 8765);
if (!Number.isInteger(fixturePort) || fixturePort < 1024 || fixturePort > 65535)
  throw Error('MARKBRIDGE_TEST_BROWSER_PORT must be a local unprivileged port.');
const fixtureOrigin = 'http://127.0.0.1:' + fixturePort;
const chromiumOptions = process.env.MARKBRIDGE_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.MARKBRIDGE_CHROMIUM_PATH } }
  : {};
const compatibilityTests = /(?:theme-contract|compatibility|diagnostics)\.spec\.cjs$/;
const additionalProjects =
  process.env.MARKBRIDGE_CROSS_BROWSER === '1'
    ? ['firefox', 'webkit'].flatMap((browserName) => [
        {
          name: `desktop-${browserName}`,
          testMatch: compatibilityTests,
          use: { browserName, viewport: { width: 1440, height: 900 } },
        },
        {
          name: `mobile-${browserName}`,
          testMatch: compatibilityTests,
          use: {
            browserName,
            viewport: { width: 390, height: 844 },
            hasTouch: true,
            ...(browserName === 'webkit' ? { isMobile: true } : {}),
          },
        },
      ])
    : [];

module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  testIgnore: process.env.MARKBRIDGE_BENCHMARK === '1' ? [] : ['**/performance.spec.cjs'],
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: fixtureOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], ...chromiumOptions } },
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 13'], browserName: 'chromium', ...chromiumOptions },
    },
    ...additionalProjects,
  ],
  webServer: {
    command: 'node tests/browser/server.cjs',
    url: fixtureOrigin + '/health',
    reuseExistingServer: !process.env.CI && process.env.MARKBRIDGE_REUSE_BROWSER_FIXTURE === '1',
    timeout: 15_000,
  },
});
