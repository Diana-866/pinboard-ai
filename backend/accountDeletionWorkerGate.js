"use strict";

function isAccountDeletionWorkerEnabled(env = process.env) {
  return !!env && env.ACCOUNT_DELETION_WORKER_ENABLED === "true";
}

module.exports = { isAccountDeletionWorkerEnabled };
