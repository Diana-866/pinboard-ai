"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Safety contract for scripts/verify-sql-windows.ps1.
 *
 * This is the one script that can create and drop databases on the owner's
 * machine, so its guard rails are asserted rather than trusted by inspection:
 * it may only talk to a loopback server, it must never accept a password as an
 * argument (the secret stays interactive and out of shell history), it must only
 * drop the database it created, and it must refuse a non-contiguous migration
 * chain instead of replaying a partial schema.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(ROOT, "scripts", "verify-sql-windows.ps1");
const script = fs.readFileSync(scriptPath, "utf8");

test("the SQL gate never accepts a password parameter", () => {
  const paramBlock = script.slice(script.indexOf("param("), script.indexOf("$ErrorActionPreference"));
  assert.doesNotMatch(paramBlock, /\$Password\b/i, "the password must not be a script parameter");
  assert.match(script, /Read-Host -AsSecureString/, "the password is read interactively");
  assert.match(script, /\$env:PGPASSWORD = \$PlainPassword/);
  assert.match(script, /\$env:PGPASSWORD = \$null/, "the in-process credential copy is cleared");
});

test("it refuses to run against anything but a local server", () => {
  assert.match(script, /-notin @\("127\.0\.0\.1", "localhost", "::1"\)/);
  assert.match(script, /Refusing to run against a non-loopback host/);
});

test("it only creates and drops its own uniquely named database", () => {
  assert.match(script, /\$DatabaseName = "pinposy_verify_\$suffix"/);
  assert.match(script, /drop database if exists/);
  // The script must never drop anything else, and must not use PIN_TRIAL.
  const drops = [...script.matchAll(/drop database[^"']*/gi)].map((match) => match[0].toLowerCase());
  assert.ok(drops.length >= 1);
  for (const drop of drops) {
    assert.doesNotMatch(drop, /pin_trial|postgres\b(?!\s*`")/i);
  }
  assert.doesNotMatch(script, /pinposy_test/i, "the shared CI database name must not be reused");
});

test("cleanup runs even when a migration fails", () => {
  assert.match(script, /finally\s*\{/);
  const finallyBlock = script.slice(script.lastIndexOf("finally {"));
  assert.match(finallyBlock, /Remove-DisposableDatabase|KeepDatabase/);
});

test("a non-contiguous migration chain is refused instead of partially replayed", () => {
  assert.match(script, /Migration chain is not contiguous/);
  assert.match(script, /\$expected = 10/);
  assert.match(script, /Where-Object \{ \$_.Number -ge 10 \}/);
});

test("the suite comes from the CI workflow with a floor, not a hand-kept list", () => {
  assert.match(script, /atomic-payment-integration\.yml/);
  assert.match(script, /if \(\$ordered\.Count -lt 40\)/);
  assert.match(script, /CI references a missing SQL file/);
});

test("the grant precondition before migration 039 is preserved", () => {
  assert.match(script, /if \(\$migration\.Number -eq 39\)/);
  assert.match(script, /grant all on public\.pinterest_accounts, public\.pinterest_publications to anon, authenticated/);
});
