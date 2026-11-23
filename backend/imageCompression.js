"use strict";

const sharp = require("sharp");
const { logWarning } = require("./safeLogger");

/**
 * Сжатие картинок пинов перед сохранением.
 *
 * Провайдер генерации возвращает файлы по 2–5 МБ. Pinterest для пинов принимает JPEG и PNG:
 * в справочнике API v5 у источника `image_base64` поле `content_type` имеет перечисление
 * строго `["image/jpeg", "image/png"]` (WebP там нет — он встречается только в перечне
 * форматов медиатеки рекламных кабинетов), поэтому основным форматом выбран JPEG
 * (mozjpeg, progressive), а PNG остаётся только для картинок с настоящей прозрачностью:
 * превратить PNG с альфой в JPEG значит залить прозрачный фон цветом.
 *
 * Правила:
 *   • пропорции сохраняются, длинная сторона не меньше 1500 px;
 *   • маленькие картинки не увеличиваются;
 *   • очень большие уменьшаются до 2560 px по длинной стороне (Pinterest рекомендует 1000×1500);
 *   • цель — не больше 500 КБ; при недостижимой цели выдаётся предупреждение от 800 КБ;
 *   • исходный буфер никуда не сохраняется: в хранилище уходит только результат.
 */

const TARGET_MAX_BYTES = 500 * 1024;
const WARN_BYTES = 800 * 1024;
const MIN_LONG_SIDE = 1500;
const MAX_LONG_SIDE = 2560;
const JPEG_QUALITY_LADDER = [85, 80, 75, 70, 65, 60];
const SHRINK_STEP_LONG_SIDE = MIN_LONG_SIDE + 1;
const PNG_SETTINGS = { compressionLevel: 9, palette: true, quality: 90, effort: 7 };

/**
 * Предупреждение о слишком большом файле. Возвращает текст или null: вызывающая сторона
 * пишет его в журнал, чтобы владелец увидел, что сжатие не достигло цели.
 */
function oversizeKB(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= WARN_BYTES) return null;
  // ceil: размер чуть выше порога не должен печататься как «ровно 800 КБ».
  return Math.ceil(sizeBytes / 1024);
}

function targetSize(width, height) {
  const longSide = Math.max(width, height);
  if (!Number.isFinite(longSide) || longSide <= MAX_LONG_SIDE) {
    return { width, height, resized: false };
  }
  const scale = MAX_LONG_SIDE / longSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

async function encodeJpeg(pipeline, quality) {
  return pipeline
    .clone()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality, mozjpeg: true, progressive: true })
    .toBuffer();
}

async function encodePng(pipeline) {
  return pipeline.clone().png(PNG_SETTINGS).toBuffer();
}

/**
 * Сжимает картинку пина.
 *
 * Никогда не бросает: если файл не декодируется, возвращается исходник с `compressed: false`
 * и причиной. Загрузка пина важнее экономии места — сломать её из-за необычного файла нельзя.
 */
async function compressPinImage(input) {
  const original = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  const sizeBefore = original.length;
  const fallback = (reason) => ({
    buffer: original,
    mimetype: null,
    ext: null,
    compressed: false,
    sizeBefore,
    sizeAfter: sizeBefore,
    reason,
  });

  if (sizeBefore === 0) return fallback("empty");

  let metadata;
  let decoded;
  try {
    decoded = sharp(original, { failOn: "error", limitInputPixels: 100_000_000 }).rotate();
    metadata = await decoded.metadata();
  } catch (error) {
    logWarning("image.compression_undecodable");
    return fallback("undecodable");
  }

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) return fallback("no_dimensions");

  const size = targetSize(width, height);
  let pipeline = decoded;
  if (size.resized) {
    pipeline = pipeline.resize({ width: size.width, height: size.height, fit: "fill" });
  }

  // Прозрачность сохраняется только у PNG: JPEG её не умеет, а заливать фон белым
  // значит менять картинку, которую владелец видел до сохранения.
  const keepsAlpha = metadata.hasAlpha === true && metadata.format !== "jpeg";

  let buffer = null;
  let mimetype = null;
  let ext = null;
  let appliedSize = size;
  try {
    if (keepsAlpha) {
      buffer = await encodePng(pipeline);
      mimetype = "image/png";
      ext = "png";
    } else {
      // Если на выбранном размере качество уже на нижней ступени, а файл всё ещё больше цели,
      // размер уменьшается дальше — но не ниже 1500 px по длинной стороне.
      const longSide = Math.max(width, height);
      const steps = [size];
      if (longSide > SHRINK_STEP_LONG_SIDE) {
        for (const candidate of [2048, 1800, MIN_LONG_SIDE]) {
          if (candidate >= MIN_LONG_SIDE && candidate < Math.max(steps[steps.length - 1].width, steps[steps.length - 1].height)) {
            const scale = candidate / longSide;
            steps.push({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), resized: true });
          }
        }
      }
      for (const step of steps) {
        const staged = step.resized && step !== size
          ? decoded.resize({ width: step.width, height: step.height, fit: "fill" })
          : pipeline;
        for (const quality of JPEG_QUALITY_LADDER) {
          buffer = await encodeJpeg(staged, quality);
          mimetype = "image/jpeg";
          ext = "jpg";
          appliedSize = step;
          if (buffer.length <= TARGET_MAX_BYTES) break;
        }
        if (buffer.length <= TARGET_MAX_BYTES) break;
      }
    }
  } catch (error) {
    logWarning("image.compression_failed");
    return fallback("encode_failed");
  }

  if (!buffer || buffer.length === 0) return fallback("empty_output");

  const oversizeKBValue = oversizeKB(buffer.length);
  if (oversizeKBValue !== null) {
    logWarning("image.compression_oversize", { size_kb: oversizeKBValue, target_kb: Math.round(TARGET_MAX_BYTES / 1024) });
  }

  return {
    buffer,
    mimetype,
    ext,
    compressed: true,
    sizeBefore,
    sizeAfter: buffer.length,
    longSide: Math.max(appliedSize.width, appliedSize.height),
    resized: appliedSize.resized,
    keptAlpha: keepsAlpha,
  };
}

module.exports = {
  compressPinImage,
  oversizeKB,
  targetSize,
  TARGET_MAX_BYTES,
  WARN_BYTES,
  MIN_LONG_SIDE,
  MAX_LONG_SIDE,
  JPEG_QUALITY_LADDER,
};
