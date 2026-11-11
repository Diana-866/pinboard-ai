"use strict";

// Dedicated worker for the account-deletion preflight queue.
// This phase is intentionally read-only: it proves that the worker can see
// every owned-data section before a separately reviewed erasure phase exists.
const { logError, logInfo } = require("./safeLogger");

const POLL_INTERVAL_MS = Math.max(5000, Number(process.env.ACCOUNT_DELETION_WORKER_INTERVAL_MS) || 30000);
const LEASE_SECONDS = 300;
const CLAIM_LIMIT = 2;

function safeErrorCode(error) {
  const candidate = String(error && (error.code || error.name) || "preflight_failed")
    .toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 64);
  return candidate || "preflight_failed";
}

async function countOwnedRows(client, table, userId) {
  const { count, error } = await client.from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return Number(count || 0);
}

// PostgREST applies a default row cap. Explicitly page every identifier query;
// otherwise a large account could receive a false "complete" inventory.
async function fetchAllRows(query, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function chunkValues(values, size = 200) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

async function countPinsForBoards(client, boardIds) {
  let total = 0;
  for (const ids of chunkValues(boardIds)) {
    const { count, error } = await client.from("pins")
      .select("id", { count: "exact", head: true })
      .in("board_id", ids);
    if (error) throw error;
    total += Number(count || 0);
  }
  return total;
}

async function inspectAccountForDeletion(client, userId) {
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    const error = new Error("invalid account owner id");
    error.code = "invalid_owner_id";
    throw error;
  }

  const { data: user, error: userError } = await client.from("users")
    .select("id,account_status")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user || user.account_status !== "deletion_pending") {
    const error = new Error("account is not in deletion_pending state");
    error.code = "account_state_mismatch";
    throw error;
  }

  const counts = {};
  // All direct user-owned sections in the account export plus token-bearing
  // Pinterest links. No credentials or row contents are loaded into memory.
  for (const table of [
    "projects",
    "credit_transactions",
    "subscriptions",
    "credit_purchases",
    "pinterest_accounts",
    "pinterest_publications",
    "pin_schedules",
    "pin_review_queue",
  ]) {
    counts[table] = await countOwnedRows(client, table, userId);
  }

  const projectRows = await fetchAllRows(
    client.from("projects").select("id").eq("user_id", userId)
  );
  const projectIds = projectRows.map((row) => row.id).filter(Boolean);
  const boardIds = [];
  for (const ids of chunkValues(projectIds)) {
    const boards = await fetchAllRows(
      client.from("boards").select("id").in("project_id", ids)
    );
    boardIds.push(...boards.map((row) => row.id).filter(Boolean));
  }
  counts.boards = boardIds.length;
  counts.pins = await countPinsForBoards(client, boardIds);

  return { ok: true, sectionsChecked: Object.keys(counts).length, counts };
}

function createAccountDeletionWorker({
  client,
  logger = { info: logInfo, error: logError },
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  intervalMs = POLL_INTERVAL_MS,
}) {
  if (!client || typeof client.rpc !== "function") throw new Error("Supabase service client is required");
  let timer = null;
  let active = false;
  let stopped = false;

  async function processJob(job) {
    try {
      const inventory = await inspectAccountForDeletion(client, job.user_id);
      const { data: inventoryRecorded, error: inventoryError } = await client.rpc("record_account_deletion_preflight", {
        p_job_id: job.job_id,
        p_claim_token: job.claim_token,
        p_inventory: inventory,
      });
      if (inventoryError) throw inventoryError;
      if (inventoryRecorded !== true) {
        logger.info("account_deletion_worker.inventory_claim_lost", { job_id: job.job_id });
        return { status: "claim_lost" };
      }
      const { data, error } = await client.rpc("finish_account_deletion_job", {
        p_job_id: job.job_id,
        p_claim_token: job.claim_token,
        p_outcome: "succeeded",
        p_error_code: null,
      });
      if (error) throw error;
      if (data !== true) {
        logger.info("account_deletion_worker.claim_lost", { job_id: job.job_id });
        return { status: "claim_lost" };
      }
      logger.info("account_deletion_worker.preflight_completed", {
        job_id: job.job_id,
        sections_checked: inventory.sectionsChecked,
      });
      return { status: "succeeded" };
    } catch (error) {
      const code = safeErrorCode(error);
      try {
        const { data, error: finishError } = await client.rpc("finish_account_deletion_job", {
          p_job_id: job.job_id,
          p_claim_token: job.claim_token,
          p_outcome: "retry",
          p_error_code: code,
        });
        if (finishError) throw finishError;
        return { status: data === true ? "retry_scheduled" : "claim_lost", error_code: code };
      } catch (finishError) {
        logger.error("account_deletion_worker.finalize_failed", {
          job_id: job.job_id,
          error_code: safeErrorCode(finishError),
        });
        return { status: "finalize_failed", error_code: code };
      }
    }
  }

  async function tick() {
    if (active || stopped) return { claimed: 0 };
    active = true;
    try {
      const { data: jobs, error } = await client.rpc("claim_account_deletion_jobs", {
        p_limit: CLAIM_LIMIT,
        p_lease_seconds: LEASE_SECONDS,
      });
      if (error) throw error;
      let completed = 0;
      let retried = 0;
      for (const job of jobs || []) {
        const result = await processJob(job);
        if (result.status === "succeeded") completed += 1;
        if (result.status === "retry_scheduled") retried += 1;
      }
      return { claimed: (jobs || []).length, completed, retried };
    } finally {
      active = false;
    }
  }

  function start() {
    if (stopped || timer) return;
    const run = async () => {
      timer = null;
      if (stopped) return;
      try {
        const result = await tick();
        logger.info("account_deletion_worker.batch_completed", result);
      } catch (error) {
        logger.error("account_deletion_worker.batch_failed", { error_code: safeErrorCode(error) });
      } finally {
        if (!stopped) timer = schedule(run, intervalMs);
        if (timer && typeof timer.unref === "function") timer.unref();
      }
    };
    void run();
  }

  async function stop() {
    stopped = true;
    if (timer) cancelSchedule(timer);
    timer = null;
    while (active) await new Promise((resolve) => setTimeout(resolve, 50));
    return true;
  }

  return { start, stop, tick, processJob };
}

if (require.main === module) {
  require("./fatalProcessHandlers").installFatalProcessHandlers();
  const supabase = require("./supabase");
  const worker = createAccountDeletionWorker({ client: supabase });
  worker.start();
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await worker.stop();
    process.exit(0);
  };
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
}

module.exports = { safeErrorCode, countOwnedRows, fetchAllRows, chunkValues, countPinsForBoards, inspectAccountForDeletion, createAccountDeletionWorker };
