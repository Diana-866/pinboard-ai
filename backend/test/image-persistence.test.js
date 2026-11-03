const test = require("node:test");
const assert = require("node:assert/strict");
const { persistGeneratedImage } = require("../image-persistence");

test("returns null for an unfinished image without calling storage", async () => {
  let called = false;
  const result = await persistGeneratedImage({ url: "https://temporary.example/image.png" }, async () => {
    called = true;
  });
  assert.equal(result, null);
  assert.equal(called, false);
});

test("replaces the temporary generator URL with the permanent storage URL", async () => {
  const result = await persistGeneratedImage(
    { url: "https://temporary.example/image.png", price: 4, id: "job-1" },
    async (url) => {
      assert.equal(url, "https://temporary.example/image.png");
      return "https://storage.example/pins/image.png";
    }
  );
  assert.deepEqual(result, {
    url: "https://storage.example/pins/image.png",
    price: 4,
    id: "job-1",
  });
});

test("rejects when permanent storage fails instead of returning a temporary URL", async () => {
  await assert.rejects(
    persistGeneratedImage(
      { url: "https://temporary.example/image.png", price: 4 },
      async () => { throw new Error("storage unavailable"); }
    ),
    /storage unavailable/
  );
});

test("rejects a non-HTTPS storage URL", async () => {
  await assert.rejects(
    persistGeneratedImage(
      { url: "https://temporary.example/image.png", price: 4 },
      async () => "http://storage.example/image.png"
    ),
    /HTTPS/
  );
});
