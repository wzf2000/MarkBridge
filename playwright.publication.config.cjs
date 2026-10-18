// Explicit integration profile: optional external inputs never enter the core zero-skip suite.
const fs = require('node:fs'),
  path = require('node:path'),
  { defineConfig } = require('@playwright/test');
for (const key of ['MARKBRIDGE_TEST_PUBLISHER_ROOT', 'MARKBRIDGE_TEST_PUBLICATION_INPUTS'])
  if (!process.env[key]) throw Error('Publication integration requires explicit ' + key);
for (const file of [
  path.join(process.env.MARKBRIDGE_TEST_PUBLISHER_ROOT, 'plugin/publisher.js'),
  path.join(process.env.MARKBRIDGE_TEST_PUBLISHER_ROOT, 'plugin/zip.js'),
  process.env.MARKBRIDGE_TEST_PUBLICATION_INPUTS,
])
  if (!fs.statSync(file).isFile()) throw Error('Publication integration input is not a file');
const core = require('./playwright.config.cjs');
module.exports = defineConfig({
  ...core,
  testDir: './tests/integration',
  testMatch: 'static-export-publication.spec.cjs',
  projects: core.projects.filter((project) => project.name.endsWith('-chromium')),
});
