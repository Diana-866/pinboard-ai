const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { extractManagedPinImagePath, buildPinImageObjectPath, uploadManagedPinImageObject, reconcileStalePinImageUploads, quarantineStalePinImageUploads, inspectQuarantinedPinImageObjects, retryFailedPinImageDeletions, processPendingPinImageRetentionQueue, deleteManagedPinImageObject, findCompletedManagedPinImageUpload, validatePinImageBucketConfiguration, isDefiniteStorageRejection, isStorageObjectNotFound } = require("../pinImageLifecycle");

const base = "https://project.supabase.co";

test("classifies only definite client-side Storage rejections as safe to finalize", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(isDefiniteStorageRejection({ statusCode: status }), true, `status ${status}`);
  }
  for (const status of [408, 409, 425, 429, 500, 502, 503]) {
    assert.equal(isDefiniteStorageRejection({ statusCode: status }), false, `status ${status}`);
  }
  assert.equal(isDefiniteStorageRejection(new Error("network timeout")), false);
  assert.equal(isDefiniteStorageRejection({ statusCode: "not-a-status" }), false);
});

test("accepts the exact public pin image bucket configuration", () => {
  assert.equal(validatePinImageBucketConfiguration({
    name: "pin-images",
    public: true,
    file_size_limit: 5 * 1024 * 1024,
    allowed_mime_types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  }), true);
});

test("rejects a private or unexpected bucket", () => {
  assert.throws(() => validatePinImageBucketConfiguration({
    name: "pin-images", public: false, file_size_limit: 5 * 1024 * 1024,
    allowed_mime_types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  }), { code: "invalid_pin_image_bucket_visibility" });
  assert.throws(() => validatePinImageBucketConfiguration({
    name: "other", public: true, file_size_limit: 5 * 1024 * 1024,
    allowed_mime_types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  }), { code: "invalid_pin_image_bucket_visibility" });
});

test("rejects a widened or missing MIME allow-list", () => {
  assert.throws(() => validatePinImageBucketConfiguration({
    name: "pin-images", public: true, file_size_limit: 5 * 1024 * 1024,
    allowed_mime_types: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"],
  }), { code: "invalid_pin_image_bucket_mimes" });
  assert.throws(() => validatePinImageBucketConfiguration({
    name: "pin-images", public: true, file_size_limit: 5 * 1024 * 1024,
  }), { code: "invalid_pin_image_bucket_mimes" });
});

test("rejects a bucket size limit below the application's 5 MiB upload ceiling", () => {
  assert.throws(() => validatePinImageBucketConfiguration({
    name: "pin-images", public: true, file_size_limit: 1024,
    allowed_mime_types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  }), { code: "invalid_pin_image_bucket_size_limit" });
});

test("extracts an owned pin object path from the configured public bucket", () => {
  assert.equal(
    extractManagedPinImagePath(
      "https://project.supabase.co/storage/v1/object/public/pin-images/pins/1730000000000-ab12cd34.webp",
      base
    ),
    "pins/1730000000000-ab12cd34.webp"
  );
});

test("rejects another host, bucket, or Supabase project", () => {
  assert.equal(extractManagedPinImagePath("https://evil.example/storage/v1/object/public/pin-images/pins/1730000000000-ab12cd34.webp", base), null);
  assert.equal(extractManagedPinImagePath("https://project.supabase.co/storage/v1/object/public/other/pins/1730000000000-ab12cd34.webp", base), null);
  assert.equal(extractManagedPinImagePath("https://other.supabase.co/storage/v1/object/public/pin-images/pins/1730000000000-ab12cd34.webp", base), null);
});

test("rejects paths outside the generated pin object naming scheme", () => {
  assert.equal(extractManagedPinImagePath("https://project.supabase.co/storage/v1/object/public/pin-images/avatars/user.png", base), null);
  assert.equal(extractManagedPinImagePath("https://project.supabase.co/storage/v1/object/public/pin-images/pins/../../secrets.png", base), null);
  assert.equal(extractManagedPinImagePath("https://project.supabase.co/storage/v1/object/public/pin-images/pins/1730000000000-ab12cd34.svg", base), null);
});


test("ordinary upload object paths use cryptographically random, cleanup-compatible identifiers", () => {
  const first = buildPinImageObjectPath("webp");
  const second = buildPinImageObjectPath("webp");
  assert.match(first, /^pins\/\d+-[a-f0-9]{32}\.webp$/);
  assert.match(second, /^pins\/\d+-[a-f0-9]{32}\.webp$/);
  assert.notEqual(first, second);
  assert.equal(
    extractManagedPinImagePath(`https://project.supabase.co/storage/v1/object/public/pin-images/${first}`, base),
    first
  );
});

test("generation upload object keys are deterministic for the same provider idempotency key", () => {
  const first = buildPinImageObjectPath("webp", "provider-task-key-123");
  const retry = buildPinImageObjectPath("webp", "provider-task-key-123");
  const other = buildPinImageObjectPath("webp", "provider-task-key-456");
  assert.equal(first, retry);
  assert.notEqual(first, other);
  assert.match(first, /^pins\/generation-[a-f0-9]{32}\.webp$/);
});

