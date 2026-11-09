const test = require("node:test");
const assert = require("node:assert/strict");
const { serializePinImageUploadError } = require("../imageUploadErrors");

test("returns a clear supported-format message for rejected MIME types", () => {
  assert.deepEqual(
    serializePinImageUploadError({ code: "unsupported_image_type" }),
    {
      status: 415,
      message: "Неподдерживаемый формат. Загрузите PNG, JPG, WebP или GIF.",
      code: "unsupported_image_type",
    }
  );
});

test("maps oversized uploads to HTTP 413 with the actual size limit", () => {
  assert.deepEqual(
    serializePinImageUploadError({ code: "LIMIT_FILE_SIZE" }),
    {
      status: 413,
      message: "Изображение слишком большое. Максимальный размер — 5 МиБ.",
      code: "LIMIT_FILE_SIZE",
    }
  );
});

test("maps an unexpected multipart file field to a client error", () => {
  assert.equal(serializePinImageUploadError({ code: "LIMIT_UNEXPECTED_FILE" }).status, 422);
});

test("maps multipart field and part limits to safe client errors", () => {
  for (const code of ["LIMIT_FIELD_COUNT", "LIMIT_PART_COUNT", "LIMIT_FILE_COUNT"]) {
    assert.equal(serializePinImageUploadError({ code }).status, 422, code);
  }
  assert.equal(serializePinImageUploadError({ code: "LIMIT_FIELD_VALUE" }).status, 413);
});

test("does not hide unknown middleware errors", () => {
  assert.equal(serializePinImageUploadError(new Error("unexpected")), null);
  assert.equal(serializePinImageUploadError(null), null);
});
