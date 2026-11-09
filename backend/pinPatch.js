const { httpError, optionalString } = require("./validate");

function buildPinPatch(body, allowedAspectRatios) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(input, "title")) {
    const title = optionalString(input.title, { max: 100 });
    if (!title) throw httpError(422, "Название пина не может быть пустым");
    patch.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(input, "description")) {
    if (input.description !== null && typeof input.description !== "string") {
      throw httpError(422, "Некорректный формат описания пина");
    }
    patch.description = input.description === null
      ? ""
      : input.description.trim().slice(0, 500);
  }

  if (Object.prototype.hasOwnProperty.call(input, "aspect_ratio")) {
    const aspectRatio = optionalString(input.aspect_ratio, { max: 8 });
    if (!Array.isArray(allowedAspectRatios) || !allowedAspectRatios.includes(aspectRatio)) {
      throw httpError(422, "Некорректный формат изображения");
    }
    patch.aspect_ratio = aspectRatio;
  }

  if (Object.keys(patch).length === 0) {
    throw httpError(422, "Нечего обновлять: передайте title, description и/или aspect_ratio");
  }

  return patch;
}

module.exports = { buildPinPatch };
