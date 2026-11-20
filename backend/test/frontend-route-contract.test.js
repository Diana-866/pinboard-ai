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
    // URLs built from the single owner of the API base (lib/api.ts) are real calls even when they
    // are returned from a helper instead of passed to fetch inline. Without this rule the image
    // upload left the contract entirely as soon as its URL moved into a function.
    for (const match of source.matchAll(/`\$\{(?:API_URL|API)\}([^`]+)`/g)) add(match[1]);
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
    .filter((key) => !registered.has(key))
    .sort()
    .map((key) => `${key} <- ${[...called.get(key)].join(", ")}`);
  assert.deepEqual(missing, [], `frontend calls with no backend route:\n${missing.join("\n")}`);
});

test("the URL builder is parsed, so a path built in a helper is still a call", () => {
  // The image upload builds its URL in lib/api.ts and hands it to a function, not to fetch
  // directly. This asserts the rule that reads such builders, so the path cannot fall out of the
  // contract again the next time the call moves.
  assert.equal(called.has("/pins/:x/image"), true, "the image upload path must be parsed from its builder");
  assert.ok(
    [...(called.get("/pins/:x/image") || [])].some((file) => file === "lib/api.ts"),
    `the upload path must be attributed to lib/api.ts, found ${[...(called.get("/pins/:x/image") || [])].join(", ")}`
  );
});

test("the interesting resources are covered in both directions", () => {
  // Sampling the contract keeps the two parsers honest: a broken regex on either side
  // would empty one set and make the comparison vacuous.
  for (const key of ["/me", "/projects", "/boards", "/pins/:x", "/pins/:x/image", "/schedule", "/review-queue"]) {
    assert.equal(called.has(key), true, `frontend should call ${key}`);
    assert.equal(registered.has(key), true, `backend should register ${key}`);
  }
});