test("deterministic generation object paths are recognized as managed", () => {
  const path = buildPinImageObjectPath("png", "provider-task-key");
  assert.equal(
    extractManagedPinImagePath(`https://project.supabase.co/storage/v1/object/public/pin-images/${path}`, base),
    path
  );
});


test("GIF objects are supported and recognized for safe cleanup", () => {
  const path = buildPinImageObjectPath("gif", "provider-task-gif");
  assert.match(path, /^pins\/generation-[a-f0-9]{32}\.gif$/);
  assert.equal(
    extractManagedPinImagePath(`https://project.supabase.co/storage/v1/object/public/pin-images/${path}`, base),
    path
  );
});

function makeStorageClient(options = {}) {
  const calls = [];
  let uploadFinalizeIndex = 0;
  let deletionFinalizeIndex = 0;
  const supabase = {
    calls,
    async rpc(name, args) {
      calls.push({ type: "rpc", name, args });
      if (name === "claim_pin_image_deletion") {
        return { data: options.claimData === undefined
          ? { claimed: true, claim_token: "claim-123" }
          : options.claimData, error: options.claimError || null };
      }
      if (name === "find_completed_pin_image_upload") return { data: options.completedObjectPath === undefined ? null : options.completedObjectPath, error: options.completedLookupError || null };
      if (name === "begin_pin_image_upload") {
        return { data: options.uploadReservation === undefined
          ? { reserved: true, upload_token: "upload-123" }
          : options.uploadReservation, error: options.reserveError || null };
      }
      if (name === "finalize_pin_image_upload") {
        const queued = options.uploadFinalizeResponses && options.uploadFinalizeResponses[uploadFinalizeIndex++];
        if (queued) return queued;
        return { data: options.uploadFinalizeData === undefined ? true : options.uploadFinalizeData,
          error: options.uploadFinalizeError || null };
      }
      if (name === "list_failed_pin_image_deletions") return { data: options.failedDeletions === undefined ? [] : options.failedDeletions, error: options.failedInventoryError || null };
      if (name === "list_quarantined_pin_image_objects") {
        return { data: options.quarantinedObjects === undefined ? [] : options.quarantinedObjects,
          error: options.quarantinedInventoryError || null };
      }
      if (name === "list_stale_pin_image_uploads") {
        if (options.staleUploadResult !== undefined) return options.staleUploadResult;
        return { data: options.staleUploads === undefined ? [] : options.staleUploads,
          error: options.inventoryError || null };
      }
      if (name === "quarantine_stale_pin_image_upload") {
        return { data: options.quarantineData === undefined ? true : options.quarantineData,
          error: options.quarantineError || null };
      }
      if (name === "finalize_pin_image_deletion") {
        const queued = options.finalizeResponses && options.finalizeResponses[deletionFinalizeIndex++];
        if (queued) return queued;
      }
      return { data: options.finalizeData === undefined ? true : options.finalizeData,
        error: options.finalizeError || null };
    },
    storage: {
      from(bucket) {
        return {
          async remove(paths) {
            calls.push({ type: "remove", bucket, paths });
            if (options.removeThrows) throw options.removeThrows;
            return { error: options.removeError || null };
          },
          async upload(path, file, uploadOptions) {
            calls.push({ type: "upload", bucket, path, file, uploadOptions });
            if (options.uploadThrows) throw options.uploadThrows;
            return { error: options.uploadError || null };
          },
          async list(folder, listOptions) {
            calls.push({ type: "list", bucket, folder, listOptions });
            if (options.listThrows) return { data: null, error: options.listThrows };
            return { data: options.listData === undefined ? [{ name: "1730000000000-ab12cd34.webp" }] : options.listData,
              error: options.listError || null };
          },
        };
      },
    },
  };
  return supabase;
}

test("completed deterministic upload is recoverable only when lifecycle and Storage both confirm it", async () => {
  const path = "pins/generation-0123456789abcdef0123456789abcdef.webp";
  const supabase = makeStorageClient({ completedObjectPath: path, listData: [{ name: "generation-0123456789abcdef0123456789abcdef.webp" }] });
  assert.equal(await findCompletedManagedPinImageUpload({ supabase, idempotencyKey: "stable-provider-key" }), path);
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), ["find_completed_pin_image_upload", "list"]);
});

test("completed upload recovery rejects a missing Storage object", async () => {
  const path = "pins/generation-0123456789abcdef0123456789abcdef.webp";
  const supabase = makeStorageClient({ completedObjectPath: path, listData: [] });
  assert.equal(await findCompletedManagedPinImageUpload({ supabase, idempotencyKey: "stable-provider-key" }), null);
});

test("completed upload recovery ignores a non-deterministic or untrusted path", async () => {
  const supabase = makeStorageClient({ completedObjectPath: "pins/other-user-file.webp" });
  assert.equal(await findCompletedManagedPinImageUpload({ supabase, idempotencyKey: "stable-provider-key" }), null);
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), ["find_completed_pin_image_upload"]);
});

