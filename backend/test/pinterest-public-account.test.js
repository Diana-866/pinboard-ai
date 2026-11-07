const test = require("node:test");
const assert = require("node:assert/strict");
const {
  toPublicPinterestAccount,
  toDisconnectedPinterestAccount,
} = require("../pinterestPublicAccount");

const secretAccount = {
  id: "account-1",
  pinterest_user_id: "pinterest-1",
  username: "sample",
  access_token: "access-secret",
  refresh_token: "refresh-secret",
  refresh_state: "uncertain",
  expires_at: "2026-11-07T12:00:00.000Z",
  user_id: "private-user-id",
};

test("public Pinterest account projection exposes metadata but never credentials", () => {
  const result = toPublicPinterestAccount(secretAccount, Date.parse("2026-11-07T11:00:00.000Z"));
  assert.deepEqual(result, {
    id: "account-1",
    pinterest_user_id: "pinterest-1",
    username: "sample",
    expires_at: "2026-11-07T12:00:00.000Z",
    needs_reauth: true,
  });
  assert.equal("access_token" in result, false);
  assert.equal("refresh_token" in result, false);
  assert.equal("user_id" in result, false);
});

test("expired token metadata requests reauthorization", () => {
  const result = toPublicPinterestAccount({
    ...secretAccount,
    refresh_state: "ready",
    expires_at: "2026-11-07T10:00:00.000Z",
  }, Date.parse("2026-11-07T11:00:00.000Z"));
  assert.equal(result.needs_reauth, true);
});

test("disconnect response projection excludes all token material", () => {
  const result = toDisconnectedPinterestAccount(secretAccount);
  assert.deepEqual(result, { id: "account-1", username: "sample" });
  assert.equal(JSON.stringify(result).includes("access-secret"), false);
  assert.equal(JSON.stringify(result).includes("refresh-secret"), false);
});
