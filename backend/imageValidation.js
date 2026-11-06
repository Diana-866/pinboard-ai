const MIME_BY_SIGNATURE = [
  { mime: "image/png", ext: "png", matches: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) },
  { mime: "image/jpeg", ext: "jpg", matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", matches: (b) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
  { mime: "image/gif", ext: "gif", matches: (b) => b.length >= 6 && ["GIF87a", "GIF89a"].includes(b.toString("ascii", 0, 6)) },
];

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  return MIME_BY_SIGNATURE.find((entry) => entry.matches(buffer)) || null;
}

function validateImageBuffer(buffer, declaredMime) {
  const detected = detectImageType(buffer);
  if (!detected) throw new Error("Файл не является поддерживаемым растровым изображением");
  const normalizedMime = String(declaredMime || "").split(";")[0].trim().toLowerCase();
  if (normalizedMime && normalizedMime !== detected.mime) {
    throw new Error("Тип файла не совпадает с содержимым изображения");
  }
  return detected;
}

module.exports = { detectImageType, validateImageBuffer };
