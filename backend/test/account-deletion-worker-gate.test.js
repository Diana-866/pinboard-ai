"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isAccountDeletionWorkerEnabled } = require("../accountDeletionWorkerGate");

test("account deletion worker is disabled unless explicitly enabled with exact true", () => {
  for (const env of [
    {},
    { ACCOUNT_DELETION_WORKER_ENABLED: "" },
    { ACCOUNT_DELETION_WORKER_ENABLED: "false" },
    { ACCOUNT_DELETION_WORKER_ENABLED: "TRUE" },
    { ACCOUNT_DELETION_WORKER_ENABLED: "1" },
    null,
  ]) {
    assert.equal(isAccountDeletionWorkerEnabled(env), false);
  }
  assert.equal(isAccountDeletionWorkerEnabled({ ACCOUNT_DELETION_WORKER_ENABLED: "true" }), true);
});

test("embedded and standalone entrypoints share the same gate helper", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const worker = fs.readFileSync(path.join(__dirname, "..", "accountDeletionWorker.js"), "utf8");
  const index = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(worker, /require\("\.\/accountDeletionWorkerGate"\)/);
  assert.match(index, /require\("\.\/accountDeletionWorkerGate"\)/);
  assert.match(worker, /if \(!isAccountDeletionWorkerEnabled\(\)\)/);
  assert.match(index, /if \(isAccountDeletionWorkerEnabled\(\)\)/);
});
