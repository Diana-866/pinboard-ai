"use strict";

require("./helpers/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createAccountDeletionWorker, runStandaloneWorker } = require("../accountDeletionWorker");

/**
 * A scheduler the test drives by hand. The real worker polls on a timer, so the only way to prove "one
 * loop, not two" is to count what would have been scheduled.
 */
function createManualScheduler() {
  const scheduled = [];
  const schedule = (fn, interval) => {
    const handle = { fn, interval, unrefCalls: 0, cancelled: false, unref() { handle.unrefCalls += 1; } };
    scheduled.push(handle);
    return handle;
  };
  const cancelSchedule = (handle) => { if (handle) handle.cancelled = true; };
  return { scheduled, schedule, cancelSchedule };
}

/** A client whose claim stays in flight until the test releases it. */
function createHeldClient() {
  const state = { release: null, claims: 0 };
  const client = {
    supabaseUrl: "https://project.supabase.co",
    rpc(name) {
      if (name === "claim_account_deletion_jobs") {
        state.claims += 1;
        return new Promise((resolve) => {
          state.release = () => resolve({ data: [], error: null });
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { client, state };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("a second start() during an in-flight batch does not install a second polling loop", async () => {
  const { scheduled, schedule, cancelSchedule } = createManualScheduler();
  const events = [];
  const { client, state } = createHeldClient();
  const worker = createAccountDeletionWorker({
    client,
    logger: { info: (event) => events.push(event), error: () => {} },
    schedule,
    cancelSchedule,
    intervalMs: 250,
  });

  worker.start();
  await flush();
  // `timer` is null while the batch runs, so this used to pass the "already started" guard.
  worker.start();
  await flush();

  assert.equal(state.claims, 1, "the second start() must not run another batch");

  state.release();
  await flush();

  assert.equal(scheduled.length, 1, `exactly one continuation may be scheduled, got ${scheduled.length}`);
  assert.equal(scheduled[0].interval, 250);
  assert.equal(scheduled[0].unrefCalls, 1, "the poll timer must not keep the process alive");
  assert.ok(events.includes("account_deletion_worker.batch_completed"));
  await worker.stop();
});

test("start() after stop() schedules nothing more", async () => {
  const { scheduled, schedule, cancelSchedule } = createManualScheduler();
  const { client, state } = createHeldClient();
  const worker = createAccountDeletionWorker({
    client,
    logger: { info: () => {}, error: () => {} },
    schedule,
    cancelSchedule,
    shutdownTimeoutMs: 200,
  });

  worker.start();
  await flush();
  state.release();
  await flush();
  assert.equal(scheduled.length, 1);

  await worker.stop();
  assert.equal(scheduled[0].cancelled, true, "stopping must cancel the pending timer");

  worker.start();
  await flush();
  assert.equal(scheduled.length, 1, "a stopped worker must not restart itself");
  assert.equal(state.claims, 1);
});

test("a batch that finishes after stop() schedules nothing, so nothing polls a stopped worker", async () => {
  const { scheduled, schedule, cancelSchedule } = createManualScheduler();
  const { client, state } = createHeldClient();
  const worker = createAccountDeletionWorker({
    client,
    logger: { info: () => {}, error: () => {} },
    schedule,
    cancelSchedule,
    shutdownTimeoutMs: 5000,
  });

  worker.start();
  await flush();
  const stopping = worker.stop();
  // The batch completes while shutdown is waiting for it: its own `finally` must not re-arm the timer.
  state.release();
  const drained = await stopping;

  assert.equal(drained, true, "the in-flight batch is awaited, not abandoned");
  assert.deepEqual(scheduled, [], `no timer may outlive stop(), got ${scheduled.length}`);
});

test("a failing batch is logged and the loop keeps its schedule", async () => {
  const { scheduled, schedule, cancelSchedule } = createManualScheduler();
  const events = [];
  const worker = createAccountDeletionWorker({
    client: {
      supabaseUrl: "https://project.supabase.co",
      rpc() { return Promise.reject(new Error("database is down")); },
    },
    logger: { info: (event) => events.push(event), error: (event) => events.push(event) },
    schedule,
    cancelSchedule,
  });

  worker.start();
  await flush();

  assert.ok(events.includes("account_deletion_worker.batch_failed"), "the failure must be visible");
  assert.equal(scheduled.length, 1, "a failed batch must not stop the worker");
  await worker.stop();
});

test("the standalone entrypoint refuses to run without the explicit rollout opt-in", async () => {
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const entry = path.join(__dirname, "..", "accountDeletionWorker.js");
  const env = { ...process.env };
  delete env.ACCOUNT_DELETION_WORKER_ENABLED;

  const run = spawnSync(process.execPath, [entry], { env, encoding: "utf8", timeout: 20000 });

  assert.equal(run.status, 1, `the disabled worker must exit 1, got ${run.status}`);
  assert.match(String(run.stderr), /disabled/i, "the operator must be told why nothing happened");
});

test("the standalone entrypoint exits 0 only when the worker really drained", async () => {
  const exits = [];
  const listeners = {};
  const processObject = {
    once(signal, handler) { listeners[signal] = handler; },
  };
  const worker = {
    started: 0,
    stops: 0,
    start() { worker.started += 1; },
    async stop() { worker.stops += 1; return false; },
  };

  runStandaloneWorker({
    client: {},
    createWorker: () => worker,
    processObject,
    exit: (code) => exits.push(code),
  });
  assert.equal(worker.started, 1);

  await listeners.SIGTERM();
  // A second signal while shutting down must not run the shutdown twice.
  await listeners.SIGINT();
  assert.equal(worker.stops, 1);
  assert.deepEqual(exits, [75], "an abandoned job is not a clean shutdown");

  const cleanExits = [];
  const cleanWorker = { start() {}, async stop() { return true; } };
  const cleanListeners = {};
  runStandaloneWorker({
    client: {},
    createWorker: () => cleanWorker,
    processObject: { once(signal, handler) { cleanListeners[signal] = handler; } },
    exit: (code) => cleanExits.push(code),
  });
  await cleanListeners.SIGTERM();
  assert.deepEqual(cleanExits, [0]);
});

test("the standalone worker asks for a timer that keeps its process alive", () => {
  // Section 86 fixed the signal path (exit 75 instead of a clean exit while a job is abandoned).
  // The normal path had the same cause and no test: the poll timer was unreferenced, so the
  // standalone process drained one batch and exited with code 0, while every deletion request kept
  // waiting in the queue and the supervisor saw a healthy exit.
  const seen = [];
  const { worker } = runStandaloneWorker({
    client: { rpc: async () => ({ data: [], error: null }) },
    createWorker: (options) => {
      seen.push(options);
      return { start: () => {}, stop: async () => true, tick: async () => ({ claimed: 0 }) };
    },
    processObject: { once: () => {} },
    exit: () => {},
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].keepProcessAlive, true, "the standalone entrypoint must hold the event loop open");
  assert.ok(worker, "the entrypoint must still return the worker it started");
});

test("the standalone entrypoint keeps polling instead of exiting after its first batch", async () => {
  // The child stops itself after 7.5 s and prints how many batches it ran; a leaked child cannot
  // keep the suite alive, and the assertion is about the loop, not about the parent's ability to
  // kill a process (Windows cannot even deliver SIGTERM, section UA-072).
  const child = spawn(process.execPath, [path.join(__dirname, "helpers", "account-deletion-worker-child.cjs")], {
    cwd: path.join(__dirname, ".."),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  const exit = await new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));

  const claims = (output.match(/^claim \d+$/gm) || []).length;
  const alive = /^alive (\d+)$/m.exec(output);

  assert.equal(exit.code, 0, `the fixture must stop itself cleanly, got ${JSON.stringify(exit)}: ${output.slice(-200)}`);
  assert.ok(alive, `the fixture never reported that it was still running: ${output.slice(-200)}`);
  assert.ok(Number(alive[1]) >= 2, `the worker claimed only ${alive[1]} time(s) before the deadline`);
  assert.ok(claims >= 2, `only ${claims} claim line(s) were printed`);
});
