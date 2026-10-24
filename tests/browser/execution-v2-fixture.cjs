// Synthetic local-only execution provider. No database or production algorithms.
const { execFileSync } = require('node:child_process'),
  path = require('node:path');
module.exports = (port) => {
  const origin = 'http://127.0.0.1:' + port,
    f = JSON.parse(
      execFileSync(
        process.env.MARKBRIDGE_TEST_PHP || 'php',
        [path.resolve(__dirname, '../component-execution.php'), '--fixture', origin],
        { encoding: 'utf8' },
      ),
    );
  let network = 0;
  return (request, response) => {
    const name = new URL(request.url, origin).pathname;
    if (name === '/execution-v2-fixture')
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ provider: f.provider, network }));
    else if (name === new URL(f.provider.resources.bundleUrl).pathname)
      response.writeHead(200, f.bundleHeaders).end(Buffer.from(f.bundle, 'base64'));
    else if (name === new URL(f.provider.frameUrl).pathname)
      response.writeHead(200, f.headers).end(f.html);
    else if (name === '/plugins/execution/assets/0.1.0/manifest.json')
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(f.manifest);
    else if (name === '/plugins/execution/assets/0.1.0/data.json')
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(f.data);
    else if (name === '/plugins/execution/assets/0.1.0/worker.js')
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(f.worker);
    else if (name === '/plugins/execution/assets/0.1.0/module.wasm')
      response
        .writeHead(200, { 'Content-Type': 'application/wasm' })
        .end(Buffer.from(f.module, 'base64'));
    else if (name === '/execution-network-probe') {
      network++;
      response.writeHead(200).end('network reached');
    } else return false;
    return true;
  };
};
