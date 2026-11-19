"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * The frontend is the only client of this backend, and a call to a path that no longer
 * exists fails quietly at runtime: the feature simply stops working and the UI shows a
 * generic error. Comparing the paths the frontend actually calls with the routes the
 * backend registers catches that rename/refactor drift without running either side.
 *
 * Method matching is intentionally not attempted: the interesting failure is a path that
 * disappeared, and a path is called with exactly one method in practice.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const FRONTEND_SRC = path.join(ROOT, "frontend", "src");
const BACKEND_FILES = [
  path.join(ROOT, "backend", "index.js"),
  path.join(ROOT, "backend", "pinterest.js"),
  path.join(ROOT, "backend", "billing.js"),
  path.join(ROOT, "backend", "mail.js"),
];

// A concrete client-side path whose prefix is assembled at runtime (`"/pins/" + id`)
// normalises to a bare prefix and has no route of its own.
const RUNTIME_PREFIX_PATHS = new Map([
  ["/pins", "built as '/pins/' + pinId in the approval desk"],
]);

function normalize(rawPath) {
  return String(rawPath)
    .replace(/\$\{[^}]+\}/g, ":x")
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ":x")
    .replace(/\?.*$/, "")
    .replace(/\/+$/, "");
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

function frontendPaths() {
  const paths = new Map();
  for (const file of walk(FRONTEND_SRC)) {
    const source = fs.readFileSync(file, "utf8");
    const add = (raw) => {
      if (!raw || !raw.startsWith("/")) return;
      const key = normalize(raw);
      if (!key) return;
      if (!paths.has(key)) paths.set(key, new Set());
      paths.get(key).add(path.relative(FRONTEND_SRC, file).replace(/\\/g, "/"));
    };
    for (const match of source.matchAll(/apiRequest\(\s*[`'"]([^`'"]+)[`'"]/g)) add(match[1]);
    for (const match of source.matchAll(/fetch\(\s*(?:API\s*\+\s*)?[`'"]([^`'"]*\/[^`'"]*)[`'"]/g)) add(match[1]);
    for (const match of source.matchAll(/fetch\(\s*`\$\{[^}]+\}([^`]+)`/g)) add(match[1]);
  }
  return paths;
}

function backendRoutes() {
  const routes = new Set();
  for (const file of BACKEND_FILES) {
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g)) {
      routes.add(normalize(match[1]));
    }
  }
  return routes;
}

const called = frontendPaths();
const registered = backendRoutes();

test("both sides of the contract were parsed", () => {
  assert.ok(called.size >= 40, `expected the frontend call surface, found ${called.size}`);
  assert.ok(registered.size >= 60, `expected the backend route surface, found ${registered.size}`);
});

test("every path the frontend calls exists on the backend", () => {
  const missing = [...called.keys()]
    .filter((key) => !registered.has(key) && !RUNTIME_PREFIX_PATHS.has(key))
    .sort()
    .map((key) => `${key} <- ${[...called.get(key)].join(", ")}`);
  assert.deepEqual(missing, [], `frontend calls with no backend route:\n${missing.join("\n")}`);
});

test("the runtime-prefix exemptions are real prefixes, not silently lost routes", () => {
  for (const [key, reason] of RUNTIME_PREFIX_PATHS) {
    assert.equal(called.has(key), true, `${key} is exempted (${reason}) but the frontend no longer calls it`);
    assert.equal(registered.has(key), false, `${key} now has a real route; drop the exemption`);
  }
});

test("the interesting resources are covered in both directions", () => {
  // Sampling the contract keeps the two parsers honest: a broken regex on either side
  // would empty one set and make the comparison vacuous.
  for (const key of ["/me", "/projects", "/boards", "/pins/:x", "/schedule", "/review-queue"]) {
    assert.equal(called.has(key), true, `frontend should call ${key}`);
    assert.equal(registered.has(key), true, `backend should register ${key}`);
  }
});