test("deletion claim refusal never calls Storage", async () => {
  const supabase = makeStorageClient({ claimData: { claimed: false, reason: "referenced" } });
  assert.equal(await deleteManagedPinImageObject({ supabase, objectPath: "pins/1730000000000-ab12cd34.webp" }), false);
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), ["claim_pin_image_deletion"]);
});

test("confirmed Storage deletion is finalized with the matching claim token", async () => {
  const supabase = makeStorageClient();
  assert.equal(await deleteManagedPinImageObject({ supabase, objectPath: "pins/1730000000000-ab12cd34.webp" }), true);
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "claim_pin_image_deletion", "remove", "finalize_pin_image_deletion",
  ]);
  assert.equal(supabase.calls[2].args.p_claim_token, "claim-123");
  assert.equal(supabase.calls[2].args.p_deleted, true);
});

test("deletion finalization retries a transient database response using the same fencing token", async () => {
  const transient = new Error("database response lost");
  const supabase = makeStorageClient({
    finalizeResponses: [
      { data: null, error: transient },
      { data: true, error: null },
    ],
  });
  assert.equal(await deleteManagedPinImageObject({
    supabase, objectPath: "pins/1730000000000-ab12cd34.webp",
  }), true);
  const finalizations = supabase.calls.filter((call) => call.name === "finalize_pin_image_deletion");
  assert.equal(finalizations.length, 2);
  assert.equal(finalizations[0].args.p_claim_token, "claim-123");
  assert.deepEqual(finalizations[1].args, finalizations[0].args);
});

test("only object-specific 404 responses confirm that the target object is absent", () => {
  assert.equal(isStorageObjectNotFound(Object.assign(new Error("Object not found"), {
    code: "not_found", statusCode: 404,
  })), true);
  assert.equal(isStorageObjectNotFound(Object.assign(new Error("Bucket not found"), {
    code: "not_found", statusCode: 404,
  })), false);
  assert.equal(isStorageObjectNotFound(Object.assign(new Error("Not found"), {
    code: "not_found", statusCode: 404,
  })), false);
  assert.equal(isStorageObjectNotFound(Object.assign(new Error("Object not found"), {
    code: "not_found", statusCode: 500,
  })), false);
});

test("generic Storage 404 is finalized as a failure, not mistaken for an absent object", async () => {
  const bucketMissing = Object.assign(new Error("Bucket not found"), {
    code: "not_found", statusCode: 404,
  });
  const supabase = makeStorageClient({ removeError: bucketMissing });
  await assert.rejects(
    deleteManagedPinImageObject({ supabase, objectPath: "pins/1730000000000-ab12cd34.webp" }),
    (error) => error === bucketMissing
  );
  const finalize = supabase.calls.find((call) => call.name === "finalize_pin_image_deletion");
  assert.equal(finalize.args.p_deleted, false);
  assert.equal(finalize.args.p_error_code, "not_found");
});

test("Storage object-not-found finalizes deletion as successful and releases the path", async () => {
  const missingObject = Object.assign(new Error("object not found"), {
    code: "not_found",
    statusCode: 404,
  });
  const supabase = makeStorageClient({ removeError: missingObject });
  assert.equal(
    await deleteManagedPinImageObject({ supabase, objectPath: "pins/1730000000000-ab12cd34.webp" }),
    true
  );
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "claim_pin_image_deletion", "remove", "finalize_pin_image_deletion",
  ]);
  const finalize = supabase.calls.find((call) => call.name === "finalize_pin_image_deletion");
  assert.equal(finalize.args.p_claim_token, "claim-123");
  assert.equal(finalize.args.p_deleted, true);
  assert.equal(finalize.args.p_error_code, null);
});

test("definite Storage rejection is finalized as failed before surfacing the error", async () => {
  const storageError = Object.assign(new Error("storage rejected"), { code: "storage_rejected", statusCode: 400 });
  const supabase = makeStorageClient({ removeError: storageError });
  await assert.rejects(
    deleteManagedPinImageObject({ supabase, objectPath: "pins/1730000000000-ab12cd34.webp" }),
    (error) => error === storageError
  );
  const finalize = supabase.calls.find((call) => call.name === "finalize_pin_image_deletion");
  assert.equal(finalize.args.p_deleted, false);
  assert.equal(finalize.args.p_error_code, "storage_rejected");
});


test("returned Storage 5xx keeps the deletion claim fenced", async () => {
  const storageError = Object.assign(new Error("storage unavailable"), { statusCode: 500 });
  const supabase = makeStorageClient({ removeError: storageError });
  await assert.rejects(
    deleteManagedPinImageObject({ supabase, objectPath: "pins/1730000000000-ab12cd34.webp" }),
    (error) => error === storageError
  );
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "claim_pin_image_deletion", "remove",
  ]);
});

