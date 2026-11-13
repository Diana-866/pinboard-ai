const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileReviewQueueRows } = require("../reviewQueueReconciliation");

function row(id, pinId) {
  return { id, pin_id: pinId, payload: { id, pinId, title: id } };
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
});

test("uses the persisted pin_id when present and falls back to legacy payload pinId", () => {
  const result = reconcileReviewQueueRows(
    [
      { id: "persisted", pin_id: "pin-1", payload: { id: "persisted", pinId: "wrong-pin", title: "A" } },
      { id: "legacy", pin_id: null, payload: { id: "legacy", pinId: "pin-2", title: "B" } },
    ],
    new Map([["pin-1", pin("pin-1")], ["pin-2", pin("pin-2")]]),
    "user-1",
  );
  assert.deepEqual(result.active.map((item) => item.pinId), ["pin-1", "pin-2"]);
  assert.deepEqual(result.staleIds, []);
});

test("uses the current saved pin creative and never resurrects a missing image", () => {
  const result = reconcileReviewQueueRows(
    [{
      id: "queue-1",
      pin_id: "pin-1",
      payload: {
        id: "queue-1",
        pinId: "pin-1",
        title: "Stale title",
        description: "Stale description",
        imageUrl: "https://cdn.example/stale.png",
        boardId: "board-old",
        boardName: "Old board",
      },
    }],
    new Map([["pin-1", {
      id: "pin-1",
      status: "pending",
      title: "Current title",
      description: "Current description",
      image_url: null,
      board_id: "board-current",
      boards: { id: "board-current", title: "Current board", projects: { user_id: "user-1" } },
    }]]),
    "user-1",
  );

  assert.deepEqual(result.active, [{
    id: "queue-1",
    pinId: "pin-1",
    pinStatus: "pending",
    title: "Current title",
    description: "Current description",
    imageUrl: "",
    boardId: "board-current",
    boardName: "Current board",
  }]);
  assert.deepEqual(result.staleIds, []);
});

test("removes queue entries for pins with a persisted active or uncertain schedule", () => {
  const result = reconcileReviewQueueRows(
    [row("scheduled", "pin-1"), row("still-pending", "pin-2")],
    new Map([
      ["pin-1", pin("pin-1", "approved")],
      ["pin-2", pin("pin-2", "pending")],
    ]),
    "user-1",
    new Set(["pin-1"]),
  );
  assert.deepEqual(result.active.map((item) => item.id), ["still-pending"]);
  assert.deepEqual(result.staleIds, ["scheduled"]);
});
