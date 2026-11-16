const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileReviewQueueRows } = require("../reviewQueueReconciliation");

function row(id, pinId) {
  return { id, pin_id: pinId, payload: { id, pinId, title: id } };
}

function pin(id, status = "pending", ownerId = "user-1", overrides = {}) {
  return {
    id,
    status,
    title: `Current ${id} title`,
    description: `Current ${id} description`,
    image_url: `https://cdn.example/${id}.png`,
    board_id: "board-1",
    boards: { id: "board-1", title: "Current board", projects: { user_id: ownerId } },
    ...overrides,
  };
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

test("refreshes creative fields from the saved pin instead of returning stale queue snapshots", () => {
  const stale = {
    ...row("review-1", "pin-1"),
    payload: {
      ...row("review-1", "pin-1").payload,
      title: "Old title",
      description: "Old description",
      imageUrl: "https://cdn.example/old.png",
      boardId: "old-board",
      boardName: "Old board",
      scheduledDate: "2026-11-20",
      scheduledTime: "18:30",
    },
  };
  const currentPin = pin("pin-1", "approved", "user-1", {
    title: "Regenerated title",
    description: "Updated description",
    image_url: "https://cdn.example/regenerated.png",
    board_id: "board-2",
    boards: { id: "board-2", title: "New board", projects: { user_id: "user-1" } },
  });

  const result = reconcileReviewQueueRows([stale], new Map([["pin-1", currentPin]]), "user-1");

  assert.equal(result.active[0].title, "Regenerated title");
  assert.equal(result.active[0].description, "Updated description");
  assert.equal(result.active[0].imageUrl, "https://cdn.example/regenerated.png");
  assert.equal(result.active[0].boardId, "board-2");
  assert.equal(result.active[0].boardName, "New board");
  assert.equal(result.active[0].scheduledDate, "2026-11-20");
  assert.equal(result.active[0].scheduledTime, "18:30");
});

test("does not resurrect a stale queue image when the saved pin image was removed", () => {
  const stale = {
    ...row("review-removed-image", "pin-1"),
    payload: {
      ...row("review-removed-image", "pin-1").payload,
      imageUrl: "https://cdn.example/old-image.png",
    },
  };
  const currentPin = pin("pin-1", "pending", "user-1", { image_url: null });

  const result = reconcileReviewQueueRows([stale], new Map([["pin-1", currentPin]]), "user-1");

  assert.equal(result.active[0].imageUrl, "");
});
