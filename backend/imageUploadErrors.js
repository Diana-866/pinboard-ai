const PIN_IMAGE_UPLOAD_ERRORS = {
  unsupported_image_type: {
    status: 415,
    message: "Неподдерживаемый формат. Загрузите PNG, JPG, WebP или GIF.",
  },
  LIMIT_FILE_SIZE: {
    status: 413,
    message: "Изображение слишком большое. Максимальный размер — 5 МиБ.",
  },
  LIMIT_FIELD_VALUE: {
    status: 413,
    message: "Дополнительное поле запроса слишком большое. Повторите загрузку без лишних данных.",
  },
  LIMIT_FIELD_COUNT: {
    status: 422,
    message: "Слишком много дополнительных полей. Для загрузки изображения они не нужны.",
  },
  LIMIT_PART_COUNT: {
    status: 422,
    message: "Слишком много частей multipart-запроса. Передайте одно изображение.",
  },
  LIMIT_FILE_COUNT: {
    status: 422,
    message: "Можно загрузить только одно изображение за раз.",
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
