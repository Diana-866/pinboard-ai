// Pure scheduling policy kept separate from Pinterest client initialization,
// so unit tests do not need database credentials or external-service configuration.
function classifyScheduleFailure(attempt, attemptLookupError, publicationLedger = null, publicationLedgerLookupError = null) {
  if (attemptLookupError || publicationLedgerLookupError) return "unknown";
  if (attempt && attempt.status === "published") {
    const expected = {
      user_id: attempt.user_id,
      pin_id: attempt.pin_id,
      pinterest_account_id: attempt.pinterest_account_id,
      pinterest_board_id: attempt.pinterest_board_id,
      pinterest_pin_id: attempt.pinterest_pin_id,
    };
    return matchesConfirmedPublicationLedger(publicationLedger, expected) ? "published" : "unknown";
  }
  if (attempt && ["unknown", "processing"].includes(attempt.status)) return "unknown";
  return "failed";
}

// A journaled retry is allowed only when the database failure RPC explicitly
// marked the attempt safe. Legacy failed rows default to retry_safe=false.
function canRetryScheduleFailure(attempt, attemptLookupError, error) {
  if (attemptLookupError) return false;
  // A fresh preflight/validation rejection takes precedence over an older
  // journal row that was safe to retry. In particular, a deleted Pinterest
  // board must not be retried just because a previous attempt was retry-safe.
  let retryable;
  let statusValue;
  try {
    retryable = error && error.retryable;
    statusValue = error && error.httpStatus;
  } catch {
    // An unreadable error object cannot establish that a remote publish is safe to repeat.
    return false;
  }
  const status = Number(statusValue);
  if (retryable === false) return false;
  // A known client rejection must not inherit an older retry-safe journal.
  // In particular, 401/403/404/409/422 usually mean credentials, account,
  // board, or request state must be corrected before another attempt.
  if (Number.isFinite(status) && status >= 400 && status < 500 && retryable !== true) return false;
  if (attempt) return attempt.status === "failed" && attempt.retry_safe === true;
  return !Number.isFinite(status) || status === 0 || status === 502 || status === 503;
}

// Any server-side 5xx from a thrown request path is treated as ambiguous.
// A gateway may return 503 after the remote service has already processed POST /pins.
function isPinterestPublishOutcomeUnknown(httpStatus) {
  const status = Number(httpStatus);
  return ![400, 401, 403, 404, 409, 422].includes(status);
}

async function persistPublishFailureJournal(rpc, params) {
  try {
    const { error } = await rpc("fail_pinterest_publish_v2", params);
    if (!error) return;
  } catch (error) {
    // A rejected transport promise is just as uncertain as a returned DB error.
  }
  const persistenceError = new Error(
    "Не удалось сохранить результат обращения к Pinterest. Публикация заблокирована до сверки; не запускайте её повторно."
  );
  persistenceError.httpStatus = 503;
  persistenceError.code = "PUBLISH_JOURNAL_PERSISTENCE_FAILED";
  throw persistenceError;
}

async function persistKnownRemotePublishOutcome(rpc, params) {
  let result;
  try {
    result = await rpc("record_pinterest_publish_unknown_v2", params);
  } catch (error) {
    // The database may have committed even when PostgREST lost its response.
  }
  if (result && !result.error && result.data === true) return true;

  const persistenceError = new Error(
    "Pinterest вернул ID созданного пина, но не удалось сохранить его для сверки. Повторная публикация заблокирована."
  );
  persistenceError.httpStatus = 503;
  persistenceError.code = "PUBLISH_REMOTE_ID_JOURNAL_FAILED";
  throw persistenceError;
}


function isScheduleClaimLostError(error) {
  return Boolean(error && error.code === "SCHEDULE_CLAIM_LOST");
}

function isScheduleClaimUpdateConfirmed(result) {
  return Boolean(result && !result.error && result.data && result.data.id);
}

function matchesConfirmedPublicationLedger(ledger, expected) {
  if (!ledger || !expected) return false;
  const identityFields = [
    "user_id",
    "pin_id",
    "pinterest_account_id",
    "pinterest_board_id",
    "pinterest_pin_id",
  ];
  // A missing/blank identity must never compare equal merely because both
  // sides normalize to an empty string. Confirmation requires a full ledger.
  return identityFields.every((field) => {
    const actual = String(ledger[field] == null ? "" : ledger[field]).trim();
    const wanted = String(expected[field] == null ? "" : expected[field]).trim();
    return actual.length > 0 && wanted.length > 0 && actual === wanted;
  });
}

function resolvePublishedReservation(reservation, expectedBoardId) {
  const pinterestPinId = String(reservation && reservation.pinterest_pin_id || "").trim();
  const pinterestBoardId = String(reservation && reservation.pinterest_board_id || "").trim();
  if (!pinterestPinId || !pinterestBoardId || pinterestBoardId !== String(expectedBoardId || "").trim()) {
    const error = new Error("Existing Pinterest publication does not match the scheduled destination");
    error.httpStatus = 409;
    error.code = "PINTEREST_PUBLICATION_IDENTITY_MISMATCH";
    throw error;
  }
  return { pinterest_pin_id: pinterestPinId, pinterest_board_id: pinterestBoardId };
}

