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
};
