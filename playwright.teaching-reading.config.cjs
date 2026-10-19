// Explicit integration profile: immutable Teacher resources are external build inputs.
const fs = require('node:fs'),
  path = require('node:path'),
  { defineConfig } = require('@playwright/test');
for (const key of [
  'MARKBRIDGE_TEST_TEACHER_ROOT',
  'MARKBRIDGE_TEST_RUNTIME',
  'MARKBRIDGE_TEST_WORDPRESS_ROOT',
])
  if (!process.env[key]) throw Error('Teaching reading integration requires explicit ' + key);
for (const file of [
  'assets/manifest.json',
  'tests/self-tests-front.php',
  'assets/self-tests-templates.js',
])
  if (!fs.statSync(path.join(process.env.MARKBRIDGE_TEST_TEACHER_ROOT, file)).isFile())
    throw Error('Teacher integration input is not a source file');
process.env.MARKBRIDGE_TEST_MAIN_ROOT = __dirname;
const core = require('./playwright.config.cjs');
module.exports = defineConfig({
  ...core,
  testDir: './tests/integration',
  testMatch: 'activity-reading.spec.cjs',
  timeout: 60000,
  projects: core.projects.filter((p) => p.name.endsWith('-chromium')),
});