test("ambiguous thrown Storage failure keeps the claim and does not finalize or release it", async () => {
  const networkError = new Error("connection reset");
  const supabase = makeStorageClient({ removeThrows: networkError });
  await assert.rejects(
    deleteManagedPinImageObject({ supabase, objectPath: "pins/1730000000000-ab12cd34.webp" }),
    (error) => error === networkError
  );
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "claim_pin_image_deletion", "remove",
  ]);
});

test("claim RPC failure prevents any Storage request", async () => {
  const rpcError = new Error("migration missing");
  const supabase = makeStorageClient({ claimError: rpcError });
  await assert.rejects(
    deleteManagedPinImageObject({ supabase, objectPath: "pins/1730000000000-ab12cd34.webp" }),
    (error) => error === rpcError
  );
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), ["claim_pin_image_deletion"]);
});

test("failed finalization does not report a successful cleanup", async () => {
  const rpcError = new Error("finalize unavailable");
  const supabase = makeStorageClient({ finalizeError: rpcError });
  await assert.rejects(
    deleteManagedPinImageObject({ supabase, objectPath: "pins/1730000000000-ab12cd34.webp" }),
    (error) => error === rpcError
  );
});


test("upload reservation is acquired before Storage and finalized after success", async () => {
  const supabase = makeStorageClient();
  assert.equal(await uploadManagedPinImageObject({
    supabase, objectPath: "pins/1730000000000-ab12cd34.webp",
    file: Buffer.from("image"), contentType: "image/webp",
  }), true);
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "begin_pin_image_upload", "upload", "finalize_pin_image_upload",
  ]);
  assert.equal(supabase.calls[2].args.p_upload_token, "upload-123");
  assert.equal(supabase.calls[2].args.p_uploaded, true);
});


test("upload reservation RPC failure prevents any Storage request", async () => {
  const rpcError = new Error("migration missing");
  const supabase = makeStorageClient({ reserveError: rpcError });
  await assert.rejects(
    uploadManagedPinImageObject({
      supabase, objectPath: "pins/1730000000000-ab12cd34.webp",
      file: Buffer.from("image"), contentType: "image/webp",
    }),
    (error) => error === rpcError
  );
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), ["begin_pin_image_upload"]);
});

test("upload reservation refusal never writes or overwrites Storage", async () => {
  const supabase = makeStorageClient({
    uploadReservation: { reserved: false, reason: "referenced" },
  });
  await assert.rejects(
    uploadManagedPinImageObject({
      supabase, objectPath: "pins/1730000000000-ab12cd34.webp",
      file: Buffer.from("image"), contentType: "image/webp",
    }),
    (error) => error.code === "referenced"
  );
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), ["begin_pin_image_upload"]);
});

test("definite Storage upload rejection releases the reservation with a failed result", async () => {
  const storageError = Object.assign(new Error("storage rejected"), { code: "storage_rejected", statusCode: 400 });
  const supabase = makeStorageClient({ uploadError: storageError });
  await assert.rejects(
    uploadManagedPinImageObject({
      supabase, objectPath: "pins/1730000000000-ab12cd34.webp",
      file: Buffer.from("image"), contentType: "image/webp",
    }),
    (error) => error === storageError
  );
  const finalize = supabase.calls.find((call) => call.name === "finalize_pin_image_upload");
  assert.equal(finalize.args.p_uploaded, false);
  assert.equal(finalize.args.p_error_code, "storage_rejected");
});


test("returned Storage 5xx keeps the upload reservation fenced", async () => {
  const storageError = Object.assign(new Error("storage unavailable"), { statusCode: 500 });
  const supabase = makeStorageClient({ uploadError: storageError });
  await assert.rejects(
    uploadManagedPinImageObject({
      supabase, objectPath: "pins/1730000000000-ab12cd34.webp",
      file: Buffer.from("image"), contentType: "image/webp",
    }),
    (error) => error === storageError
  );
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "begin_pin_image_upload", "upload",
  ]);
});

test("ambiguous thrown upload failure keeps the upload reservation fenced", async () => {
  const networkError = new Error("connection reset");
  const supabase = makeStorageClient({ uploadThrows: networkError });
  await assert.rejects(
    uploadManagedPinImageObject({
      supabase, objectPath: "pins/1730000000000-ab12cd34.webp",
      file: Buffer.from("image"), contentType: "image/webp",
    }),
    (error) => error === networkError
  );
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "begin_pin_image_upload", "upload",
  ]);
});

test("failed upload finalization does not report a successful upload", async () => {
  const rpcError = new Error("finalize unavailable");
  const supabase = makeStorageClient({ uploadFinalizeError: rpcError });
  await assert.rejects(
    uploadManagedPinImageObject({
      supabase, objectPath: "pins/1730000000000-ab12cd34.webp",
      file: Buffer.from("image"), contentType: "image/webp",
    }),
    (error) => error === rpcError
  );
});

