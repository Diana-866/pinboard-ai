const { httpError, optionalString } = require("./validate");

function buildBoardPatch(body) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
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

  if (Object.keys(patch).length === 0) {
    throw httpError(422, "Передайте title и/или description");
  }

  return patch;
}

module.exports = { buildBoardPatch };
