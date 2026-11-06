// Pure scheduling policy kept separate from Pinterest client initialization,
// so unit tests do not need database credentials or external-service configuration.
function classifyScheduleFailure(attempt, attemptLookupError) {
  if (attemptLookupError) return "unknown";
  if (attempt && attempt.status === "published") return "published";
  if (attempt && ["unknown", "processing"].includes(attempt.status)) return "unknown";
  return "failed";
}

// Retry only if the publish journal confirms that no remote-create attempt
// exists. Once a journal row exists, its status is the source of truth.
function canRetryScheduleFailure(attempt, attemptLookupError, error) {
  if (attemptLookupError || attempt) return false;
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
};
