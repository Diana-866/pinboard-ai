const test = require("node:test");
const assert = require("node:assert/strict");
const { isAccountDeletionWorkerEnabled } = require("../accountDeletionWorkerGate");

test("account deletion is enabled only by an explicit true setting", () => {
  assert.equal(isAccountDeletionWorkerEnabled({ ACCOUNT_DELETION_WORKER_ENABLED: "true" }), true);
  assert.equal(isAccountDeletionWorkerEnabled({ ACCOUNT_DELETION_WORKER_ENABLED: "false" }), false);
  assert.equal(isAccountDeletionWorkerEnabled({ ACCOUNT_DELETION_WORKER_ENABLED: "1" }), false);
  assert.equal(isAccountDeletionWorkerEnabled({}), false);
});

test("account deletion availability can be enabled per runtime environment", () => {
  assert.equal(isAccountDeletionWorkerEnabled({ ACCOUNT_DELETION_WORKER_ENABLED: "true", NODE_ENV: "production" }), true);
  assert.equal(isAccountDeletionWorkerEnabled({ ACCOUNT_DELETION_WORKER_ENABLED: "true", NODE_ENV: "test" }), true);
});
