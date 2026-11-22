#!/usr/bin/env node
"use strict";

/**
 * Переписывание публичных ссылок на изображения пинов при переезде хранилища.
 *
 *   node scripts/rewrite-image-urls.js \
 *     --from https://project.supabase.co/storage/v1/object/public/pin-images \
 *     --to   https://cdn.pinposy.com/pin-images --dry-run
 *
 * Зачем: `scripts/copy-storage.js` переносит объекты, сохраняя ключи, но в базе остаются
 * абсолютные ссылки на старый домен. Пока они не переписаны, изображения открываются только
 * пока жив старый Supabase Storage.
 *
 * Свойства:
 *   * по умолчанию план: показывает, сколько строк будет изменено и первые примеры;
 *   * меняет только строки, начинающиеся с --from (чужие ссылки не трогает);
 *   * идемпотентен: повторный запуск после --apply ничего не находит;
 *   * работает с базой через REST (Supabase или PostgREST на новой инфраструктуре);
 *   * пишет манифест изменённых строк, чтобы перенос был проверяемым;
 *   * никогда не удаляет строки и не трогает другие колонки.
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Коды выхода: 0 — успех, 1 — ошибки записи, 2 — неверные аргументы.
 */

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = { apply: false, limit: 0, manifest: "" };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case "--from": args.from = argv[++i]; break;
      case "--to": args.to = argv[++i]; break;
      case "--limit": args.limit = Number(argv[++i]); break;
      case "--manifest": args.manifest = argv[++i]; break;
      case "--apply": args.apply = true; break;
      case "--help":
      case "-h": args.help = true; break;
      default: throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/rewrite-image-urls.js --from BASE --to BASE [options]

  --from URL     Старый публичный префикс ссылок (без завершающего слэша)
  --to URL       Новый публичный префикс
  --apply        Выполнить изменения (без флага — только план)
  --limit N      Ограничить число строк (0 — все)
  --manifest F   Файл манифеста (по умолчанию backups/image-url-rewrite-<дата>.json)
  -h, --help     Эта справка
`);
}

function normalize(base) {
  return String(base || "").trim().replace(/\/+$/, "");
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`переменная окружения ${name} не задана`);
  return value;
}

function restBase() {
  return requireEnv("SUPABASE_URL").replace(/\/+$/, "");
}

function headers() {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
}

async function fetchPage(offset, pageSize) {
  const url = `${restBase()}/rest/v1/pins?select=id,image_url&image_url=like.${encodeURIComponent(`${FROM}%`)}&order=id.asc&limit=${pageSize}&offset=${offset}`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) throw new Error(`чтение pins -> ${response.status} ${await response.text()}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("REST вернул не массив");
  return rows;
}

async function updateRow(id, imageUrl) {
  const response = await fetch(`${restBase()}/rest/v1/pins?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...headers(), prefer: "return=minimal" },
    body: JSON.stringify({ image_url: imageUrl }),
  });
  if (!response.ok) throw new Error(`обновление ${id} -> ${response.status} ${await response.text()}`);
}

let FROM = "";
let TO = "";

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
  FROM = normalize(args.from);
  TO = normalize(args.to);
  if (!FROM || !TO) { console.error("error: --from и --to обязательны"); usage(); process.exit(2); }
  if (!/^https?:\/\//.test(FROM) || !/^https?:\/\//.test(TO)) { console.error("error: адреса должны начинаться с http(s)://"); process.exit(2); }
  if (FROM === TO) { console.error("error: --from и --to совпадают"); process.exit(2); }

  const manifestPath = args.manifest || path.join("backups", `image-url-rewrite-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  console.log(`префикс: ${FROM} -> ${TO}`);
  console.log(args.apply ? `режим: запись, манифест ${manifestPath}` : "режим: план (изменения не выполняются)");

  const pageSize = 200;
  const manifest = { from: FROM, to: TO, changed: [], startedAt: new Date().toISOString() };
  let offset = 0;
  let seen = 0;
  let planned = 0;
  let changed = 0;
  let failed = 0;

  for (;;) {
    const rows = await fetchPage(offset, pageSize);
    if (!rows.length) break;
    for (const row of rows) {
      seen += 1;
      const current = String(row.image_url || "");
      // Строка могла измениться между чтением и записью: пересчитываем от фактического значения.
      if (!current.startsWith(`${FROM}/`)) continue;
      const next = `${TO}/${current.slice(FROM.length + 1)}`;
      planned += 1;
      if (!args.apply) {
        if (planned <= 10) console.log(`  ${current} -> ${next}`);
        continue;
      }
      try {
        await updateRow(row.id, next);
        changed += 1;
        manifest.changed.push({ id: row.id, from: current, to: next });
        if (changed % 50 === 0) fs.mkdirSync(path.dirname(manifestPath), { recursive: true }) || fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      } catch (error) {
        failed += 1;
        console.error(`  FAIL ${row.id}: ${error.message}`);
      }
    }
    if (args.limit && seen >= args.limit) break;
    if (rows.length < pageSize) break;
    // После успешной записи строки выпадают из выборки по like, поэтому offset растёт только
    // в режиме плана; иначе продолжаем с того же места.
    offset += args.apply ? 0 : rows.length;
  }

  manifest.finishedAt = new Date().toISOString();
  manifest.counts = { seen, planned, changed, failed };
  if (args.apply) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  console.log("────────");
  console.log(`просмотрено: ${seen}, к изменению: ${planned}, изменено: ${changed}, ошибок: ${failed}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`error: ${error && error.message}`);
  process.exit(2);
});
