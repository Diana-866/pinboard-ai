"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Дни 3–4 плана: развёртывание на одном VPS. Проверки статические — Docker на машине
 * разработки нет, поэтому здесь фиксируется только соответствие файлов развёртывания
 * реальным точкам входа кода. Сборка образов и запуск стека этими тестами НЕ проверяются.
 */
const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("files needed to deploy exist", () => {
  for (const file of [
    "deploy/Dockerfile.backend",
    "deploy/Dockerfile.web",
    "deploy/Caddyfile",
    "deploy/docker-compose.yml",
    "deploy/.dockerignore",
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`);
  }
});

test("the backend image starts the real entrypoint and never runs as root", () => {
  const dockerfile = read("deploy/Dockerfile.backend");
  assert.match(dockerfile, /CMD \["node", "index\.js"\]/);
  assert.match(dockerfile, /USER node/, "the process must not run as root");
  assert.match(dockerfile, /dumb-init/, "signals must reach node so shutdown stays graceful");
  assert.ok(fs.existsSync(path.join(root, "backend", "index.js")));
});

test("the healthcheck asks the route that actually exists", () => {
  const dockerfile = read("deploy/Dockerfile.backend");
  const compose = read("deploy/docker-compose.yml");
  const index = read("backend/index.js");
  assert.match(index, /app\.get\("\/health"/, "the route must exist in the server");
  // `/health` без кавычки совпадает и с `/healthz`, поэтому путь закреплён кавычкой.
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/'health''|'\/health'/);
  assert.match(compose, /healthcheck:[\s\S]*\/health/);
});

test("the image installs dependencies from the lock file only", () => {
  const dockerfile = read("deploy/Dockerfile.backend");
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.ok(fs.existsSync(path.join(root, "backend", "package-lock.json")));
});

test("both workers are separate processes with the commands that exist", () => {
  const compose = read("deploy/docker-compose.yml");
  const pkg = JSON.parse(read("backend/package.json"));
  assert.match(compose, /command: \["node", "scheduleWorker\.js"\]/);
  assert.match(compose, /command: \["node", "accountDeletionWorker\.js"\]/);
  // Команды совпадают с package.json, иначе воркеры запускаются иначе, чем локально.
  assert.match(pkg.scripts.worker, /scheduleWorker\.js/);
  assert.match(pkg.scripts["worker:account-deletion"], /accountDeletionWorker\.js/);
  assert.match(compose, /restart: unless-stopped/);
});

test("the account-deletion worker is explicitly enabled in production", () => {
  const compose = read("deploy/docker-compose.yml");
  const gate = read("backend/accountDeletionWorkerGate.js");
  // Гейт включает воркер только по строке "true": без этой переменной удаление аккаунтов не работает.
  assert.match(gate, /ACCOUNT_DELETION_WORKER_ENABLED === "true"/);
  assert.match(compose, /ACCOUNT_DELETION_WORKER_ENABLED: "true"/);
});

test("Caddy serves the API under /api and keeps the SPA fallback", () => {
  const caddy = read("deploy/Caddyfile");
  assert.match(caddy, /handle \/api\/\*/);
  // Строка обязана быть директивой, а не комментарием с тем же текстом.
  assert.match(caddy, /^	+uri strip_prefix \/api$/m);
  assert.match(caddy, /reverse_proxy backend:3000/);
  assert.match(caddy, /try_files \{path\} \/index\.html/);
  assert.match(caddy, /Strict-Transport-Security/);
});

test("secrets are excluded from the build context", () => {
  for (const ignore of ["deploy/.dockerignore", ".dockerignore"]) {
    const text = read(ignore);
    // Только точная строка `**/.env`: правило `**/.env.*` не исключает сам файл `.env`.
    assert.match(text, /^\*\*\/\.env$/m, `${ignore} must exclude .env`);
    assert.match(text, /\*\*\/node_modules/);
  }
});
