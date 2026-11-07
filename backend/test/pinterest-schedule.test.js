const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyScheduleFailure,
  canRetryScheduleFailure,
  getScheduleRetryDelayMinutes,
  buildPinScheduleSnapshot,
  resolvePinScheduleSnapshot,
  classifyLegacyScheduleAccount,
  getScheduleRetryability,
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


test("schedule snapshot captures bounded creative and resolved destination", () => {
  const snapshot = buildPinScheduleSnapshot({
    title: "A".repeat(150), description: "B".repeat(900), image_url: "https://cdn.example/pin-1.jpg",
  }, "https://example.com/article");
  assert.equal(snapshot.snapshot_title.length, 100);
  assert.equal(snapshot.snapshot_description.length, 800);
  assert.equal(snapshot.snapshot_image_url, "https://cdn.example/pin-1.jpg");
  assert.equal(snapshot.snapshot_destination_url, "https://example.com/article");
});

test("scheduled publication resolves the immutable snapshot after live pin edits", () => {
  const resolved = resolvePinScheduleSnapshot({
    snapshot_title: "Scheduled title", snapshot_description: "Scheduled copy",
    snapshot_image_url: "https://cdn.example/old.jpg", snapshot_destination_url: "https://old.example/",
  }, { title: "Edited title", description: "Edited copy", image_url: "https://cdn.example/new.jpg" });
  assert.deepEqual(resolved, {
    title: "Scheduled title", description: "Scheduled copy", image_url: "https://cdn.example/old.jpg",
    destination_url: "https://old.example/", is_snapshot: true,
  });
});

test("legacy schedules without snapshots retain live-pin compatibility", () => {
  const resolved = resolvePinScheduleSnapshot({ destination_url: "https://chosen.example/" }, {
    title: "Current", description: "Current copy", image_url: "https://cdn.example/current.jpg",
  });
  assert.equal(resolved.is_snapshot, false);
  assert.equal(resolved.title, "Current");
  assert.equal(resolved.image_url, "https://cdn.example/current.jpg");
});


test("legacy schedule account recovery uses the only active Pinterest account", () => {
  const account = { id: "account-a" };
  assert.deepEqual(classifyLegacyScheduleAccount([account]), { status: "selected", account });
});

test("legacy schedule account recovery requires explicit choice when multiple accounts exist", () => {
  const accounts = [{ id: "account-a" }, { id: "account-b" }];
  assert.deepEqual(classifyLegacyScheduleAccount(accounts), { status: "selection_required" });
  assert.deepEqual(classifyLegacyScheduleAccount(accounts, "account-b"), {
    status: "selected", account: accounts[1],
  });
});

test("legacy schedule account recovery never guesses when no account is connected", () => {
  assert.deepEqual(classifyLegacyScheduleAccount([]), { status: "no_account" });
});

test("legacy schedule account recovery rejects an account not in the user's active list", () => {
  assert.deepEqual(classifyLegacyScheduleAccount([{ id: "account-a" }], "other-user-account"), {
    status: "invalid_selection",
  });
});


test("retryability allows a failed schedule without any publication attempt", () => {
  assert.deepEqual(getScheduleRetryability({
    status: "failed", pinterest_account_id: "account-a", pinterest_board_id: "board-a",
    pins: { image_url: "https://cdn.example/pin.jpg" },
  }, null, false, true, false), { retryable: true, reason: null });
});

test("retryability allows only explicitly safe failed journal entries", () => {
  const schedule = {
    status: "failed", pinterest_account_id: "account-a", pinterest_board_id: "board-a",
    pins: { image_url: "https://cdn.example/pin.jpg" },
  };
  assert.deepEqual(getScheduleRetryability(schedule, { status: "failed", retry_safe: true }, false, true, false), {
    retryable: true, reason: null,
  });
  assert.equal(getScheduleRetryability(schedule, { status: "failed", retry_safe: false }, false, true, false).retryable, false);
  assert.equal(getScheduleRetryability(schedule, { status: "unknown", retry_safe: true }, false, true, false).retryable, false);
  assert.equal(getScheduleRetryability(schedule, { status: "processing", retry_safe: true }, false, true, false).retryable, false);
});

test("retryability blocks missing account, board, pin, publication, and duplicate active schedule", () => {
  const schedule = {
    status: "failed", pinterest_account_id: "account-a", pinterest_board_id: "board-a",
    pins: { image_url: "https://cdn.example/pin.jpg" },
  };
  assert.equal(getScheduleRetryability({ ...schedule, pinterest_account_id: null }, null, false, false, false).reason, "account_unavailable");
  assert.equal(getScheduleRetryability({ ...schedule, pinterest_board_id: null }, null, false, true, false).reason, "board_missing");
  assert.equal(getScheduleRetryability({ ...schedule, pins: { image_url: null } }, null, false, true, false).reason, "pin_unavailable");
  assert.equal(getScheduleRetryability(schedule, null, true, true, false).reason, "publication_exists");
  assert.equal(getScheduleRetryability(schedule, null, false, true, true).reason, "active_schedule_exists");
});
