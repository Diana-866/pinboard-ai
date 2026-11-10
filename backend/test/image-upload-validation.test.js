const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedPinImageUploadMime } = require("../imageUploadValidation");

test("accepts every raster format supported by permanent pin storage", () => {
  for (const mime of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
    assert.equal(isAllowedPinImageUploadMime(mime), true, mime);
  }
});

test("normalizes MIME casing and optional parameters", () => {
  assert.equal(isAllowedPinImageUploadMime("IMAGE/GIF; charset=binary"), true);
  assert.equal(isAllowedPinImageUploadMime(" image/webp "), true);
});

test("rejects unsupported or non-image upload MIME types", () => {
  for (const mime of ["image/svg+xml", "image/bmp", "text/html", "", null]) {
    assert.equal(isAllowedPinImageUploadMime(mime), false, String(mime));
  }
});
