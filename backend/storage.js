// Загрузка изображений пинов в Supabase Storage (решение проблемы временных ссылок GPTunnel)
const supabase = require("./supabase");
const http = require("node:http");
const https = require("node:https");
const { httpError } = require("./validate");
const { MAX_IMAGE_BYTES, validateImageBuffer } = require("./imageValidation");
const { assertPublicUrl, createPinnedLookup } = require("./publicUrl");
const { extractManagedPinImagePath, buildPinImageObjectPath, uploadManagedPinImageObject, deleteManagedPinImageObject, findCompletedManagedPinImageUpload, validatePinImageBucketConfiguration, EXPECTED_PIN_IMAGE_MIMES } = require("./pinImageLifecycle");

const BUCKET = "pin-images";
const ALLOWED_IMAGE_MIMES = EXPECTED_PIN_IMAGE_MIMES;
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw httpError(503, "Не удалось проверить настройки хранилища изображений");
  }

  let bucket = (buckets || []).find((item) => item.name === BUCKET);
  if (!bucket) {
    const { data: created, error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: ALLOWED_IMAGE_MIMES,
    });
    if (createError) {
      throw httpError(503, "Не удалось создать бакет изображений: " + createError.message);
    }
    bucket = created || { name: BUCKET, public: true, file_size_limit: MAX_IMAGE_BYTES, allowed_mime_types: ALLOWED_IMAGE_MIMES };
  }

  try {
    validatePinImageBucketConfiguration({ ...bucket, name: bucket && bucket.name || BUCKET });
  } catch (error) {
    console.error("[storage] некорректная конфигурация бакета pin-images:", error && error.code);
    throw httpError(503, "Настройки бакета pin-images не соответствуют требованиям приложения");
  }
  bucketReady = true;
}

// Проверяем сигнатуру, а не доверяем Content-Type, присланному клиентом или источником.
async function uploadPinImage(file, options = {}) {
  let imageType;
  try {
    imageType = validateImageBuffer(file && file.buffer, file && file.mimetype);
  } catch (e) {
    throw httpError(422, e.message);
  }
  await ensureBucket();
  const path = buildPinImageObjectPath(imageType.ext, options.idempotencyKey || null);

  try {
    await uploadManagedPinImageObject({
      supabase,
      bucket: BUCKET,
      objectPath: path,
      file: file.buffer,
      contentType: imageType.mime,
    });
  } catch (error) {
    if (error && error.code === "referenced") {
      throw httpError(409, "Это изображение уже используется и не может быть перезаписано");
    }
    if (error && (error.code === "upload_in_progress" || error.code === "deletion_in_progress")) {
      throw httpError(409, "Изображение сейчас обрабатывается. Повторите запрос позже");
    }
    if (error && error.httpStatus) throw error;
    throw httpError(500, "Не удалось сохранить изображение: " + (error && error.message));
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data || !data.publicUrl) throw httpError(500, "Не удалось получить ссылку на изображение");
  return data.publicUrl;
}

// Delete only through the database claim protocol. Reference-write triggers
// and upload reservations serialize pins, schedules and generation journals
// against both Storage writes and deletes.
async function deletePinImageIfUnreferenced(imageUrl) {
  const objectPath = extractManagedPinImagePath(imageUrl, process.env.SUPABASE_URL, BUCKET);
  if (!objectPath) return false;
  return deleteManagedPinImageObject({ supabase, bucket: BUCKET, objectPath });
}

module.exports = { uploadPinImage, rehostImage, deletePinImageIfUnreferenced };

// Скачивает картинку по URL (например, временную ссылку GPTunnel) и кладёт её в хранилище.
// URL из ответа внешнего провайдера считается недоверенным: запрещаем private IP,
// DNS rebinding и redirects, чтобы не превратить сервер в SSRF-прокси.
async function rehostImage(sourceUrl, options = {}) {
  if (options.idempotencyKey) {
    try {
      const existingPath = await findCompletedManagedPinImageUpload({ supabase, bucket: BUCKET, idempotencyKey: options.idempotencyKey });
      if (existingPath) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(existingPath);
        if (data && data.publicUrl) return data.publicUrl;
      }
    } catch (error) {
      // Without a successful lookup we cannot know whether this idempotency key
      // already owns a completed object. Do not download/re-upload blindly:
      // preserve the journaled provider result and let the same request retry.
      console.warn("[storage] не удалось проверить ранее сохранённое изображение:", error && error.message);
      throw httpError(503, "Не удалось проверить ранее сохранённое изображение. Повторите восстановление позже");
    }
  }
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
      maxContentLength: MAX_IMAGE_BYTES,
      httpAgent,
      httpsAgent,
      proxy: false,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    const mimetype = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    return await uploadPinImage({ buffer: Buffer.from(response.data), mimetype }, options);
  } catch (e) {
    if (e && e.httpStatus) throw e;
    console.error("[storage] не удалось получить изображение от провайдера:", e && e.message);
    throw httpError(502, "Не удалось безопасно получить изображение от провайдера");
  } finally {
    httpAgent.destroy();
    httpsAgent.destroy();
  }
}
