const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { buildImageTaskPayload, generateImage, imageTaskResult } = require("../gptunnel");

test("Creative Lab v2 image payload puts aspect ratio inside params", () => {
  const payload = buildImageTaskPayload("a quiet forest", "flux-schnell", "9:16");
  assert.deepEqual(payload, {
    model: "flux-schnell",
    prompt: "a quiet forest",
    params: { aspect_ratio: "9:16" },
    wait: true,
  });
  assert.equal(Object.hasOwn(payload, "aspect_ratio"), false);
});

test("Creative Lab v2 image payload preserves an idempotency key when supplied", () => {
  const payload = buildImageTaskPayload("a quiet forest", "flux-schnell", "2:3", "stable-key-00000001");
  assert.equal(payload.idempotency_key, "stable-key-00000001");
});

test("generateImage sends the persisted provider key and returns the provider task id", async () => {
  const originalPost = axios.post;
  let sentPayload;
  axios.post = async (url, payload) => {
    sentPayload = payload;
    return {
      data: {
        id: "0123456789abcdef01234567",
        status: "done",
        result: [{ url: "https://provider.example.invalid/image.png" }],
        price: 0.6,
      },
    };
  };
  try {
    const result = await generateImage(
      "immutable prompt",
      "flux-schnell",
      "2:3",
      "stable-provider-key-0001"
    );
    assert.equal(sentPayload.idempotency_key, "stable-provider-key-0001");
    assert.equal(result.taskId, "0123456789abcdef01234567");
    assert.equal(result.url, "https://provider.example.invalid/image.png");
  } finally {
    axios.post = originalPost;
  }
});

test("imageTaskResult validates and normalizes a completed provider task", () => {
  const result = imageTaskResult({
    id: "0123456789abcdef01234567",
    status: "done",
    result: [{ url: "https://provider.example.invalid/image.png" }],
    price: "0.6",
  });
  assert.deepEqual(result, {
    url: "https://provider.example.invalid/image.png",
    price: 0.6,
    taskId: "0123456789abcdef01234567",
  });
});

test("imageTaskResult rejects incomplete provider task results", () => {
  assert.throws(() => imageTaskResult({
    id: "0123456789abcdef01234567",
    status: "running",
    result: [],
    price: 0,
  }), /некорректный результат/i);
});

test("imageTaskResult rejects non-HTTPS and credential-bearing result URLs", () => {
  const base = {
    id: "0123456789abcdef01234567",
    status: "done",
    price: 0.6,
  };
  for (const url of [
    "http://provider.example.invalid/image.png",
    "javascript:alert(1)",
    "https://user:password@provider.example.invalid/image.png",
    "not-a-url",
  ]) {
    assert.throws(
      () => imageTaskResult({ ...base, result: [{ url }] }),
      /некорректный результат/i,
      url
    );
  }
});

test("imageTaskResult normalizes a valid HTTPS result URL", () => {
  const result = imageTaskResult({
    id: "0123456789abcdef01234567",
    status: "done",
    result: [{ url: "https://provider.example.invalid/image.png" }],
    price: 0.6,
  });
  assert.equal(result.url, "https://provider.example.invalid/image.png");
});

test("generateImage persists accepted task ID before polling", async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalTimeout = global.setTimeout;
  const events = [];
  axios.post = async () => ({
    data: { id: "fedcba9876543210fedcba98", status: "queued" },
  });
  axios.get = async () => {
    events.push("poll");
    return {
      data: {
        id: "fedcba9876543210fedcba98",
        status: "done",
        result: [{ url: "https://provider.example.invalid/resumed.png" }],
        price: 0.7,
      },
    };
  };
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };
  try {
    const result = await generateImage(
      "resume promptly",
      "flux-schnell",
      "2:3",
      "stable-provider-key-0002",
      { onTaskUpdate: async (taskId, status) => events.push(["journal", taskId, status]) }
    );
    assert.equal(events[0][0], "journal");
    assert.equal(events[0][1], "fedcba9876543210fedcba98");
    assert.equal(events[1], "poll");
    assert.equal(result.url, "https://provider.example.invalid/resumed.png");
  } finally {
    axios.post = originalPost;
    axios.get = originalGet;
    global.setTimeout = originalTimeout;
  }
});
