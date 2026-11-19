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

test("the static SQL check runs before the password prompt", () => {
  const preflightIndex = script.indexOf("Static pre-flight");
  const promptIndex = script.indexOf("Read-Host -AsSecureString");
  assert.ok(preflightIndex > 0, "the pre-flight section must exist");
  assert.ok(promptIndex > 0);
  assert.ok(preflightIndex < promptIndex, "a broken SQL file must be reported without a password");
  assert.match(script, /scripts\/lib\/sql-lexer\.cjs/);
});

test("stderr from psql is stringified instead of printed as a RemoteException", () => {
  assert.doesNotMatch(script, /@\(& \$PsqlPath @arguments 2>&1\)/);
  assert.match(script, /& \$PsqlPath @arguments 2>&1 \| ForEach-Object \{ "\$_" \}/);
});

test("-KeepGoing collects every failure instead of hiding them behind the first", () => {
  assert.match(script, /\[switch\]\$KeepGoing/);
  assert.match(script, /if \(-not \$KeepGoing\) \{\s*Fail "SQL integration file failed/);
  assert.match(script, /\$failed\.Add\(\$name\)/);
  assert.match(script, /SQL integration file\(s\) failed/);
});

test('the static pre-flight also refuses a mistyped PL/pgSQL variable', () => {
  assert.match(script, /sql-plpgsql-vars[.]cjs/);
  assert.match(script, /findUndeclaredVariables/);
  assert.match(script, /is used but never declared/);
});

test("the optional concurrency phase keeps the safety preflight intact", () => {
  assert.match(script, /\[switch\]\$Concurrency/);
  // The shared library requires these; they must point at the disposable database.
  assert.match(script, /\$env:PGDATABASE = \$ConcurrencyDatabaseName/);
  assert.match(script, /\$env:PINPOSY_ALLOW_DISPOSABLE_DB_TESTS = "1"/);
  assert.match(script, /\$env:PINPOSY_ALLOW_DISPOSABLE_DB_TESTS = \$null/, "the opt-in is cleared afterwards");
  // The list comes from the runner with a floor, so a partial suite cannot pass.
  assert.match(script, /run-disposable-concurrency-suite\.sh/);
  assert.match(script, /if \(\$concurrencyScripts\.Count -lt 10\)/);
  // The password must never be placed on a command line: the only allowed uses are
  // assignments to PGPASSWORD (and its clearing).
  const passwordUsages = script.split("\n").filter((line) => line.includes("$PlainPassword"));
  assert.ok(passwordUsages.length >= 1);
  for (const line of passwordUsages) {
    assert.match(
      line.trim(),
      /^\$env:PGPASSWORD = \$PlainPassword$|^Remove-Variable PlainPassword -ErrorAction SilentlyContinue$|^\$PlainPassword = \$credential\.GetNetworkCredential\(\)\.Password$|^\$PlainPassword = \$null$|^if \(\$PlainPassword\) \{$/,
      `unexpected use of the password: ${line.trim()}`
    );
  }
  assert.match(script, /-Concurrency needs bash/);
});

test("bash detection refuses the WSL launcher and smoke-tests every candidate", () => {
  // Get-Command bash resolves to C:\Windows\System32\bash.exe in a standalone
  // PowerShell session; on a machine without a WSL distribution that launcher only
  // prints an error and exits non-zero, so all ten concurrency tests "failed"
  // without ever running. The stub must be excluded and each candidate proven.
  assert.match(script, /-like "\*Windows\\System32\*"/);
  assert.match(script, /-like "\*Windows\\SysWOW64\*"/);
  assert.match(script, /PINPOSY_POSIX_SHELL_OK/);
  assert.match(script, /not a usable POSIX shell/);
  // A known Git-for-Windows location must be tried even when bash is not on PATH.
  assert.match(script, /Programs\\Git\\bin\\bash[.]exe/);
});

test("the static-check file count is computed by PowerShell, not parsed from stdout", () => {
  assert.match(script, /\$sqlFileCount = @\(Get-ChildItem/);
  assert.match(script, /Static SQL check OK \(\$sqlFileCount files\)/);
  assert.doesNotMatch(script, /\$staticCount/);
});

test("concurrency runs against a pristine clone, as CI does", () => {
  // The integration files leave rows behind (a hardcoded token hash in
  // auth-recovery-concurrency.sh collided with them). CI clones the freshly
  // migrated fixture before the destructive scenarios, so the clone must be taken
  // while the database is exactly "schema + migrations", i.e. before the files run.
  assert.match(script, /create database `"\$ConcurrencyDatabaseName`" template `"\$DatabaseName`"/);
  const cloneAt = script.indexOf("template `\"$DatabaseName`\"");
  const integrationAt = script.indexOf("SQL integration files, in CI order");
  assert.ok(cloneAt > 0 && integrationAt > 0);
  assert.ok(cloneAt < integrationAt, "the clone must be created before the SQL files run");
  assert.match(script, /pinposy_verify_conc_\$suffix/);
});

test("cleanup drops every database it created, the clone first", () => {
  assert.match(script, /function Remove-DisposableDatabases/);
  assert.match(script, /for \(\$index = \$CreatedDatabases\.Count - 1; \$index -ge 0; \$index -= 1\)/);
  assert.match(script, /\$CreatedDatabases\.Add\(\$DatabaseName\)/);
  assert.match(script, /\$CreatedDatabases\.Add\(\$ConcurrencyDatabaseName\)/);
  // A requested concurrency phase must not be skipped by -SkipIntegration.
  assert.match(script, /if \(\$Concurrency\) \{ Invoke-ConcurrencyPhase \}\n        return/);
});
