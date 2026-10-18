// Actual core password HTML and wpautop, with no WordPress bootstrap or database.
const cp = require('node:child_process'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const php = process.argv[2] || 'php',
  root = process.env.MARKBRIDGE_TEST_WORDPRESS_ROOT;
assert(root);
function run(args, input) {
  const r = cp.spawnSync(php, args, { input, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout;
}
const form = run(['tests/projection-password.php', '--form']);
const formatted = run(
  [
    '-r',
    'require $argv[1];echo wpautop(stream_get_contents(STDIN));',
    path.join(root, 'wp-includes/formatting.php'),
  ],
  form,
);
assert.match(formatted, /post-password-form/);
console.log(run(['tests/projection-password.php', '--formatted'], formatted).trim());
