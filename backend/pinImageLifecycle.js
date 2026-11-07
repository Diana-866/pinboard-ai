const crypto = require("node:crypto");

function extractManagedPinImagePath(publicUrl, supabaseUrl, bucket = "pin-images") {
  if (!publicUrl || !supabaseUrl) return null;
  try {
    const objectUrl = new URL(String(publicUrl));
    const projectUrl = new URL(String(supabaseUrl));
    if (objectUrl.origin !== projectUrl.origin) return null;
    const basePath = projectUrl.pathname.replace(/\/$/, "");
    const prefix = `${basePath}/storage/v1/object/public/${bucket}/`;
    if (!objectUrl.pathname.startsWith(prefix)) return null;
    const objectPath = decodeURIComponent(objectUrl.pathname.slice(prefix.length));
    // Only remove objects created by uploadPinImage; leave legacy or foreign
    // object names untouched rather than guessing their ownership.
    if (!/^pins\/(?:[0-9]+-[a-z0-9]{1,16}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp|gif)$/i.test(objectPath)) return null;
    return objectPath;
  } catch {
    return null;
  }
}

function buildPinImageObjectPath(extension, idempotencyKey = null) {
  const ext = String(extension || "").toLowerCase();
  if (!["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
    throw new Error("Unsupported managed pin image extension");
  }
  if (idempotencyKey) {
    const digest = crypto.createHash("sha256").update(String(idempotencyKey)).digest("hex").slice(0, 32);
    return `pins/generation-${digest}.${ext}`;
  }
  return `pins/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

async function deleteManagedPinImageObject({ supabase, bucket = "pin-images", objectPath }) {
  const { data: claim, error: claimError } = await supabase.rpc("claim_pin_image_deletion", {
    p_bucket_id: bucket,
    p_object_path: objectPath,
    p_claim_ttl_seconds: 600,
  });
  if (claimError) throw claimError;
  if (!claim || claim.claimed !== true || !claim.claim_token) return false;

  // A thrown transport error is ambiguous: Storage may have received the
  // request. Keep the claim fenced for reconciliation instead of reopening refs.
  const { error: removeError } = await supabase.storage.from(bucket).remove([objectPath]);
  const { data: finalized, error: finalizeError } = await supabase.rpc("finalize_pin_image_deletion", {
    p_bucket_id: bucket,
    p_object_path: objectPath,
    p_claim_token: claim.claim_token,
    p_deleted: !removeError,
    p_error_code: removeError
      ? String(removeError.code || removeError.name || "storage_delete_failed").slice(0, 64)
      : null,
  });

  if (finalizeError) throw finalizeError;
  if (finalized !== true) throw new Error("Pin image deletion claim could not be finalized");
  if (removeError) throw removeError;
  return true;
}

module.exports = {
  deleteManagedPinImageObject,
  extractManagedPinImagePath,
  buildPinImageObjectPath,
};
