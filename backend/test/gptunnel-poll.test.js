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


test("waitForImageTask retries transient provider polling failures", async () => {
  const originalGet = axios.get;
  const originalSetTimeout = global.setTimeout;
  let calls = 0;
  let waits = 0;

  axios.get = async () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error("temporary provider outage");
      error.response = { status: 503 };
      throw error;
    }
    return {
      data: {
        id: "task-456",
        status: "done",
        price: 1.75,
        result: [{ url: "https://images.example.com/recovered.webp" }],
      },
    };
  };
  global.setTimeout = (callback) => {
    waits += 1;
    callback();
    return 0;
  };

  try {
    const result = await waitForImageTask("task-456", {
      maxPolls: 2,
      pollIntervalMs: 10,
    });
    assert.equal(calls, 2);
    assert.equal(waits, 1);
    assert.equal(result.taskId, "task-456");
  } finally {
    axios.get = originalGet;
    global.setTimeout = originalSetTimeout;
  }
});
