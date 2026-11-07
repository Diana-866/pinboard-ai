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
    if (!/^pins\/(?:[0-9]+-[a-z0-9]{1,16}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp)$/i.test(objectPath)) return null;
    return objectPath;
  } catch {
    return null;
  }
}

function canDeletePinImageObject({ hasPinReference, hasScheduleReference, generationRequestStatuses = [] }) {
  if (hasPinReference || hasScheduleReference) return false;
  return generationRequestStatuses.every((status) => ["completed", "failed"].includes(status));
}

function buildPinImageObjectPath(extension, idempotencyKey = null) {
  const ext = String(extension || "").toLowerCase();
  if (!["png", "jpg", "jpeg", "webp"].includes(ext)) {
    throw new Error("Unsupported managed pin image extension");
  }
  if (idempotencyKey) {
    const digest = crypto.createHash("sha256").update(String(idempotencyKey)).digest("hex").slice(0, 32);
    return `pins/generation-${digest}.${ext}`;
  }
  return `pins/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

module.exports = {
  extractManagedPinImagePath,
  canDeletePinImageObject,
  buildPinImageObjectPath,
};
