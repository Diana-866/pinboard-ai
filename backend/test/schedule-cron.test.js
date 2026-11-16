"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runOnce, REQUEST_TIMEOUT_MS } = require("../scheduleCron");

const config = {
  endpoint: "https://api.example.com/internal/pinterest/schedule/run",
  secret: "scheduler-secret-value",
};

test("one-shot cron invokes one authenticated batch and releases its HTTP agents", async () => {
  const calls = [];
  const destroyed = [];
  const events = [];
  const result = await runOnce({
    config,
    client: { post: async (...args) => {
      calls.push(args);
      for (const agent of [args[2].httpAgent, args[2].httpsAgent]) {
        assert.equal(agent.options.keepAlive, false);
        const destroy = agent.destroy.bind(agent);
        agent.destroy = () => { destroyed.push(agent); return destroy(); };
      }
      return { data: { ok: true, claimed: 1, published: 1, failed: 0, scheduled: 0, unknown: 0,
        results: [{ schedule_id: "schedule-1", status: "published" }] } };
    } },
    logger: { info: (...args) => events.push(args), error: (...args) => events.push(args) },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], config.endpoint);
  assert.deepEqual(calls[0][1], { limit: 1 });
  assert.equal(calls[0][2].timeout, REQUEST_TIMEOUT_MS);
  assert.equal(calls[0][2].maxRedirects, 0);
  assert.equal(calls[0][2].headers["x-pinposy-scheduler-secret"], config.secret);
  assert.equal(destroyed.length, 2);
  assert.equal(result.published, 1);
  assert.deepEqual(events, [["schedule_cron.batch_completed"]]);
});

test("one-shot cron releases agents and logs only redacted diagnostics on request failure", async () => {
  const destroyed = [];
  const events = [];
  const error = Object.assign(new Error("private request payload"), { code: "ECONNRESET" });
  await assert.rejects(runOnce({
    config,
    client: { post: async (...args) => {
      for (const agent of [args[2].httpAgent, args[2].httpsAgent]) {
        const destroy = agent.destroy.bind(agent);
        agent.destroy = () => { destroyed.push(agent); return destroy(); };
      }
      throw error;
    } },
    logger: { info: (...args) => events.push(args), error: (...args) => events.push(args) },
  }), /private request payload/);
  assert.equal(destroyed.length, 2);
  assert.equal(events[0][0], "schedule_cron.batch_failed");
  assert.equal(JSON.stringify(events).includes(config.secret), false);
  assert.equal(JSON.stringify(events).includes("private request payload"), false);
});

test("one-shot cron rejects malformed and internally inconsistent backend responses", async () => {
  for (const data of [
    { ok: false, error: config.secret },
    { ok: true, claimed: 1, published: 1, failed: 0, scheduled: 0, unknown: 0,
      results: [{ schedule_id: "schedule-1", status: "failed" }] },
  ]) {
    await assert.rejects(runOnce({
      config, client: { post: async () => ({ data }) },
      logger: { info() {}, error() {} },
    }), /invalid scheduler response/);
  }
});

test("one-shot cron requires backend origin and a strong scheduler secret", async () => {
  const old = {
    backend: process.env.PINPOSY_BACKEND_URL,
    public: process.env.PUBLIC_BACKEND_URL,
    secret: process.env.PINPOSY_SCHEDULER_SECRET,
  };
  delete process.env.PINPOSY_BACKEND_URL;
  delete process.env.PUBLIC_BACKEND_URL;
  delete process.env.PINPOSY_SCHEDULER_SECRET;
  try {
    await assert.rejects(runOnce(), /PINPOSY_BACKEND_URL/);
  } finally {
    if (old.backend === undefined) delete process.env.PINPOSY_BACKEND_URL;
    else process.env.PINPOSY_BACKEND_URL = old.backend;
    if (old.public === undefined) delete process.env.PUBLIC_BACKEND_URL;
    else process.env.PUBLIC_BACKEND_URL = old.public;
    if (old.secret === undefined) delete process.env.PINPOSY_SCHEDULER_SECRET;
    else process.env.PINPOSY_SCHEDULER_SECRET = old.secret;
  }
});
