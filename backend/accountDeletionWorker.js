"use strict";

// Dedicated worker for the durable account-deletion pipeline.
// Stages: preflight + Pinterest credential revocation, transactional content
// erasure + managed Storage removal, then pseudonymous account finalization.
const { logError, logInfo } = require("./safeLogger");
const { deleteManagedPinImageObject } = require("./pinImageLifecycle");

const POLL_INTERVAL_MS = Math.max(5000, Number(process.env.ACCOUNT_DELETION_WORKER_INTERVAL_MS) || 30000);
// Claim one job per worker tick: jobs run serially, so claiming multiple
// 15-minute leases up front would let later jobs expire before processing.
const LEASE_SECONDS = 900;
const CLAIM_LIMIT = 1;

// Retry ceilings enforced by finish_account_deletion_job in
// db/migrations/137_account_deletion_content_erasure_stage.sql. The RPC returns a
// bare boolean, so a job that exhausted its attempts is reported exactly like a
// successfully scheduled retry. Mirrored here so the worker can tell an operator the
// truth; backend/test/account-deletion-retry-policy.test.js fails if the two drift.
const MAX_PREFLIGHT_ATTEMPTS = 8;
const MAX_ERASE_ATTEMPTS = 100;

// One stalled provider call must not stop the polling loop. Undici eventually times
// out on its own, but the loop would be dead for minutes while every queued deletion
// waits, so each step is bounded here as well.
const DEFAULT_STEP_TIMEOUT_MS = 120_000;
// Shutdown must terminate: the standalone entrypoint has no outer force-exit.
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

function stepTimeoutError(code) {
  const error = new Error("account deletion worker step timed out");
  error.code = code;
  return error;
}

/** Bound one worker step. Non-positive or non-finite values disable the bound. */
function withStepTimeout(promise, timeoutMs, code) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer = null;
  const bound = new Promise((_, reject) => {
    // Deliberately not unref()'d: the timeout is the only thing that can settle a
    // stalled step, so letting the event loop drain first would leave the race (and
    // the worker loop) unresolved.
    timer = setTimeout(() => reject(stepTimeoutError(code)), timeoutMs);
  });
  return Promise.race([promise, bound]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Attempts at which the SQL marks the job blocked instead of scheduling a retry. */
function isRetryCeilingReached(stepKey, attempts) {
  if (stepKey === "erase_content") return Number(attempts) >= MAX_ERASE_ATTEMPTS;
  if (stepKey === "preflight") return Number(attempts) >= MAX_PREFLIGHT_ATTEMPTS;
  // finalize has no attempt ceiling in the SQL; it is only blocked explicitly.
  return false;
}

function safeErrorCode(error) {
  const candidate = String(error && (error.code || error.name) || "preflight_failed")
    .toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 64);
  return candidate || "preflight_failed";
}

function normalizeExactCount(count, table) {
  if (!Number.isSafeInteger(count) || count < 0) {
    const error = new Error("account deletion exact count response is invalid");
    error.code = "invalid_exact_count";
    error.table = table;
    throw error;
  }
  return count;
}

async function countOwnedRows(client, table, userId) {
  const { count, error } = await client.from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return normalizeExactCount(count, table);
}

// PostgREST applies a default row cap. Explicitly page every identifier query;
// otherwise a large account could receive a false "complete" inventory.
async function fetchAllRows(query, pageSize = 1000) {
  // PostgREST pagination must use a deterministic unique order. Every caller
  // selects primary-key `id`; without ORDER BY, page boundaries can skip or
  // duplicate rows and make the deletion preflight inventory incomplete.
  const orderedQuery = query.order("id", { ascending: true });
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await orderedQuery.range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) {
      const error = new Error("account deletion inventory page response is not an array");
      error.code = "invalid_inventory_page";
      throw error;
    }
    const page = data;
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function chunkValues(values, size = 200) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

async function countOwnedEmailOutboxRows(client, userId) {
  const subscriptions = await fetchAllRows(
    client.from("subscriptions").select("id").eq("user_id", userId)
  );
  const subscriptionIds = subscriptions.map((row) => row.id).filter(Boolean);
  let total = 0;
  for (const ids of chunkValues(subscriptionIds)) {
    const { count, error } = await client.from("email_outbox")
      .select("id", { count: "exact", head: true })
      .in("subscription_id", ids);
    if (error) throw error;
    total += normalizeExactCount(count, "email_outbox");
  }
  return total;
}

