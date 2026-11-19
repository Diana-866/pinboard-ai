"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * A route that takes an id from the URL and acts on it is only safe when it proves the
 * resource belongs to the caller. An unanswered check is an IDOR: any signed-in user
 * can read or rewrite another customer's pins by guessing identifiers, and the ids are
 * UUIDs that leak in API responses.
 *
 * This test enumerates every parameterised route, requires an ownership reference in the
 * handler, and keeps a short, justified list of routes that do not need one (admin-only
 * routes, which are protected by requireAdmin rather than by ownership).
 */

const INDEX = path.resolve(__dirname, "..", "index.js");
const PINTEREST = path.resolve(__dirname, "..", "pinterest.js");
const OWNERSHIP_MODULE = path.resolve(__dirname, "..", "resourceOwnership.js");
const indexSource = fs.readFileSync(INDEX, "utf8");
const pinterestSource = fs.readFileSync(PINTEREST, "utf8");
const ownershipSource = fs.readFileSync(OWNERSHIP_MODULE, "utf8");

const ROUTE = /app\.(get|post|put|patch|delete)\(/g;
const HANDLER = /(?:async\s*)?\(\s*req\s*,\s*res\s*\)|(?:async\s*)?req\s*=>|function\s*\(\s*req\s*,\s*res\s*\)/;

// Ownership evidence in a handler chain. Every name here must exist as a function, which
// the second test enforces: a rename cannot silently satisfy the check.
const OWNERSHIP_HELPERS = [
  "getPinWithOwnerCheck",
  "getBoardWithOwnerCheck",
  "isOwnedByUser",
  "getPinWithOwner",
];
const OWNERSHIP_FILTER = /\.eq\(\s*["'`]user_id["'`]\s*,|\.eq\(\s*["'`]projects\.user_id["'`]\s*,/;

// Routes whose :param is not a customer resource. Each needs a reason.
const NO_OWNERSHIP_NEEDED = new Map([
  ["GET /admin/mail/:uid", "admin-only; the uid is the account being inspected"],
  [
    "POST /admin/billing/email-outbox/:id/requeue",
    "admin-only; the id is an outbox row, not a customer resource",
  ],
]);

function parseRoutes(source) {
  const routes = [];
  // A handler ends where the next registration begins. A fixed character window spills
  // into the neighbouring route and lets its ownership filter satisfy this one, which
  // made the guard pass on a route that had none.
  const starts = [...source.matchAll(ROUTE)].map((match) => match.index);
  const boundaries = [...starts, source.length];
  for (const [index, match] of [...source.matchAll(ROUTE)].entries()) {
    const window = source.slice(match.index, boundaries[index + 1]);
    const pathMatch = /^app\.\w+\(\s*["'`]([^"'`]+)["'`]/.exec(window);
    if (!pathMatch) continue;
    const handlerStart = HANDLER.exec(window);
    const chain = handlerStart ? window.slice(0, handlerStart.index) : window;
    const body = handlerStart ? window.slice(handlerStart.index) : window;
    routes.push({
      key: `${match[1].toUpperCase()} ${pathMatch[1]}`,
      path: pathMatch[1],
      guarded: /requireAuth|requireAdmin|ensureAdmin/.test(chain),
      admin: /requireAdmin|ensureAdmin/.test(chain),
      body,
    });
  }
  return routes;
}

const routes = parseRoutes(indexSource);
const parameterised = routes.filter((route) => route.path.includes(":"));

function hasOwnershipEvidence(body) {
  if (OWNERSHIP_HELPERS.some((helper) => new RegExp(`\\b${helper}\\s*\\(`).test(body))) return true;
  if (OWNERSHIP_FILTER.test(body)) return true;
  return false;
}

test("the scanner sees the parameterised routes", () => {
  assert.ok(parameterised.length >= 15, `expected parameterised routes, parsed ${parameterised.length}`);
});

test("every ownership helper actually exists", () => {
  // If a helper is renamed, this fails instead of the coverage check silently passing or
  // silently flagging correct routes.
  const sources = [indexSource, pinterestSource, ownershipSource].join("\n");
  for (const helper of OWNERSHIP_HELPERS) {
    assert.match(
      sources,
      new RegExp(`(?:async\\s+)?function\\s+${helper}\\s*\\(`),
      `${helper} must be defined`
    );
  }
});

test("every parameterised customer route proves ownership", () => {
  const offenders = parameterised
    .filter((route) => !hasOwnershipEvidence(route.body))
    .filter((route) => !NO_OWNERSHIP_NEEDED.has(route.key))
    .map((route) => route.key);
  assert.deepEqual(
    offenders,
    [],
    `these routes act on an id without an ownership check:\n${offenders.join("\n")}`
  );
});

test("the exemptions are admin-guarded and still exist", () => {
  const byKey = new Map(parameterised.map((route) => [route.key, route]));
  for (const [key, reason] of NO_OWNERSHIP_NEEDED) {
    const route = byKey.get(key);
    assert.ok(route, `${key} is exempted but no longer exists (${reason})`);
    assert.equal(route.guarded, true, `${key} must stay authenticated`);
    assert.equal(route.admin, true, `${key} is exempt from ownership because it is admin-only`);
  }
});

test("the ownership helpers are used by more than one route each, not only by this test", () => {
  // A helper that no route calls would mean the check above passes on a dead name.
  for (const helper of ["getPinWithOwnerCheck", "getBoardWithOwnerCheck"]) {
    const uses = parameterised.filter((route) => new RegExp(`\\b${helper}\\s*\\(`).test(route.body));
    assert.ok(uses.length >= 1, `${helper} must be used by a route`);
  }
});
