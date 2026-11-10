const test = require("node:test");
const assert = require("node:assert/strict");
const { serializeProjectForClient } = require("../projectSerialization");

test("omits internal owner identity and preserves public project fields", () => {
  assert.deepEqual(serializeProjectForClient({
    id: "project-1",
    niche: "Travel",
    language: "en",
    user_id: "internal-user-id",
  }), {
    id: "project-1",
    niche: "Travel",
    language: "en",
  });
});

test("does not mutate the database row", () => {
  const project = { id: "project-1", user_id: "internal-user-id" };
  const serialized = serializeProjectForClient(project);
  assert.deepEqual(project, { id: "project-1", user_id: "internal-user-id" });
  assert.notEqual(serialized, project);
});

test("passes through null and non-object values", () => {
  assert.equal(serializeProjectForClient(null), null);
  assert.equal(serializeProjectForClient("invalid"), "invalid");
  assert.deepEqual(serializeProjectForClient(["not", "a", "project"]), ["not", "a", "project"]);
});
