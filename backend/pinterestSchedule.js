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
  if (attempt) return attempt.status === "failed" && attempt.retry_safe === true;
  const status = Number(error && error.httpStatus);
  return !Number.isFinite(status) || status === 0 || status === 502 || status === 503;
}

function getScheduleRetryDelayMinutes(attempts) {
  const count = Math.max(1, Number(attempts) || 1);
  return Math.min(30, 2 ** Math.min(count - 1, 5));
}

module.exports = {
  classifyScheduleFailure,
  canRetryScheduleFailure,
  getScheduleRetryDelayMinutes,
  buildPinScheduleSnapshot,
  resolvePinScheduleSnapshot,
  classifyLegacyScheduleAccount,
  getScheduleRetryability,
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


function getScheduleRetryability(schedule, attempt, hasPublication, accountActive, hasActiveDuplicate) {
  if (!schedule || schedule.status !== "failed") return { retryable: false, reason: "not_failed" };
  if (!schedule.pinterest_account_id || !accountActive) return { retryable: false, reason: "account_unavailable" };
  if (!schedule.pinterest_board_id) return { retryable: false, reason: "board_missing" };
  if (!schedule.pins || !schedule.pins.image_url) return { retryable: false, reason: "pin_unavailable" };
  if (hasPublication) return { retryable: false, reason: "publication_exists" };
  if (attempt && !(attempt.status === "failed" && attempt.retry_safe === true)) {
    return { retryable: false, reason: "attempt_not_retryable" };
  }
  if (hasActiveDuplicate) return { retryable: false, reason: "active_schedule_exists" };
  return { retryable: true, reason: null };
}
