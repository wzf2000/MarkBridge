(() => {
  const cfg = window.MBB_EDITOR;
  let base = null,
    mode = 'markdown',
    candidate = null,
    candidateSource = null,
    conflict = null,
    version = 0,
    epoch = 0,
    loaded = false,
    busy = false,
    saving = false;
  let dialog, source, title, docId, publication, status, diff, preview, save, reviewButton;
  let opening = null,
    openingReason = '',
    featuredOverride = null;
  let mergePanel, mergeOpen, mergeAdopt, mergeRows, mergeStatus, mergeViews;
  let conflictPanel, conflictSummary, conflictDiff, conflictAdopt, conflictDownload;
  let frontmatterPanel,
    frontmatterRows,
    frontmatterWrite,
    frontmatterAuthority = null,
    frontmatterRaw = null;
  let rawSource = null,
    sourceDisplay = '',
    sourceNotice = null,
    normalizedSourceEOL = false;
  function sourceEOLNotice() {
    if (!sourceNotice) return;
    const untouchedCR = typeof rawSource === 'string' && /\r/.test(rawSource);
    sourceNotice.hidden = source.hidden || (!untouchedCR && !normalizedSourceEOL);
    sourceNotice.textContent = untouchedCR
      ? '原文含 CR/CRLF。上传、切换和未编辑预览保留原字节；实际编辑此原文框会按浏览器规范化整篇原文的换行，代码中的换行也可能变化。'
      : '已实际编辑原文框，后续以浏览器输入框的换行为准；请在差异预览中核对代码。';
  }
  function setSource(value) {
    rawSource = value;
    source.value = value;
    sourceDisplay = source.value;
    normalizedSourceEOL = false;
    sourceEOLNotice();
  }
  function readSource() {
    return typeof rawSource === 'string' && source.value === sourceDisplay
      ? rawSource
      : source.value;
  }
  const frontmatterSelected = new Set();
  let resources = null;
  let recoveryRecord = null,
    recoveryVerify = null,
    recoveryRebased = false,
    recoveryApply;
  const el = (tag, attrs = {}, text = '') => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    n.textContent = text;
    return n;
  };
  cfg.url = (route) => {
    const [name, query] = route.split('?');
    const u = new URL(cfg.root);
    if (u.searchParams.has('rest_route'))
      u.searchParams.set(
        'rest_route',
        u.searchParams.get('rest_route').replace(/\/$/, '') + '/' + name,
      );
    else u.pathname = u.pathname.replace(/\/$/, '') + '/' + name;
    if (query) for (const [k, v] of new URLSearchParams(query)) u.searchParams.set(k, v);
    return u.toString();
  };
  async function api(route, data, method = data ? 'POST' : 'GET', signal, raw = false) {
    if (data && method !== 'DELETE' && window.MarkBridgeParameterDrafts?.pending())
      throw Error('参数尚未应用；请应用或撤销参数输入后保存。');
    const session = epoch;
    const requestId =
      Number(
        (data instanceof FormData ? data.get('post_id') : data?.post_id) ??
          new URL(cfg.url(route)).searchParams.get('post_id') ??
          cfg.postId,
      ) || 0;
    const recoveryTicket = window.MarkBridgeLocalRecovery?.ticket(requestId);
    const response = await fetch(cfg.url(route), {
      method,
      headers: {
        ...(data instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        'X-WP-Nonce': cfg.nonce,
      },
      ...(data ? { body: data instanceof FormData ? data : JSON.stringify(data) } : {}),
      ...(signal ? { signal } : {}),
    });
    if (raw && response.ok) return response;
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      if ([401, 403].includes(response.status) && epoch === session)
        window.MarkBridgeLocalRecovery?.denied(
          json.code,
          response.status,
          requestId,
          recoveryTicket,
        );
      const error = Error(
        `${json.message || '请求失败'}（${json.code || 'HTTP'} / ${response.status}）`,
      );
      error.code = json.code;
      error.status = response.status;
      throw error;
    }
    return json;
  }
  function invalidate() {
    version++;
    candidate = null;
    candidateSource = null;
    if (save) save.disabled = true;
    if (recoveryApply) recoveryApply.disabled = true;
    renderFrontmatter();
    window.MarkBridgeLocalRecovery?.changed(
      recoveryRecord?.kind === 'blocks' && !recoveryRecord.context.postId ? 'blocks' : 'markdown',
      recoverySnapshot,
    );
  }
  function recoverySnapshot(closing = false) {
    if (!loaded || (!closing && !dialog?.open) || mode === 'blocks') return null;
    const newBlocks = recoveryRecord?.kind === 'blocks' && !recoveryRecord.context.postId;
    return {
      kind: newBlocks ? 'blocks' : 'markdown',
      postId: base?.post_id || 0,
      expected:
        recoveryRecord && !recoveryRebased
          ? recoveryRecord.context.expected
          : base?.expected || null,
      sourceDigest:
        recoveryRecord && !recoveryRebased
          ? recoveryRecord.context.sourceDigest
          : base?.source_sha256 || null,
      payload: {
        content: newBlocks ? recoveryRecord.payload.content : readSource(),
        title: title.value,
        documentId: docId.value,
        status: publication.value,
        featuredMedia: request().featured_media,
        ...(resources?.requirements() ? { requiresResources: resources.requirements() } : {}),
      },
    };
  }
  function describeError(error) {
    const label = window.MBB?.formatLocation?.(error.location);
    return error.message + (label ? `（${label}）` : '');
  }
  function message(text, error = false) {
    status.textContent = text;
    status.className = error ? 'mbb-error' : 'mbb-status';
  }
  function controls() {
    sourceEOLNotice();
    dialog.querySelectorAll('button,input,textarea,select').forEach((b) => (b.disabled = busy));
    save.disabled =
      busy ||
      !!conflict ||
      !candidate ||
      (resources && !resources.ready()) ||
      (recoveryRecord?.kind === 'blocks' && recoveryRecord.context.postId > 0) ||
      (base?.source_managed && !base?.source_write_available);
    if (recoveryApply) {
      recoveryApply.hidden =
        recoveryRecord?.kind !== 'blocks' || recoveryRecord.context.postId === 0;
      recoveryApply.disabled = busy || !!conflict || !candidate || !!base?.source_managed;
    }
    reviewButton.disabled =
      busy || !loaded || resources?.pending() || (!!conflict && !conflict.adopted);
    if (conflict) {
      conflictAdopt.disabled = busy || !conflict.latest || !!conflict.merge;
      conflictDownload.disabled = busy || typeof conflict.markdown !== 'string';
      if (conflict.manualMetadata)
        conflictAdopt.disabled ||= Object.keys(conflict.manualMetadata).some(
          (key) => !conflict.metadataChoices?.[key],
        );
      mergeOpen.disabled = busy || !opening || typeof conflict.markdown !== 'string';
      mergeAdopt.disabled = busy || !mergeReady();
    }
    if (conflict && !conflict.adopted) {
      source.readOnly = true;
      title.readOnly = true;
      publication.disabled = true;
      dialog.querySelector('#mbb-upload').disabled = true;
    } else if (base?.source_managed && !base?.source_write_available) {
      source.readOnly = true;
      title.readOnly = true;
      publication.disabled = true;
    } else {
      source.readOnly = recoveryRecord?.kind === 'blocks' && !recoveryRecord.context.postId;
      title.readOnly = false;
    }
    frontmatterPanel
      ?.querySelectorAll('input[data-available]')
      .forEach(
        (input) => (input.disabled = busy || source.readOnly || input.dataset.available !== 'true'),
      );
    if (frontmatterWrite)
      frontmatterWrite.disabled = busy || !loaded || mode === 'blocks' || source.readOnly;
    if (loaded && !source.readOnly) {
      source.disabled = false;
      title.disabled = false;
      publication.disabled = false;
    }
    dialog.querySelector('[aria-label="关闭编辑桥"]').disabled = false;
    resources?.render(source.readOnly || mode === 'blocks' || !!base?.source_managed, busy);
    if (mode === 'blocks' || !!base?.source_managed)
      dialog.querySelector('#mbb-upload').accept = '.md,.markdown,text/markdown,text/plain';
    else
      dialog.querySelector('#mbb-upload').accept =
        '.md,.markdown,.zip,text/markdown,text/plain,application/zip';
  }
  const active = (serial) => dialog.open && epoch === serial;
  const isConflict = (error) => ['conflict', 'source_conflict'].includes(error.code);
  function request() {
    return {
      post_id: base?.post_id || 0,
      documentId: docId.value,
      title: title.value,
      expected:
        recoveryRecord && !recoveryRebased
          ? recoveryRecord.context.expected
          : base?.expected || null,
      mode,
      post_status: publication.value,
      source_sha256:
        recoveryRecord && !recoveryRebased
          ? recoveryRecord.context.sourceDigest
          : base?.source_sha256 || null,
      featured_media:
        featuredOverride !== null
          ? featuredOverride
          : recoveryRecord
            ? recoveryRecord.payload.featuredMedia
            : Number(base?.post_id || 0) === Number(cfg.postId)
              ? (wp.data.select('core/editor').getEditedPostAttribute('featured_media') ??
                base?.featured_media ??
                0)
              : (base?.featured_media ?? 0),
      source: mode === 'blocks' ? null : readSource(),
      ...(recoveryRecord?.kind === 'blocks' && !recoveryRecord.context.postId
        ? { new_blocks_original: recoveryRecord.payload.content }
        : {}),
      frontmatter_selected:
        recoveryRecord?.kind === 'blocks' && recoveryRecord.context.postId > 0
          ? []
          : [...frontmatterSelected],
      serialized:
        mode === 'blocks'
          ? recoveryRecord?.kind === 'blocks'
            ? recoveryRecord.payload.content
            : wp.blocks.serialize(wp.data.select('core/block-editor').getBlocks())
          : null,
      ...(resources?.request() || {}),
    };
  }
  function currentMetadata() {
    return (
      base?.frontmatter_current || {
        title: base?.title ?? title?.value ?? '',
        excerpt: '',
        slug: '',
        status: base?.post_status ?? publication?.value ?? 'draft',
        categories: [],
        tags: [],
        featured_media: base?.featured_media ?? request().featured_media,
      }
    );
  }
  function renderFrontmatter(authority = null) {
    if (!frontmatterPanel || !source) return;
    let parsed;
    try {
      const raw =
        mode === 'blocks'
          ? (recoveryRecord?.kind === 'blocks'
              ? wp.blocks.parse(recoveryRecord.payload.content)
              : wp.data.select('core/block-editor')?.getBlocks?.())[0]?.attributes?.raw || ''
          : readSource();
      parsed = window.MBB?.parseFrontmatter(raw, (code, message) => {
        throw Error(message);
      });
    } catch (error) {
      frontmatterRows.replaceChildren(el('p', { role: 'alert' }, error.message));
      frontmatterSelected.clear();
      frontmatterAuthority = null;
      return;
    }
    if ((parsed?.raw || '') !== frontmatterRaw) {
      frontmatterRaw = parsed?.raw || '';
      frontmatterAuthority = null;
    }
    if (authority) frontmatterAuthority = authority;
    const proposal = parsed?.proposal || {};
    for (const key of frontmatterSelected) if (!(key in proposal)) frontmatterSelected.delete(key);
    const current = frontmatterAuthority?.current || currentMetadata();
    const fields =
      frontmatterAuthority?.fields ||
      Object.entries(proposal).map(([field, value]) => ({
        field,
        before: current[field],
        proposal: value,
        resolved: null,
        available: !(
          field === 'status' &&
          ['publish', 'private'].includes(value) &&
          !cfg.canPublish
        ),
        reason: '权限与解析值将在服务器预览中复核。',
      }));
    frontmatterRows.replaceChildren();
    if (!fields.length)
      frontmatterRows.append(el('p', {}, '没有版本化元数据提案；旧无版本头继续作为正文。'));
    const labels = {
      title: '标题',
      excerpt: '摘要',
      slug: 'slug',
      status: '状态',
      categories: '分类 slugs',
      tags: '标签 slugs',
      featured_media: '特色图片',
    };
    for (const original of fields) {
      const row =
        recoveryRecord?.kind === 'blocks' && recoveryRecord.context.postId > 0
          ? {
              ...original,
              available: false,
              reason:
                '本地区块恢复只还原候选，头部提案保留；需要应用元数据请通过编辑桥另行预览确认。',
            }
          : original;
      const line = el('div', { 'data-frontmatter-field': row.field, class: 'mbb-frontmatter-row' });
      const label = el('label', {}, ' 应用 ' + labels[row.field]);
      const input = el('input', {
        type: 'checkbox',
        id: 'mbb-frontmatter-' + row.field,
        'data-available': String(row.available),
      });
      input.checked = frontmatterSelected.has(row.field);
      input.disabled = busy || !row.available;
      input.onchange = () => {
        if (input.checked) frontmatterSelected.add(row.field);
        else frontmatterSelected.delete(row.field);
        invalidate();
        controls();
      };
      label.prepend(input);
      line.append(label);
      line.append(
        el('div', { 'data-role': 'before' }, '当前：' + JSON.stringify(row.before)),
        el('div', { 'data-role': 'proposal' }, '提案：' + JSON.stringify(row.proposal)),
      );
      if (row.resolved !== null)
        line.append(
          el('div', { 'data-role': 'resolved' }, '应用值：' + JSON.stringify(row.resolved)),
        );
      if (row.reason) line.append(el('p', { class: 'mbb-frontmatter-reason' }, row.reason));
      frontmatterRows.append(line);
    }
  }
  async function writeCurrentMetadata() {
    if (busy || !loaded || mode === 'blocks' || source.readOnly) return;
    const session = epoch,
      serial = version;
    busy = true;
    controls();
    try {
      let metadata = currentMetadata();
      if (base?.post_id) {
        const fresh = await api('document?post_id=' + base.post_id);
        if (!active(session) || version !== serial) return;
        if (fresh.expected !== base.expected)
          throw Error('当前文章已变化，请先处理版本冲突；头部未修改。');
        metadata = fresh.frontmatter_current;
        base.frontmatter_current = structuredClone(metadata);
        if (Number(base.post_id) === Number(cfg.postId) && cfg.state?.expected === base.expected)
          cfg.state.frontmatter_current = structuredClone(metadata);
      }
      const old = MBB.parseFrontmatter(readSource(), (code, message) => {
        throw Error(message);
      });
      const lines = ['---', 'markbridge: 1'];
      for (const key of MBB.frontmatterFields)
        if (Object.hasOwn(metadata, key) && !(key === 'title' && !metadata[key].trim()))
          lines.push(key + ': ' + JSON.stringify(metadata[key]));
      const raw = lines.join('\n') + '\n---\n';
      MBB.parseFrontmatter(raw, (code, message) => {
        throw Error(message);
      });
      setSource(raw + (old ? old.body : '\n' + readSource()));
      mode = 'markdown';
      frontmatterSelected.clear();
      frontmatterAuthority = null;
      invalidate();
      message('当前元数据已写入头部候选，尚未保存；请重新预览，来源文章仍须经源文件写回流程。');
    } catch (error) {
      if (active(session) && version === serial) message(describeError(error), true);
    } finally {
      if (active(session)) {
        busy = false;
        controls();
      }
    }
  }
  // Unique-line anchors split long documents without allocating a line-count squared table.
  // Small gaps use LCS for readable edits; large repeated gaps remain bounded replacements.
  function lineDiff(before, after) {
    const a = before.split('\n'),
      b = after.split('\n'),
      raw = [];
    const add = (kind, value) => raw.push({ kind, text: value });
    const gap = (as, ae, bs, be) => {
      while (as < ae && bs < be && a[as] === b[bs]) (add('same', a[as++]), bs++);
      const suffix = [];
      while (as < ae && bs < be && a[ae - 1] === b[be - 1]) {
        suffix.push(a[--ae]);
        be--;
      }
      const na = ae - as,
        nb = be - bs;
      if (na && nb && na * nb <= 12000) {
        const width = nb + 1,
          table = new Uint16Array((na + 1) * width);
        for (let i = na - 1; i >= 0; i--)
          for (let j = nb - 1; j >= 0; j--)
            table[i * width + j] =
              a[as + i] === b[bs + j]
                ? 1 + table[(i + 1) * width + j + 1]
                : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        let i = 0,
          j = 0;
        while (i < na && j < nb) {
          if (a[as + i] === b[bs + j]) (add('same', a[as + i++]), j++);
          else if (table[(i + 1) * width + j] >= table[i * width + j + 1])
            add('removed', a[as + i++]);
          else add('added', b[bs + j++]);
        }
        while (i < na) add('removed', a[as + i++]);
        while (j < nb) add('added', b[bs + j++]);
      } else {
        for (let i = as; i < ae; i++) add('removed', a[i]);
        for (let j = bs; j < be; j++) add('added', b[j]);
      }
      while (suffix.length) add('same', suffix.pop());
    };
    const countsA = new Map(),
      countsB = new Map();
    a.forEach((line, i) => {
      const entry = countsA.get(line);
      countsA.set(line, entry ? { count: entry.count + 1 } : { count: 1, index: i });
    });
    b.forEach((line, i) => {
      const entry = countsB.get(line);
      countsB.set(line, entry ? { count: entry.count + 1 } : { count: 1, index: i });
    });
    const pairs = [];
    for (const [line, entry] of countsA) {
      const other = countsB.get(line);
      if (entry.count === 1 && other?.count === 1) pairs.push([entry.index, other.index]);
    }
    pairs.sort((x, y) => x[0] - y[0]);
    const tails = [],
      previous = new Int32Array(pairs.length);
    pairs.forEach((pair, i) => {
      let low = 0,
        high = tails.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (pairs[tails[middle]][1] < pair[1]) low = middle + 1;
        else high = middle;
      }
      previous[i] = low ? tails[low - 1] : -1;
      tails[low] = i;
    });
    const anchors = [];
    for (let i = tails.at(-1) ?? -1; i >= 0; i = previous[i]) anchors.push(pairs[i]);
    anchors.reverse();
    let as = 0,
      bs = 0;
    for (const [ai, bi] of anchors) {
      gap(as, ai, bs, bi);
      add('same', a[ai]);
      as = ai + 1;
      bs = bi + 1;
    }
    gap(as, a.length, bs, b.length);
    let oldLine = 1,
      newLine = 1;
    return raw.map((row) => {
      const numbered = {
        ...row,
        oldAt: oldLine,
        newAt: newLine,
        oldNo: row.kind === 'added' ? null : oldLine++,
        newNo: row.kind === 'removed' ? null : newLine++,
      };
      return numbered;
    });
  }
  function showDiff(before, after, target = diff) {
    target.replaceChildren();
    const rows = lineDiff(before, after),
      changed = [];
    rows.forEach((row, i) => {
      if (row.kind !== 'same') changed.push(i);
    });
    if (!changed.length) {
      target.append(el('p', {}, '正文无变化。'));
      return;
    }
    const ranges = [];
    for (const index of changed) {
      const last = ranges.at(-1);
      if (last && index - last.last <= 7) last.last = index;
      else ranges.push({ first: index, last: index });
    }
    target.append(
      el('p', {}, `共 ${ranges.length} 处差异；绿色为新增，红色为删除，灰色为未变上下文。`),
    );
    let shownHunks = 0;
    const moreHunks = el(
      'button',
      { type: 'button', class: 'mbb-diff-more-hunks' },
      '显示更多差异',
    );
    target.append(moreHunks);
    const renderHunks = () => {
      const limit = Math.min(ranges.length, shownHunks + 20);
      for (; shownHunks < limit; shownHunks++) {
        const { first, last } = ranges[shownHunks],
          start = Math.max(0, first - 3),
          end = Math.min(rows.length, last + 4),
          part = rows.slice(start, end),
          oldCount = part.filter((r) => r.oldNo !== null).length,
          newCount = part.filter((r) => r.newNo !== null).length;
        const hunk = el('section', {
          class: 'mbb-diff-hunk',
          'aria-label': `差异 ${shownHunks + 1}`,
        });
        hunk.append(
          el('h4', {}, `@@ -${part[0].oldAt},${oldCount} +${part[0].newAt},${newCount} @@`),
        );
        const list = el('div', { class: 'mbb-diff-lines', role: 'list' });
        hunk.append(list);
        let shown = 0;
        const more = el('button', { type: 'button', class: 'mbb-diff-more' }, '显示更多行');
        const render = () => {
          const rowLimit = Math.min(part.length, shown + 200),
            fragment = document.createDocumentFragment();
          for (; shown < rowLimit; shown++) {
            const row = part[shown];
            const line = el('div', { class: `mbb-diff-row mbb-${row.kind}`, role: 'listitem' });
            line.append(
              el('span', { class: 'mbb-diff-number', 'aria-label': '旧行号' }, row.oldNo ?? ''),
              el('span', { class: 'mbb-diff-number', 'aria-label': '新行号' }, row.newNo ?? ''),
              el(
                'span',
                { class: 'mbb-diff-text' },
                `${row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '} ${row.text}`,
              ),
            );
            fragment.append(line);
          }
          list.append(fragment);
          more.hidden = shown === part.length;
        };
        more.onclick = render;
        render();
        hunk.append(more);
        target.insertBefore(hunk, moreHunks);
      }
      moreHunks.hidden = shownHunks === ranges.length;
    };
    moreHunks.onclick = renderHunks;
    renderHunks();
  }
  function downloadCandidate() {
    if (typeof conflict?.markdown !== 'string') return;
    const name = (conflict.payload.documentId || `post-${conflict.payload.post_id}`)
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .slice(0, 64);
    const url = URL.createObjectURL(
      new Blob([conflict.markdown], { type: 'text/markdown;charset=utf-8' }),
    );
    const link = el('a', { href: url, download: `${name || 'candidate'}.md` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const mergeFields = ['title', 'post_status', 'featured_media'];
  function mergeCandidate(value = conflict) {
    return {
      source: value.markdown,
      title: value.payload.title,
      post_status: value.payload.post_status,
      featured_media: value.payload.featured_media,
    };
  }
  function openingMatchesDisplay(value, snapshot, displayedSource) {
    return (
      !!value &&
      value.expected === snapshot.expected &&
      value.document?.source === displayedSource &&
      ['source', 'serialized', 'documentId', 'schema', 'converter', 'origin'].every(
        (key) => value.document?.[key] === snapshot.document?.[key],
      ) &&
      mergeFields.every((key) => value[key] === snapshot[key]) &&
      value.source_managed === !!snapshot.source_managed &&
      value.source_sha256 === (snapshot.source_sha256 ?? null)
    );
  }
  async function acquireOpening(session, serial = version, preserveDisplay = false) {
    opening = null;
    openingReason = '';
    if (!base?.post_id || recoveryRecord) {
      openingReason = '恢复候选或新文章没有本会话的可信打开基线；可手动比较。';
      return;
    }
    const held = base;
    try {
      const value = await api('merge/open', {
        schema: 1,
        post_id: held.post_id,
        expected: held.expected,
      });
      if (!active(session) || version !== serial || base !== held) return;
      if (
        value.schema !== 1 ||
        value.expected !== held.expected ||
        value.claims?.post !== held.post_id ||
        !value.signature ||
        !value.document
      )
        throw Error('服务器未返回完整的可信打开基线');
      if (preserveDisplay && !openingMatchesDisplay(value, held, readSource()))
        throw Error('最终展示的正文、元数据或来源指纹与签名基线不一致');
      opening = value;
      if (preserveDisplay) return;
      base.document = value.document;
      base.title = value.title;
      base.post_status = value.post_status;
      base.featured_media = value.featured_media;
    } catch (error) {
      if (!active(session) || version !== serial || base !== held) return;
      openingReason = error.message + '；自动三方合并不可用，原候选可下载并手动比较。';
    }
  }
  function metadataChoices(baseMeta, mine, latest, target, onChange, choices = {}) {
    const result = baseMeta
      ? MBB.mergeMetadata(baseMeta, mine, latest, choices)
      : {
          conflicts: mergeFields
            .filter((key) => mine[key] !== latest[key])
            .map((key) => ({ key, mine: mine[key], latest: latest[key] })),
        };
    for (const row of result.conflicts) {
      const label = el(
        'label',
        {},
        { title: '标题', post_status: '保存状态', featured_media: '特色图片 ID' }[row.key],
      );
      label.append(el('p', {}, `我的候选：${row.mine}；服务器最新版：${row.latest}`));
      const select = el('select', {
        'data-field': row.key,
        'aria-label': `合并${{ title: '标题', post_status: '状态', featured_media: '特色图片' }[row.key]}`,
      });
      select.append(
        el('option', { value: '' }, '请选择'),
        el('option', { value: 'mine' }, '采用我的候选'),
        el('option', { value: 'latest' }, '采用服务器最新版'),
      );
      if (baseMeta) select.append(el('option', { value: 'base' }, '采用打开时版本'));
      select.value = choices[row.key] || '';
      select.onchange = () => {
        choices[row.key] = select.value;
        onChange();
      };
      label.append(select);
      target.append(label);
    }
    return result;
  }
  function mergeReady() {
    if (!conflict?.merge) return false;
    try {
      MBB.resolveMerge(conflict.merge.plan, conflict.merge.choices);
      return (
        MBB.mergeMetadata(
          opening,
          mergeCandidate(),
          conflict.merge.latest,
          conflict.merge.metadataChoices,
        ).conflicts.length === 0
      );
    } catch {
      return false;
    }
  }
  function resetMerge() {
    if (mergePanel) mergePanel.hidden = true;
    if (mergeRows) mergeRows.replaceChildren();
    if (conflict) conflict.merge = null;
  }
  async function prepareMerge() {
    if (busy || !conflict || !opening || typeof conflict.markdown !== 'string') return;
    const current = conflict,
      session = epoch,
      serial = version,
      signedA = opening;
    const mine = mergeCandidate(current);
    busy = true;
    controls();
    mergePanel.hidden = false;
    mergeRows.replaceChildren();
    mergeStatus.textContent = '正在重新核验打开时基线与服务器最新版……';
    try {
      const latest = await api('merge/latest', {
        schema: 1,
        post_id: current.payload.post_id,
        opening: signedA,
        candidate: mine,
      });
      if (!active(session) || version !== serial || conflict !== current || opening !== signedA)
        return;
      if (!latest.document || latest.claims?.post !== current.payload.post_id || !latest.signature)
        throw Error('服务器最新版签名不完整');
      const plan = MBB.planMerge(signedA.document.source, mine.source, latest.document.source);
      current.merge = { plan, latest, choices: {}, metadataChoices: {}, mine, opening: signedA };
      mergeViews.base.value = signedA.document.source;
      mergeViews.mine.value = mine.source;
      mergeViews.latest.value = latest.document.source;
      for (const hunk of plan.conflicts) {
        const row = el('section', { class: 'mbb-merge-hunk' });
        row.append(
          el(
            'h4',
            {},
            `正文冲突 ${hunk.id}（打开时第 ${hunk.line} 行${hunk.ambiguous ? '；重复结构无法可靠定位' : ''}）`,
          ),
        );
        for (const [key, name] of [
          ['base', '打开时版本'],
          ['mine', '我的候选'],
          ['latest', '服务器最新版'],
        ])
          row.append(el('pre', {}, name + '\n' + hunk[key]));
        const select = el('select', { 'data-hunk': hunk.id, 'aria-label': '正文冲突 ' + hunk.id });
        select.append(
          el('option', { value: '' }, '请选择此冲突'),
          el('option', { value: 'mine' }, '采用我的候选'),
          el('option', { value: 'latest' }, '采用服务器最新版'),
          el('option', { value: 'base' }, '采用打开时版本'),
        );
        select.onchange = () => {
          current.merge.choices[hunk.id] = select.value;
          controls();
        };
        row.append(select);
        mergeRows.append(row);
      }
      metadataChoices(signedA, mine, latest, mergeRows, controls, current.merge.metadataChoices);
      mergeStatus.textContent = plan.conflicts.length
        ? '请逐项选择全部正文和元数据冲突。采用只生成未保存候选，仍须重新预览与保存。'
        : '独立正文变化已组合。未修改的元数据采用服务器最新版；重叠元数据仍须明确选择。';
    } catch (error) {
      if (active(session) && version === serial && conflict === current) {
        current.merge = null;
        mergeStatus.textContent = error.message + '。当前候选未丢弃，请下载或手动比较。';
      }
    } finally {
      if (active(session) && version === serial && conflict === current) {
        busy = false;
        controls();
      }
    }
  }
  async function adoptMerge() {
    if (busy || !mergeReady()) return;
    const current = conflict,
      record = current.merge,
      session = epoch,
      serial = version;
    const text = MBB.resolveMerge(record.plan, record.choices),
      metadata = MBB.mergeMetadata(
        record.opening,
        record.mine,
        record.latest,
        record.metadataChoices,
      ).values;
    let oldHeader;
    try {
      oldHeader =
        MBB.parseFrontmatter(record.mine.source, (code, message) => {
          throw Error(message);
        })?.raw ?? null;
    } catch {
      oldHeader = undefined;
    }
    busy = true;
    controls();
    try {
      const result = await api('merge/adopt', {
        schema: 1,
        post_id: current.payload.post_id,
        opening: record.opening,
        latest: record.latest,
        candidate: record.mine,
        source: text,
      });
      if (
        !active(session) ||
        version !== serial ||
        conflict !== current ||
        current.merge !== record
      )
        return;
      if (
        result.saved !== false ||
        result.newbase?.post_id !== current.payload.post_id ||
        result.newbase.expected !== record.latest.expected ||
        result.document?.source !== text
      )
        throw Error('服务器未返回正确的未保存合并候选');
      base = result.newbase;
      setSource(text);
      source.hidden = false;
      mode = 'markdown';
      title.value = metadata.title;
      publication.value = metadata.post_status;
      featuredOverride = metadata.featured_media;
      const newHeader =
        MBB.parseFrontmatter(text, (code, message) => {
          throw Error(message);
        })?.raw ?? null;
      const headerChanged = oldHeader !== newHeader;
      if (headerChanged) frontmatterSelected.clear();
      frontmatterAuthority = null;
      recoveryRebased = !!recoveryRecord;
      conflict = null;
      conflictPanel.hidden = true;
      resetMerge();
      // C is a verified, signed opening baseline for the next conflict; never manufacture A from B.
      opening = null;
      openingReason = '采用合并候选后须重新获取打开时基线。';
      invalidate();
      const adoptionVersion = version;
      await acquireOpening(session, adoptionVersion);
      if (!active(session) || version !== adoptionVersion) return;
      message(
        '合并候选尚未保存。请核对标题、状态、特色图片与 FrontMatter 提案，再重新查看差异与预览。' +
          (headerChanged
            ? '头部提案已变化，原元数据选择已重置，请重新选择。'
            : '原头部选择已保留，仍须重新预览获取新凭据。'),
      );
    } catch (error) {
      if (active(session) && version === serial && conflict === current) {
        current.merge = null;
        mergeStatus.textContent = error.message + '；原候选仍可下载，请重新核对最新版。';
      }
    } finally {
      if (active(session)) {
        busy = false;
        controls();
      }
    }
  }

  async function refreshConflict() {
    if (busy || !conflict) return;
    const current = conflict,
      serial = epoch;
    current.latest = null;
    current.adopted = false;
    conflictAdopt.disabled = true;
    busy = true;
    controls();
    conflictSummary.textContent = '正在读取服务器最新版……';
    try {
      const latest = await api(`document?post_id=${current.payload.post_id}`);
      if (!active(serial) || conflict !== current) return;
      let latestSource = latest.document.source;
      if (latest.source_managed) {
        const fresh = await api(`source?post_id=${current.payload.post_id}`);
        if (!active(serial) || conflict !== current) return;
        if (fresh.expected !== latest.expected)
          throw Error('读取期间文章再次变化，请重新读取服务器最新版');
        latest.expected = fresh.expected;
        latest.source_sha256 = fresh.source_sha256;
        latestSource = fresh.source;
      }
      current.latest = latest;
      current.metadataChoices = {};
      const metadataPanel = el('section', { class: 'mbb-conflict-metadata' });
      const mineMeta = {
        title: current.payload.title,
        post_status: current.payload.post_status,
        featured_media: current.payload.featured_media,
      };
      const meta = metadataChoices(
        null,
        mineMeta,
        latest,
        metadataPanel,
        controls,
        current.metadataChoices,
      );
      current.manualMetadata = Object.fromEntries(meta.conflicts.map((row) => [row.key, true]));
      conflictSummary.textContent =
        `服务器标题：${latest.title}；状态：${latest.post_status}。` +
        `你的标题：${current.payload.title}；状态：${current.payload.post_status}。` +
        '当前候选暂时锁定以保持比较准确。手动继续须先明确选择不同的标题、状态与特色图片，仍须重新预览。' +
        (opening ? '' : openingReason);
      if (typeof current.markdown === 'string')
        showDiff(latestSource, current.markdown, conflictDiff);
      else
        conflictDiff.replaceChildren(
          el('p', {}, '区块候选尚无成功生成的 Markdown；保留当前区块，请先核对标题和状态。'),
        );
      conflictDiff.prepend(metadataPanel);
    } catch (error) {
      if (!active(serial) || conflict !== current) return;
      current.latest = null;
      conflictDiff.replaceChildren();
      conflictSummary.textContent = `无法读取服务器最新版：${error.message}。当前候选仍在编辑器中；请重试读取。`;
    } finally {
      if (active(serial) && conflict === current) {
        busy = false;
        controls();
      }
    }
  }
  function enterConflict(error, payload, markdown) {
    candidate = null;
    candidateSource = null;
    conflict = { payload, markdown, latest: null };
    resetMerge();
    conflictPanel.hidden = false;
    conflictDiff.replaceChildren();
    conflictSummary.textContent = `${error.message}。正在读取最新版以供比较。`;
    message('检测到版本冲突，保存已停用。请检查下方服务器版本与当前候选。', true);
  }
  function adoptConflict() {
    if (busy || !conflict?.latest) return;
    if (Object.keys(conflict.manualMetadata || {}).some((key) => !conflict.metadataChoices?.[key]))
      return;
    const metadata = {};
    for (const key of mergeFields)
      metadata[key] =
        conflict.metadataChoices?.[key] === 'mine' ? conflict.payload[key] : conflict.latest[key];
    base = conflict.latest;
    title.value = metadata.title;
    publication.value = metadata.post_status;
    featuredOverride = metadata.featured_media;
    opening = null;
    openingReason = '手动采用的基线尚未重新签名；后续冲突可继续手动比较。';
    if (recoveryRecord) recoveryRebased = true;
    conflict.latest = null;
    conflict = null;
    resetMerge();
    conflictPanel.hidden = true;
    invalidate();
    message('已保留你的修改并以服务器最新版继续；请重新预览全部差异，再明确保存。');
    controls();
  }
  async function review() {
    if (busy || (conflict && !conflict.adopted)) return;
    busy = true;
    candidate = null;
    candidateSource = null;
    controls();
    message('正在由服务器校验并生成预览……');
    const serial = version,
      session = epoch;
    let payload;
    try {
      payload = request();
      if (recoveryRecord) {
        await recoveryVerify();
        if (!active(session) || version !== serial) return;
      }
      const result = await api('preview', payload);
      if (!active(session)) return;
      if (version !== serial) {
        message('内容已变化，请重新查看差异。');
        return;
      }
      renderFrontmatter(result.frontmatter);
      payload.frontmatter_receipt = result.frontmatter_receipt;
      payload.resource_receipt = result.resource_receipt;
      const rendered = await MBB_MATH.preview(result.html);
      if (!active(session)) return;
      if (version !== serial) {
        message('内容已变化，请重新查看差异。');
        return;
      }
      save.textContent =
        result.post_status === 'publish'
          ? '确认公开发布'
          : result.post_status === 'private'
            ? '确认私密发布'
            : result.post_status === 'pending'
              ? '确认提交审核'
              : '确认保存草稿';
      showDiff(
        result.before,
        result.resource_plan?.projectedDocument.source || result.document.source,
      );
      // Fragment-only links otherwise inherit the parent URL in a srcdoc frame.
      const previewContent = document.createElement('template');
      previewContent.innerHTML = rendered;
      await resources?.preview(result, previewContent.content);
      if (!active(session) || version !== serial) return;
      for (const link of previewContent.content.querySelectorAll('a[href^="#"]'))
        link.setAttribute('href', 'about:srcdoc' + link.getAttribute('href'));
      preview.srcdoc =
        '<!doctype html><html><head><meta charset="utf-8"><style>' +
        MBB_MATH.style +
        (MBB_EDITOR.footnoteStyle || '') +
        (MBB_EDITOR.teachingStyle || '') +
        'body{font:16px/1.7 system-ui;padding:16px;overflow-wrap:anywhere}pre{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}img{max-width:100%}</style></head><body>' +
        previewContent.innerHTML +
        '</body></html>';
      candidate = payload;
      candidateSource = result.document.source;
      conflict = null;
      conflictPanel.hidden = true;
      message(
        '校验通过；目标状态：' +
          ({ draft: '草稿', pending: '待审核', publish: '公开发布', private: '私密发布' }[
            result.post_status
          ] || publication.selectedOptions[0].textContent) +
          '。请检查差异和预览后确认。',
      );
      if (recoveryRecord?.kind === 'blocks')
        message(
          recoveryRecord.context.postId === 0
            ? '新文章区块候选已校验；请确认标题、文档 ID 和差异，再明确创建 Markdown 与区块成对保存的托管草稿。'
            : base?.source_managed
              ? '本地区块候选仅供预览；来源文章仍须经源文件流程保存，不会解除保存限制。'
              : '本地区块候选校验通过；确认后只恢复到当前编辑器，尚不保存到站点。',
        );
    } catch (e) {
      if (!active(session)) return;
      if (version !== serial) {
        message('先前候选的预览未完成；新输入已保留，请重新查看差异。');
        return;
      }
      if (isConflict(e) && payload) {
        let markdown = payload.source ?? null;
        if (payload.mode === 'blocks') {
          try {
            markdown = window.MBB.toMarkdown(wp.blocks.parse(payload.serialized), {
              origin: 'markdown_import',
            });
          } catch {
            /* Keep the original serialized candidate downloadable when conversion refuses it. */
          }
        }
        enterConflict(e, payload, markdown);
      } else message(describeError(e), true);
    } finally {
      if (active(session)) {
        busy = false;
        controls();
        if (conflict && !conflict.adopted && !conflict.latest) refreshConflict();
      }
    }
  }
  async function persist() {
    if (busy || !candidate) return;
    const payload = candidate,
      markdown = candidateSource,
      session = epoch,
      savedVersion = version,
      savedResources = resources?.requirements();
    const savedKind = recoveryRecord?.kind || (payload.mode === 'blocks' ? 'blocks' : 'markdown');
    const recoveryTicket = window.MarkBridgeLocalRecovery?.ticket(base?.post_id || 0, savedKind);
    let savedResult = null;
    busy = saving = true;
    controls();
    message('正在保存两种表示……');
    try {
      if (recoveryRecord)
        await recoveryVerify({ expected: payload.expected, sourceDigest: payload.source_sha256 });
      const result = await api(base?.source_managed ? 'source-save' : 'save', payload);
      if (!active(session)) return;
      savedResult = result;
      message(
        result.noop
          ? '内容未变，无需重复写入。'
          : base?.source_managed
            ? '已安全写回源文件，并同时保存 Markdown 和区块。'
            : '已同时保存 Markdown 和区块。',
      );
      await window.MarkBridgeLocalRecovery?.saved(
        result.post_id || base?.post_id || 0,
        {
          kind: recoveryRecord?.kind || (payload.mode === 'blocks' ? 'blocks' : 'markdown'),
          payload: {
            content: payload.new_blocks_original || payload.serialized || payload.source,
            title: payload.title,
            documentId: payload.documentId,
            status: payload.post_status,
            featuredMedia: payload.featured_media,
            ...(savedResources ? { requiresResources: savedResources } : {}),
          },
        },
        recoveryTicket,
      );
      if (!active(session)) return; // Recovery authorization/locks may outlive this dialog target.
      if (version === savedVersion) {
        resources?.reset(false);
        window.location.assign(result.editor_url);
      } else {
        // The response acknowledges A. Later edits B are still an unsaved candidate.
        resources?.reset(false, true);
        base = result;
        docId.value = result.document.documentId;
        docId.readOnly = true;
        window.MarkBridgeLocalRecovery?.setPost(result.post_id);
        candidate = candidateSource = null;
        opening = null;
        invalidate();
        const baselineVersion = version;
        await acquireOpening(session, baselineVersion);
        if (!active(session) || version !== baselineVersion) return;
        message(
          '已保存确认的候选；保存期间的新输入仍保留、尚未保存。图片若仍引用原 ZIP 路径，请重新上传后预览。',
        );
      }
    } catch (e) {
      if (!active(session)) return;
      if (savedResult) {
        // A server save acknowledgement remains true even if later local cleanup fails.
        base = savedResult;
        opening = null;
        resources?.reset(false, true);
        invalidate();
        message(
          '已保存确认的候选；后续本地恢复清理未完成。当前输入仍保留，请重新预览或下载。',
          true,
        );
        return;
      }
      if (version !== savedVersion) {
        message('先前候选未获保存确认；新输入已保留，请重新查看差异。', true);
        return;
      }
      if (isConflict(e)) enterConflict(e, payload, markdown);
      else {
        message(describeError(e), true);
        candidate = null;
        candidateSource = null;
      }
    } finally {
      if (active(session)) {
        busy = saving = false;
        controls();
        if (conflict && !conflict.adopted && !conflict.latest) refreshConflict();
      }
    }
  }
  function build() {
    dialog = el('dialog', { id: 'mbb-dialog', 'aria-label': 'Markdown 与区块编辑' });
    dialog.addEventListener('close', () => {
      const snapshot = recoverySnapshot(true);
      rawSource = null;
      sourceDisplay = '';
      normalizedSourceEOL = false;
      if (snapshot) window.MarkBridgeLocalRecovery?.changed(snapshot.kind, () => snapshot);
      resources?.reset();
      if (preview) preview.srcdoc = '';
      epoch++;
      busy = saving = false;
      candidate = null;
      candidateSource = null;
      conflict = null;
      opening = null;
      openingReason = '';
      featuredOverride = null;
      resetMerge();
      loaded = false;
      recoveryRecord = recoveryVerify = null;
      recoveryRebased = false;
    });
    const header = el('div', { class: 'mbb-dialog-header' });
    header.append(el('h2', {}, 'Markdown 与区块编辑'));
    const close = el('button', { type: 'button', 'aria-label': '关闭编辑桥' }, '关闭');
    close.onclick = () => dialog.close();
    header.append(close);
    dialog.append(header);
    const meta = el('div', { class: 'mbb-fields' });
    for (const [label, id] of [
      ['标题', 'mbb-title'],
      ['稳定文档 ID', 'mbb-document-id'],
    ]) {
      const l = el('label', {}, label);
      const n = el('input', { id, type: 'text' });
      n.addEventListener('input', invalidate);
      l.append(n);
      meta.append(l);
    }
    dialog.append(meta);
    title = meta.querySelector('#mbb-title');
    docId = meta.querySelector('#mbb-document-id');
    const stateLabel = el('label', {}, '保存为 ');
    publication = el('select', { id: 'mbb-publication' });
    for (const [value, label] of [
      ['draft', '草稿'],
      ['pending', '待审核'],
      ...(cfg.canPublish
        ? [
            ['publish', '公开发布'],
            ['private', '私密发布'],
          ]
        : []),
    ])
      publication.append(el('option', { value }, label));
    publication.onchange = invalidate;
    stateLabel.append(publication);
    dialog.append(stateLabel);
    const upload = el('label', {}, '上传 Markdown 或图片资源 ZIP ');
    const file = el('input', {
      type: 'file',
      accept: '.md,.markdown,.zip,text/markdown,text/plain,application/zip',
      id: 'mbb-upload',
    });
    file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      if (/\.zip$/i.test(f.name)) {
        const uploadSession = epoch;
        if (mode === 'blocks' || base?.source_managed || source.readOnly) {
          message('此入口不能导入 ZIP 新媒体；正文和来源保存规则保持不变。', true);
          return;
        }
        if (!docId.value) {
          docId.value =
            'Zip' +
            Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
              b.toString(16).padStart(2, '0'),
            ).join('');
          invalidate();
        }
        try {
          await resources.prepare(f);
        } catch (error) {
          if (active(uploadSession)) message(describeError(error), true);
        }
        if (active(uploadSession)) controls();
        file.value = '';
        return;
      }
      if (f.size > 1500000) {
        message('文件过大。', true);
        return;
      }
      const serial = epoch,
        inputVersion = version;
      busy = true;
      controls();
      try {
        const value = await f.text();
        if (!active(serial)) return;
        if (version !== inputVersion) {
          message('上传期间的新输入已保留；未用迟到文件覆盖候选。');
          return;
        }
        setSource(value);
        resources?.reset(true, true);
        source.hidden = false;
        mode = 'upload';
        invalidate();
        message('文件已读取，尚未保存。请先查看差异。');
      } catch (error) {
        if (active(serial) && version === inputVersion) message(describeError(error), true);
      } finally {
        if (active(serial)) {
          busy = false;
          controls();
        }
      }
    };
    upload.append(file);
    dialog.append(upload);
    const resourcePanel = el('section', { id: 'mbb-resources', 'aria-label': '图片资源导入' });
    dialog.append(resourcePanel);
    resources = window.MarkBridgeResources?.create({
      panel: resourcePanel,
      api,
      cfg,
      scope: () => ({
        post_id: base?.post_id || 0,
        documentId: docId.value,
        expected: base?.expected || null,
      }),
      stamp: () => version,
      changed: () => {
        invalidate();
        controls();
      },
      replaceSource: (value) => {
        setSource(value);
        source.hidden = false;
        mode = 'upload';
      },
      message,
      clearPreview: () => {
        if (preview) preview.srcdoc = '';
      },
    });
    source = el('textarea', {
      id: 'mbb-source',
      'aria-label': 'Markdown 原文',
      spellcheck: 'false',
    });
    // WordPress localizes top-level scalar preferences as strings.
    const sourceFontSize =
      typeof cfg.sourceFontSize === 'string' || typeof cfg.sourceFontSize === 'number'
        ? Number(cfg.sourceFontSize)
        : NaN;
    if ([14, 16, 18].includes(sourceFontSize)) source.style.fontSize = sourceFontSize + 'px';
    source.oninput = () => {
      normalizedSourceEOL ||= typeof rawSource === 'string' && /\r/.test(rawSource);
      rawSource = null;
      sourceDisplay = source.value;
      sourceEOLNotice();
      mode = 'markdown';
      invalidate();
    };
    sourceNotice = el('p', { id: 'mbb-source-eol', role: 'note', class: 'mbb-source-eol' });
    sourceNotice.hidden = true;
    dialog.append(source, sourceNotice);
    frontmatterPanel = el('section', {
      id: 'mbb-frontmatter',
      'aria-label': 'FrontMatter 元数据提案',
    });
    frontmatterPanel.append(
      el('h3', {}, 'FrontMatter 元数据提案'),
      el('p', {}, '默认不应用。逐项选择后须重新预览；取消选择不会改写当前文章设置或头部。'),
    );
    frontmatterRows = el('div', { id: 'mbb-frontmatter-fields' });
    frontmatterWrite = el(
      'button',
      { type: 'button', id: 'mbb-frontmatter-from-current' },
      '将当前元数据写入头部',
    );
    frontmatterWrite.onclick = writeCurrentMetadata;
    frontmatterPanel.append(frontmatterRows, frontmatterWrite);
    dialog.append(frontmatterPanel);
    const actions = el('div', { class: 'mbb-actions' });
    reviewButton = el('button', { type: 'button', id: 'mbb-review' }, '查看差异与预览');
    reviewButton.onclick = review;
    save = el('button', { type: 'button', id: 'mbb-save' }, '确认保存双格式');
    save.onclick = persist;
    recoveryApply = el(
      'button',
      { type: 'button', id: 'mbb-recovery-apply' },
      '恢复到当前区块（不保存）',
    );
    recoveryApply.hidden = true;
    recoveryApply.onclick = async () => {
      if (
        busy ||
        !candidate ||
        recoveryRecord?.kind !== 'blocks' ||
        !recoveryRecord.context.postId ||
        base?.source_managed
      )
        return;
      const session = epoch,
        record = recoveryRecord,
        reviewed = candidate,
        appliedVersion = version;
      busy = true;
      controls();
      try {
        await recoveryVerify({
          expected: reviewed.expected,
          sourceDigest: reviewed.source_sha256,
        });
        if (!active(session) || recoveryRecord !== record) return;
        if (version !== appliedVersion || candidate !== reviewed) {
          message('恢复校验期间的新输入已保留，请重新预览后再恢复区块。');
          return;
        }
        if (recoveryRebased && Number(base.post_id) === Number(cfg.postId)) {
          // Only explicit conflict adoption + a verified preview authorizes this baseline update.
          cfg.state = structuredClone(base);
        }
        const parsed = wp.blocks.parse(record.payload.content);
        if (!parsed.length && record.payload.content.trim()) throw Error('候选无法恢复为区块。');
        wp.data.dispatch('core/block-editor').resetBlocks(parsed);
        wp.data.dispatch('core/editor').editPost({
          title: record.payload.title,
          status: record.payload.status,
          featured_media: record.payload.featuredMedia,
        });
        dialog.close();
      } catch (error) {
        if (active(session) && version === appliedVersion) message(describeError(error), true);
      } finally {
        if (active(session)) {
          busy = false;
          controls();
        }
      }
    };
    actions.append(reviewButton, save, recoveryApply);
    dialog.append(actions);
    status = el('p', { role: 'status' });
    diff = el('section', { 'aria-label': '修改差异' });
    preview = el('iframe', { title: '内置内容预览', sandbox: '' });
    conflictPanel = el('section', {
      id: 'mbb-conflict',
      'aria-labelledby': 'mbb-conflict-heading',
    });
    conflictPanel.hidden = true;
    conflictPanel.append(
      el('h3', { id: 'mbb-conflict-heading' }, '版本冲突：核对服务器与当前候选'),
    );
    conflictSummary = el('p', { role: 'status' });
    conflictDiff = el('section', { 'aria-label': '服务器最新版与当前候选的差异' });
    const conflictActions = el('div', { class: 'mbb-actions' });
    const refresh = el(
      'button',
      { type: 'button', id: 'mbb-conflict-refresh' },
      '重新读取服务器最新版',
    );
    refresh.onclick = refreshConflict;
    conflictDownload = el(
      'button',
      { type: 'button', id: 'mbb-conflict-download' },
      '下载当前候选 .md',
    );
    conflictDownload.onclick = downloadCandidate;
    conflictAdopt = el(
      'button',
      { type: 'button', id: 'mbb-conflict-adopt' },
      '保留我的修改，基于最新版继续',
    );
    conflictAdopt.onclick = adoptConflict;
    conflictActions.append(refresh, conflictDownload, conflictAdopt);
    mergeOpen = el('button', { type: 'button', id: 'mbb-merge-open' }, '准备三方合并');
    mergeOpen.onclick = prepareMerge;
    conflictActions.append(mergeOpen);
    mergePanel = el('section', { id: 'mbb-merge-panel', 'aria-label': '三方合并候选' });
    mergePanel.hidden = true;
    mergePanel.append(
      el(
        'p',
        {},
        '仅生成未保存候选。围栏、FrontMatter 与完整教学容器按整体比较；无法定位的重复结构需明确选择。候选换行与末尾空白保持原字节。',
      ),
    );
    const versions = el('div', { class: 'mbb-merge-versions' });
    mergeViews = {};
    for (const [key, name] of [
      ['base', '打开时版本'],
      ['mine', '我的候选'],
      ['latest', '服务器最新版'],
    ]) {
      const label = el('label', {}, name);
      mergeViews[key] = el('textarea', {
        id: 'mbb-merge-' + key,
        readonly: '',
        'aria-label': name,
      });
      label.append(mergeViews[key]);
      versions.append(label);
    }
    mergeStatus = el('p', { role: 'status' });
    mergeRows = el('div', { class: 'mbb-merge-choices' });
    mergeAdopt = el('button', { type: 'button', id: 'mbb-merge-adopt' }, '采用未保存合并候选');
    mergeAdopt.onclick = adoptMerge;
    mergePanel.append(versions, mergeStatus, mergeRows, mergeAdopt);
    conflictPanel.append(conflictSummary, conflictActions, conflictDiff, mergePanel);
    dialog.append(status, conflictPanel, diff, preview);
    document.body.append(dialog);
  }
  async function open(id, selectedMode = 'markdown') {
    if (!dialog) build();
    if (dialog.open) return;
    const serial = ++epoch;
    dialog.showModal();
    busy = true;
    loaded = false;
    base = null;
    candidate = null;
    candidateSource = null;
    conflict = null;
    recoveryRecord = recoveryVerify = null;
    recoveryRebased = false;
    opening = null;
    openingReason = '';
    featuredOverride = null;
    resetMerge();
    version++;
    const loadingVersion = version,
      stillOpening = () => active(serial) && version === loadingVersion;
    frontmatterSelected.clear();
    frontmatterAuthority = null;
    frontmatterRaw = null;
    resources?.reset();
    setSource('');
    title.value = '';
    docId.value = '';
    diff.replaceChildren();
    preview.srcdoc = '';
    conflictPanel.hidden = true;
    conflictDiff.replaceChildren();
    controls();
    message('正在读取服务器版本……');
    try {
      let freshBase = id
        ? id === cfg.postId
          ? structuredClone(cfg.state)
          : await api('document?post_id=' + id)
        : null;
      if (!stillOpening()) return;
      if (id && id === cfg.postId && freshBase?.expected) {
        try {
          const server = await api('document?post_id=' + id);
          if (!stillOpening()) return;
          // Native saves return a new fingerprint, but not necessarily the full source/metadata.
          // A GET may fill that same snapshot; it never adopts another editor's baseline.
          if (server.expected === freshBase.expected) {
            freshBase = server;
            cfg.state = structuredClone(server);
          }
        } catch (error) {
          if (!stillOpening()) return;
          // Preserve the existing read-only stored-source fallback on transport failures.
          // Authentication/permission failures must never open the cached private snapshot.
          if (!freshBase.source_managed || error.status) throw error;
          freshBase.source_write_available = false;
        }
      }
      base = freshBase;
      await acquireOpening(serial);
      if (!stillOpening()) return;
      setSource(base?.document.source || '');
      let sourceReadFailed = false;
      if (base?.source_managed) {
        try {
          let fresh = await api('source?post_id=' + id);
          if (!stillOpening()) return;
          if (fresh.expected !== base.expected) {
            if (id === cfg.postId)
              throw Error('当前文章已变化，请先处理版本冲突；保留原版本基线。');
            const current = await api('document?post_id=' + id);
            if (!stillOpening()) return;
            fresh = await api('source?post_id=' + id);
            if (!stillOpening()) return;
            if (fresh.expected !== current.expected)
              throw Error('读取期间文章再次变化，请重新打开编辑器');
            base = current;
          }
          base.expected = fresh.expected;
          base.source_sha256 = fresh.source_sha256;
          setSource(fresh.source);
        } catch (e) {
          if (!stillOpening()) return;
          base.source_write_available = false;
          sourceReadFailed = true;
        }
        if (sourceReadFailed) {
          opening = null;
          openingReason = '来源读取未完成，自动三方合并不可用；当前文字保留供手动比较。';
        } else if (!openingMatchesDisplay(opening, base, readSource())) {
          // The tool screen may have followed a concurrent source save from A to C.
          // Never retain A while presenting C as the unchanged local candidate.
          opening = null;
          await acquireOpening(serial, loadingVersion, true);
          if (!stillOpening()) return;
        }
      }
      mode = selectedMode;
      title.value =
        selectedMode === 'blocks'
          ? wp.data.select('core/editor').getEditedPostAttribute('title')
          : base?.title || '';
      docId.value = base?.document.documentId || '';
      docId.readOnly = !!base;
      publication.value =
        (id > 0 && id === cfg.postId && !base?.source_managed
          ? wp.data.select('core/editor').getEditedPostAttribute('status')
          : null) ||
        base?.post_status ||
        'draft';
      if (id && id === cfg.postId && selectedMode === 'markdown' && !base?.source_managed) {
        const current = wp.blocks.serialize(wp.data.select('core/block-editor').getBlocks());
        const converted = await api('preview', {
          post_id: id,
          expected: base.expected,
          mode: 'blocks',
          serialized: current,
          title: wp.data.select('core/editor').getEditedPostAttribute('title'),
        });
        if (!stillOpening()) return;
        setSource(converted.document.source);
        title.value = converted.title;
      }
      source.hidden = selectedMode === 'blocks';
      diff.replaceChildren();
      preview.srcdoc = '';
      loaded = true;
      renderFrontmatter();
      window.MarkBridgeLocalRecovery?.setPost(base?.post_id || 0);
      message(
        base?.source_managed
          ? sourceReadFailed
            ? '无法读取绑定源文件，当前显示 WordPress 已保存的 Markdown（可能不是源文件最新版），仅供查看和预览。'
            : base.source_write_available
              ? '已读取绑定源文件；请编辑后查看差异和预览，再明确确认写回。'
              : '已读取绑定源文件，当前仅供查看和预览，请使用同步工具更新。'
          : selectedMode === 'blocks'
            ? '将当前区块转换回 Markdown 并预览，尚未保存。'
            : '编辑或上传 Markdown，再检查差异。',
      );
    } catch (e) {
      if (stillOpening()) message(describeError(e), true);
    } finally {
      if (stillOpening()) {
        busy = false;
        controls();
      }
    }
  }
  // Native Gutenberg saves still go through server-side paired validation.
  // Never refresh the baseline with a GET here: that could hide another editor's changes.
  function installNativeSave() {
    if (cfg.state?.source_managed || !cfg.state?.expected || !wp.apiFetch?.use) return false;
    wp.apiFetch.use(async (options, next) => {
      let route;
      try {
        const url = new URL(options.url || options.path || '', location.origin);
        route = url.searchParams.get('rest_route') || url.pathname;
      } catch {
        return next(options);
      }
      const match = route.match(/\/wp\/v2\/(?:posts|pages)\/(\d+)\/?$/);
      if (
        !match ||
        Number(match[1]) !== Number(cfg.postId) ||
        !['POST', 'PUT', 'PATCH'].includes((options.method || 'GET').toUpperCase())
      )
        return next(options);
      if (!options.data || typeof options.data !== 'object' || Array.isArray(options.data))
        throw { code: 'mbb_request', message: '无法验证此保存请求，请重新打开编辑器后重试。' };
      const recoveryTicket = window.MarkBridgeLocalRecovery?.ticket(Number(cfg.postId), 'blocks');
      const result = await next({
        ...options,
        data: { ...options.data, mbb_expected: cfg.state.expected },
      });
      const data = options.parse === false ? await result.clone().json() : result;
      if (typeof data?.mbb_expected === 'string') {
        cfg.state.expected = data.mbb_expected;
        if (typeof data.status === 'string') cfg.state.post_status = data.status;
        if (typeof data.title?.raw === 'string') cfg.state.title = data.title.raw;
        if (Number.isInteger(data.featured_media)) cfg.state.featured_media = data.featured_media;
        if (cfg.state.document && typeof data.content?.raw === 'string')
          cfg.state.document.serialized = data.content.raw;
        await window.MarkBridgeLocalRecovery?.saved(
          Number(data.id) || Number(cfg.postId),
          {
            kind: 'blocks',
            payload: {
              content: data.content?.raw || options.data.content,
              title: data.title?.raw ?? options.data.title ?? cfg.state.title,
              status: data.status ?? options.data.status ?? cfg.state.post_status,
              documentId: cfg.state.document?.documentId || '',
              featuredMedia: Number(
                data.featured_media ?? options.data.featured_media ?? cfg.state.featured_media ?? 0,
              ),
            },
          },
          recoveryTicket,
        );
      }
      return result;
    });
    return true;
  }
  window.MarkBridgeEditorRecovery = {
    snapshot: recoverySnapshot,
    async restore(record, verify) {
      const invocation = epoch,
        invocationVersion = version;
      const cancelled = () => {
        throw Error('编辑会话或输入已变化，本地恢复未应用；当前内容已保留。');
      };
      await verify();
      if (epoch !== invocation || version !== invocationVersion) cancelled();
      if (dialog?.open) {
        // close is queued by the browser; finish our own close before opening another session.
        const closing = epoch;
        const closed = new Promise((resolve) =>
          dialog.addEventListener('close', resolve, { once: true }),
        );
        dialog.close();
        await closed;
        if (epoch !== closing + 1 || version !== invocationVersion || dialog.open) cancelled();
      }
      const restorationEpoch = epoch + 1;
      await open(record.context.postId, record.kind === 'blocks' ? 'blocks' : 'markdown');
      if (
        !active(restorationEpoch) ||
        !loaded ||
        Number(base?.post_id || 0) !== Number(record.context.postId)
      )
        cancelled();
      const openingVersion = version;
      await verify();
      if (
        !active(restorationEpoch) ||
        !loaded ||
        version !== openingVersion ||
        Number(base?.post_id || 0) !== Number(record.context.postId)
      )
        cancelled();
      recoveryRecord = record;
      opening = null;
      openingReason = '本地恢复记录没有可信的打开时签名基线，需手动比较，不能冒充三方合并基线。';
      resources?.restore(record.payload.requiresResources);
      recoveryVerify = verify;
      title.value = record.payload.title;
      docId.value = record.payload.documentId;
      publication.value = record.payload.status;
      setSource(record.kind === 'markdown' ? record.payload.content : '');
      mode = record.kind === 'blocks' ? 'blocks' : 'markdown';
      if (record.kind === 'blocks' && !record.context.postId) {
        const parsed = wp.blocks.parse(record.payload.content);
        const markdown = window.MBB.toMarkdown(parsed, { origin: 'markdown_import' });
        const verified = window.MBB.importDocument(markdown, record.payload.documentId);
        if (verified.serialized !== record.payload.content)
          throw Error('新原生区块无法精确往返；候选未创建，可下载保留原区块。');
        setSource(markdown);
        mode = 'markdown';
      }
      source.hidden = mode === 'blocks';
      invalidate();
      await review();
    },
    cancel() {
      if (recoveryRecord) {
        setSource('');
        title.value = docId.value = '';
        preview.srcdoc = '';
        diff.replaceChildren();
        dialog.close();
      }
    },
  };
  function setup() {
    document.querySelector('#mbb-new')?.addEventListener('click', () => open(0));
    document
      .querySelectorAll('.mbb-open')
      .forEach((b) => b.addEventListener('click', () => open(Number(b.dataset.post))));
    if (!Number(cfg.postId)) {
      if (/\/post-new\.php$/.test(window.location.pathname)) {
        const install = () => {
          const compact = window.matchMedia?.('(max-width: 782px)').matches ?? innerWidth <= 782;
          const toolbar = document.querySelector(
            '.edit-post-header-toolbar, .editor-header__toolbar, .edit-post-header__settings',
          );
          const target = compact ? document.body : toolbar;
          if (!target) return false;
          const existing = document.querySelector('#mbb-new-post');
          if (existing) {
            if (existing.parentElement !== target) target.append(existing);
            return true;
          }
          const button = el(
            'button',
            {
              type: 'button',
              id: 'mbb-new-post',
              class: 'components-button is-secondary mbb-new-post-button',
              'aria-label': '导入 Markdown 文件',
            },
            '导入 Markdown',
          );
          button.onclick = () => {
            const editor = wp.data.select('core/editor');
            const title = editor?.getEditedPostAttribute('title') || '';
            const content = editor?.getEditedPostContent() || '';
            if (title.trim() || content.trim()) {
              window.alert('当前新文章已有未保存内容，请先保存或清空后再导入 Markdown。');
              return;
            }
            open(0);
          };
          // Keep Gutenberg's document tools (add block, undo, redo) together;
          // the import action follows them as a secondary, clearly separated action.
          target.append(button);
          return true;
        };
        if (!install()) {
          let attempts = 0;
          const timer = setInterval(() => {
            if (install() || ++attempts > 300) clearInterval(timer);
          }, 100);
        }
        const observer = new MutationObserver(() => install());
        window.addEventListener('resize', install);
        observer.observe(document.body, { childList: true, subtree: true });
      }
      return;
    }
    const timer = setInterval(() => {
      const editor = wp.data.select('core/editor');
      if (!editor?.getCurrentPostId()) return;
      clearInterval(timer);
      const nativeSave = installNativeSave();
      if (!nativeSave) wp.data.dispatch('core/editor').lockPostSaving('mbb-paired-save');
      wp.data.dispatch('core/editor').lockPostAutosaving('mbb-paired-save');
      const bar = el('div', { id: 'mbb-toolbar' });
      const a = el(
        'button',
        { type: 'button', id: 'mbb-markdown' },
        cfg.state?.source_managed ? 'Markdown 原文 / 预览' : 'Markdown 编辑 / 上传',
      );
      a.onclick = () => open(cfg.postId);
      const b = el(
        'button',
        { type: 'button', id: 'mbb-block-review' },
        cfg.state?.source_managed ? '区块预览' : '查看差异与预览',
      );
      b.onclick = () => open(cfg.postId, 'blocks');
      const h = el('button', { type: 'button', id: 'mbb-history' }, '历史版本 / 恢复');
      h.onclick = () => window.MBB_REVISIONS.open(cfg.postId);
      bar.append(
        a,
        b,
        h,
        el(
          'span',
          {},
          cfg.state?.source_managed
            ? '正文由源文件同步，需预览后确认写回'
            : nativeSave
              ? '可直接使用编辑器保存／更新，两种格式同步保存'
              : '请使用预览中的保存按钮',
        ),
      );
      const getCurrentBlocks = () => wp.data.select('core/block-editor')?.getBlocks?.() || [];
      const capabilities = el('details', { class: 'mbb-capabilities' });
      const capabilitySummary = el('summary', { 'aria-live': 'polite' }, '转换支持与当前内容');
      capabilities.append(capabilitySummary);
      const help = el('div', { class: 'mbb-capabilities-help' });
      help.append(
        el(
          'p',
          {},
          '支持段落、标题、引用、列表、任务列表、表格、图片、链接、代码、TeX 公式、命名脚注和受限 HTML。样式、额外属性和第三方区块仍需通过往返校验。',
        ),
      );
      const current = el('p', { role: 'status' });
      help.append(current);
      const check = el('button', { type: 'button' }, '检查当前区块转换');
      check.onclick = () => {
        try {
          const blocks = getCurrentBlocks();
          window.MBB.toMarkdown(blocks, { origin: 'markdown_import' });
          current.textContent = '当前区块通过浏览器往返检查；保存时服务器还会重新校验。';
        } catch (error) {
          current.textContent =
            describeError(error) +
            '。请检查该区块的格式，或先下载 Markdown 保留候选，再修正并重新预览。';
        }
      };
      help.append(check);
      capabilities.append(help);
      bar.append(capabilities);
      document.body.append(bar);
      const inspectCapabilities = () => {
        const unsupported = [];
        const supported = new Set(cfg.supportedBlocks || window.MBB?.supportedBlocks || []);
        const visit = (blocks, path = []) =>
          blocks.forEach((block, index) => {
            const at = [...path, index];
            if (!supported.has(block.name)) {
              const title = wp.blocks.getBlockType?.(block.name)?.title || block.name;
              unsupported.push(`${title}（第 ${at.map((i) => i + 1).join(' → ')} 个区块）`);
            }
            visit(block.innerBlocks || [], at);
          });
        visit(getCurrentBlocks());
        capabilitySummary.textContent = unsupported.length
          ? `转换支持：${unsupported.length} 个区块暂不支持`
          : '转换支持与当前内容';
        capabilitySummary.classList.toggle('mbb-capability-warning', unsupported.length > 0);
        current.textContent = unsupported.length
          ? `当前包含尚不支持转换的区块：${unsupported.slice(0, 8).join('、')}${unsupported.length > 8 ? '等' : ''}。请保留现有内容，调整后重新预览。`
          : '当前区块类型已有转换映射；请检查当前区块转换，确认其属性和格式也能保留。';
      };
      inspectCapabilities();
      let capabilityBlocks = getCurrentBlocks();
      wp.data.subscribe(() => {
        const blocks = getCurrentBlocks();
        if (blocks !== capabilityBlocks) {
          capabilityBlocks = blocks;
          inspectCapabilities();
        }
      });
      // Keep the toolbar inside the visible editor canvas, never over its settings sidebar.
      const placeBar = () => {
        const canvas = document.querySelector('.interface-interface-skeleton__content');
        if (!canvas) return;
        const bounds = canvas.getBoundingClientRect();
        let left = Math.max(0, bounds.left),
          right = Math.min(innerWidth, bounds.right);
        for (const sidebar of document.querySelectorAll('.interface-interface-skeleton__sidebar')) {
          const box = sidebar.getBoundingClientRect();
          if (box.width && box.height && box.right > left && box.left < right)
            right = Math.min(right, box.left);
        }
        const available = right - left - 24;
        bar.hidden = available < 240;
        const x = left + 12 + 'px',
          width = Math.max(0, available) + 'px';
        if (bar.style.left !== x) bar.style.left = x;
        if (bar.style.maxWidth !== width) bar.style.maxWidth = width;
      };
      let queued = false;
      const scheduleBar = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          placeBar();
        });
      };
      const layout = document.querySelector('.interface-interface-skeleton');
      if (layout)
        new MutationObserver(scheduleBar).observe(layout, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden'],
        });
      window.addEventListener('resize', scheduleBar);
      placeBar();
      const editingFingerprint = () => {
        const e = wp.data.select('core/editor');
        return JSON.stringify([
          e.getEditedPostContent(),
          e.getEditedPostAttribute('title'),
          e.getEditedPostAttribute('featured_media'),
        ]);
      };
      let previous = editingFingerprint();
      wp.data.subscribe(() => {
        const next = editingFingerprint();
        if (next !== previous) {
          previous = next;
          invalidate();
        }
      });
    }, 100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
