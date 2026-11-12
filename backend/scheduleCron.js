"use strict";

const crypto = require("node:crypto");
const axios = require("axios");
const { getWorkerConfig } = require("./scheduleWorker");
const { logError, logInfo, runWithCorrelationId } = require("./safeLogger");

const REQUEST_TIMEOUT_MS = 120_000;

async function runOnce({
  config = getWorkerConfig(),
  client = axios,
  logger = { info: logInfo, error: logError },
} = {}) {
  return runWithCorrelationId(crypto.randomUUID(), async () => {
    try {
      const response = await client.post(
        config.endpoint,
        { limit: 1 },
        {
          timeout: REQUEST_TIMEOUT_MS,
          headers: { "x-pinposy-scheduler-secret": config.secret },
        }
      );
      if (!response || !response.data || response.data.ok !== true) {
        throw new Error("Backend returned an invalid scheduler response");
      }
      logger.info("schedule_cron.batch_completed");
      return response.data;
    } catch (error) {
      let status;
      try {
        const candidate = error && error.response && error.response.status;
        if (Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) {
          status = candidate;
        }
      } catch {
        // A malformed error object must not break the one-shot failure path.
      }
      logger.error("schedule_cron.batch_failed", error, status);
      throw error;
    }
  });
}

if (require.main === module) {
  runOnce().catch(() => {
    // safeLogger already emitted a redacted event; never print raw Axios errors
    // because request config contains the scheduler authentication header.
    process.exitCode = 1;
  });
}

module.exports = { runOnce, REQUEST_TIMEOUT_MS };
