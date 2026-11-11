const { httpError, optionalString } = require("./validate");

function buildBoardPatch(body) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const allowedFields = new Set(["title", "description", "category"]);
  const unknownFields = Object.keys(input).filter((key) => !allowedFields.has(key));
  if (unknownFields.length > 0) {
    throw httpError(422, "Неизвестные поля обновления доски");
  }

  const patch = {};

  if (Object.prototype.hasOwnProperty.call(input, "title")) {
    const title = optionalString(input.title, { max: 100 });
    if (!title) throw httpError(422, "Название доски не может быть пустым");
    patch.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(input, "description")) {
    if (input.description !== null && typeof input.description !== "string") {
      throw httpError(422, "Некорректный формат описания доски");
    }
    patch.description = input.description === null
      ? ""
      : input.description.trim().slice(0, 500);
  }

  if (Object.prototype.hasOwnProperty.call(input, "category")) {
    if (input.category !== null && typeof input.category !== "string") {
      throw httpError(422, "Некорректный формат категории доски");
    }
    patch.category = input.category === null
      ? null
      : input.category.trim().slice(0, 120) || null;
  }

  if (Object.keys(patch).length === 0) {
    throw httpError(422, "Передайте title, description и/или category");
  }

  return patch;
}

module.exports = { buildBoardPatch };
