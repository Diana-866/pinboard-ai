import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const adminPanel = readFileSync(
  resolve(process.cwd(), 'src/components/admin/AdminPanel.tsx'),
  'utf8'
);

test('admin panel never imports or renders demo users and transactions', () => {
  assert.doesNotMatch(adminPanel, /adminMockData|ADMIN_USERS|ADMIN_TRANSACTIONS/);
  assert.match(adminPanel, /AdminSubscriptions/);
  assert.match(adminPanel, /AdminFinancialOperations/);
  assert.match(adminPanel, /фиктивные платежи/);
});

test('admin panel exposes only backend-connected administration sections', () => {
  for (const component of [
    'AdminSubscriptions',
    'AdminPaymentCreationRequests',
    'AdminBillingExceptions',
    'AdminFinancialOperations',
    'AdminPinterestSchedules',
    'AdminMail',
    'AdminEmailOutbox',
    'AdminLoginLockout',
    'AdminAccountDeletionInventory',
  ]) {
    assert.match(adminPanel, new RegExp(component));
  }
  assert.doesNotMatch(adminPanel, /adminTab === ['"]users['"]/);
  assert.doesNotMatch(adminPanel, /adminTab === ['"]accounting['"]/);
  assert.doesNotMatch(adminPanel, /adminTab === ['"]night_and_bot['"]/);
});

test('every admin tab is listed and rendered, so a section cannot silently disappear', () => {
  // The first version of the lockout check only looked for the component name, which the import line
  // already satisfied: deleting the tab and its render left the suite green. A tab that is declared
  // but never rendered (or listed but never declared) is now a failure, for every tab, not one.
  const union = /type AdminTab =([\s\S]*?);/.exec(adminPanel);
  assert.ok(union, 'AdminPanel must declare its tab union');
  const declared = [...union[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  assert.ok(declared.length >= 8, `expected the full tab list, saw ${declared.length}`);

  for (const tab of declared) {
    assert.match(adminPanel, new RegExp(`\{ id: '${tab}', label:`), `tab ${tab} must be listed in TABS`);
    assert.match(
      adminPanel,
      new RegExp(`activeTab === '${tab}' && <[A-Z]`),
      `tab ${tab} must render a panel`
    );
  }

  // And the reverse: nothing may be listed or rendered that is not a declared tab.
  const listed = [...adminPanel.matchAll(/\{ id: '([a-z_]+)', label:/g)].map((match) => match[1]);
  const rendered = [...adminPanel.matchAll(/activeTab === '([a-z_]+)'/g)].map((match) => match[1]);
  for (const id of [...listed, ...rendered]) {
    assert.ok(declared.includes(id), `admin tab ${id} is used but not declared in AdminTab`);
  }
});

test('the login lockout panel uses the two admin endpoints, not a client-side guess', () => {
  // §65 added operator visibility and recovery to the backend; without a panel the owner's only way
  // in was curl. The panel must talk to those exact routes and must not pretend to know the state.
  const panel = readFileSync(
    resolve(process.cwd(), 'src/components/admin/AdminLoginLockout.tsx'),
    'utf8'
  );
  assert.match(panel, /\/admin\/accounts\/login-lockout\?email=\$\{encodeURIComponent\(normalized\)\}/);
  assert.match(panel, /apiRequest\('\/admin\/accounts\/login-lockout\/reset', \{\s*method: 'POST',/);
  assert.match(panel, /JSON\.stringify\(\{ email: normalized \}\)/);
  // A local "not locked" without asking the server would hide a real lockout.
  assert.doesNotMatch(panel, /locked:\s*false\s*,\s*failedAttempts:\s*0\s*\}/);
  // The wait the server reports is rendered, so the operator knows how long it would have lasted.
  assert.match(panel, /retryAfterSeconds/);
  assert.match(panel, /formatWait\(/);
  // No secrets, no direct table access from the browser.
  assert.doesNotMatch(panel, /SUPABASE|service_role/i);
});

test('a dead outbox email can be requeued from the panel, and only a server confirmation counts', () => {
  // The outbox panel used to be diagnostics-only, so a dead activation email stayed dead. The button
  // must call the admin route with the row id, and must not show "requeued" without the server saying so.
  const panel = readFileSync(
    resolve(process.cwd(), 'src/components/admin/AdminEmailOutbox.tsx'),
    'utf8'
  );
  assert.match(panel, /\/admin\/billing\/email-outbox\/\$\{encodeURIComponent\(id\)\}\/requeue/);
  assert.match(panel, /method: 'POST',/);
  assert.match(panel, /confirmed\?\.requeued !== true/);
  assert.match(panel, /throw new Error\('Сервер не подтвердил возврат письма в очередь\.'\)/);
  // The operator must be warned that a resend can duplicate a message SMTP already accepted.
  assert.match(panel, /увидит письмо дважды/);
  // The panel still must not reveal recipients or payloads.
  assert.doesNotMatch(panel, /recipient_email/);
});


test('account deletion inventory panel displays partial results explicitly and stays read-only', () => {
  const panel = readFileSync(
    resolve(process.cwd(), 'src/components/admin/AdminAccountDeletionInventory.tsx'),
    'utf8'
  );
  assert.match(adminPanel, /account_deletion_inventory/);
  assert.match(adminPanel, /<AdminAccountDeletionInventory \/>/);
  assert.match(panel, /\/admin\/account-deletion\/inventory\?limit=50/);
  assert.match(panel, /requiring_attention_truncated/);
  assert.match(panel, /Очередь неполная/);
  assert.match(panel, /не запускает и не повторяет удаление данных/);
  assert.doesNotMatch(panel, /method:\s*['"]POST['"]/);
});
