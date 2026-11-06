const test = require("node:test");
const assert = require("node:assert/strict");
const { buildImageTaskPayload } = require("../gptunnel");

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
