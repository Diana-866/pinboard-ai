// Pure scheduling policy kept separate from Pinterest client initialization,
// so unit tests do not need database credentials or external-service configuration.
function classifyScheduleFailure(attempt, attemptLookupError) {
  if (attemptLookupError) return "unknown";
  if (attempt && attempt.status === "published") return "published";
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
  if (error && error.retryable === false) return false;
  if (attempt) return attempt.status === "failed" && attempt.retry_safe === true;
  const status = Number(error && error.httpStatus);
  return !Number.isFinite(status) || status === 0 || status === 502 || status === 503;
}

// Any server-side 5xx from a thrown request path is treated as ambiguous.
// A gateway may return 503 after the remote service has already processed POST /pins.
function isPinterestPublishOutcomeUnknown(httpStatus) {
  const status = Number(httpStatus);
  return ![400, 401, 403, 404, 409, 422].includes(status);
}

function getScheduleRetryDelayMinutes(attempts) {
  const count = Math.max(1, Number(attempts) || 1);
  return Math.min(30, 2 ** Math.min(count - 1, 5));
}

module.exports = {
  classifyScheduleFailure,
  canRetryScheduleFailure,
  getScheduleRetryDelayMinutes,
  isPinterestPublishOutcomeUnknown,
  buildPinScheduleSnapshot,
  resolvePinScheduleSnapshot,
  classifyLegacyScheduleAccount,
  getScheduleRetryability,
  getScheduleFailureReason,
  sanitizeScheduleForClient,
};


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
  // Provider diagnostics may contain internal response details. Keep them in
  // the database/server logs, but never expose raw last_error to browser clients.
  const { last_error: _privateLastError, ...publicSchedule } = schedule;
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

function getScheduleRetryability(schedule, attempt, hasPublication, accountActive, hasActiveDuplicate) {
  if (!schedule || schedule.status !== "failed") return { retryable: false, reason: "not_failed" };
  if (!schedule.pinterest_account_id || !accountActive) return { retryable: false, reason: "account_unavailable" };
  if (!schedule.pinterest_board_id) return { retryable: false, reason: "board_missing" };
  // A scheduled snapshot is the durable creative source; the live pin image may have changed.
  if (!(schedule.snapshot_image_url || (schedule.pins && schedule.pins.image_url))) {
    return { retryable: false, reason: "pin_unavailable" };
  }
  if (hasPublication) return { retryable: false, reason: "publication_exists" };
  if (attempt && !(attempt.status === "failed" && attempt.retry_safe === true)) {
    return { retryable: false, reason: "attempt_not_retryable" };
  }
  if (hasActiveDuplicate) return { retryable: false, reason: "active_schedule_exists" };
  return { retryable: true, reason: null };
}
