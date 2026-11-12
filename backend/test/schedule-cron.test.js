"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runOnce, REQUEST_TIMEOUT_MS } = require("../scheduleCron");

const config = {
  endpoint: "https://api.example.com/internal/pinterest/schedule/run",
  secret: "scheduler-secret-value",
};

test("one-shot cron invokes one authenticated scheduler batch and exits", async () => {
  const calls = [];
  const events = [];
  const result = await runOnce({
    config,
    client: { post: async (...args) => {
      calls.push(args);
      return { data: { ok: true, claimed: 1, published: 1, failed: 0, scheduled: 0, unknown: 0 } };
    } },
    logger: {
      info: (...args) => events.push(args),
      error: (...args) => events.push(args),
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], config.endpoint);
  assert.deepEqual(calls[0][1], { limit: 1 });
  assert.equal(calls[0][2].timeout, REQUEST_TIMEOUT_MS);
  assert.equal(calls[0][2].headers["x-pinposy-scheduler-secret"], config.secret);
  assert.equal(result.published, 1);
  assert.deepEqual(events, [["schedule_cron.batch_completed"]]);
});

test("one-shot cron rejects malformed responses and logs no raw secrets", async () => {
  const events = [];
  await assert.rejects(runOnce({
    config,
    client: { post: async () => ({ data: { ok: false, error: config.secret } }) },
    logger: {
      info: (...args) => events.push(args),
      error: (...args) => events.push(args),
    },
  }), /invalid scheduler response/);

  assert.equal(events.length, 1);
  assert.equal(events[0][0], "schedule_cron.batch_failed");
  assert.equal(JSON.stringify(events).includes(config.secret), false);
});

test("one-shot cron redacts provider response details from diagnostics", async () => {
  const originalError = console.error;
  const output = [];
  const error = new Error("private request payload");
  error.code = "ECONNRESET";
  error.response = {
    status: 503,
    config: { headers: { authorization: "Bearer private-token" } },
  };

  console.error = (value) => output.push(value);
  try {
    await assert.rejects(runOnce({
      config,
      client: { post: async () => { throw error; } },
    }), /private request payload/);
  } finally {
    console.error = originalError;
  }

  assert.equal(output.length, 1);
  const record = JSON.parse(output[0]);
  assert.equal(record.event, "schedule_cron.batch_failed");
  assert.equal(record.status, 503);
  assert.equal(record.error_code, "ECONNRESET");
  assert.equal(output[0].includes("private-token"), false);
  assert.equal(output[0].includes("private request payload"), false);
});

test("one-shot cron survives hostile diagnostic getters without leaking payloads", async () => {
  const originalError = console.error;
  const output = [];
  const hostile = new Error("private payload");
  Object.defineProperty(hostile, "name", { get() { throw new Error("name secret"); } });
  Object.defineProperty(hostile, "code", { get() { throw new Error("code secret"); } });
  Object.defineProperty(hostile, "response", { get() { throw new Error("response secret"); } });

  console.error = (value) => output.push(value);
  try {
    await assert.rejects(runOnce({
      config,
      client: { post: async () => { throw hostile; } },
    }), /private payload/);
  } finally {
    console.error = originalError;
  }

  assert.equal(output.length, 1);
  const record = JSON.parse(output[0]);
  assert.equal(record.event, "schedule_cron.batch_failed");
  assert.equal(output[0].includes("private payload"), false);
  assert.equal(output[0].includes("secret"), false);
});

test("one-shot cron reports missing configuration without an uncaught exception", async () => {
  const oldBackend = process.env.PINPOSY_BACKEND_URL;
  const oldPublic = process.env.PUBLIC_BACKEND_URL;
  const oldSecret = process.env.PINPOSY_SCHEDULER_SECRET;
  const originalError = console.error;
  const output = [];
  delete process.env.PINPOSY_BACKEND_URL;
  delete process.env.PUBLIC_BACKEND_URL;
  delete process.env.PINPOSY_SCHEDULER_SECRET;
  console.error = (value) => output.push(value);
  try {
    await assert.rejects(runOnce(), /PINPOSY_BACKEND_URL/);
  } finally {
    console.error = originalError;
    if (oldBackend === undefined) delete process.env.PINPOSY_BACKEND_URL;
    else process.env.PINPOSY_BACKEND_URL = oldBackend;
    if (oldPublic === undefined) delete process.env.PUBLIC_BACKEND_URL;
    else process.env.PUBLIC_BACKEND_URL = oldPublic;
    if (oldSecret === undefined) delete process.env.PINPOSY_SCHEDULER_SECRET;
    else process.env.PINPOSY_SCHEDULER_SECRET = oldSecret;
  }

  assert.equal(output.length, 1);
  assert.equal(JSON.parse(output[0]).event, "schedule_cron.batch_failed");
});
