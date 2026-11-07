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
    if (!/^pins\/[0-9]+-[a-z0-9]{1,16}\.(?:png|jpe?g|webp)$/i.test(objectPath)) return null;
    return objectPath;
  } catch {
    return null;
  }
}

function canDeletePinImageObject({ hasPinReference, hasScheduleReference, generationRequestStatuses = [] }) {
  if (hasPinReference || hasScheduleReference) return false;
  return generationRequestStatuses.every((status) => ["completed", "failed"].includes(status));
}

module.exports = { extractManagedPinImagePath, canDeletePinImageObject };
