const test = require("node:test");
const assert = require("node:assert/strict");

const { executeWithAccountToken } = require("../pinterestAccountRequest");

test("a 401 refreshes only the selected Pinterest account and retries with its rotated token", async () => {
  const original = { id: "account-a", access_token: "old-a" };
  const calls = [];
  const refreshes = [];
  const result = await executeWithAccountToken(
    original,
    async (token) => {
      calls.push(token);
      return token === "old-a" ? { status: 401 } : { status: 200, data: { ok: true } };
    },
    async (account) => {
      refreshes.push(account.id);
      return { ...account, access_token: "new-a" };
    },
    async () => {}
  );

  assert.deepEqual(calls, ["old-a", "new-a"]);
  assert.deepEqual(refreshes, ["account-a"]);
  assert.equal(result.status, 200);
  assert.equal(original.access_token, "old-a");
});

test("a 429 retry uses the refreshed token and waits once", async () => {
  const calls = [];
  const waits = [];
  const result = await executeWithAccountToken(
    { id: "account-b", access_token: "old-b" },
    async (token) => {
      calls.push(token);
      if (calls.length === 1) return { status: 401 };
      if (calls.length === 2) return { status: 429 };
      return { status: 200 };
    },
    async (account) => ({ ...account, access_token: "new-b" }),
    async (ms) => waits.push(ms)
  );

  assert.deepEqual(calls, ["old-b", "new-b", "new-b"]);
  assert.deepEqual(waits, [2000]);
  assert.equal(result.status, 200);
});

test("non-retryable Pinterest responses do not rotate credentials", async () => {
  let refreshCount = 0;
  const result = await executeWithAccountToken(
    { id: "account-c", access_token: "token-c" },
    async () => ({ status: 403 }),
    async (account) => {
      refreshCount += 1;
      return account;
    },
    async () => {}
  );

  assert.equal(result.status, 403);
  assert.equal(refreshCount, 0);
});
