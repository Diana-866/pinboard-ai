"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const {
  compressPinImage,
  oversizeKB,
  targetSize,
  TARGET_MAX_BYTES,
  WARN_BYTES,
  MIN_LONG_SIDE,
  MAX_LONG_SIDE,
} = require("../imageCompression");

/**
 * Провайдер генерации отдаёт файлы по 2–5 МБ, а Pinterest принимает для пинов JPEG и PNG
 * (в справочнике API v5 у `image_base64` перечисление `content_type` — строго image/jpeg и
 * image/png). Здесь проверяется то, что стоит денег и места: файл действительно уменьшается,
 * пропорции и достаточное разрешение сохраняются, маленькая картинка не растягивается.
 *
 * Картинки создаются детерминированно (свой генератор вместо Math.random), чтобы размер
 * входа был стабильным: иначе тест «3–5 МБ» превращался бы в проверку удачи.
 */

let seed = 123456789;
function nextRandom() {
  seed = (1103515245 * seed + 12345) % 2147483648;
  return seed / 2147483648;
}

async function photoLikeJpeg({ size = 2400, noise = 45, quality = 96 } = {}) {
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 3;
      const base = (x * 255) / size + (y * 120) / size;
      const jitter = (nextRandom() - 0.5) * noise;
      raw[i] = Math.max(0, Math.min(255, base + jitter));
      raw[i + 1] = Math.max(0, Math.min(255, base * 0.6 + 40 + jitter));
      raw[i + 2] = Math.max(0, Math.min(255, 255 - base * 0.4 + jitter));
    }
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } }).jpeg({ quality }).toBuffer();
}

async function noisyPngWithAlpha({ size = 1600 } = {}) {
  const raw = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    raw[i * 4] = Math.floor(nextRandom() * 256);
    raw[i * 4 + 1] = Math.floor(nextRandom() * 256);
    raw[i * 4 + 2] = Math.floor(nextRandom() * 256);
    raw[i * 4 + 3] = 128;
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

/** JPEG с progressive-разметкой содержит маркер SOF2 (0xFFC2) — он и означает «прогрессивный». */
function isProgressiveJpeg(buffer) {
  for (let i = 0; i < buffer.length - 1; i += 1) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xc2) return true;
  }
  return false;
}

test("a 3–5 MB provider image becomes a file below 500 KB without losing its resolution", async () => {
  const input = await photoLikeJpeg();
  const inputMB = input.length / (1024 * 1024);
  assert.ok(inputMB >= 3 && inputMB <= 5, `the fixture must be 3–5 MB, got ${inputMB.toFixed(2)} MB`);

  const result = await compressPinImage(input);
  assert.equal(result.compressed, true);
  assert.equal(result.mimetype, "image/jpeg");
  assert.equal(result.ext, "jpg");
  assert.ok(
    result.sizeAfter < TARGET_MAX_BYTES,
    `compressed file must stay under 500 KB, got ${Math.round(result.sizeAfter / 1024)} KB`
  );
  assert.ok(result.sizeAfter < input.length / 2, "the file must be meaningfully smaller");

  const output = await sharp(result.buffer).metadata();
  assert.equal(output.format, "jpeg");
  assert.ok(Math.max(output.width, output.height) >= MIN_LONG_SIDE, "the long side must stay at least 1500 px");
  // Пропорции сохраняются: у квадратного исходника остаётся квадрат.
  assert.equal(output.width, output.height);
  assert.equal(output.width, 2400, "an image below the cap must not be resized");
  assert.equal(isProgressiveJpeg(result.buffer), true, "Pinterest-friendly progressive JPEG is expected");
});

test("a very large image is shrunk to the cap but never below 1500 px", async () => {
  const input = await photoLikeJpeg({ size: 3500, noise: 30 });
  const result = await compressPinImage(input);
  assert.equal(result.compressed, true);
  assert.equal(result.longSide, MAX_LONG_SIDE);
  const output = await sharp(result.buffer).metadata();
  assert.equal(Math.max(output.width, output.height), MAX_LONG_SIDE);
  assert.equal(output.width, output.height);
  assert.ok(Math.max(output.width, output.height) >= MIN_LONG_SIDE);
});

test("a small image is never upscaled", async () => {
  const input = await sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: 30, g: 120, b: 200 } },
  }).jpeg({ quality: 92 }).toBuffer();

  const result = await compressPinImage(input);
  const output = await sharp(result.buffer).metadata();
  assert.equal(output.width, 900);
  assert.equal(output.height, 600);
  assert.equal(result.resized, false);
});

