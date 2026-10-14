(() => {
  const N = (single, plural, count) =>
    globalThis.MBBI18n?.n(single, plural, count) ?? (count === 1 ? single : plural);
  const E = (error) => globalThis.MBBI18n?.error(error) ?? error.message;
  const T = (message) => globalThis.MBBI18n?.t(message) ?? message;
  const F = (message, ...values) => {
    let next = 0;
    return String(message).replace(/%%|%(?:(\d+)\$)?([sd])/g, (token, index, kind) => {
      if (token === '%%') return '%';
      const value = values[index ? Number(index) - 1 : next++];
      return kind === 'd' ? String(Number(value)) : String(value ?? '');
    });
  };

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
  let editorBody, previewBody, previewToggle, editToggle;
  function showPreview(visible) {
    editorBody.hidden = visible;
    previewBody.hidden = !visible;
    previewToggle.setAttribute('aria-pressed', String(visible));
    editToggle?.setAttribute('aria-pressed', String(!visible));
    if (visible && editorBody.contains(document.activeElement)) previewToggle.focus();
  }
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
      ? T(
          "The source contains CR/CRLF. Uploading, switching views, and unedited previews preserve its original bytes. Editing this source box applies the browser's newline normalization to the document, including code.",
        )
      : T(
          "The source box was edited. Subsequent operations use the browser's textarea newlines. Check code in the difference preview.",
        );
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
      throw Error(
        T('Parameters have not been applied. Apply or discard the parameter input before saving.'),
      );
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
        `${json.message || T('Request failed')}（${json.code || 'HTTP'} / ${response.status}）`,
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
    return E(error) + (label ? `（${label}）` : '');
  }
  function message(text, error = false) {
    status.textContent = text;
    status.className = error ? 'mbb-error' : 'mbb-status';
  }
  function controls() {
    sourceEOLNotice();
    dialog.querySelectorAll('button,input,textarea,select').forEach((b) => (b.disabled = busy));
    previewToggle.disabled = busy || !candidate;
    editToggle.disabled = false;
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
      showPreview(false);
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
    dialog.querySelector('[data-mbb-close]').disabled = false;
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
              ? (window.wp?.data
                  ?.select?.('core/editor')
                  ?.getEditedPostAttribute?.('featured_media') ??
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
      frontmatterPanel.open = true;
      frontmatterRows.replaceChildren(el('p', { role: 'alert' }, E(error)));
      frontmatterSelected.clear();
      frontmatterAuthority = null;
      return;
    }
    if ((parsed?.raw || '') !== frontmatterRaw) {
      frontmatterRaw = parsed?.raw || '';
      frontmatterAuthority = null;
    }
    if (authority) frontmatterAuthority = authority;
    if (parsed?.raw) frontmatterPanel.open = true;
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
        reason: T('Permissions and resolved values will be checked again in the server preview.'),
      }));
    frontmatterRows.replaceChildren();
    if (!fields.length)
      frontmatterRows.append(
        el(
          'p',
          {},
          T(
            'No versioned metadata proposal exists. An unversioned header remains ordinary body content.',
          ),
        ),
      );
    const labels = {
      title: T('Title'),
      excerpt: T('Excerpt'),
      slug: 'slug',
      status: T('Status'),
      categories: T('Category slugs'),
      tags: T('Tag slugs'),
      featured_media: T('Featured image'),
    };
    for (const original of fields) {
      const row =
        recoveryRecord?.kind === 'blocks' && recoveryRecord.context.postId > 0
          ? {
              ...original,
              available: false,
              reason: T(
                'Local block restoration only restores a candidate. The header proposal is preserved. Use a separate bridge preview and confirmation to apply metadata.',
              ),
            }
          : original;
      const line = el('div', { 'data-frontmatter-field': row.field, class: 'mbb-frontmatter-row' });
      const label = el('label', {}, T(' Apply ') + labels[row.field]);
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
        el('div', { 'data-role': 'before' }, T('Current: ') + JSON.stringify(row.before)),
        el('div', { 'data-role': 'proposal' }, T('Proposal: ') + JSON.stringify(row.proposal)),
      );
      if (row.resolved !== null)
        line.append(
          el(
            'div',
            { 'data-role': 'resolved' },
            T('Applied value: ') + JSON.stringify(row.resolved),
          ),
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
          throw Error(
            T(
              'The current article changed. Resolve the version conflict first. The header was not changed.',
            ),
          );
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
      message(
        T(
          'Current metadata was written to the header candidate but has not been saved. Preview again. Source-managed articles still require the source write workflow.',
        ),
      );
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
      target.append(el('p', {}, T('No body changes.')));
      return;
    }
    const ranges = [];
    for (const index of changed) {
      const last = ranges.at(-1);
      if (last && index - last.last <= 7) last.last = index;
      else ranges.push({ first: index, last: index });
    }
    target.append(
      el(
        'p',
        {},
        F(
          N(
            '%1$s difference: green additions, red deletions, and gray unchanged context.',
            '%1$s differences: green additions, red deletions, and gray unchanged context.',
            ranges.length,
          ),
          ranges.length,
        ),
      ),
    );
    let shownHunks = 0;
    const moreHunks = el(
      'button',
      { type: 'button', class: 'mbb-diff-more-hunks' },
      T('Show more differences'),
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
          'aria-label': F(T('Difference %1$s'), shownHunks + 1),
        });
        hunk.append(
          el('h4', {}, `@@ -${part[0].oldAt},${oldCount} +${part[0].newAt},${newCount} @@`),
        );
        const list = el('div', { class: 'mbb-diff-lines', role: 'list' });
        hunk.append(list);
        let shown = 0;
        const more = el('button', { type: 'button', class: 'mbb-diff-more' }, T('Show more lines'));
        const render = () => {
          const rowLimit = Math.min(part.length, shown + 200),
            fragment = document.createDocumentFragment();
          for (; shown < rowLimit; shown++) {
            const row = part[shown];
            const line = el('div', { class: `mbb-diff-row mbb-${row.kind}`, role: 'listitem' });
            line.append(
              el(
                'span',
                { class: 'mbb-diff-number', 'aria-label': T('Old line number') },
                row.oldNo ?? '',
              ),
              el(
                'span',
                { class: 'mbb-diff-number', 'aria-label': T('New line number') },
                row.newNo ?? '',
              ),
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
      openingReason = T(
        'Restored candidates and new articles have no trusted opening baseline for this session. Compare manually.',
      );
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
        throw Error(T('The server did not return a complete trusted opening baseline'));
      if (preserveDisplay && !openingMatchesDisplay(value, held, readSource()))
        throw Error(
          T(
            'The displayed source, metadata, or source fingerprint does not match the signed baseline',
          ),
        );
      opening = value;
      if (preserveDisplay) return;
      base.document = value.document;
      base.title = value.title;
      base.post_status = value.post_status;
      base.featured_media = value.featured_media;
    } catch (error) {
      if (!active(session) || version !== serial || base !== held) return;
      openingReason =
        E(error) +
        T(
          '; automatic three-way merge is unavailable. Download the candidate and compare manually.',
        );
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
        {
          title: T('Title'),
          post_status: T('Save status'),
          featured_media: T('Featured image ID'),
        }[row.key],
      );
      label.append(
        el('p', {}, F(T('My candidate: %1$s; latest server version: %2$s'), row.mine, row.latest)),
      );
      const select = el('select', {
        'data-field': row.key,
        'aria-label': F(
          T('Merge %1$s'),
          { title: T('Title'), post_status: T('Status'), featured_media: T('Featured image') }[
            row.key
          ],
        ),
      });
      select.append(
        el('option', { value: '' }, T('Choose an option')),
        el('option', { value: 'mine' }, T('Use my candidate')),
        el('option', { value: 'latest' }, T('Use the latest server version')),
      );
      if (baseMeta) select.append(el('option', { value: 'base' }, T('Use the opening version')));
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
    mergeStatus.textContent = T('Re-verifying the opening baseline and latest server version…');
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
        throw Error(T('The latest server signature is incomplete'));
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
            F(
              T('Body conflict %1$s (opening line %2$s%3$s)'),
              hunk.id,
              hunk.line,
              hunk.ambiguous ? T('; repeated structure cannot be located reliably') : '',
            ),
          ),
        );
        for (const [key, name] of [
          ['base', T('Opening version')],
          ['mine', T('My candidate')],
          ['latest', T('Latest server version')],
        ])
          row.append(el('pre', {}, name + '\n' + hunk[key]));
        const select = el('select', {
          'data-hunk': hunk.id,
          'aria-label': T('Body conflict ') + hunk.id,
        });
        select.append(
          el('option', { value: '' }, T('Choose this conflict')),
          el('option', { value: 'mine' }, T('Use my candidate')),
          el('option', { value: 'latest' }, T('Use the latest server version')),
          el('option', { value: 'base' }, T('Use the opening version')),
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
        ? T(
            'Choose every body and metadata conflict. Adoption only creates an unsaved candidate; preview and save again.',
          )
        : T(
            'Independent body changes were combined. Unchanged metadata uses the latest server version; overlapping metadata requires an explicit choice.',
          );
    } catch (error) {
      if (active(session) && version === serial && conflict === current) {
        current.merge = null;
        mergeStatus.textContent =
          E(error) + T('. The current candidate is preserved. Download it or compare manually.');
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
        throw Error(T('The server did not return a valid unsaved merge candidate'));
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
      openingReason = T('Acquire a new opening baseline after adopting the merged candidate.');
      invalidate();
      const adoptionVersion = version;
      await acquireOpening(session, adoptionVersion);
      if (!active(session) || version !== adoptionVersion) return;
      message(
        T(
          'The merged candidate has not been saved. Verify its title, status, featured image, and FrontMatter proposal, then preview all differences again.',
        ) +
          (headerChanged
            ? T(
                'The header proposal changed. Previous metadata selections were reset; choose them again.',
              )
            : T(
                'Original header selections are preserved. Preview again to obtain a new receipt.',
              )),
      );
    } catch (error) {
      if (active(session) && version === serial && conflict === current) {
        current.merge = null;
        mergeStatus.textContent =
          E(error) +
          T('; the original candidate remains downloadable. Verify the latest version again.');
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
    conflictSummary.textContent = T('Reading the latest server version…');
    try {
      const latest = await api(`document?post_id=${current.payload.post_id}`);
      if (!active(serial) || conflict !== current) return;
      let latestSource = latest.document.source;
      if (latest.source_managed) {
        const fresh = await api(`source?post_id=${current.payload.post_id}`);
        if (!active(serial) || conflict !== current) return;
        if (fresh.expected !== latest.expected)
          throw Error(
            T('The article changed again while reading. Read the latest server version again'),
          );
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
        F(T('Server title: %1$s; status: %2$s.'), latest.title, latest.post_status) +
        F(
          T('Your title: %1$s; status: %2$s.'),
          current.payload.title,
          current.payload.post_status,
        ) +
        T(
          'The current candidate is temporarily locked for an accurate comparison. Choose differing title, status, and featured image values explicitly before continuing manually, then preview again.',
        ) +
        (opening ? '' : openingReason);
      if (typeof current.markdown === 'string')
        showDiff(latestSource, current.markdown, conflictDiff);
      else
        conflictDiff.replaceChildren(
          el(
            'p',
            {},
            T(
              'The block candidate has no successfully generated Markdown. Current blocks are preserved. Check the title and status first.',
            ),
          ),
        );
      conflictDiff.prepend(metadataPanel);
    } catch (error) {
      if (!active(serial) || conflict !== current) return;
      current.latest = null;
      conflictDiff.replaceChildren();
      conflictSummary.textContent = F(
        T(
          'The latest server version could not be read: %1$s. The candidate remains in the editor. Try reading again.',
        ),
        E(error),
      );
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
    conflictSummary.textContent = F(
      T('%1$s. Reading the latest version for comparison.'),
      E(error),
    );
    message(
      T(
        'A version conflict was detected. Saving is disabled. Compare the server version and current candidate below.',
      ),
      true,
    );
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
    openingReason = T(
      'The manually adopted baseline has not been signed again. Future conflicts can still be compared manually.',
    );
    if (recoveryRecord) recoveryRebased = true;
    conflict.latest = null;
    conflict = null;
    resetMerge();
    conflictPanel.hidden = true;
    invalidate();
    message(
      T(
        'Your changes are preserved against the latest server baseline. Preview all differences and explicitly save again.',
      ),
    );
    controls();
  }
  async function review() {
    if (busy || (conflict && !conflict.adopted)) return;
    busy = true;
    candidate = null;
    candidateSource = null;
    controls();
    message(T('The server is validating and generating a preview…'));
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
        message(T('The content changed. Preview the differences again.'));
        return;
      }
      renderFrontmatter(result.frontmatter);
      payload.adapter_digest = result.adapter_digest;
      payload.frontmatter_receipt = result.frontmatter_receipt;
      payload.resource_receipt = result.resource_receipt;
      const rendered = await MBB_MATH.preview(result.html);
      if (!active(session)) return;
      if (version !== serial) {
        message(T('The content changed. Preview the differences again.'));
        return;
      }
      save.textContent =
        result.post_status === 'publish'
          ? T('Confirm public publication')
          : result.post_status === 'private'
            ? T('Confirm private publication')
            : result.post_status === 'pending'
              ? T('Confirm submission for review')
              : T('Confirm draft save');
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
        (MBB_EDITOR.codeDisplayStyle || '') +
        'body{font:16px/1.7 system-ui;padding:16px;overflow-wrap:anywhere}pre{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}img{max-width:100%}</style></head><body>' +
        previewContent.innerHTML +
        '</body></html>';
      candidate = payload;
      candidateSource = result.document.source;
      showPreview(true);
      conflict = null;
      conflictPanel.hidden = true;
      message(
        T('Validation passed; target status: ') +
          ({
            draft: T('Draft'),
            pending: T('Pending review'),
            publish: T('Published publicly'),
            private: T('Published privately'),
          }[result.post_status] || publication.selectedOptions[0].textContent) +
          T('. Check the differences and preview before confirming.'),
      );
      if (recoveryRecord?.kind === 'blocks')
        message(
          recoveryRecord.context.postId === 0
            ? T(
                'The new block candidate was verified. Check its title, document ID, and differences, then explicitly create a managed draft with paired Markdown and blocks.',
              )
            : base?.source_managed
              ? T(
                  'The local block candidate is for preview only. Source-managed articles still require the source workflow; save restrictions remain in effect.',
                )
              : T(
                  'The local block candidate was verified. Confirmation only restores it to the current editor and does not save it to the site.',
                ),
        );
    } catch (e) {
      if (!active(session)) return;
      if (version !== serial) {
        message(
          T(
            'The earlier candidate preview did not complete. New input is preserved. Preview the differences again.',
          ),
        );
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
    message(T('Saving both representations…'));
    try {
      if (recoveryRecord)
        await recoveryVerify({ expected: payload.expected, sourceDigest: payload.source_sha256 });
      const result = await api(base?.source_managed ? 'source-save' : 'save', payload);
      if (!active(session)) return;
      savedResult = result;
      message(
        result.noop
          ? T('The content is unchanged; no duplicate write is needed.')
          : base?.source_managed
            ? T('The source file was safely written, and Markdown and blocks were saved together.')
            : T('Markdown and blocks were saved together.'),
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
          T(
            'The confirmed candidate was saved. Input entered while saving is preserved and unsaved. Re-upload the ZIP if images still refer to its original paths.',
          ),
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
          T(
            'The confirmed candidate was saved, but subsequent local recovery cleanup did not complete. Current input is preserved. Preview again or download it.',
          ),
          true,
        );
        return;
      }
      if (version !== savedVersion) {
        message(
          T(
            'The earlier candidate was not confirmed as saved. New input is preserved. Preview the differences again.',
          ),
          true,
        );
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
    dialog = el('dialog', { id: 'mbb-dialog', 'aria-label': T('Markdown and block editing') });
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
    header.append(el('h2', {}, T('Markdown and block editing')));
    const close = el(
      'button',
      { type: 'button', 'aria-label': T('Close editing bridge'), 'data-mbb-close': '' },
      T('Close'),
    );
    close.onclick = () => dialog.close();
    header.append(close);
    dialog.append(header);
    const meta = el('div', { class: 'mbb-fields' });
    for (const [label, id] of [
      [T('Title'), 'mbb-title'],
      [T('Stable document ID'), 'mbb-document-id'],
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
    const stateLabel = el('label', {}, T('Save as '));
    publication = el('select', { id: 'mbb-publication' });
    for (const [value, label] of [
      ['draft', T('Draft')],
      ['pending', T('Pending review')],
      ...(cfg.canPublish
        ? [
            ['publish', T('Published publicly')],
            ['private', T('Published privately')],
          ]
        : []),
    ])
      publication.append(el('option', { value }, label));
    publication.onchange = invalidate;
    stateLabel.append(publication);
    dialog.append(stateLabel);
    const upload = el('label', {}, T('Upload Markdown or an image resource ZIP '));
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
          message(
            T(
              'This entry cannot import new ZIP media. Body and source save rules remain in effect.',
            ),
            true,
          );
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
        message(T('The file is too large.'), true);
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
          message(
            T(
              'New input entered while uploading is preserved. The late file did not overwrite the candidate.',
            ),
          );
          return;
        }
        setSource(value);
        resources?.reset(true, true);
        source.hidden = false;
        mode = 'upload';
        invalidate();
        message(T('The file was read but has not been saved. Preview the differences first.'));
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
    const resourcePanel = el('section', {
      id: 'mbb-resources',
      'aria-label': T('Image resource import'),
    });
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
      'aria-label': T('Markdown source'),
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
    frontmatterPanel = el('details', {
      id: 'mbb-frontmatter',
      'aria-label': T('FrontMatter metadata proposal'),
    });
    frontmatterPanel.append(
      el('summary', {}, T('FrontMatter metadata proposal')),
      el(
        'p',
        {},
        T(
          'No fields are applied by default. Select fields and preview again. Clearing a selection changes neither current article settings nor the header.',
        ),
      ),
    );
    frontmatterRows = el('div', { id: 'mbb-frontmatter-fields' });
    frontmatterWrite = el(
      'button',
      { type: 'button', id: 'mbb-frontmatter-from-current' },
      T('Write current metadata into the header'),
    );
    frontmatterWrite.onclick = writeCurrentMetadata;
    frontmatterPanel.append(frontmatterRows, frontmatterWrite);
    dialog.append(frontmatterPanel);
    const actions = el('div', { class: 'mbb-actions' });
    reviewButton = el(
      'button',
      { type: 'button', id: 'mbb-review' },
      T('View differences and preview'),
    );
    reviewButton.onclick = review;
    save = el('button', { type: 'button', id: 'mbb-save' }, T('Confirm paired save'));
    save.onclick = persist;
    recoveryApply = el(
      'button',
      { type: 'button', id: 'mbb-recovery-apply' },
      T('Restore to current blocks (without saving)'),
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
          message(
            T(
              'New input entered during restoration checks is preserved. Preview again before restoring blocks.',
            ),
          );
          return;
        }
        if (recoveryRebased && Number(base.post_id) === Number(cfg.postId)) {
          // Only explicit conflict adoption + a verified preview authorizes this baseline update.
          cfg.state = structuredClone(base);
        }
        const parsed = wp.blocks.parse(record.payload.content);
        if (!parsed.length && record.payload.content.trim())
          throw Error(T('The candidate could not be restored as blocks.'));
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
    diff = el('section', { 'aria-label': T('Changes') });
    preview = el('iframe', { title: T('Built-in content preview'), sandbox: '' });
    conflictPanel = el('section', {
      id: 'mbb-conflict',
      'aria-labelledby': 'mbb-conflict-heading',
    });
    conflictPanel.hidden = true;
    conflictPanel.append(
      el(
        'h3',
        { id: 'mbb-conflict-heading' },
        T('Version conflict: compare the server and candidate'),
      ),
    );
    conflictSummary = el('p', { role: 'status' });
    conflictDiff = el('section', {
      'aria-label': T('Differences between the latest server version and candidate'),
    });
    const conflictActions = el('div', { class: 'mbb-actions' });
    const refresh = el(
      'button',
      { type: 'button', id: 'mbb-conflict-refresh' },
      T('Read the latest server version again'),
    );
    refresh.onclick = refreshConflict;
    conflictDownload = el(
      'button',
      { type: 'button', id: 'mbb-conflict-download' },
      T('Download current candidate .md'),
    );
    conflictDownload.onclick = downloadCandidate;
    conflictAdopt = el(
      'button',
      { type: 'button', id: 'mbb-conflict-adopt' },
      T('Keep my changes and continue from the latest version'),
    );
    conflictAdopt.onclick = adoptConflict;
    conflictActions.append(refresh, conflictDownload, conflictAdopt);
    mergeOpen = el(
      'button',
      { type: 'button', id: 'mbb-merge-open' },
      T('Prepare three-way merge'),
    );
    mergeOpen.onclick = prepareMerge;
    conflictActions.append(mergeOpen);
    mergePanel = el('section', {
      id: 'mbb-merge-panel',
      'aria-label': T('Three-way merge candidate'),
    });
    mergePanel.hidden = true;
    mergePanel.append(
      el(
        'p',
        {},
        T(
          'Only creates an unsaved candidate. Fences, FrontMatter, and complete teaching containers are compared atomically. Ambiguous repeated structures require explicit choices. Newlines and trailing whitespace retain their original bytes.',
        ),
      ),
    );
    const versions = el('div', { class: 'mbb-merge-versions' });
    mergeViews = {};
    for (const [key, name] of [
      ['base', T('Opening version')],
      ['mine', T('My candidate')],
      ['latest', T('Latest server version')],
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
    mergeAdopt = el(
      'button',
      { type: 'button', id: 'mbb-merge-adopt' },
      T('Adopt unsaved merge candidate'),
    );
    mergeAdopt.onclick = adoptMerge;
    mergePanel.append(versions, mergeStatus, mergeRows, mergeAdopt);
    conflictPanel.append(conflictSummary, conflictActions, conflictDiff, mergePanel);
    editorBody = el('div', { id: 'mbb-editor-body', class: 'mbb-dialog-body' });
    // Keep existing IDs and handlers while giving the dialog a single scrolling content region.
    while (header.nextSibling) editorBody.append(header.nextSibling);
    actions.remove();
    editorBody.append(conflictPanel, diff);
    previewBody = el('div', { id: 'mbb-preview-body', class: 'mbb-preview-body' });
    previewBody.hidden = true;
    previewBody.append(preview);
    previewToggle = el(
      'button',
      {
        type: 'button',
        id: 'mbb-preview-toggle',
        'aria-pressed': 'false',
        'aria-controls': 'mbb-preview-body',
      },
      T('Content preview'),
    );
    previewToggle.onclick = () => showPreview(previewBody.hidden);
    editToggle = el(
      'button',
      {
        type: 'button',
        id: 'mbb-edit-toggle',
        'aria-controls': 'mbb-editor-body',
        'aria-pressed': 'true',
      },
      T('Source and differences'),
    );
    editToggle.onclick = () => showPreview(false);
    const views = el('div', { class: 'mbb-dialog-views' });
    views.append(editToggle, previewToggle);
    const footer = el('div', { class: 'mbb-dialog-footer' });
    footer.append(status, actions);
    dialog.append(views, editorBody, previewBody, footer);
    document.body.append(dialog);
  }
  async function open(id, selectedMode = 'markdown') {
    if (!dialog) build();
    if (dialog.open) return;
    const serial = ++epoch;
    showPreview(false);
    frontmatterPanel.open = false;
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
    message(T('Reading the server version…'));
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
              throw Error(
                T(
                  'The current article changed. Resolve the version conflict first. The original baseline is preserved.',
                ),
              );
            const current = await api('document?post_id=' + id);
            if (!stillOpening()) return;
            fresh = await api('source?post_id=' + id);
            if (!stillOpening()) return;
            if (fresh.expected !== current.expected)
              throw Error(T('The article changed again while reading. Reopen the editor'));
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
          openingReason = T(
            'The source read did not complete. Automatic three-way merge is unavailable. Current text is preserved for manual comparison.',
          );
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
            ? T(
                'The bound source file could not be read. The displayed Markdown is the WordPress saved copy and may not be the latest source file. Viewing and previewing only.',
              )
            : base.source_write_available
              ? T(
                  'The bound source file was read. Edit it, preview the differences, and explicitly confirm the source write.',
                )
              : T(
                  'The bound source file was read for viewing and previewing only. Use the synchronization tool to update it.',
                )
          : selectedMode === 'blocks'
            ? T('Current blocks were converted to Markdown for preview and have not been saved.')
            : T('Edit or upload Markdown, then check the differences.'),
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
        throw {
          code: 'mbb_request',
          message: T('This save request could not be verified. Reopen the editor and try again.'),
        };
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
        throw Error(
          T(
            'The editing session or input changed. Local recovery was not applied; current content is preserved.',
          ),
        );
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
      openingReason = T(
        'This local recovery record has no trusted signed opening baseline. Compare manually; it cannot serve as a three-way merge baseline.',
      );
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
          throw Error(
            T(
              'New native blocks cannot round-trip exactly. No candidate was created. Download the original blocks for safekeeping.',
            ),
          );
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
              'aria-label': T('Import Markdown file'),
            },
            T('Import Markdown'),
          );
          button.onclick = () => {
            const editor = wp.data.select('core/editor');
            const title = editor?.getEditedPostAttribute('title') || '';
            const content = editor?.getEditedPostContent() || '';
            if (title.trim() || content.trim()) {
              window.alert(
                T(
                  'This new article already has unsaved content. Save or clear it before importing Markdown.',
                ),
              );
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
        cfg.state?.source_managed ? T('Markdown source / preview') : T('Markdown edit / upload'),
      );
      a.onclick = () => open(cfg.postId);
      const b = el(
        'button',
        { type: 'button', id: 'mbb-block-review' },
        cfg.state?.source_managed ? T('Block preview') : T('View differences'),
      );
      b.onclick = () => open(cfg.postId, 'blocks');
      const h = el('button', { type: 'button', id: 'mbb-history' }, T('Revisions / restore'));
      h.onclick = () => window.MBB_REVISIONS.open(cfg.postId);
      const more = el('details', { id: 'mbb-more' });
      const moreSummary = el('summary', {}, T('More'));
      const moreBody = el('div', { id: 'mbb-more-actions' });
      more.append(moreSummary, moreBody);
      const recovery = el(
        'button',
        { type: 'button', id: 'mbb-recovery-open' },
        T('Browser draft recovery'),
      );
      recovery.onclick = () => {
        const panel = document.getElementById('mbb-local-recovery');
        if (!panel) return;
        more.open = false;
        panel.open = true;
        panel.querySelector('summary')?.focus();
      };
      moreBody.append(h, recovery);
      bar.append(
        a,
        b,
        more,
        el(
          'span',
          { class: 'mbb-save-guidance' },
          cfg.state?.source_managed
            ? T('The body is synchronized from a source file; preview and confirm the source write')
            : nativeSave
              ? T("Use the editor's Save / Update action to save both representations together")
              : T('Use the save button in the preview'),
        ),
      );
      moreBody.append(
        el(
          'p',
          { class: 'mbb-more-save-guidance' },
          bar.querySelector('.mbb-save-guidance').textContent,
        ),
      );
      bar.append(
        el(
          'span',
          { class: 'mbb-mobile-save-guidance' },
          cfg.state?.source_managed
            ? T('Preview, then confirm the source write')
            : nativeSave
              ? T('Save directly; both formats stay in sync')
              : T('Save after checking the preview'),
        ),
      );
      const getCurrentBlocks = () => wp.data.select('core/block-editor')?.getBlocks?.() || [];
      const capabilities = el('details', { class: 'mbb-capabilities' });
      const capabilitySummary = el(
        'summary',
        { 'aria-live': 'polite' },
        T('Conversion support and current content'),
      );
      capabilities.append(capabilitySummary);
      const help = el('div', { class: 'mbb-capabilities-help' });
      help.append(
        el(
          'p',
          {},
          T(
            'Paragraphs, headings, quotes, lists, task lists, tables, images, links, code, TeX formulas, named footnotes, and restricted HTML are supported. Styles, extra attributes, and third-party blocks must still pass round-trip validation.',
          ),
        ),
      );
      const current = el('p', { role: 'status' });
      help.append(current);
      const check = el('button', { type: 'button' }, T('Check current block conversion'));
      check.onclick = () => {
        try {
          const blocks = getCurrentBlocks();
          window.MBB.toMarkdown(blocks, { origin: 'markdown_import' });
          current.textContent = T(
            'Current blocks passed the browser round-trip check. The server will validate them again when saving.',
          );
        } catch (error) {
          current.textContent =
            describeError(error) +
            T(
              ". Check this block's formatting, or download Markdown for safekeeping before correcting and previewing it again.",
            );
        }
      };
      help.append(check);
      capabilities.append(help);
      moreBody.append(capabilities);
      // The export module installs asynchronously; retain its handler when grouping it here.
      const groupSecondaryActions = () => {
        const exportButton = document.getElementById('mbb-export-open');
        if (exportButton && exportButton.parentElement !== moreBody) moreBody.prepend(exportButton);
        recovery.hidden = !document.getElementById('mbb-local-recovery');
      };
      new MutationObserver(groupSecondaryActions).observe(document.body, {
        childList: true,
        subtree: true,
      });
      const placeMore = () => {
        if (!more.open) return;
        const width = Math.min(360, innerWidth - 40);
        const bounds = more.getBoundingClientRect();
        moreBody.style.left =
          Math.max(12, Math.min(bounds.right - width, innerWidth - width - 12)) + 'px';
        moreBody.style.bottom = innerHeight - bar.getBoundingClientRect().top + 8 + 'px';
      };
      more.addEventListener('toggle', placeMore);
      more.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          more.open = false;
          moreSummary.focus();
          event.stopPropagation();
        }
      });
      moreBody.addEventListener(
        'click',
        (event) => {
          if (!event.target.closest('#mbb-history, #mbb-export-open')) return;
          // Dialogs must restore focus to a visible control after the menu closes.
          more.open = false;
          moreSummary.focus();
        },
        true,
      );
      document.addEventListener('pointerdown', (event) => {
        if (more.open && !more.contains(event.target)) more.open = false;
      });
      document.body.append(bar);
      groupSecondaryActions();
      const inspectCapabilities = () => {
        const unsupported = [];
        const supported = new Set(cfg.supportedBlocks || window.MBB?.supportedBlocks || []);
        const visit = (blocks, path = []) =>
          blocks.forEach((block, index) => {
            const at = [...path, index];
            if (!supported.has(block.name)) {
              const title = wp.blocks.getBlockType?.(block.name)?.title || block.name;
              unsupported.push(F(T('%1$s (block %2$s)'), title, at.map((i) => i + 1).join(' → ')));
            }
            visit(block.innerBlocks || [], at);
          });
        visit(getCurrentBlocks());
        capabilitySummary.textContent = unsupported.length
          ? F(T('Conversion support: %1$s unsupported blocks'), unsupported.length)
          : T('Conversion support and current content');
        capabilitySummary.classList.toggle('mbb-capability-warning', unsupported.length > 0);
        current.textContent = unsupported.length
          ? F(
              T(
                'The current content includes unsupported blocks: %1$s%2$s. Preserve the content, adjust it, and preview again.',
              ),
              unsupported.slice(0, 8).join(T(', ')),
              unsupported.length > 8 ? T(' and others') : '',
            )
          : T(
              'Current block types have conversion mappings. Check their conversion to confirm that attributes and formatting are preserved.',
            );
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
        const viewport = window.visualViewport;
        const keyboardInset = viewport
          ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop)
          : 0;
        bar.classList.toggle('mbb-keyboard-open', keyboardInset > 140);
        bar.style.setProperty('--mbb-keyboard-inset', keyboardInset + 'px');
        placeMore();
        const canvas = document.querySelector('.interface-interface-skeleton__content');
        const bounds = canvas?.getBoundingClientRect() || { left: 0, right: innerWidth };
        let left = Math.max(0, bounds.left),
          right = Math.min(innerWidth, bounds.right);
        for (const sidebar of document.querySelectorAll(
          '.interface-interface-skeleton__sidebar, .interface-complementary-area.editor-sidebar',
        )) {
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
      window.visualViewport?.addEventListener('resize', scheduleBar);
      window.visualViewport?.addEventListener('scroll', scheduleBar);
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
