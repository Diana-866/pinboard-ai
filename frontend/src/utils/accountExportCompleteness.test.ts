import assert from 'node:assert/strict';
import test from 'node:test';
import { isCompleteAccountExport } from './accountExportCompleteness';

const completeExport = {
  formatVersion: 1,
  account: { id: 'user-1' },
  degradedSections: [],
  projects: [],
  boards: [],
  pins: [],
  creditTransactions: [],
  subscriptions: [],
  creditPurchases: [],
  pinterestAccounts: [],
  pinterestPublications: [],
  pinSchedules: [],
  reviewQueue: [],
};

test('accepts an export only when every section is present and no section degraded', () => {
  assert.equal(isCompleteAccountExport(completeExport), true);
});

test('rejects a file that reports unreadable sections', () => {
  assert.equal(isCompleteAccountExport({ ...completeExport, degradedSections: ['pins'] }), false);
});

test('rejects malformed or incomplete export envelopes', () => {
  assert.equal(isCompleteAccountExport(null), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, degradedSections: undefined }), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, boards: undefined }), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, account: null }), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, formatVersion: 2 }), false);
});