async function countPinsForBoards(client, boardIds) {
  let total = 0;
  for (const ids of chunkValues(boardIds)) {
    const { count, error } = await client.from("pins")
      .select("id", { count: "exact", head: true })
      .in("board_id", ids);
    if (error) throw error;
    total += normalizeExactCount(count, "pins");
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
    // Session/reset credentials and generation journals must be included in
    // the deletion manifest; they are not represented by the pins table.
    "auth_tokens",
    "pin_generation_requests",
    "pin_generation_tasks",
    "pin_regeneration_requests",
    // Provider publication/OAuth state must be purged; accounting journals
    // are inventoried but retained for payment and provider-cost evidence.
    "pinterest_publish_attempts",
    "pinterest_token_refresh_leases",
    "pinterest_oauth_connection_state",
    "pinterest_account_refresh_leases",
    "pin_generation_credit_reservations",
    "pin_generation_text_usage",
    "provider_refund_reconciliation_audit",
  ]) {
    counts[table] = await countOwnedRows(client, table, userId);
  }
  counts.email_outbox = await countOwnedEmailOutboxRows(client, userId);

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

function isValidStorageManifestBatch(objects, limit = 100) {
  if (!Array.isArray(objects) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || objects.length > limit) {
    return false;
  }
  const paths = new Set();
  for (const object of objects) {
    if (!object || typeof object !== "object" || Array.isArray(object) ||
        object.bucket_id !== "pin-images" ||
        typeof object.object_path !== "string" ||
        !/^pins[/](?:[0-9]+-[a-z0-9]{1,32}|generation-[a-f0-9]{32})[.](?:png|jpe?g|webp|gif)$/i.test(object.object_path)) {
      return false;
    }
    const key = JSON.stringify([object.bucket_id, object.object_path]);
    if (paths.has(key)) return false;
    paths.add(key);
  }
  return true;
}

function isValidDeletionJobBatch(jobs, limit = CLAIM_LIMIT) {
  if (!Array.isArray(jobs) || !Number.isSafeInteger(limit) || limit < 1 || limit > 10 || jobs.length > limit) return false;
  const ids = new Set();
  for (const job of jobs) {
    if (!job || typeof job !== "object" || Array.isArray(job)) return false;
    if (!["job_id", "request_id", "user_id", "claim_token"].every((key) => typeof job[key] === "string" && job[key].trim()) ||
        !["preflight", "erase_content", "finalize"].includes(job.step_key) ||
        !Number.isSafeInteger(job.attempts) || job.attempts < 1 ||
        typeof job.lease_expires_at !== "string" || !Number.isFinite(Date.parse(job.lease_expires_at))) return false;
    if (ids.has(job.job_id)) return false;
    ids.add(job.job_id);
  }
  return true;
}

