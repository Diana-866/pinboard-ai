"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const https = require("node:https");
const axios = require("axios");
const { getWorkerConfig } = require("./scheduleWorker");
const { isValidScheduleWorkerResponse } = require("./scheduleResponse");
const { logError, logInfo, runWithCorrelationId } = require("./safeLogger");

const REQUEST_TIMEOUT_MS = 120_000;

async function runOnce({
  config,
  client = axios,
  logger = { info: logInfo, error: logError },
} = {}) {
  return runWithCorrelationId(crypto.randomUUID(), async () => {
    let requestAgents;
    try {
      const resolvedConfig = config || getWorkerConfig();
      // A one-shot invocation must not retain pooled sockets after its request.
      requestAgents = {
        httpAgent: new http.Agent({ keepAlive: false }),
        httpsAgent: new https.Agent({ keepAlive: false }),
      };
      const response = await client.post(
        resolvedConfig.endpoint,
        { limit: 1 },
        {
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 0,
          ...requestAgents,
          headers: { "x-pinposy-scheduler-secret": resolvedConfig.secret },
        }
      );
      const data = response && response.data;
      if (!isValidScheduleWorkerResponse(data)) throw new Error("Backend returned an invalid scheduler response");
      logger.info("schedule_cron.batch_completed");
      return data;
    } catch (error) {
      const safeError = {};
      let status;
      try {
        const name = error && error.name;
        if (typeof name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) safeError.name = name;
      } catch {}
      try {
        const code = error && error.code;
        if (typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code)) safeError.code = code;
      } catch {}
      try {
        const candidate = error && error.response && error.response.status;
        if (Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) status = candidate;
      } catch {}
      logger.error("schedule_cron.batch_failed", safeError, status);
      throw error;
    } finally {
      if (requestAgents) {
        requestAgents.httpAgent.destroy();
        requestAgents.httpsAgent.destroy();
      }
    }
  });
}

if (require.main === module) {
  runOnce().catch(() => {
    // Never print raw Axios errors: request config contains the scheduler secret.
    process.exitCode = 1;
  });
}

module.exports = { runOnce, REQUEST_TIMEOUT_MS };
