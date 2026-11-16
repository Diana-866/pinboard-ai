const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const helper = read('backend/test/lib/assert-disposable-postgres.sh');
const scripts = [
  'auth-recovery-concurrency.sh',
  'credit-concurrency.sh',
  'email-verification-concurrency.sh',
  'generation-concurrency.sh',
  'password-reset-issuance-concurrency.sh',
  'pinterest-oauth-concurrency.sh',
  'pinterest-publication-concurrency.sh',
  'pinterest-schedule-claim-concurrency.sh',
  'subscription-concurrency.sh',
];

test('shared guard requires explicit opt-in and a local disposable database', () => {
  assert.match(helper, /PINPOSY_ALLOW_DISPOSABLE_DB_TESTS/);
  assert.match(helper, /PGHOST/);
  assert.match(helper, /localhost\|127\.0\.0\.1\|::1/);
  assert.match(helper, /pinposy_verify_/);
  assert.match(helper, /current_database\(\)/);
  assert.match(helper, /inet_server_addr\(\)/);
  assert.match(helper, /psql_base=\(psql .* -h "\$PGHOST" .* -d "\$PGDATABASE"\)/);
  assert.match(helper, /mktemp -d/);
  assert.match(helper, /stop_test_children\(\)/);
});

test('all nine concurrency scripts use the shared target guard and isolated cleanup', () => {
  assert.equal(scripts.length, 9);
  for (const filename of scripts) {
    const script = read(path.join('backend/test', filename));
    assert.match(script, /source "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/lib\/assert-disposable-postgres\.sh"/, filename);
    assert.match(script, /trap cleanup EXIT/, filename);
    assert.match(script, /stop_test_children/, filename);
    assert.match(script, /cleanup_test_tmp_dir/, filename);
    assert.doesNotMatch(script, /PGHOST:=localhost|PGDATABASE:=pinposy_test/, filename);
    assert.doesNotMatch(script, /\/tmp\/(?!pinposy-concurrency\.)/, filename);
  }
});
