const test = require("node:test");
const assert = require("node:assert/strict");
const { isSamePinScheduleRequest } = require("../pinterestSchedule");

const existing = {
  scheduled_at: "2026-11-20T10:30:00.000Z",
  timezone: "Europe/Moscow",
  destination_url: "https://example.com/article",
  pinterest_board_id: "board-123",
  pinterest_account_id: "account-456",
};

const requested = {
  scheduledAt: new Date("2026-11-20T10:30:00.000Z"),
  timezone: "Europe/Moscow",
  destinationUrl: "https://example.com/article",
  pinterestBoardId: "board-123",
  pinterestAccountId: "account-456",
};

test("recognizes an exact retry after the original schedule response was lost", () => {
  assert.equal(isSamePinScheduleRequest(existing, requested), true);
});

test("does not treat a changed time as an idempotent retry", () => {
  assert.equal(isSamePinScheduleRequest(existing, { ...requested, scheduledAt: new Date("2026-11-20T10:31:00.000Z") }), false);
});

test("does not treat a changed timezone as an idempotent retry", () => {
  assert.equal(isSamePinScheduleRequest(existing, { ...requested, timezone: "UTC" }), false);
});

test("does not treat a changed destination URL as an idempotent retry", () => {
  assert.equal(isSamePinScheduleRequest(existing, { ...requested, destinationUrl: "https://example.com/other" }), false);
});

test("does not treat a different Pinterest board or account as an idempotent retry", () => {
  assert.equal(isSamePinScheduleRequest(existing, { ...requested, pinterestBoardId: "board-other" }), false);
  assert.equal(isSamePinScheduleRequest(existing, { ...requested, pinterestAccountId: "account-other" }), false);
});

test("fails closed for missing or invalid schedule data", () => {
  assert.equal(isSamePinScheduleRequest(null, requested), false);
  assert.equal(isSamePinScheduleRequest(existing, null), false);
  assert.equal(isSamePinScheduleRequest({ ...existing, scheduled_at: "not-a-date" }, requested), false);
});
