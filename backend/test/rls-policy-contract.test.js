"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Дни 10–11 плана: RLS — клиент не читает чужие строки.
 *
 * Миграции применяются по порядку, поэтому итоговое состояние собирается как состояние:
 * `enable/disable row level security`, `create policy` и `drop policy` накладываются
 * последовательно, в текстовом порядке файла. Проверка идёт по SQL: живой базы на машине
 * разработки нет, а «должно работать» доказательством не считается.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "db", "migrations");

function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, number: Number.parseInt(name.split("_")[0], 10) }))
    .filter((entry) => Number.isFinite(entry.number))
    .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name))
    .map((entry) => ({ ...entry, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, entry.name), "utf8") }));
}

const normalize = (name) => name.replace(/^public\./i, "").replace(/"/g, "").trim().toLowerCase();

/** Убирает строки-комментарии: политика, упомянутая в комментарии, не является живой. */
function stripComments(sql) {
  return sql
    .split(String.fromCharCode(10))
    .map((line) => (line.trim().startsWith("--") ? "" : line))
    .join(String.fromCharCode(10));
}

function collectState() {
  const rls = new Map();
  const policies = new Map();
  const userTables = new Set();
  const clientGrants = [];

  for (const file of migrationFiles()) {
    const sql = stripComments(file.sql);
    const events = [];
    const push = (index, kind, payload) => events.push({ index, kind, payload });

    for (const match of sql.matchAll(/alter\s+table\s+([a-z_."]+)\s+(enable|disable)\s+row\s+level\s+security/gi)) {
      push(match.index, "rls", { table: normalize(match[1]), on: match[2].toLowerCase() === "enable" });
    }

    // Тело create table берётся срезом до первого ");" — регулярное выражение с диапазоном
    // до закрывающей скобки на многострочном теле здесь только ломалось.
    for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_."]+)\s*\(/gi)) {
      const body = sql.slice(match.index).split(");")[0];
      if (/\buser_id\b/.test(body)) push(match.index, "user-table", { table: normalize(match[1]) });
    }

    for (const match of sql.matchAll(/create\s+policy\s+([a-z0-9_"]+)\s+on\s+([a-z_."]+)([\s\S]*?);/gi)) {
      push(match.index, "create-policy", {
        table: normalize(match[2]),
        name: normalize(match[1]),
        body: match[3],
        file: file.name,
      });
    }

    for (const match of sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?([a-z0-9_"]+)\s+on\s+([a-z_."]+)/gi)) {
      push(match.index, "drop-policy", { table: normalize(match[2]), name: normalize(match[1]) });
    }

    for (const match of sql.matchAll(/grant\s+([^;]*?)\s+on\s+([a-z_."]+)\s+to\s+([a-z_,\s"]+);/gi)) {
      const roles = match[3].toLowerCase();
      if (/\banon\b|\bauthenticated\b/.test(roles)) {
        push(match.index, "grant", { table: normalize(match[2]), roles: roles.trim(), file: file.name });
      }
    }

    // Порядок событий — это порядок операторов: в одной миграции `drop policy if exists`
    // стоит перед `create policy`, и разбор «сначала все create, потом все drop» удалял бы
    // только что созданные политики.
    events.sort((a, b) => a.index - b.index);
    for (const event of events) {
      if (event.kind === "rls") {
        rls.set(event.payload.table, event.payload.on);
      } else if (event.kind === "user-table") {
        userTables.add(event.payload.table);
      } else if (event.kind === "create-policy") {
        policies.set(`${event.payload.table}::${event.payload.name}`, event.payload);
      } else if (event.kind === "drop-policy") {
        policies.delete(`${event.payload.table}::${event.payload.name}`);
      } else if (event.kind === "grant") {
        clientGrants.push(event.payload);
      }
    }
  }
  return { rls, policies, userTables, clientGrants };
}

const state = collectState();

test("the scan reads the real migration history", () => {
  const files = migrationFiles();
  assert.ok(files.length > 100, `expected the whole migration history, found ${files.length}`);
  assert.ok(state.rls.size >= 25, `expected tables with RLS decisions, found ${state.rls.size}`);
  assert.ok(state.userTables.size >= 10, `expected user-owned tables, found ${state.userTables.size}`);
  assert.ok(state.policies.size >= 8, `expected policies, found ${state.policies.size}`);
});

test("every user-owned table has row level security enabled", () => {
  const missing = [...state.userTables].filter((table) => state.rls.get(table) !== true).sort();
  assert.deepEqual(missing, [], `user-owned tables without RLS: ${missing.join(", ")}`);
});

test("no policy lets the client read other people's rows", () => {
  const broken = [];
  for (const policy of state.policies.values()) {
    if (/using\s*\(\s*true\s*\)/i.test(policy.body)) {
      broken.push(`${policy.table}.${policy.name} uses true`);
      continue;
    }
    // Политика без auth.uid() не связана с владельцем строки.
    if (!/auth\.uid\s*\(\s*\)/i.test(policy.body)) {
      broken.push(`${policy.table}.${policy.name} does not compare with auth.uid()`);
    }
  }
  assert.deepEqual(broken, [], `policies that are not owner-scoped: ${broken.join(", ")}`);
});

test("a client role is never granted access to a table without RLS", () => {
  const broken = state.clientGrants
    .filter((grant) => state.rls.get(grant.table) !== true)
    .map((grant) => `${grant.table} (${grant.file}: ${grant.roles})`);
  assert.deepEqual(broken, [], `client roles on tables without RLS: ${broken.join(", ")}`);
});

test("policies exist for the tables the app reads per user", () => {
  // Клиентские чтения идут через backend, но политика — вторая линия защиты: если её нет,
  // одна ошибка в выдаче ключа открывает таблицу целиком.
  const required = ["users", "projects", "boards", "pins"];
  const withPolicy = new Set([...state.policies.values()].map((policy) => policy.table));
  const missing = required.filter((table) => !withPolicy.has(table));
  assert.deepEqual(missing, [], `tables without a policy: ${missing.join(", ")}`);
});
