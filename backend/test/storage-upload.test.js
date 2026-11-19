"use strict";

const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");

/**
 * storage.js owns two things that cost real money and can lose a customer's images: the bucket
 * bootstrap on a fresh deployment, and the download-and-rehost ladder for provider images.
 *
 * Uncovered until now: the bucket creation path (24-33), the bucket configuration check (38-40),
 * every 409 lifecycle conflict, and the recovery ladder's exhaustion branch (197-205). Those are
 * exactly the branches a first deploy and a stuck upload take.
 *
 * The lifecycle module (claims, compare-and-swap, retention) has its own suites; here it is doubled
 * so that storage.js's own decisions are what gets verified.
 */

const lifecyclePath = require.resolve("../pinImageLifecycle");

const imageBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG magic
  Buffer.alloc(64, 1),
]);

function loadStorage({ buckets = [], listError = null, createError = null, createdBucket = null, uploadError = null, publicUrl, lifecycle = {} } = {}) {
  const calls = { list: 0, create: [], uploads: [], deletes: [], lookups: [], publicUrls: [] };
  let bucketList = buckets;

  const storageApi = {
    listBuckets: async () => {
      calls.list += 1;
      if (listError) return { data: null, error: listError };
      return { data: bucketList, error: null };
    },
    createBucket: async (name, options) => {
      calls.create.push({ name, options });
      if (createError) return { data: null, error: createError };
      const bucket = createdBucket || { name, ...options };
      bucketList = [bucket];
      return { data: bucket, error: null };
    },
    from: () => ({
      getPublicUrl: (objectPath) => {
        calls.publicUrls.push(objectPath);
        const url = publicUrl ? publicUrl(objectPath) : `https://storage.example.invalid/pin-images/${objectPath}`;
        return { data: url === null ? null : { publicUrl: url } };
      },
    }),
  };

  const supabasePath = require.resolve("../supabase");
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: { storage: storageApi, from: () => { throw new Error("storage.js must not query tables"); } },
  };

  require.cache[lifecyclePath] = {
    id: lifecyclePath,
    filename: lifecyclePath,
    loaded: true,
    exports: {
      EXPECTED_PIN_IMAGE_MIMES: ["image/png", "image/jpeg", "image/webp"],
      extractManagedPinImagePath: lifecycle.extractPath || ((url, base, bucketName) => {
        if (typeof url !== "string" || !url.includes(`/${bucketName}/`)) return null;
        return url.split(`/${bucketName}/`)[1] || null;
      }),
      buildPinImageObjectPath: lifecycle.buildPath || ((ext, key) => (key ? `${key}.${ext}` : `random.${ext}`)),
      uploadManagedPinImageObject: async ({ objectPath, file }) => {
        calls.uploads.push({ objectPath, size: file.length });
        if (uploadError) throw uploadError;
        return { objectPath };
      },
      deleteManagedPinImageObject: async ({ objectPath }) => {
        calls.deletes.push(objectPath);
        return true;
      },
      findCompletedManagedPinImageUpload: async ({ idempotencyKey }) => {
        calls.lookups.push(idempotencyKey);
        if (lifecycle.lookupError) throw lifecycle.lookupError;
        return lifecycle.existingPath
          ? (typeof lifecycle.existingPath === "function" ? lifecycle.existingPath(idempotencyKey) : lifecycle.existingPath)
          : null;
      },
      validatePinImageBucketConfiguration: (bucket) => {
        if (lifecycle.invalidBucket) throw new Error("bucket configuration mismatch");
        return true;
      },
    },
  };

  for (const relative of ["../storage", "../imageValidation"]) delete require.cache[require.resolve(relative)];
  return { storage: require("../storage"), calls };
}

/** Makes the SSRF guard resolve our fake provider host without touching real DNS. */
function stubDns() {
  const dns = require("node:dns");
  const net = require("node:net");
  const original = dns.promises.lookup;
  dns.promises.lookup = async (host) => {
    const family = net.isIP(host);
    return family ? [{ address: host, family }] : [{ address: "93.184.216.34", family: 4 }];
  };
  return () => { dns.promises.lookup = original; };
}

