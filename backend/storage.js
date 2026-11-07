// Загрузка изображений пинов в Supabase Storage (решение проблемы временных ссылок GPTunnel)
const supabase = require("./supabase");
const http = require("node:http");
const https = require("node:https");
const { httpError } = require("./validate");
const { validateImageBuffer } = require("./imageValidation");
const { assertPublicUrl, createPinnedLookup } = require("./publicUrl");
const { extractManagedPinImagePath } = require("./pinImageLifecycle");

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

// Remove only objects created by this service, and only after the replacement
// has committed and all durable consumers have released the previous URL.
async function deletePinImageIfUnreferenced(imageUrl) {
  const objectPath = extractManagedPinImagePath(imageUrl, process.env.SUPABASE_URL, BUCKET);
  if (!objectPath) return false;

  const [pinRefs, scheduleRefs, taskRefs] = await Promise.all([
    supabase.from("pins").select("id").eq("image_url", imageUrl).limit(1),
    supabase.from("pin_schedules").select("id").eq("snapshot_image_url", imageUrl).neq("status", "cancelled").limit(1),
    supabase.from("pin_generation_tasks").select("id, generation_request_id").eq("storage_url", imageUrl),
  ]);
  const lookupError = pinRefs.error || scheduleRefs.error || taskRefs.error;
  if (lookupError) throw lookupError;
  if ((pinRefs.data || []).length || (scheduleRefs.data || []).length) return false;

  const tasks = taskRefs.data || [];
  if (tasks.length) {
    const requestIds = [...new Set(tasks.map((task) => task.generation_request_id).filter(Boolean))];
    if (requestIds.length !== tasks.length) return false;
    const { data: requests, error: requestError } = await supabase
      .from("pin_generation_requests")
      .select("id, status")
      .in("id", requestIds);
    if (requestError) throw requestError;
    const requestById = new Map((requests || []).map((request) => [String(request.id), request]));
    // Keep objects while a generation request can still be resumed/reconciled.
    if (tasks.some((task) => {
      const request = requestById.get(String(task.generation_request_id));
      return !request || !["completed", "failed"].includes(request.status);
    })) return false;
  }

  const { error: removeError } = await supabase.storage.from(BUCKET).remove([objectPath]);
  if (removeError) throw removeError;
  return true;
}

module.exports = { uploadPinImage, rehostImage, deletePinImageIfUnreferenced };

// Скачивает картинку по URL (например, временную ссылку GPTunnel) и кладёт её в хранилище.
// URL из ответа внешнего провайдера считается недоверенным: запрещаем private IP,
// DNS rebinding и redirects, чтобы не превратить сервер в SSRF-прокси.
async function rehostImage(sourceUrl) {
  const axios = require("axios");
  let validated;
  try {
    validated = await assertPublicUrl(sourceUrl);
    if (!validated.url.startsWith("https://")) {
      throw httpError(422, "Источник изображения должен использовать HTTPS");
    }
  } catch (e) {
    if (e && e.httpStatus) throw e;
    throw httpError(422, "Провайдер вернул некорректную ссылку на изображение");
  }

  const lookup = createPinnedLookup(validated.host, validated.addresses);
  const httpAgent = new http.Agent({ lookup });
  const httpsAgent = new https.Agent({ lookup });
  try {
    const response = await axios.get(validated.url, {
      responseType: "arraybuffer",
      timeout: 30000,
      maxContentLength: 8 * 1024 * 1024,
      httpAgent,
      httpsAgent,
      proxy: false,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    const mimetype = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    return await uploadPinImage({ buffer: Buffer.from(response.data), mimetype });
  } catch (e) {
    if (e && e.httpStatus) throw e;
    console.error("[storage] не удалось получить изображение от провайдера:", e && e.message);
    throw httpError(502, "Не удалось безопасно получить изображение от провайдера");
  } finally {
    httpAgent.destroy();
    httpsAgent.destroy();
  }
}
