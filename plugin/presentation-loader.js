(() => {
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
        reject(Error('展示资源暂时无法加载'));
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
  const highlighted = new WeakMap();
  const codeSignature = (node) => node.textContent + '\0' + window.Prism?.util?.getLanguage(node);
  let codeAssets;
  const highlight = async (root) => {
    const blocks = within(root, 'pre code').filter(
      (node) =>
        !node.closest('.wp-block-mbb-math,.wp-block-mbb-code-compare,[contenteditable]') &&
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
          Prism.hooks.add('complete', ({ element }) => {
            if (!element.closest('.wp-block-mbb-code-tabs')) return;
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
        block.closest('.wp-block-mbb-code-tabs') &&
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
      if (config.lineNumbers) block.parentElement.classList.add('line-numbers');
      Prism.highlightElement(block);
      for (const numbers of block.querySelectorAll('.line-numbers-rows'))
        numbers.dataset.mbbGenerated = '';
      highlighted.set(block, codeSignature(block));
    }
  };
  const scan = (root) => {
    if (!root.isConnected) return;
    highlight(root).catch(() => {});
    if (config.teachingScript && within(root, '[data-mbb-teaching]').length) {
      load(config.teachingStyle, true).catch(() => {});
      load(config.teachingScript).catch(() => {});
      if (config.componentScript) load(config.componentScript).catch(() => {});
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
