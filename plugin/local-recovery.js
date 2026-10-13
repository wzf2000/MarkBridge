(() => {
  const LIMIT = 256 * 1024,
    TOTAL = 1024 * 1024,
    COUNT = 8,
    TTL = 7 * 24 * 60 * 60 * 1000;
  const bytes = (value) => new TextEncoder().encode(value).length;
  const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const kind = (value) => ['markdown', 'blocks'].includes(value);
  const plain = (value) => !!value && Object.getPrototypeOf(value) === Object.prototype;
  const exact = (value, names) =>
    plain(value) &&
    Object.keys(value).length === names.length &&
    names.every((k) => Object.hasOwn(value, k));
  const contextFields = [
    'schema',
    'siteKey',
    'userKey',
    'postId',
    'newKey',
    'identity',
    'baseline',
    'permission',
    'expected',
    'sourceDigest',
    'sourceManaged',
    'sourceWriteAvailable',
  ];
  const validContext = (value) =>
    exact(value, contextFields) &&
    value.schema === 1 &&
    ['siteKey', 'userKey', 'identity', 'baseline', 'permission'].every((key) => hash(value[key])) &&
    Number.isSafeInteger(value.postId) &&
    value.postId >= 0 &&
    (value.postId ? value.newKey === null : /^[a-f0-9]{32}$/.test(value.newKey || '')) &&
    (value.expected === null ||
      (typeof value.expected === 'string' && value.expected.length <= 256)) &&
    (value.sourceDigest === null || hash(value.sourceDigest)) &&
    typeof value.sourceManaged === 'boolean' &&
    typeof value.sourceWriteAvailable === 'boolean';
  const validPayload = (value, type) => {
    const fields = ['content', 'title', 'documentId', 'status', 'featuredMedia'];
    if (Object.hasOwn(value || {}, 'requiresResources')) {
      const requirements = value.requiresResources;
      const path = (s) =>
        typeof s === 'string' &&
        s.length > 0 &&
        new TextEncoder().encode(s).length <= 1024 &&
        s === s.normalize('NFC') &&
        !/[\u0000-\u001f\u007f\\:]/u.test(s) &&
        !/%(?:2f|5c|00|2e)/i.test(s) &&
        s
          .split('/')
          .every(
            (p) =>
              p &&
              p !== '.' &&
              p !== '..' &&
              p === p.replace(/^ +| +$/g, '') &&
              !p.endsWith('.') &&
              Array.from(p).length <= 200,
          );
      if (
        !requirements ||
        Object.keys(requirements).sort().join(',') !== 'basePath,paths,schema' ||
        requirements.schema !== 1 ||
        !path(requirements.basePath) ||
        !Array.isArray(requirements.paths) ||
        requirements.paths.length > 32 ||
        !requirements.paths.every(path)
      )
        return false;
      fields.push('requiresResources');
    }
    if (!exact(value, fields)) return false;
    return (
      kind(type) &&
      typeof value.content === 'string' &&
      bytes(value.content) <= LIMIT &&
      typeof value.title === 'string' &&
      bytes(value.title) <= 4096 &&
      typeof value.documentId === 'string' &&
      bytes(value.documentId) <= 256 &&
      ['draft', 'pending', 'publish', 'private'].includes(value.status) &&
      Number.isSafeInteger(value.featuredMedia) &&
      value.featuredMedia >= 0
    );
  };
  const same = (a, b) =>
    ['siteKey', 'userKey', 'postId', 'identity', 'permission'].every((key) => a[key] === b[key]);
  const uuid = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('');
  function createStore(storage, prefix, now = Date.now) {
    const indexKey = prefix + 'index',
      recordPrefix = prefix + 'record:';
    const owned = (key) =>
      typeof key === 'string' &&
      key.startsWith(recordPrefix) &&
      /^[a-f0-9]{32}$/.test(key.slice(recordPrefix.length));
    function clear() {
      const keys = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith(prefix) && key !== prefix + 'revoked') keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    }
    function index() {
      const raw = storage.getItem(indexKey);
      let entries;
      try {
        entries = raw === null ? [] : JSON.parse(raw);
        if (
          raw?.length > 8192 ||
          !Array.isArray(entries) ||
          entries.length > COUNT ||
          entries.some(
            (e) =>
              !exact(e, [
                'key',
                'identity',
                'baseline',
                'permission',
                'kind',
                'postId',
                'instance',
                'newKey',
                'created',
                'expires',
                'bytes',
              ]) ||
              !owned(e.key) ||
              ![e.identity, e.baseline, e.permission].every(hash) ||
              !kind(e.kind) ||
              !Number.isSafeInteger(e.postId) ||
              e.postId < 0 ||
              !/^[a-f0-9]{32}$/.test(e.instance || '') ||
              (e.postId ? e.newKey !== null : !/^[a-f0-9]{32}$/.test(e.newKey || '')) ||
              !Number.isSafeInteger(e.created) ||
              !Number.isSafeInteger(e.expires) ||
              e.expires - e.created !== TTL ||
              e.created > now() + 60000 ||
              !Number.isSafeInteger(e.bytes) ||
              e.bytes < 1 ||
              e.bytes > LIMIT,
          ) ||
          new Set(entries.map((e) => e.key)).size !== entries.length ||
          entries.reduce((sum, e) => sum + e.bytes, 0) > TOTAL
        )
          throw Error('损坏的索引');
      } catch {
        clear();
        return [];
      }
      const live = entries.filter((e) => e.expires > now());
      const referenced = new Set(live.map((e) => e.key));
      const garbage = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith(recordPrefix) && !referenced.has(key)) garbage.push(key);
      }
      garbage.forEach((key) => storage.removeItem(key));
      if (live.length !== entries.length) storage.setItem(indexKey, JSON.stringify(live));
      return live;
    }
    function list(context) {
      return index().filter(
        (e) =>
          e.postId === context.postId &&
          e.identity === context.identity &&
          e.permission === context.permission,
      );
    }
    function read(context, entry) {
      if (!list(context).some((e) => e.key === entry.key)) return null;
      const raw = storage.getItem(entry.key);
      let record;
      try {
        if (typeof raw !== 'string' || bytes(raw) !== entry.bytes || bytes(raw) > LIMIT)
          throw Error('损坏的候选');
        record = JSON.parse(raw);
        if (
          !exact(record, [
            'schema',
            'context',
            'instance',
            'kind',
            'payload',
            'created',
            'expires',
          ]) ||
          record.schema !== 1 ||
          !validContext(record.context) ||
          !same(record.context, context) ||
          record.kind !== entry.kind ||
          record.instance !== entry.instance ||
          record.created !== entry.created ||
          record.expires !== entry.expires ||
          !validPayload(record.payload, record.kind)
        )
          throw Error('候选身份不匹配');
      } catch {
        remove(entry.key);
        return null;
      }
      return record;
    }
    function remove(key) {
      const entries = index();
      storage.setItem(indexKey, JSON.stringify(entries.filter((e) => e.key !== key)));
      if (owned(key)) storage.removeItem(key);
    }
    function write(context, type, payload, instance = '0'.repeat(32)) {
      if (!validContext(context) || !validPayload(payload, type))
        throw Error('候选正文超过 256 KiB 或格式不受支持；编辑内容仍在页面中，可下载保留。');
      const created = now(),
        record = {
          schema: 1,
          context,
          instance,
          kind: type,
          payload,
          created,
          expires: created + TTL,
        },
        raw = JSON.stringify(record);
      if (bytes(raw) > LIMIT)
        throw Error('候选 JSON 超过 256 KiB；编辑内容仍在页面中，可下载保留。');
      const previous = index(),
        retained = previous.filter(
          (e) =>
            !(
              e.identity === context.identity &&
              e.baseline === context.baseline &&
              e.instance === instance &&
              e.kind === type
            ),
        );
      const entry = {
        key: recordPrefix + uuid(),
        identity: context.identity,
        baseline: context.baseline,
        permission: context.permission,
        kind: type,
        postId: context.postId,
        instance,
        newKey: context.newKey,
        created,
        expires: record.expires,
        bytes: bytes(raw),
      };
      retained.push(entry);
      retained.sort((a, b) => a.created - b.created);
      while (retained.length > COUNT || retained.reduce((sum, e) => sum + e.bytes, 0) > TOTAL)
        retained.shift();
      try {
        storage.setItem(entry.key, raw);
        storage.setItem(indexKey, JSON.stringify(retained));
      } catch (error) {
        storage.removeItem(entry.key);
        throw error;
      }
      const keys = new Set(retained.map((e) => e.key));
      previous.filter((e) => !keys.has(e.key)).forEach((e) => storage.removeItem(e.key));
      return entry;
    }
    return { clear, index, list, read, write, remove };
  }
  const contract = {
    createStore,
    validContext,
    validPayload,
    bytes,
    limits: { LIMIT, TOTAL, COUNT, TTL },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = contract;
  if (typeof window === 'undefined') return;
  const cfg = window.MBB_EDITOR,
    config = cfg?.recovery;
  if (!config || config.schema !== 1 || !hash(config.siteKey) || !hash(config.userKey)) return;
  const owner = config.siteKey + ':' + config.userKey,
    prefix = 'mbb-local-recovery:v1:' + owner + ':',
    preference = prefix + 'enabled',
    revocationKey = prefix + 'revoked';
  let enabled = false,
    epoch = 0,
    store,
    context,
    postId = Number(cfg.postId) || 0,
    newKey = null,
    timers = new Map(),
    pending = new Map(),
    revisions = new Map(),
    requests = new Set(),
    nativeUnsubscribe,
    permissionTimer,
    instance,
    releaseInstance,
    generation = null;
  let panel,
    checkbox,
    status,
    entries,
    retry,
    download,
    ordinaryNotice,
    lastCapture = null;
  const node = (tag, text = '') => {
    const value = document.createElement(tag);
    value.textContent = text;
    return value;
  };
  const message = (text) => {
    if (status) status.textContent = text;
  };
  const currentUser = () => cfg.recovery?.siteKey + ':' + cfg.recovery?.userKey === owner;
  const current = (serial) => serial === epoch && currentUser();
  function cancelPending() {
    timers.forEach(clearTimeout);
    timers.clear();
    pending.clear();
    requests.forEach((controller) => controller.abort());
    requests.clear();
  }
  async function initializeInstance() {
    if (!navigator.locks?.request)
      throw Error('浏览器不支持可靠的多标签页存储锁；本地恢复已停用，正常编辑不受影响。');
    const key = prefix + 'instance:' + location.pathname + ':' + (Number(cfg.postId) || 'new');
    instance = sessionStorage.getItem(key);
    if (!/^[a-f0-9]{32}$/.test(instance || '')) instance = uuid();
    for (let attempt = 0; attempt < 2; attempt++) {
      let resolved;
      const acquired = new Promise((resolve) => {
        resolved = resolve;
      });
      navigator.locks
        .request(prefix + 'instance:' + instance, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolved(false);
            return;
          }
          resolved(true);
          return new Promise((resolve) => {
            releaseInstance = resolve;
          });
        })
        .catch(() => resolved(false));
      if (await acquired) {
        sessionStorage.setItem(key, instance);
        return;
      }
      instance = uuid();
      sessionStorage.removeItem(prefix + 'new:' + location.pathname);
    }
    throw Error('无法隔离本标签页的草稿身份，本地恢复已停用。');
  }
  async function locked(operation, serial = epoch) {
    if (!navigator.locks?.request) throw Error('浏览器不支持可靠存储锁。');
    return navigator.locks.request(prefix + 'storage', () => {
      if (!current(serial) || localStorage.getItem(revocationKey) !== generation)
        throw Error('另一窗口已停用恢复，旧校验不能重新启用或写入。');
      return operation();
    });
  }
  async function purge(affectedPost = null) {
    if (!navigator.locks?.request) return;
    return navigator.locks.request(prefix + 'storage', () => {
      localStorage.setItem(revocationKey, uuid());
      const storage = createStore(localStorage, prefix);
      if (affectedPost === null) storage.clear();
      else
        for (const entry of storage.index())
          if (entry.postId === affectedPost) storage.remove(entry.key);
    });
  }
  function rowsFor(value) {
    return store.index().filter((e) => e.postId === value.postId);
  }
  function failure(code, status, id) {
    const error = Error(
      code === 'rest_cookie_invalid_nonce' || status === 401
        ? '认证已过期；本地候选保留。请刷新页面或重新登录，再重新校验恢复权限。'
        : code === 'forbidden' || code === 'rest_cannot_edit'
          ? '这篇文章的编辑权限已失效；仅清除此文章的本地候选，其他文章保留。'
          : '权限校验失败，恢复已暂停，本地候选保留。',
    );
    error.authExpired = code === 'rest_cookie_invalid_nonce' || status === 401;
    error.permissionLost = !error.authExpired && ['forbidden', 'rest_cannot_edit'].includes(code);
    error.affectedPost = id;
    return error;
  }
  function getNewKey() {
    if (newKey) return newKey;
    const key = prefix + 'new:' + location.pathname;
    newKey = sessionStorage.getItem(key);
    if (!/^[a-f0-9]{32}$/.test(newKey || '')) {
      newKey = uuid();
      sessionStorage.setItem(key, newKey);
    }
    return newKey;
  }
  async function authorize(id = postId, serial = epoch, draftKey = null) {
    if (!current(serial)) {
      const error = Error('恢复会话或当前账号已变化。');
      error.authExpired = !currentUser();
      throw error;
    }
    const query = new URLSearchParams({ post_id: String(id) });
    if (!id) query.set('new_key', draftKey || getNewKey());
    const controller = new AbortController();
    requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response, data;
    try {
      response = await fetch(cfg.url('recovery-context?' + query), {
        headers: { 'X-WP-Nonce': cfg.nonce },
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      data = await response.json();
    } catch {
      throw Error('无法完成恢复权限校验，已暂停本地恢复；编辑内容仍在页面中。');
    } finally {
      clearTimeout(timeout);
      requests.delete(controller);
    }
    if (!current(serial)) throw Error('恢复会话已变化。');
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw failure(data.code, response.status, id);
      const error = Error(
        response.status === 401 || response.status === 403
          ? '登录或编辑权限已失效；本账号的本地候选已清除，请重新登录后手动启用。'
          : data.code === 'inactive'
            ? '文章已在回收站或不可编辑。本地候选保留；请先通过 WordPress 正常还原。'
            : data.code === 'not_found'
              ? '文章已删除。本地候选保留，但不能恢复或以旧 ID 重建。'
              : '无法重新校验恢复权限；本地恢复已暂停，编辑内容仍在页面中。',
      );
      throw error;
    }
    const value = data;
    if (!current(serial)) throw Error('恢复会话已变化。');
    if (
      !validContext(value) ||
      value.siteKey !== config.siteKey ||
      value.userKey !== config.userKey ||
      value.postId !== id
    ) {
      const error = Error('作者或站点身份已变化，本地恢复已停用。');
      error.authExpired = true;
      throw error;
    }
    if (context?.postId === id && context.permission !== value.permission) {
      const error = Error('权限指纹已变化；本地候选保留，但不能按旧权限恢复。请重新校验身份。');
      error.permissionChanged = true;
      throw error;
    }
    if (id && context?.postId === id && context.identity !== value.identity) {
      const error = Error('来源身份已变化，候选不能恢复到新的来源绑定。');
      error.scopeChanged = true;
      throw error;
    }
    return value;
  }
  function suspend(error, serial = epoch) {
    if (serial !== epoch) return;
    epoch++;
    enabled = false;
    checkbox.checked = false;
    checkbox.disabled = false;
    cancelPending();
    entries.replaceChildren();
    if (error.permissionLost) {
      purge(error.affectedPost ?? postId).catch(() =>
        message('权限已失效且浏览器拒绝清理。请在浏览器站点数据中清除此站点的本地候选。'),
      );
    }
    if (
      error.permissionLost ||
      error.authExpired ||
      error.permissionChanged ||
      error.scopeChanged
    ) {
      context = lastCapture = null;
      download.disabled = true;
      window.MarkBridgeEditorRecovery?.cancel();
    }
    retry.hidden = !!(error.permissionLost || error.authExpired);
    message(error.message + (lastCapture ? '可重试校验或下载当前候选。' : ''));
  }
  function renderRows(value) {
    entries.replaceChildren();
    const records = rowsFor(value);
    for (const entry of records) {
      const row = node('div');
      row.className = 'mbb-recovery-row';
      row.append(
        node(
          'span',
          (entry.kind === 'blocks' ? '区块候选' : 'Markdown 候选') +
            (entry.instance === instance ? ' · 本标签页' : ' · 另一标签页') +
            (entry.baseline !== value.baseline ? '（旧版本基线，须比较冲突）' : '') +
            (entry.identity !== value.identity && value.postId ? '（来源绑定已变）' : '') +
            (entry.permission !== value.permission ? '（权限已变，候选保留）' : '') +
            ' · ' +
            new Date(entry.created).toLocaleString(),
        ),
      );
      const restore = node('button', '恢复候选并查看差异'),
        discard = node('button', '删除候选'),
        downloadRecord = node('button', '下载本地候选');
      restore.type = discard.type = downloadRecord.type = 'button';
      restore.disabled = downloadRecord.disabled =
        entry.permission !== value.permission ||
        (value.postId > 0 && entry.identity !== value.identity);
      restore.onclick = () => restoreRecord(entry);
      discard.onclick = async () => {
        const serial = epoch;
        try {
          const fresh = await authorize(postId, serial, entry.newKey);
          if (!current(serial) || !enabled) return;
          await locked(() => {
            store.remove(entry.key);
            renderRows(fresh);
          }, serial);
        } catch (error) {
          suspend(error, serial);
        }
      };
      downloadRecord.onclick = async () => {
        const serial = epoch;
        try {
          const fresh = await authorize(postId, serial, entry.newKey);
          if (!current(serial) || !enabled) return;
          const record = await locked(() => store.read(fresh, entry), serial);
          if (record) downloadContent(record.payload.content, record.kind);
          else await locked(() => renderRows(fresh), serial);
        } catch (error) {
          suspend(error, serial);
        }
      };
      row.append(restore, downloadRecord, discard);
      entries.append(row);
    }
    if (!records.length) entries.append(node('p', '当前身份与版本没有可恢复候选。'));
  }
  async function restoreRecord(entry) {
    const serial = epoch;
    try {
      const fresh = await authorize(postId, serial, entry.newKey);
      if (!current(serial) || !enabled) return;
      const record = await locked(() => store.read(fresh, entry), serial);
      if (!record) {
        await locked(() => renderRows(fresh), serial);
        message('候选损坏、过期或身份/基线不匹配，未恢复正文。');
        return;
      }
      if (!record.context.postId) {
        newKey = record.context.newKey;
        sessionStorage.setItem(prefix + 'new:' + location.pathname, newKey);
      }
      await window.MarkBridgeEditorRecovery.restore(record, async (baseline = null) => {
        let verified;
        try {
          verified = await authorize(record.context.postId, serial, record.context.newKey);
        } catch (error) {
          suspend(error, serial);
          throw error;
        }
        if (!current(serial) || !enabled || !same(verified, record.context))
          throw Error('版本、来源或权限已变化，请重新打开文章，候选未应用。');
        if (
          baseline &&
          (verified.expected !== baseline.expected ||
            verified.sourceDigest !== baseline.sourceDigest)
        )
          throw Error('预览后版本或来源再次变化，候选未应用。请重新查看差异。');
      });
      if (current(serial)) message('候选已进入差异预览，尚未写入 WordPress 或源文件。');
    } catch (error) {
      suspend(error, serial);
    }
  }
  async function refresh(resume = false) {
    const serial = ++epoch;
    enabled = false;
    checkbox.disabled = true;
    cancelPending();
    try {
      if (!instance) await initializeInstance();
      if (!current(serial)) return;
      generation = localStorage.getItem(revocationKey);
      const fresh = await authorize(postId, serial);
      if (!current(serial)) return;
      const ready = await locked(() => {
        store = createStore(localStorage, prefix);
        const raw = localStorage.getItem(preference);
        let opted = false;
        try {
          const value = raw ? JSON.parse(raw) : null;
          opted =
            value?.enabled === true &&
            value.expires > Date.now() &&
            value.expires <= Date.now() + TTL;
        } catch {}
        if (!opted && !resume) {
          store.clear();
          return false;
        }
        localStorage.setItem(
          preference,
          JSON.stringify({ enabled: true, expires: Date.now() + TTL }),
        );
        context = fresh;
        enabled = true;
        checkbox.checked = true;
        retry.hidden = true;
        renderRows(fresh);
        return !rowsFor(fresh).length;
      }, serial);
      if (!enabled) {
        message('本地恢复尚未启用。');
        return;
      }
      message('已启用：候选只保存在本浏览器，7 天到期。');
      if (ready) {
        const markdown = window.MarkBridgeEditorRecovery?.snapshot();
        if (markdown) changed(markdown.kind || 'markdown', () => markdown);
        else changed('blocks', nativeCapture);
      }
    } catch (error) {
      suspend(error, serial);
    } finally {
      if (current(serial)) checkbox.disabled = false;
    }
  }
  function downloadContent(content, type) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' }),
      url = URL.createObjectURL(blob),
      link = node('a');
    link.href = url;
    link.download =
      type === 'markdown'
        ? 'markbridge-local-candidate.md'
        : 'markbridge-local-candidate.blocks.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function changed(type, capture) {
    if (!enabled || !currentUser()) return;
    pending.set(type, capture);
    const revision = (revisions.get(type) || 0) + 1;
    revisions.set(type, revision);
    clearTimeout(timers.get(type));
    message('编辑已变化，等待校验并更新本地候选……');
    const serial = epoch;
    timers.set(
      type,
      setTimeout(async () => {
        const capture = pending.get(type);
        pending.delete(type);
        timers.delete(type);
        if (!capture || !current(serial) || !enabled) return;
        try {
          // Capture and serialize only after debounce; no per-keystroke HTTP or serialization.
          const snapshot = capture();
          if (!snapshot) return;
          lastCapture = { ...snapshot, kind: type };
          download.disabled = false;
          const fresh = await authorize(snapshot.postId, serial);
          if (!current(serial) || !enabled || revisions.get(type) !== revision) return;
          if (
            fresh.expected !== snapshot.expected ||
            fresh.sourceDigest !== snapshot.sourceDigest
          ) {
            message(
              '服务器版本或来源文件已变化，当前编辑未覆盖本地候选。请先处理版本冲突；可下载当前候选。',
            );
            return;
          }
          const didWrite = await locked(() => {
            if (!enabled || revisions.get(type) !== revision) return false;
            store.write(fresh, type, snapshot.payload, instance);
            context = fresh;
            if (snapshot.postId === postId) renderRows(fresh);
            return true;
          }, serial);
          if (didWrite && current(serial) && revisions.get(type) === revision)
            message('本地候选已更新；尚未保存到站点。');
        } catch (error) {
          suspend(error, serial);
        }
      }, 1200),
    );
  }
  async function saved(id, savedRecord, ticket, ordinary = false) {
    if (
      !ticket ||
      ticket.owner !== owner ||
      ticket.epoch !== epoch ||
      ticket.postId !== postId ||
      (!postId && ticket.newKey !== newKey) ||
      ticket.kind !== savedRecord?.kind
    )
      return;
    const unsaved =
      (ordinary || Number(cfg.postId)) && savedRecord?.kind === 'blocks'
        ? nativeCapture(true)
        : null;
    const equal = (a, b) =>
      a &&
      b &&
      ['content', 'title', 'documentId', 'status', 'featuredMedia'].every(
        (key) => a[key] === b[key],
      ) &&
      JSON.stringify(a.requiresResources ?? null) === JSON.stringify(b.requiresResources ?? null);
    const serial = epoch;
    clearTimeout(timers.get(savedRecord.kind));
    timers.delete(savedRecord.kind);
    pending.delete(savedRecord.kind);
    try {
      if (!store || !currentUser() || !savedRecord?.payload) return;
      const fresh = await authorize(Number(id) || postId, serial);
      if (!current(serial)) return;
      await locked(() => {
        for (const entry of store.index()) {
          if (
            entry.instance !== instance ||
            entry.postId !== postId ||
            entry.kind !== savedRecord.kind
          )
            continue;
          const recordContext = postId ? fresh : context;
          if (!recordContext) continue;
          const record = store.read(recordContext, entry);
          if (record && equal(record.payload, savedRecord.payload)) store.remove(entry.key);
        }
        if (postId) context = fresh;
        renderRows(context || fresh);
      }, serial);
      if (!postId && !ordinary) {
        sessionStorage.removeItem(prefix + 'new:' + location.pathname);
        newKey = null;
      }
      message('成功保存；仅清理与本次保存相同的本标签页候选，其他修改保留。');
      if (enabled && unsaved && !equal(unsaved.payload, savedRecord.payload)) {
        changed('blocks', nativeCapture.bind(null, true));
      }
    } catch (error) {
      suspend(error, serial);
    }
  }
  function observeOrdinarySave() {
    if (Number(cfg.postId) || cfg.state || !cfg.newPost || !wp.apiFetch?.use) return;
    wp.apiFetch.use(async (options, next) => {
      let snapshot, ticket, sent;
      let route;
      try {
        const url = new URL(options.url || options.path || '', location.origin);
        route = url.searchParams.get('rest_route') || url.pathname;
      } catch {
        return next(options);
      }
      const target = route.match(/\/wp\/v2\/(?:posts|pages)\/([1-9]\d*)\/?$/);
      if (
        enabled &&
        postId === 0 &&
        target &&
        ['POST', 'PUT', 'PATCH'].includes(String(options.method || 'GET').toUpperCase()) &&
        Number(target[1]) === Number(wp.data.select('core/editor')?.getCurrentPostId?.()) &&
        typeof options.data?.content === 'string'
      ) {
        try {
          snapshot = nativeCapture(true);
          sent = structuredClone(options.data);
          if (snapshot) ticket = { owner, epoch, postId, newKey, kind: 'blocks' };
        } catch {
          /* Ordinary WordPress saving must proceed even if a snapshot is unavailable. */
        }
      }
      const result = await next(options);
      if (
        !snapshot ||
        !ticket ||
        !current(ticket.epoch) ||
        ticket.postId !== postId ||
        ticket.newKey !== newKey
      )
        return result;
      try {
        const response = options.parse === false ? await result.clone().json() : result;
        if (Number(response?.id) !== Number(target[1])) return result;
        ordinaryNotice.hidden = false;
        ordinaryNotice.textContent =
          'WordPress 已保存本次普通文章提交；不同的本地修改仍保留，不会自动转为托管文章。';
        const payload = {
          ...snapshot.payload,
          content: sent.content,
          title: sent.title ?? snapshot.payload.title,
          status: sent.status ?? snapshot.payload.status,
          featuredMedia: sent.featured_media ?? snapshot.payload.featuredMedia,
        };
        const exact =
          response.content?.raw === payload.content &&
          response.title?.raw === payload.title &&
          response.status === payload.status &&
          response.featured_media === payload.featuredMedia &&
          Object.keys(sent).every(
            (key) =>
              ['content', 'title', 'status', 'featured_media', 'context'].includes(key) ||
              (Object.hasOwn(response, key) &&
                JSON.stringify(sent[key]) === JSON.stringify(response[key])),
          );
        if (exact) await saved(0, { kind: 'blocks', payload }, ticket, true);
        else message('WordPress 已保存，但响应与本地候选不同；候选保留，请先比较。');
      } catch {
        /* Cleanup failures never turn a successful native save into a failed save. */
      }
      return result;
    });
  }
  function attach() {
    if (panel.isConnected) return;
    const anchor =
      document.querySelector('#mbb-toolbar') ||
      document.querySelector('#mbb-new')?.parentElement ||
      document.querySelector('.edit-post-header-toolbar,.edit-post-header__settings');
    // Editor toolbars have their own stacking contexts; keep this overlay independent of them.
    if (anchor) document.body.append(panel);
  }
  function nativeCapture(force = false) {
    const editor = wp.data.select('core/editor');
    if (!force && !editor?.isEditedPostDirty?.()) return null;
    const isNew = !Number(cfg.postId) && (cfg.newPost === true || cfg.newPost === '1');
    if (!cfg.state && !isNew) return null;
    return {
      postId: Number(cfg.postId) || 0,
      expected: cfg.state?.expected || null,
      sourceDigest: cfg.state?.source_sha256 || null,
      payload: {
        content: wp.blocks.serialize(wp.data.select('core/block-editor').getBlocks()),
        title: editor.getEditedPostAttribute('title') || '',
        documentId: cfg.state?.document?.documentId || 'LOCAL_' + instance.slice(0, 16),
        status: isNew
          ? 'draft'
          : editor.getEditedPostAttribute('status') || cfg.state.post_status || 'draft',
        featuredMedia: Number(editor.getEditedPostAttribute('featured_media') || 0),
      },
    };
  }
  function installWatchers() {
    if ((Number(cfg.postId) || cfg.newPost === true || cfg.newPost === '1') && wp.data.subscribe) {
      const initial = wp.data.select('core/editor');
      let previous = [
        wp.data.select('core/block-editor')?.getBlocks?.(),
        initial?.getEditedPostAttribute?.('title'),
        initial?.getEditedPostAttribute?.('status'),
        initial?.getEditedPostAttribute?.('featured_media'),
      ];
      nativeUnsubscribe = wp.data.subscribe(() => {
        const editor = wp.data.select('core/editor'),
          blocks = wp.data.select('core/block-editor')?.getBlocks?.();
        const values = [
          blocks,
          editor?.getEditedPostAttribute?.('title'),
          editor?.getEditedPostAttribute?.('status'),
          editor?.getEditedPostAttribute?.('featured_media'),
        ];
        if (previous && values.some((v, i) => v !== previous[i])) changed('blocks', nativeCapture);
        previous = values;
      });
    }
    permissionTimer = setInterval(async () => {
      if (!enabled || document.hidden) return;
      const serial = epoch;
      try {
        await authorize(postId, serial);
      } catch (error) {
        suspend(error, serial);
      }
    }, 30000);
  }
  function setup() {
    panel = node('details');
    panel.id = 'mbb-local-recovery';
    panel.append(node('summary', '浏览器草稿恢复'));
    const label = node('label', '启用此浏览器的本地恢复 ');
    checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'mbb-recovery-opt-in';
    label.prepend(checkbox);
    panel.append(
      label,
      node(
        'p',
        '默认不保存。启用后，草稿以未加密文字保存在这个浏览器；共享设备上的其他使用者可能访问。最多 8 条、合计 1 MiB，7 天到期；不能替代站点保存。',
      ),
    );
    status = node('p', '本地恢复尚未启用。');
    status.setAttribute('role', 'status');
    ordinaryNotice = node('p');
    ordinaryNotice.hidden = true;
    panel.append(ordinaryNotice);
    entries = node('div');
    entries.id = 'mbb-recovery-entries';
    retry = node('button', '重试本地恢复校验');
    retry.type = 'button';
    retry.hidden = true;
    retry.onclick = () => refresh(true);
    const clear = node('button', '清除此账号的本地候选');
    clear.type = 'button';
    clear.onclick = async () => {
      epoch++;
      enabled = false;
      checkbox.checked = false;
      cancelPending();
      try {
        await purge();
        entries.replaceChildren();
        message('此账号的本地候选已清除并停用。');
      } catch {
        message('浏览器拒绝清理存储。请在浏览器站点数据设置中清除；编辑内容仍在页面中。');
      }
    };
    download = node('button', '下载当前未保存候选');
    download.type = 'button';
    download.disabled = true;
    download.onclick = () => {
      // This is the current editor's memory, never a storage read. Keep rescue available offline.
      if (!currentUser() || !lastCapture || download.disabled) return;
      downloadContent(lastCapture.payload.content, lastCapture.kind);
    };
    checkbox.onchange = () => {
      if (checkbox.checked) refresh(true);
      else clear.click();
    };
    panel.append(status, entries, retry, clear, download);
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    installWatchers();
    observeOrdinarySave();
    refresh();
    window.addEventListener('storage', (event) => {
      if ((event.key === preference && event.newValue === null) || event.key === revocationKey) {
        epoch++;
        enabled = false;
        checkbox.checked = false;
        cancelPending();
        entries.replaceChildren();
        message('另一窗口已停用本地恢复。');
      }
    });
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      observer.observe(document.body, { childList: true, subtree: true });
      installWatchers();
      retry.hidden = false;
      message('页面已重新激活；本地恢复须重新校验，正常编辑不受影响。');
    });
    window.addEventListener('pagehide', () => {
      epoch++;
      enabled = false;
      checkbox.checked = false;
      cancelPending();
      clearInterval(permissionTimer);
      nativeUnsubscribe?.();
      nativeUnsubscribe = null;
      releaseInstance?.();
      releaseInstance = null;
      instance = null;
      observer.disconnect();
      lastCapture = null;
    });
  }
  window.MarkBridgeLocalRecovery = {
    changed,
    saved,
    ticket(id = postId, kind = null) {
      return currentUser() && Number(id) === postId
        ? { owner, epoch, postId, newKey: postId ? null : newKey, kind }
        : null;
    },
    denied(code, status, id = postId, ticket) {
      if (
        !ticket ||
        ticket.owner !== owner ||
        ticket.epoch !== epoch ||
        ticket.postId !== postId ||
        (!postId && ticket.newKey !== newKey)
      )
        return;
      suspend(failure(code, status, Number(id) || 0));
    },
    setPost(id) {
      const next = Number(id) || 0;
      if (postId === next) return;
      postId = next;
      context = null;
      if (enabled) refresh(true);
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
