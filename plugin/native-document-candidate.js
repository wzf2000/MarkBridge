/** Ephemeral provenance for one SDK adoption; never a public source store. */
const MBBCreateNativeDocumentCandidate = ({
  view,
  parse,
  serialize,
  apply,
  encode,
  now = Date.now,
}) => {
  let pending = null,
    applying = false;
  const T = (s) => globalThis.MBBI18n?.t(s) ?? s;
  const error = (message, code = 'document_native_candidate', status = 409) =>
    Object.assign(Error(T(message)), { code, status });
  const ids = (blocks) => blocks.flatMap((b) => [b.clientId, ...ids(b.innerBlocks || [])]);
  const snapshot = (blocks) => ({
    ids: JSON.stringify(ids(blocks)),
    serialized: serialize(blocks),
  });
  const matches = (a, b) => a.ids === b.ids && a.serialized === b.serialized;
  const nativeState = (current) => {
    if (
      current.mode !== 'visual' ||
      !Array.isArray(current.blocks) ||
      !Array.isArray(current.entityBlocks) ||
      typeof current.content !== 'string'
    )
      return null;
    const body = snapshot(current.blocks),
      entity = snapshot(current.entityBlocks),
      bodyIds = JSON.parse(body.ids),
      entityIds = JSON.parse(entity.ids);
    if (
      ![bodyIds, entityIds].every(
        (values) =>
          values.every((id) => typeof id === 'string' && id.length > 0) &&
          new Set(values).size === values.length,
      )
    )
      return null;
    return current.content === entity.serialized ? { body, entity } : null;
  };
  const clear = () => {
    pending = null;
  };
  function phase() {
    if (!pending) return null;
    const current = view();
    if (current.postId !== pending.postId) {
      clear();
      return null;
    }
    if (pending.history) {
      // Core-data moves before block-editor during Redo. Either store retaining
      // never-saved B IDs must keep its history tombstone effective.
      const currentIds = [
        ...ids(current.blocks || []),
        ...ids(Array.isArray(current.entityBlocks) ? current.entityBlocks : []),
      ];
      return currentIds.some((id) => pending.abandonedIds.has(id)) ? 'blocked' : 'ordinary';
    }
    if (current.expected !== pending.expected) {
      pending.invalid = true;
      return 'blocked';
    }
    const state = nativeState(current);
    if (!state) {
      pending.invalid = true;
      return 'blocked';
    }
    const { body, entity } = state,
      bodyBefore = matches(body, pending.before),
      entityBefore = matches(entity, pending.before),
      bodyAfter = matches(body, pending.after),
      entityAfter = matches(entity, pending.after);
    if (pending.invalid) return bodyBefore && entityBefore ? 'original' : 'blocked';
    if (bodyAfter && entityAfter) return 'candidate';
    if (bodyBefore && entityBefore) return 'original';
    // Gutenberg restores core-data before React updates block-editor. Only the
    // two registered byte/recursive-ID endpoints can be temporarily out of step.
    // A code buffer has no entity blocks and cannot impersonate this transition.
    if ((bodyBefore && entityAfter) || (bodyAfter && entityBefore)) return 'transition';
    // Drop authorization permanently, but retain a tombstone: ordinary Save must not
    // silently normalize an adopted source after an unreviewed body edit.
    pending.invalid = true;
    return 'blocked';
  }
  function prepare(document) {
    const current = view(),
      state = nativeState(current);
    if (!state || !matches(state.body, state.entity))
      throw error(
        'The native editor did not retain the complete candidate. Current input is preserved; use Markdown edit / upload to preview it again.',
      );
    const blocks = parse(document.serialized);
    const before = state.body,
      after = snapshot(blocks);
    if (before.serialized === after.serialized)
      throw error(
        'This change only affects source bytes. Open Markdown edit / upload to preview and apply it with source Undo and save.',
        'document_source_only',
        422,
      );
    return { current, blocks, before, after };
  }
  return {
    validate: prepare,
    changed() {
      if (!applying) phase();
    },
    clear,
    saved(expected, attached) {
      if (!pending) return;
      if (attached) {
        clear();
        return;
      }
      // Saving A after Undo does not prove B was saved or its Redo history vanished.
      // Retain IDs only: no source, serialized body, receipt or authorization survives.
      if (pending.history) {
        pending.expected = expected;
        return;
      }
      pending = {
        history: true,
        postId: pending.postId,
        expected,
        abandonedIds: new Set(JSON.parse(pending.after.ids)),
      };
    },
    adopt(document, opening) {
      const plan = prepare(document);
      if (
        plan.current.postId !== opening.context.post_id ||
        plan.current.expected !== opening.context.expected
      )
        throw error(
          'The applied document candidate expired or its baseline changed. Your input is preserved. Undo it and prepare the candidate again before saving.',
        );
      pending = {
        postId: plan.current.postId,
        expected: plan.current.expected,
        source: document.source,
        serialized: document.serialized,
        receipt: opening.receipt,
        expires: opening.expires,
        before: plan.before,
        after: plan.after,
      };
      applying = true;
      try {
        apply(plan.blocks);
      } catch (failure) {
        pending.invalid = true;
        throw failure;
      } finally {
        applying = false;
      }
      const retained = view(),
        actual = snapshot(retained.blocks);
      if (
        retained.postId !== pending.postId ||
        retained.expected !== pending.expected ||
        actual.serialized !== plan.after.serialized
      ) {
        pending.invalid = true;
      } else {
        // Gutenberg may create an empty placeholder block. Bind the IDs actually
        // produced by this synchronous adoption, never a later equal-text lookup.
        pending.after = actual;
      }
      if (phase() !== 'candidate')
        throw error(
          'The native editor did not retain the complete candidate. Current input is preserved; use Markdown edit / upload to preview it again.',
        );
    },
    request(data) {
      const state = phase();
      if (state === 'blocked')
        throw error(
          'The adopted candidate was edited before saving or its baseline changed. Your input is preserved. Copy your current edits for safekeeping, then undo back to the saved original, reopen the tool, and prepare and save the candidate before editing its body.',
        );
      if (state === 'transition')
        throw error(
          'The native editor is synchronizing Undo or Redo. Your input is preserved. Wait for the editor to finish, then save again.',
          'document_native_transition',
        );
      if (state !== 'candidate') {
        if (state === 'original' && data.content !== undefined) {
          const content = typeof data.content === 'string' ? data.content : data.content?.raw;
          if (content !== pending.before.serialized)
            throw error(
              'Save the adopted document with the normal editor Save / Update action. Its exact source has not been saved.',
            );
        }
        return {};
      }
      if (now() >= pending.expires)
        throw error(
          'The applied document candidate expired or its baseline changed. Your input is preserved. Undo it and prepare the candidate again before saving.',
        );
      const content = typeof data.content === 'string' ? data.content : data.content?.raw;
      if (content !== pending.after.serialized)
        throw error(
          'Save the adopted document with the normal editor Save / Update action. Its exact source has not been saved.',
        );
      return {
        mbb_document_candidate: {
          schema: 1,
          sourceBase64: encode(pending.source),
          receipt: pending.receipt,
        },
      };
    },
  };
};
