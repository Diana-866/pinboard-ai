"use strict";

// Dedicated worker for the durable account-deletion pipeline.
// Stages: preflight + Pinterest credential revocation, transactional content
// erasure + managed Storage removal, then pseudonymous account finalization.
const { logError, logInfo } = require("./safeLogger");
const { deleteManagedPinImageObject } = require("./pinImageLifecycle");
const { isAccountDeletionWorkerEnabled } = require("./accountDeletionWorkerGate");

const POLL_INTERVAL_MS = Math.max(5000, Number(process.env.ACCOUNT_DELETION_WORKER_INTERVAL_MS) || 30000);
const LEASE_SECONDS = 300;
const CLAIM_LIMIT = 1;

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
  if (!Number.isSafeInteger(count) || count < 0) {
    const invalidCount = new Error("account deletion inventory count is invalid");
    invalidCount.code = "invalid_inventory_count";
    throw invalidCount;
  }
  return count;
}

// PostgREST applies a default row cap. Explicitly page every identifier query;
// otherwise a large account could receive a false "complete" inventory.
async function fetchAllRows(query, pageSize = 1000) {
  // Account deletion is fenced before inventory begins; order every page by
  // primary key so pagination is deterministic and bounded.
  const orderedQuery = typeof query.order === "function"
    ? query.order("id", { ascending: true })
    : query;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await orderedQuery.range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) {
      const error = new Error("account deletion inventory query returned an invalid page");
      error.code = "invalid_inventory_page";
      throw error;
    }
    const page = data;
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function startLeaseHeartbeat({client, job, intervalMs = 60000, schedule = setInterval, cancelSchedule = clearInterval}) {
  let lost = false;
  let stopped = false;
  let inFlight = false;
  const timer = schedule(async () => {
    if (stopped || lost) return;
    // A renewal still pending at the next heartbeat means its result can no
    // longer be trusted before the lease safety margin. Fail closed rather
    // than letting a worker continue destructive Storage work on an unknown
    // lease while another worker may reclaim the job.
    if (inFlight) {
      lost = true;
      return;
    }
    inFlight = true;
    try {
      const { data, error } = await client.rpc("renew_account_deletion_job_lease", {
        p_job_id: job.job_id,
        p_claim_token: job.claim_token,
        p_lease_seconds: LEASE_SECONDS,
      });
      if (error || data !== true) lost = true;
    } catch (_error) {
      lost = true;
    } finally {
      inFlight = false;
    }
  }, intervalMs);
  if (timer && typeof timer.unref === "function") timer.unref();
  return {
    get lost() { return lost; },
    stop() {
      stopped = true;
      if (timer) cancelSchedule(timer);
    },
  };
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
    if (!Number.isSafeInteger(count) || count < 0) {
      const invalidCount = new Error("account deletion email outbox count is invalid");
      invalidCount.code = "invalid_inventory_count";
      throw invalidCount;
    }
    total += count;
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
    if (!Number.isSafeInteger(count) || count < 0) {
      const invalidCount = new Error("account deletion pin count is invalid");
      invalidCount.code = "invalid_inventory_count";
      throw invalidCount;
    }
    total += count;
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

function createAccountDeletionWorker({
  client,
  logger = { info: logInfo, error: logError },
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  intervalMs = POLL_INTERVAL_MS,
  deleteImageObject = deleteManagedPinImageObject,
  supabaseUrl = process.env.SUPABASE_URL || (client && client.supabaseUrl),
  scheduleHeartbeat = setInterval,
  cancelHeartbeat = clearInterval,
  heartbeatIntervalMs = 60000,
}) {
  if (!client || typeof client.rpc !== "function") throw new Error("Supabase service client is required");
  let timer = null;
  let active = false;
  let stopped = false;

  async function processJob(job) {
    const heartbeat = startLeaseHeartbeat({
      client, job, intervalMs: heartbeatIntervalMs,
      schedule: scheduleHeartbeat, cancelSchedule: cancelHeartbeat,
    });
    const ensureLease = () => {
      if (heartbeat.lost) {
        const error = new Error("account deletion worker lease renewal was not confirmed");
        error.code = "account_deletion_lease_lost";
        throw error;
      }
    };
    try {
      ensureLease();
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

        ensureLease();
        // Source rows have now been removed transactionally. Delete only the
        // exact, pre-recorded managed paths through the shared lifecycle guard.
        let storageObjectsDeleted = 0;
        let storageBatches = 0;
        while (true) {
          storageBatches += 1;
          if (storageBatches > 10000) {
            const error = new Error("account deletion Storage manifest exceeded the safety batch limit");
            error.code = "storage_manifest_batch_limit";
            throw error;
          }
          const { data: storageObjects, error: storageListError } = await client.rpc(
            "list_account_deletion_storage_manifest",
            { p_job_id: job.job_id, p_claim_token: job.claim_token, p_limit: 100 }
          );
          if (storageListError) throw storageListError;
          if (!Array.isArray(storageObjects)) {
            const error = new Error("account deletion Storage manifest response is invalid");
            error.code = "invalid_storage_manifest_response";
            throw error;
          }
          const batch = storageObjects;
          if (batch.length === 0) break;
          for (const object of batch) {
            ensureLease();
            if (!object || object.bucket_id !== "pin-images" ||
                typeof object.object_path !== "string" ||
                !/^pins\/(?:[0-9]+-[a-z0-9]{1,32}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp|gif)$/i.test(object.object_path)) {
              const error = new Error("invalid account deletion Storage manifest entry");
              error.code = "invalid_storage_manifest_entry";
              throw error;
            }
            const removed = await deleteImageObject({
              supabase: client,
              bucket: object.bucket_id,
              objectPath: object.object_path,
            });
            ensureLease();
            // A false result can mean either a live reference blocked deletion
            // or that a previous attempt already completed the lifecycle delete.
            // Ask the fenced DB RPC in both cases: it marks the manifest only when
            // the lifecycle row is already in the terminal "deleted" state.
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
            if (marked !== true) {
              const error = new Error(removed === true
                ? "account deletion Storage manifest update is unconfirmed"
                : "account deletion Storage deletion is not confirmed by its lifecycle record");
              error.code = removed === true
                ? "storage_manifest_update_unconfirmed"
                : "storage_object_not_deleted";
              throw error;
            }
            storageObjectsDeleted += 1;
          }
        }

        ensureLease();
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
          storage_objects_deleted: storageObjectsDeleted,
          storage_batches: storageBatches - 1,
        });
        return { status: "succeeded" };
      }
      if (job.step_key !== "preflight") {
        const error = new Error("unsupported account deletion job step");
        error.code = "unsupported_deletion_step";
        throw error;
      }
      const inventory = await inspectAccountForDeletion(client, job.user_id);
      ensureLease();
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
      ensureLease();
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
      ensureLease();
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
      ensureLease();
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
      ensureLease();
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
      if (heartbeat.lost || error.code === "account_deletion_lease_lost") {
        logger.info("account_deletion_worker.lease_lost", { job_id: job.job_id });
        return { status: "claim_lost" };
      }
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
    } finally {
      heartbeat.stop();
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
      if (!Array.isArray(jobs)) {
        const invalidJobs = new Error("account deletion claim response is invalid");
        invalidJobs.code = "invalid_claim_response";
        throw invalidJobs;
      }
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      for (const job of jobs) {
        if (!job || typeof job !== "object" ||
            !uuidPattern.test(job.job_id || "") ||
            !uuidPattern.test(job.user_id || "") ||
            !uuidPattern.test(job.claim_token || "") ||
            typeof job.step_key !== "string" || !job.step_key) {
          const invalidJob = new Error("account deletion claim contains an invalid job");
          invalidJob.code = "invalid_claimed_job";
          throw invalidJob;
        }
      }
      let completed = 0;
      let retried = 0;
      for (const job of jobs) {
        const result = await processJob(job);
        if (result.status === "succeeded") completed += 1;
        if (result.status === "retry_scheduled") retried += 1;
      }
      return { claimed: jobs.length, completed, retried };
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
  if (!isAccountDeletionWorkerEnabled()) {
    // Keep the standalone entrypoint behind the same explicit opt-in as the
    // embedded backend worker. A forgotten/manual process must not bypass the
    // deployment gate and start destructive account erasure unexpectedly.
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

module.exports = { safeErrorCode, countOwnedRows, fetchAllRows, chunkValues, countPinsForBoards, inspectAccountForDeletion, startLeaseHeartbeat, createAccountDeletionWorker };
