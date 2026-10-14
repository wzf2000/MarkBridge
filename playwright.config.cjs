// The fixture never leaves localhost. Exclude it from developer/CI HTTP proxies.
for (const key of ['NO_PROXY', 'no_proxy'])
  process.env[key] = [process.env[key], '127.0.0.1', 'localhost'].filter(Boolean).join(',');
const { defineConfig, devices } = require('@playwright/test');
const fixturePort = Number(process.env.MARKBRIDGE_TEST_BROWSER_PORT || 8765);
if (!Number.isInteger(fixturePort) || fixturePort < 1024 || fixturePort > 65535)
  throw Error('MARKBRIDGE_TEST_BROWSER_PORT must be a local unprivileged port.');
const fixtureOrigin = 'http://127.0.0.1:' + fixturePort;

module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: fixtureOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.MARKBRIDGE_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.MARKBRIDGE_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'node tests/browser/server.cjs',
    url: fixtureOrigin + '/health',
    reuseExistingServer: !process.env.CI && process.env.MARKBRIDGE_REUSE_BROWSER_FIXTURE === '1',
    timeout: 15_000,
  },
});