function createAccountDeletionWorker({
  client,
  logger = { info: logInfo, error: logError },
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  intervalMs = POLL_INTERVAL_MS,
  stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS,
  shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  deleteImageObject = deleteManagedPinImageObject,
  supabaseUrl = process.env.SUPABASE_URL || (client && client.supabaseUrl),
}) {
  if (!client || typeof client.rpc !== "function") throw new Error("Supabase service client is required");
  let timer = null;
  let active = false;
  let stopped = false;

  async function processJob(job) {
    try {
      if (job.step_key === "finalize") {
        const { data: finalized, error: finalizeError } = await client.rpc(
          "finalize_account_deletion",
          { p_job_id: job.job_id, p_claim_token: job.claim_token }
        );
        if (finalizeError) throw finalizeError;
        if (finalized !== true) {
          const error = new Error("account deletion finalization was not confirmed");
          error.code = "account_finalization_unconfirmed";
          throw error;
        }
        logger.info("account_deletion_worker.account_finalized", { job_id: job.job_id });
        return { status: "succeeded" };
      }
      if (job.step_key === "erase_content") {
        const { data: erasure, error: erasureError } = await client.rpc(
          "erase_account_deletion_content",
          { p_job_id: job.job_id, p_claim_token: job.claim_token }
        );
        if (erasureError) throw erasureError;
        if (!erasure || erasure.erased !== true || erasure.financial_records_retained !== true) {
          const error = new Error("account content erasure was not confirmed");
          error.code = erasure && /^[a-z0-9_]{1,64}$/.test(erasure.reason || "")
            ? erasure.reason
            : "content_erasure_unconfirmed";
          throw error;
        }

        // Source rows have now been removed transactionally. Delete only the
        // exact, pre-recorded managed paths through the shared lifecycle guard.
        const { data: storageObjects, error: storageListError } = await client.rpc(
          "list_account_deletion_storage_manifest",
          { p_job_id: job.job_id, p_claim_token: job.claim_token, p_limit: 100 }
        );
        if (storageListError) throw storageListError;
        if (!Array.isArray(storageObjects) || storageObjects.length > 100) {
          const error = new Error("account deletion Storage manifest response is not a bounded array");
          error.code = "invalid_storage_manifest_response";
          throw error;
        }
        // Validate the entire batch before the first object deletion. The SQL
        // RPC is bounded to 100 unique manifest paths; a malformed successful
        // response must not trigger partial destructive processing.
        if (!isValidStorageManifestBatch(storageObjects, 100)) {
          const error = new Error("account deletion Storage manifest entries are invalid or duplicated");
          error.code = "invalid_storage_manifest_entry";
          throw error;
        }
        for (const object of storageObjects) {
          const removed = await deleteImageObject({
            supabase: client,
            bucket: object.bucket_id,
            objectPath: object.object_path,
          });
          const { data: marked, error: markError } = await client.rpc(
            "mark_account_deletion_storage_object_deleted",
            {
              p_job_id: job.job_id,
              p_claim_token: job.claim_token,
              p_bucket_id: object.bucket_id,
              p_object_path: object.object_path,
            }
          );
          if (markError) throw markError;
          // A false remove result is acceptable only when a previous attempt
          // already completed Storage removal and the lifecycle row confirms it.
          if (marked !== true || (removed !== true && removed !== false)) {
            const error = new Error("account deletion Storage object removal is unconfirmed");
            error.code = "storage_object_not_deleted";
            throw error;
          }
        }
        const { data: remainingObjects, error: remainingError } = await client.rpc(
          "list_account_deletion_storage_manifest",
          { p_job_id: job.job_id, p_claim_token: job.claim_token, p_limit: 1 }
        );
        if (remainingError) throw remainingError;
        if (!Array.isArray(remainingObjects) || remainingObjects.length > 1) {
          const error = new Error("account deletion remaining Storage manifest response is not a bounded array");
          error.code = "invalid_storage_manifest_response";
          throw error;
        }
        if (remainingObjects.length > 0) {
          const error = new Error("account deletion Storage manifest has more pending objects");
          error.code = "storage_manifest_batch_remaining";
          throw error;
        }

        const { data: finished, error: finishError } = await client.rpc("finish_account_deletion_job", {
          p_job_id: job.job_id,
          p_claim_token: job.claim_token,
          p_outcome: "succeeded",
          p_error_code: null,
        });
        if (finishError) throw finishError;
        if (finished !== true) return { status: "claim_lost" };
        logger.info("account_deletion_worker.content_erasure_completed", {
          job_id: job.job_id,
          projects: erasure.projects,
          schedules: erasure.schedules,
          publications: erasure.publications,
        });
        return { status: "succeeded" };
      }
      if (job.step_key !== "preflight") {
        const error = new Error("unsupported account deletion job step");
        error.code = "unsupported_deletion_step";
        throw error;
      }
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
      // Persist exact managed Storage paths while the account's source rows
      // still exist. This is inventory only: no object or user data is deleted
      // until a later, separately fenced erasure stage.
      if (typeof supabaseUrl !== "string" || !supabaseUrl.trim()) {
        const error = new Error("Supabase project URL is required to inventory owned Storage objects");
        error.code = "supabase_url_missing";
        throw error;
      }
      const { data: storageManifest, error: manifestError } = await client.rpc(
        "materialize_account_deletion_storage_manifest",
        {
          p_job_id: job.job_id,
          p_claim_token: job.claim_token,
          p_supabase_url: supabaseUrl,
        }
      );
      if (manifestError) throw manifestError;
      if (!storageManifest || storageManifest.recorded !== true ||
          !Number.isInteger(storageManifest.total) || storageManifest.total < 0) {
        const error = new Error("account deletion storage manifest was not persisted");
        error.code = "storage_manifest_not_recorded";
        throw error;
      }
      const { data: manifestMarked, error: manifestMarkError } = await client.rpc(
        "mark_account_deletion_storage_manifest",
        { p_job_id: job.job_id, p_claim_token: job.claim_token }
      );
      if (manifestMarkError) throw manifestMarkError;
      if (manifestMarked !== true) {
        const error = new Error("account deletion Storage manifest completion was not fenced");
        error.code = "storage_manifest_mark_failed";
        throw error;
      }
      // Revoke locally stored Pinterest credentials only after a complete,
      // durable preflight. The RPC is idempotent and uses the established
      // OAuth-generation/refresh-lease fencing for every connected account.
      const { data: disconnectedCount, error: disconnectError } = await client.rpc(
        "disconnect_pinterest_for_account_deletion",
        { p_user_id: job.user_id }
      );
      if (disconnectError) throw disconnectError;
      if (!Number.isInteger(disconnectedCount) || disconnectedCount < 0) {
        const error = new Error("invalid Pinterest disconnect result");
        error.code = "invalid_disconnect_result";
        throw error;
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
      // The SQL blocks a job once its attempts are exhausted. Reporting that as
      // "retry_scheduled" told an operator the pipeline was still working on an
      // account that will never progress, which is the one state that needs a human.
      const exhausted = isRetryCeilingReached(job.step_key, job.attempts);
      try {
        const { data, error: finishError } = await client.rpc("finish_account_deletion_job", {
          p_job_id: job.job_id,
          p_claim_token: job.claim_token,
          p_outcome: "retry",
          p_error_code: code,
        });
        if (finishError) throw finishError;
        if (data !== true) return { status: "claim_lost", error_code: code, blocked: exhausted };
        if (exhausted) {
          logger.error("account_deletion_worker.job_blocked", {
            job_id: job.job_id,
            step_key: job.step_key,
            attempts: job.attempts,
            error_code: code,
          });
          return { status: "blocked", error_code: code, blocked: true };
        }
        return { status: "retry_scheduled", error_code: code, blocked: false };
      } catch (finishError) {
        logger.error("account_deletion_worker.finalize_failed", {
          job_id: job.job_id,
          error_code: safeErrorCode(finishError),
        });
        return { status: "finalize_failed", error_code: code, blocked: exhausted };
      }
    }
  }

  async function tick() {
    if (active || stopped) return { claimed: 0 };
    active = true;
    try {
      const { data: jobs, error } = await withStepTimeout(
        client.rpc("claim_account_deletion_jobs", {
          p_limit: CLAIM_LIMIT,
          p_lease_seconds: LEASE_SECONDS,
        }),
        stepTimeoutMs,
        "claim_timeout"
      );
      if (error) throw error;
      if (!isValidDeletionJobBatch(jobs, CLAIM_LIMIT)) {
        throw new Error("Account deletion claim RPC returned an invalid job batch");
      }
      let completed = 0;
      let retried = 0;
      let blocked = 0;
      let stalled = 0;
      for (const job of jobs) {
        // A step that stops responding must not hold `active` forever: the loop
        // would stop claiming while every queued deletion waits behind it. The lease
        // and claim_token fencing make abandoning a stalled step safe — the job is
        // reclaimed after the lease expires and every stage RPC is idempotent.
        let result;
        try {
          result = await withStepTimeout(processJob(job), stepTimeoutMs, "step_timeout");
        } catch (error) {
          if (!error || error.code !== "step_timeout") throw error;
          stalled += 1;
          logger.error("account_deletion_worker.step_stalled", {
            job_id: job.job_id,
            step_key: job.step_key,
            error_code: "step_timeout",
          });
          continue;
        }
        if (result.status === "succeeded") completed += 1;
        if (result.status === "retry_scheduled") retried += 1;
        if (result.status === "blocked") blocked += 1;
      }
      return { claimed: jobs.length, completed, retried, blocked, stalled };
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
    // Drain, but never indefinitely: the standalone entrypoint awaits this with no
    // outer force-exit, so an unbounded wait would hang process shutdown forever.
    const deadline = Date.now() + Math.max(0, Number(shutdownTimeoutMs) || 0);
    while (active && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (active) {
      logger.error("account_deletion_worker.shutdown_not_drained");
      return false;
    }
    return true;
  }

  return { start, stop, tick, processJob };
}

if (require.main === module) {
  const { isAccountDeletionWorkerEnabled } = require("./accountDeletionWorkerGate");
  if (!isAccountDeletionWorkerEnabled()) {
    // Keep the standalone entrypoint behind the same explicit opt-in as the
    // embedded backend worker. Manual invocation must not bypass the rollout gate.
    console.error("Account deletion worker is disabled; set ACCOUNT_DELETION_WORKER_ENABLED=true after staging validation.");
    process.exitCode = 1;
  } else {
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
}

module.exports = { safeErrorCode, normalizeExactCount, countOwnedRows, fetchAllRows, chunkValues, countPinsForBoards, inspectAccountForDeletion, isValidDeletionJobBatch, isValidStorageManifestBatch, isRetryCeilingReached, withStepTimeout, MAX_PREFLIGHT_ATTEMPTS, MAX_ERASE_ATTEMPTS, createAccountDeletionWorker };
