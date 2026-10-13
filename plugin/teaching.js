(() => {
  const groups = new Map();
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
      if (body) body.hidden = !item.open;
      child(node, '.mbb-teaching-controls')
        ?.querySelector('button')
        ?.setAttribute('aria-expanded', String(!!item.open));
    }
    change();
  }
  function navigate(node) {
    revealTarget(node);
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
    if (id) {
      const node = document.getElementById(id);
      if (node && revealTarget(node)) node.scrollIntoView({ block: 'start' });
    }
  }
  function codeTabs(node, options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) return false;
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
          Object.keys(t).length !== 4 ||
          Object.keys(t).some((k) => !['id', 'title', 'language', 'code'].includes(k)) ||
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
          t.id !== panels[i].id,
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
    list.setAttribute('aria-label', '代码版本');
    const tabs = panels.map((panel, index) => {
      const tab = button(values[index].title || values[index].language || '代码', () =>
        select(panel, true),
      );
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
        copy = button('复制 ' + tab.textContent, async () => {
          try {
            await navigator.clipboard.writeText(values[index].code);
            copy.textContent = '已复制 ' + tab.textContent;
          } catch {
            let area = copyControls.querySelector('textarea');
            if (!area) {
              area = document.createElement('textarea');
              area.readOnly = true;
              area.setAttribute('aria-label', '代码文本手动复制（换行可能规范化）');
              copyControls.append(area);
            }
            area.value = values[index].code;
            area.focus();
            area.select();
            copy.textContent = '手动复制可能规范化换行；下载原代码保留字节';
          }
        });
      const download = button('下载原代码 ' + tab.textContent, () => {
        const blob = new Blob([values[index].code], {
            type: 'text/plain;charset=utf-8',
            endings: 'transparent',
          }),
          url = URL.createObjectURL(blob),
          a = document.createElement('a');
        a.href = url;
        a.download = values[index].id + '.txt';
        a.hidden = true;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      copyControls.append(copy, download);
      panel.append(copyControls);
      list.append(tab);
      return tab;
    });
    function update(notify = true) {
      panels.forEach((panel, i) => {
        panel.hidden = !full && i !== current;
        tabs[i].setAttribute('aria-selected', String(i === current));
        tabs[i].tabIndex = i === current ? 0 : -1;
      });
      all.setAttribute('aria-pressed', String(full));
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
    const all = button('显示全部代码版本', () => {
        full = true;
        update();
        record();
      }),
      single = button('返回页签阅读', () => {
        full = false;
        update();
        record();
      });
    controls.append(list, all, single);
    node.prepend(controls);
    codeGroups.set(node, {
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
          full = item.full;
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
      status.setAttribute('role', 'status');
      controls.append(
        button('复制' + (index === 0 ? '左侧' : '右侧') + '代码', async () => {
          try {
            await navigator.clipboard.writeText(sources[index]);
            status.textContent = '已复制';
          } catch {
            let fallback = controls.querySelector('textarea');
            if (!fallback) {
              fallback = document.createElement('textarea');
              fallback.readOnly = true;
              fallback.setAttribute('aria-label', '原始代码手动复制');
              controls.append(fallback);
            }
            fallback.value = sources[index];
            fallback.focus();
            fallback.select();
            status.textContent = '请手动复制原始代码';
          }
        }),
        status,
      );
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
          span.append(number, document.createTextNode(line + '\n'));
          return span;
        });
        if (displayed < lines[index].length)
          spans.push(document.createTextNode(lines[index].slice(displayed).join('\n') + '\n'));
        codes[index].replaceChildren(...spans);
      };
      annotate();
      const language = document.createElement('span');
      language.textContent = codes[index].className.match(/language-([\w+-]+)/)?.[1] || 'text';
      controls.prepend(language);
      if (displayed < lines[index].length) {
        const expand = button('标注后续代码行', () => {
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
        controls.append(expand);
        const note = document.createElement('span');
        note.textContent =
          '首次标注 400 行，每份最多 2000 行，每篇初次最多 4000 行、手动最多 8000 行；其余源码原样显示并完整复制。';
        controls.append(note);
      }
    });
    const legend = generated();
    legend.textContent =
      (a.length <= 1500 && b.length <= 1500 && a.length * b.length <= 250000
        ? '行级差异：'
        : '长代码按相同行位置估计差异：') +
      '− 左侧删除或修改；+ 右侧新增或修改；框线标记作者重点。';
    node.append(legend);
    return true;
  }
  function init(root = document) {
    for (const node of root.querySelectorAll('[data-mbb-teaching]')) {
      if (node.dataset.mbbEnhanced) continue;
      const kind = node.dataset.mbbTeaching,
        options = config(node);
      if (kind === 'collapse') {
        const body = child(node, '.mbb-teaching-body'),
          title = child(node, '.mbb-teaching-title');
        if (!body || !title) continue;
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
        controls.append(toggle);
        node.insertBefore(controls, title);
        title.hidden = true;
      } else if (kind === 'steps') {
        const body = child(node, '.mbb-teaching-body'),
          steps = body ? [...body.children].filter((n) => n.dataset.mbbTeaching === 'step') : [];
        if (!steps.length) continue;
        const controls = generated(),
          status = document.createElement('span');
        status.setAttribute('aria-live', 'polite');
        let current = 0,
          full = options.mode !== 'staged';
        const prev = button('上一阶段', () => select(steps[current - 1], true)),
          next = button('下一阶段', () => select(steps[current + 1], true)),
          all = button('全文', () => {
            full = true;
            update();
            const article = node.closest('article,.mbb-document') || node;
            for (const fold of article.querySelectorAll('[data-mbb-teaching=collapse]')) {
              const foldBody = child(fold, '.mbb-teaching-body');
              if (foldBody) foldBody.hidden = false;
              child(fold, '.mbb-teaching-controls')
                ?.querySelector('button')
                ?.setAttribute('aria-expanded', 'true');
            }
            for (const group of article.querySelectorAll('[data-mbb-teaching=code-tabs]'))
              codeGroups.get(group)?.all();
            change();
            record();
          });
        const staged = button('分阶段阅读', () => {
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
          status.textContent = full ? '显示全文' : `阶段 ${current + 1} / ${steps.length}`;
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
        if (options.previous) controls.append(prev);
        if (options.next) controls.append(next);
        controls.append(all, staged, status);
        const chooser = document.createElement('select');
        chooser.setAttribute('aria-label', '选择阶段');
        steps.forEach((step, index) => {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent =
            child(step, '.mbb-teaching-title')?.textContent || `阶段 ${index + 1}`;
          chooser.append(option);
        });
        chooser.addEventListener('change', () => {
          full = false;
          select(steps[Number(chooser.value)], true);
        });
        controls.append(chooser);
        node.insertBefore(controls, body);
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
  init();
  restore(history.state);
  hash();
  record(true);
  window.addEventListener('hashchange', () => {
    if (!hasCurrentHistoryView()) hash();
  });
  window.addEventListener('popstate', (event) => {
    restore(event.state);
    if (!hasCurrentHistoryView()) hash();
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
