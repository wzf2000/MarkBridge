const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fixturePort = Number(process.env.MARKBRIDGE_TEST_BROWSER_PORT || 8765);
if (!Number.isInteger(fixturePort) || fixturePort < 1024 || fixturePort > 65535)
  throw Error('MARKBRIDGE_TEST_BROWSER_PORT must be a local unprivileged port.');

const plugin = process.env.MARKBRIDGE_TEST_PLUGIN_ROOT
  ? fs.realpathSync(process.env.MARKBRIDGE_TEST_PLUGIN_ROOT)
  : path.resolve(__dirname, '../../plugin');
const assets = JSON.parse(fs.readFileSync(path.join(plugin, 'assets.json'), 'utf8'));
const presentation = JSON.parse(
  execFileSync('php', [path.join(__dirname, 'presentation-assets.php')], { encoding: 'utf8' }),
);
const disabledPresentation = JSON.parse(
  execFileSync('php', [path.join(__dirname, 'presentation-assets.php'), 'disabled'], {
    encoding: 'utf8',
  }),
);
const readerDisabledPresentation = JSON.parse(
  execFileSync('php', [path.join(__dirname, 'presentation-assets.php'), 'reader-disabled'], {
    encoding: 'utf8',
  }),
);
const componentPresentation = JSON.parse(
  execFileSync('php', [path.join(__dirname, 'presentation-assets.php'), 'empty-component'], {
    encoding: 'utf8',
  }),
);
const mapped = (name) => '/plugin/' + assets[name];
const frontScripts = (settings) =>
  settings.scripts
    .map(
      ({ handle, url, inline }) =>
        `${(inline.before || []).map((script) => `<script>${script}</script>`).join('\n')}
<script defer src="${url}"></script>
${(inline.after || []).map((script) => `<script defer src="/fixture-inline/${handle}"></script>`).join('\n')}`,
    )
    .join('\n');
const fixtureInlineScripts = new Map(
  presentation.scripts.map(({ handle, inline }) => [handle, (inline.after || []).join('\n')]),
);
const front = (
  settings = presentation,
) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${mapped('math.css')}">
<link rel="stylesheet" href="${mapped('diagnostics.css')}">
<script>window.MBB_DIAGNOSTICS_CONFIG={version:"2.1.0-rc.1",canCopy:false};</script>
<script defer src="${mapped('diagnostics.js')}"></script>
${settings.styles.map((url) => `<link rel="stylesheet" href="${url}">`).join('\n')}
<style>
body{margin:0;font:16px/1.7 Arial,sans-serif}.mbb-reading{padding:20px;max-width:800px;margin:auto}
.mbb-reading .mbb-document pre.wp-block-mbb-code{font:16px/1.7 Arial,sans-serif}
</style>
<style>${settings.inline.join('\n')}</style>
<script>window.MBB_MATH_CONFIG=${settings.math_config}</script>
<script defer src="${mapped('math.js')}"></script>
${frontScripts(settings)}
</head><body><main class="mbb-reading"><article class="mbb-document">
<p id="inline-line">文字在前 <span class="mbb-math" data-mbb-tex="x^2+y^2=z^2">x^2+y^2=z^2</span> 文字在后</p>
<pre class="wp-block-mbb-math"><code>\\sum_{n=1}^{100}\\frac{1}{n^2}</code></pre>
<pre class="wp-block-mbb-code line-numbers language-javascript"><code class="language-javascript" id="long-code"></code></pre>
</article></main><script>
document.getElementById('long-code').textContent=Array.from({length:120},(_,i)=>'const value'+i+' = '+i+'; // line '+i+(i===119?' '+('x'.repeat(180)):'' )).join('\\n');
</script></body></html>`;

const editor = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${mapped('editor-ui.css')}">
<script>window.MBB_MATH_CONFIG={front:false};window.MBB_EDITOR={root:location.origin+'/wp-json/mbb/v1/',nonce:'fixture',postId:0,canPublish:true,sourceFontSize:'14',state:null,footnoteStyle:${JSON.stringify(fs.readFileSync(path.join(plugin, 'footnotes.css'), 'utf8'))}};
window.wp={blocks:{serialize:()=>''},data:{select:()=>({getEditedPostAttribute:()=>0,getEditedPostContent:()=>'',getBlocks:()=>[]})}};
window.MBB_REVISIONS={open(){}};window.MBB_EDITOR.navigationBridge=${JSON.stringify({
  script: fs.readFileSync(path.join(plugin, 'preview-navigation.js'), 'utf8'),
  sha256: require('node:crypto')
    .createHash('sha256')
    .update(fs.readFileSync(path.join(plugin, 'preview-navigation.js')))
    .digest('base64'),
})};</script>
<script defer src="${mapped('math.js')}"></script><script defer src="${mapped('resource-ui.js')}"></script><script defer src="${mapped('source-tools.js')}"></script><script defer src="${mapped('editor-ui.js')}"></script>
</head><body><button id="mbb-new" type="button">上传新文档</button><button class="mbb-open" data-post="12" type="button">编辑现有文档</button></body></html>`;