test("upload finalization retries a transient database response using the same fencing token", async () => {
  const transient = new Error("database response lost");
  const supabase = makeStorageClient({
    uploadFinalizeResponses: [
      { data: null, error: transient },
      { data: true, error: null },
    ],
  });
  assert.equal(await uploadManagedPinImageObject({
    supabase,
    objectPath: "pins/1730000000000-ab12cd34.webp",
    file: Buffer.from("image"),
    contentType: "image/webp",
  }), true);
  const finalizations = supabase.calls.filter((call) => call.name === "finalize_pin_image_upload");
  assert.equal(finalizations.length, 2);
  assert.equal(finalizations[0].args.p_upload_token, "upload-123");
  assert.deepEqual(finalizations[1].args, finalizations[0].args);
});

test("stale upload quarantine rejects malformed inventory before any quarantine RPC", async () => {
  const supabase = makeStorageClient({ staleUploadResult: { data: null, error: null } });
  await assert.rejects(quarantineStalePinImageUploads({ supabase }), { httpStatus: 502 });
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "list_stale_pin_image_uploads",
  ]);
});

test("stale upload reconciliation rejects malformed inventory before Storage inspection", async () => {
  const supabase = makeStorageClient({ staleUploadResult: { data: {}, error: null } });
  await assert.rejects(reconcileStalePinImageUploads({ supabase }), { httpStatus: 502 });
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "list_stale_pin_image_uploads",
  ]);
});

test("stale upload quarantine retires exact paths with their current fencing tokens", async () => {
  const supabase = makeStorageClient({
    staleUploads: [
      { bucket_id: "pin-images", object_path: "pins/1730000000000-ab12cd34.webp", upload_token: "token-a" },
      { bucket_id: "pin-images", object_path: "pins/1730000000001-ab12cd34.webp", upload_token: "token-b" },
    ],
  });
  const result = await quarantineStalePinImageUploads({ supabase });
  assert.deepEqual(result, {
    inspected: 2, quarantined: 2, skipped: 0, failed: 0,
    items: [
      { object_path: "pins/1730000000000-ab12cd34.webp", attempts: null, claim_expires_at: null, updated_at: null, status: "quarantined", reason: "path_permanently_retired" },
      { object_path: "pins/1730000000001-ab12cd34.webp", attempts: null, claim_expires_at: null, updated_at: null, status: "quarantined", reason: "path_permanently_retired" },
    ],
  });
  const calls = supabase.calls.filter((call) => call.name === "quarantine_stale_pin_image_upload");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args.p_upload_token, "token-a");
  assert.equal(calls[1].args.p_upload_token, "token-b");
});

test("stale upload quarantine skips rows without a valid fencing token", async () => {
  const supabase = makeStorageClient({
    staleUploads: [{ bucket_id: "pin-images", object_path: "pins/1730000000000-ab12cd34.webp" }],
  });
  const result = await quarantineStalePinImageUploads({ supabase });
  assert.deepEqual(result, {
    inspected: 1, quarantined: 0, skipped: 1, failed: 0,
    items: [{
      object_path: "pins/1730000000000-ab12cd34.webp", attempts: null,
      claim_expires_at: null, updated_at: null, status: "skipped", reason: "invalid_inventory_row",
    }],
  });
  assert.equal(supabase.calls.some((call) => call.name === "quarantine_stale_pin_image_upload"), false);
});

test("stale upload reconciliation is observational even when the exact object is visible", async () => {
  const supabase = makeStorageClient({
    staleUploads: [{
      bucket_id: "pin-images",
      object_path: "pins/1730000000000-ab12cd34.webp",
      upload_token: "stale-upload-token",
      attempts: 3,
      claim_expires_at: "2026-11-08T22:00:00.000Z",
      updated_at: "2026-11-08T21:50:00.000Z",
    }],
  });
  const result = await reconcileStalePinImageUploads({ supabase });
  assert.equal(result.inspected, 1);
  assert.equal(result.objectVisible, 1);
  assert.equal(result.objectMissing, 0);
  assert.deepEqual(result.unresolved[0], {
    object_path: "pins/1730000000000-ab12cd34.webp",
    attempts: 3,
    claim_expires_at: "2026-11-08T22:00:00.000Z",
    updated_at: "2026-11-08T21:50:00.000Z",
    stale_for_seconds: result.unresolved[0].stale_for_seconds,
    reason: "object_visible_requires_operator_confirmation",
    safe_action: "keep_fenced_until_original_upload_is_confirmed_stopped",
  });
  assert.equal(Number.isInteger(result.unresolved[0].stale_for_seconds), true);
  assert.equal(JSON.stringify(result).includes("stale-upload-token"), false);
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "list_stale_pin_image_uploads", "list",
  ]);
  assert.equal(supabase.calls.some((call) => call.name === "finalize_pin_image_upload"), false);
});

test("stale upload reconciliation keeps missing objects fenced", async () => {
  const supabase = makeStorageClient({
    staleUploads: [{
      bucket_id: "pin-images",
      object_path: "pins/1730000000000-ab12cd34.webp",
      upload_token: "stale-upload-token",
      attempts: 2,
    }],
    listData: [],
  });
  const result = await reconcileStalePinImageUploads({ supabase });
  assert.equal(result.objectMissing, 1);
  assert.equal(result.unresolved[0].reason, "object_missing_keep_fenced");
  assert.equal(result.unresolved[0].safe_action, "keep_fenced_and_check_provider_or_storage_logs");
  assert.equal(result.unresolved[0].attempts, 2);
  assert.equal(supabase.calls.some((call) => call.name === "finalize_pin_image_upload"), false);
});

