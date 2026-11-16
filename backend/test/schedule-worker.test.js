"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getWorkerConfig, createWorker, getNextPollDelayMs, MAX_REQUEST_TIMEOUT_MS, DEFAULT_DRAIN_TIMEOUT_MS, MAX_RETRY_INTERVAL_MS } = require("../scheduleWorker");

test("worker config requires a secure backend URL and long secret", () => {
  assert.throws(() => getWorkerConfig({ PINPOSY_SCHEDULER_SECRET: "x".repeat(32) }), /BACKEND_URL/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "http://example.com", PINPOSY_SCHEDULER_SECRET: "x".repeat(32) }), /HTTPS/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "https://api.example.com/api", PINPOSY_SCHEDULER_SECRET: "x".repeat(32) }), /only the backend origin/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "https://user:pass@api.example.com", PINPOSY_SCHEDULER_SECRET: "x".repeat(32) }), /only the backend origin/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "https://api.example.com?debug=1", PINPOSY_SCHEDULER_SECRET: "x".repeat(32) }), /only the backend origin/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "https://api.example.com", PINPOSY_SCHEDULER_SECRET: "short" }), /32 characters/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "https://api.example.com", PINPOSY_SCHEDULER_SECRET: "s".repeat(16) + " " + "s".repeat(16) }), /must not contain whitespace/);
  assert.throws(() => getWorkerConfig({ PINPOSY_BACKEND_URL: "https://api.example.com", PINPOSY_SCHEDULER_SECRET: " " + "s".repeat(32) }), /must not contain whitespace/);
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
    client: { post: async (...args) => { calls.push(args); return { data: { ok: true, claimed: 1, published: 0, failed: 0, scheduled: 1, unknown: 0, results: [{ schedule_id: "schedule-1", status: "scheduled" }] } }; } },
    logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });
  await worker.tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://api.example.com/internal/pinterest/schedule/run");
  assert.deepEqual(calls[0][1], { limit: 1 });
  assert.equal(calls[0][2].headers["x-pinposy-scheduler-secret"], "secret-value");
  assert.equal(calls[0][2].maxRedirects, 0, "scheduler secret must never be forwarded across redirects");
  assert.equal(logs[0][1].scheduled, 1, "worker logs the number of safely rescheduled rows");
  assert.equal(JSON.stringify(logs).includes("secret-value"), false);
});

test("worker prevents overlapping ticks", async () => {
  let release;
  let calls = 0;
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async () => { calls += 1; await new Promise((resolve) => { release = resolve; }); return { data: { ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0, results: [] } }; } },
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
      return { data: { ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0, results: [] } };
    } },
    logger: { info() {}, error: (...args) => errors.push(args) },
  });

  await worker.tick();
  await worker.tick();

  assert.equal(calls, 2);
  assert.equal(errors.length, 1);
});

test("worker rejects incomplete scheduler summaries instead of treating them as an empty queue", async () => {
  const errors = [];
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async () => ({ data: { ok: true } }) },
    logger: { info() {}, error: (...args) => errors.push(args) },
  });

  await worker.tick();

  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "schedule_worker.batch_failed");
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

test("worker tick emits a server-generated correlation ID in safe logs", async () => {
  const originalInfo = console.info;
  const output = [];
  console.info = (value) => output.push(value);
  try {
    const worker = createWorker({
      config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
      client: { post: async () => ({ data: { ok: true, claimed: 1, published: 1, failed: 0, scheduled: 0, unknown: 0, results: [{ schedule_id: "schedule-1", status: "published" }] } }) },
    });
    await worker.tick();
  } finally {
    console.info = originalInfo;
  }
  assert.equal(output.length, 1);
  const record = JSON.parse(output[0]);
  assert.equal(record.event, "schedule_worker.batch_completed");
  assert.match(record.correlation_id, /^[a-f0-9-]{36}$/i);
  assert.equal(output[0].includes("secret-value"), false);
});

 
test("worker backs off after consecutive failures and resets polling cadence after recovery", async () => {
  const scheduled = [];
  const cancelled = [];
  let calls = 0;
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary outage");
      return { data: { ok: true, claimed: 0, published: 0, failed: 0, unknown: 0 } };
    } },
    logger: { info() {}, error() {} },
    intervalMs: 10_000,
    schedule: (callback, delay) => {
      const timer = { callback, delay };
      scheduled.push(timer);
      return timer;
    },
    cancelSchedule: (timer) => cancelled.push(timer),
  });

  worker.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 20_000, "first failure doubles the normal poll interval");

  scheduled[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].delay, 10_000, "successful recovery restores the normal cadence");

  await worker.stop();
  assert.deepEqual(cancelled, [scheduled[1]]);
  assert.equal(getNextPollDelayMs(0, 10_000), 10_000);
  assert.equal(getNextPollDelayMs(1, 10_000), 20_000);
  assert.equal(getNextPollDelayMs(3, 10_000), 80_000);
  assert.equal(getNextPollDelayMs(99, 10_000), MAX_RETRY_INTERVAL_MS);
});


