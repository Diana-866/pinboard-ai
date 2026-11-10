const test = require("node:test");
const assert = require("node:assert/strict");
const { isOwnedByUser } = require("../resourceOwnership");

test("ownership check accepts the same UUID regardless of letter case", () => {
  assert.equal(
    isOwnedByUser("A1B2C3D4-E5F6-47A8-9B0C-123456789ABC", "a1b2c3d4-e5f6-47a8-9b0c-123456789abc"),
    true
  );
});

test("ownership check rejects another user", () => {
  assert.equal(isOwnedByUser("user-a", "user-b"), false);
});

test("ownership check fails closed for missing, empty or non-string relationship values", () => {
  for (const owner of [null, undefined, "", "   ", {}, []]) {
    assert.equal(isOwnedByUser(owner, "user-a"), false);
  }
  assert.equal(isOwnedByUser("user-a", null), false);
  assert.equal(isOwnedByUser("user-a", "   "), false);
});
