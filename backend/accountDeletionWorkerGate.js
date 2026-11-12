function isAccountDeletionWorkerEnabled(env = process.env) {
  return env.ACCOUNT_DELETION_WORKER_ENABLED === "true";
}

module.exports = { isAccountDeletionWorkerEnabled };