test("the bucket is created once on a fresh deployment and then cached", async () => {
  const { storage, calls } = loadStorage({ buckets: [] });
  await storage.uploadPinImage({ buffer: imageBytes, mimetype: "image/png" });
  assert.equal(calls.create.length, 1, "a missing bucket is created");
  assert.equal(calls.create[0].name, "pin-images");
  assert.equal(calls.create[0].options.public, true);
  assert.ok(calls.create[0].options.fileSizeLimit > 0, "the bucket must keep the same size limit as the validator");
  assert.deepEqual(calls.create[0].options.allowedMimeTypes, ["image/png", "image/jpeg", "image/webp"]);

  await storage.uploadPinImage({ buffer: imageBytes, mimetype: "image/png" });
  assert.equal(calls.list, 1, "the second upload must not list buckets again");
  assert.equal(calls.upload$ ?? calls.uploads.length, 2);
});

test("an existing bucket is not created again", async () => {
  const { storage, calls } = loadStorage({ buckets: [{ name: "pin-images", public: true, file_size_limit: 1000, allowed_mime_types: ["image/png"] }] });
  await storage.uploadPinImage({ buffer: imageBytes, mimetype: "image/png" });
  assert.equal(calls.create.length, 0);
  assert.equal(calls.list, 1);
});

test("a storage misconfiguration is reported as 503 without leaking provider text", async () => {
  const listFailure = loadStorage({ listError: { message: "supabase internal detail" } });
  const error = await listFailure.storage.uploadPinImage({ buffer: imageBytes, mimetype: "image/png" })
    .then(() => null, (caught) => caught);
  assert.equal(error.httpStatus, 503);
  assert.doesNotMatch(error.message, /supabase internal detail/);

  const createFailure = loadStorage({ buckets: [], createError: { message: "permission denied on schema storage" } });
  const createError = await createFailure.storage.uploadPinImage({ buffer: imageBytes, mimetype: "image/png" })
    .then(() => null, (caught) => caught);
  assert.equal(createError.httpStatus, 503);

  const wrongConfig = loadStorage({ buckets: [{ name: "pin-images" }], lifecycle: { invalidBucket: true } });
  const configError = await wrongConfig.storage.uploadPinImage({ buffer: imageBytes, mimetype: "image/png" })
    .then(() => null, (caught) => caught);
  assert.equal(configError.httpStatus, 503);
  assert.equal(configError.message, "Настройки бакета pin-images не соответствуют требованиям приложения");
  assert.equal(wrongConfig.calls.uploads.length, 0, "nothing may be uploaded into a bucket that fails validation");
});

test("a file that is not a real image is refused before the bucket is touched", async () => {
  const { storage, calls } = loadStorage({ buckets: [] });
  const error = await storage.uploadPinImage({ buffer: Buffer.from("<!doctype html>"), mimetype: "image/png" })
    .then(() => null, (caught) => caught);
  assert.equal(error.httpStatus, 422, "the signature decides, not the client's content type");
  assert.equal(calls.list, 0);
  assert.equal(calls.uploads.length, 0);
});

test("every lifecycle conflict keeps its own status and code", async () => {
  const cases = [
    ["referenced", 409, "Это изображение уже используется"],
    ["upload_in_progress", 409, "Изображение сейчас обрабатывается"],
    ["deletion_in_progress", 409, "Изображение сейчас обрабатывается"],
    ["already_deleted", 409, "уже был удалён"],
    ["path_quarantined", 409, "остановлено для защиты от дубликатов"],
  ];
  for (const [code, status, message] of cases) {
    const { storage } = loadStorage({ buckets: [{ name: "pin-images" }], uploadError: Object.assign(new Error("claim rejected"), { code }) });
    const error = await storage.uploadPinImage({ buffer: imageBytes, mimetype: "image/png" })
      .then(() => null, (caught) => caught);
    assert.equal(error.httpStatus, status, `${code} must be ${status}`);
    assert.match(error.message, new RegExp(message));
    if (code !== "referenced" && code !== "upload_in_progress" && code !== "deletion_in_progress") {
      assert.equal(error.code, code, "the recovery ladder above depends on this code surviving");
    }
  }
});

