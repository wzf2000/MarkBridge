const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const plugin = path.resolve(__dirname, '../../plugin');
const assets = JSON.parse(fs.readFileSync(path.join(plugin, 'assets.json'), 'utf8'));
const presentation = JSON.parse(
  execFileSync('php', [path.join(__dirname, 'presentation-assets.php')], { encoding: 'utf8' }),
);
const disabledPresentation = JSON.parse(
  execFileSync('php', [path.join(__dirname, 'presentation-assets.php'), 'disabled'], {
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
<script>window.MBB_MATH_CONFIG={front:true}</script>
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
<script>window.MBB_MATH_CONFIG={front:false};window.MBB_EDITOR={root:location.origin+'/wp-json/mbb/v1/',nonce:'fixture',postId:0,canPublish:true,state:null,footnoteStyle:${JSON.stringify(fs.readFileSync(path.join(plugin, 'footnotes.css'), 'utf8'))}};
window.wp={blocks:{serialize:()=>''},data:{select:()=>({getEditedPostAttribute:()=>0,getEditedPostContent:()=>'',getBlocks:()=>[]})}};
window.MBB_REVISIONS={open(){}};</script>
<script defer src="${mapped('math.js')}"></script><script defer src="${mapped('editor-ui.js')}"></script>
</head><body><button id="mbb-new" type="button">上传新文档</button><button class="mbb-open" data-post="12" type="button">编辑现有文档</button></body></html>`;

// Optional real WordPress block editor fixture, using only a sanitized core-script runtime.
const wpRuntime = process.env.MARKBRIDGE_TEST_RUNTIME;
const taskEditor = (source = '- [ ] Browser task\n- ordinary\n') => {
  if (!wpRuntime) return null;
  let html = fs.readFileSync(path.join(wpRuntime, 'run/worker-bootstrap.html'), 'utf8');
  html = html.replaceAll('http://markbridge.invalid', '');
  html = html.replace(
    '</head>',
    '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/wp-includes/css/dashicons.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/components/style.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/block-editor/style.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css"><link rel="stylesheet" href="/wp-includes/css/dist/block-library/editor.min.css"><style>#task-editor{padding:90px 24px 24px;max-width:850px;margin:auto}</style></head>',
  );
  return html.replace(
    '</body>',
    `<div id="task-editor"></div><button id="export-tasks">Export</button><pre id="task-export"></pre>
<script>
const e = wp.element.createElement;
function EditorBody() {
  window.taskRegistry = wp.data.useRegistry();
  return e(wp.blockEditor.BlockTools, {}, e(wp.blockEditor.BlockList), e(wp.blockEditor.ButtonBlockAppender));
}
function TaskEditorApp() {
  const [blocks,setBlocks] = wp.element.useState(() => MBB.toBlocks(${JSON.stringify(source)}));
  window.taskBlocks = blocks;
  return e(wp.components.SlotFillProvider, {}, e(wp.blockEditor.BlockEditorProvider, {
    value:blocks,onInput:setBlocks,onChange:setBlocks,settings:{allowedBlockTypes:true},
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
      const markup = front(query.get('code') === 'off' ? disabledPresentation : presentation);
      return response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          query.get('reader') === 'off'
            ? markup.replace('front:true', 'front:true,reader:false')
            : markup,
        );
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
    if (pathname === '/editor') {
      const size = Number(
        new URL(request.url, 'http://localhost').searchParams.get('sourceFontSize'),
      );
      return response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          [14, 16, 18].includes(size)
            ? editor.replace("nonce:'fixture'", `sourceFontSize:${size},nonce:'fixture'`)
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
  .listen(8765, '127.0.0.1');
