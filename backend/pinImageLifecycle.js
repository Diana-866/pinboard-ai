const crypto = require("node:crypto");

const EXPECTED_PIN_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function validatePinImageBucketConfiguration(bucket) {
  if (!bucket || bucket.name !== "pin-images" || bucket.public !== true) {
    const error = new Error("pin-images bucket must exist and be public for Pinterest-compatible image URLs");
    error.code = "invalid_pin_image_bucket_visibility";
    throw error;
  }

  const configuredMimes = Array.isArray(bucket.allowed_mime_types)
    ? bucket.allowed_mime_types.map((mime) => String(mime).trim().toLowerCase()).sort()
    : [];
  const expectedMimes = [...EXPECTED_PIN_IMAGE_MIMES].sort();
  if (configuredMimes.length !== expectedMimes.length ||
      configuredMimes.some((mime, index) => mime !== expectedMimes[index])) {
    const error = new Error("pin-images bucket MIME allow-list does not match the application configuration");
    error.code = "invalid_pin_image_bucket_mimes";
    throw error;
  }

  const configuredLimit = Number(bucket.file_size_limit);
  if (!Number.isFinite(configuredLimit) || configuredLimit < 5 * 1024 * 1024) {
    const error = new Error("pin-images bucket file size limit must be at least 5 MiB");
    error.code = "invalid_pin_image_bucket_size_limit";
    throw error;
  }

  return true;
}

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
    if (!/^pins\/(?:[0-9]+-[a-z0-9]{1,32}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp|gif)$/i.test(objectPath)) return null;
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
  // Use cryptographic entropy for public object names; timestamps are useful for
  // operations, but Math.random() is not suitable for access-resistant identifiers.
  return `pins/${Date.now()}-${crypto.randomBytes(16).toString("hex")}.${ext}`;
}

function isDefiniteStorageRejection(error) {
  const status = Number(error && (error.statusCode ?? error.status));
  // Timeouts, conflicts, throttling and all server errors are treated as
  // ambiguous: the remote operation may have committed despite its response.
  return Number.isInteger(status) && status >= 400 && status < 500 &&
    ![408, 409, 425, 429].includes(status);
}

function isStorageObjectNotFound(error) {
  const status = Number(error && (error.statusCode ?? error.status));
  const code = String(error && error.code || "").trim().toLowerCase();
  const message = String(error && error.message || "").trim().toLowerCase();
  // A generic 404 is not proof that the target object is absent: the bucket,
  // endpoint or project may be missing. Require an object-specific response.
  return status === 404 &&
    ["not_found", "object_not_found", "no_such_key"].includes(code) &&
    /(?:object|key).*(?:not found|does not exist)|(?:not found|does not exist).*(?:object|key)/.test(message);
}

