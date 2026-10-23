(() => {
  'use strict';
  const T = (text) => globalThis.MBBI18n?.t(text) ?? text;
  const protocol = 'mbb-author-navigation/v1';
  const display = (raw) => raw.replace(/\r\n?/g, '\n');
  function rawOffset(raw, offset) {
    let i = 0,
      shown = 0;
    while (i < raw.length && shown < offset) {
      if (raw[i] === '\r' && raw[i + 1] === '\n') i++;
      i++;
      shown++;
    }
    return i;
  }
  const displayOffset = (raw, offset) => display(raw.slice(0, offset)).length;
  function replaceRanges(raw, ranges, replacement) {
    const eol = raw.match(/\r\n|\r|\n/)?.[0] ?? '\n';
    const inserted = display(replacement).replace(/\n/g, eol);
    let result = raw;
    for (const [start, end] of [...ranges].reverse()) {
      result =
        result.slice(0, rawOffset(raw, start)) + inserted + result.slice(rawOffset(raw, end));
    }
    return result;
  }
  function create(options) {
    const { source, frame, readSource, applySource, stamp, canEdit, showSource, showPreview } =
      options;
    const currentFrame = () => (typeof frame === 'function' ? frame() : frame);
    const el = (tag, attrs = {}, text = '') => {
      const node = document.createElement(tag);
      Object.assign(node, attrs);
      node.textContent = text;
      return node;
    };
    const button = (text, action) => {
      const node = el('button', { type: 'button' }, T(text));
      node.addEventListener('click', action);
      return node;
    };
    const status = el('p', { className: 'mbb-source-tools-status', role: 'status' });
    let errorLine = null;
    const tools = el('details', { className: 'mbb-source-tools' });
    tools.append(el('summary', {}, T('Find, replace and navigate')));
    const grid = el('div', { className: 'mbb-source-tools-fields' });
    function field(text, type = 'text') {
      const label = el('label', {}, T(text));
      const input = el('input', { type });
      label.append(input);
      grid.append(label);
      return input;
    }
    const query = field('Find text'),
      replacement = field('Replace with'),
      caseSensitive = field('Match case', 'checkbox');
    query.maxLength = replacement.maxLength = 262144;
    const line = field('Go to line', 'number');
    line.min = '1';
    line.step = '1';
    const actions = el('div', { className: 'mbb-source-tools-actions' });
    let currentMatch = null,
      history = [],
      cursor = -1,
      before = null,
      composing = false;
    let navigation = null,
      sequence = 0,
      session = '',
      activeStamp = '',
      ready = false;
    let selecting = false,
      syncing = false,
      quietUntil = 0,
      scrollTimer = null;
    const snapshot = () => ({
      raw: readSource(),
      start: source.selectionStart,
      end: source.selectionEnd,
    });
    function remember(value) {
      if (cursor >= 0 && history[cursor].raw === value.raw) {
        history[cursor] = value;
        return;
      }
      history = history.slice(0, cursor + 1);
      history.push(value);
      cursor = history.length - 1;
      let bytes = history.reduce((sum, item) => sum + item.raw.length * 2, 0);
      while (history.length > 80 || (bytes > 8 * 1024 * 1024 && history.length > 1)) {
        bytes -= history.shift().raw.length * 2;
        cursor--;
      }
    }
    function commit(raw, start, end = start) {
      if (!canEdit()) return;
      remember(snapshot());
      applySource(raw);
      source.setSelectionRange(start, end);
      source.focus();
      remember(snapshot());
      currentMatch = null;
    }
    function reset() {
      history = [snapshot()];
      cursor = 0;
      before = null;
      currentMatch = null;
      invalidate();
    }
    source.addEventListener('beforeinput', () => {
      if (!composing) before = snapshot();
    });
    source.addEventListener('compositionstart', () => {
      before = snapshot();
      composing = true;
    });
    const afterInput = () => {
      if (before) remember(before);
      remember(snapshot());
      before = null;
    };
    source.addEventListener('input', () => {
      currentMatch = null;
      if (!composing) afterInput();
    });
    source.addEventListener('compositionend', () => {
      composing = false;
      afterInput();
    });
    function undo(direction) {
      if (!canEdit() || composing) return;
      const next = cursor + direction;
      if (next < 0 || next >= history.length) return;
      cursor = next;
      const item = history[cursor];
      applySource(item.raw);
      source.setSelectionRange(item.start, item.end);
      source.focus();
    }
    source.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || composing) return;
      if (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y') {
        const direction = event.shiftKey || event.key.toLowerCase() === 'y' ? 1 : -1;
        if (canEdit()) {
          event.preventDefault();
          undo(direction);
        }
      }
    });
    function matches() {
      if (!query.value) return [];
      const haystack = caseSensitive.checked ? source.value : source.value.toLowerCase();
      const needle = caseSensitive.checked ? query.value : query.value.toLowerCase();
      const list = [];
      for (
        let from = 0, at;
        list.length <= 10000 && (at = haystack.indexOf(needle, from)) !== -1;
      ) {
        // Case folding can change UTF-16 length. Such a match cannot safely rewrite source.
        if (haystack.length !== source.value.length || needle.length !== query.value.length)
          return [];
        list.push([at, at + query.value.length]);
        from = at + Math.max(1, needle.length);
      }
      if (list.length > 10000) {
        status.textContent = T('Narrow the search to at most 10000 matches.');
        return [];
      }
      return list;
    }
    function find(direction) {
      const list = matches();
      if (!list.length) {
        currentMatch = null;
        status.textContent = T('No matching text.');
        return;
      }
      const caret = direction > 0 ? source.selectionEnd : source.selectionStart;
      const next =
        direction > 0
          ? (list.find(([start]) => start >= caret) ?? list[0])
          : ([...list].reverse().find(([, end]) => end <= caret) ?? list[list.length - 1]);
      currentMatch = next;
      showSource();
      source.focus();
      source.setSelectionRange(...next);
      scrollSource(next[0]);
      status.textContent = T('Matches: ') + list.length;
    }
    function replace(all) {
      const list = matches();
      const chosen = all
        ? list
        : list
            .filter(
              ([start, end]) => start === source.selectionStart && end === source.selectionEnd,
            )
            .slice(0, 1);
      if (!chosen.length) {
        find(1);
        return;
      }
      const raw = replaceRanges(readSource(), chosen, replacement.value);
      if (new TextEncoder().encode(raw).length > 262144) {
        status.textContent = T('The replacement exceeds the source size limit.');
        return;
      }
      const start = chosen[0][0];
      commit(raw, start, start + replacement.value.length);
      status.textContent = T('Replaced matches: ') + chosen.length;
    }
    actions.append(
      button('Previous match', () => find(-1)),
      button('Next match', () => find(1)),
      button('Replace selection', () => replace(false)),
      button('Replace all', () => replace(true)),
      button('Go', () => {
        const number = Number(line.value),
          lines = source.value.split('\n');
        if (!Number.isSafeInteger(number) || number < 1 || number > lines.length) {
          status.textContent = T('Choose an existing line.');
          return;
        }
        const offset = lines.slice(0, number - 1).reduce((sum, item) => sum + item.length + 1, 0);
        showSource();
        source.focus();
        source.setSelectionRange(offset, offset);
        scrollSource(offset);
      }),
      button('Undo source change', () => undo(-1)),
      button('Redo source change', () => undo(1)),
    );
    const reveal = button('Locate selection in preview', () => {
      const range = rangeAtCaret();
      if (!range) {
        status.textContent = T(
          'No proven preview range for this selection. Preview the current source again.',
        );
        return;
      }
      showPreview();
      send('reveal', { id: range.id });
      status.textContent =
        range.precision === 'coarse'
          ? T('Located the containing structure.')
          : T('Located the source object.');
    });
    const errorButton = button('Locate error line', () => locateError(errorLine));
    errorButton.hidden = true;
    actions.append(reveal, errorButton);
    tools.append(grid, actions, status);
    const wizard = el('details', { className: 'mbb-source-tools mbb-insert-example' });
    wizard.append(el('summary', {}, T('Insert a teaching structure')));
    const kindLabel = el('label', {}, T('Structure'));
    const kind = el('select');
    for (const [value, title] of [
      ['collapse', T('Collapsible content')],
      ['steps', T('Stage navigation')],
      ['code-tabs', T('Multilingual code tabs')],
      ['diagram', T('Node diagram')],
    ])
      kind.append(el('option', { value }, title));
    kindLabel.append(kind);
    const headingLabel = el('label', {}, T('Title'));
    const heading = el('input', { type: 'text', maxLength: 200 });
    headingLabel.append(heading);
    let exampleGeneration = 0;
    for (const input of [kind, heading]) {
      input.addEventListener('input', () => {
        exampleGeneration++;
      });
      input.addEventListener('change', () => {
        exampleGeneration++;
      });
    }
    wizard.append(
      kindLabel,
      headingLabel,
      el(
        'p',
        {},
        T('Creates an unsaved structure. Preview before saving; reader state is not stored.'),
      ),
      button('Insert example at selection', async () => {
        if (!canEdit()) return;
        const generation = ++exampleGeneration;
        const openingForm = JSON.stringify([kind.value, heading.value]);
        const openingScope = window.MarkBridgeComponentCatalog?.scope();
        const raw = readSource(),
          start = rawOffset(raw, source.selectionStart),
          end = rawOffset(raw, source.selectionEnd);
        const id =
          'example-' +
          [...crypto.getRandomValues(new Uint8Array(6))]
            .map((n) => n.toString(16).padStart(2, '0'))
            .join('');
        const title = heading.value.trim() || T('Teaching example');
        const body = raw.slice(start, end) || T('Write the explanation and static fallback here.');
        const open = (name, attrs) => ':::mbb:v1 ' + name + ' ' + JSON.stringify(attrs) + '\n\n';
        const close = '\n\n:::mbb:end';
        let example;
        if (kind.value === 'collapse')
          example = open('collapse', { id, title, open: false }) + body + close;
        else if (kind.value === 'steps')
          example =
            open('steps', { id, title, mode: 'staged', previous: true, next: true, full: true }) +
            open('step', { id: id + '-question', title: T('Question') }) +
            body +
            close +
            '\n\n' +
            open('step', { id: id + '-explanation', title: T('Explanation') }) +
            T('Write the explanation and static fallback here.') +
            close +
            close;
        else if (kind.value === 'code-tabs')
          example =
            open('code-tabs', {
              id,
              defaultTab: id + '-python',
              tabs: [
                { id: id + '-python', title, terminalNewline: true },
                { id: id + '-javascript', title: '', terminalNewline: true },
              ],
            }) +
            '```python\ndef total(values):\n    return sum(values)\n```\n\n```javascript\nfunction total(values) {\n  return values.reduce((sum, value) => sum + value, 0);\n}\n```' +
            close;
        else {
          let provider =
            (window.MBBComponents || []).find(
              (p) => p.id === 'node-diagram' && p.version === '0.2.0',
            ) ?? (window.MBBComponents || []).find((p) => p.id === 'node-diagram');
          try {
            if (window.MarkBridgeComponentCatalog)
              provider = await window.MarkBridgeComponentCatalog.resolveDefault(
                'node-diagram',
                '0.2.0',
              );
          } catch (error) {
            status.textContent = error.message;
            return;
          }
          if (
            generation !== exampleGeneration ||
            openingForm !== JSON.stringify([kind.value, heading.value]) ||
            openingScope !== window.MarkBridgeComponentCatalog?.scope() ||
            readSource() !== raw ||
            rawOffset(raw, source.selectionStart) !== start ||
            rawOffset(raw, source.selectionEnd) !== end ||
            !canEdit()
          )
            return;
          if (!provider) {
            status.textContent = T(
              'Enable a compatible diagram extension before inserting a diagram.',
            );
            return;
          }
          example =
            open('component', {
              id,
              component: provider.id,
              componentVersion: provider.version,
              params: provider.defaults,
            }) +
            body +
            close;
        }
        const eol = raw.match(/\r\n|\r|\n/)?.[0] ?? '\n';
        example = '\n\n' + example.replace(/\r\n?/g, '\n') + '\n\n';
        const next = raw.slice(0, start) + example.replace(/\n/g, eol) + raw.slice(end);
        if (new TextEncoder().encode(next).length > 262144) {
          status.textContent = T('The replacement exceeds the source size limit.');
          return;
        }
        const caret = displayOffset(next, start);
        commit(next, caret, caret + example.length);
      }),
    );
    tools.append(wizard);
    if (window.MBBWritingTools && window.MBB?.writingIndex) {
      let writingRaw, writingBlocks;
      const blocks = () => {
        const raw = readSource();
        if (raw !== writingRaw) {
          writingBlocks = window.MBB.toBlocks(raw);
          writingRaw = raw;
        }
        return writingBlocks;
      };
      const writing = window.MBBWritingTools.create({
        context: options.referenceContext,
        source: readSource,
        blocks,
        stamp: readSource,
        selection: () => [source.selectionStart, source.selectionEnd],
        select(item) {
          const tree = blocks();
          let path = item.path;
          const find = (list, parent = []) => {
            for (let n = 0; n < list.length; n++) {
              const p = [...parent, n];
              if (list[n].clientId === item.clientId) path = p;
              find(list[n].innerBlocks || [], p);
            }
          };
          if (!path) find(tree);
          const range = window.MBB.sourceNavigation(readSource(), tree).ranges.find(
            (r) => r.blockPath.join('.') === path?.join('.'),
          );
          if (range) locateError({ line: range.startLine });
        },
        rename(plan) {
          const patches = new Map(plan.patches.map((p) => [p.clientId, p.attributes]));
          const update = (list) =>
            list.map((b) =>
              wp.blocks.cloneBlock(b, patches.get(b.clientId) || {}, update(b.innerBlocks || [])),
            );
          const raw = window.MBB.toMarkdown(update(blocks()), { origin: 'markdown_import' });
          commit(raw, 0);
        },
        insert(text) {
          if (typeof text !== 'string') text = text.source;
          const raw = readSource(),
            start = rawOffset(raw, source.selectionStart),
            end = rawOffset(raw, source.selectionEnd);
          commit(
            raw.slice(0, start) + '\n\n' + text + '\n\n' + raw.slice(end),
            source.selectionStart,
          );
        },
      });
      tools.append(writing);
      source.addEventListener('paste', (event) => {
        if (!canEdit() || !event.clipboardData || event.clipboardData.getData('text/html')) return;
        const text = event.clipboardData.getData('text/plain');
        if (!window.MBB.markdownSnippet(text)) return;
        try {
          window.MBB.importDocument(text, 'paste-preview');
        } catch {
          return;
        }
        event.preventDefault();
        tools.querySelector('.mbb-paste-candidate')?.remove();
        const panel = el('section', { className: 'mbb-paste-candidate' }),
          initial = snapshot();
        panel.append(
          el('h3', {}, T('Markdown paste preview')),
          el('pre', {}, text),
          button('Insert recognized Markdown', () => {
            if (readSource() !== initial.raw) {
              status.textContent = T(
                'Content changed. Paste again to review the current selection.',
              );
              panel.remove();
              return;
            }
            const start = rawOffset(initial.raw, initial.start),
              end = rawOffset(initial.raw, initial.end);
            commit(
              initial.raw.slice(0, start) + text + initial.raw.slice(end),
              initial.start,
              initial.start + display(text).length,
            );
            panel.remove();
          }),
          button('Cancel', () => panel.remove()),
        );
        tools.open = true;
        tools.append(panel);
        panel.querySelector('button').focus();
      });
    }
    const previewTools = el('div', { className: 'mbb-preview-tools' });
    const locate = button('Locate source', () => {
      selecting = !selecting;
      updateOptions();
    });
    locate.setAttribute('aria-pressed', 'false');
    const syncLabel = el('label', {}, T('Sync by content anchors'));
    const sync = el('input', { type: 'checkbox' });
    syncLabel.prepend(sync);
    sync.addEventListener('change', () => {
      syncing = sync.checked;
      updateOptions();
    });
    const previewStatus = el('span', { role: 'status' });
    previewTools.append(locate, syncLabel, previewStatus);
    const valid = () => !!navigation && activeStamp === stamp();
    function send(action, more = {}) {
      if (valid() && ready)
        currentFrame()?.contentWindow?.postMessage(
          { type: protocol, action, session, sourceHash: navigation.sourceSha256, ...more },
          '*',
        );
    }
    function updateOptions() {
      locate.setAttribute('aria-pressed', String(selecting));
      if (valid() && ready)
        previewStatus.textContent = selecting
          ? T('Select a preview object, or use Tab and Enter, to locate its source.')
          : navigation.unmapped?.length
            ? T('Some structures have only partial position hints.')
            : '';
      send('options', { selecting, syncing });
    }
    function invalidate() {
      sequence++;
      navigation = null;
      session = '';
      ready = false;
      selecting = false;
      locate.setAttribute('aria-pressed', 'false');
      locate.disabled = true;
      sync.disabled = true;
      reveal.disabled = true;
      previewStatus.textContent = T('Preview the current source to enable navigation.');
      errorLine = null;
      errorButton.hidden = true;
    }
    function controls(busy) {
      locate.disabled = sync.disabled = reveal.disabled = busy || !valid() || !ready;
    }
    function locateError(location) {
      if (!location || !Number.isSafeInteger(location.line) || location.line < 1) return;
      const lines = source.value.split('\n');
      if (location.line > lines.length) return;
      const start = lines
        .slice(0, location.line - 1)
        .reduce((sum, item) => sum + item.length + 1, 0);
      showSource();
      source.focus();
      source.setSelectionRange(start, start + lines[location.line - 1].length);
      scrollSource(start);
    }
    function error(location) {
      const match = typeof location === 'string' ? /^line:(\d+)(?::\d+)?$/.exec(location) : null;
      const line = match ? Number(match[1]) : location?.line;
      if (!Number.isSafeInteger(line) || line < 1 || line > source.value.split('\n').length) return;
      errorLine = { line };
      errorButton.hidden = false;
      tools.open = true;
    }
    function scrollSource(offset) {
      const beforeCaret = source.value.slice(0, offset);
      const row = beforeCaret.split('\n').length - 1;
      const height = parseFloat(getComputedStyle(source).lineHeight) || 24;
      source.scrollTop = Math.max(0, row * height - height * 2);
    }
    function rangeAtCaret() {
      if (!valid()) return null;
      const raw = readSource(),
        start = rawOffset(raw, source.selectionStart),
        end = rawOffset(raw, source.selectionEnd);
      return navigation.ranges
        .filter((range) => range.start <= start && range.end >= end)
        .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
    }
    const receive = (event) => {
      const m = event.data;
      if (
        event.source !== currentFrame()?.contentWindow ||
        event.origin !== 'null' ||
        !valid() ||
        !m ||
        Object.getPrototypeOf(m) !== Object.prototype ||
        m.type !== protocol ||
        m.session !== session ||
        m.sourceHash !== navigation.sourceSha256 ||
        Object.keys(m).some(
          (key) => !['type', 'action', 'session', 'sourceHash', 'id'].includes(key),
        )
      )
        return;
      if (m.action === 'ready' && !('id' in m)) {
        ready = true;
        locate.disabled = sync.disabled = reveal.disabled = false;
        previewStatus.textContent = navigation.unmapped?.length
          ? T('Some structures have only partial position hints.')
          : '';
        updateOptions();
        return;
      }
      if (!ready || !['select', 'viewport'].includes(m.action) || typeof m.id !== 'string') return;
      const range = navigation.ranges.find((item) => item.id === m.id);
      if (!range || (m.action === 'select' && !selecting) || (m.action === 'viewport' && !syncing))
        return;
      const start = displayOffset(readSource(), range.start),
        end = displayOffset(readSource(), range.end);
      quietUntil = performance.now() + 350;
      if (m.action === 'select') {
        showSource();
        source.focus();
        source.setSelectionRange(start, end);
      }
      scrollSource(start);
      if (m.action === 'select')
        status.textContent =
          range.precision === 'coarse'
            ? T('Selected the containing structure.')
            : T('Selected the source object.');
    };
    addEventListener('message', receive);
    source.addEventListener(
      'scroll',
      () => {
        if (!syncing || !valid() || performance.now() < quietUntil) return;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          if (!valid()) return;
          const height = parseFloat(getComputedStyle(source).lineHeight) || 24;
          const targetLine = Math.floor(source.scrollTop / height) + 1;
          const range =
            [...navigation.ranges].reverse().find((item) => item.startLine <= targetLine) ??
            navigation.ranges[0];
          if (range) send('reveal', { id: range.id });
        }, 120);
      },
      { passive: true },
    );
    async function prepare(input, raw, bridge) {
      invalidate();
      const ticket = sequence,
        savedStamp = stamp();
      if (
        !input ||
        input.schema !== 1 ||
        input.offsetUnit !== 'utf16' ||
        !Array.isArray(input.ranges) ||
        input.ranges.length > 2048 ||
        !bridge?.script ||
        !/^[A-Za-z0-9+/]{43}=$/.test(bridge.sha256 ?? '')
      )
        return null;
      const hex = (buffer) =>
        [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
      const [sourceHash, bridgeHash] = await Promise.all([
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)),
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(bridge.script)),
      ]);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(bridgeHash)));
      if (
        sequence !== ticket ||
        stamp() !== savedStamp ||
        hex(sourceHash) !== input.sourceSha256 ||
        base64 !== bridge.sha256
      )
        return null;
      const ids = new Set();
      for (const range of input.ranges) {
        if (
          !/^r\d{1,5}$/.test(range.id ?? '') ||
          ids.has(range.id) ||
          !Number.isSafeInteger(range.start) ||
          !Number.isSafeInteger(range.end) ||
          range.start < 0 ||
          range.end <= range.start ||
          range.end > raw.length ||
          !Number.isSafeInteger(range.startLine) ||
          !Number.isSafeInteger(range.endLine) ||
          range.startLine < 1 ||
          range.endLine < range.startLine ||
          !['exact', 'coarse'].includes(range.precision)
        )
          return null;
        ids.add(range.id);
      }
      navigation = structuredClone(input);
      activeStamp = savedStamp;
      session = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
      return {
        session,
        sourceHash: input.sourceSha256,
        parentOrigin: location.origin,
        script: bridge.script,
        sha256: bridge.sha256,
      };
    }
    reset();
    return {
      tools,
      previewTools,
      reset,
      invalidate,
      prepare,
      controls,
      error,
      locateError,
      replaceRanges,
      rawOffset,
      displayOffset,
    };
  }
  function frameDocument(fragment, styles, navigation) {
    // Rendered content is still untrusted. The only allowed script is the fixed author bridge.
    for (const node of fragment.querySelectorAll('script,iframe,object,embed,base,link,meta,form'))
      node.remove();
    for (const node of fragment.querySelectorAll('*')) {
      for (const attr of [...node.attributes]) {
        if (
          /^on/i.test(attr.name) ||
          (attr.name.startsWith('data-mbb-preview-') && attr.name !== 'data-mbb-preview-range')
        )
          node.removeAttribute(attr.name);
      }
    }
    for (const link of fragment.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href');
      if (href.startsWith('#')) link.setAttribute('href', 'about:srcdoc' + href);
      else if (!href.startsWith('about:srcdoc#')) link.removeAttribute('href');
    }
    const container = document.createElement('div');
    container.append(fragment.cloneNode(true));
    const escape = (value) =>
      value.replace(
        /[&"<>]/g,
        (char) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[char],
      );
    const root = navigation
      ? ` data-mbb-preview-session="${escape(navigation.session)}" data-mbb-preview-source="${escape(navigation.sourceHash)}" data-mbb-preview-parent="${escape(navigation.parentOrigin)}"`
      : '';
    const csp = `default-src 'none'; script-src ${navigation ? "'sha256-" + navigation.sha256 + "'" : "'none'"}; style-src 'unsafe-inline'; img-src https: http: data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'`;
    const bridge = navigation ? '<script>' + navigation.script + '</script>' : '';
    return (
      '<!doctype html><html' +
      root +
      '><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
      escape(csp) +
      '"><meta name="referrer" content="no-referrer"><style>' +
      styles +
      'body{font:16px/1.7 system-ui;padding:16px;overflow-wrap:anywhere}pre{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}img{max-width:100%}[data-mbb-preview-locate] [data-mbb-preview-range]:hover,[data-mbb-preview-highlight]{outline:2px solid #2271b1;outline-offset:3px}[data-mbb-preview-locate] [data-mbb-preview-range]{cursor:crosshair;scroll-margin-top:12px}</style></head><body data-mbb-content-view>' +
      container.innerHTML +
      bridge +
      '</body></html>'
    );
  }
  globalThis.MBBSourceTools = { create, rawOffset, displayOffset, replaceRanges, frameDocument };
})();
