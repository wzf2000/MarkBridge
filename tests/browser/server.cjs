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
window.MBB_REVISIONS={open(){}};</script>
<script defer src="${mapped('math.js')}"></script><script defer src="${mapped('resource-ui.js')}"></script><script defer src="${mapped('editor-ui.js')}"></script>
</head><body><button id="mbb-new" type="button">上传新文档</button><button class="mbb-open" data-post="12" type="button">编辑现有文档</button></body></html>`;

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
      '"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/wp-includes/css/dashicons.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/components/style.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/block-editor/style.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/block-library/editor.min.css"><style>#task-editor{padding:90px 24px 24px;max-width:850px;margin:auto}</style></head>',
  );
  return html.replace(
    '</body>',
    `<div id="task-editor"></div><button id="export-tasks">Export</button><pre id="task-export"></pre>
<script>
const e = wp.element.createElement;
function EditorBody() {
  window.taskRegistry = wp.data.useRegistry();
  return e(wp.blockEditor.BlockTools, {}, ${options.iframe ? `e(wp.blockEditor.__unstableIframe,{name:'editor-canvas',title:'Editor canvas',style:{width:'100%',height:'500px'}},e(wp.blockEditor.BlockList)),e(wp.components.Panel,{},e(wp.blockEditor.InspectorControls.Slot))` : 'e(wp.blockEditor.BlockList), e(wp.blockEditor.ButtonBlockAppender)'});
}
function TaskEditorApp() {
  const [blocks,setBlocks] = wp.element.useState(() => MBB.toBlocks(${JSON.stringify(source)}));
  window.taskBlocks = blocks;
  return e(wp.components.SlotFillProvider, {}, e(wp.blockEditor.BlockEditorProvider, {
    value:blocks,onInput:setBlocks,onChange:setBlocks,settings:{allowedBlockTypes:true,__unstableResolvedAssets:{styles:'<link rel="stylesheet" href="/wp-includes/css/dist/block-editor/style.min.css">',scripts:''}},
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
http
  .createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/health') return response.writeHead(200).end('ok');
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
window.MBB_EDITOR={root:location.origin+'/wp-json/mbb/v1/',nonce:'synthetic-nonce-not-for-storage',postId:${isNew ? 0 : 12},newPost:${isNew},canPublish:true,
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
