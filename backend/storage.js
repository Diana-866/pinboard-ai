// Загрузка изображений пинов в Supabase Storage (решение проблемы временных ссылок GPTunnel)
const supabase = require("./supabase");
const { httpError } = require("./validate");

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

function extFor(mimetype) {
  if (mimetype === "image/png") return "png";
  if (mimetype === "image/webp") return "webp";
  if (mimetype === "image/gif") return "gif";
  return "jpg";
}

// Загружает изображение пина и возвращает постоянный публичный URL
async function uploadPinImage(file) {
  await ensureBucket();
  const path = `pins/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extFor(file.mimetype)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
  if (error) throw httpError(500, "Не удалось сохранить изображение: " + error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data || !data.publicUrl) throw httpError(500, "Не удалось получить ссылку на изображение");
  return data.publicUrl;
}

module.exports = { uploadPinImage, rehostImage };

// Скачивает картинку по URL (например, временную ссылку GPTunnel) и кладёт в наше хранилище.
// Возвращает постоянный публичный URL (решение B9: картинки больше не пропадают).
async function rehostImage(sourceUrl) {
  const axios = require("axios");
  const response = await axios.get(sourceUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: 8 * 1024 * 1024,
  });
  const mimetype = response.headers["content-type"] || "image/jpeg";
  if (!/^image\//.test(mimetype)) throw new Error("Источник вернул не изображение");
  return uploadPinImage({ buffer: Buffer.from(response.data), mimetype });
}