test("stale upload reconciliation does not change state when Storage inventory fails", async () => {
  const supabase = makeStorageClient({
    staleUploads: [{
      bucket_id: "pin-images",
      object_path: "pins/1730000000000-ab12cd34.webp",
      upload_token: "stale-upload-token",
    }],
    listError: new Error("storage unavailable"),
  });
  const result = await reconcileStalePinImageUploads({ supabase });
  assert.equal(result.objectVisible, 0);
  assert.equal(result.objectMissing, 0);
  assert.equal(result.unresolved[0].reason, "storage_inventory_failed");
  assert.equal(result.unresolved[0].safe_action, "retry_read_only_reconciliation");
  assert.equal(supabase.calls.some((call) => call.name === "finalize_pin_image_upload"), false);
});


test("quarantined object inventory reports present and absent objects without deleting or reopening them", async () => {
  const supabase = makeStorageClient({
    quarantinedObjects: [
      { bucket_id: "pin-images", object_path: "pins/1730000000000-ab12cd34.webp", attempts: 2, last_error_code: "stale_delete_quarantined", updated_at: "2026-11-09T00:00:00Z", has_reference: false },
      { bucket_id: "pin-images", object_path: "pins/generation-0123456789abcdef0123456789abcdef.png", attempts: 1, last_error_code: "stale_upload_quarantined", updated_at: "2026-11-09T00:01:00Z", has_reference: true },
    ],
    listData: [{ name: "1730000000000-ab12cd34.webp" }],
  });
  const result = await inspectQuarantinedPinImageObjects({ supabase, limit: 200 });
  assert.equal(result.inspected, 2);
  assert.equal(result.objectVisible, 1);
  assert.equal(result.objectMissing, 1);
  assert.equal(result.items[0].status, "object_present");
  assert.equal(result.items[0].safe_action, "manual_review_only_no_automatic_delete_or_unquarantine");
  assert.equal(result.items[1].status, "object_absent");
  assert.equal(result.items[1].has_reference, true);
  assert.equal(result.items[1].safe_action, "investigate_reference_guard_before_any_action");
  // The inventory RPC accepts at most 100 rows; oversized requests are clamped, not rejected.
  assert.equal(supabase.calls[0].args.p_limit, 100);
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "list_quarantined_pin_image_objects", "list", "list",
  ]);
  assert.equal(supabase.calls.some((call) => call.type === "remove" || call.name === "claim_pin_image_deletion"), false);
});

test("quarantined inventory rejects malformed paths and reports Storage listing errors safely", async () => {
  const supabase = makeStorageClient({
    quarantinedObjects: [
      { bucket_id: "pin-images", object_path: "../secrets.txt", has_reference: false },
      { bucket_id: "pin-images", object_path: "pins/1730000000000-ab12cd34.webp", has_reference: false },
    ],
    listError: new Error("storage unavailable"),
  });
  const result = await inspectQuarantinedPinImageObjects({ supabase });
  assert.equal(result.inventoryFailed, 2);
  assert.equal(result.items[0].status, "invalid_inventory_row");
  assert.equal(result.items[1].status, "storage_inventory_failed");
  assert.equal(supabase.calls.some((call) => call.type === "remove"), false);
});

test("quarantined inventory RPC errors fail closed", async () => {
  const supabase = makeStorageClient({ quarantinedInventoryError: new Error("migration missing") });
  await assert.rejects(
    inspectQuarantinedPinImageObjects({ supabase }),
    /migration missing/
  );
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), ["list_quarantined_pin_image_objects"]);
});

test("failed deletion retry inventory safely retries only valid managed paths", async () => {
  const supabase = makeStorageClient({
    failedDeletions: [
      { bucket_id: "pin-images", object_path: "pins/1730000000000-ab12cd34.webp", attempts: 2, last_error_code: "storage_rejected" },
      { bucket_id: "other-bucket", object_path: "pins/1730000000001-ab12cd34.webp", attempts: 1 },
      { bucket_id: "pin-images", object_path: "foreign/object.webp", attempts: 1 },
    ],
  });
  const result = await retryFailedPinImageDeletions({ supabase, limit: 200 });
  assert.equal(result.inspected, 3);
  assert.equal(result.deleted, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.failed, 0);
  assert.deepEqual(supabase.calls.filter((call) => call.name || call.type).map((call) => call.name || call.type), [
    "list_failed_pin_image_deletions", "claim_pin_image_deletion", "remove", "finalize_pin_image_deletion",
  ]);
  const inventory = supabase.calls.find((call) => call.name === "list_failed_pin_image_deletions");
  assert.equal(inventory.args.p_limit, 100);
});

