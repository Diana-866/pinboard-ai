const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyScheduleFailure } = require("../pinterestSchedule");

test("a disconnected Pinterest account before publication is a terminal failure", () => {
  // withAccount rejects before begin_pinterest_publish, so no remote publish
  // attempt exists and the schedule can safely be marked failed.
  assert.equal(classifyScheduleFailure(null, null), "failed");
});

test("an unreadable publish journal is unknown and must not be retried", () => {
  assert.equal(classifyScheduleFailure(null, new Error("database unavailable")), "unknown");
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
});

test("a confirmed pre-publication rejection is failed", () => {
  assert.equal(classifyScheduleFailure({ status: "failed" }, null), "failed");
});
