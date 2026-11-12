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
      const data = response && response.data;
      const countKeys = ["claimed", "published", "failed", "scheduled", "unknown"];
      const validCounts = data && countKeys.every((key) =>
        Number.isSafeInteger(data[key]) && data[key] >= 0
      );
      const scheduleIds = new Set();
      const validResults = data && Array.isArray(data.results) &&
        data.results.length === data.claimed &&
        data.results.every((item) => {
          if (
            !item ||
            typeof item !== "object" ||
            typeof item.schedule_id !== "string" ||
            !item.schedule_id.trim() ||
            scheduleIds.has(item.schedule_id) ||
            !["published", "failed", "scheduled", "unknown"].includes(item.status)
          ) return false;
          scheduleIds.add(item.schedule_id);
          return true;
        });
      const resultCounts = validResults
        ? data.results.reduce((counts, item) => {
            counts[item.status] += 1;
            return counts;
          }, { published: 0, failed: 0, scheduled: 0, unknown: 0 })
        : null;
      if (
        !data ||
        data.ok !== true ||
        !validCounts ||
        !validResults ||
        countKeys.slice(1).some((key) => resultCounts[key] !== data[key])
      ) {
        throw new Error("Backend returned an invalid scheduler response");
      }
      logger.info("schedule_cron.batch_completed");
      return data;
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
