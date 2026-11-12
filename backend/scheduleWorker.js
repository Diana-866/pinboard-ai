"use strict";

const crypto = require("node:crypto");
const { logError, logInfo, logWarning, runWithCorrelationId } = require("./safeLogger");

// Independent process for Pinterest scheduled publications.
// Run as a dedicated worker service, separate from the web server process.
// The durable queue and all publication state remain in PostgreSQL; this
// process only wakes up and asks the authenticated backend worker endpoint
// to claim and process due rows.
const axios = require("axios");

const POLL_INTERVAL_MS = Math.max(5_000, Number(process.env.PINPOSY_SCHEDULER_INTERVAL_MS) || 30_000);
const MAX_REQUEST_TIMEOUT_MS = 15 * 60_000; // Stay below the 20-minute stale-claim recovery window.
const REQUEST_TIMEOUT_MS = Math.min(
  MAX_REQUEST_TIMEOUT_MS,
  Math.max(10_000, Number(process.env.PINPOSY_SCHEDULER_REQUEST_TIMEOUT_MS) || 120_000)
);
// Claim one row per HTTP run to keep request duration and recovery scope bounded.
// The backend also renews the active row's claim while Pinterest work is in flight.
const BATCH_LIMIT = 1;
// Keep shutdown inside the short termination grace periods used by hosted workers.
// Any unfinished request is recovered from its durable DB claim after restart.
const DEFAULT_DRAIN_TIMEOUT_MS = 20_000;
const MAX_RETRY_INTERVAL_MS = 5 * 60_000;
// Drain a due backlog quickly while preserving a slower idle polling cadence.
const BACKLOG_POLL_DELAY_MS = 250;

function getNextPollDelayMs(consecutiveFailures, baseIntervalMs = POLL_INTERVAL_MS) {
  const failures = Math.max(0, Math.floor(Number(consecutiveFailures) || 0));
  const base = Math.max(1_000, Number(baseIntervalMs) || POLL_INTERVAL_MS);
  return Math.min(MAX_RETRY_INTERVAL_MS, base * (2 ** Math.min(failures, 30)));
}

function getSafeWorkerErrorDetails(error) {
  const details = {};
  // Error objects can be supplied by HTTP clients and adapters. Read each
  // diagnostic defensively: a hostile getter must not break the retry loop.
  try {
    const name = error && error.name;
    if (typeof name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) {
      details.error_name = name;
    }
  } catch {
    // Omit unreadable diagnostic fields.
  }
  try {
    const code = error && error.code;
    if (typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code)) {
      details.error_code = code;
    }
  } catch {
    // Omit unreadable diagnostic fields.
  }
  try {
    const status = error && error.response && error.response.status;
    if (Number.isInteger(status) && status >= 100 && status <= 599) {
      details.http_status = status;
    }
  } catch {
    // Omit unreadable diagnostic fields.
  }
  return details;
}

function getWorkerConfig(env = process.env) {
  const baseUrl = String(env.PINPOSY_BACKEND_URL || env.PUBLIC_BACKEND_URL || "").trim().replace(/[/]+$/, "");
  const secret = String(env.PINPOSY_SCHEDULER_SECRET || "");
  if (secret !== secret.trim() || /\s/.test(secret)) {
    throw new Error("PINPOSY_SCHEDULER_SECRET must not contain whitespace");
  }
  if (!baseUrl) throw new Error("PINPOSY_BACKEND_URL (or PUBLIC_BACKEND_URL) is required");
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error("PINPOSY_BACKEND_URL must be a valid URL"); }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
    throw new Error("PINPOSY_BACKEND_URL must use HTTPS outside localhost");
  }
  // This setting is an origin, not an arbitrary endpoint. Reject URL parts
  // that would silently produce a malformed worker path or embed credentials.
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) {
    throw new Error("PINPOSY_BACKEND_URL must contain only the backend origin (no path, query, fragment or credentials)");
  }
  if (secret.length < 32) throw new Error("PINPOSY_SCHEDULER_SECRET must contain at least 32 characters");
  return { endpoint: parsed.origin + "/internal/pinterest/schedule/run", secret };
}