async function finalizeLifecycleRpcWithRetry(supabase, functionName, args) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await supabase.rpc(functionName, args);
      if (!result.error) return result;
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Lifecycle finalization failed");
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

  const { data: finalized } = await finalizeLifecycleRpcWithRetry(supabase, "finalize_pin_image_upload", {
    p_bucket_id: bucket,
    p_object_path: objectPath,
    p_upload_token: reservation.upload_token,
    p_uploaded: !uploadError,
    p_error_code: uploadError
      ? String(uploadError.code || uploadError.name || "storage_upload_failed").slice(0, 64)
      : null,
  });
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

  const result = { inspected: 0, quarantined: 0, skipped: 0, failed: 0, items: [] };
  for (const row of staleUploads || []) {
    result.inspected += 1;
    const item = {
      object_path: typeof row.object_path === "string" ? row.object_path : null,
      attempts: Number.isInteger(Number(row.attempts)) ? Number(row.attempts) : null,
      claim_expires_at: row.claim_expires_at || null,
      updated_at: row.updated_at || null,
    };
    if (row.bucket_id !== "pin-images" || !row.object_path || !row.upload_token) {
      result.skipped += 1;
      result.items.push({ ...item, status: "skipped", reason: "invalid_inventory_row" });
      continue;
    }
    const { data, error } = await supabase.rpc("quarantine_stale_pin_image_upload", {
      p_bucket_id: row.bucket_id,
      p_object_path: row.object_path,
      p_upload_token: row.upload_token,
    });
    if (error) {
      result.failed += 1;
      result.items.push({ ...item, status: "failed", reason: "quarantine_rpc_failed" });
    } else if (data === true) {
      result.quarantined += 1;
      result.items.push({ ...item, status: "quarantined", reason: "path_permanently_retired" });
    } else {
      result.skipped += 1;
      result.items.push({ ...item, status: "skipped", reason: "claim_changed_or_path_referenced" });
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
    const metadata = {
      object_path: typeof row.object_path === "string" ? row.object_path : null,
      attempts: Number.isInteger(Number(row.attempts)) ? Number(row.attempts) : null,
      claim_expires_at: row.claim_expires_at || null,
      updated_at: row.updated_at || null,
      stale_for_seconds: Number.isFinite(Date.parse(row.claim_expires_at))
        ? Math.max(0, Math.floor((Date.now() - Date.parse(row.claim_expires_at)) / 1000))
        : null,
    };
    const parts = String(row.object_path || "").split("/");
    const filename = parts.pop();
    const folder = parts.join("/");
    if (!filename || !folder || row.bucket_id !== "pin-images" || !row.upload_token) {
      result.unresolved.push({ ...metadata, reason: "invalid_inventory_row", safe_action: "inspect_inventory_without_changing_storage" });
      continue;
    }

    const { data: objects, error: listError } = await supabase.storage
      .from(row.bucket_id)
      .list(folder, { search: filename, limit: 100, offset: 0 });
    if (listError) {
      result.unresolved.push({ ...metadata, reason: "storage_inventory_failed", safe_action: "retry_read_only_reconciliation" });
      continue;
    }
    if ((objects || []).some((object) => object && object.name === filename)) {
      result.objectVisible += 1;
      result.unresolved.push({ ...metadata, reason: "object_visible_requires_operator_confirmation", safe_action: "keep_fenced_until_original_upload_is_confirmed_stopped" });
    } else {
      result.objectMissing += 1;
      result.unresolved.push({ ...metadata, reason: "object_missing_keep_fenced", safe_action: "keep_fenced_and_check_provider_or_storage_logs" });
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
  // DELETE is idempotent: an explicit object-not-found response confirms the
  // desired end state just as surely as a successful remove response.
  const objectAlreadyMissing = isStorageObjectNotFound(removeError);
  if (removeError && !objectAlreadyMissing && !isDefiniteStorageRejection(removeError)) {
    // A server/transport-style error may arrive after the delete committed.
    // Do not reopen reference writes until Storage outcome is independently known.
    throw removeError;
  }
  const { data: finalized } = await finalizeLifecycleRpcWithRetry(supabase, "finalize_pin_image_deletion", {
    p_bucket_id: bucket,
    p_object_path: objectPath,
    p_claim_token: claim.claim_token,
    p_deleted: !removeError || objectAlreadyMissing,
    p_error_code: removeError && !objectAlreadyMissing
      ? String(removeError.code || removeError.name || "storage_delete_failed").slice(0, 64)
      : null,
  });
  if (finalized !== true) throw new Error("Pin image deletion claim could not be finalized");
  if (removeError && !objectAlreadyMissing) throw removeError;
  return true;
}


async function retryFailedPinImageDeletions({ supabase, limit = 25 }) {
  const boundedLimit = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 25;
  const { data: rows, error: inventoryError } = await supabase.rpc("list_failed_pin_image_deletions", {
    p_limit: boundedLimit,
  });
  if (inventoryError) throw inventoryError;

  const result = { inspected: 0, deleted: 0, skipped: 0, failed: 0, items: [] };
  for (const row of rows || []) {
    result.inspected += 1;
    const item = {
      object_path: typeof row.object_path === "string" ? row.object_path : null,
      attempts: Number.isInteger(Number(row.attempts)) ? Number(row.attempts) : null,
      previous_error_code: row.last_error_code || null,
      updated_at: row.updated_at || null,
    };
    if (row.bucket_id !== "pin-images" ||
        typeof row.object_path !== "string" ||
        !/^pins\/(?:[0-9]+-[a-z0-9]{1,32}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp|gif)$/i.test(row.object_path)) {
      result.skipped += 1;
      result.items.push({ ...item, status: "skipped", reason: "invalid_inventory_row" });
      continue;
    }

    try {
      // claim_pin_image_deletion rechecks every durable DB reference under a
      // row lock. It refuses active claims and permanently quarantined paths.
      const deleted = await deleteManagedPinImageObject({
        supabase, bucket: row.bucket_id, objectPath: row.object_path,
      });
      if (deleted) {
        result.deleted += 1;
        result.items.push({ ...item, status: "deleted", reason: "retry_succeeded" });
      } else {
        result.skipped += 1;
        result.items.push({ ...item, status: "skipped", reason: "claim_refused_or_reference_found" });
      }
    } catch (error) {
      result.failed += 1;
      result.items.push({
        ...item,
        status: "failed",
        reason: "storage_or_lifecycle_retry_failed",
        error_code: String(error && (error.code || error.name) || "retry_failed").slice(0, 64),
      });
    }
  }
  return result;
}

async function processPendingPinImageRetentionQueue({ supabase, limit = 10 }) {
  const boundedLimit = Number.isInteger(limit) ? Math.min(25, Math.max(1, limit)) : 10;
  const { data: claims, error: claimError } = await supabase.rpc("claim_pin_image_retention_queue", {
    p_limit: boundedLimit,
    p_claim_ttl_seconds: 900,
  });
  if (claimError) throw claimError;

  const result = { claimed: 0, deleted: 0, blocked: 0, finalizeFailed: 0, items: [] };
  for (const row of claims || []) {
    result.claimed += 1;
    const item = { object_path: row.object_path, status: "blocked" };
    let completed = false;
    let errorCode = null;
    if (row.bucket_id === "pin-images" &&
        typeof row.object_path === "string" &&
        /^pins\\/(?:[0-9]+-[a-z0-9]{1,32}|generation-[a-f0-9]{32})\\.(?:png|jpe?g|webp|gif)$/i.test(row.object_path) &&
        row.claim_token) {
      try {
        // This is the final DB reference/fencing barrier immediately before Storage.
        completed = await deleteManagedPinImageObject({
          supabase, bucket: row.bucket_id, objectPath: row.object_path,
        });
        if (!completed) errorCode = "deletion_claim_refused";
      } catch (error) {
        // Any ambiguous remote outcome is permanently blocked at the queue layer.
        // The lifecycle row itself remains deleting/quarantined as appropriate.
        errorCode = String(error && (error.code || error.name) || "storage_delete_unresolved").slice(0, 64);
      }
    } else {
      errorCode = "invalid_retention_queue_claim";
    }

    try {
      const { data: finalized, error: finalizeError } = await supabase.rpc("finalize_pin_image_retention_queue_item", {
        p_bucket_id: row.bucket_id,
        p_object_path: row.object_path,
        p_claim_token: row.claim_token,
        p_completed: completed,
        p_error_code: errorCode,
      });
      if (finalizeError || finalized !== true) {
        result.finalizeFailed += 1;
        item.status = "finalization_unconfirmed";
        item.reason = "queue_lease_or_token_changed";
      } else if (completed) {
        result.deleted += 1;
        item.status = "completed";
      } else {
        result.blocked += 1;
        item.reason = errorCode || "deletion_not_confirmed";
      }
    } catch {
      result.finalizeFailed += 1;
      item.status = "finalization_unconfirmed";
      item.reason = "queue_finalize_rpc_failed";
    }
    result.items.push(item);
  }
  return result;
}

async function inspectQuarantinedPinImageObjects({ supabase, limit = 50 }) {
  const boundedLimit = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 50;
  const { data: rows, error: inventoryError } = await supabase.rpc("list_quarantined_pin_image_objects", {
    p_limit: boundedLimit,
  });
  if (inventoryError) throw inventoryError;

  const result = { inspected: 0, objectVisible: 0, objectMissing: 0, inventoryFailed: 0, items: [] };
  for (const row of rows || []) {
    result.inspected += 1;
    const item = {
      object_path: typeof row.object_path === "string" ? row.object_path : null,
      attempts: Number.isInteger(Number(row.attempts)) ? Number(row.attempts) : null,
      last_error_code: row.last_error_code || null,
      updated_at: row.updated_at || null,
      has_reference: row.has_reference === true,
    };
    if (row.bucket_id !== "pin-images" ||
        typeof row.object_path !== "string" ||
        !/^pins\/(?:[0-9]+-[a-z0-9]{1,32}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp|gif)$/i.test(row.object_path)) {
      result.inventoryFailed += 1;
      result.items.push({ ...item, status: "invalid_inventory_row", safe_action: "inspect_database_record" });
      continue;
    }

    const parts = row.object_path.split("/");
    const filename = parts.pop();
    const folder = parts.join("/");
    const { data: objects, error: listError } = await supabase.storage
      .from(row.bucket_id)
      .list(folder, { search: filename, limit: 100, offset: 0 });
    if (listError) {
      result.inventoryFailed += 1;
      result.items.push({ ...item, status: "storage_inventory_failed", safe_action: "retry_read_only_inventory" });
      continue;
    }
    const visible = (objects || []).some((object) => object && object.name === filename);
    if (visible) result.objectVisible += 1;
    else result.objectMissing += 1;
    result.items.push({
      ...item,
      status: visible ? "object_present" : "object_absent",
      safe_action: item.has_reference
        ? "investigate_reference_guard_before_any_action"
        : "manual_review_only_no_automatic_delete_or_unquarantine",
    });
  }
  return result;
}


async function findCompletedManagedPinImageUpload({ supabase, bucket = "pin-images", idempotencyKey }) {
  if (!idempotencyKey) return null;
  const { data: objectPath, error: lookupError } = await supabase.rpc("find_completed_pin_image_upload", {
    p_bucket_id: bucket,
    p_object_digest: crypto.createHash("sha256").update(String(idempotencyKey)).digest("hex").slice(0, 32),
  });
  if (lookupError) throw lookupError;
  if (typeof objectPath !== "string" || !/^pins\/generation-[a-f0-9]{32}\.(?:png|jpe?g|webp|gif)$/i.test(objectPath)) return null;
  const parts = objectPath.split("/");
  const filename = parts.pop();
  const folder = parts.join("/");
  const { data: objects, error: listError } = await supabase.storage.from(bucket)
    .list(folder, { search: filename, limit: 100, offset: 0 });
  if (listError) throw listError;
  if (!(objects || []).some((object) => object && object.name === filename)) return null;
  return objectPath;
}
module.exports = {
  deleteManagedPinImageObject,
  findCompletedManagedPinImageUpload,
  validatePinImageBucketConfiguration,
  EXPECTED_PIN_IMAGE_MIMES,
  uploadManagedPinImageObject,
  isDefiniteStorageRejection,
  isStorageObjectNotFound,
  reconcileStalePinImageUploads,
  quarantineStalePinImageUploads,
  inspectQuarantinedPinImageObjects,
  retryFailedPinImageDeletions,
  extractManagedPinImagePath,
  buildPinImageObjectPath,
};
