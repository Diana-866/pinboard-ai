const test = require("node:test");
const assert = require("node:assert/strict");
const { extractManagedPinImagePath, buildPinImageObjectPath, uploadManagedPinImageObject, reconcileStalePinImageUploads, deleteManagedPinImageObject } = require("./pinImageLifecycle");

const base = "https://project.supabase.co";

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
  const supabase = {
    calls,
    async rpc(name, args) {
      calls.push({ type: "rpc", name, args });
      if (name === "claim_pin_image_deletion") {
        return { data: options.claimData === undefined
          ? { claimed: true, claim_token: "claim-123" }
          : options.claimData, error: options.claimError || null };
      }
      if (name === "begin_pin_image_upload") {
        return { data: options.uploadReservation === undefined
          ? { reserved: true, upload_token: "upload-123" }
          : options.uploadReservation, error: options.reserveError || null };
      }
      if (name === "finalize_pin_image_upload") {
        return { data: options.uploadFinalizeData === undefined ? true : options.uploadFinalizeData,
          error: options.uploadFinalizeError || null };
      }
      if (name === "list_stale_pin_image_uploads") {
        return { data: options.staleUploads === undefined ? [] : options.staleUploads,
          error: options.inventoryError || null };
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

test("definite Storage rejection is finalized as failed before surfacing the error", async () => {
  const storageError = Object.assign(new Error("storage rejected"), { code: "storage_rejected" });
  const supabase = makeStorageClient({ removeError: storageError });
  await assert.rejects(
    deleteManagedPinImageObject({ supabase, objectPath: "pins/1730000000000-ab12cd34.webp" }),
    (error) => error === storageError
  );
  const finalize = supabase.calls.find((call) => call.name === "finalize_pin_image_deletion");
  assert.equal(finalize.args.p_deleted, false);
  assert.equal(finalize.args.p_error_code, "storage_rejected");
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
  const storageError = Object.assign(new Error("storage rejected"), { code: "storage_rejected" });
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

test("stale upload reconciliation finalizes only an exact object confirmed in Storage", async () => {
  const supabase = makeStorageClient({
    staleUploads: [{
      bucket_id: "pin-images",
      object_path: "pins/1730000000000-ab12cd34.webp",
      upload_token: "stale-upload-token",
    }],
  });
  const result = await reconcileStalePinImageUploads({ supabase });
  assert.deepEqual(result, { inspected: 1, reconciled: 1, unresolved: [] });
  assert.deepEqual(supabase.calls.map((call) => call.name || call.type), [
    "list_stale_pin_image_uploads", "list", "finalize_pin_image_upload",
  ]);
  const finalize = supabase.calls.find((call) => call.name === "finalize_pin_image_upload");
  assert.equal(finalize.args.p_upload_token, "stale-upload-token");
  assert.equal(finalize.args.p_uploaded, true);
});

test("stale upload reconciliation keeps missing objects fenced", async () => {
  const supabase = makeStorageClient({
    staleUploads: [{
      bucket_id: "pin-images",
      object_path: "pins/1730000000000-ab12cd34.webp",
      upload_token: "stale-upload-token",
    }],
    listData: [],
  });
  const result = await reconcileStalePinImageUploads({ supabase });
  assert.equal(result.reconciled, 0);
  assert.equal(result.unresolved[0].reason, "object_not_visible_keep_fenced");
  assert.equal(supabase.calls.some((call) => call.name === "finalize_pin_image_upload"), false);
});

test("stale upload reconciliation does not finalize when Storage inventory fails", async () => {
  const supabase = makeStorageClient({
    staleUploads: [{
      bucket_id: "pin-images",
      object_path: "pins/1730000000000-ab12cd34.webp",
      upload_token: "stale-upload-token",
    }],
    listError: new Error("storage unavailable"),
  });
  const result = await reconcileStalePinImageUploads({ supabase });
  assert.equal(result.reconciled, 0);
  assert.equal(result.unresolved[0].reason, "storage_inventory_failed");
  assert.equal(supabase.calls.some((call) => call.name === "finalize_pin_image_upload"), false);
});

