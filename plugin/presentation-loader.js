(() => {
  const T = (message) => globalThis.MBBI18n?.t(message) ?? message;
  const config = window.MBB_PRESENTATION;
  if (!config) return;
  window.MBB_EMOJI_MANUAL = true;
  const pending = new Map();
  const load = (url, style = false) => {
    if (pending.has(url)) return pending.get(url);
    const selector = style ? 'link[rel="stylesheet"]' : 'script[src]';
    if (
      [...document.querySelectorAll(selector)].some(
        (node) =>
          new URL(style ? node.href : node.src).pathname === new URL(url, location.href).pathname,
      )
    )
      return Promise.resolve();
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement(style ? 'link' : 'script');
      if (style) {
        node.rel = 'stylesheet';
        node.href = url;
      } else node.src = url;
      node.onload = resolve;
      node.onerror = () => {
        pending.delete(url);
        node.remove();
        reject(Error('Presentation resources could not be loaded'));
      };
      document.head.append(node);
    });
    pending.set(url, promise);
    return promise;
  };
  const ignored = 'pre,code,script,style,textarea,[contenteditable],.mbb-math,.mbb-typeset';
  const excluded =
    '.mbb-math,.mbb-typeset,.wp-block-mbb-math,script,style,textarea,[contenteditable]';
  const within = (root, selector) =>
    root.nodeType === Node.ELEMENT_NODE
      ? [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)]
      : [];
  const codeDisplays = new Map();
  const expectedScroll = new WeakMap();
  let queuedCodeLayout = false;
  const updateCodeLayout = () => {
    if (queuedCodeLayout) return;
    queuedCodeLayout = true;
    requestAnimationFrame(() => {
      queuedCodeLayout = false;
      for (const [pre, state] of codeDisplays) {
        if (!pre.isConnected) {
          codeSizes?.unobserve(pre);
          const code = pre.querySelector('code');
          if (code) codeSizes?.unobserve(code);
          codeDisplays.delete(pre);
          continue;
        }
        const overflowing = pre.clientWidth > 0 && pre.scrollWidth > pre.clientWidth + 1;
        if (overflowing) {
          if (!pre.hasAttribute('tabindex')) {
            pre.setAttribute('tabindex', '0');
            state.tabIndexAdded = true;
          }
          if (!pre.hasAttribute('aria-description') && !pre.hasAttribute('aria-describedby')) {
            state.description = T(
              'Scroll horizontally to read long lines. Focus the code and use the arrow keys.',
            );
            pre.setAttribute('aria-description', state.description);
          }
        } else {
          if (state.tabIndexAdded && pre.getAttribute('tabindex') === '0')
            pre.removeAttribute('tabindex');
          if (state.description && pre.getAttribute('aria-description') === state.description)
            pre.removeAttribute('aria-description');
          state.tabIndexAdded = false;
          state.description = null;
        }
      }
    });
  };
  const codeSizes =
    typeof ResizeObserver === 'function' ? new ResizeObserver(updateCodeLayout) : null;
  const enhanceCode = (code) => {
    const pre = code.closest('pre');
    if (
      !pre ||
      !pre.isConnected ||
      (!pre.matches('pre.wp-block-mbb-code') &&
        !pre.closest('.wp-block-mbb-code-tabs,.wp-block-mbb-code-compare'))
    )
      return;
    pre.classList.add('mbb-code-display');
    const lineCount = (code.textContent.match(/\n(?!$)/g) || []).length + 1;
    const start = Number.parseInt(pre.dataset.start || '1', 10) || 1;
    const digits = String(Math.max(Math.abs(start), Math.abs(start + lineCount - 1))).length;
    pre.style.setProperty('--mbb-code-gutter', Math.max(3.25, digits * 0.65 + 0.9) + 'em');
    if (!codeDisplays.has(pre)) {
      codeDisplays.set(pre, { tabIndexAdded: false, description: null });
      codeSizes?.observe(pre);
      codeSizes?.observe(code);
      pre.addEventListener(
        'scroll',
        () => {
          const expected = expectedScroll.get(pre);
          if (expected !== undefined && Math.abs(pre.scrollLeft - expected) < 1) {
            expectedScroll.delete(pre);
            return;
          }
          const group = pre.closest('[data-mbb-sync-scroll="true"]');
          if (!group) return;
          for (const other of group.querySelectorAll('pre')) {
            if (other === pre) continue;
            const offset = Math.min(
              pre.scrollLeft,
              Math.max(0, other.scrollWidth - other.clientWidth),
            );
            if (Math.abs(other.scrollLeft - offset) < 1) continue;
            expectedScroll.set(other, offset);
            other.scrollLeft = offset;
          }
        },
        { passive: true },
      );
    }
    updateCodeLayout();
  };
  window.addEventListener('resize', updateCodeLayout);
  document.addEventListener('mbb:teaching-change', updateCodeLayout);
  const highlighted = new WeakMap();
  const codeSignature = (node) => node.textContent + '\0' + window.Prism?.util?.getLanguage(node);
  let codeAssets;
  const compareLanguages = new Map();
  const prepareComparison = (block) => {
    const language = Prism.util.getLanguage(block);
    if (!compareLanguages.has(language)) {
      const grammar = Prism.languages[language];
      const prepared = grammar
        ? Promise.resolve()
        : new Promise((resolve, reject) => {
            Prism.plugins.autoloader.loadLanguages(language, resolve, reject);
          });
      compareLanguages.set(language, prepared);
      prepared
        .then(() => document.dispatchEvent(new CustomEvent('mbb:syntax-ready')))
        .catch(() => {});
    }
  };
  const highlight = async (root) => {
    const blocks = within(root, 'pre code').filter(
      (node) =>
        !node.closest('.wp-block-mbb-math,[contenteditable]') &&
        !node.classList.contains('mbb-tex'),
    );
    if (!blocks.length) return;
    if (!codeAssets)
      codeAssets = (async () => {
        window.Prism = window.Prism || {};
        window.Prism.manual = true;
        await Promise.all(config.codeStyles.map((url) => load(url, true)));
        for (const url of config.codeScripts) await load(url);
        if (
          config.lineNumbers &&
          config.lineNumberStyle &&
          !document.getElementById('mbb-code-line-number-style') &&
          !document.getElementById('prism-plugin-line-numbers-inline-css')
        ) {
          const style = document.createElement('style');
          style.id = 'mbb-code-line-number-style';
          style.textContent = config.lineNumberStyle;
          document.head.append(style);
        }
        Prism.languages.text = Prism.languages.plaintext = Prism.languages.plain = {};
        Prism.languages.sh = Prism.languages.shell = {};
        Prism.plugins.autoloader.languages_path = config.languages;
        if (!Prism.mbbCodeTabsHook) {
          Prism.mbbCodeTabsHook = true;
          // A theme may run highlightAll again after our renderer. Comparison rows are
          // already highlighted as a whole source and must retain their annotations.
          Prism.hooks.add('before-sanity-check', (env) => {
            if (
              env.element.closest('.wp-block-mbb-code-compare') ||
              env.element.hasAttribute('data-mbb-code-lines')
            )
              env.code = '';
          });
          Prism.hooks.add('complete', ({ element }) => {
            if (!element.closest('.wp-block-mbb-code-tabs,.wp-block-mbb-code-compare')) return;
            const wrapper = element.closest('.code-toolbar');
            for (const toolbar of wrapper?.querySelectorAll(':scope > .toolbar') || [])
              toolbar.remove();
            for (const rows of element.querySelectorAll('.line-numbers-rows'))
              rows.dataset.mbbGenerated = '';
          });
        }
      })().catch((error) => {
        codeAssets = null;
        throw error;
      });
    await codeAssets;
    for (const block of blocks) {
      if (!block.isConnected || highlighted.get(block) === codeSignature(block)) continue;
      if (
        block.closest('.wp-block-mbb-code-tabs,.wp-block-mbb-code-compare') &&
        !(config.codeLanguages || ['text', 'plain', 'plaintext', 'none']).includes(
          Prism.util.getLanguage(block),
        )
      )
        block.className = block.className
          .split(/\s+/)
          .filter((name) => !/^lang(?:uage)?-/i.test(name))
          .concat('language-text')
          .join(' ');
      if (
        !/(?:^|\s)lang(?:uage)?-\S+/.test(block.className) &&
        !/(?:^|\s)lang(?:uage)?-\S+/.test(block.parentElement.className)
      )
        block.classList.add('language-text');
      if (
        block.closest('.wp-block-mbb-code-compare') ||
        block.hasAttribute('data-mbb-code-lines')
      ) {
        // Its renderer preserves diff rows while distributing whole-source Prism tokens.
        highlighted.set(block, codeSignature(block));
        prepareComparison(block);
        enhanceCode(block);
        continue;
      }
      if (config.lineNumbers) block.parentElement.classList.add('line-numbers');
      block.parentElement.setAttribute('data-prismjs-copy', T('Copy'));
      block.parentElement.setAttribute('data-prismjs-copy-success', T('Copied'));
      block.parentElement.setAttribute(
        'data-prismjs-copy-error',
        T('Copy the original code manually'),
      );

      Prism.highlightElement(block);
      for (const numbers of block.querySelectorAll('.line-numbers-rows'))
        numbers.dataset.mbbGenerated = '';
      highlighted.set(block, codeSignature(block));
      enhanceCode(block);
    }
  };
  const scan = (root) => {
    if (!root.isConnected) return;
    highlight(root).catch(() => {});
    if (
      config.teachingScript &&
      within(root, '[data-mbb-teaching],details.wp-block-details').length
    ) {
      Promise.all([
        load(config.teachingStyle, true),
        ...(config.diagramStyle ? [load(config.diagramStyle, true)] : []),
      ]).catch(() => {});
      load(config.teachingScript).catch(() => {});
      if (config.componentScript) {
        const diagnostics = config.diagnosticsScript
          ? Promise.all([load(config.diagnosticsScript), load(config.diagnosticsStyle, true)])
          : Promise.resolve();
        window.MBB_DIAGNOSTICS_CONFIG = config.diagnosticsConfig || { canCopy: false };
        diagnostics
          .catch(() => {})
          .then(() => load(config.componentScript))
          .catch(() => {});
      }
    }
    if (within(root, '.mbb-footnote-ref,.mbb-footnotes').length)
      load(config.footnotes, true).catch(() => {});
    const nodes = root.nodeType === Node.TEXT_NODE ? [root] : [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    if (
      nodes.some(
        (node) =>
          !node.parentElement?.closest(ignored) && /:[a-zA-Z0-9_+\-]+:/.test(node.nodeValue),
      )
    ) {
      window.MBB_EMOJI_IMAGES = config.images;
      load(config.emoji)
        .then(() => {
          if (root.isConnected) window.MBB_RENDER_EMOJI?.(root);
        })
        .catch(() => {});
    }
  };
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    const roots = new Set();
    let queued = false;
    const queue = (node) => {
      if (!node.isConnected) return;
      roots.add(node);
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const batch = [...roots];
        roots.clear();
        for (const root of batch)
          if (!batch.some((other) => other !== root && other.contains(root))) scan(root);
      });
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.removedNodes.length) updateCodeLayout();
        const target =
          record.target.nodeType === Node.ELEMENT_NODE
            ? record.target
            : record.target.parentElement;
        if (target?.closest(excluded)) continue;
        const code = target?.closest('pre code');
        if (code) {
          if (highlighted.get(code) !== codeSignature(code)) queue(code);
          continue;
        }
        if (record.type === 'attributes') {
          if (target?.matches('pre,.mbb-footnote-ref,.mbb-footnotes')) queue(target);
        } else if (record.type === 'characterData') queue(record.target);
        else
          for (const node of record.addedNodes) {
            if (
              node.nodeType === Node.TEXT_NODE ||
              (node.nodeType === Node.ELEMENT_NODE && !node.matches(excluded))
            )
              queue(node);
          }
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    scan(document.body);
  };
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
    window.addEventListener('load', start, { once: true });
  } else start();
})();
