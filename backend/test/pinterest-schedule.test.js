const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyScheduleFailure,
  canRetryScheduleFailure,
  getScheduleRetryDelayMinutes,
} = require("../pinterestSchedule");

test("a disconnected Pinterest account before publication is a terminal failure", () => {
  assert.equal(classifyScheduleFailure(null, null), "failed");
});

test("an unreadable publish journal is unknown and must not be retried", () => {
  assert.equal(classifyScheduleFailure(null, new Error("database unavailable")), "unknown");
  assert.equal(canRetryScheduleFailure(null, new Error("database unavailable"), new Error("503")), false);
});

test("a confirmed remote publication wins over a later worker error", () => {
  assert.equal(classifyScheduleFailure({
    status: "published",
    pinterest_pin_id: "remote-pin-123",
  }, null), "published");
});

test("an ambiguous or still-processing publish attempt remains non-retryable", () => {
  assert.equal(classifyScheduleFailure({ status: "unknown" }, null), "unknown");
  assert.equal(classifyScheduleFailure({ status: "processing" }, null), "unknown");
  assert.equal(canRetryScheduleFailure({ status: "unknown" }, null, Object.assign(new Error("503"), { httpStatus: 503 })), false);
});

test("a failed journal retries only when the database marks it safe", () => {
  assert.equal(classifyScheduleFailure({ status: "failed", retry_safe: false }, null), "failed");
  assert.equal(canRetryScheduleFailure({ status: "failed", retry_safe: false }, null, Object.assign(new Error("503"), { httpStatus: 503 })), false);
  assert.equal(canRetryScheduleFailure({ status: "failed", retry_safe: true }, null, Object.assign(new Error("403"), { httpStatus: 403 })), true);
  assert.equal(canRetryScheduleFailure({ status: "unknown", retry_safe: true }, null, Object.assign(new Error("503"), { httpStatus: 503 })), false);
  assert.equal(canRetryScheduleFailure({ status: "processing", retry_safe: true }, null, Object.assign(new Error("503"), { httpStatus: 503 })), false);
});

test("transient pre-publication failures can retry when no publish attempt exists", () => {
  assert.equal(canRetryScheduleFailure(null, null, Object.assign(new Error("temporary upstream failure"), { httpStatus: 502 })), true);
  assert.equal(canRetryScheduleFailure(null, null, Object.assign(new Error("temporary service failure"), { httpStatus: 503 })), true);
  assert.equal(canRetryScheduleFailure(null, null, new Error("temporary database error")), true);
});

test("client errors before publication are terminal", () => {
  assert.equal(canRetryScheduleFailure(null, null, Object.assign(new Error("not found"), { httpStatus: 404 })), false);
  assert.equal(canRetryScheduleFailure(null, null, Object.assign(new Error("invalid board"), { httpStatus: 422 })), false);
});

test("retry delay grows exponentially and is capped at 30 minutes", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map(getScheduleRetryDelayMinutes), [1, 2, 4, 8, 16, 30, 30]);
});
