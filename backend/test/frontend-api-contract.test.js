"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Frontend <-> backend route contract.
 *
 * The frontend builds request paths as plain strings, so neither TypeScript nor
 * a backend unit test can notice that a route was renamed, removed or that a
 * page calls the wrong HTTP verb. The failure mode is a dead button in
 * production ("Не найдено"), not a compile error.
 *
 * This test parses every `apiRequest(...)` call site in `frontend/src` and every
 * route registered in `backend/*.js`, normalises dynamic segments and asserts
 * that each request matches a real method+path pair.
 *
 * It is intentionally static: it proves the contract, not the runtime behaviour.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const BACKEND_DIR = path.join(ROOT, "backend");
const FRONTEND_SRC = path.join(ROOT, "frontend", "src");

// Comments contain illustrative route snippets; they must never count as routes.
// A block comment is only recognised when it starts its own line: an inline `/*`
// inside a line comment or a string literal must not swallow the rest of a file.
function stripComments(source) {
  return source
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function backendRoutes() {
  const routes = [];
  for (const file of fs.readdirSync(BACKEND_DIR).filter((name) => name.endsWith(".js"))) {
    const source = stripComments(fs.readFileSync(path.join(BACKEND_DIR, file), "utf8"));
    const direct = /\bapp\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g;
    for (const match of source.matchAll(direct)) {
      routes.push({ file, method: match[1].toUpperCase(), route: match[2] });
    }
    // Admin refund routes are registered through a helper by literal path.
    const helper = /registerAdminProviderRefundRoute\(\s*[`'"]([^`'"]+)[`'"]/g;
    for (const match of source.matchAll(helper)) {
      routes.push({ file, method: "POST", route: match[1] });
    }
  }
  return routes;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

function frontendCalls() {
  const calls = [];
  for (const file of walk(FRONTEND_SRC)) {
    const source = stripComments(fs.readFileSync(file, "utf8"));
    const pattern = /apiRequest(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)[`'"]\s*(?:,\s*\{([\s\S]{0,400}?)\})?\s*\)/g;
    for (const match of source.matchAll(pattern)) {
      const options = match[2] || "";
      const method = /method:\s*[`'"]([A-Za-z]+)[`'"]/.exec(options);
      calls.push({
        file: path.relative(ROOT, file),
        method: (method ? method[1] : "GET").toUpperCase(),
        route: match[1],
      });
    }
  }
  return calls;
}

// `/boards/${id}/pins` and `/boards/:id/pins` must collapse to the same shape.
function normalizeRoute(route) {
  return route
    .split("?")[0]
    .replace(/\$\{[^}]*\}/g, ":param")
    .replace(/\/:[^/]+/g, ":param")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "");
}

test("every frontend API call matches a registered backend route", () => {
  const routes = backendRoutes();
  const calls = frontendCalls();

  // Guard against a silent extraction failure: these floors are far below the
  // current counts but far above zero.
  assert.ok(routes.length >= 80, `expected at least 80 backend routes, parsed ${routes.length}`);
  assert.ok(calls.length >= 60, `expected at least 60 apiRequest call sites, parsed ${calls.length}`);

  const known = new Set(routes.map((entry) => `${entry.method} ${normalizeRoute(entry.route)}`));
  const missing = calls
    .filter((call) => !known.has(`${call.method} ${normalizeRoute(call.route)}`))
    .map((call) => `${call.method} ${call.route} (${call.file})`);

  assert.deepEqual(missing, [], "frontend calls routes the backend does not register");
});

test("the backend does not register the same method+path twice", () => {
  const seen = new Map();
  for (const entry of backendRoutes()) {
    const key = `${entry.method} ${normalizeRoute(entry.route)}`;
    seen.set(key, [...(seen.get(key) || []), entry.file]);
  }
  const duplicates = [...seen]
    .filter(([, files]) => new Set(files).size > 1 || files.length > 1)
    .map(([key, files]) => `${key} in ${files.join(", ")}`);
  assert.deepEqual(duplicates, [], "duplicate route registrations shadow each other");
});

test("every backend route literal starts with a single leading slash", () => {
  // The root probe is legitimately `/`; every other route must be `/segment...`.
  const malformed = backendRoutes()
    .filter((entry) => entry.route !== "/" && !/^\/[^/]/.test(entry.route))
    .map((entry) => `${entry.method} ${entry.route} (${entry.file})`);
  assert.deepEqual(malformed, [], "route paths must start with exactly one slash");
});
