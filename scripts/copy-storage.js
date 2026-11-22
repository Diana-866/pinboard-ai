#!/usr/bin/env node
"use strict";

/**
 * Перенос объектов хранилища PinPosy (изображения пинов) между источниками.
 *
 *   node scripts/copy-storage.js --dry-run \
 *     --source supabase --source-bucket pin-images \
 *     --dest s3 --dest-bucket pin-images
 *
 * Источники и приёмники:
 *   --source supabase   Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *   --source s3         S3-совместимое хранилище (S3_SOURCE_* )
 *   --dest s3           S3-совместимое хранилище (S3_ENDPOINT, S3_REGION, S3_BUCKET,
 *                       S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)
 *
 * Зачем: изображения пинов сейчас лежат в Supabase Storage. При переезде на новую
 * инфраструктуру их нужно перенести в S3-совместимое хранилище так, чтобы путь объекта
 * не изменился — иначе ссылки в базе перестанут открываться.
 *
 * Свойства, важные для боевого переноса:
 *   * сначала список и размеры, запись — только после --apply (по умолчанию dry-run);
 *   * манифест пишется после каждого объекта, поэтому прерванный перенос продолжается,
 *     а не начинается заново;
 *   * после записи объект читается обратно и сверяется по размеру (--verify, по умолчанию включено);
 *   * существующий объект того же размера пропускается, отличающийся — перезаписывается с предупреждением;
 *   * ничего не удаляется ни в источнике, ни в приёмнике.
 *
 * Коды выхода: 0 — успех, 1 — были ошибки, 2 — неверные аргументы/конфигурация.
 */

const fs = require("node:fs");
const path = require("node:path");
// Скрипт лежит в scripts/, а зависимости — в backend/node_modules, поэтому пакет ищется
// по обоим путям: так скрипт работает и из корня репозитория, и из backend.
let sdk = null;
function s3sdk() {
  if (sdk) return sdk;
  const candidates = [
    "@aws-sdk/client-s3",
    path.join(__dirname, "..", "backend", "node_modules", "@aws-sdk", "client-s3"),
  ];
  for (const candidate of candidates) {
    try { sdk = require(candidate); return sdk; } catch { /* пробуем следующий путь */ }
  }
  throw new Error("не найден @aws-sdk/client-s3: выполните npm install в backend");
}

