// Загрузка изображений пинов в Supabase Storage.
const supabase = require("./supabase");
const { httpError } = require("./validate");
const { safeFetch } = require("./safeFetch");

const BUCKET = "pin-images";
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    if (buckets && !buckets.find((b) => b.name === BUCKET)) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
      });
      if (createError && !/already exists/i.test(createError.message || "")) throw createError;
    }
    bucketReady = true;
  } catch (e) {
    console.error("[storage] не удалось проверить бакет:", e.message);
    throw httpError(503, "Хранилище изображений временно недоступно");
  }
}

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return "image/gif";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function extFor(mimetype) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[mimetype] || null;
}

async function uploadPinImage(file) {
  const buffer = file && file.buffer;
  const mimetype = detectImageMime(buffer);
  const extension = extFor(mimetype);
  if (!extension) throw httpError(422, "Файл не является поддерживаемым изображением");
  if (buffer.length > 5 * 1024 * 1024) throw httpError(413, "Изображение превышает лимит 5 МБ");

  await ensureBucket();
  const path = `pins/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimetype, upsert: true });
  if (error) throw httpError(500, "Не удалось сохранить изображение");

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data || !data.publicUrl) throw httpError(500, "Не удалось получить ссылку на изображение");
  return data.publicUrl;
}

async function rehostImage(sourceUrl) {
  let response;
  try {
    response = await safeFetch(sourceUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
      maxBytes: 8 * 1024 * 1024,
      maxRedirects: 2,
    });
  } catch (e) {
    throw httpError(422, "Не удалось безопасно скачать изображение по ссылке");
  }

  const buffer = Buffer.from(response.data);
  const actualMime = detectImageMime(buffer);
  const declaredMime = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!actualMime || declaredMime !== actualMime) {
    throw httpError(422, "Источник вернул файл с неподдерживаемым или недостоверным форматом");
  }
  return uploadPinImage({ buffer });
}

module.exports = { uploadPinImage, rehostImage, detectImageMime };
