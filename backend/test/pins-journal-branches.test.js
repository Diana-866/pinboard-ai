"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");

/**
 * The journal state machine inside generatePins.
 *
 * pins-provider-boundary.test.js already proves the provider boundaries (no spend without a durable
 * usage fact, no second create request on recovery). What it never drove are the terminal branches:
 * a task the journal already marked failed, a task that succeeded but whose image cannot be
 * recovered, a journal write that fails mid-recovery, and a provider failure with and without a task
 * id. Those branches decide whether a customer is charged once, twice or not at all, so each one is
 * pinned here with the journal call it must produce.
 *
 * Every test drives generatePins through `loadPlan` so no text provider is involved.
 */

const gptunnelPath = require.resolve("../gptunnel");
const storagePath = require.resolve("../storage");

const provider = {
  generateTextWithUsage: async () => { throw new Error("text provider must not be called"); },
  generateImage: (...args) => provider.generateImageImpl(...args),
  generateImageImpl: async () => { throw new Error("image provider must not be called"); },
  waitForImageTask: (...args) => provider.waitForImageTaskImpl(...args),
  waitForImageTaskImpl: async () => { throw new Error("task polling must not be called"); },
};
const storage = {
  rehostImage: (...args) => storage.rehostImageImpl(...args),
  rehostImageImpl: async (url) => url,
  deletePinImageIfUnreferenced: (...args) => storage.deleteImpl(...args),
  deleteImpl: async () => true,
};

require.cache[gptunnelPath] = { id: gptunnelPath, filename: gptunnelPath, loaded: true, exports: provider };
require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: storage };

const { generatePins } = require("../pins");

const BOARD = { id: "board-1", title: "Board", description: "" };
const PROJECT = { niche: "test", tone: "neutral", language: "en" };

function task(overrides = {}) {
  return {
    task_index: 1,
    title: "Title",
    description: "Description",
    prompt: "A prompt",
    model: "flux-schnell",
    aspect_ratio: "2:3",
    provider_idempotency_key: "key-0001",
    status: "prepared",
    ...overrides,
  };
}

/** Runs generatePins with a saved journal and records every journal call. */
async function run(tasks, options = {}) {
  const calls = { updates: [], outcomes: [], deleted: [] };
  const pins = await generatePins(BOARD, PROJECT, "flux-schnell", tasks.length, "2:3", null, {
    loadPlan: async () => tasks,
    updateTask: async (index, status, payload) => { calls.updates.push({ index, status, payload }); },
    recordProviderOutcome: async (index, outcome, decision) => {
      calls.outcomes.push({ index, outcome, decision });
      if (options.outcomeError) throw options.outcomeError;
    },
    ...options.extra,
  });
  return { pins, calls };
}

test("a task the journal already failed is reported and never resubmitted", async () => {
  let submitted = false;
  provider.generateImageImpl = async () => { submitted = true; return { url: "x", price: 1, taskId: "t" }; };

  const { pins, calls } = await run([task({ status: "failed" })]);
  assert.equal(submitted, false, "a terminal failure must not be retried with a new provider call");
  assert.deepEqual(pins.failedTasks, [{ task_index: 1 }]);
  assert.equal(pins.length, 0);
  assert.equal(pins.plannedTaskCount, 1);
  assert.equal(calls.updates.length, 0);
});

test("a prepared task stays awaiting balance instead of spending the customer's credits", async () => {
  const { pins } = await run([task()], { extra: { allowPreparedTaskSubmission: () => false } });
  assert.deepEqual(pins.pendingTasks, [{ task_index: 1, status: "awaiting_balance" }]);
  assert.equal(pins.length, 0);
});

test("a task that already succeeded with a stored image becomes a pin without touching the provider", async () => {
  let providerCalls = 0;
  provider.generateImageImpl = async () => { providerCalls += 1; return { url: "x", price: 1, taskId: "t" }; };

  const { pins, calls } = await run([task({
    status: "succeeded",
    storage_url: "https://storage.example.invalid/pins/saved.png",
    provider_price: 0.6,
  })]);

  assert.equal(providerCalls, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].image_url, "https://storage.example.invalid/pins/saved.png");
  assert.equal(pins[0].credits_cost, 0.6);
  assert.equal(pins[0].status, "pending");
});

test("a succeeded task whose provider outcome was never journaled records it exactly once", async () => {
  let providerCalls = 0;
  provider.generateImageImpl = async () => { providerCalls += 1; return { url: "x", price: 1, taskId: "t" }; };

  const { pins, calls } = await run([task({
    status: "succeeded",
    storage_url: "https://storage.example.invalid/pins/saved.png",
    provider_price: 0.6,
    provider_task_id: "provider-task-9",
    provider_outcome_status: "submitting",
  })]);

  assert.equal(providerCalls, 0);
  assert.deepEqual(calls.outcomes, [{
    index: 1,
    outcome: { taskId: "provider-task-9", price: 0.6, resultUrl: null },
    decision: "succeeded",
  }]);
  assert.equal(pins.length, 1);
});

test("a succeeded task with no recoverable image is reported as unrecoverable, not resubmitted", async () => {
  let providerCalls = 0;
  provider.generateImageImpl = async () => { providerCalls += 1; return { url: "x", price: 1, taskId: "t" }; };

  const { pins } = await run([task({ status: "succeeded", provider_price: 0.6 })]);
  assert.equal(providerCalls, 0, "a terminal success must never become a second create request");
  assert.deepEqual(pins.unknownTasks, [{ task_index: 1, reason: "successful_result_unrecoverable" }]);
  assert.equal(pins.length, 0);
});

