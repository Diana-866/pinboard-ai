const test = require("node:test");
const assert = require("node:assert/strict");

const gptunnelPath = require.resolve("../gptunnel");
const storagePath = require.resolve("../storage");
const originalGptunnel = require.cache[gptunnelPath];
const originalStorage = require.cache[storagePath];

const provider = {
  generateText: async () => "not-json",
  generateTextWithUsage: (...args) => provider.generateTextWithUsageImpl(...args),
  generateTextWithUsageImpl: async (prompt) => ({
    content: await provider.generateText(prompt),
    usage: {
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      promptCost: 0.01,
      completionCost: 0.02,
      totalCost: 0.03,
      cachedPromptTokens: 0,
      cacheWriteTokens: 0,
    },
    costCurrency: "RUB",
    model: "gpt-4o",
    requestId: "chatcmpl-test-usage",
  }),
  // pins.js destructures these at require time, so per-test overrides must go
  // through a stable indirection (same pattern as generateTextWithUsage above).
  generateImage: (...args) => provider.generateImageImpl(...args),
  generateImageImpl: async () => { throw new Error("simulated image provider failure"); },
  waitForImageTask: (...args) => provider.waitForImageTaskImpl(...args),
  waitForImageTaskImpl: async () => { throw new Error("unexpected task polling"); },
};
// pins.js destructures rehostImage at require time; overrides go through the impl slot.
const storage = {
  rehostImage: (...args) => storage.rehostImageImpl(...args),
  rehostImageImpl: async (url) => url,
};

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


test("missing text cost is journaled and blocks all image spend with a known provider outcome", async (t) => {
  const original = provider.generateTextWithUsageImpl;
  t.after(() => { provider.generateTextWithUsageImpl = original; });
  provider.generateTextWithUsageImpl = async () => ({
    content: JSON.stringify([
      { title: "Unpriced text", description: "Test", image_prompt: "An image" },
    ]),
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      promptCost: null,
      completionCost: null,
      totalCost: null,
      cachedPromptTokens: null,
      cacheWriteTokens: null,
    },
    costCurrency: "RUB",
    model: "gpt-4o",
    requestId: "chatcmpl-missing-cost",
  });

  const events = [];
  await assert.rejects(
    generatePins(
      { id: "board-missing-cost", title: "Test board", description: "" },
      { niche: "test", tone: "neutral", language: "en" },
      "flux-schnell",
      1,
      "2:3",
      null,
      {
        onTextProviderSubmission: () => events.push("submitted"),
        onTextProviderCompleted: () => events.push("completed"),
        recordTextUsage: async (result) => {
          assert.equal(result.usage.totalCost, null);
          events.push("cost-missing-journaled");
        },
        ensureTaskQuotes: async () => {
          events.push("quoted");
          return [];
        },
        onProviderSubmission: () => events.push("image-submitted"),
      }
    ),
    (error) => error.code === "GPTUNNEL_TEXT_COST_MISSING" && error.httpStatus === 502
  );

  assert.deepEqual(events, ["submitted", "cost-missing-journaled", "completed"]);
});

test("negative text cost is journaled as missing and blocks image spend", async (t) => {
  const original = provider.generateTextWithUsageImpl;
  t.after(() => { provider.generateTextWithUsageImpl = original; });
  provider.generateTextWithUsageImpl = async () => ({
    content: JSON.stringify([
      { title: "Negative cost", description: "Test", image_prompt: "An image" },
    ]),
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      promptCost: null,
      completionCost: null,
      totalCost: -0.01,
      cachedPromptTokens: null,
      cacheWriteTokens: null,
    },
    costCurrency: "RUB",
    model: "gpt-4o",
    requestId: "chatcmpl-negative-cost",
  });

  let journaled = false;
  await assert.rejects(
    generatePins(
      { id: "board-negative-cost", title: "Test board", description: "" },
      { niche: "test", tone: "neutral", language: "en" },
      "flux-schnell",
      1,
      "2:3",
      null,
      {
        recordTextUsage: async (result) => {
          journaled = true;
          assert.equal(result.usage.totalCost, -0.01);
        },
        onProviderSubmission: () => {
          throw new Error("image submission must be blocked");
        },
      }
    ),
    (error) => error.code === "GPTUNNEL_TEXT_COST_MISSING"
  );
  assert.equal(journaled, true);
});

