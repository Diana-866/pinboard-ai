const PIN_IMAGE_UPLOAD_ERRORS = {
  unsupported_image_type: {
    status: 415,
    message: "Неподдерживаемый формат. Загрузите PNG, JPG, WebP или GIF.",
  },
  LIMIT_FILE_SIZE: {
    status: 413,
    message: "Изображение слишком большое. Максимальный размер — 5 МиБ.",
  },
  LIMIT_UNEXPECTED_FILE: {
    status: 422,
    message: "Передайте одно изображение в поле image.",
  },
};

function serializePinImageUploadError(error) {
  if (!error || typeof error !== "object") return null;
  const result = PIN_IMAGE_UPLOAD_ERRORS[error.code];
  return result ? { ...result, code: error.code } : null;
}

module.exports = { serializePinImageUploadError };
