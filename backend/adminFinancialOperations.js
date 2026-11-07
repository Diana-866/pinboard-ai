const supabase = require("./supabase");

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function operationKey(userId, idempotencyKey) {
  return `${String(userId)}\u0000${String(idempotencyKey)}`;
}

function summarizeGenerationTasks(tasks) {
  const rows = Array.isArray(tasks) ? tasks : [];
  const counts = { total: rows.length, pending: 0, running: 0, succeeded: 0, failed: 0, unknown: 0 };
  let refundFactMissing = false;
  let awaitingFinalization = rows.length > 0;

  for (const task of rows) {
    if (task.status === "succeeded" || task.provider_outcome_status === "succeeded") counts.succeeded += 1;
    else if (task.status === "failed" || task.provider_outcome_status === "failed") counts.failed += 1;
    else if (task.status === "running" || task.status === "queued" || task.status === "submitting") counts.running += 1;
    else if (task.status === "unknown") counts.unknown += 1;
    else counts.pending += 1;

    const terminalFailure = task.provider_outcome_status === "failed";
    if (terminalFailure && (task.provider_refunded == null || task.provider_reconciled_at == null)) {
      refundFactMissing = true;
    }
    if (task.status !== "failed" || !terminalFailure ||
        task.provider_refunded == null || task.provider_reconciled_at == null) {
      awaitingFinalization = false;
    }
  }

  let reason = "provider_outcome_unresolved";
  if (rows.length === 0) reason = "task_journal_missing_or_legacy";
  else if (refundFactMissing) reason = "provider_refund_fact_unresolved";
  else if (awaitingFinalization) reason = "reconciled_failure_awaiting_finalization";
  else if (counts.succeeded > 0) reason = "generation_completion_or_settlement_review";
  else if (counts.running > 0 || counts.unknown > 0) reason = "provider_task_may_still_be_active";

  return { task_counts: counts, reason };
}

function ageMinutes(timestamp, nowMs) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((nowMs - parsed) / 60000)) : null;
}

