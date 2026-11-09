"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getWorkerConfig, createWorker } = require("../scheduleWorker");

test("worker config requires a secure backend URL and long secret", () => {
  assert.throws(() => getWorkerConfig({ PINPOSY_SCHEDULER_SECRET: "x".repeat(32) }), /BACKEND_URL/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "http://example.com", PINPOSY_SCHEDULER_SECRET: "x".repeat(32) }), /HTTPS/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "https://api.example.com", PINPOSY_SCHEDULER_SECRET: "short" }), /32 characters/);
  assert.deepEqual(
    getWorkerConfig({ PINPOSY_BACKEND_URL: "https://api.example.com/", PINPOSY_SCHEDULER_SECRET: "s".repeat(32) }),
    { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "s".repeat(32) }
  );
});

test("worker posts a bounded batch with its secret and logs only aggregate results", async () => {
  const calls = [];
  const logs = [];
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async (...args) => { calls.push(args); return { data: { ok: true, claimed: 2, published: 1, failed: 1, unknown: 0 } }; } },
    logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    batchLimit: 99,
  });
  await worker.tick();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], "https://api.example.com/internal/pinterest/schedule/run");
  assert.deepEqual(calls[0][1], { limit: 10 });
  assert.equal(calls[0][2].headers["x-pinposy-scheduler-secret"], "secret-value");
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
  assert.match(errors[0][1].message, /invalid worker response/);
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
