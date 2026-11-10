"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getWorkerConfig, createWorker, MAX_REQUEST_TIMEOUT_MS, DEFAULT_DRAIN_TIMEOUT_MS } = require("../scheduleWorker");

test("worker config requires a secure backend URL and long secret", () => {
  assert.throws(() => getWorkerConfig({ PINPOSY_SCHEDULER_SECRET: "x".repeat(32) }), /BACKEND_URL/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "http://example.com", PINPOSY_SCHEDULER_SECRET: "x".repeat(32) }), /HTTPS/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "https://api.example.com", PINPOSY_SCHEDULER_SECRET: "short" }), /32 characters/);
  assert.deepEqual(
    getWorkerConfig({ PINPOSY_BACKEND_URL: "https://api.example.com/", PINPOSY_SCHEDULER_SECRET: "s".repeat(32) }),
    { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "s".repeat(32) }
  );
});

test("worker claims only one row per run to protect the fixed stale-claim lease", async () => {
  const calls = [];
  const logs = [];
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async (...args) => { calls.push(args); return { data: { ok: true, claimed: 3, published: 1, failed: 0, scheduled: 2, unknown: 0 } }; } },
    logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });
  await worker.tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://api.example.com/internal/pinterest/schedule/run");
  assert.deepEqual(calls[0][1], { limit: 1 });
  assert.equal(calls[0][2].headers["x-pinposy-scheduler-secret"], "secret-value");
  assert.equal(logs[0][1].scheduled, 2, "worker logs the number of safely rescheduled rows");
  assert.equal(JSON.stringify(logs).includes("secret-value"), false);
});

test("worker prevents overlapping ticks", async () => {
  let release;
  let calls = 0;
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async () => { calls += 1; await new Promise((resolve) => { release = resolve; }); return { data: { ok: true } }; } },
    logger: { info() {}, error() {} },
  });
  const first = worker.tick();
  await new Promise((resolve) => setImmediate(resolve));
  await worker.tick();
  assert.equal(calls, 1);
  release();
  await first;
});


test("worker releases its lock after a failed request and can retry", async () => {
  let calls = 0;
  const errors = [];
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary network failure");
      return { data: { ok: true, claimed: 0, published: 0, failed: 0, unknown: 0 } };
    } },
    logger: { info() {}, error: (...args) => errors.push(args) },
  });

  await worker.tick();
  await worker.tick();

  assert.equal(calls, 2);
  assert.equal(errors.length, 1);
});

test("worker rejects malformed backend responses without exposing credentials", async () => {
  const errors = [];
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async () => ({ data: { ok: false, error: "secret-value" } }) },
    logger: { info() {}, error: (...args) => errors.push(args) },
  });

  await worker.tick();

  assert.equal(errors.length, 1);
  assert.equal(JSON.stringify(errors).includes("secret-value"), false);
  assert.equal(errors[0][0], "schedule_worker.batch_failed");
});

test("stop prevents future polling and waits for the active request", async () => {
  let calls = 0;
  let release;
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async () => {
      calls += 1;
      await new Promise((resolve) => { release = resolve; });
      return { data: { ok: true } };
    } },
    logger: { info() {}, error() {} },
    intervalMs: 5,
  });

  worker.start();
  await new Promise((resolve) => setImmediate(resolve));
  const stopping = worker.stop();
  release();
  await stopping;
  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.equal(calls, 1);
});

test("worker caps request timeout below stale-claim recovery even when configured too high", async () => {
  let requestOptions;
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async (_url, _body, options) => {
      requestOptions = options;
      return { data: { ok: true } };
    } },
    logger: { info() {}, error() {} },
    timeoutMs: 60 * 60_000,
  });

  await worker.tick();

  assert.equal(MAX_REQUEST_TIMEOUT_MS, 15 * 60_000);
  assert.equal(requestOptions.timeout, MAX_REQUEST_TIMEOUT_MS);
});


test("worker shutdown uses a bounded drain and reports an unfinished request", async () => {
  let release;
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async () => {
      await new Promise((resolve) => { release = resolve; });
      return { data: { ok: true } };
    } },
    logger: { info() {}, error() {} },
    drainTimeoutMs: 0,
  });

  const request = worker.tick();
  await new Promise((resolve) => setImmediate(resolve));
  const drained = await worker.stop();

  assert.equal(drained, false, "stop must report when the in-flight request did not drain");
  release();
  await request;
  assert.equal(DEFAULT_DRAIN_TIMEOUT_MS, 20_000);
});

test("worker stop prevents polling even when the active request outlives the drain window", async () => {
  let calls = 0;
  let release;
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async () => {
      calls += 1;
      await new Promise((resolve) => { release = resolve; });
      return { data: { ok: true } };
    } },
    logger: { info() {}, error() {} },
    intervalMs: 5,
    drainTimeoutMs: 0,
  });

  worker.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await worker.stop(), false);
  await worker.tick();
  assert.equal(calls, 1, "stopped worker must not start another request");
  release();
});