test("a text response stays outcome-unknown when its usage journal write fails", async (t) => {
  const original = provider.generateTextWithUsageImpl;
  t.after(() => { provider.generateTextWithUsageImpl = original; });
  provider.generateTextWithUsageImpl = async () => ({
    content: JSON.stringify([
      { title: "Unjournaled text", description: "Test", image_prompt: "An image" },
    ]),
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      promptCost: null,
      completionCost: null,
      totalCost: null,
      cachedPromptTokens: null,
      cacheWriteTokens: null,
    },
    costCurrency: "RUB",
    model: "gpt-4o",
    requestId: "chatcmpl-journal-failure",
  });

  const events = [];
  await assert.rejects(
    generatePins(
      { id: "board-journal-failure", title: "Test board", description: "" },
      { niche: "test", tone: "neutral", language: "en" },
      "flux-schnell",
      1,
      "2:3",
      null,
      {
        onTextProviderSubmission: () => events.push("submitted"),
        onTextProviderCompleted: () => events.push("completed"),
        recordTextUsage: async () => {
          events.push("journal-failed");
          throw new Error("simulated durable journal failure");
        },
      }
    ),
    /simulated durable journal failure/
  );

  assert.deepEqual(events, ["submitted", "journal-failed"]);
});

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

test("text-plan generation marks the provider submission boundary before calling the text provider", async () => {
  let submitted = false;
  provider.generateText = async () => {
    assert.equal(submitted, true, "callback must run before the billable text provider call");
    throw new Error("simulated ambiguous text provider failure");
  };

  await assert.rejects(
    generatePins(
      { id: "board-1", title: "Test board", description: "" },
      { niche: "test", tone: "neutral", language: "en" },
      "flux-schnell",
      1,
      "2:3",
      null,
      { onTextProviderSubmission: () => { submitted = true; } }
    ),
    /simulated ambiguous text provider failure/
  );

  assert.equal(submitted, true);
});

test("text provider usage is awaited and persisted before parsing ideas", async () => {
  const events = [];
  provider.generateText = async () => {
    events.push("response");
    return JSON.stringify([
      { title: "Usage pin", description: "Test", image_prompt: "An image" },
    ]);
  };
  provider.generateImageImpl = async () => {
    events.push("image");
    throw new Error("stop after usage callback");
  };

  await generatePins(
    { id: "board-usage", title: "Usage board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    {
      onTextProviderSubmission: () => events.push("submission"),
      onTextProviderUsage: async (result) => {
        assert.equal(result.costCurrency, "RUB");
        assert.equal(result.usage.totalCost, 0.03);
        events.push("usage-persisted");
      },
    }
  );

  assert.deepEqual(events, ["submission", "response", "usage-persisted", "image"]);
});

test("text usage journal failure stops before quote and image provider boundaries", async () => {
  let quoteChecked = false;
  let imageSubmitted = false;
  provider.generateText = async () => JSON.stringify([
    { title: "Journal failure pin", description: "Test", image_prompt: "A test image" },
  ]);
  provider.generateImageImpl = async () => {
    imageSubmitted = true;
    throw new Error("image provider must not be called after journal failure");
  };

  await assert.rejects(
    generatePins(
      { id: "board-journal-failure", title: "Test board", description: "" },
      { niche: "test", tone: "neutral", language: "en" },
      "flux-schnell",
      1,
      "2:3",
      null,
      {
        onTextProviderUsage: async () => {
          throw new Error("usage journal unavailable");
        },
        ensureTaskQuotes: async () => {
          quoteChecked = true;
          return [];
        },
      }
    ),
    /usage journal unavailable/
  );

  assert.equal(quoteChecked, false);
  assert.equal(imageSubmitted, false);
});

test("plan journal failure after text provider success stops before quotes and image submission", async () => {
  const events = [];
  provider.generateText = async () => {
    events.push("text-provider");
    return JSON.stringify([
      { title: "Unjournaled plan", description: "Test", image_prompt: "A test image" },
    ]);
  };
  provider.generateImageImpl = async () => {
    events.push("image-provider");
    throw new Error("image provider must not be called");
  };

  await assert.rejects(
    generatePins(
      { id: "board-plan-journal-failure", title: "Test board", description: "" },
      { niche: "test", tone: "neutral", language: "en" },
      "flux-schnell",
      1,
      "2:3",
      null,
      {
        onTextProviderSubmission: () => events.push("text-submission-marked"),
        onTextProviderUsage: async () => events.push("text-usage-recorded"),
        persistPlan: async () => {
          events.push("plan-journal-failed");
          throw new Error("plan journal unavailable");
        },
        ensureTaskQuotes: async () => {
          events.push("quote");
          return [];
        },
      }
    ),
    /plan journal unavailable/
  );

  assert.deepEqual(events, [
    "text-submission-marked",
    "text-provider",
    "text-usage-recorded",
    "plan-journal-failed",
  ]);
});

