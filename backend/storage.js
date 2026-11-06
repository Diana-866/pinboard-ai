// Загрузка изображений пинов в Supabase Storage (решение проблемы временных ссылок GPTunnel)
const supabase = require("./supabase");
const { httpError } = require("./validate");
const { validateImageBuffer } = require("./imageValidation");

const BUCKET = "pin-images";
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (buckets && !buckets.find((b) => b.name === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 5242880 });
    }
    bucketReady = true;
  } catch (e) {
    console.error("[storage] не удалось проверить бакет:", e.message);
  }
}

// Проверяем сигнатуру, а не доверяем Content-Type, присланному клиентом или источником.
async function uploadPinImage(file) {
  let imageType;
  try {
    imageType = validateImageBuffer(file && file.buffer, file && file.mimetype);
  } catch (e) {
    throw httpError(422, e.message);
  }
  await ensureBucket();
  const path = `pins/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${imageType.ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, { contentType: imageType.mime, upsert: true });
  if (error) throw httpError(500, "Не удалось сохранить изображение: " + error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data || !data.publicUrl) throw httpError(500, "Не удалось получить ссылку на изображение");
  return data.publicUrl;
}

module.exports = { uploadPinImage, rehostImage };

// Скачивает картинку по URL (например, временную ссылку GPTunnel) и кладёт её в хранилище.
async function rehostImage(sourceUrl) {
  const axios = require("axios");
  const response = await axios.get(sourceUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: 8 * 1024 * 1024,
  });
  const mimetype = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  return uploadPinImage({ buffer: Buffer.from(response.data), mimetype });
}
