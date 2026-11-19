import assert from 'node:assert/strict';
import test from 'node:test';
import { isCompleteAccountExport } from './accountExportCompleteness';

const VERSION_1_EXPORT = {
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

// Version 2 adds the sections the account owns but the export used to omit.
const completeExport = {
  ...VERSION_1_EXPORT,
  formatVersion: 2,
  generationRequests: [],
  generationTasks: [],
  regenerationRequests: [],
  generationCreditReservations: [],
  generationTextUsage: [],
  paymentRequests: [],
  paymentDecisions: [],
  publishAttempts: [],
  deletionRequests: [],
};

test('accepts a version 2 export only when every section is present and none degraded', () => {
  assert.equal(isCompleteAccountExport(completeExport), true);
});

test('a version 1 file is still a complete export of what that format promised', () => {
  assert.equal(isCompleteAccountExport(VERSION_1_EXPORT), true);
});

test('a version 2 file missing a section the format requires is incomplete', () => {
  for (const section of [
    'generationRequests', 'generationTasks', 'regenerationRequests',
    'generationCreditReservations', 'generationTextUsage', 'paymentRequests',
    'paymentDecisions', 'publishAttempts', 'deletionRequests',
  ]) {
    assert.equal(
      isCompleteAccountExport({ ...completeExport, [section]: undefined }),
      false,
      section
    );
  }
});

test('rejects a file that reports unreadable sections', () => {
  assert.equal(isCompleteAccountExport({ ...completeExport, degradedSections: ['pins'] }), false);
});

test('rejects malformed or incomplete export envelopes', () => {
  assert.equal(isCompleteAccountExport(null), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, degradedSections: undefined }), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, boards: undefined }), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, account: null }), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, formatVersion: 3 }), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, formatVersion: undefined }), false);
  assert.equal(isCompleteAccountExport({ ...completeExport, formatVersion: '2' }), false);
});
