"use strict";

// Independent process for Pinterest scheduled publications.
// Run as a dedicated worker service, separate from the web server process.
// The durable queue and all publication state remain in PostgreSQL; this
// process only wakes up and asks the authenticated backend worker endpoint
// to claim and process due rows.
const axios = require("axios");

const POLL_INTERVAL_MS = Math.max(5_000, Number(process.env.PINPOSY_SCHEDULER_INTERVAL_MS) || 30_000);
const REQUEST_TIMEOUT_MS = Math.max(10_000, Number(process.env.PINPOSY_SCHEDULER_REQUEST_TIMEOUT_MS) || 120_000);
const BATCH_LIMIT = Math.max(1, Math.min(10, Number(process.env.PINPOSY_SCHEDULER_BATCH_LIMIT) || 10));

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

function createWorker({ config, client = axios, logger = console, intervalMs = POLL_INTERVAL_MS, timeoutMs = REQUEST_TIMEOUT_MS, batchLimit = BATCH_LIMIT }) {
  let timer = null;
  let active = false;
  let stopped = false;

  const safeBatchLimit = Math.max(1, Math.min(10, Number(batchLimit) || 10));

  async function tick() {
    if (stopped || active) return;
    active = true;
    try {
      const response = await client.post(config.endpoint, { limit: safeBatchLimit }, {
        timeout: timeoutMs,
        headers: { "x-pinposy-scheduler-secret": config.secret },
      });
      const data = response && response.data;
      if (!data || data.ok !== true) throw new Error("Backend returned an invalid worker response");
      logger.info("[schedule-worker] batch completed", {
        claimed: Number(data.claimed) || 0,
        published: Number(data.published) || 0,
        failed: Number(data.failed) || 0,
        unknown: Number(data.unknown) || 0,
      });
    } catch (error) {
      // Never print request config/headers: they contain the scheduler secret.
      logger.error("[schedule-worker] batch failed", {
        message: String(error && error.message || "unknown error").slice(0, 300),
      });
    } finally {
      active = false;
    }
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
    // Let an in-flight request finish so the backend can persist its result.
    while (active) await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return { start, stop, tick };
}

if (require.main === module) {
  let config;
  try {
    config = getWorkerConfig();
  } catch (error) {
    console.error("[schedule-worker] configuration error:", error.message);
    process.exitCode = 1;
  }

  if (config) {
    const worker = createWorker({ config });
    worker.start();
    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.info("[schedule-worker] stopping", { signal });
      await worker.stop();
      process.exit(0);
    };
    process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
    process.once("SIGINT", () => { void shutdown("SIGINT"); });
  }
}

module.exports = { getWorkerConfig, createWorker };
