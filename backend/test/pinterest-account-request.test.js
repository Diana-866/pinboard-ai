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

test("a 401 after the one allowed 429 retry still refreshes the selected account", async () => {
  const calls = [];
  const waits = [];
  const result = await executeWithAccountToken(
    { id: "account-d", access_token: "old-d" },
    async (token) => {
      calls.push(token);
      if (calls.length === 1) return { status: 429 };
      if (calls.length === 2) return { status: 401 };
      return { status: 200 };
    },
    async (account) => ({ ...account, access_token: "new-d" }),
    async (ms) => waits.push(ms)
  );

  assert.deepEqual(calls, ["old-d", "old-d", "new-d"]);
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

test("a non-idempotent publish does not automatically replay after HTTP 429", async () => {
  const calls = [];
  const waits = [];
  const result = await executeWithAccountToken(
    { id: "account-publish", access_token: "token-publish" },
    async (token) => {
      calls.push(token);
      return { status: 429 };
    },
    async (account) => account,
    async (ms) => waits.push(ms),
    { retryRateLimit: false }
  );

  assert.deepEqual(calls, ["token-publish"]);
  assert.deepEqual(waits, []);
  assert.equal(result.status, 429);
});


const { getPinterestRetryDelayMs } = require("../pinterestAccountRequest");

test("Retry-After seconds are honored and bounded", () => {
  assert.equal(getPinterestRetryDelayMs("7"), 7000);
  assert.equal(getPinterestRetryDelayMs("120"), 60000);
  assert.equal(getPinterestRetryDelayMs("-1"), 2000);
  assert.equal(getPinterestRetryDelayMs("not-a-date"), 2000);
});

test("Retry-After HTTP date is converted to a non-negative delay", () => {
  const now = Date.parse("2026-11-09T12:00:00.000Z");
  assert.equal(getPinterestRetryDelayMs("Mon, 09 Nov 2026 12:00:05 GMT", now), 5000);
  assert.equal(getPinterestRetryDelayMs("Mon, 09 Nov 2026 11:59:00 GMT", now), 0);
});

test("429 replay uses the provider delay rather than a fixed sleep", async () => {
  const waits = [];
  let calls = 0;
  const result = await executeWithAccountToken(
    { id: "account-retry-after", access_token: "token" },
    async () => (++calls === 1
      ? { status: 429, retryAfterMs: 4500 }
      : { status: 200 }),
    async (account) => account,
    async (ms) => waits.push(ms)
  );
  assert.equal(result.status, 200);
  assert.deepEqual(waits, [4500]);
});
