const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const calls = [],
  events = [];
let reply;
const sandbox = {
  module: { exports: {} },
  TextEncoder,
  URLSearchParams,
  URL,
  Event,
  MBBComponents: [],
  MBBComponentCatalog: { fingerprint: 'fixed', postId: 42, url: '/test/' },
  dispatchEvent: (e) => events.push(e.type),
  wp: {
    apiFetch: (r) => {
      calls.push(r.url);
      return new Promise((r) => {
        reply = r;
      });
    },
  },
};
vm.runInNewContext(
  buildSync({
    entryPoints: ['src/component-catalog.js'],
    bundle: true,
    format: 'cjs',
    write: false,
  }).outputFiles[0].text,
  sandbox,
);
(async () => {
  const api = sandbox.module.exports;
  const entries = [
    { id: 'same', version: '0.2.0', title: 'Flow' },
    { id: 'same', version: '0.7.0', title: 'Sequence' },
    { id: 'same', version: '0.8.0', title: 'Class' },
    { id: 'other', version: '1.0.0', title: 'Old title', authoringGroup: 'shared' },
    { id: 'other', version: '2.0.0', title: 'New title', authoringGroup: 'shared' },
    {
      id: 'other',
      version: '3.0.0',
      title: 'Bad',
      authoringGroup: 'shared',
      status: 'version-incompatible',
    },
  ];
  assert.deepEqual(
    Array.from(api.latestComponentChoices(entries), (p) => p.version),
    ['0.2.0', '0.7.0', '0.8.0', '2.0.0'],
  );
  const blocks = [
    {
      name: 'core/group',
      innerBlocks: [
        {
          name: 'mbb/component',
          clientId: 'flow',
          attributes: { component: 'same', componentVersion: '0.2.0' },
        },
        {
          name: 'mbb/component',
          clientId: 'missing',
          attributes: { component: 'gone', componentVersion: '1.0.0' },
        },
        {
          name: 'mbb/component',
          clientId: 'old',
          attributes: { component: 'other', componentVersion: '1.0.0' },
        },
      ],
    },
  ];
  const deps = api.componentDependencies(blocks, entries);
  assert.equal(deps[0].status, 'current', 'Another variant was misclassified as an upgrade');
  assert.equal(deps[1].status, 'missing');
  assert.equal(deps[2].status, 'newer', 'A newer same-family version must not imply a migration');
  sandbox.MarkBridgeComponentAuthors.register({
    apiVersion: 1,
    component: 'other',
    componentVersion: '1.0.0',
    supports: (params) => params.canUpgrade === true,
    upgrade: { componentVersion: '2.0.0', migrate: (params) => params },
  });
  blocks[0].innerBlocks[2].attributes.params = { canUpgrade: true };
  assert.equal(api.componentDependencies(blocks, entries)[2].status, 'upgrade');
  blocks[0].innerBlocks[2].attributes.params.canUpgrade = false;
  assert.equal(
    api.componentDependencies(blocks, entries)[2].status,
    'newer',
    'Parameter-dependent author support stayed stale',
  );
  const a = api.resolveComponent('fixture', '1.0.0');
  const b = api.resolveComponent('fixture', '1.0.0');
  assert.equal(calls.length, 1, 'same exact request did not deduplicate');
  assert.match(calls[0], /descriptor\/fixture\/1.0.0\?post_id=42&fingerprint=fixed$/);
  reply({ fingerprint: 'fixed', provider: { id: 'fixture', version: '1.0.0' } });
  await Promise.all([a, b]);
  assert.equal(sandbox.MBBComponents.length, 1);
  assert.equal(events.length, 1);
  const page = api.componentCatalogPage(2);
  assert.match(calls.at(-1), /page=2/);
  reply({ fingerprint: 'changed', items: [] });
  await assert.rejects(page, /catalog changed/);
  const late = api.resolveComponent('fixture', '2.0.0');
  sandbox.MBBComponentCatalog = { ...sandbox.MBBComponentCatalog, fingerprint: 'new' };
  reply({ fingerprint: 'fixed', provider: { id: 'fixture', version: '2.0.0' } });
  await assert.rejects(late, /catalog changed/);
  assert.equal(sandbox.MBBComponents.length, 1, 'stale registry response entered cache');
  const preferred = api.resolveDefaultComponent('fixture', '1.39.0');
  reply({
    fingerprint: 'new',
    items: [{ version: '1.0.0' }],
    defaults: { fixture: '1.0.0' },
    page: 1,
    perPage: 20,
    total: 40,
  });
  await new Promise(setImmediate);
  assert.match(calls.at(-1), /page=2/);
  reply({
    fingerprint: 'new',
    items: [{ version: '1.39.0' }],
    defaults: { fixture: '1.0.0' },
    page: 2,
    perPage: 20,
    total: 40,
  });
  await new Promise(setImmediate);
  assert.match(calls.at(-1), /descriptor\/fixture\/1.39.0/);
  reply({ fingerprint: 'new', provider: { id: 'fixture', version: '1.39.0' } });
  assert.equal(
    (await preferred).version,
    '1.39.0',
    'Preferred version on another page silently defaulted',
  );
  sandbox.MBBComponentCatalog = {
    fingerprint: 'plain',
    postId: 99,
    url: 'https://fixture.invalid/index.php?rest_route=/mbb/v2/components/',
  };
  const plainPage = api.componentCatalogPage(2);
  let url = new URL(calls.at(-1));
  assert.equal(url.searchParams.get('rest_route'), '/mbb/v2/components/catalog');
  assert.equal(url.searchParams.get('post_id'), '99');
  assert.equal(url.searchParams.get('page'), '2');
  reply({ fingerprint: 'plain', items: [] });
  await plainPage;
  const plainDescriptor = api.resolveComponent('plain-fixture', '9.0.0');
  url = new URL(calls.at(-1));
  assert.equal(
    url.searchParams.get('rest_route'),
    '/mbb/v2/components/descriptor/plain-fixture/9.0.0',
  );
  assert.equal(url.searchParams.get('fingerprint'), 'plain');
  reply({ fingerprint: 'plain', provider: { id: 'plain-fixture', version: '9.0.0' } });
  await plainDescriptor;
  const beforeMenu = calls.length;
  const menu = api.componentActivityTemplates([
    { component: 'activity', componentVersion: '1.0.0' },
    { component: 'replay', componentVersion: '0.1.0' },
    { component: 'unknown', componentVersion: '1.0.0' },
  ]);
  assert.equal(new URL(calls.at(-1)).searchParams.get('per_page'), '50');
  reply({
    fingerprint: 'plain',
    items: [{ id: 'replay', version: '0.1.0', title: 'Replay' }],
    page: 1,
    perPage: 50,
    total: 70,
  });
  await new Promise(setImmediate);
  reply({
    fingerprint: 'plain',
    items: [{ id: 'activity', version: '1.0.0', title: 'Self check', activityVersion: 1 }],
    page: 2,
    perPage: 50,
    total: 70,
  });
  const visible = await menu;
  assert.equal(visible.length, 1);
  assert.equal(visible[0].component, 'activity');
  assert.equal(calls.length - beforeMenu, 2, 'Menu scanned beyond bounded lightweight pages');
  assert.ok(
    calls.slice(beforeMenu).every((url) => !url.includes('descriptor')),
    'Menu eagerly resolved providers',
  );
  console.log(
    'Client exact descriptor deduplication, scoped identity and stale registry guards passed',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
