const test = require("node:test");
const assert = require("node:assert/strict");
const { extractManagedPinImagePath, canDeletePinImageObject, buildPinImageObjectPath, deleteManagedPinImageObject } = require("./pinImageLifecycle");

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


test("image cleanup is blocked while any pin or schedule references the object", () => {
  assert.equal(canDeletePinImageObject({ hasPinReference: true, hasScheduleReference: false }), false);
  assert.equal(canDeletePinImageObject({ hasPinReference: false, hasScheduleReference: true }), false);
});

test("image cleanup waits for active or uncertain generation requests", () => {
  assert.equal(canDeletePinImageObject({ hasPinReference: false, hasScheduleReference: false, generationRequestStatuses: ["processing"] }), false);
  assert.equal(canDeletePinImageObject({ hasPinReference: false, hasScheduleReference: false, generationRequestStatuses: ["unknown"] }), false);
});

test("image cleanup permits only terminal generation journal references", () => {
  assert.equal(canDeletePinImageObject({ hasPinReference: false, hasScheduleReference: false, generationRequestStatuses: ["completed", "failed"] }), true);
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
