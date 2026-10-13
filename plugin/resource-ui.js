(() => {
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
        document.createTextNode(' 我了解：上传后原始媒体静态 URL 可能公开，即使文章是私密草稿。'),
      );
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.id = 'mbb-resource-cancel';
      cancel.textContent = '取消图片导入，保留文稿';
      const projectedLabel = document.createElement('label');
      projectedLabel.textContent =
        '图片目标替换与规范化后的 Markdown（保存时将使用 WordPress 最终媒体 URL）';
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
          ? '正在私有暂存中校验 ZIP；尚未上传媒体。文稿仍可编辑。'
          : job
            ? '图片仅在私有暂存中，尚未创建媒体；请先预览并明确确认。'
            : '已保留待上传资源提示。如仍引用这些图片，请重新上传原 ZIP 或移除待上传图片；正文已保留。';
        ack.disabled = busy || readOnly || !job;
        label.hidden = !job;
        cancel.hidden = !job && !preparing;
        cancel.disabled = busy;
        projectedLabel.hidden = !job || !projected.value;
        list.replaceChildren();
        for (const image of job?.images || []) {
          const li = document.createElement('li');
          li.textContent = `${image.path} · ${image.mime} · ${image.width}×${image.height} · ${image.bytes} 字节`;
          list.append(li);
        }
      }
      async function prepare(file) {
        if (!window.crypto?.subtle?.digest)
          throw Error(
            '资源导入需要 HTTPS 或受信本地环境的 Web Crypto 校验；普通 Markdown 仍可编辑。',
          );
        if (!cfg.resources?.available)
          throw Error(
            '本站资源导入不可用，需要 zip、intl、安全暂存和媒体上传权限；普通 Markdown 仍可编辑。',
          );
        if (file.size > 8388608) throw Error('ZIP 最多 8 MiB。');
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
            throw Error('资源响应无效。');
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
              throw Error('图片清单无效。');
          job = { ...response, scope: target };
          requirements = structuredClone(response.requirements);
          if (stamp() === baseline) replaceSource(response.source);
          else message('ZIP 图片已准备；读取期间的新输入已保留，未覆盖当前文稿。请预览当前候选。');
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
          throw Error('预览图片类型无效。');
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
              throw Error('预览图片已取消或超过预算。');
            }
            chunks.push(value.value);
          }
        } finally {
          requests.delete(abort);
          reader.releaseLock();
        }
        if (size !== image.bytes || serial !== generation) throw Error('预览图片字节数不一致。');
        const blob = new Blob(chunks, { type: image.mime });
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
          (n) => n.toString(16).padStart(2, '0'),
        ).join('');
        if (digest !== image.sha256 || serial !== generation) throw Error('预览图片校验失败。');
        // The empty sandbox has an opaque origin and cannot read a parent Blob URL.
        // Only verified, bounded image data enters srcdoc, never a fetch credential.
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          readers.add(reader);
          reader.onload = () => {
            readers.delete(reader);
            serial === generation ? resolve(reader.result) : reject(Error('资源预览已取消。'));
          };
          reader.onerror = () => {
            readers.delete(reader);
            reject(Error('预览图片编码失败。'));
          };
          reader.onabort = () => {
            readers.delete(reader);
            reject(Error('资源预览已取消。'));
          };
          reader.readAsDataURL(blob);
        });
      }
      async function preview(result, content) {
        revoke();
        const plan = result.resource_plan;
        if (!plan) return;
        if (!job || plan.token !== job.token) throw Error('资源候选已变化，请重新预览。');
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
          if (serial !== generation) throw Error('资源预览已取消。');
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
              placeholder.textContent = `[图片预览占位：${image.path}；总预览最多 8 MiB / 16 MP，重复图片也计入]`;
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
        message('已取消本次资源；文稿保留，待上传图片须重新上传 ZIP 或移除。');
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
