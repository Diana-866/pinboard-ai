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

test("the local migration verification drives a throwaway cluster only", () => {
  const script = read("deploy/verify-migrations-local.sh");
  assert.match(script, /initdb -D "\$DATA_DIR"/, "a temporary cluster is required");
  assert.match(script, /-A trust/, "the throwaway cluster must not ask for a password");
  assert.match(script, /trap cleanup EXIT/, "the cluster must be removed even on failure");
  assert.match(script, /create role service_role/, "Supabase roles are needed for policies and grants");
  assert.match(script, /apply-migrations\.cjs/, "the verification must run the real runner");
  assert.match(script, /0 applied/, "idempotency must be checked, not assumed");
  // Проверка без падения — это печать, а не проверка: ветка провала обязана вернуть код 1.
  // Проверка без падения — это печать, а не проверка: после сообщения о провале
  // скрипт обязан завершиться кодом 1.
  // Строка провала ищется целиком: `indexOf("exit 1")` после неё находил бы любой
  // следующий выход с кодом 1 и подтверждал бы то, чего в этой ветке нет.
  const failureLine = script
    .split(String.fromCharCode(10))
    .find((line) => line.includes("second run applied something again"));
  assert.ok(failureLine, "the idempotency failure branch must exist");
  assert.ok(failureLine.includes("exit 1"), "a failed idempotency check must exit non-zero");
  // Скрипт не должен ссылаться на боевые адреса или файлы окружения.
  // Никакого чтения окружения и никаких боевых адресов в этом скрипте.
  assert.equal(script.includes(".env"), false, "the verification must not read .env");
  assert.doesNotMatch(script, /source\s+\S*env/, "the verification must not source an env file");
  assert.doesNotMatch(script, /onrender\.com|supabase\.co/, "no remote database may appear here");
});
test("every variable the compose file substitutes is documented", () => {
  const compose = read("deploy/docker-compose.yml");
  const example = read("deploy/.env.example");
  // `${VAR...}` в compose — единственный источник значений при запуске: недокументированная
  // переменная означает, что при развёртывании её просто никто не заполнит.
  const used = [...new Set([...compose.matchAll(/[$][{]([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]))];
  assert.ok(used.length >= 3, `expected the compose substitutions, found ${used.length}`);
  const missing = used.filter((name) => !new RegExp("^" + name + "=", "m").test(example));
  assert.deepEqual(missing, [], `variables used by compose but not documented in deploy/.env.example: ${missing.join(", ")}`);
});

test("the deployment example holds placeholders, never real secrets", () => {
  const example = read("deploy/.env.example");
  assert.doesNotMatch(example, /eyJ[A-Za-z0-9_-]{20,}/, "a JWT-looking value must not be committed");
  assert.doesNotMatch(example, /(sk|pk)_(live|test)_[A-Za-z0-9]{10,}/, "a provider key must not be committed");
  assert.doesNotMatch(example, /postgres(ql)?:..[^ ]*:[^ @]+@/, "a database url with a password must not be committed");
  const domainLine = example.split(String.fromCharCode(10)).find((line) => line.startsWith("CADDY_DOMAIN=")) || "";
  assert.ok(domainLine.length > 0, "CADDY_DOMAIN must be documented");
});

test("the deployment parts agree on the API prefix", () => {
  // Три файла должны говорить об одном и том же: браузер собирает адрес из VITE_API_URL,
  // Caddy снимает префикс перед backend. Если префиксы разойдутся, сайт откроется, а каждый
  // запрос к API вернёт 404 — и это выглядит как «сервер не отвечает».
  const example = read("deploy/.env.example");
  const caddy = read("deploy/Caddyfile");
  const web = read("deploy/Dockerfile.web");
  const compose = read("deploy/docker-compose.yml");

  const apiLine = example.split(String.fromCharCode(10)).find((line) => line.startsWith("VITE_API_URL=")) || "";
  assert.ok(apiLine.length > 0, "VITE_API_URL must be documented");
  const apiValue = apiLine.slice("VITE_API_URL=".length).replace(/^"|"$/g, "");
  assert.ok(apiValue.startsWith("/"), "the API address must stay same-origin, otherwise CORS is needed again");
  const prefix = apiValue.replace(/\/+$/, "");

  assert.ok(caddy.includes("handle " + prefix + "/*"), `Caddy must route ${prefix}/* to the backend`);
  assert.ok(caddy.includes("uri strip_prefix " + prefix), `Caddy must strip ${prefix} before proxying`);
  assert.match(caddy, /reverse_proxy backend:3000/);
  assert.match(web, /ARG VITE_API_URL/);
  assert.match(web, /ENV VITE_API_URL=\$VITE_API_URL/);
  assert.match(compose, /VITE_API_URL:/);
});

test("the web image refuses to build without an API address", () => {
  // Иначе неудачная сборка выкладывает бандл, который молча обращается к выключенному
  // хостингу: сайт открывается, данные не идут, и причина не видна никому.
  const web = read("deploy/Dockerfile.web");
  // `&&` вместо `||` пропускал бы пустое значение: проверка обязана валить сборку.
  const guardLine = web.split(String.fromCharCode(10)).map((line) => line.trim())
    .find((line) => line.startsWith('RUN test -n "$VITE_API_URL"')) || "";
  assert.ok(guardLine.startsWith('RUN test -n "$VITE_API_URL" ||'), "an empty VITE_API_URL must fail the build");
  assert.match(guardLine, /exit 1/, "the empty check must end the build");
  // Именно эта команда обязана быть проверкой: `RUN if false && grep ...` содержит тот же
  // текст, но ничего не проверяет, поэтому проверяется сама форма строки. Отрицание
  // `!` и есть провал сборки: найденный старый хост делает RUN неуспешным.
  const hostLine = web.split(String.fromCharCode(10)).find((line) => line.includes("onrender.com"));
  assert.ok(hostLine, "the built bundle must be checked for the previous host");
  assert.equal(hostLine.trim(), 'RUN ! grep -rIl "onrender.com" /app/dist', "the host check must run unconditionally and fail the build");
});
