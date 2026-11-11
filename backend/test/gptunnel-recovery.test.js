"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { generateImage, waitForImageTask } = require("../gptunnel");
const { providerTaskError } = require("../gptunnel");

test("provider failure preserves a decimal price returned as a string", () => {
  const error = providerTaskError({
    id: "provider-task-failed-priced",
    status: "failed",
    price: "2.75",
    refunded: false,
    error: { code: 429, title: "Rate limited", message: "Provider rejected task" },
  });

  assert.equal(error.providerStatus, "failed");
  assert.equal(error.providerTaskId, "provider-task-failed-priced");
  assert.equal(error.providerPrice, 2.75);
  assert.equal(error.providerRefunded, false);
  assert.equal(error.providerErrorCode, 429);
  assert.equal(error.providerErrorTitle, "Rate limited");
});


test("waitForImageTask polls the persisted task and never creates another task", async (t) => {
  const originalGet = axios.get;
  const originalPost = axios.post;
  const states = [
    { id: "provider-task-123", status: "running" },
    { id: "provider-task-123", status: "done", price: 2.5, result: [{ url: "https://provider.example/image.png" }] },
  ];
  const requested = [];
  let createCalls = 0;

  axios.get = async (url) => {
    requested.push(url);
    return { data: states.shift() };
  };
  axios.post = async () => {
    createCalls += 1;
    throw new Error("recovery must not create a new provider task");
  };
  t.after(() => {
    axios.get = originalGet;
    axios.post = originalPost;
  });

  const updates = [];
  const result = await waitForImageTask("provider-task-123", {
    pollIntervalMs: 0,
    maxPolls: 3,
    onTaskUpdate: async (id, status) => updates.push({ id, status }),
  });

  assert.deepEqual(result, {
    url: "https://provider.example/image.png",
    price: 2.5,
    taskId: "provider-task-123",
  });
  assert.equal(createCalls, 0);
  assert.equal(requested.length, 2);
  assert.ok(requested.every((url) => url.endsWith("/provider-task-123")));
  assert.deepEqual(updates, [{ id: "provider-task-123", status: "running" }]);
});


test("polling rejects a provider response whose task ID differs from the journaled task", async (t) => {
  const originalGet = axios.get;
  axios.get = async () => ({
    data: {
      id: "different-provider-task",
      status: "done",
      price: 1.25,
      result: [{ url: "https://provider.example/wrong-task.png" }],
    },
  });
  t.after(() => { axios.get = originalGet; });

  await assert.rejects(
    waitForImageTask("provider-task-expected", { pollIntervalMs: 0, maxPolls: 1 }),
    (error) => error.code === "GPTUNNEL_TASK_ID_MISMATCH"
  );
});


test("poll exhaustion returns the same persisted task as pending without creating a replacement", async (t) => {
  const originalGet = axios.get;
  const originalPost = axios.post;
  const requested = [];
  let createCalls = 0;
  axios.get = async (url) => {
    requested.push(url);
    return { data: { id: "provider-task-still-running", status: "running" } };
  };
  axios.post = async () => {
    createCalls += 1;
    throw new Error("poll exhaustion must never create a replacement task");
  };
  t.after(() => {
    axios.get = originalGet;
    axios.post = originalPost;
  });

  const updates = [];
  const result = await waitForImageTask("provider-task-still-running", {
    pollIntervalMs: 0,
    maxPolls: 2,
    onTaskUpdate: async (id, status) => updates.push({ id, status }),
  });

  assert.deepEqual(result, {
    pending: true,
    taskId: "provider-task-still-running",
    message: "Ещё генерируется, проверь позже через /check-image/provider-task-still-running",
  });
  assert.equal(requested.length, 2);
  assert.ok(requested.every((url) => url.endsWith("/provider-task-still-running")));
  assert.equal(createCalls, 0);
  assert.deepEqual(updates, [
    { id: "provider-task-still-running", status: "running" },
    { id: "provider-task-still-running", status: "running" },
  ]);
});


test("synchronous provider completion is journaled before generateImage returns", async (t) => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const payloads = [];
  let pollCalls = 0;
  axios.post = async (url, payload) => {
    payloads.push({ url, payload });
    return {
      data: {
        id: "provider-task-immediate",
        status: "done",
        price: 3.25,
        result: [{ url: "https://provider.example/immediate.png" }],
      },
    };
  };
  axios.get = async () => {
    pollCalls += 1;
    throw new Error("an immediately completed task must not be polled");
  };
  t.after(() => {
    axios.post = originalPost;
    axios.get = originalGet;
  });

  const updates = [];
  const result = await generateImage(
    "test prompt",
    "flux-schnell",
    "2:3",
    "generation-key-123456",
    { onTaskUpdate: async (id, status) => updates.push({ id, status }) }
  );

  assert.deepEqual(result, {
    url: "https://provider.example/immediate.png",
    price: 3.25,
    taskId: "provider-task-immediate",
  });
  assert.deepEqual(updates, [
    { id: "provider-task-immediate", status: "succeeded" },
  ]);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].payload.idempotency_key, "generation-key-123456");
  assert.equal(pollCalls, 0);
});