function parseArgs(argv) {
  const args = {
    source: "supabase",
    dest: "s3",
    sourceBucket: "",
    destBucket: "",
    dryRun: true,
    verify: true,
    limit: 0,
    manifest: "",
    prefix: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    switch (flag) {
      case "--source": args.source = argv[++i]; break;
      case "--dest": args.dest = argv[++i]; break;
      case "--source-bucket": args.sourceBucket = argv[++i]; break;
      case "--dest-bucket": args.destBucket = argv[++i]; break;
      case "--prefix": args.prefix = argv[++i]; break;
      case "--limit": args.limit = Number(argv[++i]); break;
      case "--manifest": args.manifest = argv[++i]; break;
      case "--apply": args.dryRun = false; break;
      case "--no-verify": args.verify = false; break;
      case "--help":
      case "-h": args.help = true; break;
      default:
        throw new Error(`unknown argument: ${flag}`);
    }
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/copy-storage.js [options]

  --source supabase|s3     Откуда копируем (по умолчанию supabase)
  --dest s3                Куда копируем (поддерживается только s3)
  --source-bucket NAME     Бакет-источник (по умолчанию pin-images)
  --dest-bucket NAME       Бакет-приёмник (по умолчанию pin-images)
  --prefix PATH            Копировать только объекты с этим префиксом
  --limit N                Ограничить число объектов (0 — все)
  --manifest FILE          Файл манифеста (по умолчанию backups/storage-copy-<дата>.json)
  --apply                  Выполнить запись (без флага — только план)
  --no-verify              Не читать объект обратно после записи
  -h, --help               Эта справка

Переменные окружения:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY           для --source supabase
  S3_SOURCE_ENDPOINT, S3_SOURCE_BUCKET, S3_SOURCE_ACCESS_KEY_ID, S3_SOURCE_SECRET_ACCESS_KEY
                                                    для --source s3
  S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE=1
                                                    для --dest s3
`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`переменная окружения ${name} не задана`);
  return value;
}

function s3Client(prefixEnv) {
  const endpoint = requireEnv(`${prefixEnv}ENDPOINT`);
  return new (s3sdk().S3Client)({
    endpoint,
    region: process.env[`${prefixEnv}REGION`] || "us-east-1",
    forcePathStyle: process.env[`${prefixEnv}FORCE_PATH_STYLE`] !== "0",
    credentials: {
      accessKeyId: requireEnv(`${prefixEnv}ACCESS_KEY_ID`),
      secretAccessKey: requireEnv(`${prefixEnv}SECRET_ACCESS_KEY`),
    },
  });
}

/** Supabase Storage: список объектов пачками по 100, как отдаёт сам сервис. */
async function listSupabase(bucket, prefix, limit) {
  const base = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const out = [];
  let offset = 0;
  for (;;) {
    const response = await fetch(`${base}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset }),
    });
    if (!response.ok) throw new Error(`Supabase Storage list -> ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Supabase Storage list вернул не массив");
    for (const row of rows) {
      // Папки приходят без id/metadata: их нужно раскрыть отдельными запросами.
      if (row && row.id === null && row.name) {
        out.push(...await listSupabase(bucket, prefix ? `${prefix}/${row.name}` : row.name, 0));
        continue;
      }
      out.push({
        key: prefix ? `${prefix}/${row.name}` : row.name,
        size: Number(row.metadata && row.metadata.size) || 0,
        contentType: (row.metadata && row.metadata.mimetype) || "application/octet-stream",
      });
      if (limit && out.length >= limit) return out;
    }
    if (rows.length < 100) break;
    offset += rows.length;
  }
  return out;
}

/** S3-совместимый источник: список через ListObjectsV2. */
async function listS3(client, bucket, prefix, limit) {
  const out = [];
  let token;
  do {
    const page = await client.send(new (s3sdk().ListObjectsV2Command)({
      Bucket: bucket, Prefix: prefix || undefined, ContinuationToken: token, MaxKeys: 1000,
    }));
    for (const item of page.Contents || []) {
      out.push({ key: item.Key, size: Number(item.Size) || 0, contentType: "application/octet-stream" });
      if (limit && out.length >= limit) return out;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function downloadSupabase(bucket, key) {
  const base = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const token = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { apikey: token, authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Supabase Storage download ${key} -> ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function downloadS3(client, bucket, key) {
  const response = await client.send(new (s3sdk().GetObjectCommand)({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function loadManifest(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed.done) ? parsed : { done: [] };
  } catch {
    return { done: [] };
  }
}

function saveManifest(file, manifest) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error.message}`);
    usage();
    process.exit(2);
  }
  if (args.help) { usage(); return; }
  if (args.dest !== "s3") { console.error("error: поддерживается только --dest s3"); process.exit(2); }
  if (!["supabase", "s3"].includes(args.source)) { console.error("error: --source supabase|s3"); process.exit(2); }

  const sourceBucket = args.sourceBucket || process.env.S3_SOURCE_BUCKET || "pin-images";
  const destBucket = args.destBucket || process.env.S3_BUCKET || "pin-images";
  const manifestPath = args.manifest || path.join("backups", `storage-copy-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let sourceClient = null;
  let objects;
  if (args.source === "supabase") {
    objects = await listSupabase(sourceBucket, args.prefix, args.limit);
  } else {
    sourceClient = s3Client("S3_SOURCE_");
    objects = await listS3(sourceClient, sourceBucket, args.prefix, args.limit);
  }

  const totalBytes = objects.reduce((sum, item) => sum + item.size, 0);
  console.log(`объектов: ${objects.length}, суммарный размер: ${totalBytes} байт`);
  console.log(`направление: ${args.source}:${sourceBucket} -> s3:${destBucket}`);
  console.log(args.dryRun ? "режим: план (запись не выполняется)" : `режим: запись, манифест ${manifestPath}`);

  if (args.dryRun) {
    for (const item of objects.slice(0, 20)) console.log(`  ${item.size}\t${item.key}`);
    if (objects.length > 20) console.log(`  … ещё ${objects.length - 20}`);
    return;
  }

  const dest = s3Client("S3_");
  try {
    await dest.send(new (s3sdk().CreateBucketCommand)({ Bucket: destBucket }));
    console.log(`создан бакет ${destBucket}`);
  } catch (error) {
    if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/i.test(String(error && error.name))) throw error;
  }

  const manifest = loadManifest(manifestPath);
  const done = new Set(manifest.done.map((row) => row.key));
  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of objects) {
    if (done.has(item.key)) { skipped += 1; continue; }
    try {
      const existing = await dest.send(new (s3sdk().HeadObjectCommand)({ Bucket: destBucket, Key: item.key })).catch(() => null);
      if (existing && Number(existing.ContentLength) === item.size) {
        manifest.done.push({ key: item.key, size: item.size, status: "already_present" });
        saveManifest(manifestPath, manifest);
        skipped += 1;
        continue;
      }
      if (existing) console.warn(`  ! ${item.key}: размер в приёмнике ${existing.ContentLength} ≠ ${item.size}, перезапись`);

      const body = args.source === "supabase"
        ? await downloadSupabase(sourceBucket, item.key)
        : await downloadS3(sourceClient, sourceBucket, item.key);
      await dest.send(new (s3sdk().PutObjectCommand)({
        Bucket: destBucket, Key: item.key, Body: body,
        ContentType: item.contentType || "application/octet-stream",
      }));

      if (args.verify) {
        const head = await dest.send(new (s3sdk().HeadObjectCommand)({ Bucket: destBucket, Key: item.key }));
        if (Number(head.ContentLength) !== body.length) {
          throw new Error(`проверка не прошла: записано ${head.ContentLength}, ожидалось ${body.length}`);
        }
      }
      manifest.done.push({ key: item.key, size: body.length, status: "copied" });
      saveManifest(manifestPath, manifest);
      copied += 1;
      console.log(`  ok ${item.key} (${body.length} байт)`);
    } catch (error) {
      failed += 1;
      console.error(`  FAIL ${item.key}: ${error.message}`);
    }
  }

  console.log(`────────\nскопировано: ${copied}, пропущено: ${skipped}, ошибок: ${failed}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`error: ${error && error.message}`);
  process.exit(2);
});
