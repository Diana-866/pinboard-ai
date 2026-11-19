"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * No route may ship without an authentication guard by accident.
 *
 * Every route in index.js is parsed and classified: it either carries
 * requireAuth (or an admin guard), or it appears in the explicit public allowlist
 * below. Adding a route without a guard therefore fails this test instead of
 * exposing customer data, and the allowlist makes every public endpoint a
 * deliberate, reviewable decision.
 *
 * The allowlist is also compared as an exact set, so removing an entry or adding
 * one has to be done here, in the diff, with its reason.
 */

const ROUTE_SCANNER = /app\.(get|post|put|patch|delete)\(/g;
// The handler chain of one route, up to the request handler itself.
const HANDLER_START = /(?:async\s*)?\(\s*req\s*,\s*res\s*\)|(?:async\s*)?req\s*=>|function\s*\(\s*req\s*,\s*res\s*\)/;
const MAX_ROUTE_WINDOW = 2000;

/**
 * Public by design, with the reason each one is safe:
 *
 * - liveness/readiness: platform probes must work without credentials;
 * - registration/login/recovery: the entry points that create authentication,
 *   each bounded by its own rate limiter;
 * - public price catalogues: static data, verified to touch no database;
 * - payment webhook: authenticated by the provider's signature, not by a JWT;
 * - dev credit top-up: fail-closed helper that refuses to run outside explicit
 *   development/test.
 */
const PUBLIC_ROUTES = new Map([
  ["get /", "service banner, no data"],
  ["get /health", "liveness probe"],
  ["get /ready", "readiness probe"],
  ["get /billing/health", "payments readiness probe"],
  ["get /billing/plans", "public price catalogue"],
  ["get /billing/credit-packs", "public price catalogue"],
  ["post /register", "creates the session it returns"],
  ["post /login", "creates the session it returns"],
  ["post /verify-email", "consumes a one-time token"],
  ["post /resend-verification", "bounded by the email rate limiter"],
  ["post /forgot-password", "bounded by the reset rate limiter"],
  ["post /reset-password", "consumes a one-time token"],
  ["post /billing/webhook", "provider-signature authenticated"],
  ["post /credits/dev-topup", "refuses to run outside explicit dev/test"],
]);

function parseRoutes(source) {
  const routes = [];
  for (const match of source.matchAll(ROUTE_SCANNER)) {
    const start = match.index;
    const window = source.slice(start, start + MAX_ROUTE_WINDOW);
    const pathMatch = /^app\.\w+\(\s*["'`]([^"'`]+)["'`]/.exec(window);
    if (!pathMatch) continue;
    const handlerStart = HANDLER_START.exec(window);
    const chain = handlerStart ? window.slice(0, handlerStart.index) : window;
    routes.push({
      key: `${match[1].toLowerCase()} ${pathMatch[1]}`,
      guarded: /requireAuth|requireAdmin|ensureAdmin/.test(chain),
    });
  }
  return routes;
}

const source = fs.readFileSync(path.resolve(__dirname, "..", "index.js"), "utf8");
const routes = parseRoutes(source);

test("the route scanner sees the whole API surface", () => {
  assert.ok(routes.length >= 70, `expected the full route surface, parsed ${routes.length}`);
  // Guards must actually be detected, otherwise the allowlist check is vacuous.
  assert.ok(routes.filter((route) => route.guarded).length >= 55);
});

test("every route is authenticated or explicitly public", () => {
  const unguarded = routes
    .filter((route) => !route.guarded && !PUBLIC_ROUTES.has(route.key))
    .map((route) => route.key);
  assert.deepEqual(
    unguarded,
    [],
    `routes without requireAuth that are not in the public allowlist:\n${unguarded.join("\n")}`
  );
});

test("the public allowlist matches the code exactly", () => {
  const publicInCode = new Set(
    routes.filter((route) => !route.guarded).map((route) => route.key)
  );
  const stale = [...PUBLIC_ROUTES.keys()].filter((key) => !publicInCode.has(key));
  assert.deepEqual(stale, [], `allowlist entries that no longer exist:\n${stale.join("\n")}`);

  const undocumented = [...publicInCode].filter((key) => !PUBLIC_ROUTES.has(key));
  assert.deepEqual(undocumented, [], `public routes missing from the allowlist:\n${undocumented.join("\n")}`);
});

test("no public route is one that returns customer data", () => {
  // A cheap semantic guard: these path shapes must never become public.
  const forbidden = /\/(me|projects|boards|pins|schedule|analytics|admin|review-queue)(\/|$)/;
  for (const key of PUBLIC_ROUTES.keys()) {
    const pathPart = key.split(" ")[1];
    assert.doesNotMatch(pathPart, forbidden, `${key} must not be public`);
  }
});

test("every public mutation is rate limited or signature authenticated", () => {
  // Credential endpoints are the brute-force surface: each public POST must name a
  // limiter in its handler chain, except the provider webhook, which carries no
  // session and is rejected unless the signature matches.
  const limited = new Set(["/billing/webhook"]);
  const unguardedPosts = [];
  for (const match of source.matchAll(ROUTE_SCANNER)) {
    const window = source.slice(match.index, match.index + MAX_ROUTE_WINDOW);
    const pathMatch = /^app\.\w+\(\s*["'`]([^"'`]+)["'`]/.exec(window);
    if (!pathMatch || match[1].toLowerCase() !== "post") continue;
    if (!PUBLIC_ROUTES.has(`post ${pathMatch[1]}`)) continue;
    if (limited.has(pathMatch[1])) continue;
    const handlerStart = HANDLER_START.exec(window);
    const chain = handlerStart ? window.slice(0, handlerStart.index) : window;
    if (!/Limiter|rateLimit/.test(chain)) unguardedPosts.push(pathMatch[1]);
  }
  assert.deepEqual(unguardedPosts, [], `public mutation routes without a limiter:\n${unguardedPosts.join("\n")}`);
});