test("a journal failure during recovery rethrows and removes the orphaned copy", async () => {
  provider.generateImageImpl = async () => { throw new Error("provider must not be called"); };
  storage.rehostImageImpl = async () => "https://storage.example.invalid/pins/recovered.png";
  const deleted = [];
  storage.deleteImpl = async (url) => { deleted.push(url); return true; };

  const journalError = Object.assign(new Error("journal write failed"), { journalError: true });
  const error = await generatePins(BOARD, PROJECT, "flux-schnell", 1, "2:3", null, {
    loadPlan: async () => [task({
      status: "succeeded",
      provider_result_url: "https://provider.example.invalid/image.png",
      provider_price: 0.6,
      provider_task_id: "provider-task-9",
    })],
    updateTask: async () => { throw journalError; },
    recordProviderOutcome: async () => {},
  }).then(() => null, (caught) => caught);

  assert.equal(error, journalError, "a journal failure must abort the run, not be retried blindly");
  assert.deepEqual(deleted, ["https://storage.example.invalid/pins/recovered.png"],
    "the copy that no journal row references must be cleaned up");
});

test("a storage failure during recovery keeps the task unknown with the durable result", async () => {
  provider.generateImageImpl = async () => { throw new Error("provider must not be called"); };
  storage.rehostImageImpl = async () => { throw new Error("storage unavailable"); };

  const { pins } = await run([task({
    status: "succeeded",
    provider_result_url: "https://provider.example.invalid/image.png",
    provider_price: 0.6,
  })]);
  assert.deepEqual(pins.unknownTasks, [{ task_index: 1 }]);
  assert.equal(pins.length, 0);
});

test("a pending image task is journaled as queued and keeps its provider task id", async () => {
  provider.generateImageImpl = async () => ({ pending: true, taskId: "provider-task-pending" });
  const { pins, calls } = await run([task()]);

  assert.deepEqual(pins.pendingTasks, [{ task_index: 1, task_id: "provider-task-pending" }]);
  assert.ok(calls.updates.some((entry) =>
    entry.index === 1 && entry.status === "queued" && entry.payload && entry.payload.providerTaskId === "provider-task-pending"));
  assert.equal(pins.length, 0);
});

test("a provider answer without a url or a price is unknown and never becomes a pin", async () => {
  provider.generateImageImpl = async () => ({ url: "https://provider.example.invalid/x.png" });
  const { pins, calls } = await run([task()]);

  assert.deepEqual(pins.unknownTasks, [{ task_index: 1 }]);
  assert.equal(pins.length, 0, "a result without a price cannot be charged");
  assert.ok(calls.updates.some((entry) => entry.status === "unknown" && entry.payload && entry.payload.errorCode === "provider_result_missing"));
});

test("a provider-reported failure with a task id is journaled as failed and never as unknown", async () => {
  provider.generateImageImpl = async () => {
    throw Object.assign(new Error("rejected"), {
      providerStatus: "failed",
      providerTaskId: "provider-task-failed",
      providerPrice: 0.6,
      providerRefunded: true,
      providerErrorCode: "content_policy",
      providerErrorTitle: "Blocked prompt",
    });
  };
  const { pins, calls } = await run([task()]);

  assert.deepEqual(pins.failedTasks, [{ task_index: 1 }]);
  assert.deepEqual(calls.outcomes, [{
    index: 1,
    outcome: {
      taskId: "provider-task-failed",
      price: 0.6,
      refunded: true,
      errorCode: "content_policy",
      errorTitle: "Blocked prompt",
    },
    decision: "failed",
  }]);
});

test("a provider failure without a task id cannot be reconciled and stays unknown", async () => {
  provider.generateImageImpl = async () => {
    throw Object.assign(new Error("rejected without id"), { providerStatus: "failed" });
  };
  const { pins, calls } = await run([task()]);

  assert.deepEqual(pins.unknownTasks, [{ task_index: 1 }]);
  assert.ok(calls.updates.some((entry) => entry.payload && entry.payload.errorCode === "provider_failure_missing_task_id"));
});

test("a transport error after a successful provider answer does not overwrite the outcome as unknown", async () => {
  provider.generateImageImpl = async () => ({ url: "https://provider.example.invalid/x.png", price: 0.6, taskId: "provider-task-7" });
  storage.rehostImageImpl = async () => { throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }); };
  const { pins, calls } = await run([task()]);

  assert.deepEqual(pins.unknownTasks, [{ task_index: 1 }]);
  const unknownUpdates = calls.updates.filter((entry) => entry.status === "unknown");
  assert.equal(unknownUpdates.length, 0,
    "the provider outcome is already journaled as succeeded; marking it unknown would invite a second charge");
});

test("an unusable plan is refused instead of generating a partial result", async () => {
  for (const plan of [[], null, "not-an-array", new Array(11).fill(task())]) {
    const error = await generatePins(BOARD, PROJECT, "flux-schnell", 1, "2:3", null, {
      loadPlan: async () => plan,
    }).then(() => null, (caught) => caught);
    assert.ok(error, `plan ${JSON.stringify(plan)} must be refused`);
    assert.match(error.message, /Не удалось восстановить сохранённый план/);
  }
});

test("quote validation must return a usable plan before any image provider call", async () => {
  let providerCalls = 0;
  provider.generateImageImpl = async () => { providerCalls += 1; return { url: "x", price: 1, taskId: "t" }; };
  for (const returned of [null, [], new Array(11).fill(task())]) {
    const error = await generatePins(BOARD, PROJECT, "flux-schnell", 1, "2:3", null, {
      loadPlan: async () => [task()],
      ensureTaskQuotes: async () => returned,
    }).then(() => null, (caught) => caught);
    assert.ok(error);
    assert.match(error.message, /Не удалось проверить стоимость задач/);
  }
  assert.equal(providerCalls, 0);
});
