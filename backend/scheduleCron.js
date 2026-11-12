"use strict";

const crypto = require("node:crypto");
const axios = require("axios");
const { getWorkerConfig } = require("./scheduleWorker");
const { logError, logInfo, runWithCorrelationId } = require("./safeLogger");

const REQUEST_TIMEOUT_MS = 120_000;

async function runOnce({
  config,
  client = axios,
  logger = { info: logInfo, error: logError },
} = {}) {
  return runWithCorrelationId(crypto.randomUUID(), async () => {
    try {
      const resolvedConfig = config || getWorkerConfig();
      const response = await client.post(
        resolvedConfig.endpoint,
        { limit: 1 },
        {
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 0,
          headers: { "x-pinposy-scheduler-secret": resolvedConfig.secret },
        }
      );
      if (!response || !response.data || response.data.ok !== true) {
        throw new Error("Backend returned an invalid scheduler response");
      }
      logger.info("schedule_cron.batch_completed");
      return response.data;
    } catch (error) {
      const safeError = {};
      let status;
      // Axios errors may contain credentials in request config and can even
      // expose hostile getters. Read only fixed diagnostic fields defensively.
      try {
        const name = error && error.name;
        if (typeof name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) {
          safeError.name = name;
        }
      } catch {
        // Omit unreadable error name.
      }
      try {
        const code = error && error.code;
        if (typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code)) {
          safeError.code = code;
        }
      } catch {
        // Omit unreadable error code.
      }
      try {
        const candidate = error && error.response && error.response.status;
        if (Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) {
          status = candidate;
        }
      } catch {
        // Omit unreadable HTTP status.
      }
      logger.error("schedule_cron.batch_failed", safeError, status);
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
