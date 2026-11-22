#!/usr/bin/env node
"use strict";

/**
 * Прогон миграций на сервере: db/migrations/*.sql по возрастанию номера.
 *
 * Правила:
 *  - файлы применяются по одному в одной транзакции (`--single-transaction` + `ON_ERROR_STOP`);
 *  - применённая миграция записывается в public.schema_migrations вместе с контрольной суммой;
 *  - файл, изменённый после применения, не переигрывается молча: прогон останавливается;
 *  - 000_check_schema.sql — диагностика, а не миграция, поэтому в прогон не входит;
 *  - пароль и DATABASE_URL не печатаются никогда.
 *
 * Запуск: DATABASE_URL=... node deploy/apply-migrations.cjs [--dry-run]
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");
const TABLE = "public.schema_migrations";
const DIAGNOSTIC_PREFIX = "000_";

function listMigrations(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => !name.startsWith(DIAGNOSTIC_PREFIX))
    .map((name) => ({ name, number: Number.parseInt(name.split("_")[0], 10) }))
    .filter((entry) => Number.isFinite(entry.number))
    .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name))
    .map((entry) => ({
      ...entry,
      file: path.join(dir, entry.name),
      checksum: crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, entry.name))).digest("hex"),
    }));
}

/** psql по умолчанию: без справки, с остановкой на первой ошибке, пароль только из окружения. */
function psqlRunner(args) {
  const result = spawnSync(process.env.PSQL_BIN || "psql", args, {
    env: { ...process.env, PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT || "15" },
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null,
  };
}

function runSql(sql, { databaseUrl, run = psqlRunner }) {
  return run(["--no-psqlrc", "--quiet", "--single-transaction", "-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-c", sql]);
}

function runFile(file, { databaseUrl, run = psqlRunner }) {
  return run(["--no-psqlrc", "--quiet", "--single-transaction", "-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-f", file]);
}

function ensureJournal(options) {
  return runSql(
    `create table if not exists ${TABLE} (` +
      "version text primary key, " +
      "checksum text not null, " +
      "applied_at timestamptz not null default now());",
    options
  );
}

function readApplied(options) {
  const result = runSql(`copy (select version, checksum from ${TABLE}) to stdout with (format csv);`, options);
  if (result.status !== 0) return { ok: false, error: result.stderr || "read failed", applied: new Map() };
  const applied = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [version, checksum] = line.split(",");
    applied.set(version, checksum);
  }
  return { ok: true, applied };
}

/**
 * Чистая функция плана: что применять, что пропустить и где остановиться.
 * Вынесена отдельно, чтобы её можно было проверить без базы.
 */
function buildPlan(migrations, applied) {
  const plan = [];
  const conflicts = [];
  for (const migration of migrations) {
    const known = applied.get(migration.name);
    if (known === undefined) {
      plan.push(migration);
      continue;
    }
    if (known !== migration.checksum) {
      conflicts.push(migration.name);
    }
  }
  return { plan, conflicts };
}

function main(argv = process.argv.slice(2), deps = {}) {
  const dryRun = argv.includes("--dry-run");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("apply-migrations: DATABASE_URL is not set; refusing to guess a database");
    return 2;
  }

  const migrations = listMigrations();
  if (migrations.length === 0) {
    console.error("apply-migrations: no migration files found; refusing to report success");
    return 2;
  }

  const options = { databaseUrl, run: deps.run || psqlRunner };
  if (dryRun) {
    console.log(`apply-migrations: dry run over ${migrations.length} files (nothing is applied)`);
    const created = ensureJournal(options);
    const applied = created.status === 0 ? readApplied(options) : { ok: false, applied: new Map() };
    const { plan, conflicts } = buildPlan(migrations, applied.applied || new Map());
    for (const migration of plan) console.log(`would apply ${migration.name}`);
    for (const name of conflicts) console.log(`would refuse ${name}: checksum changed after it was applied`);
    return conflicts.length > 0 ? 1 : 0;
  }

  const created = ensureJournal(options);
  if (created.status !== 0) {
    console.error(`apply-migrations: cannot create ${TABLE}: ${(created.stderr || "").trim()}`);
    return 2;
  }
  const read = readApplied(options);
  if (!read.ok) {
    console.error(`apply-migrations: cannot read ${TABLE}: ${String(read.error).trim()}`);
    return 2;
  }

  const { plan, conflicts } = buildPlan(migrations, read.applied);
  if (conflicts.length > 0) {
    for (const name of conflicts) console.error(`apply-migrations: ${name} changed after it was applied; refusing to continue`);
    return 1;
  }

  let appliedCount = 0;
  for (const migration of plan) {
    const result = runFile(migration.file, options);
    if (result.status !== 0) {
      console.error(`apply-migrations: ${migration.name} failed: ${(result.stderr || "").trim()}`);
      return 1;
    }
    const record = runSql(
      `insert into ${TABLE} (version, checksum) values ('${migration.name}', '${migration.checksum}');`,
      options
    );
    if (record.status !== 0) {
      console.error(`apply-migrations: ${migration.name} applied but not recorded: ${(record.stderr || "").trim()}`);
      return 1;
    }
    appliedCount += 1;
    console.log(`applied ${migration.name}`);
  }
  console.log(`apply-migrations: ${appliedCount} applied, ${migrations.length - appliedCount} already present`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { listMigrations, buildPlan, main, DIAGNOSTIC_PREFIX, TABLE };