test("an unexpected upload failure is a 500 and a missing public URL is not silently returned", async () => {
  const broken = loadStorage({ buckets: [{ name: "pin-images" }], uploadError: new Error("socket closed") });
  const error = await broken.storage.uploadPinImage({ buffer: imageBytes, mimetype: "image/png" })
    .then(() => null, (caught) => caught);
  assert.equal(error.httpStatus, 500);
  assert.match(error.message, /socket closed/);

  const noUrl = loadStorage({ buckets: [{ name: "pin-images" }], publicUrl: () => null });
  const urlError = await noUrl.storage.uploadPinImage({ buffer: imageBytes, mimetype: "image/png" })
    .then(() => null, (caught) => caught);
  assert.equal(urlError.httpStatus, 500);
  assert.match(urlError.message, /ссылку на изображение/);
});

test("deleting an unmanaged URL is a no-op, and a managed one goes through the claim protocol", async () => {
  const { storage, calls } = loadStorage({ buckets: [{ name: "pin-images" }] });
  assert.equal(await storage.deletePinImageIfUnreferenced("https://elsewhere.example.invalid/a.png"), false);
  assert.equal(calls.deletes.length, 0, "a foreign URL must never be deleted");

  assert.equal(await storage.deletePinImageIfUnreferenced("https://storage.example.invalid/pin-images/pins/a.png"), true);
  assert.deepEqual(calls.deletes, ["pins/a.png"]);
});

test("rehosting an already completed idempotency key returns the stored object without downloading", async () => {
  const { storage, calls } = loadStorage({
    buckets: [{ name: "pin-images" }],
    lifecycle: { existingPath: "pins/completed.png" },
  });
  const url = await storage.rehostImage("https://provider.example.invalid/tmp.png", { idempotencyKey: "key-1" });
  assert.match(url, /pins\/completed\.png$/);
  assert.deepEqual(calls.lookups, ["key-1"]);
  assert.equal(calls.uploads.length, 0, "a completed object must never be uploaded again");
});

test("a failed idempotency lookup refuses instead of downloading blindly", async () => {
  const { storage, calls } = loadStorage({
    buckets: [{ name: "pin-images" }],
    lifecycle: { lookupError: new Error("journal unavailable") },
  });
  const error = await storage.rehostImage("https://provider.example.invalid/tmp.png", { idempotencyKey: "key-1" })
    .then(() => null, (caught) => caught);
  assert.equal(error.httpStatus, 503);
  assert.equal(calls.uploads.length, 0);
});

test("a provider URL must be public HTTPS before anything is downloaded", async () => {
  const { storage, calls } = loadStorage({ buckets: [{ name: "pin-images" }] });
  for (const source of ["http://provider.example.invalid/tmp.png", "file:///etc/passwd", "http://127.0.0.1/a.png"]) {
    const error = await storage.rehostImage(source).then(() => null, (caught) => caught);
    assert.ok(error, `${source} must be refused`);
    assert.ok(error.httpStatus === 422 || error.httpStatus === 503 || error.httpStatus === 502,
      `${source} must be refused with a client error, got ${error.httpStatus}`);
  }
  assert.equal(calls.uploads.length, 0);
});

