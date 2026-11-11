const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { waitForImageTask } = require("../gptunnel");

test("waitForImageTask checks an already-completed task immediately", async () => {
  const originalGet = axios.get;
  const originalSetTimeout = global.setTimeout;
  let calls = 0;

  axios.get = async () => {
    calls += 1;
    return {
      data: {
        id: "task-123",
        status: "done",
        price: 2.5,
        result: [{ url: "https://images.example.com/pin.webp" }],
      },
    };
  };
  global.setTimeout = () => {
    throw new Error("the first provider poll must not wait");
  };

  try {
    const result = await waitForImageTask("task-123", { pollIntervalMs: 3000 });
    assert.equal(calls, 1);
    assert.equal(result.taskId, "task-123");
    assert.equal(result.price, 2.5);
    assert.equal(result.url, "https://images.example.com/pin.webp");
  } finally {
    axios.get = originalGet;
    global.setTimeout = originalSetTimeout;
  }
});
