const test = require("node:test");
const assert = require("node:assert/strict");

const modulePaths = [
  require.resolve("../supabase"),
  require.resolve("../validate"),
  require.resolve("../imageValidation"),
  require.resolve("../publicUrl"),
  require.resolve("../pinImageLifecycle"),
];
const originals = new Map(modulePaths.map((path) => [path, require.cache[path]]));

function mockModule(path, exports) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
}

const lookupError = new Error("temporary database outage");
const calls = [];
const supabase = {
  storage: {
    from(bucket) {
      return {
        getPublicUrl(path) {
          calls.push({ type: "public-url", bucket, path });
          return { data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/${bucket}/${path}` } };
        },
      };
    },
  },
};
mockModule(modulePaths[0], supabase);
mockModule(modulePaths[1], {
  httpError(status, message) {
    const error = new Error(message);
    error.httpStatus = status;
    return error;
  },
});
mockModule(modulePaths[2], {
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
  validateImageBuffer() { throw new Error("not used in this test"); },
});
mockModule(modulePaths[3], {
  assertPublicUrl: async () => { throw new Error("provider download must not start"); },
  createPinnedLookup() { throw new Error("provider download must not start"); },
});
mockModule(modulePaths[4], {
  extractManagedPinImagePath() { return null; },
  buildPinImageObjectPath() { throw new Error("not used in this test"); },
  uploadManagedPinImageObject() { throw new Error("not used in this test"); },
  deleteManagedPinImageObject() { throw new Error("not used in this test"); },
  findCompletedManagedPinImageUpload: async () => { calls.push({ type: "lookup" }); throw lookupError; },
  validatePinImageBucketConfiguration() {},
  EXPECTED_PIN_IMAGE_MIMES: ["image/png", "image/jpeg", "image/webp", "image/gif"],
});

const { rehostImage } = require("../storage");

test("idempotent image recovery stops safely when completed-upload lookup fails", async () => {
  await assert.rejects(
    rehostImage("https://provider.example.invalid/result.png", {
      idempotencyKey: "stable-provider-result-key",
    }),
    (error) => error.httpStatus === 503 && /Повторите восстановление позже/.test(error.message)
  );

  assert.deepEqual(calls, [{ type: "lookup" }]);
});

test("restore original module cache entries", () => {
  for (const path of modulePaths) {
    const original = originals.get(path);
    if (original) require.cache[path] = original;
    else delete require.cache[path];
  }
  delete require.cache[require.resolve("../storage")];
});
