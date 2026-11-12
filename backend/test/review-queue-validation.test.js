const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeReviewQueuePin } = require("../reviewQueueValidation");

test("normalizes a review item and strips unrecognized fields", () => {
  const result = normalizeReviewQueuePin("review-1", {
    id: "review-1",
    title: "  A useful pin  ",
    description: "Description",
    boardName: "Board",
    pinId: "pin-123",
    privateToken: "must-not-persist",
  });
  assert.equal(result.title, "A useful pin");
  assert.equal(result.pinId, "pin-123");
  assert.equal("privateToken" in result, false);
  assert.equal(result.aspectRatio, "2:3");
});

test("rejects mismatched IDs and invalid payloads", () => {
  assert.throws(() => normalizeReviewQueuePin("one", { id: "two", title: "Title" }), { httpStatus: 422 });
  assert.throws(() => normalizeReviewQueuePin("one", null), { httpStatus: 422 });
});

test("rejects empty/oversized titles and oversized descriptions", () => {
  assert.throws(() => normalizeReviewQueuePin("one", { id: "one", title: " " }), { httpStatus: 422 });
  assert.throws(() => normalizeReviewQueuePin("one", { id: "one", title: "x".repeat(101) }), { httpStatus: 422 });
  assert.throws(() => normalizeReviewQueuePin("one", { id: "one", title: "ok", description: "x".repeat(501) }), { httpStatus: 422 });
});

test("bounds optional metadata before it reaches the database", () => {
  const result = normalizeReviewQueuePin("one", {
    id: "one", title: "ok", boardName: "b".repeat(200), imageUrl: "x".repeat(3000),
  });
  assert.equal(result.boardName.length, 120);
  assert.equal(result.imageUrl.length, 2048);
});

test("rejects non-string title and description instead of coercing objects", () => {
  assert.throws(() => normalizeReviewQueuePin("one", { id: "one", title: { text: "Title" } }), { httpStatus: 422 });
  assert.throws(() => normalizeReviewQueuePin("one", { id: "one", title: "Title", description: { text: "Description" } }), { httpStatus: 422 });
  assert.throws(() => normalizeReviewQueuePin("one", { id: "one", title: 123 }), { httpStatus: 422 });
});