function createWorker({
  config,
  client = axios,
  logger = {
    info: logInfo,
    error: (event, details = {}) => logError(event, {
      name: details.error_name,
      code: details.error_code,
    }, details.http_status),
  },
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = REQUEST_TIMEOUT_MS,
  drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
}) {
  let timer = null;
  let active = false;
  let started = false;
  let stopped = false;
  let consecutiveFailures = 0;

  // Process one row per request. The backend renews that row's lease while
  // preflight and Pinterest publication are in progress.
  const safeBatchLimit = BATCH_LIMIT;
  const safeTimeoutMs = Math.min(MAX_REQUEST_TIMEOUT_MS, Math.max(10_000, Number(timeoutMs) || REQUEST_TIMEOUT_MS));

  function scheduleNext(delayMs) {
    if (!started || stopped || timer) return;
    timer = schedule(() => {
      timer = null;
      void tick();
    }, delayMs);
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  async function tick() {
    if (stopped || active) return;
    active = true;
    const correlationId = crypto.randomUUID();
    return runWithCorrelationId(correlationId, async () => {
      try {
        const response = await client.post(config.endpoint, { limit: safeBatchLimit }, {
          timeout: safeTimeoutMs,
          maxRedirects: 0,
          headers: { "x-pinposy-scheduler-secret": config.secret },
        });
        const data = response && response.data;
        if (!data || data.ok !== true) throw new Error("Backend returned an invalid worker response");
        consecutiveFailures = 0;
        const claimed = Number(data.claimed) || 0;
        logger.info("schedule_worker.batch_completed", {
          claimed,
          published: Number(data.published) || 0,
          failed: Number(data.failed) || 0,
          scheduled: Number(data.scheduled) || 0,
          unknown: Number(data.unknown) || 0,
        });
        // Process one row per request to bound lease duration, but do not sleep
        // a full poll interval between rows in an already-active backlog.
        scheduleNext(claimed > 0 ? BACKLOG_POLL_DELAY_MS : getNextPollDelayMs(0, intervalMs));
        return;
      } catch (error) {
        // Never print request config/headers: they contain the scheduler secret.
        consecutiveFailures += 1;
        logger.error("schedule_worker.batch_failed", getSafeWorkerErrorDetails(error));
      } finally {
        active = false;
        if (consecutiveFailures > 0) {
          scheduleNext(getNextPollDelayMs(consecutiveFailures, intervalMs));
        }
      }
    });
  }

  function start() {
    if (started || stopped) return;
    started = true;
    void tick();
  }

  async function stop() {
    stopped = true;
    started = false;
    if (timer) cancelSchedule(timer);
    timer = null;
    // Drain briefly, but never hold SIGTERM for the full HTTP timeout (up to
    // 15 minutes). If the request outlives the host's shutdown grace period,
    // PostgreSQL's fenced stale-claim recovery remains the source of truth.
    const drainMs = Math.max(0, Number(drainTimeoutMs) || 0);
    const deadline = Date.now() + drainMs;
    while (active && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, Math.max(1, deadline - Date.now()))));
    }
    return !active;
  }

  return { start, stop, tick };
}

if (require.main === module) {
  const { installFatalProcessHandlers } = require("./fatalProcessHandlers");
  installFatalProcessHandlers();

  let config;
  try {
    config = getWorkerConfig();
  } catch (error) {
    logError("scheduleWorker.event_003");
    process.exitCode = 1;
  }

  if (config) {
    const worker = createWorker({ config });
    worker.start();
    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logInfo("scheduleWorker.event_002");
      const drained = await worker.stop();
      if (!drained) {
        logWarning("scheduleWorker.event_001");
      }
      process.exit(0);
    };
    process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
    process.once("SIGINT", () => { void shutdown("SIGINT"); });
  }
}

module.exports = { getWorkerConfig, createWorker, getNextPollDelayMs, MAX_REQUEST_TIMEOUT_MS, DEFAULT_DRAIN_TIMEOUT_MS, MAX_RETRY_INTERVAL_MS };
