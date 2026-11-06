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

test("recovery reconciles ambiguous submitting tasks even when balance is insufficient", async () => {
  let submitted = false;
  provider.generateImage = async () => {
    submitted = true;
    throw new Error("provider temporarily unavailable");
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

  assert.equal(submitted, true);
  assert.deepEqual(pins.pendingTasks, []);
  assert.deepEqual(pins.unknownTasks, [{ task_index: 1 }]);
});

test("recovery restores completed tasks while leaving unsubmitted tasks pending", async () => {
  let submitted = false;
  provider.generateImage = async () => {
    submitted = true;
    throw new Error("prepared task should remain pending");
  };

  const pins = await generatePins(
    { id: "board-1", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    2,
    "2:3",
    null,
    {
      loadPlan: async () => [
        {
          task_index: 1,
          title: "Already completed",
          description: "Saved description",
          prompt: "immutable completed prompt",
          model: "flux-schnell",
          aspect_ratio: "2:3",
          provider_idempotency_key: "stable-provider-key-0004",
          status: "succeeded",
          storage_url: "https://storage.example.invalid/completed.png",
          provider_price: 0.6,
        },
        {
          task_index: 2,
          title: "Not submitted",
          description: "Saved description",
          prompt: "immutable pending prompt",
          model: "flux-schnell",
          aspect_ratio: "2:3",
          provider_idempotency_key: "stable-provider-key-0005",
          status: "prepared",
        },
      ],
      allowPreparedTaskSubmission: () => false,
    }
  );

  assert.equal(submitted, false);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].title, "Already completed");
  assert.equal(pins[0].image_url, "https://storage.example.invalid/completed.png");
  assert.deepEqual(pins.pendingTasks, [{ task_index: 2, status: "awaiting_balance" }]);
  assert.deepEqual(pins.unknownTasks, []);
});

test("storage failure after provider success preserves the billable result for same-key recovery", async () => {
  const providerCalls = [];
  const journalUpdates = [];
  let storageAttempts = 0;
  provider.generateText = async () => {
    throw new Error("recovery must not generate new text ideas");
  };
  provider.generateImage = async (prompt, model, ratio, key) => {
    providerCalls.push({ prompt, model, ratio, key });
    return {
      url: "https://provider.example.invalid/durable-result.png",
      price: 0.75,
      taskId: "provider-task-durable-0001",
    };
  };
  storage.rehostImage = async () => {
    storageAttempts += 1;
    if (storageAttempts === 1) throw new Error("temporary storage outage");
    return "https://storage.example.invalid/durable-result.png";
  };

  const savedTask = {
    task_index: 1,
    title: "Durable result",
    description: "Saved description",
    prompt: "saved immutable prompt",
    model: "flux-schnell",
    aspect_ratio: "2:3",
    provider_idempotency_key: "stable-provider-key-storage-recovery",
    status: "unknown",
  };
  const firstAttempt = await generatePins(
    { id: "board-1", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    {
      loadPlan: async () => [{ ...savedTask }],
      updateTask: async (index, status, details) => {
        journalUpdates.push({ index, status, details });
      },
    }
  );

  assert.equal(firstAttempt.length, 0);
  assert.deepEqual(firstAttempt.unknownTasks, [{ task_index: 1 }]);
  assert.equal(
    journalUpdates.some((entry) =>
      entry.status === "succeeded" &&
      entry.details.providerResultUrl === "https://provider.example.invalid/durable-result.png" &&
      entry.details.providerPrice === 0.75
    ),
    true,
    "provider success and its price must be journaled before attempting storage"
  );
  assert.equal(
    journalUpdates.some((entry) => entry.status === "unknown"),
    false,
    "storage failure must not regress a provider-succeeded task to unknown"
  );

  const recoveredTask = {
    ...savedTask,
    status: "succeeded",
    provider_task_id: "provider-task-durable-0001",
    provider_result_url: "https://provider.example.invalid/durable-result.png",
    provider_price: 0.75,
    storage_url: null,
  };
  const secondAttempt = await generatePins(
    { id: "board-1", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    {
      loadPlan: async () => [recoveredTask],
      updateTask: async (index, status, details) => {
        journalUpdates.push({ index, status, details });
      },
    }
  );

  assert.equal(providerCalls.length, 2);
  assert.equal(providerCalls[0].key, "stable-provider-key-storage-recovery");
  assert.equal(providerCalls[1].key, providerCalls[0].key);
  assert.equal(providerCalls[1].prompt, providerCalls[0].prompt);
  assert.equal(secondAttempt.length, 1);
  assert.equal(secondAttempt[0].image_url, "https://storage.example.invalid/durable-result.png");
  assert.equal(secondAttempt[0].credits_cost, 0.75);
});

test("a missing permanent storage URL is not returned as a generated pin", async () => {
  provider.generateText = async () => JSON.stringify([
    { title: "No storage URL", description: "Test", image_prompt: "A test image" },
  ]);
  provider.generateImage = async () => ({
    url: "https://provider.example.invalid/no-storage.png",
    price: 0.5,
    taskId: "provider-task-no-storage-0001",
  });
  storage.rehostImage = async () => null;

  const pins = await generatePins(
    { id: "board-1", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    {}
  );

  assert.equal(pins.length, 0);
  assert.deepEqual(pins.unknownTasks, [{ task_index: 1 }]);
});

test("restore original module cache entries", () => {
  if (originalGptunnel) require.cache[gptunnelPath] = originalGptunnel;
  else delete require.cache[gptunnelPath];
  if (originalStorage) require.cache[storagePath] = originalStorage;
  else delete require.cache[storagePath];
});
