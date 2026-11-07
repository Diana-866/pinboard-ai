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

function isDefiniteStorageRejection(error) {
  const status = Number(error && (error.statusCode ?? error.status));
  // Timeouts, conflicts, throttling and all server errors are treated as
  // ambiguous: the remote operation may have committed despite its response.
  return Number.isInteger(status) && status >= 400 && status < 500 &&
    ![408, 409, 425, 429].includes(status);
}

async function uploadManagedPinImageObject({ supabase, bucket = "pin-images", objectPath, file, contentType }) {
  const { data: reservation, error: reserveError } = await supabase.rpc("begin_pin_image_upload", {
    p_bucket_id: bucket,
    p_object_path: objectPath,
    p_upload_ttl_seconds: 600,
  });
  if (reserveError) throw reserveError;
  if (!reservation || reservation.reserved !== true || !reservation.upload_token) {
    const error = new Error("Pin image object is not available for upload");
    error.code = reservation && reservation.reason || "pin_image_upload_not_reserved";
    throw error;
  }

  // A thrown transport error is ambiguous: Storage may still complete the
  // request. Keep the upload reservation fenced for manual reconciliation.
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, file, { contentType, upsert: true });

  if (uploadError && !isDefiniteStorageRejection(uploadError)) {
    // A 5xx, timeout, conflict, throttle or unclassified Storage error may
    // follow a committed write. Keep the reservation fenced.
    throw uploadError;
  }

  const { data: finalized, error: finalizeError } = await supabase.rpc("finalize_pin_image_upload", {
    p_bucket_id: bucket,
    p_object_path: objectPath,
    p_upload_token: reservation.upload_token,
    p_uploaded: !uploadError,
    p_error_code: uploadError
      ? String(uploadError.code || uploadError.name || "storage_upload_failed").slice(0, 64)
      : null,
  });

  if (finalizeError) throw finalizeError;
  if (finalized !== true) throw new Error("Pin image upload reservation could not be finalized");
  if (uploadError) throw uploadError;
  return true;
}

async function quarantineStalePinImageUploads({ supabase, olderThanSeconds = 900, limit = 50 }) {
  const { data: staleUploads, error: inventoryError } = await supabase.rpc("list_stale_pin_image_uploads", {
    p_older_than_seconds: olderThanSeconds,
    p_limit: limit,
  });
  if (inventoryError) throw inventoryError;

  const result = { inspected: 0, quarantined: 0, skipped: 0, failed: 0 };
  for (const row of staleUploads || []) {
    result.inspected += 1;
    if (row.bucket_id !== "pin-images" || !row.object_path || !row.upload_token) {
      result.skipped += 1;
      continue;
    }
    const { data, error } = await supabase.rpc("quarantine_stale_pin_image_upload", {
      p_bucket_id: row.bucket_id,
      p_object_path: row.object_path,
      p_upload_token: row.upload_token,
    });
    if (error) {
      result.failed += 1;
    } else if (data === true) {
      result.quarantined += 1;
    } else {
      result.skipped += 1;
    }
  }
  return result;
}

async function reconcileStalePinImageUploads({ supabase, olderThanSeconds = 900, limit = 50 }) {
  const { data: staleUploads, error: inventoryError } = await supabase.rpc("list_stale_pin_image_uploads", {
    p_older_than_seconds: olderThanSeconds,
    p_limit: limit,
  });
  if (inventoryError) throw inventoryError;

  // This endpoint is deliberately observational. Even if the object is
  // visible, Storage listing cannot prove that an older in-flight upsert has
  // terminated; finalizing here could reopen the path while that request can
  // still overwrite it. Only an operator with independent evidence that the
  // original request/process is terminated may resolve the reservation.
  const result = { inspected: 0, objectVisible: 0, objectMissing: 0, unresolved: [] };
  for (const row of staleUploads || []) {
    result.inspected += 1;
    const parts = String(row.object_path || "").split("/");
    const filename = parts.pop();
    const folder = parts.join("/");
    if (!filename || !folder || row.bucket_id !== "pin-images" || !row.upload_token) {
      result.unresolved.push({ object_path: row.object_path || null, reason: "invalid_inventory_row" });
      continue;
    }

    const { data: objects, error: listError } = await supabase.storage
      .from(row.bucket_id)
      .list(folder, { search: filename, limit: 100, offset: 0 });
    if (listError) {
      result.unresolved.push({ object_path: row.object_path, reason: "storage_inventory_failed" });
      continue;
    }
    if ((objects || []).some((object) => object && object.name === filename)) {
      result.objectVisible += 1;
      result.unresolved.push({ object_path: row.object_path, reason: "object_visible_requires_operator_confirmation" });
    } else {
      result.objectMissing += 1;
      result.unresolved.push({ object_path: row.object_path, reason: "object_missing_keep_fenced" });
    }
  }
  return result;
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
  if (removeError && !isDefiniteStorageRejection(removeError)) {
    // A server/transport-style error may arrive after the delete committed.
    // Do not reopen reference writes until Storage outcome is independently known.
    throw removeError;
  }
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
  uploadManagedPinImageObject,
  isDefiniteStorageRejection,
  reconcileStalePinImageUploads,
  quarantineStalePinImageUploads,
  extractManagedPinImagePath,
  buildPinImageObjectPath,
};
