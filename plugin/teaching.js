(() => {
  const T = (message) => globalThis.MBBI18n?.t(message) ?? message;
  const F = (message, ...values) => {
    let next = 0;
    return String(message).replace(/%%|%(?:(\d+)\$)?([sd])/g, (token, index, kind) => {
      if (token === '%%') return '%';
      const value = values[index ? Number(index) - 1 : next++];
      return kind === 'd' ? String(Number(value)) : String(value ?? '');
    });
  };

  const languageLabel = (language) =>
    ({
      __proto__: null,
      javascript: 'JavaScript',
      js: 'JavaScript',
      typescript: 'TypeScript',
      ts: 'TypeScript',
      python: 'Python',
      py: 'Python',
      cpp: 'C++',
      c: 'C',
      csharp: 'C#',
      cs: 'C#',
      java: 'Java',
      ruby: 'Ruby',
      rb: 'Ruby',
      rust: 'Rust',
      go: 'Go',
      php: 'PHP',
      swift: 'Swift',
      kotlin: 'Kotlin',
      sql: 'SQL',
      html: 'HTML',
      css: 'CSS',
      json: 'JSON',
      bash: 'Bash',
      shell: 'Shell',
      text: 'Text',
      plaintext: 'Text',
    })[language.toLowerCase()] ||
    language ||
    T('Code');
  const groups = new Map();
  const stageBars = new Map();
  let stickyFrame = 0;
  // Themes opt their fixed/sticky headers into measurement without a theme-specific selector.
  function measureStageBars() {
    if (!stageBars.size) return;
    let offset = 0;
    const obstructions = [
      ...document.querySelectorAll('#wpadminbar, [data-mbb-teaching-sticky-obstruction]'),
    ]
      .filter((node) => ['fixed', 'sticky'].includes(getComputedStyle(node).position))
      .map((node) => node.getBoundingClientRect())
      .sort((a, b) => a.top - b.top);
    for (const rect of obstructions)
      if (rect.height && rect.bottom > offset && rect.top <= offset + 1) offset = rect.bottom;
    for (const [node, controls] of stageBars) {
      if (!node.isConnected) {
        stageBars.delete(node);
        stageResize?.unobserve(controls);
        continue;
      }
      for (const [name, value] of [
        ['--mbb-teaching-measured-offset', offset + 'px'],
        ['--mbb-teaching-controls-height', controls.getBoundingClientRect().height + 'px'],
      ])
        if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
    }
  }
  function scheduleStageMeasurement() {
    if (stickyFrame) return;
    stickyFrame = requestAnimationFrame(() => {
      stickyFrame = 0;
      measureStageBars();
    });
  }
  const stageResize =
    typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleStageMeasurement) : null;
  window.addEventListener('scroll', scheduleStageMeasurement, { passive: true });
  window.addEventListener('resize', scheduleStageMeasurement);
  const codeGroups = new Map();
  const annotationBudgets = new WeakMap();
  const config = (node) => {
    try {
      return JSON.parse(node.dataset.mbbTeachingConfig || '{}');
    } catch {
      return {};
    }
  };
  const child = (node, selector) => [...node.children].find((n) => n.matches(selector));
  const change = () => document.dispatchEvent(new CustomEvent('mbb:teaching-change'));
  const button = (label, action) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', action);
    return b;
  };
  const copyIcon = (control, label) => {
    control.classList.add('mbb-code-copy');
    control.textContent = '';
    control.setAttribute('aria-label', label);
    control.title = label;
    // CSS draws the icon; the translated accessible label remains available to assistive tools.
    return control;
  };
  const generated = () => {
    const n = document.createElement('div');
    n.dataset.mbbGenerated = '';
    n.className = 'mbb-teaching-controls';
    return n;
  };
  function revealTarget(target) {
    const node =
      typeof target === 'string' ? document.getElementById(target.replace(/^#/, '')) : target;
    if (!(node instanceof Element)) return false;
    for (let p = node; p; p = p.parentElement) {
      if (p.classList.contains('mbb-code-tab'))
        codeGroups.get(p.parentElement)?.select(p, false, false);
      if (p.matches('details:is(.wp-block-details,.mbb-technical-statement)')) p.open = true;
      if (p.dataset.mbbTeaching === 'collapse') {
        const body = child(p, '.mbb-teaching-body');
        if (body) body.hidden = false;
        const toggle = child(p, '.mbb-teaching-controls')?.querySelector('button');
        toggle?.setAttribute('aria-expanded', 'true');
      }
      if (p.dataset.mbbTeaching === 'step') {
        const group = p.parentElement?.closest('[data-mbb-teaching="steps"]');
        groups.get(group)?.select(p, false);
      }
    }
    change();
    return true;
  }
  window.MarkBridgeTeaching = { revealTarget, hasCurrentHistoryView };
  document.addEventListener('mbb:reveal-target', (event) => {
    const target = event.detail?.target;
    const revealed = revealTarget(target);
    if (event.detail) event.detail.revealed = revealed;
  });
  function snapshot() {
    return {
      details: [
        ...document.querySelectorAll('details:is(.wp-block-details,.mbb-technical-statement)[id]'),
      ].map((node) => ({
        id: node.id,
        open: node.open,
      })),
      tabs: [...codeGroups].map(([node, group]) => ({ id: node.id, ...group.state() })),
      groups: [...groups].map(([node, controller]) => ({ id: node.id, ...controller.state() })),
      collapse: [...document.querySelectorAll('[data-mbb-teaching="collapse"]')].map((node) => ({
        id: node.id,
        open: !child(node, '.mbb-teaching-body')?.hidden,
      })),
    };
  }
  function record(replace = false, url = location.href) {
    const state = history.state && typeof history.state === 'object' ? { ...history.state } : {};
    state.mbbTeaching = { ...snapshot(), hash: new URL(url, location.href).hash };
    history[replace ? 'replaceState' : 'pushState'](state, '', url);
  }
  function hasCurrentHistoryView() {
    return history.state?.mbbTeaching?.hash === location.hash;
  }
  function restore(state) {
    const value = state?.mbbTeaching;
    if (!value) return;
    for (const item of value.details || []) {
      const node = document.getElementById(item.id);
      if (node?.matches('details:is(.wp-block-details,.mbb-technical-statement)'))
        node.open = !!item.open;
    }
    for (const item of value.tabs || [])
      codeGroups.get(document.getElementById(item.id))?.restore(item);
    for (const item of value.groups || []) {
      const node = document.getElementById(item.id);
      groups.get(node)?.restore(item);
    }
    for (const item of value.collapse || []) {
      const node = document.getElementById(item.id);
      if (node?.dataset.mbbTeaching !== 'collapse') continue;
      const body = child(node, '.mbb-teaching-body');
      if (body) body.hidden = node.classList.contains('mbb-activity-question') ? false : !item.open;
      child(node, '.mbb-teaching-controls')
        ?.querySelector('button')
        ?.setAttribute('aria-expanded', String(!!item.open));
    }
    change();
  }
  function navigate(node) {
    revealTarget(node);
    measureStageBars();
    if (node.id) record(false, '#' + encodeURIComponent(node.id));
    node.scrollIntoView({ block: 'start' });
    node.setAttribute('tabindex', '-1');
    node.focus({ preventScroll: true });
  }
  function hash() {
    let id;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return;
    }
    if (id?.startsWith('mbb-code/')) {
      const m =
        /^mbb-code\/([A-Za-z][A-Za-z0-9_-]{0,63})\/([A-Za-z][A-Za-z0-9_-]{0,63})\/L([1-9]\d{0,5})(?:-L([1-9]\d{0,5}))?$/.exec(
          id,
        );
      if (m)
        codeGroups
          .get(document.getElementById(m[1]))
          ?.line(m[2], Number(m[3]), Number(m[4] || m[3]));
      return;
    }
    if (id) {
      const node = document.getElementById(id);
      if (node && revealTarget(node)) {
        measureStageBars();
        node.scrollIntoView({ block: 'start' });
      }
    }
  }
  function sourceLines(source) {
    const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [];
    if (lines.at(-1) === '') lines.pop();
    return lines.length ? lines : [''];
  }
  function validLines(tab) {
    if (
      !Number.isInteger(tab.startLine) ||
      tab.startLine < 1 ||
      tab.startLine + sourceLines(tab.code).length - 1 > 999999 ||
      typeof tab.highlights !== 'string' ||
      tab.highlights.length > 512 ||
      !/^(?:[1-9]\d{0,5}(?:-[1-9]\d{0,5})?(?:,[1-9]\d{0,5}(?:-[1-9]\d{0,5})?)*)?$/.test(
        tab.highlights,
      )
    )
      return false;
    const ranges = tab.highlights ? tab.highlights.split(',') : [];
    if (ranges.length > 32) return false;
    let previous = 0;
    for (const range of ranges) {
      const [start, last = start] = range.split('-').map(Number);
      if (
        start < tab.startLine ||
        last < start ||
        start <= previous ||
        last >= tab.startLine + sourceLines(tab.code).length
      )
        return false;
      previous = last;
    }
    return true;
  }
  function codeTabs(node, options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) return false;
    const version = options.version === undefined ? 1 : options.version;
    if (
      ![1, 2].includes(version) ||
      Object.keys(options).some(
        (k) => !['defaultTab', 'tabs', ...(version === 2 ? ['version'] : [])].includes(k),
      )
    )
      return false;
    const panels = [...node.children].filter((n) => n.classList.contains('mbb-code-tab'));
    const values = options.tabs;
    if (
      !Array.isArray(values) ||
      !panels.length ||
      panels.length > 8 ||
      panels.length !== values.length ||
      values.some(
        (t, i) =>
          !t ||
          Array.isArray(t) ||
          typeof t !== 'object' ||
          Object.keys(t).length !== (version === 2 ? 6 : 4) ||
          Object.keys(t).some(
            (k) =>
              ![
                'id',
                'title',
                'language',
                'code',
                ...(version === 2 ? ['startLine', 'highlights'] : []),
              ].includes(k),
          ) ||
          typeof t.id !== 'string' ||
          !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(t.id) ||
          typeof t.title !== 'string' ||
          [...t.title].length > 200 ||
          /[\r\n\0\uD800-\uDFFF]/u.test(t.title) ||
          typeof t.language !== 'string' ||
          !/^[A-Za-z0-9_+-]{0,64}$/.test(t.language) ||
          typeof t.code !== 'string' ||
          /[\0\uD800-\uDFFF]/u.test(t.code) ||
          new TextEncoder().encode(t.code).length > 65536 ||
          t.id !== panels[i].id ||
          (version === 2 && !validLines(t)),
      ) ||
      values.reduce((n, t) => n + new TextEncoder().encode(t.code).length, 0) > 131072 ||
      new Set(values.map((t) => t.id)).size !== values.length ||
      !values.some((t) => t.id === options.defaultTab)
    )
      return false;
    let current = values.findIndex((t) => t.id === options.defaultTab),
      full = false;
    const controls = generated(),
      list = document.createElement('div');
    list.className = 'mbb-code-tabs-list';
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', T('Code versions'));
    const lineViews = [];
    const tabs = panels.map((panel, index) => {
      const pre = panel.querySelector('pre');
      let codeAnchor = pre;
      while (codeAnchor && codeAnchor.parentElement !== panel)
        codeAnchor = codeAnchor.parentElement;
      const prismWrapper = pre?.closest('.code-toolbar');
      if (prismWrapper && panel.contains(prismWrapper))
        for (const toolbar of prismWrapper.querySelectorAll(':scope > .toolbar')) toolbar.remove();
      const tab = button(languageLabel(values[index].language), () => select(panel, true));
      let suffix = 0;
      do {
        tab.id = 'mbb-tab-control-' + node.id + '-' + index + '-' + suffix++;
      } while (document.getElementById(tab.id));
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      tab.addEventListener('keydown', (event) => {
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % panels.length;
        else if (event.key === 'ArrowLeft') next = (index + panels.length - 1) % panels.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = panels.length - 1;
        else return;
        event.preventDefault();
        select(panels[next], true);
        tabs[next].focus();
      });
      const copyControls = generated(),
        copy = button(T('Copy ') + tab.textContent, async () => {
          try {
            await navigator.clipboard.writeText(values[index].code);
            copy.setAttribute('aria-label', T('Copied ') + tab.textContent);
            copy.title = T('Copied ') + tab.textContent;
            status.textContent = T('Copied');
          } catch {
            let area = copyControls.querySelector('textarea');
            if (!area) {
              area = document.createElement('textarea');
              area.readOnly = true;
              area.setAttribute(
                'aria-label',
                T('Code text for manual copying (newlines may be normalized)'),
              );
              copyControls.append(area);
            }
            area.setAttribute(
              'aria-label',
              T('Code text for manual copying (newlines may be normalized)'),
            );
            area.value = values[index].code;
            area.focus();
            area.select();
            status.textContent = T('Copy the original code manually');
          }
        });
      const status = document.createElement('span');
      status.className = 'mbb-code-status';
      status.setAttribute('role', 'status');
      copyIcon(copy, T('Copy ') + tab.textContent);
      copyControls.classList.add('mbb-code-panel-tools');
      copyControls.append(copy, status);
      const summary = panel.querySelector('.mbb-code-line-summary');
      if (summary && version === 2) {
        summary.hidden = true;
        summary.textContent =
          F(T('Starting line: %1$s'), values[index].startLine) +
          (values[index].highlights
            ? '; ' + F(T('Highlighted lines: %1$s'), values[index].highlights)
            : '');
      }
      const heading = panel.querySelector('.mbb-code-tab-title');
      if (heading) heading.hidden = !values[index].title;
      panel.classList.toggle('mbb-code-no-title', !values[index].title);
      panel.insertBefore(copyControls, codeAnchor);
      const code = panel.querySelector('pre code');
      if (code && node.id && values[index].id) {
        const value = values[index],
          lines = sourceLines(value.code),
          start = value.startLine ?? 1;
        let windowStart = 0,
          shown = Math.min(400, lines.length),
          anchor = start,
          selected = null;
        const share = button(T('Copy line link'), async () => {
          const range = selected || [start, start];
          const hash =
            '#mbb-code/' +
            node.id +
            '/' +
            value.id +
            '/L' +
            range[0] +
            (range[1] === range[0] ? '' : '-L' + range[1]);
          try {
            await navigator.clipboard.writeText(new URL(hash, location.href).href);
            status.textContent = T('Line link copied');
          } catch {
            let area = copyControls.querySelector('textarea');
            if (!area) {
              area = document.createElement('textarea');
              area.readOnly = true;
              copyControls.append(area);
            }
            area.setAttribute('aria-label', T('Copy line link'));
            area.value = new URL(hash, location.href).href;
            area.focus();
            area.select();
            status.textContent = T('Copy line link');
          }
        });
        share.className = 'mbb-code-line-share';
        share.textContent = '';
        share.setAttribute('aria-label', T('Copy line link'));
        share.title = T('Copy line link');
        copyControls.append(share);
        code.dataset.mbbCodeLines = '';
        code.style.setProperty(
          '--mbb-code-digits',
          String(String(start + lines.length - 1).length),
        );
        const marked = (n) =>
          (value.highlights || '')
            .split(',')
            .filter(Boolean)
            .some((part) => {
              const [a, b = a] = part.split('-').map(Number);
              return n >= a && n <= b;
            });
        const draw = () => {
          const rows = lines.slice(windowStart, shown).map((text, offset) => {
            const i = windowStart + offset;
            const n = start + i,
              row = document.createElement('span');
            row.className = 'mbb-code-line';
            row.dataset.line = String(n);
            if (marked(n)) row.dataset.mbbHighlight = '';
            if (selected && n >= selected[0] && n <= selected[1]) row.dataset.mbbSelected = '';
            const number = button(F(T('Select code line %1$s'), n), () => {});
            number.textContent = '';
            number.className = 'mbb-code-line-number';
            number.dataset.line = String(n);
            number.dataset.mbbGenerated = '';
            number.setAttribute('aria-label', F(T('Select code line %1$s'), n));
            number.onclick = (event) => {
              if (!event.shiftKey) anchor = n;
              selected = [Math.min(anchor, n), Math.max(anchor, n)];
              const targetHash =
                '#mbb-code/' +
                node.id +
                '/' +
                value.id +
                '/L' +
                selected[0] +
                (selected[1] === selected[0] ? '' : '-L' + selected[1]);
              record(false, targetHash);
              draw();
              code
                .querySelector('[data-line="' + n + '"] .mbb-code-line-number')
                ?.focus({ preventScroll: true });
            };
            const content = document.createElement('span');
            content.className = 'mbb-compare-source';
            content.dataset.mbbSourceLine = String(i);
            content.textContent = text;
            row.append(number, content);
            return row;
          });
          if (windowStart)
            rows.unshift(document.createTextNode(lines.slice(0, windowStart).join('')));
          if (shown < lines.length) rows.push(document.createTextNode(lines.slice(shown).join('')));
          code.replaceChildren(...rows);
          highlightCompare(code);
        };
        const lineNavigation = generated();
        lineNavigation.classList.add('mbb-code-line-navigation');
        panel.insertBefore(lineNavigation, codeAnchor);
        const highlightRanges = (value.highlights || '')
          .split(',')
          .filter(Boolean)
          .map((part) => part.split('-').map(Number));
        const outsideHighlight = () => {
          for (const [a, b = a] of highlightRanges) {
            if (a < start + windowStart) return a;
            if (b >= start + shown) return Math.max(a, start + shown);
          }
          return null;
        };
        const more = button(T('Next numbered lines'), () => {
          windowStart = shown;
          shown = Math.min(lines.length, shown + 400);
          draw();
          syncWindow();
        });
        more.className = 'mbb-code-lines-more';
        more.hidden = shown >= lines.length;
        const earlier = button(T('Previous numbered lines'), () => {
          windowStart = Math.max(0, windowStart - 400);
          shown = Math.min(lines.length, windowStart + 400);
          draw();
          syncWindow();
        });
        const windowHint = document.createElement('span');
        windowHint.className = 'mbb-code-status';
        const syncWindow = () => {
          more.hidden = shown >= lines.length;
          earlier.hidden = windowStart === 0;
          if (highlights) highlights.hidden = outsideHighlight() === null;
          lineNavigation.hidden =
            more.hidden && earlier.hidden && (!highlights || highlights.hidden);
          windowHint.textContent =
            lines.length > 400
              ? F(
                  T('Numbered lines %1$s–%2$s; the complete code remains visible.'),
                  start + windowStart,
                  start + shown - 1,
                )
              : '';
        };
        lineNavigation.append(earlier, more, windowHint);
        const highlights = value.highlights
          ? button(T('Go to highlighted lines'), () => {
              const n = outsideHighlight();
              if (n === null) return;
              lineViews[index](n, n);
              panel
                .querySelector('.mbb-code-line[data-line="' + n + '"]')
                ?.scrollIntoView({ block: 'center' });
            })
          : null;
        if (highlights) lineNavigation.append(highlights);
        syncWindow();
        lineViews[index] = (first, last) => {
          if (first < start || last < first || last >= start + lines.length) return false;
          selected = [first, last];
          anchor = first;
          windowStart = Math.max(0, first - start - 20);
          shown = Math.min(lines.length, windowStart + 400);
          draw();
          syncWindow();
          return true;
        };
        draw();
      }

      list.append(tab);
      return tab;
    });
    function update(notify = true) {
      panels.forEach((panel, i) => {
        panel.hidden = !full && i !== current;
        tabs[i].setAttribute('aria-selected', String(i === current));
        tabs[i].tabIndex = i === current ? 0 : -1;
      });
      if (notify) change();
    }
    function select(panel, push, notify = true) {
      const index = panels.indexOf(panel);
      if (index < 0) return;
      current = index;
      full = false;
      update(notify);
      if (push) record(false, '#' + encodeURIComponent(panel.id));
    }
    controls.append(list);
    node.prepend(controls);
    codeGroups.set(node, {
      line: (id, first, last) => {
        const index = values.findIndex((v) => v.id === id);
        if (index < 0 || !lineViews[index]?.(first, last)) return false;
        revealTarget(panels[index]);
        select(panels[index], false);
        measureStageBars();
        panels[index]
          .querySelector('.mbb-code-line[data-line="' + first + '"]')
          ?.scrollIntoView({ block: 'center' });
        return true;
      },
      select,
      all: () => {
        full = true;
        update();
      },
      state: () => ({ current: values[current].id, full }),
      restore: (item) => {
        const index = values.findIndex((t) => t.id === item.current);
        if (index >= 0 && typeof item.full === 'boolean') {
          current = index;
          // Older history entries may have expanded every language through Full text.
          full = false;
          update();
        }
      },
    });
    update();
    return true;
  }
  function compare(node, options) {
    const panes = ['left', 'right'].map((side) => child(node, '.mbb-compare-' + side));
    if (panes.some((p) => !p?.querySelector('pre code'))) return;
    const codes = panes.map((p) => p.querySelector('pre code'));
    const article = node.closest('article,.mbb-document') || document.body;
    const budget = annotationBudgets.get(article) || { lines: 0 };
    annotationBudgets.set(article, budget);
    const sources = codes.map((c) => c.textContent),
      lines = sources.map((s) => s.slice(0, -1).split('\n'));
    const equal = [new Set(), new Set()];
    const [a, b] = lines;
    if (a.length <= 1500 && b.length <= 1500 && a.length * b.length <= 250000) {
      const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
      for (let i = a.length - 1; i >= 0; i--)
        for (let j = b.length - 1; j >= 0; j--)
          dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      let i = 0,
        j = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
          equal[0].add(i++);
          equal[1].add(j++);
        } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
        else j++;
      }
    } else {
      // Bound memory for long code; equal positions remain unchanged, others are differences.
      for (let i = 0; i < Math.min(a.length, b.length); i++)
        if (a[i] === b[i]) {
          equal[0].add(i);
          equal[1].add(i);
        }
    }
    panes.forEach((pane, index) => {
      const side = index === 0 ? 'left' : 'right',
        highlights = new Set(
          String(options[side + 'Highlights'] || '')
            .split(',')
            .filter(Boolean)
            .map(Number),
        );
      const controls = generated(),
        status = document.createElement('span');
      controls.classList.add('mbb-code-panel-tools');
      status.className = 'mbb-code-status';
      status.setAttribute('role', 'status');
      const copy = button(
        F(T('Copy %1$s code'), index === 0 ? T('Left') : T('Right')),
        async () => {
          try {
            await navigator.clipboard.writeText(sources[index]);
            status.textContent = T('Copied');
          } catch {
            let fallback = controls.querySelector('textarea');
            if (!fallback) {
              fallback = document.createElement('textarea');
              fallback.readOnly = true;
              fallback.setAttribute('aria-label', T('Original code for manual copying'));
              controls.append(fallback);
            }
            fallback.value = sources[index];
            fallback.focus();
            fallback.select();
            status.textContent = T('Copy the original code manually');
          }
        },
      );
      copyIcon(copy, F(T('Copy %1$s code'), index === 0 ? T('Left') : T('Right')));
      controls.append(copy, status);
      pane.insertBefore(controls, pane.querySelector('pre'));
      // Preserve every original source byte as text, including final newline.
      let displayed = Math.min(400, Math.max(0, 4000 - budget.lines), lines[index].length);
      budget.lines += displayed;
      const annotate = () => {
        const spans = lines[index].slice(0, displayed).map((line, i) => {
          const span = document.createElement('span');
          span.className = 'mbb-compare-line';
          span.dataset.mbbDiff = equal[index].has(i) ? 'equal' : index === 0 ? 'removed' : 'added';
          if (highlights.has(i + 1)) span.dataset.mbbHighlight = '';
          const number = document.createElement('span');
          number.dataset.mbbGenerated = '';
          number.className = 'mbb-compare-line-number';
          number.setAttribute('aria-hidden', 'true');
          number.dataset.line = String(i + 1);
          number.dataset.symbol = equal[index].has(i) ? ' ' : index === 0 ? '−' : '+';
          const source = document.createElement('span');
          source.className = 'mbb-compare-source';
          source.textContent = line + '\n';
          span.append(number, source);
          return span;
        });
        if (displayed < lines[index].length)
          spans.push(document.createTextNode(lines[index].slice(displayed).join('\n') + '\n'));
        codes[index].replaceChildren(...spans);
        highlightCompare(codes[index]);
      };
      annotate();
      const language = document.createElement('span');
      language.textContent = languageLabel(
        codes[index].className.match(/language-([\w+-]+)/)?.[1] || 'text',
      );
      controls.prepend(language);
      if (displayed < lines[index].length) {
        const expand = button(T('Annotate additional code lines'), () => {
          const next = Math.min(
            displayed + 400,
            displayed + Math.max(0, 8000 - budget.lines),
            2000,
            lines[index].length,
          );
          budget.lines += next - displayed;
          displayed = next;
          annotate();
          expand.disabled =
            displayed >= Math.min(2000, lines[index].length) || budget.lines >= 8000;
        });
        const annotationControls = generated();
        annotationControls.classList.add('mbb-compare-annotation');
        annotationControls.append(expand);
        const note = document.createElement('span');
        note.textContent = T(
          'Initially annotates 400 lines; at most 2000 per side, 4000 initial lines per article, and 8000 manually requested lines. Remaining source stays unchanged and fully copyable.',
        );
        annotationControls.append(note);
        pane.append(annotationControls);
      }
    });
    const legend = generated();
    legend.classList.add('mbb-compare-legend');
    legend.textContent =
      (a.length <= 1500 && b.length <= 1500 && a.length * b.length <= 250000
        ? T('Line differences: ')
        : T('Long code differences estimated by matching line positions: ')) +
      T(
        '− left-side deletions or changes; + right-side additions or changes. Leading marks indicate author highlights.',
      );
    node.append(legend);
    node.dataset.mbbSyncScroll = 'true';
    return true;
  }
  function highlightCompare(code) {
    const prism = window.Prism;
    const language = code.className.match(/language-([\w+-]+)/)?.[1];
    const grammar = prism?.languages?.[language];
    if (!grammar || typeof prism.highlight !== 'function') return;
    // Tokenize the whole original code once so multiline comments/strings keep their syntax.
    // Split encoded token spans at line boundaries without altering source text or diff wrappers.
    const fragment = document.createElement('div');
    // Character references retain CR bytes through HTML fragment parsing.
    fragment.innerHTML = prism
      .highlight(code.textContent, grammar, language)
      .replace(/\r/g, '&#13;');
    const rows = [[]];
    function split(node, ancestors = []) {
      if (node.nodeType === Node.TEXT_NODE) {
        const parts = node.textContent.split(/(\r\n|\r|\n)/);
        for (let i = 0; i < parts.length; i += 2) {
          const newline = parts[i + 1] || '';
          let leaf = document.createTextNode(parts[i] + newline);
          for (let j = ancestors.length - 1; j >= 0; j--) {
            const wrapper = ancestors[j].cloneNode(false);
            wrapper.append(leaf);
            leaf = wrapper;
          }
          rows.at(-1).push(leaf);
          if (newline) rows.push([]);
        }
      } else for (const child of node.childNodes) split(child, [...ancestors, node]);
    }
    for (const node of fragment.childNodes) split(node);
    code.querySelectorAll('.mbb-compare-source').forEach((row, i) => {
      const index = row.dataset.mbbSourceLine === undefined ? i : Number(row.dataset.mbbSourceLine);
      if (rows[index]) row.replaceChildren(...rows[index]);
    });
  }
  document.addEventListener('mbb:syntax-ready', () => {
    for (const code of document.querySelectorAll(
      '.wp-block-mbb-code-compare pre code,code[data-mbb-code-lines]',
    ))
      highlightCompare(code);
  });
  function init(root = document) {
    for (const node of root.querySelectorAll('[data-mbb-teaching]')) {
      if (node.dataset.mbbEnhanced) continue;
      const kind = node.dataset.mbbTeaching,
        options = config(node);
      if (kind === 'native-details') {
        if (!node.matches('details:is(.wp-block-details,.mbb-technical-statement)')) continue;
        node.addEventListener('toggle', change);
        child(node, 'summary')?.addEventListener('click', () => setTimeout(() => record(), 0));
      } else if (kind === 'collapse') {
        const body = child(node, '.mbb-teaching-body'),
          title = child(node, '.mbb-teaching-title');
        if (!body || !title) continue;
        if (node.classList.contains('mbb-activity-disclosure')) {
          body.hidden = false;
          title.hidden = false;
          node.dataset.mbbEnhanced = 'true';
          continue;
        }
        const activity = config(node.closest('[data-mbb-teaching="component"]') || node).activity;
        if (
          activity &&
          [activity.prompt, ...(activity.options || []).map((o) => o.target)].includes(node.id)
        ) {
          node.classList.add('mbb-activity-question');
          body.hidden = false;
          title.hidden = false;
          node.dataset.mbbEnhanced = 'true';
          continue;
        }
        const controls = generated(),
          toggle = button(title.textContent, () => {
            body.hidden = !body.hidden;
            toggle.setAttribute('aria-expanded', String(!body.hidden));
            change();
            record();
          });
        if (!body.id) {
          let id = node.id + '-mbb-body';
          while (document.getElementById(id)) id += '-body';
          body.id = id;
        }
        toggle.setAttribute('aria-controls', body.id);
        body.hidden = options.open !== true;
        toggle.setAttribute('aria-expanded', String(!body.hidden));
        controls.classList.add('mbb-collapse-controls');
        toggle.classList.add('mbb-collapse-toggle');
        controls.append(toggle);
        node.insertBefore(controls, title);
        title.hidden = true;
      } else if (kind === 'steps') {
        const body = child(node, '.mbb-teaching-body'),
          steps = body ? [...body.children].filter((n) => n.dataset.mbbTeaching === 'step') : [];
        if (!steps.length) continue;
        const controls = generated(),
          status = document.createElement('span');
        controls.classList.add('mbb-stage-controls');
        status.className = 'mbb-stage-status';
        status.setAttribute('aria-live', 'polite');
        const progress = document.createElement('progress');
        progress.max = steps.length;
        let current = 0,
          full = options.mode !== 'staged';
        const prev = button(T('Previous stage'), () => select(steps[current - 1], true)),
          next = button(T('Next stage'), () => select(steps[current + 1], true)),
          all = button(T('Full text'), () => {
            full = true;
            update();
            const article = node.closest('article,.mbb-document') || node;
            for (const detail of article.querySelectorAll(
              'details:is(.wp-block-details,.mbb-technical-statement)',
            ))
              detail.open = true;
            for (const part of article.querySelectorAll('.mbb-activity-disclosure'))
              part.hidden = false;
            for (const fold of article.querySelectorAll('[data-mbb-teaching=collapse]')) {
              const foldBody = child(fold, '.mbb-teaching-body');
              if (foldBody) foldBody.hidden = false;
              child(fold, '.mbb-teaching-controls')
                ?.querySelector('button')
                ?.setAttribute('aria-expanded', 'true');
            }
            change();
            record();
          });
        const staged = button(T('Read by stage'), () => {
          full = false;
          update();
          change();
          record();
        });
        function update() {
          steps.forEach((step, i) => {
            step.hidden = !full && i !== current;
          });
          prev.disabled = full || current === 0;
          next.disabled = full || current === steps.length - 1;
          all.setAttribute('aria-pressed', String(full));
          staged.setAttribute('aria-pressed', String(!full));
          controls.querySelector('select')?.value !== undefined &&
            (controls.querySelector('select').value = String(current));
          progress.value = full ? steps.length : current + 1;
          status.textContent = full
            ? T('Show full text')
            : F(T('Stage %1$s / %2$s'), current + 1, steps.length);
          progress.setAttribute('aria-label', status.textContent);
        }
        function select(step, scroll) {
          const index = steps.indexOf(step);
          if (index < 0) return;
          current = index;
          if (!full) update();
          else update();
          change();
          if (scroll) navigate(step);
        }
        groups.set(node, {
          select,
          state: () => ({ current, full }),
          restore: (value) => {
            if (
              Number.isInteger(value.current) &&
              value.current >= 0 &&
              value.current < steps.length &&
              typeof value.full === 'boolean'
            ) {
              current = value.current;
              full = value.full;
              update();
            }
          },
        });
        const modes = document.createElement('div');
        modes.className = 'mbb-stage-modes';
        modes.append(staged, all);
        const navigation = document.createElement('div');
        navigation.className = 'mbb-stage-navigation';
        if (options.previous) navigation.append(prev);
        if (options.next) navigation.append(next);
        const progressGroup = document.createElement('div');
        progressGroup.className = 'mbb-stage-progress';
        progressGroup.append(status, progress);
        controls.append(modes, progressGroup, navigation);
        const chooser = document.createElement('select');
        chooser.setAttribute('aria-label', T('Choose a stage'));
        steps.forEach((step, index) => {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent =
            child(step, '.mbb-teaching-title')?.textContent || F(T('Stage %1$s'), index + 1);
          chooser.append(option);
        });
        chooser.addEventListener('change', () => {
          full = false;
          select(steps[Number(chooser.value)], true);
        });
        navigation.insertBefore(chooser, next.parentNode ? next : null);
        node.insertBefore(controls, body);
        stageBars.set(node, controls);
        stageResize?.observe(controls);
        update();
      } else if (kind === 'code-compare') {
        if (!compare(node, options)) continue;
      } else if (kind === 'code-tabs') {
        try {
          if (!codeTabs(node, options)) continue;
        } catch {
          codeGroups.delete(node);
          for (const panel of node.querySelectorAll('.mbb-code-tab')) {
            panel.hidden = false;
            panel.removeAttribute('role');
            panel.removeAttribute('aria-labelledby');
          }
          for (const control of node.querySelectorAll('.mbb-teaching-controls')) control.remove();
          continue;
        }
      }
      node.dataset.mbbEnhanced = 'true';
    }
  }
  let printedDetails = null;
  window.addEventListener('beforeprint', () => {
    if (printedDetails) return;
    printedDetails = [
      ...document.querySelectorAll('details:is(.wp-block-details,.mbb-technical-statement)'),
    ].map((node) => ({
      node,
      open: node.open,
    }));
    for (const item of printedDetails) item.node.open = true;
  });
  window.addEventListener('afterprint', () => {
    for (const item of printedDetails || []) if (item.node.isConnected) item.node.open = item.open;
    printedDetails = null;
  });
  init();
  measureStageBars();
  restore(history.state);
  hash();
  record(true);
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#mbb-code/') || !hasCurrentHistoryView()) hash();
  });
  window.addEventListener('popstate', (event) => {
    restore(event.state);
    if (location.hash.startsWith('#mbb-code/') || !hasCurrentHistoryView()) hash();
  });
  document.addEventListener('click', (event) => {
    const a = event.target.closest?.('a[href*="#"]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (
      url.origin !== location.origin ||
      url.pathname !== location.pathname ||
      url.search !== location.search
    )
      return;
    let id;
    try {
      id = decodeURIComponent(url.hash.slice(1));
    } catch {
      return;
    }
    const node = document.getElementById(id);
    if (node) revealTarget(node);
  });
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });
})();