// HTTP-only synthetic navigation API. Keeping this off Playwright routing lets
// WebKit load the real sandboxed MathJax engine's blob scripts normally.
const navigationRaw =
  '# 中文😀\r\n\r\n重复段落。\r\n\r\n重复段落。\r\n\r\n```python\r\nprint(1)\r\n```\r\n\r\n$$\r\n\\frac{a}{d}\r\n$$\r\n';
function navigationResponse(source) {
  const starts = [
    0,
    source.indexOf('重复'),
    source.lastIndexOf('重复'),
    source.indexOf('```'),
    source.indexOf('$$'),
  ];
  const ends = [source.indexOf('\r\n'), starts[1] + 5, starts[2] + 5, starts[4], source.length];
  return {
    before: navigationRaw,
    document: { source },
    post_status: 'draft',
    html: '<h1 data-mbb-preview-range="r0">中文😀</h1><p data-mbb-preview-range="r1">重复段落。</p><p data-mbb-preview-range="r2">重复段落。</p><pre tabindex="0" data-mbb-preview-range="r3"><code>print(1)</code></pre><pre class="wp-block-mbb-math" data-mbb-preview-range="r4"><code>\\frac{a}{d}</code></pre><script>parent.document.body.dataset.previewInjection="yes"</script>',
    navigation: {
      schema: 1,
      offsetUnit: 'utf16',
      sourceSha256: require('node:crypto').createHash('sha256').update(source).digest('hex'),
      ranges: starts.map((start, i) => ({
        id: 'r' + i,
        blockPath: [i],
        kind: i === 0 ? 'heading' : i === 3 ? 'code' : i === 4 ? 'math' : 'paragraph',
        start,
        end: ends[i],
        startLine: source.slice(0, start).split('\n').length,
        endLine: source.slice(0, ends[i]).split('\n').length,
        precision: 'exact',
      })),
      unmapped: [],
    },
  };
}

// Optional real WordPress block editor fixture, using only a sanitized core-script runtime.
const wpRuntime = process.env.MARKBRIDGE_TEST_RUNTIME;
const taskEditor = (source = '- [ ] Browser task\n- ordinary\n', options = {}) => {
  if (!wpRuntime) return null;
  let html = fs.readFileSync(path.join(wpRuntime, 'run/worker-bootstrap.html'), 'utf8');
  html = html.replaceAll('http://markbridge.invalid', '');
  if (options.converterOnly)
    html = html.replace(
      '<script src="/wp-content/plugins/markdown-block-bridge/kernel.js">',
      '<script>window.MBB_CONVERTER_ONLY=true;</script><script src="/wp-content/plugins/markdown-block-bridge/kernel.js">',
    );
  html = html.replace(
    '</head>',
    '<link rel="stylesheet" href="' +
      mapped('teaching.css') +
      '"><link rel="stylesheet" href="' +
      mapped('technical.css') +
      '"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/wp-includes/css/dashicons.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/components/style.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/block-editor/style.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/block-library/editor.min.css"><style>#task-editor{padding:90px 24px 24px;max-width:850px;margin:auto}#task-export{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;max-height:12rem;overflow:auto}</style></head>',
  );
  return html.replace(
    '</body>',
    () => `<div id="task-editor"></div><button id="export-tasks">Export</button><pre id="task-export"></pre>
<script>
const e = wp.element.createElement;
// Stable resolved assets keep attribute edits from navigating the canvas iframe.
const taskEditorSettings = {allowedBlockTypes:true,__unstableResolvedAssets:{styles:'<link rel="stylesheet" href="/wp-includes/css/dist/block-editor/style.min.css">',scripts:''}};
function EditorBody() {
  window.taskRegistry = wp.data.useRegistry();
  return e(wp.blockEditor.BlockTools, {}, ${options.iframe ? `e(wp.blockEditor.__unstableIframe,{name:'editor-canvas',title:'Editor canvas',style:{width:'100%',height:'500px'}},e(wp.blockEditor.BlockList)),e(wp.components.Panel,{},e(wp.blockEditor.InspectorControls.Slot))` : 'e(wp.blockEditor.BlockList), e(wp.blockEditor.ButtonBlockAppender)'});
}
function TaskEditorApp() {
  const [blocks,setBlocks] = wp.element.useState(() => MBB.toBlocks(${JSON.stringify(source)}));
  window.taskBlocks = blocks;
  return e(wp.components.SlotFillProvider, {}, e(wp.blockEditor.BlockEditorProvider, {
    value:blocks,onInput:setBlocks,onChange:setBlocks,settings:taskEditorSettings,
  }, e(EditorBody)));
}
wp.element.createRoot(document.getElementById('task-editor')).render(e(TaskEditorApp));
document.getElementById('export-tasks').onclick=()=>{
 try { document.getElementById('task-export').textContent=MBB.toMarkdown(taskBlocks,{origin:'markdown_import'}); }
 catch(error) { document.getElementById('task-export').textContent='ERROR: '+error.message; }
};
</script></body>`,
  );
};