async function getFinancialOperationsQueue(options = {}) {
  const olderThanMinutes = clampInteger(options.olderThanMinutes, 30, 5, 24 * 60 * 30);
  const limit = clampInteger(options.limit, 50, 1, 100);
  const cutoff = new Date(Date.now() - olderThanMinutes * 60000).toISOString();
  const fetchLimit = limit + 1;

  const [generationResult, regenerationResult, reservationsResult] = await Promise.all([
    supabase.from("pin_generation_requests")
      .select("id,user_id,idempotency_key,status,error_code,created_at,updated_at")
      .eq("status", "processing")
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(fetchLimit),
    supabase.from("pin_regeneration_requests")
      .select("id,user_id,idempotency_key,status,provider_status,provider_refunded,provider_reconciled_at,created_at,updated_at")
      .eq("status", "processing")
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(fetchLimit),
    supabase.from("pin_generation_credit_reservations")
      .select("id,user_id,idempotency_key,amount,status,created_at,updated_at")
      .eq("status", "reserved")
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(fetchLimit),
  ]);

  for (const result of [generationResult, regenerationResult, reservationsResult]) {
    if (result.error) throw result.error;
  }

  const generationRequests = (generationResult.data || []).slice(0, limit);
  const regenerationRequests = (regenerationResult.data || []).slice(0, limit);
  const reservations = (reservationsResult.data || []).slice(0, limit);
  const generationIds = generationRequests.map((row) => row.id);
  let taskRows = [];

  if (generationIds.length) {
    const taskResult = await supabase.from("pin_generation_tasks")
      .select("generation_request_id,status,provider_outcome_status,provider_refunded,provider_reconciled_at")
      .in("generation_request_id", generationIds);
    if (taskResult.error) throw taskResult.error;
    taskRows = taskResult.data || [];
  }

  const tasksByRequest = new Map();
  for (const task of taskRows) {
    const key = String(task.generation_request_id);
    if (!tasksByRequest.has(key)) tasksByRequest.set(key, []);
    tasksByRequest.get(key).push(task);
  }

  const reservationKeys = [...new Set(reservations.map((row) => row.idempotency_key))];
  let reservationRequestRows = [];
  if (reservationKeys.length) {
    const [generationMatches, regenerationMatches] = await Promise.all([
      supabase.from("pin_generation_requests")
        .select("id,user_id,idempotency_key,status")
        .in("idempotency_key", reservationKeys),
      supabase.from("pin_regeneration_requests")
        .select("id,user_id,idempotency_key,status")
        .in("idempotency_key", reservationKeys),
    ]);
    if (generationMatches.error) throw generationMatches.error;
    if (regenerationMatches.error) throw regenerationMatches.error;
    reservationRequestRows = [
      ...(generationMatches.data || []).map((row) => ({ ...row, operation: "generation" })),
      ...(regenerationMatches.data || []).map((row) => ({ ...row, operation: "regeneration" })),
    ];
  }

  const requestByKey = new Map();
  for (const row of reservationRequestRows) {
    requestByKey.set(operationKey(row.user_id, row.idempotency_key), row);
  }

  const nowMs = Date.now();
  const generation = generationRequests.map((row) => {
    const summary = summarizeGenerationTasks(tasksByRequest.get(String(row.id)) || []);
    return {
      request_id: String(row.id),
      operation: "generation",
      status: row.status,
      reason: summary.reason,
      task_counts: summary.task_counts,
      created_at: row.created_at,
      updated_at: row.updated_at,
      age_minutes: ageMinutes(row.updated_at, nowMs),
    };
  });

  const regeneration = regenerationRequests.map((row) => {
    let reason = "provider_outcome_unresolved";
    if (row.provider_status === "failed" &&
        (row.provider_refunded == null || row.provider_reconciled_at == null)) {
      reason = "provider_refund_fact_unresolved";
    } else if (row.provider_status === "failed" &&
               row.provider_refunded != null && row.provider_reconciled_at != null) {
      reason = "reconciled_failure_awaiting_finalization";
    } else if (row.provider_status === "done") {
      reason = "provider_succeeded_request_not_completed";
    }
    return {
      request_id: String(row.id),
      operation: "regeneration",
      status: row.status,
      reason,
      provider_status: row.provider_status || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      age_minutes: ageMinutes(row.updated_at, nowMs),
    };
  });

  const reservationRows = reservations.map((row) => {
    const matchingRequest = requestByKey.get(operationKey(row.user_id, row.idempotency_key));
    return {
      reservation_id: String(row.id),
      operation: matchingRequest ? matchingRequest.operation : "unmatched",
      amount_credits: row.amount,
      status: row.status,
      reason: !matchingRequest
        ? "reservation_without_matching_request_review"
        : matchingRequest.status === "processing"
          ? "old_active_reservation_requires_request_review"
          : "active_reservation_with_terminal_request_integrity_review",
      request_id: matchingRequest ? String(matchingRequest.id) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      age_minutes: ageMinutes(row.updated_at, nowMs),
    };
  });

  return {
    older_than_minutes: olderThanMinutes,
    limit_per_category: limit,
    truncated: {
      generation: (generationResult.data || []).length > limit,
      regeneration: (regenerationResult.data || []).length > limit,
      reservations: (reservationsResult.data || []).length > limit,
    },
    counts: {
      generation: generation.length,
      regeneration: regeneration.length,
      reservations: reservationRows.length,
    },
    generation,
    regeneration,
    reservations: reservationRows,
    read_only: true,
    note: "Age indicates that an operation needs review; it does not prove provider failure, refund, or that a credit reservation is safe to release. No records were changed.",
  };
}

module.exports = { getFinancialOperationsQueue, summarizeGenerationTasks, clampInteger };
