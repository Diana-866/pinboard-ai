// Окружение может содержать заглушку (<gptunnel-key>), поэтому значение задаётся безусловно.
process.env.GPTUNNEL_API_KEY = "gpt_8f3a9c2b7d1e5a6f";

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { buildImageTaskPayload, generateImage, imageTaskResult, withProviderStatus, listImageModelsFull, chooseFallbackImageModel } = require("../gptunnel");

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


test("reads GPTunneL params array and exposes the model's exact aspect-ratio options", async () => {
  const originalGet = axios.get;
  axios.get = async () => ({
    data: {
      models: [{
        id: "flux-schnell",
        price: 0.6,
        params: [{
          key: "aspect_ratio",
          type: "enum",
          options: [{ value: "1:1" }, { value: "3:4" }],
        }],
      }],
    },
  });
  try {
    const models = await listImageModelsFull();
    assert.deepEqual(models[0], {
      id: "flux-schnell",
      price: 0.6,
      deprecated: false,
      params: ["aspect_ratio"],
      aspect_ratios: ["1:1", "3:4"],
    });
    assert.equal(
      chooseFallbackImageModel([
        { id: "flux-schnell", price: 0.6, params: [{ key: "aspect_ratio", options: [{ value: "1:1" }] }] },
        { id: "other", price: 0.8, params: [{ key: "aspect_ratio", options: [{ value: "2:3" }] }] },
      ], "flux-schnell").id,
      "other",
      "fallback selection must understand the provider's actual params[] schema"
    );
  } finally {
    axios.get = originalGet;
  }
});

test("GPTunneL HTTP failures log provider status/code/message with token redaction", () => {
  const originalError = console.error;
  const output = [];
  console.error = (value) => output.push(value);
  const error = Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    response: {
      status: 400,
      data: { code: 3, message: "Invalid aspect_ratio; token=secret-value" },
    },
  });
  try {
    withProviderStatus(error);
  } finally {
    console.error = originalError;
  }
  assert.equal(error.providerStatus, 400);
  const record = JSON.parse(output[0]);
  assert.equal(record.event, "gptunnel.provider_response_failed");
  assert.equal(record.provider_status, 400);
  assert.equal(record.provider_code, 3);
  assert.match(record.provider_message, /aspect_ratio/);
  assert.equal(output[0].includes("secret-value"), false);
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
