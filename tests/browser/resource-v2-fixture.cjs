// Synthetic fixed provider + real Main PHP frame body/headers. No WordPress database.
const { execFileSync } = require('node:child_process'),
  path = require('node:path');
module.exports = (port) => {
  const origin = 'http://127.0.0.1:' + port;
  const fixture = JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_TEST_PHP || 'php',
      [path.resolve(__dirname, '../component-frame.php'), '--fixture', origin],
      { encoding: 'utf8' },
    ),
  );
  const count = { bundle: 0, manifest: 0, data: 0, frame: 0, program: 0, binary: 0 };
  return (request, response) => {
    const pathname = new URL(request.url, origin).pathname;
    if (pathname === '/resource-v2-fixture') {
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ provider: fixture.provider, count }));
    } else if (pathname === '/resource-v2-slow-bundle') {
      const bytes = Buffer.from(fixture.bundle, 'base64');
      response.writeHead(200, fixture.bundleHeaders);
      response.write(bytes.subarray(0, 12));
      const timer = setTimeout(() => response.end(bytes.subarray(12)), 2800);
      response.on('close', () => clearTimeout(timer));
    } else if (pathname === new URL(fixture.provider.resources.bundleUrl).pathname) {
      count.bundle++;
      response.writeHead(200, fixture.bundleHeaders).end(Buffer.from(fixture.bundle, 'base64'));
    } else if (pathname === new URL(fixture.provider.frameUrl).pathname) {
      count.frame++;
      response.writeHead(200, fixture.headers).end(fixture.html);
    } else if (pathname === '/plugins/fixture/assets/0.1.0/manifest.json') {
      count.manifest++;
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(fixture.manifest);
    } else if (pathname === '/plugins/fixture/assets/0.1.0/data.json') {
      count.data++;
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(fixture.data);
    } else if (pathname === '/plugins/fixture/assets/0.1.0/program.js') {
      count.program++;
      response
        .writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' })
        .end(fixture.program);
    } else if (pathname === '/plugins/fixture/assets/0.1.0/values.bin') {
      count.binary++;
      response
        .writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' })
        .end(Buffer.from(fixture.binary, 'base64'));
    } else return false;
    return true;
  };
};
