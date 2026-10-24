const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
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
const {
  parameterSchemaKnown: known,
  validateParameterSchema: validate,
  parameterFormSupport: support,
  updateParameterValue: update,
  parameterLabel: displayLabel,
} = sandbox.module.exports;
const record = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const schema = record({
  title: { type: 'string', minLength: 1, maxLength: 3 },
  count: { type: 'integer', minimum: -2, maximum: 10 },
  enabled: { type: 'boolean' },
  mode: { type: 'string', enum: ['a', 'b'] },
  items: { type: 'array', items: record({ label: { type: 'string' } }), minItems: 1, maxItems: 2 },
});
const valid = { title: '中😀', count: 2, enabled: true, mode: 'a', items: [{ label: '重复' }] };
const cases = [
  [schema, valid, true],
  [schema, { ...valid, title: '中😀文字' }, false],
  [schema, { ...valid, count: 2.5 }, false],
  [schema, { ...valid, count: '2' }, false],
  [schema, { ...valid, count: 11 }, false],
  [schema, { ...valid, enabled: 1 }, false],
  [schema, { ...valid, mode: 'c' }, false],
  [schema, { ...valid, items: [] }, false],
  [schema, { ...valid, items: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] }, false],
  [schema, { ...valid, items: [{ extra: 'preserve in JSON' }] }, false],
  [schema, { ...valid, authorExtra: { nested: 'kept' } }, false],
  [schema, { ...valid, title: null }, false],
  [{ type: 'integer' }, 1e20, true],
  [{ type: 'null' }, null, true],
  [
    {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      additionalProperties: false,
      enum: [{ a: 1, b: 2 }],
    },
    { b: 2, a: 1 },
    true,
  ],
];
// The same in-memory cases exercise the production PHP validator, without WP/database/network.
const php = String.raw`
function add_action(...$args) {}
require $argv[1];
$cases=json_decode(stream_get_contents(STDIN));
function schema_array($s) {
 $out=get_object_vars($s);
 if(isset($out['properties'])) { $out['properties']=get_object_vars($out['properties']); foreach($out['properties'] as &$child) $child=schema_array($child); }
 if(isset($out['items'])) $out['items']=schema_array($out['items']);
 return $out;
}
$out=[];
foreach ($cases as $case) {
 $schema=schema_array($case[0]);
 $out[]=[mbb_component_schema_definition($schema),mbb_component_schema($case[1],$schema)];
}
echo json_encode($out,JSON_THROW_ON_ERROR);
`;
const server = spawnSync('php', ['-r', php, path.join(__dirname, '../plugin/components.php')], {
  input: JSON.stringify(cases),
  encoding: 'utf8',
});
assert.equal(server.status, 0, server.stderr || server.error?.message);
const results = JSON.parse(server.stdout);
cases.forEach(([s, value, expected], i) => {
  assert.equal(known(s), true, `known ${i}`);
  assert.equal(validate(value, s).length === 0, expected, `client ${i}`);
  assert.deepEqual(results[i], [true, expected], `server ${i}`);
});
for (const bad of [
  undefined,
  { ...schema, description: 'unsupported' },
  { type: 'string', enum: [2] },
  { type: 'string', minLength: 3, maxLength: 1 },
  { type: 'array', items: { type: 'number' }, maxItems: 1025 },
  JSON.parse(
    '{"type":"object","properties":{"__proto__":{"type":"string"}},"additionalProperties":false}',
  ),
]) {
  assert.equal(known(bad), false);
  assert.equal(support(bad, valid), false);
}
assert.equal(support(schema, valid), true);
assert.equal(support(schema, { ...valid, extra: 'never discarded' }), false);
assert.equal(
  support(record({ items: { type: 'array', items: { type: 'number' } } }), { items: [] }),
  false,
);
assert.equal(
  support(record({ items: { type: 'array', items: { type: 'number' }, maxItems: 65 } }), {
    items: [],
  }),
  false,
);
assert.equal(support(record({ n: { type: 'null' } }), { n: null }), false);
const frozen = Object.freeze({
  items: Object.freeze([Object.freeze({ label: 'before' })]),
  other: 7,
});
const after = update(frozen, ['items', 0, 'label'], 'after');
assert.equal(after.items[0].label, 'after');
assert.equal(frozen.items[0].label, 'before');
assert.equal(after.other, 7);
assert.equal(update(after, ['items', 0], undefined, true).items.length, 0);
assert.throws(() => update({}, ['__proto__', 'polluted'], true));
console.log(
  `component parameters: ${cases.length} JS/PHP schema parity cases; bounded form admission and immutable updates passed`,
);

// Fixed host author registrations are version-exact and accept no serialized code/URL fields.
const authorSandbox = { module: { exports: {} } };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../src/component-authors.js')],
    bundle: true,
    format: 'cjs',
    write: false,
  }).outputFiles[0].text,
  authorSandbox,
);
const { registerComponentAuthor: register, componentAuthor: author } = authorSandbox.module.exports;
const descriptor = {
  apiVersion: 1,
  component: 'node-diagram',
  componentVersion: '0.2.0',
  Editor: () => null,
  supports: () => true,
};
register(descriptor);
assert.equal(author('node-diagram', '0.1.0'), undefined);
assert.equal(author('node-diagram', '0.2.0').Editor, descriptor.Editor);
assert.throws(() => register(descriptor));
for (const invalid of [
  { ...descriptor, component: 'another', url: 'https://invalid.example/' },
  { ...descriptor, component: 'another', Editor: 'alert(1)' },
  { ...descriptor, component: 'another', apiVersion: 2 },
])
  assert.throws(() => register(invalid));
