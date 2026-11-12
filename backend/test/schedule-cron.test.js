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
  const events = [];
  const error = new Error("private request payload");
  error.code = "ECONNRESET";
  error.response = {
    status: 503,
    config: { headers: { authorization: "Bearer private-token" } },
  };

  await assert.rejects(runOnce({
    config,
    client: { post: async () => { throw error; } },
    logger: {
      info: (...args) => events.push(args),
      error: (...args) => events.push(args),
    },
  }), /private request payload/);

  assert.equal(events[0][0], "schedule_cron.batch_failed");
  assert.equal(events[0][2], 503);
  assert.equal(JSON.stringify(events).includes("private-token"), false);
});