test("failed deletion retry respects claim refusal and never calls Storage for referenced paths", async () => {
  const supabase = makeStorageClient({
    failedDeletions: [{ bucket_id: "pin-images", object_path: "pins/1730000000000-ab12cd34.webp", attempts: 3 }],
    claimData: { claimed: false, reason: "referenced" },
  });
  const result = await retryFailedPinImageDeletions({ supabase });
  assert.equal(result.skipped, 1);
  assert.equal(result.deleted, 0);
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "list_failed_pin_image_deletions", "claim_pin_image_deletion",
  ]);
});

test("failed deletion retry reports bounded per-object errors and fails closed on inventory errors", async () => {
  const storageError = Object.assign(new Error("Storage rejected"), { code: "storage_rejected", statusCode: 400 });
  const supabase = makeStorageClient({
    failedDeletions: [{ bucket_id: "pin-images", object_path: "pins/1730000000000-ab12cd34.webp", attempts: 2 }],
    removeError: storageError,
  });
  const result = await retryFailedPinImageDeletions({ supabase });
  assert.equal(result.failed, 1);
  assert.equal(result.items[0].status, "failed");
  assert.equal(result.items[0].error_code, "storage_rejected");

  const inventoryError = new Error("migration missing");
  const broken = makeStorageClient({ failedInventoryError: inventoryError });
  await assert.rejects(retryFailedPinImageDeletions({ supabase: broken }), (error) => error === inventoryError);
  assert.deepEqual(broken.calls.map((call) => call.name || call.type), ["list_failed_pin_image_deletions"]);
});

test("failed deletion retry keeps ambiguous Storage outcomes fenced", async () => {
  const ambiguousError = Object.assign(new Error("Storage gateway timeout"), { code: "gateway_timeout", statusCode: 503 });
  const supabase = makeStorageClient({
    failedDeletions: [{ bucket_id: "pin-images", object_path: "pins/1730000000000-ab12cd34.webp", attempts: 4 }],
    removeError: ambiguousError,
  });
  const result = await retryFailedPinImageDeletions({ supabase });
  assert.equal(result.failed, 1);
  assert.equal(result.items[0].status, "failed");
  assert.equal(result.items[0].error_code, "gateway_timeout");
  assert.equal(supabase.calls.some((call) => call.name === "finalize_pin_image_deletion"), false);
  assert.equal(supabase.calls.some((call) => call.type === "remove"), true);
});

test("retention queue worker blocks invalid claims without touching Storage", async () => {
  const calls = [];
  const supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "claim_pin_image_retention_queue") {
        return { data: [{ bucket_id: "pin-images", object_path: "foreign/object.webp", claim_token: "claim-token" }], error: null };
      }
      if (name === "finalize_pin_image_retention_queue_item") {
        return { data: true, error: null };
      }
      throw new Error("unexpected RPC " + name);
    },
    storage: {
      from() {
        throw new Error("Storage must not be called for an invalid queue claim");
      },
    },
  };
  const result = await processPendingPinImageRetentionQueue({ supabase, limit: 50 });
  assert.equal(result.claimed, 1);
  assert.equal(result.blocked, 1);
  assert.equal(result.deleted, 0);
  assert.equal(calls[0].args.p_limit, 25);
  assert.equal(calls[1].args.p_completed, false);
  assert.equal(calls[1].args.p_error_code, "invalid_retention_queue_claim");
});

test("retention queue worker deletes only after the final lifecycle claim and fences queue completion", async () => {
  const calls = [];
  const supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "claim_pin_image_retention_queue") {
        return { data: [{
          bucket_id: "pin-images",
          object_path: "pins/1730000000000-abcdef0123456789abcdef0123456789.webp",
          claim_token: "queue-token",
        }], error: null };
      }
      if (name === "claim_pin_image_deletion") {
        return { data: { claimed: true, claim_token: "lifecycle-token" }, error: null };
      }
      if (name === "finalize_pin_image_deletion") return { data: true, error: null };
      if (name === "finalize_pin_image_retention_queue_item") return { data: true, error: null };
      throw new Error("unexpected RPC " + name);
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "pin-images");
        return { remove: async (paths) => {
          assert.deepEqual(paths, ["pins/1730000000000-abcdef0123456789abcdef0123456789.webp"]);
          return { data: [{}], error: null };
        } };
      },
    },
  };
  const result = await processPendingPinImageRetentionQueue({ supabase, limit: 1 });
  assert.equal(result.deleted, 1);
  assert.equal(result.blocked, 0);
  assert.deepEqual(calls.map((call) => call.name), [
    "claim_pin_image_retention_queue",
    "claim_pin_image_deletion",
    "finalize_pin_image_deletion",
    "finalize_pin_image_retention_queue_item",
  ]);
  assert.equal(calls[3].args.p_claim_token, "queue-token");
  assert.equal(calls[3].args.p_completed, true);
});


