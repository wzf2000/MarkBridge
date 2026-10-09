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
    busy = false;
  let dialog, source, title, docId, publication, status, diff, preview, save, reviewButton;
  let conflictPanel, conflictSummary, conflictDiff, conflictAdopt, conflictDownload;
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
  async function api(route, data) {
    const response = await fetch(cfg.url(route), {
      method: data ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
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
  }
  function message(text, error = false) {
    status.textContent = text;
    status.className = error ? 'mbb-error' : 'mbb-status';
  }
  function controls() {
    dialog.querySelectorAll('button,input,textarea,select').forEach((b) => (b.disabled = busy));
    save.disabled =
      busy || !!conflict || !candidate || (base?.source_managed && !base?.source_write_available);
    reviewButton.disabled = busy || !loaded || (!!conflict && !conflict.adopted);
    if (conflict) {
      conflictAdopt.disabled = busy || !conflict.latest;
      conflictDownload.disabled = busy || typeof conflict.markdown !== 'string';
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
      source.readOnly = false;
      title.readOnly = false;
    }
  }
  const active = (serial) => dialog.open && epoch === serial;
  const isConflict = (error) => ['conflict', 'source_conflict'].includes(error.code);
  function request() {
    return {
      post_id: base?.post_id || 0,
      documentId: docId.value,
      title: title.value,
      expected: base?.expected || null,
      mode,
      post_status: publication.value,
      source_sha256: base?.source_sha256 || null,
      featured_media:
        Number(base?.post_id) === Number(cfg.postId)
          ? (wp.data.select('core/editor').getEditedPostAttribute('featured_media') ??
            base?.featured_media ??
            0)
          : (base?.featured_media ?? 0),
      source: mode === 'blocks' ? null : source.value,
      serialized:
        mode === 'blocks'
          ? wp.blocks.serialize(wp.data.select('core/block-editor').getBlocks())
          : null,
    };
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
      conflictSummary.textContent =
        `服务器标题：${latest.title}；状态：${latest.post_status}。` +
        `你的标题：${current.payload.title}；状态：${current.payload.post_status}。` +
        '当前候选暂时锁定以保持比较准确。选择继续后可编辑，仍须重新预览全部差异并明确保存；不会自动合并。';
      if (typeof current.markdown === 'string')
        showDiff(latestSource, current.markdown, conflictDiff);
      else
        conflictDiff.replaceChildren(
          el('p', {}, '区块候选尚无成功生成的 Markdown；保留当前区块，请先核对标题和状态。'),
        );
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
    conflictPanel.hidden = false;
    conflictDiff.replaceChildren();
    conflictSummary.textContent = `${error.message}。正在读取最新版以供比较。`;
    message('检测到版本冲突，保存已停用。请检查下方服务器版本与当前候选。', true);
  }
  function adoptConflict() {
    if (busy || !conflict?.latest) return;
    base = conflict.latest;
    conflict.latest = null;
    conflict = null;
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
      const result = await api('preview', payload);
      if (!active(session)) return;
      if (version !== serial) {
        message('内容已变化，请重新查看差异。');
        return;
      }
      const rendered = await MBB_MATH.preview(result.html);
      if (!active(session)) return;
      if (version !== serial) {
        message('内容已变化，请重新查看差异。');
        return;
      }
      save.textContent =
        payload.post_status === 'publish'
          ? '确认公开发布'
          : payload.post_status === 'private'
            ? '确认私密发布'
            : payload.post_status === 'pending'
              ? '确认提交审核'
              : '确认保存草稿';
      showDiff(result.before, result.document.source);
      // Fragment-only links otherwise inherit the parent URL in a srcdoc frame.
      const previewContent = document.createElement('template');
      previewContent.innerHTML = rendered;
      for (const link of previewContent.content.querySelectorAll('a[href^="#"]'))
        link.setAttribute('href', 'about:srcdoc' + link.getAttribute('href'));
      preview.srcdoc =
        '<!doctype html><html><head><meta charset="utf-8"><style>' +
        MBB_MATH.style +
        (MBB_EDITOR.footnoteStyle || '') +
        'body{font:16px/1.7 system-ui;padding:16px;overflow-wrap:anywhere}pre{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}img{max-width:100%}</style></head><body>' +
        previewContent.innerHTML +
        '</body></html>';
      candidate = payload;
      candidateSource = result.document.source;
      conflict = null;
      conflictPanel.hidden = true;
      message(
        '校验通过；目标状态：' +
          publication.selectedOptions[0].textContent +
          '。请检查差异和预览后确认。',
      );
    } catch (e) {
      if (!active(session)) return;
      if (isConflict(e) && payload) enterConflict(e, payload, payload.source ?? null);
      else message(e.message, true);
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
      session = epoch;
    busy = true;
    controls();
    message('正在保存两种表示……');
    try {
      const result = await api(base?.source_managed ? 'source-save' : 'save', payload);
      if (!active(session)) return;
      message(
        result.noop
          ? '内容未变，无需重复写入。'
          : base?.source_managed
            ? '已安全写回源文件，并同时保存 Markdown 和区块。'
            : '已同时保存 Markdown 和区块。',
      );
      window.location.assign(result.editor_url);
    } catch (e) {
      if (!active(session)) return;
      if (isConflict(e)) enterConflict(e, payload, markdown);
      else {
        message(e.message, true);
        candidate = null;
        candidateSource = null;
      }
    } finally {
      if (active(session)) {
        busy = false;
        controls();
        if (conflict && !conflict.adopted && !conflict.latest) refreshConflict();
      }
    }
  }
  function build() {
    dialog = el('dialog', { id: 'mbb-dialog', 'aria-label': 'Markdown 与区块编辑' });
    dialog.addEventListener('close', () => {
      epoch++;
      busy = false;
      candidate = null;
      candidateSource = null;
      conflict = null;
      loaded = false;
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
    const upload = el('label', {}, '上传 Markdown 文件 ');
    const file = el('input', {
      type: 'file',
      accept: '.md,.markdown,text/markdown,text/plain',
      id: 'mbb-upload',
    });
    file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      if (f.size > 1500000) {
        message('文件过大。', true);
        return;
      }
      const serial = epoch;
      busy = true;
      controls();
      try {
        const value = await f.text();
        if (!active(serial)) return;
        source.value = value;
        source.hidden = false;
        mode = 'upload';
        invalidate();
        message('文件已读取，尚未保存。请先查看差异。');
      } catch (error) {
        if (active(serial)) message(error.message, true);
      } finally {
        if (active(serial)) {
          busy = false;
          controls();
        }
      }
    };
    upload.append(file);
    dialog.append(upload);
    source = el('textarea', {
      id: 'mbb-source',
      'aria-label': 'Markdown 原文',
      spellcheck: 'false',
    });
    if ([14, 16, 18].includes(cfg.sourceFontSize))
      source.style.fontSize = cfg.sourceFontSize + 'px';
    source.oninput = () => {
      mode = 'markdown';
      invalidate();
    };
    dialog.append(source);
    const actions = el('div', { class: 'mbb-actions' });
    reviewButton = el('button', { type: 'button', id: 'mbb-review' }, '查看差异与预览');
    reviewButton.onclick = review;
    save = el('button', { type: 'button', id: 'mbb-save' }, '确认保存双格式');
    save.onclick = persist;
    actions.append(reviewButton, save);
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
    conflictPanel.append(conflictSummary, conflictActions, conflictDiff);
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
    version++;
    source.value = '';
    title.value = '';
    docId.value = '';
    diff.replaceChildren();
    preview.srcdoc = '';
    conflictPanel.hidden = true;
    conflictDiff.replaceChildren();
    controls();
    message('正在读取服务器版本……');
    try {
      const freshBase = id
        ? id === cfg.postId
          ? structuredClone(cfg.state)
          : await api('document?post_id=' + id)
        : null;
      if (!active(serial)) return;
      base = freshBase;
      source.value = base?.document.source || '';
      let sourceReadFailed = false;
      if (base?.source_managed) {
        try {
          let fresh = await api('source?post_id=' + id);
          if (!active(serial)) return;
          if (fresh.expected !== base.expected) {
            const current = await api('document?post_id=' + id);
            if (!active(serial)) return;
            fresh = await api('source?post_id=' + id);
            if (!active(serial)) return;
            if (fresh.expected !== current.expected)
              throw Error('读取期间文章再次变化，请重新打开编辑器');
            base = current;
          }
          base.expected = fresh.expected;
          base.source_sha256 = fresh.source_sha256;
          source.value = fresh.source;
        } catch (e) {
          if (!active(serial)) return;
          base.source_write_available = false;
          sourceReadFailed = true;
        }
      }
      mode = selectedMode;
      title.value =
        selectedMode === 'blocks'
          ? wp.data.select('core/editor').getEditedPostAttribute('title')
          : base?.title || '';
      docId.value = base?.document.documentId || '';
      docId.readOnly = !!base;
      publication.value = base?.post_status || 'draft';
      if (id && id === cfg.postId && selectedMode === 'markdown' && !base?.source_managed) {
        const current = wp.blocks.serialize(wp.data.select('core/block-editor').getBlocks());
        const converted = await api('preview', {
          post_id: id,
          expected: base.expected,
          mode: 'blocks',
          serialized: current,
          title: wp.data.select('core/editor').getEditedPostAttribute('title'),
        });
        if (!active(serial)) return;
        source.value = converted.document.source;
        title.value = converted.title;
      }
      source.hidden = selectedMode === 'blocks';
      diff.replaceChildren();
      preview.srcdoc = '';
      loaded = true;
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
      if (active(serial)) message(e.message, true);
    } finally {
      if (active(serial)) {
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
      }
      return result;
    });
    return true;
  }
  function setup() {
    document.querySelector('#mbb-new')?.addEventListener('click', () => open(0));
    document
      .querySelectorAll('.mbb-open')
      .forEach((b) => b.addEventListener('click', () => open(Number(b.dataset.post))));
    if (!Number(cfg.postId)) {
      if (/\/post-new\.php$/.test(window.location.pathname)) {
        const install = () => {
          const toolbar = document.querySelector(
            '.edit-post-header-toolbar, .edit-post-header__settings',
          );
          if (!toolbar) return false;
          if (document.querySelector('#mbb-new-post')) return true;
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
          toolbar.append(button);
          return true;
        };
        if (!install()) {
          let attempts = 0;
          const timer = setInterval(() => {
            if (install() || ++attempts > 300) clearInterval(timer);
          }, 100);
        }
        const observer = new MutationObserver(() => install());
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
      document.body.append(bar);
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
