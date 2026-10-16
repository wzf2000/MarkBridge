(() => {
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

  const bytes = (value) => new TextEncoder().encode(value).byteLength;
  const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  window.MarkBridgeResources = {
    create(options) {
      const { panel, api, cfg, scope, stamp, changed, replaceSource, message } = options;
      let generation = 0,
        job = null,
        requirements = null,
        preparing = false;
      let previewBytes = 0,
        previewPixels = 0;
      const requests = new Set();
      const readers = new Set();
      const text = document.createElement('p');
      text.setAttribute('role', 'status');
      const list = document.createElement('ul');
      list.id = 'mbb-resource-list';
      const label = document.createElement('label');
      const ack = document.createElement('input');
      ack.type = 'checkbox';
      ack.id = 'mbb-resource-public-ack';
      label.append(
        ack,
        document.createTextNode(
          T(
            ' I understand that original static media URLs may become public after upload, even when the article is a private draft.',
          ),
        ),
      );
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.id = 'mbb-resource-cancel';
      cancel.textContent = T('Cancel image import and keep the document');
      const projectedLabel = document.createElement('label');
      projectedLabel.textContent = T(
        'Markdown after image target replacement and normalization (saving uses final WordPress media URLs)',
      );
      const projected = document.createElement('textarea');
      projected.id = 'mbb-resource-projected';
      projected.readOnly = true;
      projectedLabel.append(projected);
      panel.append(text, list, label, cancel, projectedLabel);
      const identity = () => JSON.stringify(scope());
      const discard = (previous) => {
        if (previous)
          api(
            'resource-import/' + previous.token,
            { post_id: previous.scope.post_id },
            'DELETE',
          ).catch(() => {});
      };
      const revoke = () => {
        options.clearPreview?.();
        for (const request of requests) request.abort();
        requests.clear();
        for (const reader of readers) reader.abort();
        readers.clear();
        previewBytes = previewPixels = 0;
      };
      function render(readOnly = false, busy = false) {
        panel.hidden = !job && !requirements && !preparing;
        text.textContent = preparing
          ? T(
              'Verifying the ZIP in private staging. No media has been uploaded. The document remains editable.',
            )
          : job
            ? T(
                'Images are only in private staging; no media exists yet. Preview and explicitly confirm first.',
              )
            : T(
                'Pending resource hints were preserved. If these images are still referenced, upload the original ZIP again or remove them. Body content is preserved.',
              );
        if (job?.warnings?.mediaRebind === true)
          text.textContent +=
            ' ' +
            T(
              'This cross-site ZIP creates new local attachment IDs; IDs from the source site are never reused.',
            );
        ack.disabled = busy || readOnly || !job;
        label.hidden = !job;
        cancel.hidden = !job && !preparing;
        cancel.disabled = busy;
        projectedLabel.hidden = !job || !projected.value;
        list.replaceChildren();
        for (const image of job?.images || []) {
          const li = document.createElement('li');
          li.textContent = F(
            T('%1$s · %2$s · %3$s×%4$s · %5$s bytes'),
            image.path,
            image.mime,
            image.width,
            image.height,
            image.bytes,
          );
          list.append(li);
        }
      }
      async function prepare(file) {
        if (!window.crypto?.subtle?.digest)
          throw Error(
            T(
              'Resource import requires Web Crypto verification in HTTPS or a trusted local environment. Ordinary Markdown remains editable.',
            ),
          );
        if (!cfg.resources?.available)
          throw Error(
            T(
              'Resource import is unavailable on this site. It requires zip, intl, safe staging, and media upload permission. Ordinary Markdown remains editable.',
            ),
          );
        if (file.size > 8388608) throw Error(T('ZIP files are limited to 8 MiB.'));
        const previous = job;
        job = null;
        discard(previous);
        revoke();
        const serial = ++generation,
          target = scope(),
          targetIdentity = identity();
        preparing = true;
        ack.checked = false;
        projected.value = '';
        render();
        changed();
        // changed() invalidates the old preview; source edits after this marker must be preserved.
        const baseline = stamp();
        const form = new FormData();
        for (const [key, value] of Object.entries(target))
          if (value !== null && value !== undefined) form.set(key, value);
        form.set('archive', file);
        try {
          const response = await api('resource-import/prepare', form);
          if (serial !== generation || identity() !== targetIdentity) {
            discard({ ...response, scope: target });
            return;
          }
          if (
            response.schema !== 1 ||
            !/^[a-f0-9]{64}$/.test(response.token) ||
            !Array.isArray(response.images) ||
            response.images.length > 32 ||
            !response.requirements ||
            typeof response.source !== 'string' ||
            bytes(response.source) > 262144
          )
            throw Error(T('The resource response is invalid.'));
          for (const image of response.images)
            if (
              !/^[a-f0-9]{64}$/.test(image.key) ||
              !/^[a-f0-9]{64}$/.test(image.sha256) ||
              !imageTypes.has(image.mime) ||
              !Number.isSafeInteger(image.bytes) ||
              image.bytes < 1 ||
              image.bytes > 8388608 ||
              !Number.isSafeInteger(image.width) ||
              !Number.isSafeInteger(image.height) ||
              image.width < 1 ||
              image.height < 1 ||
              image.width * image.height > 32000000
            )
              throw Error(T('The image manifest is invalid.'));
          job = { ...response, scope: target };
          requirements = structuredClone(response.requirements);
          if (stamp() === baseline) replaceSource(response.source);
          else
            message(
              T(
                'ZIP images are prepared. New input entered while reading is preserved; the document was not overwritten. Preview the current candidate.',
              ),
            );
          changed();
        } finally {
          if (serial === generation) {
            preparing = false;
            render();
          }
        }
      }
      async function imageData(image, serial, target) {
        const abort = new AbortController();
        requests.add(abort);
        const query = new URLSearchParams(
          Object.entries(target).filter(([, value]) => value !== null && value !== undefined),
        );
        const response = await api(
          'resource-import/' + job.token + '/image/' + image.key + '?' + query,
          null,
          'GET',
          abort.signal,
          true,
        );
        if (response.headers.get('Content-Type')?.split(';')[0] !== image.mime || !response.body)
          throw Error(T('The preview image type is invalid.'));
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const value = await reader.read();
            if (value.done) break;
            size += value.value.byteLength;
            if (size > image.bytes || size > 8388608 || serial !== generation) {
              await reader.cancel();
              throw Error(T('The preview image was canceled or exceeds its budget.'));
            }
            chunks.push(value.value);
          }
        } finally {
          requests.delete(abort);
          reader.releaseLock();
        }
        if (size !== image.bytes || serial !== generation)
          throw Error(T('The preview image byte count does not match.'));
        const blob = new Blob(chunks, { type: image.mime });
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
          (n) => n.toString(16).padStart(2, '0'),
        ).join('');
        if (digest !== image.sha256 || serial !== generation)
          throw Error(T('Preview image verification failed.'));
        // The empty sandbox has an opaque origin and cannot read a parent Blob URL.
        // Only verified, bounded image data enters srcdoc, never a fetch credential.
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          readers.add(reader);
          reader.onload = () => {
            readers.delete(reader);
            serial === generation
              ? resolve(reader.result)
              : reject(Error('Resource preview was canceled.'));
          };
          reader.onerror = () => {
            readers.delete(reader);
            reject(Error('Preview image encoding failed.'));
          };
          reader.onabort = () => {
            readers.delete(reader);
            reject(Error('Resource preview was canceled.'));
          };
          reader.readAsDataURL(blob);
        });
      }
      async function preview(result, content) {
        revoke();
        const plan = result.resource_plan;
        if (!plan) return;
        if (!job || plan.token !== job.token)
          throw Error(T('The resource candidate changed. Preview again.'));
        const serial = generation,
          target = { ...job.scope };
        projected.value = plan.projectedDocument.source;
        render();
        for (const image of plan.images) {
          const nodes = [...content.querySelectorAll('img')].filter(
            (node) => node.getAttribute('src') === 'mbb-import/' + image.key,
          );
          if (!nodes.length) continue;
          // Capacity placeholders are intentional. Transport/authentication/type/digest failures
          // invalidate the whole confirmation instead of masquerading as a capacity limit.
          const pixels = image.width * image.height;
          const url =
            previewBytes + image.bytes <= 8388608 && previewPixels + pixels <= 16000000
              ? await imageData(image, serial, target)
              : null;
          if (serial !== generation) throw Error(T('Resource preview was canceled.'));
          for (const node of nodes) {
            if (
              url &&
              previewBytes + image.bytes <= 8388608 &&
              previewPixels + pixels <= 16000000
            ) {
              node.setAttribute('src', url);
              previewBytes += image.bytes;
              previewPixels += pixels;
            } else {
              const placeholder = document.createElement('span');
              placeholder.textContent = F(
                T(
                  '[Image preview placeholder: %1$s; total preview limit 8 MiB / 16 MP, including duplicate images]',
                ),
                image.path,
              );
              node.replaceWith(placeholder);
            }
          }
        }
      }
      function reset(remove = true, retain = false) {
        ++generation;
        if (remove) discard(job);
        job = null;
        preparing = false;
        if (!retain) requirements = null;
        ack.checked = false;
        projected.value = '';
        revoke();
        render();
      }
      ack.onchange = () => changed();
      cancel.onclick = () => {
        reset(true, true);
        changed();
        message(
          T(
            'This resource import was canceled. The document is preserved. Upload the ZIP again or remove pending images.',
          ),
        );
      };
      render();
      return {
        prepare,
        preview,
        render,
        reset,
        pending: () => preparing,
        requirements: () => (requirements ? structuredClone(requirements) : null),
        restore(value) {
          reset();
          requirements = value ? structuredClone(value) : null;
          render();
        },
        request() {
          return job
            ? { resource_import: { schema: 1, token: job.token, ack_public_media: ack.checked } }
            : requirements
              ? { requires_resources: structuredClone(requirements) }
              : {};
        },
        ready: () => !preparing && (!job || ack.checked),
      };
    },
  };
})();
