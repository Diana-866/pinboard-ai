const test = require("node:test");
const assert = require("node:assert/strict");

const modulePaths = [
  require.resolve("../supabase"),
  require.resolve("../validate"),
  require.resolve("../imageValidation"),
  require.resolve("../publicUrl"),
  require.resolve("../pinImageLifecycle"),
  require.resolve("axios"),
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
let lookupFailure = lookupError;
const calls = [];
let uploadError = null;
const supabase = {
  storage: {
    async listBuckets() {
      return { data: [{
        name: "pin-images",
        public: true,
        file_size_limit: 5 * 1024 * 1024,
        allowed_mime_types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      }], error: null };
    },
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
  validateImageBuffer() { return { ext: "png", mime: "image/png" }; },
});
mockModule(modulePaths[3], {
  assertPublicUrl: async () => ({ url: "https://provider.example.invalid/result.png", host: "provider.example.invalid", addresses: ["203.0.113.10"] }),
  createPinnedLookup() { return (_hostname, _options, callback) => callback(null, "203.0.113.10", 4); },
});
mockModule(modulePaths[4], {
  extractManagedPinImagePath() { return null; },
  buildPinImageObjectPath() { return "pins/generation-0123456789abcdef0123456789abcdef.png"; },
  uploadManagedPinImageObject() {
    calls.push({ type: "upload" });
    if (uploadError) throw uploadError;
    throw new Error("unexpected upload");
  },
  deleteManagedPinImageObject() { throw new Error("not used in this test"); },
  findCompletedManagedPinImageUpload: async () => { calls.push({ type: "lookup" }); if (lookupFailure) throw lookupFailure; return null; },
  validatePinImageBucketConfiguration() {},
  EXPECTED_PIN_IMAGE_MIMES: ["image/png", "image/jpeg", "image/webp", "image/gif"],
});
mockModule(modulePaths[5], {
  get: async () => ({ data: Buffer.from("image"), headers: { "content-type": "image/png" } }),
});

const { rehostImage, uploadPinImage } = require("../storage");

test("idempotent image recovery stops safely when completed-upload lookup fails", async () => {
  await assert.rejects(
    rehostImage("https://provider.example.invalid/result.png", {
      idempotencyKey: "stable-provider-result-key",
    }),
    (error) => error.httpStatus === 503 && /Повторите восстановление позже/.test(error.message)
  );

  assert.deepEqual(calls, [{ type: "lookup" }]);
});

test("quarantined deterministic upload path is reported as a conflict, not an internal server error", async () => {
  uploadError = Object.assign(new Error("path quarantined"), { code: "path_quarantined" });
  await assert.rejects(
    uploadPinImage({ buffer: Buffer.from("image"), mimetype: "image/png" }, {
      idempotencyKey: "stable-provider-result-key",
    }),
    (error) => error.httpStatus === 409 &&
      /защиты от дубликатов/.test(error.message)
  );
  assert.deepEqual(calls.slice(-1), [{ type: "upload" }]);
  uploadError = null;
});

test("rehost preserves Storage finalization errors instead of misreporting provider download failure", async () => {
  lookupFailure = null;
  uploadError = Object.assign(new Error("upload finalization unavailable"), { httpStatus: 503 });
  await assert.rejects(
    rehostImage("https://provider.example.invalid/result.png", { idempotencyKey: "stable-provider-result-key" }),
    (error) => error.httpStatus === 503 && /upload finalization unavailable/.test(error.message)
  );
  assert.equal(calls.some((call) => call.type === "upload"), true);
  uploadError = null;
  lookupFailure = lookupError;
});

test("restore original module cache entries", () => {
  for (const path of modulePaths) {
    const original = originals.get(path);
    if (original) require.cache[path] = original;
    else delete require.cache[path];
  }
  delete require.cache[require.resolve("../storage")];
});
