// Загрузка изображений пинов в Supabase Storage (решение проблемы временных ссылок GPTunnel)
const supabase = require("./supabase");
const { httpError } = require("./validate");
const { safeFetch } = require("./safeFetch");

const BUCKET = "pin-images";
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  try {
    // Идемпотентно создаём публичный бакет, если его нет
    const { data: buckets } = await supabase.storage.listBuckets();
    if (buckets && !buckets.find((b) => b.name === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 5242880 });
    }
    bucketReady = true;
  } catch (e) {
    console.error("[storage] не удалось проверить бакет:", e.message);
  }
}

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return "image/gif";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function extFor(mimetype) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[mimetype];
}

// Загружает изображение пина и возвращает постоянный публичный URL
async function uploadPinImage(file) {
  await ensureBucket();
  const path = `pins/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extFor(file.mimetype)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, { contentType: mimetype, upsert: true });
  if (error) throw httpError(500, "Не удалось сохранить изображение: " + error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data || !data.publicUrl) throw httpError(500, "Не удалось получить ссылку на изображение");
  return data.publicUrl;
}

module.exports = { uploadPinImage, rehostImage };

// Скачивает картинку по URL (например, временную ссылку GPTunnel) и кладёт в наше хранилище.
// Возвращает постоянный публичный URL (решение B9: картинки больше не пропадают).
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
  return uploadPinImage({ buffer, mimetype: actualMime });
}
