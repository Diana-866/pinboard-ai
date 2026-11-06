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
  assert.deepEqual(pins, []);
});

test("restore original module cache entries", () => {
  if (originalGptunnel) require.cache[gptunnelPath] = originalGptunnel;
  else delete require.cache[gptunnelPath];
  if (originalStorage) require.cache[storagePath] = originalStorage;
  else delete require.cache[storagePath];
});
