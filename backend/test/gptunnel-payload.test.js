const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { buildImageTaskPayload, generateImage } = require("../gptunnel");

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
