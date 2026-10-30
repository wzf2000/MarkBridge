const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const sandbox = { module: { exports: {} }, TextEncoder };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../src/component-parameters.js')],
    bundle: true,
    format: 'cjs',
    write: false,
  }).outputFiles[0].text,
  sandbox,
);
const { parameterFormSupport: support, validateParameterSchema: validate } = sandbox.module.exports;
const record = (properties) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const text = { type: 'string', maxLength: 64 };
const item = (fields, max) => ({ type: 'array', maxItems: max, items: record(fields) });
const schema = record({
  format: { type: 'string', enum: ['relation-map/v3'] },
  title: text,
  groups: item({ id: text, title: text }, 8),
  nodes: item(
    {
      id: text,
      group: text,
      title: text,
      description: text,
      target: record({ kind: text, namespace: text, document: text, site: text, documentId: text }),
    },
    64,
  ),
  edges: item({ id: text, from: text, to: text, kind: text, why: text }, 128),
  display: record({
    mobileStart: record({ kind: { type: 'string', enum: ['auto', 'group', 'node'] }, id: text }),
  }),
});
const params = {
  format: 'relation-map/v3',
  title: '图',
  groups: [{ id: 'group', title: '主题' }],
  nodes: Array.from({ length: 30 }, (_, i) => ({
    id: 'node' + i,
    group: 'group',
    title: '题目' + i,
    description: '',
    target: {
      kind: 'local-document',
      namespace: '',
      document: '',
      site: 'S_' + 'a'.repeat(32),
      documentId: 'document' + i,
    },
  })),
  edges: [],
  display: { mobileStart: { kind: 'auto', id: '' } },
};
assert(support(schema, params), 'large v3 author contract remains in selected-item form');
assert.equal(validate(params, schema).length, 0);
assert(
  validate({ ...params, display: { mobileStart: { kind: 'auto', id: '', extra: 'no' } } }, schema)
    .length,
);
assert(validate({ ...params, display: { mobileStart: null } }, schema).length);
const upgraded = {
  ...params,
  format: 'relation-map/v3',
  display: { mobileStart: { kind: 'auto', id: '' } },
};
assert.deepEqual(upgraded.nodes, params.nodes);
console.log(
  'v3 author schema admits bounded selected-item editing and rejects unregistered display fields',
);

const dataSandbox = { module: { exports: {} }, TextEncoder };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../src/component-data.js')],
    bundle: true,
    format: 'cjs',
    write: false,
  }).outputFiles[0].text,
  dataSandbox,
);
const gate = (value) =>
  dataSandbox.module.exports.componentParams(value, (_code, message) => {
    throw Error(message);
  });
function budgetFixture(count, edgeCount, groupCount) {
  const p = {
    format: 'relation-map/v3',
    title: 'Budget',
    groups: Array.from({ length: groupCount }, (_, i) => ({ id: 'g' + i, title: 'Group ' + i })),
    nodes: Array.from({ length: count }, (_, i) => ({
      id: 'n' + i,
      group: 'g' + (i % groupCount),
      title: 'Node ' + i,
      target: { kind: 'local-document', site: 'S_' + 'a'.repeat(32), documentId: 'document' + i },
    })),
    edges: [],
    display: { mobileStart: { kind: 'auto', id: '' } },
  };
  for (let from = 0; from < count && p.edges.length < edgeCount; from++)
    for (let to = 0; to < count && p.edges.length < edgeCount; to++)
      if (from !== to)
        p.edges.push({
          id: 'e' + p.edges.length,
          from: 'n' + from,
          to: 'n' + to,
          kind: 'recommended',
        });
  return p;
}
for (const p of [budgetFixture(64, 0, 8), budgetFixture(16, 128, 2)]) {
  assert.doesNotThrow(() => gate(p));
  require('../plugin/relation-map-v3.js').validate(p);
}
assert.throws(() => gate(budgetFixture(64, 128, 8)), /budget/);