function hasCompleteScheduleClaimIdentity(schedule) {
  return Boolean(
    schedule &&
    String(schedule.id || "").trim() &&
    String(schedule.user_id || "").trim() &&
    String(schedule.pin_id || "").trim() &&
    String(schedule.pinterest_account_id || "").trim() &&
    String(schedule.pinterest_board_id || "").trim() &&
    String(schedule.claim_token || "").trim()
  );
}

function hasMatchingScheduleAttemptIdentity(attempt, schedule) {
  if (!attempt || !schedule) return false;
  return String(attempt.user_id || "") === String(schedule.user_id || "")
    && String(attempt.pin_id || "") === String(schedule.pin_id || "")
    && String(attempt.pinterest_account_id || "") === String(schedule.pinterest_account_id || "")
    && String(attempt.pinterest_board_id || "") === String(schedule.pinterest_board_id || "");
}

function getSafeScheduleFailureMessage(error, lookupError) {
  if (lookupError) {
    return "Could not verify the publication journal; publication outcome remains unknown.";
  }
  let message = "";
  try {
    message = error && typeof error.message === "string" ? error.message : "";
  } catch {
    // Ignore hostile or malformed error objects.
  }
  if (/Выбранная доска не найдена или недоступна|не подтвердил принадлежность выбранной доски аккаунту/i.test(message)) {
    return "Выбранная доска не найдена или недоступна подключённому Pinterest-аккаунту";
  }
  let code;
  let retryable;
  let httpStatus;
  try {
    code = error && error.code;
    retryable = error && error.retryable;
    httpStatus = error && error.httpStatus;
  } catch {
    // Ignore unreadable metadata; the generic safe message is sufficient.
  }
  if (code === "SCHEDULE_CLAIM_LOST") {
    return "Расписание больше не принадлежит этому обработчику";
  }
  if (retryable === false && Number(httpStatus) === 403) {
    return "Для автоматической публикации требуется активная подписка";
  }
  return "Pinterest publication failed; check the account and schedule status before retrying.";
}

function buildScheduleWorkerFailureState({
  attempt = null,
  attemptLookupError = null,
  publicationLedger = null,
  publicationLedgerLookupError = null,
  error = null,
  attempts = 0,
  now = Date.now(),
  retryLimit = 5,
}) {
  const finalStatus = classifyScheduleFailure(attempt, attemptLookupError, publicationLedger, publicationLedgerLookupError);
  const message = getSafeScheduleFailureMessage(error, attemptLookupError);
  const retryable = canRetryScheduleFailure(attempt, attemptLookupError, error);
  const shouldRetry = retryable && Number(attempts || 0) < retryLimit;
  const retryAt = shouldRetry
    ? new Date(now + getScheduleRetryDelayMinutes(attempts) * 60_000).toISOString()
    : null;

  return {
    finalStatus,
    message,
    retryable,
    shouldRetry,
    retryAt,
    nextStatus: shouldRetry ? "scheduled" : finalStatus,
  };
}

function getScheduleRetryDelayMinutes(attempts) {
  const count = Math.max(1, Number(attempts) || 1);
  return Math.min(30, 2 ** Math.min(count - 1, 5));
}

module.exports = {
  classifyScheduleFailure,
  canRetryScheduleFailure,
  getScheduleRetryDelayMinutes,
  buildScheduleWorkerFailureState,
  hasMatchingScheduleAttemptIdentity,
  hasCompleteScheduleClaimIdentity,
  isScheduleClaimUpdateConfirmed,
  isScheduleClaimLostError,
  resolvePublishedReservation,
  matchesConfirmedPublicationLedger,
  persistPublishFailureJournal,
  persistKnownRemotePublishOutcome,
  isPinterestPublishOutcomeUnknown,
  buildPinScheduleSnapshot,
  resolvePinScheduleSnapshot,
  classifyLegacyScheduleAccount,
  getScheduleRetryability,
  selectScheduleAttemptForRetry,
  getScheduleFailureReason,
  sanitizeScheduleForClient,
  createScheduleClaimHeartbeat,
};

// Renew a single claimed row while its worker is still processing it. Failed
// heartbeats are observable but never treated as proof that a remote publish
// did not happen; the durable publish journal remains the source of truth.
function createScheduleClaimHeartbeat({ renew, logger = console, intervalMs = 60_000 }) {
  if (typeof renew !== "function") throw new TypeError("schedule claim renew callback is required");
  let stopped = false;
  let inFlight = false;
  let warningLogged = false;
  let leaseLost = false;
  let pendingRenewal = null;
  const timer = setInterval(() => {
    if (stopped || inFlight) return;
    inFlight = true;
    pendingRenewal = (async () => {
      try {
        const renewed = await renew();
        if (!renewed) {
          leaseLost = true;
          if (!warningLogged) {
            warningLogged = true;
            logger.warn("[pinterest-worker] schedule claim is no longer current; publication outcome remains journal-controlled");
          }
        }
      } catch (error) {
        if (!warningLogged) {
          warningLogged = true;
          logger.warn("[pinterest-worker] schedule claim heartbeat failed; publication outcome remains journal-controlled");
        }
      } finally {
        inFlight = false;
        pendingRenewal = null;
      }
    })();
  }, Math.max(10, Number(intervalMs) || 60_000));
  if (typeof timer.unref === "function") timer.unref();
  const stop = async () => {
    stopped = true;
    clearInterval(timer);
    // Do not let a renewal request outlive the schedule's final state transition.
    if (pendingRenewal) await pendingRenewal;
  };
  stop.isLeaseLost = () => leaseLost;
  return stop;
}


