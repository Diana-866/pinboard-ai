"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * The backend hands the UI three kinds of URL: the paywall's `upgrade_url`, the payment success
 * redirect, and the links inside transactional emails. None of them were checked against the
 * router, and one of them was dead: `/pricing` was offered to every customer whose plan expired,
 * while the router only knew `/`, `/login`, `/app/*` and a handful of pages, so the catch-all
 * dropped that customer on the marketing landing page.
 *
 * This guard reads the routes the router actually declares and the URLs the backend actually
 * emits, and fails on a path nobody serves.
 */

const BACKEND = path.join(__dirname, "..");
const FRONTEND_SRC = path.join(BACKEND, "..", "frontend", "src");

/** Paths the backend builds, and the backend file that builds them. */
const EMITTED = [
  { file: "tariff.js", path: "/pricing", why: "the paywall tells an expired customer where to go" },
  { file: "billing.js", path: "/app", why: "urlSuccess after a successful payment" },
  { file: "email-verify.js", path: "/verify-email", why: "the verification link in an email" },
  { file: "password-reset.js", path: "/reset-password", why: "the reset link in an email" },
];

function routerSource() {
  return fs.readFileSync(path.join(FRONTEND_SRC, "App.tsx"), "utf8");
}

function declaredRoutes() {
  const source = routerSource();
  return [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]);
}

test("the router declares the routes the backend sends people to", () => {
  const routes = declaredRoutes();
  assert.ok(routes.length >= 8, `expected the router to declare its routes, found ${routes.join(", ")}`);

  for (const { file, path: target, why } of EMITTED) {
    const backend = fs.readFileSync(path.join(BACKEND, file), "utf8");
    // Either a plain path or a path appended to an origin built at runtime.
    const emits = backend.includes(`"${target}`) || backend.includes(`}/` + target.replace(/^\//, ""));
    assert.ok(emits, `${file} must still emit ${target}`);

    const served = routes.some((route) => route === target || (route.endsWith("/*") && target.startsWith(route.slice(0, -2))));
    assert.ok(served, `${file} sends users to ${target} (${why}) but the router serves ${routes.join(", ")}`);
  }
});

test("an in-app deep link only names tabs the app really has", () => {
  const source = routerSource();
  const tabs = /const APP_TABS = \[([^\]]+)\]/.exec(source);
  assert.ok(tabs, "the app must declare the tabs a deep link may select");
  const known = [...tabs[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(known.length >= 5, "the tab list must not be empty");

  // The tab the backend's upgrade_url relies on must be one of them.
  const pricingRoute = /path="\/pricing"/.test(source);
  assert.ok(pricingRoute, "/pricing must be a real route");
  assert.match(source, /Navigate to="\/app\?tab=pricing"/, "/pricing must hand the app its pricing tab");
  assert.ok(known.includes("pricing"), `pricing must be a known tab, got ${known.join(", ")}`);

  // Every tab the app can select by URL must also exist as a rendered section, otherwise the
  // deep link lands on an empty screen.
  for (const tab of known) {
    assert.match(source, new RegExp(`activeTab === '${tab}'`), `tab ${tab} is selectable but nothing renders it`);
  }

  // An unknown value must be ignored rather than trusted: the URL comes from outside.
  assert.match(
    source,
    /if \(!APP_TABS\.includes\(requested\)\) return;/,
    "a deep link must be validated against the known tabs"
  );
});

test("the success redirect keeps the query the app reads", () => {
  // App.tsx switches to the pricing tab on ?payment=success. Moving the redirect or the reader
  // without the other would silently return the customer to the dashboard after paying.
  const billing = fs.readFileSync(path.join(BACKEND, "billing.js"), "utf8");
  assert.match(billing, /urlSuccess: `\$\{frontendBase\(\)\}\/app\?payment=success`/);
  assert.match(routerSource(), /params\.get\('payment'\) !== 'success'/);
});
