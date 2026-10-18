(() => {
  'use strict';
  const T = (s) => globalThis.MBBI18n?.t(s) ?? s;
  const idPattern = /^(?:0|[1-9][0-9]{0,6})$/;
  function semanticTree(root) {
    const container = root.querySelector('mjx-container[jax="CHTML"]');
    if (!container) throw Error(T('Semantic exploration is unavailable for this formula.'));
    const all = [...container.querySelectorAll('[data-semantic-id]')];
    if (!all.length || all.length > 2048)
      throw Error(T('The semantic tree is missing or exceeds the exploration budget.'));
    const nodes = new Map();
    for (const [position, element] of all.entries()) {
      const id = element.getAttribute('data-semantic-id');
      if (!idPattern.test(id) || nodes.has(id))
        throw Error(T('The semantic tree contains an ambiguous identity.'));
      const list = (name) => {
        const value = element.getAttribute(name);
        if (!value) return [];
        const values = value.split(',');
        if (
          values.length > 128 ||
          values.some((v) => !idPattern.test(v)) ||
          new Set(values).size !== values.length
        )
          throw Error(T('The semantic tree contains an invalid relationship.'));
        return values;
      };
      const english = element.getAttribute('data-semantic-speech-none') || '';
      if (english.length > 16384) throw Error(T('The semantic reading exceeds its budget.'));
      nodes.set(id, {
        id,
        element,
        position,
        english,
        type: element.getAttribute('data-semantic-type') || '',
        role: element.getAttribute('data-semantic-role') || '',
        latex: element.getAttribute('data-latex') || '',
        children: list('data-semantic-children'),
        content: list('data-semantic-content'),
        parent: element.getAttribute('data-semantic-parent'),
      });
    }
    let speechBytes = 0;
    for (const node of nodes.values()) {
      speechBytes += new TextEncoder().encode(node.english).length;
      for (const child of [...node.children, ...node.content]) {
        if (!nodes.has(child) || child === node.id)
          throw Error(T('The semantic tree contains an invalid relationship.'));
      }
      if (node.parent && !nodes.has(node.parent))
        throw Error(T('The semantic tree contains an invalid relationship.'));
      node.navigation = [...new Set([...node.children, ...node.content])]
        .filter((id) => nodes.get(id).parent === node.id)
        .sort((a, b) => nodes.get(a).position - nodes.get(b).position);
      for (const id of node.children)
        if (nodes.get(id).parent !== node.id)
          throw Error(T('The semantic tree contains an invalid relationship.'));
      for (const id of node.content) {
        let at = nodes.get(id),
          depth = 0;
        while (at && at.parent !== node.id && depth++ < 64) at = nodes.get(at.parent);
        if (!at || at.parent !== node.id)
          throw Error(T('The semantic tree contains an invalid relationship.'));
      }
      for (const child of node.navigation)
        if (nodes.get(child).parent !== node.id)
          throw Error(T('The semantic tree contains an invalid relationship.'));
    }
    if (speechBytes > 524288) throw Error(T('The semantic reading exceeds its budget.'));
    const roots = [...nodes.values()].filter((n) => !n.parent);
    if (roots.length !== 1) throw Error(T('The semantic tree contains an ambiguous identity.'));
    const seen = new Set();
    const visit = (id, depth = 0) => {
      if (depth > 64 || seen.has(id)) throw Error(T('The semantic tree exceeds its depth budget.'));
      seen.add(id);
      for (const child of nodes.get(id).navigation) visit(child, depth + 1);
    };
    visit(roots[0].id);
    if (seen.size !== nodes.size)
      throw Error(T('The semantic tree contains an invalid relationship.'));
    return { root: roots[0].id, nodes };
  }
  const symbols = new Map(
    Object.entries({
      '+': '加',
      '-': '减',
      '−': '减',
      '=': '等于',
      '<': '小于',
      '>': '大于',
      '≤': '小于或等于',
      '≥': '大于或等于',
      '≠': '不等于',
      '×': '乘以',
      '⋅': '乘以',
      '·': '乘以',
      '⁢': '乘以',
      '/': '除以',
      '÷': '除以',
      '±': '加或减',
      ',': '逗号',
      ';': '分号',
      '∞': '无穷',
      '∑': '求和',
      '∏': '连乘',
      '∫': '积分',
      '∂': '偏微分',
      '∈': '属于',
      '∉': '不属于',
      '∪': '并集',
      '∩': '交集',
      '→': '右箭头',
      '⇒': '推出',
      '↔': '当且仅当',
      '!': '阶乘',
      '|': '竖线',
      '(': '左圆括号',
      ')': '右圆括号',
      '[': '左方括号',
      ']': '右方括号',
    }),
  );
  const commands = new Map(
    Object.entries({
      infty: '无穷',
      times: '乘以',
      cdot: '乘以',
      le: '小于或等于',
      leq: '小于或等于',
      ge: '大于或等于',
      geq: '大于或等于',
      ne: '不等于',
      neq: '不等于',
      to: '右箭头',
      rightarrow: '右箭头',
      leftarrow: '左箭头',
      Rightarrow: '双右箭头',
      Leftrightarrow: '双向箭头',
      pm: '加或减',
      in: '属于',
      notin: '不属于',
      cup: '并集',
      cap: '交集',
    }),
  );
  const names = new Map(
    Object.entries({
      alpha: '阿尔法',
      beta: '贝塔',
      gamma: '伽马',
      delta: '德尔塔',
      epsilon: '艾普西龙',
      theta: '西塔',
      lambda: '兰姆达',
      mu: '缪',
      pi: '派',
      sigma: '西格玛',
      phi: '斐',
      omega: '欧米伽',
      sin: '正弦',
      cos: '余弦',
      tan: '正切',
      log: '对数',
      ln: '自然对数',
      exp: '指数函数',
      max: '最大值',
      min: '最小值',
      lim: '极限',
    }),
  );
  function chineseReading(tree, id = tree.root) {
    let budget = 0;
    const walk = (key, depth = 0) => {
      if (++budget > 4096 || depth > 64) throw Error('unsupported');
      const n = tree.nodes.get(key),
        a = n.children.map((c) => walk(c, depth + 1));
      const op = () => n.content.map((c) => walk(c, depth + 1));
      switch (n.type) {
        case 'number':
          if (/^[0-9]+(?:[.,][0-9]+)*$/.test(n.english)) return n.english;
          break;
        case 'identifier':
        case 'function': {
          if (symbols.has(n.english)) return symbols.get(n.english);
          const text = n.latex.replace(/^\\/, '');
          if (names.has(text)) return names.get(text);
          if (commands.has(text)) return commands.get(text);
          if (n.latex.startsWith('\\')) break;
          if (/^[\p{L}\p{N}]+$/u.test(text) && text.length <= 120) return text;
          if (/^[A-Za-z\p{Script=Greek}]+$/u.test(n.english) && n.english.length <= 120)
            return n.english;
          break;
        }
        case 'operator':
        case 'relation':
        case 'punctuation':
        case 'fence':
          if (symbols.has(n.english)) return symbols.get(n.english);
          if (symbols.has(n.latex)) return symbols.get(n.latex);
          if (commands.has(n.latex.replace(/^\\/, '')))
            return commands.get(n.latex.replace(/^\\/, ''));
          break;
        case 'fraction':
          if (a.length === 2) return '分数开始；分子 ' + a[0] + '；分母 ' + a[1] + '；分数结束';
          break;
        case 'superscript':
          if (a.length === 2)
            return tree.nodes.get(n.children[1]).type === 'number' &&
              /\b(?:squared|cubed|power)\b/i.test(n.english)
              ? a[0] + ' 的 ' + a[1] + ' 次方'
              : a[0] + '，上标 ' + a[1] + '，上标结束';
          break;
        case 'subscript':
          if (a.length === 2) return a[0] + '，下标 ' + a[1] + '，下标结束';
          break;
        case 'subsup':
          if (a.length === 3) return a[0] + '，下标 ' + a[1] + '，上标 ' + a[2];
          break;
        case 'sqrt':
          if (a.length === 1) return '根号开始 ' + a[0] + ' 根号结束';
          break;
        case 'root':
          if (a.length === 2) return a[0] + ' 次根号开始 ' + a[1] + ' 根号结束';
          break;
        case 'infixop':
        case 'relseq': {
          const operators = op();
          if (a.length < 2 || !operators.length || ![1, a.length - 1].includes(operators.length))
            break;
          return a
            .map((v, i) => (i ? operators[Math.min(i - 1, operators.length - 1)] + ' ' + v : v))
            .join(' ');
        }
        case 'prefixop':
          if (a.length === 1)
            return (
              (n.role === 'negative' ? '负' : n.role === 'positive' ? '正' : op().join(' ')) +
              ' ' +
              a[0]
            );
          break;
        case 'postfixop':
          if (a.length === 1) return a[0] + ' ' + op().join(' ');
          break;
        case 'appl':
          if (a.length === 2) return a[0] + '，参数 ' + a[1] + '，参数结束';
          break;
        case 'fenced':
          if (a.length === 1) {
            const fences = op();
            if (fences.length === 2) return fences[0] + ' ' + a[0] + ' ' + fences[1];
          }
          break;
        case 'matrix':
          if (!/\bmatrix\b/i.test(n.english) || /\bdeterminant\b/i.test(n.english)) break;
          if (a.length && a.length <= 16)
            return (
              '矩阵开始；' + a.map((v, i) => '第 ' + (i + 1) + ' 行 ' + v).join('；') + '；矩阵结束'
            );
          break;
        case 'row':
        case 'line':
          if (a.length && a.length <= 16) return a.join('，');
          break;
        case 'cell':
          if (a.length === 1) return a[0];
          break;
      }
      throw Error('unsupported');
    };
    try {
      const text = walk(id);
      return text.length <= 16384 ? text : null;
    } catch {
      return null;
    }
  }
  function create(renderRoot) {
    const element = document.createElement('details');
    element.className = 'mbb-math-explorer';
    const summary = document.createElement('summary');
    summary.textContent = T('Structured reading and exploration');
    const label = document.createElement('label');
    label.textContent = T('Reading language');
    const language = document.createElement('select');
    language.setAttribute('aria-label', T('Reading language'));
    for (const [value, text] of [
      ['zh_CN', '中文结构读法'],
      ['en_US', 'English semantics'],
    ]) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      language.append(o);
    }
    language.value = globalThis.MBB_UI_LOCALE === 'zh_CN' ? 'zh_CN' : 'en_US';
    label.append(language);
    const notice = document.createElement('p');
    notice.className = 'mbb-math-explorer-notice';
    const help = document.createElement('p');
    help.id = 'mbb-math-explorer-help';
    help.textContent = T(
      'Down enters a term; Left and Right move between terms; Up returns; Home reads the whole formula; Escape leaves exploration.',
    );
    const region = document.createElement('div');
    region.className = 'mbb-math-explorer-reading';
    region.tabIndex = 0;
    region.setAttribute('role', 'group');
    region.setAttribute('aria-describedby', help.id);
    const reading = document.createElement('span');
    reading.setAttribute('aria-live', 'polite');
    reading.setAttribute('aria-atomic', 'true');
    region.append(reading);
    const toolbar = document.createElement('div');
    toolbar.className = 'mbb-math-explorer-toolbar';
    let tree = null,
      current = null,
      highlight = null,
      fallbackEnglish = '';
    const buttons = {};
    const destination = (action) => {
      if (!tree || !current) return null;
      const n = tree.nodes.get(current),
        siblings = n.parent ? tree.nodes.get(n.parent).navigation : [tree.root],
        at = siblings.indexOf(current);
      return action === 'parent'
        ? n.parent
        : action === 'child'
          ? n.navigation[0]
          : action === 'previous'
            ? siblings[at - 1]
            : action === 'next'
              ? siblings[at + 1]
              : tree.root;
    };
    const update = () => {
      highlight?.classList.remove('mbb-math-explorer-current');
      highlight = null;
      if (!tree) {
        reading.textContent =
          fallbackEnglish || T('Semantic exploration is unavailable for this formula.');
        reading.lang = fallbackEnglish
          ? 'en'
          : globalThis.MBB_UI_LOCALE?.replace('_', '-') || document.documentElement.lang || 'en';
        notice.textContent = fallbackEnglish
          ? T(
              'The original English reading is available, but this expression cannot be explored structurally.',
            )
          : '';
        for (const b of Object.values(buttons)) b.disabled = true;
        return;
      }
      const n = tree.nodes.get(current),
        zh = language.value === 'zh_CN' ? chineseReading(tree, current) : null;
      reading.textContent = zh || n.english || T('No reading is available for this term.');
      reading.lang = zh
        ? 'zh-CN'
        : n.english
          ? 'en'
          : globalThis.MBB_UI_LOCALE?.replace('_', '-') || document.documentElement.lang || 'en';
      notice.textContent =
        language.value === 'zh_CN' && !zh
          ? T(
              'This structure has no Chinese reading yet. The original English semantics are shown.',
            )
          : language.value === 'zh_CN'
            ? T('Chinese structural reading covers a limited set of mathematical structures.')
            : '';
      region.setAttribute('aria-label', T('Selected mathematical expression'));
      highlight = n.element;
      highlight.classList.add('mbb-math-explorer-current');
      for (const [action, b] of Object.entries(buttons))
        b.disabled = action === 'focus' ? false : !destination(action);
    };
    const move = (action) => {
      const target = destination(action);
      if (target) {
        current = target;
        update();
      }
    };
    for (const [action, text] of [
      ['root', 'Whole formula'],
      ['parent', 'Parent term'],
      ['previous', 'Previous term'],
      ['next', 'Next term'],
      ['child', 'Enter term'],
      ['focus', 'Explore with keyboard'],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = T(text);
      b.dataset.mbbExplore = action;
      b.onclick = () => {
        if (action === 'focus') region.focus();
        else move(action);
      };
      buttons[action] = b;
      toolbar.append(b);
    }
    region.addEventListener('keydown', (event) => {
      const action = {
        ArrowDown: 'child',
        ArrowUp: 'parent',
        ArrowLeft: 'previous',
        ArrowRight: 'next',
        Home: 'root',
      }[event.key];
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        move(action);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        buttons.focus.focus();
      }
    });
    language.onchange = update;
    element.append(summary, label, notice, help, region, toolbar);
    return {
      element,
      load() {
        const fallback =
          renderRoot
            .querySelector('mjx-container[jax="CHTML"]')
            ?.getAttribute('data-semantic-speech-none') || '';
        fallbackEnglish = fallback.length <= 16384 ? fallback : '';
        highlight?.classList.remove('mbb-math-explorer-current');
        highlight = null;
        try {
          tree = semanticTree(renderRoot);
          current = tree.root;
        } catch {
          tree = null;
          current = null;
        }
        update();
      },
      clear() {
        highlight?.classList.remove('mbb-math-explorer-current');
        highlight = null;
        tree = null;
        current = null;
        fallbackEnglish = '';
        element.open = false;
      },
    };
  }
  globalThis.MBBMathExplorer = { semanticTree, chineseReading, create };
})();