test("atomic text-plan journal receives usage and normalized tasks before image work", async () => {
  const events = [];
  provider.generateText = async () => JSON.stringify([
    { title: "Atomic plan", description: "Description", image_prompt: "A test image" },
  ]);
  provider.generateImageImpl = async () => {
    events.push("image-provider");
    return { taskId: "image-task-atomic" };
  };

  await generatePins(
    { id: "board-atomic-plan", title: "Atomic plan", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    {
      onTextProviderSubmission: () => events.push("text-submission-marked"),
      onTextProviderUsage: async () => events.push("legacy-usage-callback"),
      persistPlan: async () => {
        events.push("legacy-plan-callback");
        return [];
      },
      persistTextPlan: async (result, tasks) => {
        assert.equal(result.requestId, "chatcmpl-test-usage");
        assert.equal(result.costCurrency, "RUB");
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].prompt, "A test image");
        events.push("atomic-journal");
        return tasks;
      },
      ensureTaskQuotes: async (tasks) => {
        events.push("quotes");
        return tasks;
      },
    }
  );

  assert.deepEqual(events, [
    "text-submission-marked",
    "atomic-journal",
    "quotes",
    "image-provider",
  ]);
});

test("invalid text plan still journals provider usage and stops before image work", async () => {
  const events = [];
  provider.generateText = async () => "not-json";

  await assert.rejects(
    generatePins(
      { id: "board-invalid-plan-usage", title: "Test board", description: "" },
      { niche: "test", tone: "neutral", language: "en" },
      "flux-schnell",
      1,
      "2:3",
      null,
      {
        onTextProviderSubmission: () => events.push("text-submission-marked"),
        recordTextUsage: async (result) => {
          assert.equal(result.requestId, "chatcmpl-test-usage");
          assert.equal(result.usage.totalCost, 0.03);
          events.push("usage-journaled");
        },
        ensureTaskQuotes: async () => {
          events.push("quotes");
          return [];
        },
      }
    ),
    /разобрать идеи/
  );

  assert.deepEqual(events, ["text-submission-marked", "usage-journaled"]);
});

test("text-plan generation extracts a JSON array surrounded by provider prose", async () => {
  provider.generateText = async () => [
    "Here is the requested JSON:",
    JSON.stringify([{ title: "Wrapped response", description: "Test", image_prompt: "A test image" }]),
    "End of response.",
  ].join("\n");
  provider.generateImageImpl = async () => ({
    url: "https://provider.example.invalid/wrapped-response.png",
    price: 0.6,
    taskId: "provider-task-wrapped-0001",
  });
  storage.rehostImageImpl = async () => "https://storage.example.invalid/wrapped-response.png";

  const pins = await generatePins(
    { id: "board-1", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    {}
  );

  assert.equal(pins.length, 1);
  assert.equal(pins[0].title, "Wrapped response");
  assert.equal(pins[0].image_url, "https://storage.example.invalid/wrapped-response.png");
  assert.deepEqual(pins.unknownTasks, []);
});

test("task quote validation completes before the first billable image submission", async () => {
  const events = [];
  provider.generateText = async () => JSON.stringify([
    { title: "Quoted pin", description: "Test", image_prompt: "A quoted image" },
  ]);
  provider.generateImageImpl = async () => {
    events.push("image");
    return {
      url: "https://provider.example.invalid/quoted.png",
      price: 0.6,
      taskId: "provider-task-quoted-0001",
    };
  };
  storage.rehostImageImpl = async () => "https://storage.example.invalid/quoted.png";

  const pins = await generatePins(
    { id: "board-1", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    1,
    "2:3",
    null,
    {
      ensureTaskQuotes: async (tasks) => {
        events.push("quote");
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].status, undefined);
        return tasks;
      },
      onProviderSubmission: () => events.push("submission"),
    }
  );

  assert.deepEqual(events, ["quote", "submission", "image"]);
  assert.equal(pins.length, 1);
});

