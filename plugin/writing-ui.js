(() => {
  'use strict';
  const T = (s) => globalThis.MBBI18n?.t(s) ?? s;
  const el = (tag, text = '') => {
    const n = document.createElement(tag);
    n.textContent = text;
    return n;
  };
  const button = (text, action) => {
    const n = el('button', T(text));
    n.type = 'button';
    n.onclick = action;
    return n;
  };
  const categories = [
    ['all', 'All content'],
    ['math', 'Equations'],
    ['figure', 'Figures'],
    ['table', 'Tables'],
    ['statement', 'Statements'],
    ['bibliography', 'Bibliography'],
    ['teaching', 'Teaching structures'],
    ['activity', 'Course workbench'],
  ];
  function create(adapter) {
    const panel = el('details');
    panel.className = 'mbb-writing-tools';
    panel.append(el('summary', T('Content navigation and checks')));
    const label = el('label', T('Content type')),
      filter = el('select');
    for (const [value, text] of categories) {
      const option = el('option', T(text));
      option.value = value;
      filter.append(option);
    }
    label.append(filter);
    const items = el('div'),
      status = el('p');
    status.setAttribute('role', 'status');
    const renameLabel = el('label', T('Current stable label')),
      from = el('input');
    from.maxLength = 64;
    renameLabel.append(from);
    const toLabel = el('label', T('Proposed stable ID')),
      to = el('input');
    to.maxLength = 64;
    toLabel.append(to);
    const renameGroup = el('details');
    renameGroup.className = 'mbb-writing-rename';
    renameGroup.append(el('summary', T('Rename label or reference key')));
    let checked = null,
      renameType = 'label';
    const apply = button('Rename label and references', () => {
      if (!checked || adapter.stamp() !== checked.stamp) {
        checked = null;
        apply.hidden = true;
        status.textContent = T('Content changed. Check the rename again.');
        return;
      }
      try {
        const plan = window.MBB.technicalRenamePlan(
          adapter.blocks(),
          renameType,
          from.value,
          to.value,
          (c, m) => {
            throw Error(T(m));
          },
        );
        adapter.rename(plan);
        checked = null;
        apply.hidden = true;
        refresh();
      } catch (error) {
        status.textContent = error.message;
      }
    });
    apply.hidden = true;
    const preflight = button('Check label rename', async () => {
      try {
        const plan = window.MBB.technicalRenamePlan(
          adapter.blocks(),
          renameType,
          from.value,
          to.value,
          (c, m) => {
            throw Error(T(m));
          },
        );
        checked = { stamp: adapter.stamp() };
        apply.hidden = false;
        status.textContent =
          String(plan.affectedReferences) +
          ' · ' +
          T('Reference markers affected; no changes have been applied.');
        if (
          window.MBBReferences?.impact &&
          adapter.blocks().some((b) => b.name === 'mbb/identity')
        ) {
          apply.hidden = true;
          const stamp = checked.stamp,
            report = await window.MBBReferences.impact(adapter, plan);
          if (!checked || checked.stamp !== stamp || adapter.stamp() !== stamp) return;
          const titles = report.changes.flatMap((c) =>
            (c.incoming.items || []).map((i) => i.title),
          );
          status.textContent +=
            ' ' +
            T(
              'Only currently readable incoming references are shown. Other articles are not changed.',
            ) +
            (titles.length ? ' ' + titles.join(' · ') : '');
          apply.hidden = false;
        }
      } catch (error) {
        checked = null;
        apply.hidden = true;
        status.textContent = error.message;
      }
    });
    function refresh(check = false) {
      items.replaceChildren();
      checked = null;
      apply.hidden = true;
      try {
        const blocks = adapter.blocks(),
          index = window.MBB.writingIndex(blocks);
        renameGroup.hidden = !index.some((item) => item.renameType);
        preflight.disabled = renameGroup.hidden;
        for (const item of index.filter(
          (i) =>
            filter.value === 'all' ||
            (filter.value === 'activity' &&
              ['mbb/steps', 'mbb/step', 'mbb/component'].includes(i.name)) ||
            i.category === filter.value ||
            (filter.value === 'statement' &&
              ['definition', 'theorem', 'proof'].includes(i.category)) ||
            (filter.value === 'math' && i.category === 'equation'),
        )) {
          const row = el('div');
          row.className = 'mbb-writing-row';
          const locate = button((item.title || item.id || item.category).slice(0, 100), () =>
            adapter.select(item),
          );
          locate.title = item.id || item.title || item.category;
          row.append(locate);
          if (item.name === 'mbb/component') {
            row.append(el('small', item.component + ' ' + item.componentVersion));
            if (item.activity) {
              const relations = el('details');
              relations.className = 'mbb-activity-relations';
              relations.append(el('summary', T('Static activity relations')));
              const roles = [
                [T('Question'), item.activity.prompt],
                ...(item.activity.options || []).map((o) => [T('Option') + ' ' + o.key, o.target]),
                ...(item.activity.hints || []).map((id, n) => [T('Hint') + ' ' + (n + 1), id]),
                [T('Correct feedback'), item.activity.feedback?.correct],
                [T('Incorrect feedback'), item.activity.feedback?.incorrect],
                [T('Full explanation'), item.activity.explanation],
              ];
              for (const [role, id] of roles) {
                const part = item.parts?.find((p) => p.id === id);
                relations.append(
                  button(role + ': ' + (part?.title || id || T('Unavailable')), () => {
                    if (part) adapter.select(part);
                  }),
                );
              }
              row.append(relations);
            }
            if (item.activity)
              row.append(
                button('Copy as a new activity', () => {
                  try {
                    adapter.insert(window.MBB.copyActivity(adapter.blocks(), item.clientId), item);
                    refresh();
                  } catch (error) {
                    status.textContent = error.message;
                  }
                }),
              );
          }
          if (item.id && item.title) {
            const label = el('small', item.id);
            label.title = item.id;
            row.append(label);
          }
          if (item.id && item.renameType)
            row.append(
              button('Use label for rename', () => {
                renameGroup.open = true;
                renameType = item.renameType;
                from.value = item.id;
                to.value = item.id;
                apply.hidden = true;
              }),
            );
          items.append(row);
        }
        if (!index.length) items.append(el('p', T('No indexed objects in the current content.')));
        if (check) {
          const diagnostics = window.MBB.technicalDiagnostics(blocks),
            advice = window.MBB.writingAdvice(blocks);
          for (const issue of diagnostics.issues) {
            const item =
              index.find((i) => i.id === issue.identity) ||
              (issue.clientId ? { clientId: issue.clientId } : null);
            const row = el(
              'p',
              T('Must fix before saving: ') +
                (
                  {
                    'duplicate-id': T('Duplicate stable label: %1$s'),
                    'duplicate-key': T('Duplicate bibliography key: %1$s'),
                    'missing-target': T('Missing reference target: %1$s'),
                    'missing-key': T('Missing bibliography entry: %1$s'),
                    'reference-marker': T(
                      'A reference marker is malformed. Correct it before saving.',
                    ),
                    'object-body': T(
                      'Object %1$s must contain exactly one matching formula, image, table or code block. The existing body has been preserved.',
                    ),
                    'statement-body': T('Statement %1$s requires body content.'),
                  }[issue.code] || T('Technical block %1$s has incomplete or invalid fields.')
                ).replace('%1$s', issue.identity || ''),
            );
            if (item) row.append(button('Locate source object', () => adapter.select(item)));
            items.append(row);
          }
          for (const issue of advice) {
            const row = el(
              'p',
              (issue.severity === 'error'
                ? T('Must fix before saving: ')
                : T('Reading suggestion: ')) + issue.message,
            );
            row.append(
              button('Locate source object', () => adapter.select({ clientId: issue.clientId })),
            );
            items.append(row);
          }
          if (
            window.MarkBridgeParameterDrafts?.pending() ||
            window.MarkBridgeAdapterDrafts?.pending()
          )
            items.append(
              el(
                'p',
                T('Must fix before saving: ') +
                  T(
                    'Parameters have not been applied. Apply or discard the parameter input before saving.',
                  ),
              ),
            );
          window.MBB.toMarkdown(blocks, { origin: 'markdown_import' });
          status.textContent = T(
            'Browser structure check completed. Reading suggestions may be ignored; the server validates again when saving.',
          );
        }
      } catch (error) {
        status.textContent =
          T('Must fix before saving: ') + (globalThis.MBBI18n?.error(error) || error.message);
      }
    }
    filter.onchange = () => refresh();
    panel.ontoggle = () => {
      if (panel.open) refresh();
    };
    const patterns = el('select');
    patterns.setAttribute('aria-label', T('Writing pattern'));
    for (const p of window.MBB.writingPatterns) {
      const o = el('option', T(p.title));
      o.value = p.id;
      patterns.append(o);
    }
    const insert = button('Insert writing pattern', () => {
      const pattern = window.MBB.writingPatterns.find((p) => p.id === patterns.value);
      if (pattern) adapter.insert(window.MBB.instantiateWritingPattern(pattern.id));
    });
    renameGroup.append(renameLabel, toLabel, preflight, apply);
    panel.append(
      label,
      button('Refresh content navigation', () => refresh()),
      button('Check current content', () => refresh(true)),
      items,
      renameGroup,
      status,
      patterns,
      insert,
    );
    const activities = el('select');
    activities.setAttribute('aria-label', T('Activity template'));
    const updateActivities = () => {
      activities.replaceChildren();
      for (const a of globalThis.MarkBridgeComponentAuthors?.templates?.() || []) {
        const p = (window.MBBComponents || []).find(
          (p) =>
            p.id === a.component && p.version === a.componentVersion && p.activityVersion === 1,
        );
        if (!p) continue;
        const option = el('option', p.title);
        option.value = a.component + '@' + a.componentVersion;
        activities.append(option);
      }
      insertActivity.disabled = !activities.options.length;
      activityEmpty.hidden = !!activities.options.length;
    };
    const activityEmpty = el(
      'p',
      T(
        'No compatible self-check templates are registered. Existing static content remains readable.',
      ),
    );
    const insertActivity = button('Insert activity', () => {
      try {
        const [id, version] = activities.value.split('@');
        adapter.insert(window.MBB.createActivity(id, version));
        refresh();
      } catch (error) {
        status.textContent = error.message;
      }
    });
    insertActivity.disabled = true;
    const activityGroup = el('details');
    activityGroup.className = 'mbb-activity-insert';
    activityGroup.append(
      el('summary', T('Insert self-check')),
      activities,
      insertActivity,
      activityEmpty,
    );
    activityGroup.ontoggle = () => {
      if (activityGroup.open) updateActivities();
    };
    panel.append(activityGroup);
    if (window.MBBReferences) panel.append(window.MBBReferences.create(adapter));
    return panel;
  }
  function native() {
    const store = () => wp.data.select('core/block-editor');
    let insertionTarget = store().getSelectedBlockClientId?.();
    const panel = create({
      context: () => ({
        post_id: Number(window.MBB_EDITOR.postId),
        expected: window.MBB_EDITOR.state?.expected,
        source_sha256: window.MBB_EDITOR.state?.source_sha256 || null,
      }),
      blocks: () => store().getBlocks(),
      stamp: () => store().getBlocks(),
      select(item) {
        if (!item.clientId && item.path) {
          let list = store().getBlocks(),
            found;
          for (const i of item.path) {
            found = list[i];
            list = found?.innerBlocks || [];
          }
          item = { ...item, clientId: found?.clientId };
        }
        if (!item.clientId) return;
        wp.data.dispatch('core/block-editor').selectBlock(item.clientId);
        requestAnimationFrame(() => {
          const documents = [document];
          for (const frame of document.querySelectorAll('iframe[name="editor-canvas"]')) {
            try {
              if (frame.contentDocument) documents.unshift(frame.contentDocument);
            } catch {}
          }
          const selector = '[data-block="' + CSS.escape(item.clientId) + '"]';
          const target = documents.map((doc) => doc.querySelector(selector)).find(Boolean);
          for (let ancestor = target?.parentElement; ancestor; ancestor = ancestor.parentElement) {
            if (ancestor.tagName === 'DETAILS') ancestor.open = true;
          }
          target?.scrollIntoView({ block: 'center' });
        });
      },
      rename(plan) {
        wp.data.dispatch('core/block-editor').updateBlockAttributes(
          plan.patches.map((p) => p.clientId),
          Object.fromEntries(plan.patches.map((p) => [p.clientId, p.attributes])),
          true,
        );
      },
      insert(source, target) {
        const blocks = typeof source === 'string' ? MBB.toBlocks(source) : source.blocks,
          selected = target?.clientId || store().getSelectedBlockClientId() || insertionTarget;
        const dispatch = wp.data.dispatch('core/block-editor'),
          block = selected && store().getBlock(selected);
        const content = block?.attributes.content,
          empty =
            content === '' ||
            (wp.richText.RichTextData &&
              content instanceof wp.richText.RichTextData &&
              content.toString() === '');
        if (block?.name === 'core/paragraph' && empty) dispatch.replaceBlocks(selected, blocks);
        else
          dispatch.insertBlocks(
            blocks,
            selected ? store().getBlockIndex(selected) + 1 : undefined,
            selected ? store().getBlockRootClientId(selected) : undefined,
          );
      },
    });
    // Retain the insertion point while focusing this panel's controls. Resolve it again before use.
    panel.addEventListener(
      'pointerdown',
      () => {
        insertionTarget = store().getSelectedBlockClientId() || insertionTarget;
      },
      true,
    );
    return panel;
  }
  // Only an empty paragraph is eligible; all ordinary prose, rich HTML and partial fragments use core paste.
  function installPaste() {
    const onPaste = (event) => {
      const target = event.target;
      if (
        !target?.closest?.('[contenteditable="true"]') ||
        !event.clipboardData ||
        event.clipboardData.getData('text/html')
      )
        return;
      const text = event.clipboardData.getData('text/plain'),
        snippet = window.MBB?.markdownSnippet(text);
      if (!snippet) return;
      const store = wp.data.select('core/block-editor'),
        block =
          store?.getBlock?.(target.closest('[data-block]')?.dataset.block) ||
          store?.getSelectedBlock?.();
      if (
        !block ||
        block.name !== 'core/paragraph' ||
        String(block.attributes.content || '').trim()
      )
        return;
      let blocks;
      try {
        blocks = MBB.toBlocks(text);
        MBB.toMarkdown(blocks, { origin: 'markdown_import' });
      } catch {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const dialog = el('dialog');
      dialog.className = 'mbb-paste-preview';
      dialog.setAttribute('aria-label', T('Markdown paste preview'));
      const heading = el('h2', T('Markdown paste preview')),
        raw = el('pre', text),
        preview = el('div');
      // The parser has already checked its closed HTML allowlist. Never execute pasted scripts.
      const template = document.createElement('template');
      template.innerHTML = wp.blocks.serialize(blocks);
      for (const n of template.content.querySelectorAll('script,iframe,object,embed')) n.remove();
      preview.append(template.content);
      const sourceGroup = el('section'),
        resultGroup = el('section'),
        actions = el('div');
      sourceGroup.className = 'mbb-paste-source';
      resultGroup.className = 'mbb-paste-result';
      actions.className = 'mbb-paste-actions';
      sourceGroup.append(el('h3', T('Pasted source')), raw);
      resultGroup.append(el('h3', T('Recognized result')), preview);
      const finish = (next) => {
        if (store.getBlock(block.clientId) !== block) {
          dialog.close();
          return;
        }
        wp.data.dispatch('core/block-editor').replaceBlocks(block.clientId, next);
        dialog.close();
      };
      actions.append(
        button('Insert recognized Markdown', () => finish(blocks)),
        button('Keep as plain text', () => {
          const escaped = text
            .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
            .replace(/\r\n?|\n/g, '<br>');
          finish([wp.blocks.createBlock('core/paragraph', { content: escaped })]);
        }),
        button('Cancel', () => dialog.close()),
      );
      actions.querySelector('button').classList.add('mbb-primary');
      dialog.append(heading, sourceGroup, resultGroup, actions);
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      document.body.append(dialog);
      dialog.showModal();
      if (snippet.kind === 'math') {
        const style = el('style');
        style.textContent = window.MBB_MATH?.style || '';
        dialog.prepend(style);
        const failure = () => {
          if (dialog.isConnected)
            resultGroup.append(
              el('p', T('Formula preview is unavailable. The original TeX is preserved.')),
            );
        };
        if (window.MBB_MATH?.typeset)
          window.MBB_MATH.typeset(preview)
            .then(() => {
              if (preview.querySelector('[data-mbb-math-error]')) failure();
            })
            .catch(failure);
        else failure();
      }
    };
    const attached = new WeakSet();
    const attach = (doc) => {
      if (!doc || attached.has(doc)) return;
      attached.add(doc);
      doc.addEventListener('paste', onPaste, true);
    };
    const scan = () => {
      attach(document);
      for (const frame of document.querySelectorAll('iframe[name="editor-canvas"]')) {
        try {
          attach(frame.contentDocument);
        } catch {}
        if (!frame.dataset.mbbPasteBound) {
          frame.dataset.mbbPasteBound = '1';
          frame.addEventListener('load', scan);
        }
      }
    };
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }
  window.MBBWritingTools = { create, native };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', installPaste);
  else installPaste();
})();
