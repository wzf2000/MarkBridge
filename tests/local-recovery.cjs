const assert = require('node:assert/strict');
const { createStore, limits } = require('../plugin/local-recovery.js');
class Storage {
  data = new Map();
  reads = [];
  failIndex = false;
  get length() {
    return this.data.size;
  }
  key(i) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k) {
    this.reads.push(k);
    return this.data.get(k) ?? null;
  }
  setItem(k, v) {
    if (this.failIndex && k.endsWith('index')) throw Error('quota');
    this.data.set(k, String(v));
  }
  removeItem(k) {
    this.data.delete(k);
  }
}
const c = {
  schema: 1,
  siteKey: 'a'.repeat(64),
  userKey: 'b'.repeat(64),
  postId: 12,
  newKey: null,
  identity: 'c'.repeat(64),
  baseline: 'd'.repeat(64),
  permission: 'e'.repeat(64),
  expected: 'revision-original',
  sourceDigest: null,
  sourceManaged: false,
  sourceWriteAvailable: false,
};
const payload = (content = 'private synthetic', extra = {}) => ({
  content,
  title: 'Synthetic',
  documentId: 'M12',
  status: 'draft',
  featuredMedia: 0,
  ...extra,
});
let now = 1700000000000;
const storage = new Storage(),
  prefix = 'mbb-local-recovery:v1:author:',
  store = createStore(storage, prefix, () => now);
storage.setItem('another-plugin', 'unrelated');
storage.setItem('mbb-local-recovery:v1:other-author:record:abc', 'other author');
const entry = store.write(c, 'markdown', payload());
assert.equal(store.read(c, entry).payload.content, 'private synthetic');
const bodyReadCount = () => storage.reads.filter((k) => k.includes('record:')).length;
let before = bodyReadCount();
assert.equal(store.read({ ...c, identity: 'f'.repeat(64) }, entry), null);
assert.equal(store.read({ ...c, permission: 'f'.repeat(64) }, entry), null);
assert.equal(bodyReadCount(), before, 'Wrong source/permission read a candidate body');
const stale = { ...c, baseline: 'f'.repeat(64), expected: 'revision-new' };
assert.equal(store.list(stale).length, 1, 'Old baseline draft became invisible');
assert.equal(
  store.read(stale, entry).context.expected,
  'revision-original',
  'Reading old draft silently rebased it',
);
assert.throws(() => store.write(c, 'markdown', payload('界'.repeat(90000))), /256 KiB/);
assert.throws(() => store.write(c, 'markdown', payload('"'.repeat(150000))), /JSON.*256 KiB/);
assert.equal(
  store.read(c, entry).payload.content,
  'private synthetic',
  'Oversize replaced a valid previous draft',
);
storage.failIndex = true;
assert.throws(() => store.write(c, 'markdown', payload('quota candidate')), /quota/);
storage.failIndex = false;
assert.equal(
  store.read(c, entry).payload.content,
  'private synthetic',
  'Failed transaction deleted a valid draft',
);
assert.equal(
  [...storage.data.keys()].filter((k) => k.startsWith(prefix + 'record:')).length,
  1,
  'Failed transaction orphaned a body',
);
for (let i = 0; i < 11; i++) {
  now++;
  store.write(
    { ...c, postId: i + 1, identity: i.toString(16).padStart(64, '0') },
    'blocks',
    payload('x'.repeat(140000)),
  );
}
assert.ok(store.index().length <= limits.COUNT);
assert.ok(store.index().reduce((n, e) => n + e.bytes, 0) <= limits.TOTAL);
now += limits.TTL + 1;
assert.equal(store.index().length, 0);
assert.equal(
  [...storage.data.keys()].filter((k) => k.startsWith(prefix + 'record:')).length,
  0,
  'TTL left expired draft bodies',
);
const corrupt = store.write(c, 'markdown', payload());
storage.setItem(corrupt.key, 'not JSON');
assert.equal(store.read(c, corrupt), null);
assert.equal(store.list(c).length, 0);
storage.setItem(prefix + 'index', JSON.stringify([{ key: 'another-plugin' }]));
store.index();
assert.equal(storage.getItem('another-plugin'), 'unrelated');
assert.equal(storage.getItem('mbb-local-recovery:v1:other-author:record:abc'), 'other author');
console.log(
  'Local recovery scope isolation, old-baseline retention, UTF-8/JSON budgets, atomic failure, TTL and scoped corruption cleanup passed.',
);