test("worker logs safe failure diagnostics without leaking provider or request secrets", async () => {
  const errors = [];
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "scheduler-secret-value" },
    client: { post: async () => {
      const error = new Error("request failed with scheduler-secret-value");
      error.code = "ECONNRESET";
      error.response = { status: 503, config: { headers: { authorization: "Bearer private-token" } } };
      throw error;
    } },
    logger: { info() {}, error: (...args) => errors.push(args) },
  });

  await worker.tick();

  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "schedule_worker.batch_failed");
  assert.deepEqual(errors[0][1], {
    error_name: "Error",
    error_code: "ECONNRESET",
    http_status: 503,
  });
  assert.equal(JSON.stringify(errors).includes("scheduler-secret-value"), false);
  assert.equal(JSON.stringify(errors).includes("private-token"), false);
});


test("default worker logger persists safe failure diagnostics", async () => {
  const originalError = console.error;
  const output = [];
  console.error = (value) => output.push(value);
  try {
    const worker = createWorker({
      config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "scheduler-secret-value" },
      client: { post: async () => {
        const error = new Error("scheduler-secret-value private-token");
        error.name = "AxiosError";
        error.code = "ECONNRESET";
        error.response = { status: 503, config: { headers: { authorization: "Bearer private-token" } } };
        throw error;
      } },
    });
    await worker.tick();
  } finally {
    console.error = originalError;
  }
  assert.equal(output.length, 1);
  const record = JSON.parse(output[0]);
  assert.equal(record.event, "schedule_worker.batch_failed");
  assert.equal(record.error_name, "AxiosError");
  assert.equal(record.error_code, "ECONNRESET");
  assert.equal(record.status, 503);
  assert.equal(output[0].includes("scheduler-secret-value"), false);
  assert.equal(output[0].includes("private-token"), false);
});


test("worker safely ignores hostile error diagnostic getters", async () => {
  const errors = [];
  const hostile = new Error("private payload");
  Object.defineProperty(hostile, "name", { get() { throw new Error("name getter secret"); } });
  Object.defineProperty(hostile, "code", { get() { throw new Error("code getter secret"); } });
  Object.defineProperty(hostile, "response", { get() { throw new Error("response getter secret"); } });
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "scheduler-secret-value" },
    client: { post: async () => { throw hostile; } },
    logger: { info() {}, error: (...args) => errors.push(args) },
  });
  await assert.doesNotReject(worker.tick());
  assert.equal(errors.length, 1);
  assert.deepEqual(errors[0], ["schedule_worker.batch_failed", {}]);
  assert.equal(JSON.stringify(errors).includes("secret"), false);
});

 
test("worker drains a due backlog quickly but keeps the normal idle polling cadence", async () => {
  const scheduled = [];
  let calls = 0;
  const worker = createWorker({
    config: { endpoint: "https://api.example.com/internal/pinterest/schedule/run", secret: "secret-value" },
    client: { post: async () => {
      calls += 1;
      return { data: calls === 1
        ? { ok: true, claimed: 1, published: 1, failed: 0, scheduled: 0, unknown: 0, results: [{ schedule_id: "schedule-1", status: "published" }] }
        : { ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0, results: [] } };
    } },
    logger: { info() {}, error() {} },
    intervalMs: 30_000,
    schedule: (callback, delay) => { const timer = { callback, delay }; scheduled.push(timer); return timer; },
    cancelSchedule() {},
  });

  worker.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduled[0].delay, 250, "a claimed row should trigger a quick next claim");
  scheduled[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(scheduled[1].delay, 30_000, "an empty queue should return to idle cadence");
  await worker.stop();
});
