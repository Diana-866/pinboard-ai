"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidSchedulerSecret } = require("../schedulerAuth");

const secret = "pinposy-scheduler-secret-0123456789";

test("scheduler secret accepts only an exact match of a strong configured secret", () => {
  assert.equal(isValidSchedulerSecret(secret, secret), true);
  assert.equal(isValidSchedulerSecret(secret, secret + "x"), false);
  assert.equal(isValidSchedulerSecret(secret, secret.slice(0, -1)), false);
  assert.equal(isValidSchedulerSecret(secret, "x".repeat(secret.length)), false);
});

test("scheduler secret rejects missing, short, and whitespace-padded configured secrets", () => {
  assert.equal(isValidSchedulerSecret("", secret), false);
  assert.equal(isValidSchedulerSecret("short", "short"), false);
  assert.equal(isValidSchedulerSecret(secret, ""), false);
  assert.equal(isValidSchedulerSecret(secret, ` ${secret}`), false);
});

test("scheduler secret compares UTF-8 byte lengths safely", () => {
  assert.equal(isValidSchedulerSecret(secret, "é".repeat(secret.length)), false);
  assert.equal(isValidSchedulerSecret("é".repeat(20), "é".repeat(20)), true);
});
