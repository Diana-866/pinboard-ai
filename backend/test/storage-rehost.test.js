const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

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
let quarantinePrimaryPath = false;
let completedRecoveryKey = null;
let completedRecoveryPath = null;
const lookupKeys = [];
const uploadPaths = [];
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
  buildPinImageObjectPath(_extension, key) {
    const digest = crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 32);
    return `pins/generation-${digest}.png`;
  },
  uploadManagedPinImageObject({ objectPath }) {
    calls.push({ type: "upload", path: objectPath });
    uploadPaths.push(objectPath);
    if (uploadError) throw uploadError;
    if (quarantinePrimaryPath && objectPath === `pins/generation-${crypto.createHash("sha256").update("stable-provider-result-key").digest("hex").slice(0, 32)}.png`) {
      const error = new Error("path quarantined");
      error.code = "path_quarantined";
      throw error;
    }
    return true;
  },
  deleteManagedPinImageObject() { throw new Error("not used in this test"); },
  findCompletedManagedPinImageUpload: async ({ idempotencyKey }) => { calls.push({ type: "lookup" }); lookupKeys.push(idempotencyKey); if (lookupFailure) throw lookupFailure; return idempotencyKey === completedRecoveryKey ? completedRecoveryPath : null; },
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


test("quarantined deterministic upload recovers on a stable fresh path", async () => {
  lookupFailure = null;
  quarantinePrimaryPath = true;
  uploadPaths.length = 0;
  const result = await rehostImage("https://provider.example.invalid/result.png", {
    idempotencyKey: "stable-provider-result-key",
  });
  const primaryPath = `pins/generation-${crypto.createHash("sha256").update("stable-provider-result-key").digest("hex").slice(0, 32)}.png`;
  const recoveryPath = `pins/generation-${crypto.createHash("sha256").update("stable-provider-result-key:storage-recovery:1").digest("hex").slice(0, 32)}.png`;
  assert.equal(result.endsWith(recoveryPath), true);
  assert.deepEqual(uploadPaths, [primaryPath, recoveryPath]);
  assert.notEqual(primaryPath, recoveryPath);
  quarantinePrimaryPath = false;
  lookupFailure = lookupError;
});


test("retry reuses a completed recovery upload after a process restart", async () => {
  lookupFailure = null;
  quarantinePrimaryPath = true;
  uploadPaths.length = 0;
  lookupKeys.length = 0;
  completedRecoveryKey = "stable-provider-result-key:storage-recovery:1";
  completedRecoveryPath = `pins/generation-${crypto.createHash("sha256").update(completedRecoveryKey).digest("hex").slice(0, 32)}.png`;

  const result = await rehostImage("https://provider.example.invalid/result.png", {
    idempotencyKey: "stable-provider-result-key",
  });

  assert.equal(result.endsWith(completedRecoveryPath), true);
  assert.deepEqual(uploadPaths, [`pins/generation-${crypto.createHash("sha256").update("stable-provider-result-key").digest("hex").slice(0, 32)}.png`]);
  assert.deepEqual(lookupKeys, [
    "stable-provider-result-key",
    "stable-provider-result-key:storage-recovery:1",
  ]);

  completedRecoveryKey = null;
  completedRecoveryPath = null;
  quarantinePrimaryPath = false;
  lookupFailure = lookupError;
});
