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

function getWorkerConfig(env = process.env) {
  const baseUrl = String(env.PINPOSY_BACKEND_URL || env.PUBLIC_BACKEND_URL || "").trim().replace(/[/]+$/, "");
  const secret = String(env.PINPOSY_SCHEDULER_SECRET || "");
  if (!baseUrl) throw new Error("PINPOSY_BACKEND_URL (or PUBLIC_BACKEND_URL) is required");
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error("PINPOSY_BACKEND_URL must be a valid URL"); }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
    throw new Error("PINPOSY_BACKEND_URL must use HTTPS outside localhost");
  }
  if (secret.length < 32) throw new Error("PINPOSY_SCHEDULER_SECRET must contain at least 32 characters");
  return { endpoint: baseUrl + "/internal/pinterest/schedule/run", secret };
}

function createWorker({
  config,
  client = axios,
  logger = { info: logInfo, error: logError },
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = REQUEST_TIMEOUT_MS,
  drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
}) {
  let timer = null;
  let active = false;
  let stopped = false;

  // Process one row per request. The backend renews that row's lease while
  // preflight and Pinterest publication are in progress.
  const safeBatchLimit = BATCH_LIMIT;
  const safeTimeoutMs = Math.min(MAX_REQUEST_TIMEOUT_MS, Math.max(10_000, Number(timeoutMs) || REQUEST_TIMEOUT_MS));

  async function tick() {
    if (stopped || active) return;
    active = true;
    const correlationId = crypto.randomUUID();
    return runWithCorrelationId(correlationId, async () => {
      try {
        const response = await client.post(config.endpoint, { limit: safeBatchLimit }, {
          timeout: safeTimeoutMs,
          headers: { "x-pinposy-scheduler-secret": config.secret },
        });
        const data = response && response.data;
        if (!data || data.ok !== true) throw new Error("Backend returned an invalid worker response");
        logger.info("schedule_worker.batch_completed", {
          claimed: Number(data.claimed) || 0,
          published: Number(data.published) || 0,
          failed: Number(data.failed) || 0,
          scheduled: Number(data.scheduled) || 0,
          unknown: Number(data.unknown) || 0,
        });
      } catch (error) {
        // Never print request config/headers: they contain the scheduler secret.
        logger.error("schedule_worker.batch_failed");
      } finally {
        active = false;
      }
    });
  }

  function start() {
    if (timer || stopped) return;
    void tick();
    timer = setInterval(() => { void tick(); }, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
  }

  async function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
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

module.exports = { getWorkerConfig, createWorker, MAX_REQUEST_TIMEOUT_MS, DEFAULT_DRAIN_TIMEOUT_MS };
