"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Дни 10–11 плана: ограничение частоты на вход, регистрацию и оплату.
 *
 * Общий `apiLimiter` вешается на всё приложение, но у чувствительных маршрутов есть
 * собственные лимитеры. Рефакторинг легко теряет один из них, и тогда единственной
 * защитой остаётся общий бюджет — то есть перебор паролей снова становится возможным.
 * Проверка выводит список маршрутов из исходника, а не из памяти.
 */
const INDEX = path.join(__dirname, "..", "index.js");
const source = fs.readFileSync(INDEX, "utf8");

/**
 * Чувствительные пути: там, где перебор или трата денег даёт выгоду.
 * Чтения `/billing/*` и `/admin/*` намеренно не входят: их ограничивает общий бюджет
 * приложения (`apiLimiter`), а собственный лимитер нужен записям и действиям.
 */
const SENSITIVE_ANY_METHOD = [
  /^\/register$/,
  /^\/login$/,
  /^\/verify-email$/,
  /^\/resend-verification$/,
  /^\/forgot-password$/,
  /^\/reset-password$/,
  /^\/billing\/webhook$/,
  /^\/credits\/purchase/,
  /^\/subscription\/purchase/,
  /^\/generate/,
  /^\/pins\/:id\/publish$/,
  /^\/upload/,
];
const SENSITIVE_WRITES_ONLY = [/^\/billing\//, /^\/admin\//];

function isSensitive(route) {
  if (SENSITIVE_ANY_METHOD.some((pattern) => pattern.test(route.path))) return true;
  if (route.method === "GET") return false;
  return SENSITIVE_WRITES_ONLY.some((pattern) => pattern.test(route.path));
}

/** Все объявления маршрутов вида app.post("/login", apiLimiter, async (req, res) => {…}). */
function declaredRoutes(text = source) {
  const routes = [];
  const pattern = /app\.(get|post|put|patch|delete)\(\s*"([^"]+)"\s*,([\s\S]*?)(?:async\s*)?\(req,\s*res\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    routes.push({ method: match[1].toUpperCase(), path: match[2], chain: match[3] });
  }
  return routes;
}

test("the inventory reads real route declarations", () => {
  const routes = declaredRoutes();
  assert.ok(routes.length > 50, `expected the server routes, found ${routes.length}`);
  const sensitive = routes.filter(isSensitive);
  assert.ok(sensitive.length >= 15, `expected the sensitive routes, found ${sensitive.length}`);
});

test("every sensitive route keeps its own limiter", () => {
  const routes = declaredRoutes();
  // Требование по имени, а не «в цепочке есть что-то с Limiter»: иначе удаление
  // authLimiter со входа проходит незамеченным, потому что рядом остаётся другой лимитер.
  const REQUIRED = [
    ["POST", "/register", "authLimiter"],
    ["POST", "/login", "authLimiter"],
    ["POST", "/login", "loginAccountLimiter"],
    ["POST", "/verify-email", "verifyLimiter"],
    ["POST", "/resend-verification", "resendVerificationLimiter"],
    ["POST", "/forgot-password", "authLimiter"],
    ["POST", "/reset-password", "authLimiter"],
  ];
  const problems = [];
  for (const [method, routePath, limiter] of REQUIRED) {
    const route = routes.find((entry) => entry.method === method && entry.path === routePath);
    if (!route) {
      problems.push(`${method} ${routePath} is missing`);
      continue;
    }
    if (!route.chain.includes(limiter)) problems.push(`${method} ${routePath} lost ${limiter}`);
  }

  // Для остальных записывающих маршрутов достаточно собственного лимитера в цепочке.
  const missing = [];
  for (const route of routes) {
    if (!isSensitive(route)) continue;
    if (!/Limiter/.test(route.chain)) missing.push(`${route.method} ${route.path}`);
  }
  assert.deepEqual(problems, [], `limiter inventory broken: ${problems.join(", ")}`);
  assert.deepEqual(missing, [], `sensitive routes without a dedicated limiter: ${missing.join(", ")}`);
});

test("the webhook has its own budget instead of the generic one", () => {
  const routes = declaredRoutes();
  const webhook = routes.find((route) => route.path === "/billing/webhook");
  assert.ok(webhook, "the payment webhook must exist");
  // Платёжный провайдер не должен упираться в лимит, общий с анонимными запросами.
  assert.match(webhook.chain, /webhookLimiter/, "the webhook needs webhookLimiter");
  assert.doesNotMatch(webhook.chain, /apiLimiter/);
});

test("the global budget is installed before any route", () => {
  const directive = /^app\.use\(apiLimiter\);$/m.exec(source);
  assert.ok(directive, "app.use(apiLimiter) must exist as a directive, not only in a comment");
  const firstRoute = /app\.(get|post|put|patch|delete)\(/.exec(source);
  assert.ok(firstRoute, "routes must exist");
  assert.ok(directive.index < firstRoute.index, "a route declared before the global limiter would be unlimited");
});

test("every limiter answers with a machine code, not only prose", () => {
  // Клиент должен уметь отличить лимит от прочих 429: без кода ответ нельзя перевести.
  const helper = source.slice(source.indexOf("function rateLimitedHandler"), source.indexOf("const apiLimiter"));
  assert.match(helper, /code:\s*"rate_limited"/, "the shared handler must carry the code");
  assert.match(helper, /retryAfterSeconds/, "the client needs to know how long to wait");

  // Ни один лимитер не должен отвечать своим обработчиком без кода. Значение после
  // `handler:` может быть и стрелочной функцией, поэтому строки разбираются построчно.
  const handlers = source
    .split(String.fromCharCode(10))
    .filter((line) => line.trim().startsWith("handler:"))
    .map((line) => line.trim().slice("handler:".length).trim());
  assert.ok(handlers.length > 0, "limiters must declare handlers");
  const withoutHelper = handlers.filter((value) => !/^rateLimitedHandler\(/.test(value));
  assert.deepEqual(withoutHelper, [], `limiters bypassing the shared handler: ${withoutHelper.join(" | ")}`);
});
