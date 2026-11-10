const test = require("node:test");
const assert = require("node:assert/strict");
const { sortProjectsForProvisioning } = require("../projectProvisioningOrder");

test("orders projects oldest-first with deterministic ID tie-break", () => {
  const rows = [
    { id: "b", created_at: "2026-02-01T00:00:00.000Z" },
    { id: "z", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "a", created_at: "2026-01-01T00:00:00.000Z" },
  ];

  const sorted = sortProjectsForProvisioning(rows);
  assert.deepEqual(sorted.map((row) => row.id), ["a", "z", "b"]);
  assert.deepEqual(rows.map((row) => row.id), ["b", "z", "a"]);
});

test("returns an empty list for a malformed project result", () => {
  assert.deepEqual(sortProjectsForProvisioning(null), []);
  assert.deepEqual(sortProjectsForProvisioning({ id: "project" }), []);
});
