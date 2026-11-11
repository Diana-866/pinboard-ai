const test = require("node:test");
const assert = require("node:assert/strict");
const { serializeBoardForClient } = require("../boardSerialization");

test("omits internal idempotency fields", () => {
  assert.deepEqual(serializeBoardForClient({
    id: "board-1", title: "Travel", create_request_id: "request",
    create_request_fingerprint: "a".repeat(64),
  }), { id: "board-1", title: "Travel" });
});

test("preserves the dedicated board category and SEO description", () => {
  assert.deepEqual(serializeBoardForClient({
    id: "board-1",
    title: "Small kitchen storage",
    category: "Home Decor",
    description: "Discover clever storage ideas for compact kitchens.",
  }), {
    id: "board-1",
    title: "Small kitchen storage",
    category: "Home Decor",
    description: "Discover clever storage ideas for compact kitchens.",
  });
});

test("omits nested project owner identity", () => {
  assert.deepEqual(serializeBoardForClient({
    id: "board-1", projects: { niche: "Travel", user_id: "private-id" },
  }), { id: "board-1", projects: { niche: "Travel" } });
});

test("sanitizes project relation arrays and preserves public metadata", () => {
  assert.deepEqual(serializeBoardForClient({
    id: "board-1", created_at: "2026-11-09",
    projects: [{ niche: "Travel", user_id: "private-id" }],
  }), {
    id: "board-1", created_at: "2026-11-09", projects: [{ niche: "Travel" }],
  });
});

test("passes through non-object input", () => {
  assert.equal(serializeBoardForClient(null), null);
  assert.equal(serializeBoardForClient("invalid"), "invalid");
});