test("the recovery ladder retries a retired path on a stable key and stops when all slots are gone", async () => {
  // First upload is quarantined; the recovery attempt succeeds on its own stable key.
  let quarantined = 1;
  const calls = { uploads: [] };
  const lifecyclePathLocal = require.resolve("../pinImageLifecycle");
  const storagePath = require.resolve("../storage");
  const supabasePath = require.resolve("../supabase");
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      storage: {
        listBuckets: async () => ({ data: [{ name: "pin-images" }], error: null }),
        createBucket: async () => ({ data: null, error: null }),
        from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.example.invalid/pin-images/${path}` } }) }),
      },
    },
  };
  require.cache[lifecyclePathLocal] = {
    id: lifecyclePathLocal,
    filename: lifecyclePathLocal,
    loaded: true,
    exports: {
      EXPECTED_PIN_IMAGE_MIMES: ["image/png"],
      extractManagedPinImagePath: () => null,
      buildPinImageObjectPath: (ext, key) => `${key || "random"}.${ext}`,
      uploadManagedPinImageObject: async ({ objectPath }) => {
        calls.uploads.push(objectPath);
        if (quarantined > 0) {
          quarantined -= 1;
          throw Object.assign(new Error("retired"), { code: "path_quarantined" });
        }
        return { objectPath };
      },
      deleteManagedPinImageObject: async () => true,
      findCompletedManagedPinImageUpload: async () => null,
      validatePinImageBucketConfiguration: () => true,
    },
  };
  delete require.cache[storagePath];
  const storage = require("../storage");
  const restoreDns = stubDns();

  // The download is stubbed at the axios boundary.
  const axiosPath = require.resolve("axios");
  const originalAxios = require.cache[axiosPath];
  require.cache[axiosPath] = {
    id: axiosPath,
    filename: axiosPath,
    loaded: true,
    exports: {
      get: async () => ({ data: imageBytes, headers: { "content-type": "image/png" }, status: 200 }),
    },
  };
  try {
    const url = await storage.rehostImage("https://provider.example.invalid/tmp.png", { idempotencyKey: "key-abc" });
    assert.match(url, /key-abc:storage-recovery:1\.png$/,
      "the recovery upload uses its own stable key, not the retired one");
    assert.deepEqual(calls.uploads, ["key-abc.png", "key-abc:storage-recovery:1.png"]);

    quarantined = 4;
    calls.uploads.length = 0;
    const exhausted = await storage.rehostImage("https://provider.example.invalid/tmp.png", { idempotencyKey: "key-xyz" })
      .then(() => null, (caught) => caught);
    assert.equal(exhausted.httpStatus, 409);
    assert.match(exhausted.message, /исчерпаны/);
    assert.deepEqual(calls.uploads, [
      "key-xyz.png",
      "key-xyz:storage-recovery:1.png",
      "key-xyz:storage-recovery:2.png",
      "key-xyz:storage-recovery:3.png",
    ], "the ladder is bounded to three recovery slots");
  } finally {
    restoreDns();
    if (originalAxios) require.cache[axiosPath] = originalAxios;
    else delete require.cache[axiosPath];
    delete require.cache[storagePath];
  }
});

test("a provider download failure is a 502 and the agents are always destroyed", async () => {
  const storagePath = require.resolve("../storage");
  const axiosPath = require.resolve("axios");
  const originalAxios = require.cache[axiosPath];
  const agents = [];
  const nodeHttp = require("node:http");
  const nodeHttps = require("node:https");
  const originalHttpAgent = nodeHttp.Agent;
  const originalHttpsAgent = nodeHttps.Agent;

  require.cache[axiosPath] = {
    id: axiosPath,
    filename: axiosPath,
    loaded: true,
    exports: { get: async () => { throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }); } },
  };
  // Track the agent instances storage.js creates for the pinned lookup.
  const tracking = (Original, list) => class TrackedAgent extends Original {
    constructor(options) { super(options); this.wasDestroyed = false; list.push(this); }
    destroy() { this.wasDestroyed = true; return super.destroy(); }
  };
  nodeHttp.Agent = tracking(originalHttpAgent, agents);
  nodeHttps.Agent = tracking(originalHttpsAgent, agents);

  const { storage } = loadStorage({ buckets: [{ name: "pin-images" }] });
  const restoreDns = stubDns();
  try {
    const error = await storage.rehostImage("https://provider.example.invalid/tmp.png").then(() => null, (caught) => caught);
    assert.equal(error.httpStatus, 502);
    assert.match(error.message, /Не удалось безопасно получить изображение/);
    assert.ok(agents.length >= 2, "a pinned agent is created for the download");
    agents.forEach((agent) => assert.equal(agent.wasDestroyed, true, "every agent must be destroyed in finally"));
  } finally {
    restoreDns();
    nodeHttp.Agent = originalHttpAgent;
    nodeHttps.Agent = originalHttpsAgent;
    if (originalAxios) require.cache[axiosPath] = originalAxios;
    else delete require.cache[axiosPath];
    delete require.cache[storagePath];
  }
});
