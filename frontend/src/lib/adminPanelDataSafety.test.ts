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
  ]) {
    assert.match(adminPanel, new RegExp(component));
  }
  assert.doesNotMatch(adminPanel, /adminTab === ['"]users['"]/);
  assert.doesNotMatch(adminPanel, /adminTab === ['"]accounting['"]/);
  assert.doesNotMatch(adminPanel, /adminTab === ['"]night_and_bot['"]/);
});
