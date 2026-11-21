"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { looksLikePlaceholder, unresolvedMailPlaceholders } = require("../mail");

/**
 * Section 155. `MAIL_SMTP_HOST=smtp.<provider>` is 15 characters long, so it passes every
 * "is it filled?" check and fails only while sending a letter — as a nameless
 * `email-verify.event_004`. These tests pin the difference between "filled" and "real".
 */

test("a value that only looks filled is recognised as a placeholder", () => {
  const placeholders = [
    "smtp.<provider>",
    "smtp.example.com",
    "changeme",
    "your-smtp-host",
    "placeholder",
    "",
    "   ",
    null,
    undefined,
  ];
  for (const value of placeholders) {
    assert.equal(looksLikePlaceholder(value), true, `${JSON.stringify(value)} must count as a placeholder`);
  }
});

test("a real configuration is not accused", () => {
  const real = ["smtp.yandex.ru", "support@pinposy.com", "abcd efgh ijkl mnop", "smtp-relay.brevo.com"];
  for (const value of real) {
    assert.equal(looksLikePlaceholder(value), false, `${JSON.stringify(value)} must not count as a placeholder`);
  }
});

test("every transactional variable is checked, not just the host", () => {
  const env = {
    MAIL_SMTP_HOST: "smtp.yandex.ru",
    MAIL_SMTP_USER: "support@pinposy.com",
    MAIL_SMTP_PASS: "real-secret-value",
    MAIL_FROM: "PinPosy <support@pinposy.com>",
  };
  assert.deepEqual(unresolvedMailPlaceholders(env), []);
  assert.deepEqual(unresolvedMailPlaceholders({ ...env, MAIL_SMTP_HOST: "smtp.<provider>" }), ["MAIL_SMTP_HOST"]);
  assert.deepEqual(unresolvedMailPlaceholders({ ...env, MAIL_SMTP_PASS: "" }), ["MAIL_SMTP_PASS"]);
  assert.deepEqual(
    unresolvedMailPlaceholders({ ...env, MAIL_FROM: "PinPosy <support@example.com>" }),
    ["MAIL_FROM"]
  );
});

test("startup reports the placeholders instead of staying silent", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(indexSource, /unresolvedMailPlaceholders\(\)/);
  assert.match(indexSource, /mail\.config_placeholder/);
});
