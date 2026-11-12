const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileReviewQueueRows } = require("../reviewQueueReconciliation");

function row(id, pinId) {
  return { id, pin_id: pinId, payload: { id, pinId, title: id, description: "" } };
}

function pin(id, status = "pending", ownerId = "user-1") {
  return { id, status, boards: { id: "board-1", projects: { user_id: ownerId } } };
}

test("keeps demo queue items and owned pins that are not rejected", () => {
  const result = reconcileReviewQueueRows(
    [row("demo", null), row("pending", "pin-1"), row("approved", "pin-2")],
    new Map([["pin-1", pin("pin-1")], ["pin-2", pin("pin-2", "approved")]]),
    "user-1",
  );
  assert.deepEqual(result.staleIds, []);
  assert.deepEqual(result.invalidIds, []);
  assert.deepEqual(result.active.map((item) => item.id), ["demo", "pending", "approved"]);
  assert.equal(result.active[1].pinStatus, "pending");
  assert.equal(result.active[2].pinStatus, "approved");
});

test("removes rejected, missing and foreign-owned pins from the review queue", () => {
  const result = reconcileReviewQueueRows(
    [row("rejected", "pin-1"), row("missing", "pin-2"), row("foreign", "pin-3")],
    new Map([
      ["pin-1", pin("pin-1", "rejected")],
      ["pin-3", pin("pin-3", "pending", "another-user")],
    ]),
    "user-1",
  );
  assert.deepEqual(result.active, []);
  assert.deepEqual(result.staleIds, ["rejected", "missing", "foreign"]);
  assert.deepEqual(result.invalidIds, []);
});

test("uses the persisted pin_id when present and falls back to legacy payload pinId", () => {
  const result = reconcileReviewQueueRows(
    [
      { id: "persisted", pin_id: "pin-1", payload: { id: "persisted", pinId: "wrong-pin", title: "A", description: "" } },
      { id: "legacy", pin_id: null, payload: { id: "legacy", pinId: "pin-2", title: "B", description: "" } },
    ],
    new Map([["pin-1", pin("pin-1")], ["pin-2", pin("pin-2")]]),
    "user-1",
  );
  assert.deepEqual(result.active.map((item) => item.pinId), ["pin-1", "pin-2"]);
  assert.deepEqual(result.staleIds, []);
  assert.deepEqual(result.invalidIds, []);
});

test("identifies malformed persisted payloads for safe restore failure", () => {
  const result = reconcileReviewQueueRows(
    [
      row("valid", null),
      { id: "missing-title", pin_id: null, payload: { id: "missing-title", description: "" } },
      { id: "missing-description", pin_id: null, payload: { id: "missing-description", title: "A" } },
      { id: "mismatched-id", pin_id: null, payload: { id: "other", title: "A", description: "" } },
      { id: "array-payload", pin_id: null, payload: [] },
      { id: "null-payload", pin_id: null, payload: null },
    ],
    new Map(),
    "user-1",
  );
  assert.deepEqual(result.active.map((item) => item.id), ["valid"]);
  assert.deepEqual(result.staleIds, []);
  assert.deepEqual(result.invalidIds, [
    "missing-title",
    "missing-description",
    "mismatched-id",
    "array-payload",
    "null-payload",
  ]);
});
