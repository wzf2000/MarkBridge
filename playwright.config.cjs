// The fixture never leaves localhost. Exclude it from developer/CI HTTP proxies.
for (const key of ['NO_PROXY', 'no_proxy'])
  process.env[key] = [process.env[key], '127.0.0.1', 'localhost'].filter(Boolean).join(',');
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8765',
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
    url: 'http://127.0.0.1:8765/health',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
