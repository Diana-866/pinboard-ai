const test = require("node:test");
const assert = require("node:assert/strict");
const { serializeGenerationRecovery } = require("../generationRecovery");

test("completed recovery returns only safe fields for the user's saved pins", () => {
  const result = serializeGenerationRecovery({
    status: "completed",
    board_id: "board-1",
    created_at: "2026-11-08T12:00:00.000Z",
    updated_at: "2026-11-08T12:01:00.000Z",
    provider_token: "must-not-leak",
    pins: [{
      id: "pin-1",
      title: "A saved pin",
      description: "Description",
      image_url: "https://cdn.example/pin.png",
      aspect_ratio: "2:3",
      model_used: "flux-schnell",
      credits_cost: 12,
      prompt: "private provider prompt",
      provider_task_id: "private-task-id",
    }],
  });

  assert.deepEqual(result, {
    status: "completed",
    board_id: "board-1",
    pins: [{
      id: "pin-1",
      title: "A saved pin",
      description: "Description",
      image_url: "https://cdn.example/pin.png",
      model_used: "flux-schnell",
      aspect_ratio: "2:3",
      credits_cost: 12,
    }],
    created_at: "2026-11-08T12:00:00.000Z",
    updated_at: "2026-11-08T12:01:00.000Z",
  });
  assert.equal(JSON.stringify(result).includes("private provider prompt"), false);
  assert.equal(JSON.stringify(result).includes("private-task-id"), false);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("in-progress and uncertain requests never expose partial pin payloads", () => {
  for (const status of ["processing", "unknown", "failed"]) {
    const result = serializeGenerationRecovery({
      status,
      board_id: "board-1",
      pins: [{ id: "partial-pin", image_url: "https://private.example/image.png" }],
    });
    assert.equal(result.status, status);
    assert.deepEqual(result.pins, []);
  }
});

test("unexpected database status is normalized to unknown", () => {
  const result = serializeGenerationRecovery({
    status: "unexpected-internal-state",
    board_id: "board-1",
    pins: [{ id: "partial-pin" }],
  });
  assert.equal(result.status, "unknown");
  assert.deepEqual(result.pins, []);
});
