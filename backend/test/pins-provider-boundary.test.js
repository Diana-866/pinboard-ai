const test = require("node:test");
const assert = require("node:assert/strict");

const gptunnelPath = require.resolve("../gptunnel");
const storagePath = require.resolve("../storage");
const originalGptunnel = require.cache[gptunnelPath];
const originalStorage = require.cache[storagePath];

const provider = {
  generateText: async () => "not-json",
  generateImage: async () => { throw new Error("simulated image provider failure"); },
};
const storage = { rehostImage: async (url) => url };

require.cache[gptunnelPath] = {
  id: gptunnelPath,
  filename: gptunnelPath,
  loaded: true,
  exports: provider,
};
require.cache[storagePath] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: storage,
};

const { generatePins } = require("../pins");

test("text-generation failure does not cross the billable image submission boundary", async () => {
  let submitted = false;
  provider.generateText = async () => "not-json";

  await assert.rejects(
    generatePins(
      { id: "board-1", title: "Test board", description: "" },
      { niche: "test", tone: "neutral", language: "en" },
      "flux-schnell",
      1,
      "2:3",
      null,
      { onProviderSubmission: () => { submitted = true; } }
    ),
    /разобрать идеи/
  );

  assert.equal(submitted, false);
});

test("image generation marks the provider submission boundary before calling the image provider", async () => {
  let submitted = false;
  provider.generateText = async () => JSON.stringify([
    { title: "Test pin", description: "Test", image_prompt: "A test image" },
  ]);
  provider.generateImage = async () => {
    assert.equal(submitted, true, "callback must run before the image provider call");
    throw new Error("simulated image provider failure");
  };

  const pins = await generatePins(
    { id: "board-1", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    { onProviderSubmission: () => { submitted = true; } }
  );

  assert.equal(submitted, true);
  assert.equal(pins.length, 0);
  assert.deepEqual(pins.pendingTasks, []);
  assert.deepEqual(pins.unknownTasks, [{ task_index: 1 }]);
  assert.deepEqual(pins.failedTasks, []);
  assert.equal(pins.plannedTaskCount, 1);
});

test("journal recovery reuses the saved prompt and provider idempotency key without generating new text", async () => {
  provider.generateText = async () => {
    throw new Error("resume must not request new text ideas");
  };
  let receivedKey = null;
  provider.generateImage = async (prompt, model, ratio, key) => {
    assert.equal(prompt, "immutable saved prompt");
    assert.equal(model, "flux-schnell");
    assert.equal(ratio, "2:3");
    receivedKey = key;
    return { url: "https://provider.example.invalid/image.png", price: 0.6, taskId: "provider-task-0001" };
  };
  storage.rehostImage = async () => "https://storage.example.invalid/image.png";

  const pins = await generatePins(
    { id: "board-1", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    {
      loadPlan: async () => [{
        task_index: 1,
        title: "Saved title",
        description: "Saved description",
        prompt: "immutable saved prompt",
        model: "flux-schnell",
        aspect_ratio: "2:3",
        provider_idempotency_key: "stable-provider-key-0001",
        status: "unknown",
      }],
      updateTask: async () => {},
    }
  );

  assert.equal(receivedKey, "stable-provider-key-0001");
  assert.equal(pins.length, 1);
  assert.equal(pins[0].image_url, "https://storage.example.invalid/image.png");
  assert.equal(pins[0].title, "Saved title");
});

test("recovery does not submit prepared provider tasks when balance is insufficient", async () => {
  let submitted = false;
  provider.generateImage = async () => {
    submitted = true;
    throw new Error("prepared task must not be submitted without balance");
  };

  const pins = await generatePins(
    { id: "board-1", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    {
      loadPlan: async () => [{
        task_index: 1,
        title: "Saved title",
        description: "Saved description",
        prompt: "immutable saved prompt",
        model: "flux-schnell",
        aspect_ratio: "2:3",
        provider_idempotency_key: "stable-provider-key-0002",
        status: "prepared",
      }],
      allowPreparedTaskSubmission: () => false,
    }
  );

  assert.equal(submitted, false);
  assert.equal(pins.length, 0);
  assert.deepEqual(pins.pendingTasks, [{ task_index: 1, status: "awaiting_balance" }]);
  assert.deepEqual(pins.unknownTasks, []);
});

test("recovery gates ambiguous submitting tasks when balance is insufficient", async () => {
  let submitted = false;
  provider.generateImage = async () => {
    submitted = true;
    throw new Error("ambiguous submission must wait for sufficient balance");
  };

  const pins = await generatePins(
    { id: "board-1", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    {
      loadPlan: async () => [{
        task_index: 1,
        title: "Saved title",
        description: "Saved description",
        prompt: "immutable saved prompt",
        model: "flux-schnell",
        aspect_ratio: "2:3",
        provider_idempotency_key: "stable-provider-key-0003",
        status: "submitting",
      }],
      allowPreparedTaskSubmission: () => false,
    }
  );

  assert.equal(submitted, false);
  assert.deepEqual(pins.pendingTasks, [{ task_index: 1, status: "awaiting_balance" }]);
  assert.deepEqual(pins.unknownTasks, []);
});

test("restore original module cache entries", () => {
  if (originalGptunnel) require.cache[gptunnelPath] = originalGptunnel;
  else delete require.cache[gptunnelPath];
  if (originalStorage) require.cache[storagePath] = originalStorage;
  else delete require.cache[storagePath];
});