// Pure helpers for the immutable creative attached to a scheduled Pinterest publish.
function buildPinScheduleSnapshot(pin, destinationUrl) {
  if (!pin || !pin.image_url) throw new Error("A scheduled pin requires a saved image");
  return {
    snapshot_title: String(pin.title || "").slice(0, 100),
    snapshot_description: String(pin.description || "").slice(0, 800),
    snapshot_image_url: String(pin.image_url),
    snapshot_destination_url: destinationUrl ? String(destinationUrl) : null,
  };
}

function resolvePinScheduleSnapshot(schedule, currentPin) {
  if (schedule && schedule.snapshot_image_url) {
    return {
      title: schedule.snapshot_title ?? currentPin.title,
      description: schedule.snapshot_description ?? currentPin.description,
      image_url: schedule.snapshot_image_url,
      destination_url: schedule.snapshot_destination_url ?? null,
      is_snapshot: true,
    };
  }
  return {
    title: currentPin.title,
    description: currentPin.description,
    image_url: currentPin.image_url,
    destination_url: schedule && schedule.destination_url ? schedule.destination_url : null,
    is_snapshot: false,
  };
}


function classifyLegacyScheduleAccount(accounts, requestedAccountId = null) {
  const active = Array.isArray(accounts) ? accounts : [];
  if (active.length === 0) return { status: "no_account" };
  if (requestedAccountId) {
    const account = active.find((item) => String(item.id) === String(requestedAccountId));
    return account ? { status: "selected", account } : { status: "invalid_selection" };
  }
  if (active.length > 1) return { status: "selection_required" };
  return { status: "selected", account: active[0] };
}


function sanitizeScheduleForClient(schedule) {
  if (!schedule || typeof schedule !== "object") return schedule;
  // Provider diagnostics and worker claim tokens are server-only. The claim
  // token is a fencing capability used to authorize one worker's DB writes;
  // it must never be exposed in browser/API payloads.
  const {
    last_error: _privateLastError,
    claim_token: _privateClaimToken,
    ...publicSchedule
  } = schedule;
  return publicSchedule;
}

function getScheduleFailureReason(schedule) {
  if (!schedule || schedule.status !== "failed") return null;
  const message = String(schedule.last_error || "");
  if (/Выбранная доска не найдена или недоступна|не подтвердил принадлежность выбранной доски аккаунту/i.test(message)) {
    return "board_unavailable";
  }
  return null;
}

function selectScheduleAttemptForRetry(attempts, schedule) {
  if (!Array.isArray(attempts) || !schedule) return null;
  const samePinAndAccount = (attempt) =>
    String(attempt.user_id || "") === String(schedule.user_id || "") &&
    String(attempt.pin_id || "") === String(schedule.pin_id || "") &&
    String(attempt.pinterest_account_id || "") === String(schedule.pinterest_account_id || "");
  // Prefer the exact board attempt if multiple attempts exist. If only a
  // different-board attempt exists, return it so retry policy fails closed.
  return attempts.find((attempt) =>
    samePinAndAccount(attempt) &&
    String(attempt.pinterest_board_id || "") === String(schedule.pinterest_board_id || "")
  ) || attempts.find(samePinAndAccount) || null;
}

function getScheduleRetryability(schedule, attempt, hasPublication, accountActive, hasActiveDuplicate) {
  if (!schedule || schedule.status !== "failed") return { retryable: false, reason: "not_failed" };
  if (!schedule.pinterest_account_id || !accountActive) return { retryable: false, reason: "account_unavailable" };
  if (!schedule.pinterest_board_id) return { retryable: false, reason: "board_missing" };
  // A scheduled snapshot is the durable creative source; the live pin image may have changed.
  if (!(schedule.snapshot_image_url || (schedule.pins && schedule.pins.image_url))) {
    return { retryable: false, reason: "pin_unavailable" };
  }
  if (hasPublication) return { retryable: false, reason: "publication_exists" };
  if (attempt && !hasMatchingScheduleAttemptIdentity(attempt, schedule)) {
    return { retryable: false, reason: "attempt_identity_mismatch" };
  }
  if (attempt && !(attempt.status === "failed" && attempt.retry_safe === true)) {
    return { retryable: false, reason: "attempt_not_retryable" };
  }
  if (hasActiveDuplicate) return { retryable: false, reason: "active_schedule_exists" };
  return { retryable: true, reason: null };
}
