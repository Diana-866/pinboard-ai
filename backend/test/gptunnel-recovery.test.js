"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { waitForImageTask } = require("../gptunnel");

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
