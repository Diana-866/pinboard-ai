const supabase = require("./supabase");
const { readArrayQueryResult } = require("./fetchAllPages");
const { httpError } = require("./validate");

// 1,000 is the REST cap; treat a full response as potentially truncated.
const MATCH_QUERY_LIMIT = 1000;

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function operationKey(userId, idempotencyKey) {
  return `${String(userId)}\u0000${String(idempotencyKey)}`;
}

/**
 * Section 127. Tasks are read in batches with a REST row cap. When a batch comes back full, the view is
 * incomplete - and an incomplete view of a request whose visible tasks all look reconciled reads as
 * "ready to finalize" while a hidden task may still be running at the provider. For an operator
 * deciding about money, that is the worst possible direction to be wrong in, so truncation outranks
 * every derived reason and says so in its own words.
 */
const TASK_FETCH_LIMIT = 500;
const TASKS_TRUNCATED_REASON = "task_journal_truncated_integrity_review";

function summarizeGenerationTasks(tasks, options = {}) {
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
  if (options.truncated === true) reason = TASKS_TRUNCATED_REASON;
  else if (rows.length === 0) reason = "task_journal_missing_or_legacy";
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

  const generationRows = readArrayQueryResult(generationResult);
  const regenerationRows = readArrayQueryResult(regenerationResult);
  const reservationRows = readArrayQueryResult(reservationsResult);

  const generationRequests = generationRows.slice(0, limit);
  const regenerationRequests = regenerationRows.slice(0, limit);
  const reservations = reservationRows.slice(0, limit);
  const generationIds = generationRequests.map((row) => row.id);
  let taskRows = [];
  let tasksTruncated = false;
  const truncatedGenerationIds = new Set();

  if (generationIds.length) {
    // Keep each REST response below the common 1,000-row API cap (up to 10 tasks/request).
    const batches = [];
    for (let offset = 0; offset < generationIds.length; offset += 50) {
      batches.push(generationIds.slice(offset, offset + 50));
    }
    // Батч возвращается вместе со своим результатом: раньше `batch` оставался переменной
    // обработчика `map`, и обращение к нему ниже падало с `ReferenceError` ровно тогда, когда
    // батч приходил полным, — то есть при любой живой очереди, а не в пустой базе.
    const taskResults = await Promise.all(batches.map(async (batch) => ({
      batch,
      result: await supabase.from("pin_generation_tasks")
        .select("generation_request_id,status,provider_outcome_status,provider_refunded,provider_reconciled_at")
        .in("generation_request_id", batch)
        .limit(TASK_FETCH_LIMIT),
    })));
    for (const { batch, result } of taskResults) {
      const rows = readArrayQueryResult(result);
      // A full batch is the REST cap, not proof that the journal ended there.
      if (rows.length >= TASK_FETCH_LIMIT) {
        tasksTruncated = true;
        for (const requestId of batch) truncatedGenerationIds.add(String(requestId));
      }
      taskRows.push(...rows);
    }
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
        .in("idempotency_key", reservationKeys)
        .limit(MATCH_QUERY_LIMIT),
      supabase.from("pin_regeneration_requests")
        .select("id,user_id,idempotency_key,status")
        .in("idempotency_key", reservationKeys)
        .limit(MATCH_QUERY_LIMIT),
    ]);
    const generationMatchRows = readArrayQueryResult(generationMatches);
    const regenerationMatchRows = readArrayQueryResult(regenerationMatches);
    // The REST layer can silently cap a response. More than this bound is unsafe for
    // reconciliation: a hidden duplicate could turn an ambiguous match into a single match.
    if (generationMatchRows.length >= MATCH_QUERY_LIMIT ||
        regenerationMatchRows.length >= MATCH_QUERY_LIMIT) {
      throw httpError(502, "Слишком много совпадений для безопасной сверки. Требуется ручная проверка.");
    }
    reservationRequestRows = [
      ...generationMatchRows.map((row) => ({ ...row, operation: "generation" })),
      ...regenerationMatchRows.map((row) => ({ ...row, operation: "regeneration" })),
    ];
  }

  const requestsByKey = new Map();
  for (const row of reservationRequestRows) {
    const key = operationKey(row.user_id, row.idempotency_key);
    if (!requestsByKey.has(key)) requestsByKey.set(key, []);
    requestsByKey.get(key).push(row);
  }

  const nowMs = Date.now();
  const generation = generationRequests.map((row) => {
    const summary = summarizeGenerationTasks(tasksByRequest.get(String(row.id)) || [], { truncated: truncatedGenerationIds.has(String(row.id)) });
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

  const reservationItems = reservations.map((row) => {
    const matchingRequests = requestsByKey.get(operationKey(row.user_id, row.idempotency_key)) || [];
    const matchingRequest = matchingRequests.length === 1 ? matchingRequests[0] : null;
    const ambiguousMatch = matchingRequests.length > 1;
    return {
      reservation_id: String(row.id),
      operation: ambiguousMatch ? "ambiguous" : matchingRequest ? matchingRequest.operation : "unmatched",
      amount_credits: row.amount,
      status: row.status,
      reason: ambiguousMatch
        ? "multiple_matching_requests_integrity_review"
        : !matchingRequest
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
      generation: generationRows.length > limit,
      regeneration: regenerationRows.length > limit,
      reservations: reservationRows.length > limit,
      tasks: tasksTruncated,
    },
    counts: {
      generation: generation.length,
      regeneration: regeneration.length,
      reservations: reservationItems.length,
    },
    generation,
    regeneration,
    reservations: reservationItems,
    read_only: true,
    note: "Age indicates that an operation needs review; it does not prove provider failure, refund, or that a credit reservation is safe to release. No records were changed.",
  };
}

module.exports = { getFinancialOperationsQueue, summarizeGenerationTasks, clampInteger, TASKS_TRUNCATED_REASON, TASK_FETCH_LIMIT };