test("transparency survives: a PNG with alpha stays a PNG", async () => {
  const input = await noisyPngWithAlpha();
  const result = await compressPinImage(input);
  assert.equal(result.compressed, true);
  assert.equal(result.mimetype, "image/png");
  assert.equal(result.ext, "png");
  assert.equal(result.keptAlpha, true);
  const output = await sharp(result.buffer).metadata();
  assert.equal(output.format, "png");
  assert.equal(output.hasAlpha, true);
});

test("the oversize warning starts above 800 KB and names the target", () => {
  assert.equal(oversizeKB(WARN_BYTES), null, "exactly 800 KB is not yet a warning");
  assert.equal(oversizeKB(WARN_BYTES + 1), 801);
  assert.equal(oversizeKB(TARGET_MAX_BYTES), null, "the 500 KB target itself must not warn");
  assert.equal(oversizeKB(Number.NaN), null);

  // Случай, в котором предупреждение реально срабатывает: PNG с прозрачностью и шумом.
  return noisyPngWithAlpha({ size: 2600 }).then(async (input) => {
    const result = await compressPinImage(input);
    const kb = oversizeKB(result.sizeAfter);
    assert.ok(kb !== null && kb > 800, `expected an oversize PNG above 800 KB, got ${Math.round(result.sizeAfter / 1024)} KB`);
  });
});

test("target size keeps the aspect ratio and refuses to enlarge", () => {
  assert.deepEqual(targetSize(1000, 1500), { width: 1000, height: 1500, resized: false });
  const wide = targetSize(4000, 2000);
  assert.equal(wide.resized, true);
  assert.equal(wide.width, MAX_LONG_SIDE);
  assert.equal(wide.height, Math.round(2000 * (MAX_LONG_SIDE / 4000)));
});

test("a file sharp cannot decode is passed through untouched instead of failing the upload", async () => {
  const notAnImage = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 7),
  ]);
  const result = await compressPinImage(notAnImage);
  assert.equal(result.compressed, false);
  assert.equal(result.reason, "undecodable");
  assert.equal(result.sizeAfter, notAnImage.length);
  assert.equal(result.buffer.equals(notAnImage), true, "the original must be returned, not a broken buffer");
});

test("storage uploads the compressed bytes, never the original", async () => {
  const input = await photoLikeJpeg({ size: 2400, noise: 45 });

  const storagePath = require.resolve("../supabase");
  const lifecyclePath = require.resolve("../pinImageLifecycle");
  const uploads = [];
  require.cache[storagePath] = {
    id: storagePath,
    filename: storagePath,
    loaded: true,
    exports: {
      storage: {
        listBuckets: async () => ({ data: [{ name: "pin-images", public: true }], error: null }),
        createBucket: async () => ({ data: null, error: null }),
        from: () => ({ getPublicUrl: (objectPath) => ({ data: { publicUrl: `https://storage.example.invalid/pin-images/${objectPath}` } }) }),
      },
    },
  };
  require.cache[lifecyclePath] = {
    id: lifecyclePath,
    filename: lifecyclePath,
    loaded: true,
    exports: {
      EXPECTED_PIN_IMAGE_MIMES: ["image/png", "image/jpeg", "image/webp"],
      buildPinImageObjectPath: (ext) => `object.${ext}`,
      extractManagedPinImagePath: () => null,
      validatePinImageBucketConfiguration: () => true,
      uploadManagedPinImageObject: async ({ file }) => { uploads.push({ size: file.length }); return { objectPath: "object.jpg" }; },
      deleteManagedPinImageObject: async () => true,
      findCompletedManagedPinImageUpload: async () => null,
    },
  };
  for (const relative of ["../storage", "../imageValidation", "../imageCompression"]) {
    delete require.cache[require.resolve(relative)];
  }
  const { uploadPinImage } = require("../storage");

  const url = await uploadPinImage({ buffer: input, mimetype: "image/jpeg" });
  assert.match(url, /object\.jpg$/, "the stored object must carry the compressed extension");
  assert.equal(uploads.length, 1);
  assert.ok(
    uploads[0].size < TARGET_MAX_BYTES,
    `the upload must send the compressed file, sent ${Math.round(uploads[0].size / 1024)} KB`
  );
  assert.ok(uploads[0].size < input.length, "no original-sized object may reach the bucket");
});
