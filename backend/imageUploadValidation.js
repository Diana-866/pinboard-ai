const ALLOWED_PIN_IMAGE_UPLOAD_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function isAllowedPinImageUploadMime(value) {
  const mime = String(value || "").split(";")[0].trim().toLowerCase();
  return ALLOWED_PIN_IMAGE_UPLOAD_MIMES.has(mime);
}

module.exports = { isAllowedPinImageUploadMime };