const upgrade = { componentVersion: '0.2.0', migrate: (value) => value };
register({
  apiVersion: 1,
  component: 'node-diagram',
  componentVersion: '0.1.0',
  supports: () => true,
  upgrade,
});
upgrade.componentVersion = '9.0.0';
assert.equal(author('node-diagram', '0.1.0').upgrade.componentVersion, '0.2.0');
assert(Object.isFrozen(author('node-diagram', '0.1.0').upgrade));
for (let i = 0; i < 30; i++) register({ ...descriptor, component: 'bounded-' + i });
assert.throws(() => register({ ...descriptor, component: 'overflow' }));
console.log(
  'Trusted author exact versions, closed registration, immutable upgrades and registration budget passed.',
);

// Local tool drafts are cloned pure JSON records with the unchanged params budget.
const local = (expression) =>
  vm.runInNewContext(`module.exports.componentLocalDraft(${expression})`, sandbox);
assert.equal(local('null'), null);
assert.equal(
  JSON.stringify(local('{csv:"中😀", rows:[[1,true,null]]}')),
  JSON.stringify({ csv: '中😀', rows: [[1, true, null]] }),
);
for (const expression of [
  '[]',
  '1',
  '"text"',
  'true',
  'new Date()',
  '({x:undefined})',
  '({x:NaN})',
  '({x:Infinity})',
  '({x:"\\ud800"})',
  `JSON.parse('{"__proto__":{}}')`,
  '({x:Object.assign({}, {[Symbol("x")]:1})})',
  '({x:1n})',
  '({x(){}})',
  '({get x(){throw Error("must not read")}})',
  'Object.assign({}, {[Symbol("x")]:1})',
  '({x:Object.assign([], {hidden:1})})',
  '({x:Array(2)})',
  '({x:new (class X {})()})',
  '(()=>{const x={};x.self=x;return x})()',
  '({text:"x".repeat(16384)})',
  '({rows:Array(1024).fill(0)})',
  '({a:{a:{a:{a:{a:{a:{a:{a:{a:0}}}}}}}}})',
])
  assert.throws(() => local(expression), undefined, expression);
assert.equal(local('({text:"x".repeat(16373)})').text.length, 16373);
assert.equal(local('({rows:Array(1022).fill(0)})').rows.length, 1022);
console.log('Local author draft pure JSON/budget contracts passed');

assert.equal(displayLabel([]), 'Parameters');
assert.equal(displayLabel(['values', 0]), 'Values › Item 1');
assert.equal(displayLabel(['custom_field', 'someValue', 2]), 'Custom field › Some Value › Item 3');
assert.equal(displayLabel(['rows', 2, 'values', 0]), 'Rows › Item 3 › Values › Item 1');

for (const name of ['toString', 'valueOf', 'hasOwnProperty']) {
  const schema = record({ [name]: { type: 'string' } }),
    value = JSON.parse('{"' + name + '":"literal"}');
  assert.equal(known(schema), true);
  assert.equal(support(schema, value), true);
  assert.equal(validate(value, schema).length, 0);
  assert.equal(
    displayLabel([name]),
    { toString: 'To String', valueOf: 'Value Of', hasOwnProperty: 'Has Own Property' }[name],
  );
  assert.equal(value[name], 'literal');
}

const relationSchema = require('./fixtures/relation-map-schema.json');
assert.equal(
  support(relationSchema, {
    format: 'relation-map/v1',
    nodes: Array.from({ length: 64 }, () => ({ title: '题名', url: '#node' })),
    edges: Array.from({ length: 128 }, () => ({ from: 'a', to: 'b', kind: 'compare' })),
  }),
  true,
);
assert.equal(
  support(
    {
      ...relationSchema,
      properties: { ...relationSchema.properties, format: { type: 'string', enum: ['other'] } },
    },
    { format: 'other', nodes: [], edges: [] },
  ),
  false,
);
console.log(
  'Known relation-map form admits bounded selected-item editing without changing other schemas.',
);

const missingCollections = {
  format: 'relation-map/v1',
  title: 'Map',
  nodes: [{ id: 'a', group: 'g', title: 'Topic', url: '#a' }],
  edges: [{ from: 'a', to: 'b', kind: 'compare' }],
};
assert.equal(support(relationSchema, missingCollections), true);
assert.equal(
  support(relationSchema, {
    format: 'relation-map/v1',
    title: 'Map',
    groups: [{ id: 'g', title: 'Group' }],
    edges: missingCollections.edges,
  }),
  true,
);
assert.equal(
  support(
    {
      ...relationSchema,
      properties: { ...relationSchema.properties, unrelated: { type: 'string' } },
    },
    missingCollections,
  ),
  false,
);
console.log(
  'Known relation-map schema stays repairable with missing collections; same-format unrelated schemas retain generic bounds.',
);