test("quote validation failure prevents any image provider submission", async () => {
  let imageSubmitted = false;
  provider.generateText = async () => JSON.stringify([
    { title: "Unquoted pin", description: "Test", image_prompt: "An unquoted image" },
  ]);
  provider.generateImageImpl = async () => {
    imageSubmitted = true;
    throw new Error("image provider must not be called");
  };

  await assert.rejects(
    generatePins(
      { id: "board-1", title: "Test board", description: "" },
      { niche: "test", tone: "neutral", language: "en" },
      "flux-schnell",
      1,
      "2:3",
      null,
      { ensureTaskQuotes: async () => { throw new Error("quote validation failed"); } }
    ),
    /quote validation failed/
  );

  assert.equal(imageSubmitted, false);
});

test("image generation marks the provider submission boundary before calling the image provider", async () => {
  let submitted = false;
  provider.generateText = async () => JSON.stringify([
    { title: "Test pin", description: "Test", image_prompt: "A test image" },
  ]);
  provider.generateImageImpl = async () => {
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
  provider.generateImageImpl = async (prompt, model, ratio, key) => {
    assert.equal(prompt, "immutable saved prompt");
    assert.equal(model, "flux-schnell");
    assert.equal(ratio, "2:3");
    receivedKey = key;
    return { url: "https://provider.example.invalid/image.png", price: 0.6, taskId: "provider-task-0001" };
  };
  storage.rehostImageImpl = async () => "https://storage.example.invalid/image.png";

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
  provider.generateImageImpl = async () => {
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
  provider.generateImageImpl = async () => {
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
  provider.generateImageImpl = async () => {
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
  provider.generateImageImpl = async (prompt, model, ratio, key) => {
    providerCalls.push({ prompt, model, ratio, key });
    return {
      url: "https://provider.example.invalid/durable-result.png",
      price: 0.75,
      taskId: "provider-task-durable-0001",
    };
  };
  storage.rehostImageImpl = async () => {
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

  // The provider create boundary is crossed only once. Recovery rehosts the
  // already-journaled successful URL and must not submit another billable task.
  assert.equal(providerCalls.length, 1);
  assert.equal(storageAttempts, 2);
  assert.equal(providerCalls[0].key, "stable-provider-key-storage-recovery");
  assert.equal(secondAttempt.length, 1);
  assert.equal(secondAttempt[0].image_url, "https://storage.example.invalid/durable-result.png");
  assert.equal(secondAttempt[0].credits_cost, 0.75);
});

test("a succeeded provider result is rehosted from its saved URL without another provider create call", async () => {
  provider.generateText = async () => {
    throw new Error("saved plan recovery must not generate text");
  };
  provider.generateImageImpl = async () => {
    throw new Error("saved provider result must not submit another create request");
  };
  let rehostedUrl = null;
  let journalUpdate = null;
  storage.rehostImageImpl = async (url, options) => {
    rehostedUrl = { url, options };
    return "https://storage.example.invalid/recovered-result.png";
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
        title: "Saved result",
        description: "Saved description",
        prompt: "immutable saved prompt",
        model: "flux-schnell",
        aspect_ratio: "2:3",
        provider_idempotency_key: "stable-provider-key-saved-result",
        provider_task_id: "provider-task-saved-result",
        provider_result_url: "https://provider.example.invalid/saved-result.png",
        provider_price: 0.75,
        storage_url: null,
        status: "succeeded",
      }],
      updateTask: async (index, status, details) => {
        journalUpdate = { index, status, details };
      },
    }
  );

  assert.deepEqual(rehostedUrl, {
    url: "https://provider.example.invalid/saved-result.png",
    options: { idempotencyKey: "stable-provider-key-saved-result" },
  });
  assert.equal(pins.length, 1);
  assert.equal(pins[0].image_url, "https://storage.example.invalid/recovered-result.png");
  assert.equal(pins[0].credits_cost, 0.75);
  assert.equal(journalUpdate.status, "succeeded");
  assert.equal(journalUpdate.details.storageUrl, "https://storage.example.invalid/recovered-result.png");
  assert.deepEqual(pins.unknownTasks, []);
});

test("a missing permanent storage URL is not returned as a generated pin", async () => {
  provider.generateText = async () => JSON.stringify([
    { title: "No storage URL", description: "Test", image_prompt: "A test image" },
  ]);
  provider.generateImageImpl = async () => ({
    url: "https://provider.example.invalid/no-storage.png",
    price: 0.5,
    taskId: "provider-task-no-storage-0001",
  });
  storage.rehostImageImpl = async () => null;

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

test("unrecoverable succeeded tasks never submit a duplicate provider create request", async () => {
  let providerCreateCalls = 0;
  provider.generateText = async () => {
    throw new Error("saved plan recovery must not generate text");
  };
  provider.generateImageImpl = async () => {
    providerCreateCalls += 1;
    throw new Error("a terminal succeeded task must never be resubmitted");
  };
  storage.rehostImageImpl = async () => {
    throw new Error("there is no saved result URL to rehost");
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
        title: "Unrecoverable success",
        description: "Saved description",
        prompt: "immutable saved prompt",
        model: "flux-schnell",
        aspect_ratio: "2:3",
        provider_idempotency_key: "stable-provider-key-unrecoverable",
        provider_task_id: "provider-task-unrecoverable",
        provider_result_url: null,
        provider_price: 0.75,
        storage_url: null,
        status: "succeeded",
      }],
    }
  );

  assert.equal(providerCreateCalls, 0);
  assert.equal(pins.length, 0);
  assert.deepEqual(pins.unknownTasks, [{
    task_index: 1,
    reason: "successful_result_unrecoverable",
  }]);
});


test("a journaled provider task ID is polled even if its last persisted state is submitting", async () => {
  let createCalls = 0;
  let pollCalls = 0;
  provider.generateText = async () => {
    throw new Error("recovery must not generate new text");
  };
  provider.generateImageImpl = async () => {
    createCalls += 1;
    throw new Error("must not create another provider task");
  };
  provider.waitForImageTaskImpl = async (taskId) => {
    pollCalls += 1;
    assert.equal(taskId, "provider-task-submitting-recovery");
    return { pending: true, taskId };
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
        title: "Submitted task",
        description: "Saved description",
        prompt: "immutable saved prompt",
        model: "flux-schnell",
        aspect_ratio: "2:3",
        provider_idempotency_key: "stable-provider-key-submitting",
        provider_task_id: "provider-task-submitting-recovery",
        status: "submitting",
      }],
      updateTask: async () => {},
    }
  );

  assert.equal(createCalls, 0);
  assert.equal(pollCalls, 1);
  assert.deepEqual(pins.pendingTasks, [{
    task_index: 1,
    task_id: "provider-task-submitting-recovery",
  }]);
  assert.deepEqual(pins.unknownTasks, []);
});