const mime = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
// Isolated HTTP mocks for the real batch UI; no WordPress writes or routed blob requests.
const batchFixtures = new Map();
const batchPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);
const batchImageKey = require('node:crypto').createHash('sha256').update(batchPNG).digest('hex');
function batchTools(scenario) {
  const id = require('node:crypto').randomBytes(12).toString('hex');
  while (batchFixtures.size >= 32) batchFixtures.delete(batchFixtures.keys().next().value);
  batchFixtures.set(id, {
    scenario,
    job: null,
    holdNextList: false,
    held: null,
    confirms: [],
    listCount: 0,
  });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/plugin/editor-ui.css"><link rel="stylesheet" href="/plugin/batch-ui.css"><link rel="stylesheet" href="/plugin/math.css">
<style>body{font:16px/1.6 system-ui,sans-serif;margin:24px}button,input{font:inherit}input{box-sizing:border-box}</style>
<script>window.MBB_MATH_CONFIG={front:false};window.MBB_EDITOR={root:location.origin+'/batch-fixture/${id}/',nonce:'synthetic-only',postId:0};window.batchFixtureRoot='/batch-fixture/${id}/';</script>
<script defer src="/plugin/math.js"></script><script defer src="/plugin/source-tools.js"></script><script defer src="/plugin/batch-ui.js"></script>
</head><body><h1>Synthetic batch tools</h1><button id="mbb-batch-new" type="button">Batch import drafts</button></body></html>`;
}
function batchFixture(request, response, pathname) {
  const match = /^\/batch-fixture\/([a-f0-9]{24})\/(.*)$/.exec(pathname);
  if (!match) return false;
  const fixture = batchFixtures.get(match[1]),
    route = match[2];
  const json = (status, value, headers = {}) =>
    response
      .writeHead(status, { 'Content-Type': 'application/json', ...headers })
      .end(JSON.stringify(value));
  if (!fixture) {
    json(404, { message: 'Synthetic session expired' });
    return true;
  }
  let raw = '',
    length = 0;
  request.on('data', (chunk) => {
    length += chunk.length;
    if (length <= 1048576) raw += chunk;
  });
  request.on('end', () => {
    if (length > 1048576) return json(413, { message: 'Synthetic upload limit' });
    let data = {};
    if ((request.headers['content-type'] || '').startsWith('application/json')) {
      try {
        data = JSON.parse(raw || '{}');
      } catch {
        return json(400, { message: 'Synthetic JSON required' });
      }
    }
    if (route === 'control') {
      if (data.holdNextList) fixture.holdNextList = true;
      if (data.conflict) fixture.conflict = true;
      if (data.release && fixture.held) {
        fixture.held();
        fixture.held = null;
      }
      return json(200, {
        held: !!fixture.held,
        confirms: fixture.confirms,
        listCount: fixture.listCount,
      });
    }
    if (fixture.scenario === 'forbidden')
      return json(403, {
        code: 'batch_forbidden',
        message: 'Sign in with an account that can create drafts.',
      });
    if (route === 'batch' && request.method === 'GET') {
      fixture.listCount++;
      const result = {
        schema: 1,
        batches: fixture.job ? [fixture.job] : [],
        limits: { maxItems: 10 },
      };
      if (fixture.holdNextList) {
        fixture.holdNextList = false;
        // Flush no-store headers so Chromium does not serialize the new identical GET
        // behind its pending HTTP cache entry. Only the old JSON body remains gated.
        response.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Batch-Fixture-Held': 'yes',
        });
        response.flushHeaders();
        fixture.held = () => response.end(JSON.stringify(result));
        return;
      }
      return json(200, result);
    }
    if (route === 'batch/prepare') {
      fixture.job = {
        schema: 1,
        token: 'a'.repeat(64),
        expiresAt: 2000000000,
        state: 'open',
        items: [
          {
            index: 0,
            name: 'formula.md',
            title: 'formula',
            bytes: 48,
            state: 'ready',
            images: 0,
            warnings: ['duplicate-title'],
          },
          {
            index: 1,
            name: 'images.zip',
            title: 'images',
            bytes: 120,
            state: 'ready',
            images: 1,
            warnings: [],
          },
          {
            index: 2,
            name: 'blocked.md',
            title: 'blocked',
            bytes: 10,
            state: 'blocked',
            reason: 'Synthetic invalid document',
            images: 0,
            warnings: [],
          },
        ],
      };
      return json(200, fixture.job);
    }
    if (route.startsWith('resource-import/') && route.includes('/image/'))
      return response.writeHead(200, { 'Content-Type': 'image/png' }).end(batchPNG);
    if (!fixture.job || !route.startsWith('batch/' + fixture.job.token))
      return json(404, { message: 'Synthetic batch missing' });
    const job = fixture.job;
    if (route.endsWith('/preview')) {
      const item = job.items[data.index];
      if (!item || item.state === 'blocked')
        return json(409, { message: 'Synthetic blocked item' });
      item.title = data.title;
      item.state = 'previewed';
      return json(200, {
        schema: 1,
        item,
        html:
          '<h2>' +
          data.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;') +
          '</h2><pre class="wp-block-mbb-math"><code>\\frac{a}{d}</code></pre>' +
          (item.images ? '<img alt="Bundled pixel" src="mbb-import/' + batchImageKey + '">' : ''),
        source: '$$\n\\frac{a}{d}\n$$\n',
        receipt: 'b'.repeat(64),
        documentId: 'BatchFixtureDocument',
        resourceToken: 'c'.repeat(64),
        images: item.images
          ? [
              {
                key: batchImageKey,
                sha256: batchImageKey,
                mime: 'image/png',
                bytes: batchPNG.length,
                width: 1,
                height: 1,
              },
            ]
          : [],
        expiresAt: 2000000000,
      });
    }
    if (route.endsWith('/confirm')) {
      fixture.confirms.push(data);
      if (fixture.conflict) {
        fixture.conflict = false;
        return json(409, {
          code: 'batch_preview',
          message: 'Preview this item again before creating its draft.',
        });
      }
      const item = job.items[data.index];
      item.state = 'saved';
      item.post_id = 90 + item.index;
      item.editUrl = '/wp-admin/post.php?post=' + item.post_id + '&action=edit';
      return json(200, item);
    }
    if (request.method === 'DELETE') {
      job.state = 'cancelled';
      for (const item of job.items) if (item.state !== 'saved') item.state = 'cancelled';
    }
    return json(200, job);
  });
  return true;
}

http
  .createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const locale =
      new URL(request.url, 'http://localhost').searchParams.get('locale') === 'en_US'
        ? 'en_US'
        : 'zh_CN';
    const originalEnd = response.end.bind(response);
    response.end = (body, ...rest) => {
      if (typeof body === 'string' && /<!doctype html>|<html\b/i.test(body)) {
        // Explicit synthetic catalogs; this does not model WordPress's real user/site locale selection.
        body = body.replace(
          /(<script\b[^>]*src=["'][^"']*(?:\/plugin\/|markdown-block-bridge\/kernel)[^"']*["'][^>]*>)/g,
          '<script src="/fixture-localization.js?locale=' + locale + '"></script>$1',
        );
      }
      return originalEnd(body, ...rest);
    };
    if (pathname === '/fixture-localization.js') {
      const jed = JSON.parse(
        fs.readFileSync(path.join(plugin, 'languages/markbridge-zh_CN-mbb-i18n.json'), 'utf8'),
      ).locale_data.messages;
      const data = locale === 'zh_CN' ? jed : {};
      const boot = `(() => { const data=${JSON.stringify(data)};window.MBB_UI_LOCALE=${JSON.stringify(locale)};window.wp=window.wp||{};if(window.wp.i18n?.setLocaleData)window.wp.i18n.setLocaleData(data,'markbridge');else window.wp.i18n={__(text,domain){return domain==='markbridge'?(data[text]?.[0]??text):text;},_n(single,plural,count,domain){return domain==='markbridge'?(data[single]?.[0]??(count===1?single:plural)):(count===1?single:plural);}};})();`;
      return response
        .writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
        .end(boot + '\n' + fs.readFileSync(path.join(plugin, 'i18n.js'), 'utf8'));
    }

    if (pathname === '/navigation-editor')
      return response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          editor.replace(
            "root:location.origin+'/wp-json/mbb/v1/'",
            "root:location.origin+'/navigation-fixture/'",
          ),
        );
    if (pathname.startsWith('/navigation-fixture/')) {
      const json = (status, value) =>
        response
          .writeHead(status, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(value));
      if (pathname === '/navigation-fixture/document' && request.method === 'GET')
        return json(200, {
          post_id: 12,
          expected: 'one',
          title: 'Navigation',
          post_status: 'draft',
          featured_media: 0,
          document: { source: navigationRaw, documentId: 'Navigation' },
        });
      if (pathname !== '/navigation-fixture/preview' || request.method !== 'POST')
        return json(404, { code: 'fixture_only' });
      let body = '',
        size = 0;
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        size += Buffer.byteLength(chunk);
        if (size <= 65536) body += chunk;
      });
      request.on('end', () => {
        if (size > 65536) return json(413, { code: 'fixture_limit' });
        try {
          const data = JSON.parse(body);
          if (typeof data.source !== 'string') return json(400, { code: 'fixture_source' });
          json(200, navigationResponse(data.source));
        } catch {
          json(400, { code: 'fixture_json' });
        }
      });
      return;
    }
    if (pathname === '/batch-tools')
      return response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(batchTools(new URL(request.url, 'http://localhost').searchParams.get('case')));
    if (batchFixture(request, response, pathname)) return;
    if (pathname.startsWith('/static-export-fixture/export')) {
      const value = JSON.parse(
        execFileSync('php', [path.resolve(__dirname, '../static-export.php'), '--descriptor'], {
          encoding: 'utf8',
        }),
      );
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      let data;
      if (pathname.endsWith('/context'))
        data = { schema: 1, post_id: 12, expected: 'a'.repeat(64), documentId: 'STATIC' };
      else if (request.method === 'DELETE') data = { schema: 1, cancelled: true };
      else if (pathname.endsWith('/prepare'))
        data = {
          schema: 1,
          format: 'html',
          token: 'c'.repeat(64),
          receipt: 'd'.repeat(64),
          projectedSource: value.body,
          resources: [],
          retainedImages: [],
          changes: [],
        };
      else if (pathname.endsWith('/download')) data = value;
      else data = { code: 'fixture_unknown' };
      return response.end(JSON.stringify(data));
    }
    if (pathname === '/static-export-descriptor') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return response.end(
        execFileSync('php', [path.resolve(__dirname, '../static-export.php'), '--descriptor'], {
          encoding: 'utf8',
        }),
      );
    }
    if (pathname === '/health') return response.writeHead(200).end('ok');
    if (pathname === '/technical-presentation') {
      const html = execFileSync('php', [path.join(__dirname, 'technical-presentation.php')], {
        encoding: 'utf8',
      });
      return response.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' }).end(html);
    }
    if (pathname === '/wp/v2/types')
      return response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    if (pathname === '/front') {
      const query = new URL(request.url, 'http://localhost').searchParams;
      const settings =
        query.get('code') === 'off'
          ? disabledPresentation
          : query.get('reader') === 'off'
            ? readerDisabledPresentation
            : presentation;
      return response.writeHead(200, { 'Content-Type': 'text/html' }).end(front(settings));
    }
    if (pathname.startsWith('/fixture-inline/')) {
      const script = fixtureInlineScripts.get(pathname.slice('/fixture-inline/'.length));
      return script === undefined
        ? response.writeHead(404).end()
        : response.writeHead(200, { 'Content-Type': 'application/javascript' }).end(script);
    }
    if (pathname === '/native-editor') {
      const sourceManaged = new URL(request.url, 'http://localhost').searchParams.has('source');
      const setup = `<script>
      MBB_EDITOR.postId=12;MBB_EDITOR.state={expected:'baseline-1',source_managed:${sourceManaged}};
      const middlewares=[];window.nativeLocks=[];window.nativeRequests=[];
      const post={getCurrentPostId:()=>12,getEditedPostContent:()=>'<p>draft</p>',getEditedPostAttribute:()=>''};
      wp.data={select:()=>post,subscribe:()=>()=>{},dispatch:()=>({lockPostSaving:key=>nativeLocks.push(key),lockPostAutosaving:key=>nativeLocks.push('autosave:'+key)})};
      wp.apiFetch=options=>middlewares.reduceRight((next,fn)=>opts=>fn(opts,next),opts=>{nativeRequests.push(opts);return window.nativeResult?window.nativeResult(opts):Promise.resolve({id:12,mbb_expected:'baseline-2'});})(options);
      wp.apiFetch.use=fn=>middlewares.push(fn);
      </script>`;
      return response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(editor.replace('</head>', setup + '</head>'));
    }
    if (pathname === '/recovery-editor' || pathname === '/wp-admin/post-new.php') {
      const query = new URL(request.url, 'http://localhost').searchParams;
      const isNew = query.has('new'),
        sourceManaged = query.has('source');
      let html = taskEditor('# Original\n\nOriginal body.\n', { converterOnly: isNew });
      if (!html) return response.writeHead(404).end();
      if (query.has('header'))
        html = html.replace(
          '</body>',
          `<style>
.fixture-editor-header{position:fixed;top:46px;left:0;right:0;height:64px;background:white;border-bottom:1px solid #888;z-index:90;display:flex;align-items:center}
.fixture-editor-header .edit-post-header-toolbar{display:flex;align-items:center;gap:8px}
.fixture-editor-header .editor-header__settings{margin-left:auto;display:flex;align-items:center;gap:12px;background:white;height:100%}
@media(max-width:782px){.fixture-editor-header .edit-post-header-toolbar{width:100px;flex-shrink:0;overflow:hidden}.fixture-editor-header .editor-header__settings{position:absolute;left:100px;right:0;top:0}}
</style><header class="editor-header fixture-editor-header"><div class="edit-post-header-toolbar"><button>Add</button><button>List</button></div><div class="editor-header__settings"><button class="editor-header__post-preview-button">Preview</button><button>Publish</button></div></header></body>`,
        );
      if (query.has('sidebar'))
        html = html.replace(
          '</body>',
          '<aside class="interface-complementary-area editor-sidebar" style="position:fixed;right:0;top:64px;bottom:0;width:min(320px,90vw);z-index:90;background:#fff;border-left:1px solid #888">Synthetic open editor sidebar</aside></body>',
        );
      html = html.replace(
        'const e = wp.element.createElement;',
        `
window.MBB_EDITOR={root:location.origin+${JSON.stringify(query.has('staticExport') ? '/static-export-fixture/' : '/wp-json/mbb/v1/')},nonce:'synthetic-nonce-not-for-storage',postId:${isNew ? 0 : 12},newPost:${isNew},canPublish:true,
recovery:{schema:1,siteKey:'a'.repeat(64),userKey:'b'.repeat(64)},
state:${isNew ? 'null' : `{post_id:12,expected:'baseline-1',title:'Original',post_status:'draft',featured_media:0,source_managed:${sourceManaged},source_write_available:false,source_sha256:${sourceManaged ? "'f'.repeat(64)" : 'null'},document:{documentId:'RECOVERY',source:'# Original\\n\\nOriginal body.\\n',serialized:wp.blocks.serialize(MBB.toBlocks('# Original\\n\\nOriginal body.\\n'))}}`}};
window.MBB_REVISIONS={open(){}};window.MBB_MATH_CONFIG={front:false};
window.recoveryFields={title:'Original',status:${isNew ? "'auto-draft'" : "'draft'"},featured_media:0};window.recoveryOriginalSerialized=wp.blocks.serialize(MBB.toBlocks('# Original\\n\\nOriginal body.\\n'));window.nativeDirty=false;window.recoveryLocks=[];
const subscribers=new Set();window.recoveryNotify=()=>subscribers.forEach(fn=>fn());
const select=wp.data.select.bind(wp.data),dispatch=wp.data.dispatch.bind(wp.data),subscribe=wp.data.subscribe.bind(wp.data);wp.data={...wp.data};
wp.data.select=name=>name==='core/editor'?{getCurrentPostId:()=>12,getEditedPostAttribute:key=>recoveryFields[key],getEditedPostContent:()=>wp.blocks.serialize(window.taskBlocks||[]),isEditedPostDirty:()=>nativeDirty}:name==='core/block-editor'?{getBlocks:()=>window.taskBlocks||[]}:select(name);
wp.data.dispatch=name=>name==='core/editor'?{editPost:attrs=>{Object.assign(recoveryFields,attrs);window.nativeDirty=true;recoveryNotify();},lockPostSaving:key=>recoveryLocks.push(key),lockPostAutosaving:key=>recoveryLocks.push(key)}:name==='core/block-editor'?{resetBlocks:blocks=>taskRegistry.dispatch('core/block-editor').resetBlocks(blocks)}:dispatch(name);
wp.data.subscribe=fn=>{subscribers.add(fn);const original=subscribe(fn);return()=>{subscribers.delete(fn);original();};};
const middlewares=[];window.nativePosts=[];
wp.apiFetch=options=>middlewares.reduceRight((next,fn)=>opts=>fn(opts,next),async opts=>{nativePosts.push(opts);const result=await fetch('/wp-json/mbb/v1/mock-native-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(opts.data)});if(!result.ok)throw await result.json();return result.json();})(options);
wp.apiFetch.use=fn=>middlewares.push(fn);
const e = wp.element.createElement;`,
      );
      html = html.replace(
        'window.taskBlocks = blocks;',
        'window.taskBlocks = blocks;wp.element.useEffect(()=>{window.nativeDirty=wp.blocks.serialize(blocks)!==(MBB_EDITOR.state?.document.serialized||window.recoveryOriginalSerialized);window.recoveryNotify();},[blocks]);',
      );
      html = html.replace(
        '</body>',
        `<style>#mbb-new,#fixture-native-save{position:fixed;top:12px;z-index:60;padding:8px}#mbb-new{left:12px}#fixture-native-save{right:12px}</style><div style="position:relative;z-index:30"><button id="mbb-new">新 Markdown 草稿</button><button id="fixture-native-save">Fixture native save</button></div>
<link rel="stylesheet" href="${mapped('editor-ui.css')}"><script src="${mapped('math.js')}"></script><script src="${mapped('resource-ui.js')}"></script><script src="${mapped('editor-ui.js')}"></script><script src="${mapped('local-recovery.js')}"></script><script src="${mapped('export-ui.js')}"></script>
<script>document.getElementById('fixture-native-save').onclick=async()=>{await wp.apiFetch({path:'/wp/v2/posts/12',method:'POST',data:{content:wp.blocks.serialize(taskBlocks),title:recoveryFields.title,status:recoveryFields.status==='auto-draft'?'draft':recoveryFields.status}});window.nativeDirty=false;recoveryNotify();};</script></body>`,
      );
      return response.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
    }
    if (pathname === '/editor') {
      const size = Number(
        new URL(request.url, 'http://localhost').searchParams.get('sourceFontSize'),
      );
      return response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          [14, 16, 18].includes(size)
            ? editor.replace(
                "sourceFontSize:'14'",
                `sourceFontSize:${JSON.stringify(String(size))}`,
              )
            : editor,
        );
    }
    if (pathname === '/footnotes-front') {
      const body = execFileSync('php', [path.join(__dirname, 'footnotes-render.php')], {
        encoding: 'utf8',
      });
      return response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${mapped('footnotes.css')}"><style>body{font:18px/1.7 sans-serif;margin:20px}article{max-width:800px;margin:auto}</style></head><body>${body}</body></html>`,
        );
    }
    if (pathname === '/component-dynamic')
      return response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><article id="dynamic"></article>' +
            frontScripts(componentPresentation),
        );
    if (pathname === '/component-fixture.html')
      return response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(fs.readFileSync(path.join(__dirname, 'fixtures/component.html'), 'utf8'));
    if (pathname === '/technical-editor') {
      const examples = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../fixtures/technical-writing.json'), 'utf8'),
      ).cases;
      const example = (name) => examples.find((item) => item.name === name).source;
      const source =
        example('equation-and-atomic-reference') +
        '\n' +
        example('three-independent-statement-kinds') +
        '\n' +
        example('bibliography-and-atomic-cite');
      const html = taskEditor(source, { iframe: true });
      return response
        .writeHead(html ? 200 : 404, { 'Content-Type': 'text/html' })
        .end(html || 'Core runtime required');
    }
    if (pathname === '/component-editor') {
      const raw = fs.readFileSync(path.join(__dirname, 'fixtures/component.html'), 'utf8');
      const provider = {
        id: 'fixture',
        version: '0.1.0',
        protocolVersion: 1,
        minMarkBridge: '1.9.0-dev.1',
        budgets: {
          resourceBytes: 524288,
          startupMs: 5000,
          wallMs: 2000,
          traceFrames: 8192,
          traceBytes: 524288,
        },
        title: 'Fixed fixture',
        defaults: { value: 42, behavior: 'complete' },
        resource: {
          url: '/component-fixture.html',
          sha256: require('node:crypto').createHash('sha256').update(raw).digest('hex'),
        },
      };
      const source =
        ':::mbb:v1 component {"id":"editor-component","component":"fixture","componentVersion":"0.1.0","params":{"value":42,"behavior":"complete"}}\n\nEditable static fallback.\n\n:::mbb:end\n';
      let html = taskEditor(source, { iframe: true });
      if (html)
        html = html
          .replace(
            'const e = wp.element.createElement;',
            'window.MBBComponents=' +
              JSON.stringify([
                provider,
                {
                  ...provider,
                  id: 'fixture-second',
                  defaults: { value: 99, behavior: 'complete' },
                },
              ]) +
              ';const e = wp.element.createElement;',
          )
          .replace(
            '<div id="task-editor">',
            '<script src="' + mapped('components.js') + '"></script><div id="task-editor">',
          );
      return response
        .writeHead(html ? 200 : 404, { 'Content-Type': 'text/html' })
        .end(html || 'Core runtime required');
    }
    if (pathname === '/adapters-editor') {
      const adapters = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../fixtures/block-adapters.json'), 'utf8'),
      );
      let html = taskEditor(adapters.native[0] + '\n' + adapters.native[1], { iframe: true });
      if (html)
        html = html.replace(
          '<script src="/wp-content/plugins/markdown-block-bridge/kernel.js">',
          '<script>window.MBB_ADAPTERS=' +
            JSON.stringify(adapters.descriptors).replaceAll('<', '\\u003c') +
            ';</script><script src="/wp-content/plugins/markdown-block-bridge/kernel.js">',
        );
      return response
        .writeHead(html ? 200 : 404, { 'Content-Type': 'text/html' })
        .end(html || 'Core runtime required');
    }
    if (pathname === '/teaching-editor') {
      const source =
        ':::mbb:v1 collapse {"id":"edit-fold","title":"可编辑折叠","open":false}\n\nExisting teaching body.\n\n:::mbb:end\n\n:::mbb:v1 code-compare {"id":"edit-compare","leftTitle":"左代码","rightTitle":"右代码","leftHighlights":"","rightHighlights":""}\n\n```js\nleft();\n```\n\n```python\nright()\n```\n\nExplanation.\n\n:::mbb:end\n';
      const html = taskEditor(source);
      return response
        .writeHead(html ? 200 : 404, { 'Content-Type': 'text/html' })
        .end(html || 'Core runtime required');
    }
    if (pathname === '/footnotes-editor' || pathname === '/footnotes-adjacent-editor') {
      const html = taskEditor(
        pathname === '/footnotes-adjacent-editor'
          ? 'Text[^a][^a] and B[^b].\n\n[^a]: A.\n\n[^b]: B.\n'
          : 'Text[^note].\n\n[^note]: Editable footnote.\n',
      );
      return response
        .writeHead(html ? 200 : 404, { 'Content-Type': 'text/html' })
        .end(html || 'Core runtime required');
    }
    if (pathname === '/inline-math-editor') {
      let html = taskEditor('Before $x^2$ between $y_0$ after.\n\nSecond paragraph.\n');
      if (html) {
        html = html.replace(
          '<script src="/wp-content/plugins/markdown-block-bridge/kernel.js"></script>',
          '<script src="/wp-includes/js/dist/format-library.min.js"></script><script src="/wp-content/plugins/markdown-block-bridge/kernel.js"></script>',
        );
        html = html.replace(
          '</head>',
          `<link rel="stylesheet" href="${mapped('math.css')}"><script type="importmap">{"imports":{"@wordpress/latex-to-mathml":"/wp-includes/js/dist/script-modules/latex-to-mathml/index.js"}}</script><script>window.MBB_MATH_CONFIG={front:false}</script><script src="${mapped('math.js')}"></script></head>`,
        );
      }
      return response
        .writeHead(html ? 200 : 404, { 'Content-Type': 'text/html' })
        .end(html || 'Core runtime required');
    }
    if (pathname === '/task-editor') {
      const html = taskEditor();
      return response
        .writeHead(html ? 200 : 404, { 'Content-Type': 'text/html' })
        .end(html || 'Core runtime required');
    }
    if (
      wpRuntime &&
      (/^\/wp-includes\/(js|css|fonts)\//.test(pathname) ||
        pathname === '/wp-content/plugins/markdown-block-bridge/kernel.js')
    ) {
      let file = pathname.endsWith('/plugins/markdown-block-bridge/kernel.js')
        ? path.join(plugin, 'kernel.js')
        : path.resolve(wpRuntime, 'site', '.' + pathname);
      if (
        !fs.existsSync(file) &&
        (/^\/wp-includes\/css\//.test(pathname) ||
          [
            '/wp-includes/js/dist/script-modules/latex-to-mathml/index.js',
            '/wp-includes/js/dist/format-library.min.js',
          ].includes(pathname)) &&
        process.env.MARKBRIDGE_TEST_WORDPRESS_ROOT
      )
        file = path.resolve(process.env.MARKBRIDGE_TEST_WORDPRESS_ROOT, '.' + pathname);
      if (
        /^\/wp-includes\/(js|css|fonts)\//.test(pathname) &&
        !file.startsWith(path.resolve(wpRuntime, 'site/wp-includes') + path.sep) &&
        !(
          process.env.MARKBRIDGE_TEST_WORDPRESS_ROOT &&
          file.startsWith(
            path.resolve(process.env.MARKBRIDGE_TEST_WORDPRESS_ROOT, 'wp-includes') + path.sep,
          )
        )
      )
        return response.writeHead(403).end();
      if (!fs.existsSync(file)) return response.writeHead(404).end();
      response.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      });
      return fs.createReadStream(file).pipe(response);
    }
    if (!pathname.startsWith('/plugin/')) return response.writeHead(404).end();
    const relative = decodeURIComponent(pathname.slice('/plugin/'.length));
    const file = path.resolve(plugin, relative);
    if (!file.startsWith(plugin + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
      return response.writeHead(404).end();
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(response);
  })
  .listen(fixturePort, '127.0.0.1');