test("blocked retention queue inspection is read-only and reports Storage visibility", async () => {
  const calls = [];
  const supabase = {
    rpc: async (name, args) => {
      calls.push(["rpc", name, args]);
      return {
        data: [{
          bucket_id: "pin-images",
          object_path: "pins/1730000000000-abcdef0123456789abcdef0123456789.webp",
          source_types: ["generation_replay"],
          attempts: 3,
          last_error_code: "storage_delete_unresolved",
          queue_updated_at: "2026-11-09T00:00:00Z",
          lifecycle_state: "deleting",
          lifecycle_attempts: 1,
          lifecycle_error_code: null,
          lifecycle_updated_at: "2026-11-09T00:00:00Z",
          has_reference: false,
        }],
        error: null,
      };
    },
    storage: {
      from: (bucket) => ({
        list: async (folder, options) => {
          calls.push(["list", bucket, folder, options]);
          return { data: [{ name: "1730000000000-abcdef0123456789abcdef0123456789.webp" }], error: null };
        },
        remove: async () => {
          calls.push(["remove"]);
          throw new Error("DELETE must never be called by diagnostics");
        },
      }),
    },
  };

  const { inspectBlockedPinImageRetentionQueue } = require("../pinImageLifecycle");
  const result = await inspectBlockedPinImageRetentionQueue({ supabase, limit: 10 });
  assert.equal(result.inspected, 1);
  assert.equal(result.objectVisible, 1);
  assert.equal(result.hasReferences, 0);
  assert.equal(result.items[0].status, "object_present");
  assert.equal(result.items[0].lifecycle_state, "deleting");
  assert.equal(result.items[0].diagnosis, "deletion_may_still_be_in_flight");
  assert.equal(result.items[0].safe_action, "keep_fenced_until_external_operation_is_confirmed_stopped");
  assert.deepEqual(calls.map((call) => call[0]), ["rpc", "list"]);
});

test("blocked retention queue inspection fails closed on invalid paths without Storage access", async () => {
  let storageCalls = 0;
  const supabase = {
    rpc: async () => ({
      data: [{ bucket_id: "pin-images", object_path: "../foreign.webp", source_types: [], attempts: 1 }],
      error: null,
    }),
    storage: {
      from: () => ({
        list: async () => { storageCalls += 1; return { data: [], error: null }; },
      }),
    },
  };
  const { inspectBlockedPinImageRetentionQueue } = require("../pinImageLifecycle");
  const result = await inspectBlockedPinImageRetentionQueue({ supabase });
  assert.equal(result.inventoryFailed, 1);
  assert.equal(result.items[0].status, "invalid_inventory_row");
  assert.equal(storageCalls, 0);
});


test("blocked retention queue diagnostics distinguish referenced, quarantined, and deleted objects", async () => {
  const rows = [
    { bucket_id: "pin-images", object_path: "pins/1730000000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp", attempts: 1, lifecycle_state: "active", has_reference: true },
    { bucket_id: "pin-images", object_path: "pins/1730000000001-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp", attempts: 2, lifecycle_state: "quarantined", has_reference: false },
    { bucket_id: "pin-images", object_path: "pins/1730000000002-cccccccccccccccccccccccccccccccc.webp", attempts: 3, lifecycle_state: "deleted", has_reference: false },
  ];
  const visibleNames = new Set([rows[0].object_path.split("/")[1], rows[2].object_path.split("/")[1]]);
  const supabase = {
    rpc: async () => ({ data: rows, error: null }),
    storage: {
      from: () => ({
        list: async (_folder, options) => ({
          data: visibleNames.has(options.search) ? [{ name: options.search }] : [],
          error: null,
        }),
      }),
    },
  };
  const { inspectBlockedPinImageRetentionQueue } = require("../pinImageLifecycle");
  const result = await inspectBlockedPinImageRetentionQueue({ supabase });
  assert.equal(result.diagnoses.database_reference_object_present, 1);
  assert.equal(result.diagnoses.quarantined_object_absent, 1);
  assert.equal(result.diagnoses.deleted_lifecycle_object_still_visible, 1);
  assert.equal(result.items[0].safe_action, "preserve_object_and_investigate_why_queue_was_blocked");
  assert.equal(result.items[1].safe_action, "keep_path_retired_operator_closeout_only");
  assert.equal(result.items[2].safe_action, "investigate_storage_lifecycle_inconsistency_keep_path_retired");
  assert.equal(result.items.every((item) => item.safe_action !== "automatic_delete"), true);
});


test("retention queue migration grants service_role the exact finalization RPC and revokes public roles", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "..", "db", "migrations", "109_pin_image_retention_queue_worker.sql"),
    "utf8"
  );
  const signature = "public.finalize_pin_image_retention_queue_item(text,text,uuid,boolean,text)";
  assert.ok(migration.includes(`revoke all on function ${signature}`));
  assert.ok(migration.includes(`grant execute on function ${signature}`));
  assert.ok(migration.includes("to service_role;"));
  assert.equal(
    migration.includes("public.finalize_pin_image_retention_queue(text,text,uuid,boolean,text)"),
    false,
    "GRANT must not target the nonexistent function name"
  );
});