test("invalid pin-plan fields fail before quote validation or billable image submission", async () => {
  let quoteChecked = false;
  let imageSubmitted = false;
  provider.generateText = async () => JSON.stringify([
    { title: "Valid first idea", description: "Description", image_prompt: "Prompt" },
    { title: 42, description: "Wrong title type", image_prompt: "Prompt" },
  ]);
  provider.generateImageImpl = async () => {
    imageSubmitted = true;
    throw new Error("image provider must not be called");
  };

  await assert.rejects(
    generatePins(
      { id: "board-invalid-plan", title: "Test board", description: "" },
      { niche: "test", tone: "neutral", language: "en" },
      "flux-schnell",
      2,
      "2:3",
      null,
      { ensureTaskQuotes: async () => { quoteChecked = true; return []; } }
    ),
    (error) => error.httpStatus === 502
  );

  assert.equal(quoteChecked, false);
  assert.equal(imageSubmitted, false);
});

test("pin-plan parser keeps requested partial count and normalizes optional description", async () => {
  provider.generateText = async () => JSON.stringify([
    { title: "Only one idea", image_prompt: "A valid image prompt" },
  ]);
  let quotedTasks = null;
  provider.generateImageImpl = async () => {
    throw new Error("stop after validating and quoting the partial plan");
  };

  const pins = await generatePins(
    { id: "board-partial-plan", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    2,
    "2:3",
    null,
    {
      ensureTaskQuotes: async (tasks) => {
        quotedTasks = tasks;
        return tasks;
      },
    }
  );

  assert.equal(quotedTasks.length, 1);
  assert.equal(quotedTasks[0].title, "Only one idea");
  assert.equal(quotedTasks[0].description, "");
  assert.equal(quotedTasks[0].prompt, "A valid image prompt");
  assert.equal(pins.plannedTaskCount, 1);
});


test("malformed immediate completion recovers by polling the journaled provider task ID", async () => {
  provider.generateText = async () => {
    throw new Error("recovery must reuse the saved plan");
  };
  let pollTaskId = null;
  let persistedProviderTaskId = null;
  provider.generateImageImpl = async (prompt, model, ratio, key, callbacks) => {
    await callbacks.onTaskUpdate("provider-task-malformed-001", "running");
    throw new Error("malformed completed image payload");
  };
  provider.waitForImageTaskImpl = async (taskId) => {
    pollTaskId = taskId;
    return { pending: true, taskId };
  };

  const plan = {
    task_index: 1,
    title: "Recoverable result",
    description: "Saved description",
    prompt: "immutable saved prompt",
    model: "flux-schnell",
    aspect_ratio: "2:3",
    provider_idempotency_key: "stable-malformed-result-key",
    status: "unknown",
  };
  const firstAttempt = await generatePins(
    { id: "board-malformed", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell", 1, "2:3", null,
    {
      loadPlan: async () => [{ ...plan }],
      updateTask: async (index, status, details = {}) => {
        // Match the database RPC's COALESCE semantics: null details do not
        // erase an already journaled provider task ID.
        if (details.providerTaskId) persistedProviderTaskId = details.providerTaskId;
      },
    }
  );
  assert.equal(firstAttempt.unknownTasks.length, 1);
  assert.equal(persistedProviderTaskId, "provider-task-malformed-001");

  const recoveredAttempt = await generatePins(
    { id: "board-malformed", title: "Test board", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell", 1, "2:3", null,
    {
      loadPlan: async () => [{
        ...plan,
        status: "unknown",
        provider_task_id: persistedProviderTaskId,
      }],
      updateTask: async () => {},
    }
  );

  assert.equal(pollTaskId, "provider-task-malformed-001");
  assert.equal(recoveredAttempt.pendingTasks[0].task_id, "provider-task-malformed-001");
});

test("a terminal failure in one task does not discard other durable successful pins", async () => {
  let providerCreateCalls = 0;
  provider.generateText = async () => {
    throw new Error("partial recovery must reuse the saved plan");
  };
  provider.generateImageImpl = async () => {
    providerCreateCalls += 1;
    throw new Error("terminally failed tasks must not be resubmitted");
  };

  const pins = await generatePins(
    { id: "board-partial-recovery", title: "Partial recovery", description: "" },
    { niche: "test", tone: "neutral", language: "en" },
    "flux-schnell",
    2,
    "2:3",
    null,
    {
      loadPlan: async () => [
        {
          task_index: 1,
          title: "Durable success",
          description: "Already stored",
          prompt: "saved prompt one",
          model: "flux-schnell",
          aspect_ratio: "2:3",
          provider_idempotency_key: "partial-recovery-success-0001",
          provider_task_id: "provider-task-partial-success",
          provider_result_url: "https://provider.example.invalid/success.png",
          provider_price: 0.75,
          storage_url: "https://storage.example.invalid/success.png",
          status: "succeeded",
          provider_outcome_status: "succeeded",
        },
        {
          task_index: 2,
          title: "Terminal failure",
          description: "Provider confirmed failure",
          prompt: "saved prompt two",
          model: "flux-schnell",
          aspect_ratio: "2:3",
          provider_idempotency_key: "partial-recovery-failed-0002",
          provider_task_id: "provider-task-partial-failed",
          status: "failed",
        },
      ],
    }
  );

  assert.equal(providerCreateCalls, 0);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].title, "Durable success");
  assert.equal(pins[0].image_url, "https://storage.example.invalid/success.png");
  assert.equal(pins[0].credits_cost, 0.75);
  assert.deepEqual(pins.failedTasks, [{ task_index: 2 }]);
  assert.deepEqual(pins.pendingTasks, []);
  assert.deepEqual(pins.unknownTasks, []);
  assert.equal(pins.plannedTaskCount, 2);
});

test("restore original module cache entries", () => {
  if (originalGptunnel) require.cache[gptunnelPath] = originalGptunnel;
  else delete require.cache[gptunnelPath];
  if (originalStorage) require.cache[storagePath] = originalStorage;
  else delete require.cache[storagePath];
});
