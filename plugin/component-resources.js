// Fixed public resource protocol v2. No account data, persistent cache, Worker or WASM.
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({
    manifest: 16384,
    items: 8,
    item: 1048576,
    total: 2097152,
    cache: 4194304,
    output: 16384,
    totalMs: 5000,
    download: 2500,
    hash: 1000,
    transfer: 1500,
  });
  const utf8 = new TextEncoder();
  function fault(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }
  // Bounded JSON admission rejects duplicate keys before JavaScript can discard them.
  function strictJSON(text) {
    if (typeof text !== 'string' || utf8.encode(text).byteLength > LIMITS.manifest)
      throw fault('RESOURCE_JSON');
    let p = 0,
      nodes = 0;
    const ws = () => {
      while (/[ \r\n\t]/.test(text[p] || '!')) p++;
    };
    const string = () => {
      const start = p++;
      for (; p < text.length; p++) {
        if (text[p] === '\\') {
          p++;
          continue;
        }
        if (text[p] === '"') {
          p++;
          const s = JSON.parse(text.slice(start, p));
          if (/[\uD800-\uDFFF]/u.test(s)) throw fault('JSON_UNICODE');
          return s;
        }
      }
      throw fault('JSON_STRING');
    };
    const value = (depth) => {
      if (++nodes > 1024 || depth > 8) throw fault('JSON_BOUND');
      ws();
      const c = text[p];
      if (c === '"') return string();
      if (c === '{' || c === '[') {
        p++;
        const object = c === '{',
          out = object ? Object.create(null) : [],
          seen = new Set();
        ws();
        if (text[p] === (object ? '}' : ']')) {
          p++;
          return out;
        }
        for (;;) {
          ws();
          let key;
          if (object) {
            if (text[p] !== '"') throw fault('JSON_KEY');
            key = string();
            if (seen.has(key)) throw fault('JSON_DUPLICATE');
            seen.add(key);
            ws();
            if (text[p++] !== ':') throw fault('JSON_COLON');
          }
          const v = value(depth + 1);
          if (object) out[key] = v;
          else out.push(v);
          ws();
          const end = text[p++];
          if (end === (object ? '}' : ']')) return out;
          if (end !== ',') throw fault('JSON_SEPARATOR');
        }
      }
      const m = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
        text.slice(p),
      );
      if (!m) throw fault('JSON_VALUE');
      p += m[0].length;
      const out = JSON.parse(m[0]);
      if (typeof out === 'number' && !Number.isFinite(out)) throw fault('JSON_NUMBER');
      return out;
    };
    const out = value(0);
    ws();
    if (p !== text.length) throw fault('JSON_TRAILING');
    return out;
  }
  const closed = (x, keys) =>
    x &&
    typeof x === 'object' &&
    !Array.isArray(x) &&
    Object.keys(x).length === keys.length &&
    keys.every((k) => Object.hasOwn(x, k));
  const semver = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/;
  function manifest(value) {
    if (
      !closed(value, ['schema', 'version', 'resources']) ||
      value.schema !== 'mbb-resources/v2' ||
      typeof value.version !== 'string' ||
      !semver.test(value.version) ||
      !Array.isArray(value.resources) ||
      !value.resources.length ||
      value.resources.length > LIMITS.items
    )
      throw fault('MANIFEST_SHAPE');
    const ids = new Map(),
      paths = new Set();
    let sum = 0;
    for (const r of value.resources) {
      if (
        !closed(r, ['id', 'path', 'type', 'bytes', 'sha256', 'deps', 'license', 'version']) ||
        typeof r.id !== 'string' ||
        !/^[a-z][a-z0-9-]{0,23}$/.test(r.id) ||
        ids.has(r.id) ||
        typeof r.path !== 'string' ||
        !/^assets\/[0-9]+\.[0-9]+\.[0-9]+\/[a-z][a-z0-9-]*\.(?:json|js|bin)$/.test(r.path) ||
        r.path.split('/')[1] !== value.version ||
        paths.has(r.path) ||
        r.version !== value.version ||
        !['json', 'javascript', 'public-data'].includes(r.type) ||
        { json: 'json', javascript: 'js', 'public-data': 'bin' }[r.type] !==
          r.path.split('.').pop() ||
        !Number.isInteger(r.bytes) ||
        r.bytes < 1 ||
        r.bytes > LIMITS.item ||
        typeof r.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(r.sha256) ||
        !Array.isArray(r.deps) ||
        r.deps.length > 7 ||
        new Set(r.deps).size !== r.deps.length ||
        r.deps.some((d) => typeof d !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(d)) ||
        !['CC0-1.0', 'GPL-3.0-or-later', 'Apache-2.0'].includes(r.license)
      )
        throw fault('RESOURCE_SHAPE');
      sum += r.bytes;
      ids.set(r.id, r);
      paths.add(r.path);
    }
    if (sum > LIMITS.total) throw fault('GROUP_LIMIT');
    const visiting = new Set(),
      done = new Set(),
      order = [];
    const visit = (id) => {
      if (visiting.has(id)) throw fault('DEPENDENCY_CYCLE');
      if (done.has(id)) return;
      if (!ids.has(id)) throw fault('DEPENDENCY_MISSING');
      visiting.add(id);
      for (const dep of ids.get(id).deps) visit(dep);
      visiting.delete(id);
      done.add(id);
      order.push(ids.get(id));
    };
    for (const id of ids.keys()) visit(id);
    return { version: value.version, resources: order, bytes: sum };
  }
  class Context {
    constructor({ limits = {}, signal, current = () => true, now = () => performance.now() } = {}) {
      if (Object.keys(limits).some((k) => !['totalMs', 'download', 'hash', 'transfer'].includes(k)))
        throw fault('LIMIT_CONFIG');
      this.limits = { ...LIMITS, ...limits };
      for (const [k, v] of Object.entries(this.limits))
        if (!Number.isFinite(v) || v <= 0 || v > LIMITS[k]) throw fault('LIMIT_CONFIG');
      this.now = now;
      this.current = current;
      this.started = now();
      this.signal = signal;
      this.phaseMs = {};
      this.canceled = false;
    }
    cancel() {
      this.canceled = true;
    }
    check(phase, extra = 0) {
      if (this.canceled || this.signal?.aborted || !this.current()) throw fault('CANCELED');
      if (this.now() - this.started > this.limits.totalMs) throw fault('TOTAL_LIMIT');
      if (
        phase &&
        (this.phaseMs[phase] || 0) +
          extra +
          (this.running?.phase === phase ? this.now() - this.running.start : 0) >
          this.limits[phase]
      )
        throw fault('PHASE_LIMIT');
    }
    async measure(phase, fn) {
      this.check(phase);
      const start = this.now();
      this.running = { phase, start };
      try {
        return await fn();
      } finally {
        this.phaseMs[phase] = (this.phaseMs[phase] || 0) + this.now() - start;
        this.running = null;
        this.check(phase);
      }
    }
    remaining(phase) {
      this.check(phase);
      return Math.max(
        1,
        Math.min(
          this.limits.totalMs - (this.now() - this.started),
          this.limits[phase] - (this.phaseMs[phase] || 0),
        ),
      );
    }
  }
  class PublicCache {
    #items = new Map();
    #bytes = 0;
    get(version, r) {
      const key = version + ':' + r.type + ':' + r.sha256,
        e = this.#items.get(key);
      if (!e) return null;
      // Recency is adopted only by the final whole-group commit, just like new bytes.
      return e.slice(0);
    }
    commit(version, group, check = () => {}) {
      const next = new Map(this.#items);
      let bytes = this.#bytes;
      for (const { spec, buffer } of group) {
        const key = version + ':' + spec.type + ':' + spec.sha256,
          old = next.get(key);
        if (old) bytes -= old.byteLength;
        next.delete(key);
        next.set(key, buffer);
        bytes += buffer.byteLength;
      }
      while (bytes > LIMITS.cache) {
        const [key, b] = next.entries().next().value;
        next.delete(key);
        bytes -= b.byteLength;
      }
      check();
      this.#items = next;
      this.#bytes = bytes;
    }

    clear() {
      this.#items.clear();
      this.#bytes = 0;
    }
    stats() {
      return { entries: this.#items.size, bytes: this.#bytes };
    }
  }
  async function digest(buffer, context, cryptoProvider = crypto) {
    const out = await context.measure('hash', () =>
      cryptoProvider.subtle.digest('SHA-256', buffer),
    );
    context.check('hash');
    return [...new Uint8Array(out)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function readBounded(url, bytes, context, fetcher = fetch) {
    const controller = new AbortController(),
      abort = () => controller.abort();
    context.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, context.remaining('download'));
    let reader;
    try {
      return await context.measure('download', async () => {
        context.check();
        const response = await fetcher(url, {
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw fault('HTTP_STATUS');
        if (response.url && response.url !== new URL(url, location.href).href)
          throw fault('REDIRECT');
        if (!response.body) throw fault('STREAM_REQUIRED');
        reader = response.body.getReader();
        let total = 0;
        const chunks = [];
        for (;;) {
          context.check('download');
          const { done, value } = await reader.read();
          if (done) break;
          context.check('download');
          total += value.byteLength;
          if (total > bytes) throw fault('STREAM_LIMIT');
          chunks.push(value);
        }
        const out = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          out.set(c, offset);
          offset += c.byteLength;
        }
        return out.buffer;
      });
    } finally {
      controller.abort();
      clearTimeout(timer);
      context.signal?.removeEventListener('abort', abort);
      if (reader) {
        reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  }
  async function load(
    registration,
    {
      context = new Context(),
      cache = new PublicCache(),
      fetcher = fetch,
      cryptoProvider = crypto,
    } = {},
  ) {
    if (
      !closed(registration, ['url', 'baseUrl', 'sha256', 'groupSha256', 'version']) ||
      typeof registration.url !== 'string' ||
      typeof registration.baseUrl !== 'string' ||
      typeof registration.version !== 'string' ||
      typeof registration.groupSha256 !== 'string' ||
      !registration.baseUrl.endsWith('/') ||
      [registration.url, registration.baseUrl].some((value) => {
        const u = new URL(value, location.href);
        return u.username || u.password || u.search || u.hash;
      }) ||
      typeof registration.sha256 !== 'string' ||
      new URL(registration.url, location.href).origin !== location.origin ||
      new URL(registration.baseUrl, location.href).origin !== location.origin ||
      !semver.test(registration.version) ||
      !/^[a-f0-9]{64}$/.test(registration.groupSha256) ||
      !/^[a-f0-9]{64}$/.test(registration.sha256)
    )
      throw fault('TRUSTED_REGISTRATION');
    const raw = await readBounded(registration.url, LIMITS.manifest, context, fetcher);
    if ((await digest(raw, context, cryptoProvider)) !== registration.sha256)
      throw fault('MANIFEST_SHA');
    const plan = manifest(
        strictJSON(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw)),
      ),
      group = [];
    if (plan.version !== registration.version) throw fault('MANIFEST_VERSION');
    const identity = await digest(
      utf8.encode('mbb-resources/v2\n' + plan.version + '\n' + registration.sha256).buffer,
      context,
      cryptoProvider,
    );
    if (identity !== registration.groupSha256) throw fault('GROUP_SHA');
    let downloaded = 0,
      hits = 0;
    for (const spec of plan.resources) {
      let buffer = cache.get(plan.version, spec);
      if (buffer) hits++;
      else {
        buffer = await readBounded(
          new URL(spec.path, registration.baseUrl).href,
          spec.bytes,
          context,
          fetcher,
        );
        if (buffer.byteLength !== spec.bytes) throw fault('RESOURCE_BYTES');
        if ((await digest(buffer, context, cryptoProvider)) !== spec.sha256)
          throw fault('RESOURCE_SHA');
        downloaded++;
      }
      if (buffer.byteLength !== spec.bytes) throw fault('RESOURCE_BYTES');
      context.check();
      group.push({ spec, buffer });
    }
    const resources = group.map(({ spec, buffer }) => ({ spec, buffer: buffer.slice(0) }));
    context.check();
    cache.commit(plan.version, group, () => context.check());
    return {
      version: plan.version,
      groupSha256: registration.groupSha256,
      resources,
      diagnostics: {
        downloaded,
        hits,
        resources: group.length,
        bytes: plan.bytes,
        phases: { ...context.phaseMs },
      },
    };
  }

  const api = { LIMITS, strictJSON, manifest, Context, PublicCache, digest, readBounded, load };
  root.MarkBridgeResources = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
