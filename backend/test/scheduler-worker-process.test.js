"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { createWorker } = require("../scheduleWorker");

/**
 * The scheduler worker is started with `npm run worker` as its own process: it publishes a
 * customer's pin at the time they chose, with nobody watching. Every retry here is a timer, and a
 * timer is what decides whether a Node process is still alive.
 *
 * The worker unreferenced its timers so an embedded use (tests, the web process) would not be held
 * open - but the standalone entrypoint did the same, so the process finished its first poll, found
 * nothing left to wait for and exited with code 0. A supervisor sees a clean exit, publications
 * simply stop, and no alarm fires. The fix keeps unreferenced timers for embedded workers and
 * referenced ones for the standalone process; both halves are pinned here.
 */

const VALID_RESPONSE = {
  ok: true,
  claimed: 0,
  published: 0,
  failed: 0,
  scheduled: 0,
  unknown: 0,
  results: [],
};

/** A schedule double: records delays and whether the handle was unreferenced. */
function scheduleDouble() {
  const calls = { delays: [], unrefs: 0, referenced: 0 };
  return {
    calls,
    schedule: (fn, delay) => {
      calls.delays.push(delay);
      return { unref: () => { calls.unrefs += 1; }, ref: () => { calls.referenced += 1; } };
    },
    cancelSchedule: () => {},
  };
}

function workerWith(options = {}) {
  const doubles = scheduleDouble();
  const worker = createWorker({
    config: { endpoint: "http://127.0.0.1:1/internal/pinterest/schedule/run", secret: "s".repeat(40) },
    client: { post: async () => ({ data: VALID_RESPONSE }) },
    logger: { info: () => {}, error: () => {} },
    intervalMs: 30_000,
    schedule: doubles.schedule,
    cancelSchedule: doubles.cancelSchedule,
    ...options,
  });
  return { worker, doubles };
}

/** The worker only schedules while it is started, so the doubles must run for real. */
async function startAndWaitForSchedule(worker, doubles, expected = 1) {
  worker.start();
  const deadline = Date.now() + 2_000;
  while (doubles.calls.delays.length < expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(doubles.calls.delays.length >= expected, "the worker must schedule its next poll");
}

test("an embedded worker lets the process exit instead of being held open by a timer", async () => {
  const { worker, doubles } = workerWith();
  await startAndWaitForSchedule(worker, doubles);
  assert.equal(doubles.calls.unrefs, 1, "the retry timer must not keep an embedding process alive");
});

test("the standalone worker keeps its process alive between polls", async () => {
  const { worker, doubles } = workerWith({ keepProcessAlive: true });
  await startAndWaitForSchedule(worker, doubles);
  assert.equal(doubles.calls.unrefs, 0, "a referenced timer is the only thing keeping the worker running");
});

test("a kept-alive worker still backs off after a failure instead of spinning", async () => {
  const doubles = scheduleDouble();
  let attempts = 0;
  const worker = createWorker({
    config: { endpoint: "http://127.0.0.1:1/internal/pinterest/schedule/run", secret: "s".repeat(40) },
    client: { post: async () => { attempts += 1; throw new Error("backend down"); } },
    logger: { info: () => {}, error: () => {} },
    intervalMs: 1_000,
    keepProcessAlive: true,
    schedule: doubles.schedule,
    cancelSchedule: doubles.cancelSchedule,
  });

  await startAndWaitForSchedule(worker, doubles);

  assert.equal(attempts, 1);
  assert.deepEqual(doubles.calls.delays, [2_000], "the first failure doubles the base interval");
  assert.equal(doubles.calls.unrefs, 0, "a failing worker must not let its process die either");
});

test("the standalone entrypoint keeps polling instead of exiting after its first request", async (t) => {
  // End to end with a real child process: this is the only shape that could catch the defect,
  // because the defect was the event loop emptying - no unit assertion about timers can prove it.
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ at: Date.now(), secret: req.headers["x-pinposy-scheduler-secret"] });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(VALID_RESPONSE));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const child = spawn(process.execPath, [path.join(__dirname, "..", "scheduleWorker.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PINPOSY_BACKEND_URL: `http://127.0.0.1:${port}`,
      PINPOSY_SCHEDULER_SECRET: "s".repeat(40),
      // The floor is 5 s; two polls therefore need a little over five seconds.
      PINPOSY_SCHEDULER_INTERVAL_MS: "5000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let exited = null;
  child.on("exit", (code, signal) => { exited = { code, signal }; });

  try {
    const deadline = Date.now() + 12_000;
    while (requests.length < 2 && Date.now() < deadline && !exited) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assert.equal(exited, null, `the worker exited after ${requests.length} request(s) with code ${exited && exited.code}`);
    assert.ok(requests.length >= 2, `the worker polled only ${requests.length} time(s) in twelve seconds`);
    assert.equal(requests[0].secret, "s".repeat(40), "the scheduler secret must be presented on every request");
    assert.ok(requests[1].at - requests[0].at >= 4_000, "the second poll must respect the configured interval");
  } finally {
    child.kill();
    await new Promise((resolve) => server.close(resolve));
  }
});
