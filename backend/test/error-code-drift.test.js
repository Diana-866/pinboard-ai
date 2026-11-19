"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Localization only works if the two halves agree: the backend emits a machine code, the client
 * recognises it. Each class of failure has its own test, but nothing noticed a *new* code that
 * nobody mapped - the customer simply reads Russian. This guard compares the whole emitted set
 * against the whole client set in both directions:
 *
 *  - every code the backend can put on the wire is either mentioned by the frontend or listed in
 *    RUSSIAN_ONLY below with a reason;
 *  - every exemption must still be real: the code is still emitted and still not mentioned, so a
 *    stale exemption cannot hide a later regression;
 *  - every code the client maps must still be emitted somewhere, so a mapping cannot rot;
 *  - a short sample must be found on both sides, so a broken scanner cannot make this vacuous.
 *
 * Codes built from variables cannot be seen by a scanner; the emitted set is therefore a lower
 * bound, which is why this guard fails on codes it *does* see rather than claiming completeness.
 */

const BACKEND = path.join(__dirname, "..");
const FRONTEND_SRC = path.join(BACKEND, "..", "frontend", "src");

const CODE_CALLS = /\b(notFoundError|conflictError|validationError|insufficientCreditsError|paymentProviderUnavailable|paymentLinkNotSaved|paymentOrderPreparationFailed|pinterestTransientError|withCode)\(\s*(?:error,\s*)?["']([a-z0-9_]+)["']/g;
const PAYMENT_ERROR_CALL = /\bpaymentError\(\s*[^,]+,\s*[^,]+,\s*["']([a-z0-9_]+)["']/g;
// `code:` but not `p_error_code:` or `reasonCode:` - a SQL parameter is not a client code.
const JSON_CODE_CALL = /(?<![_a-zA-Z])code:\s*["']([a-z0-9_]+)["']/g;

/**
 * Codes that intentionally never reach the client as a code, with the reason.
 * A reason is not decoration: the exemption is asserted to still be true.
 */
const RUSSIAN_ONLY = {
  rate_limited: "the request layer answers every 429 by status, with a localized wait message",
};

function emittedCodes() {
  const found = new Map();
  for (const name of fs.readdirSync(BACKEND).filter((file) => file.endsWith(".js"))) {
    const source = fs.readFileSync(path.join(BACKEND, name), "utf8");
    for (const pattern of [CODE_CALLS, PAYMENT_ERROR_CALL, JSON_CODE_CALL]) {
      for (const match of source.matchAll(pattern)) {
        const code = match[match.length - 1];
        if (!found.has(code)) found.set(code, new Set());
        found.get(code).add(name);
      }
    }
  }
  return found;
}

function frontendFiles(dir = FRONTEND_SRC, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) frontendFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

const EMITTED = emittedCodes();
const FRONTEND_TEXT = frontendFiles().map((file) => fs.readFileSync(file, "utf8")).join("\n");

function mentionedByFrontend(code) {
  return new RegExp("\\b" + code + "\\b").test(FRONTEND_TEXT);
}

test("the scanner really sees both sides", () => {
  // Without this, a broken pattern would make every other assertion below trivially true.
  assert.ok(EMITTED.size >= 25, `expected a substantial set of codes, found ${EMITTED.size}`);
  for (const code of ["project_not_found", "insufficient_credits", "tariff_required", "payment_link_not_saved", "pinterest_unavailable"]) {
    assert.ok(EMITTED.has(code), `${code} must be found on the backend`);
    assert.ok(mentionedByFrontend(code), `${code} must be found on the client`);
  }
  assert.ok(frontendFiles().length >= 50, "the frontend scan must walk the whole source tree");
});

test("every code the backend can send is either mapped by the client or exempted with a reason", () => {
  const unhandled = [];
  for (const [code, files] of EMITTED) {
    if (mentionedByFrontend(code)) continue;
    if (Object.prototype.hasOwnProperty.call(RUSSIAN_ONLY, code)) continue;
    unhandled.push(`${code} (${[...files].join(", ")})`);
  }
  assert.deepEqual(
    unhandled,
    [],
    `these codes reach the customer in Russian because nothing on the client maps them: ${unhandled.join("; ")}`
  );
});

test("each exemption is still real and still has a reason", () => {
  for (const [code, reason] of Object.entries(RUSSIAN_ONLY)) {
    assert.ok(typeof reason === "string" && reason.trim().length > 10, `${code} needs a written reason`);
    assert.ok(EMITTED.has(code), `${code} is exempted but no longer emitted: drop the exemption`);
    assert.equal(mentionedByFrontend(code), false, `${code} is exempted but the client mentions it: drop the exemption`);
  }

  // The single exemption claims the client handles 429 by status. Prove it, or the exemption is
  // a lie that keeps a customer-facing failure untranslated.
  const resilience = fs.readFileSync(path.join(FRONTEND_SRC, "lib", "apiResilience.ts"), "utf8");
  assert.match(resilience, /export function getRateLimitMessage/, "429 must be localized by status");
  const api = fs.readFileSync(path.join(FRONTEND_SRC, "lib", "api.ts"), "utf8");
  assert.match(api, /status === 429[\s\S]{0,400}getRateLimitMessage/, "the request layer must use it on 429");
});

test("every code the client maps is still emitted by the backend", () => {
  const source = fs.readFileSync(path.join(FRONTEND_SRC, "i18n", "appErrorCopy.ts"), "utf8");
  const mapped = [...source.matchAll(/^\s{2}([a-z][a-z0-9_]*):\s*['"]/gm)].map((match) => match[1]);
  assert.ok(mapped.length >= 20, `expected the client to map many codes, found ${mapped.length}`);

  const dead = mapped.filter((code) => !EMITTED.has(code));
  assert.deepEqual(dead, [], `the client still maps codes the backend never sends: ${dead.join(", ")}`);
});

test("the generation codes are mapped at 409, where the backend sends them", () => {
  const source = fs.readFileSync(path.join(FRONTEND_SRC, "i18n", "appErrorCopy.ts"), "utf8");
  const block = /const GENERATION_CODES[\s\S]*?\};/.exec(source);
  assert.ok(block, "the generation map must exist");
  for (const code of ["generation_outcome_unknown", "regeneration_outcome_unknown"]) {
    assert.ok(block[0].includes(code), `${code} must be mapped`);
  }
  assert.match(source, /Number\(status\) === 409 && Object\.prototype\.hasOwnProperty\.call\(GENERATION_CODES/);

  // And the backend really answers those codes with 409.
  const index = fs.readFileSync(path.join(BACKEND, "index.js"), "utf8");
  for (const code of ["generation_outcome_unknown", "regeneration_outcome_unknown"]) {
    const pattern = new RegExp(`res\\.status\\(409\\)\\.json\\(\\{[^}]*${code}`);
    assert.match(index, pattern, `${code} must be a 409`);
  }
});
