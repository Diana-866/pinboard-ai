// Pure classification logic kept separate from Pinterest client initialization,
// so unit tests do not need database credentials or external-service configuration.
function classifyScheduleFailure(attempt, attemptLookupError) {
  if (attemptLookupError) return "unknown";
  if (attempt && attempt.status === "published") return "published";
  if (attempt && ["unknown", "processing"].includes(attempt.status)) return "unknown";
  return "failed";
}

module.exports = { classifyScheduleFailure };
