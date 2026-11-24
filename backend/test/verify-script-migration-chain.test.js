"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const scriptsDirectory = path.join(__dirname, "..", "..", "scripts");
const script = fs.readFileSync(path.join(scriptsDirectory, "verify.sh"), "utf8");
const windowsScript = fs.readFileSync(path.join(scriptsDirectory, "verify.ps1"), "utf8");

test("active repository migrations are contiguous from 010 through 167", () => {
  const migrationDirectory = path.join(__dirname, "..", "..", "db", "migrations");
  const actual = fs.readdirSync(migrationDirectory)
    .filter((name) => /^\d{3}_.+\.sql$/.test(name) && Number(name.slice(0, 3)) >= 10)
    .map((name) => name.slice(0, 3))
    .sort();
  const expected = Array.from({ length: 158 }, (_, index) => String(index + 10).padStart(3, "0"));
  assert.deepEqual(actual, expected);
});

test("Linux replay creates a unique disposable database without pre-dropping a name", () => {
  assert.match(script, /MIGRATION_DB_NAME="pinposy_verify_\$\{BASHPID:-\$\$\}_\$suffix"/);
  assert.match(script, /od -An -N4 -tx1 \/dev\/urandom/);
  assert.match(script, /CREATE DATABASE \\"\$MIGRATION_DB_NAME\\"/);
  assert.doesNotMatch(script, /DROP DATABASE IF EXISTS/);
  assert.ok(script.indexOf("CREATE DATABASE") < script.indexOf("MIGRATION_DB_CREATED=1"));
});

test("Linux replay only drops the database it successfully created", () => {
  assert.match(script, /if \(\(MIGRATION_DB_CREATED\)\); then[\s\S]*DROP DATABASE/);
  assert.match(script, /MIGRATION_DB_CREATED=0/);
});

test("Linux replay uses an explicit local socket and port, not inherited PGHOST or PGPORT", () => {
  assert.match(script, /psql -X -q -h \/var\/run\/postgresql -p "\$POSTGRES_PORT"/);
  assert.match(script, /--postgres-port/);
  assert.match(script, /POSTGRES_PORT=5432/);
});

test("Linux replay rejects incomplete or out-of-range migration sequences", () => {
  assert.match(script, /version=10; version<=167/);
  assert.match(script, /active_migrations\[@\].*158/s);
  assert.match(script, /actual_sequence.*expected_sequence/s);
});

test("Linux migrations-only mode skips backend and frontend commands", () => {
  assert.match(script, /--migrations-only/);
  assert.match(script, /if \(\(MIGRATIONS_ONLY == 0\)\); then[\s\S]*backend_checks[\s\S]*frontend_checks/);
});

test("local migration replay starts from the canonical baseline", () => {
  assert.match(script, /canonical baseline or Supabase test stubs are missing/);
  assert.match(script, /local baseline="\$scratch\/migrations\/001_baseline\.sql"/);
});

test("local migration replay skips diagnostic and historical migrations below 010", () => {
  assert.match(script, /prefix="\$\{base%%_\*\}"/);
  assert.match(script, /10#\$prefix >= 10/);
  assert.doesNotMatch(script, /for migration in "\$scratch"\/migrations\/\*\.sql/);
  assert.doesNotMatch(script, /db\/archive/);
});

test("Windows verification exposes an explicit PostgreSQL replay option", () => {
  assert.match(windowsScript, /\[switch\]\$Migrations/);
  assert.match(windowsScript, /\[switch\]\$MigrationsOnly/);
  assert.match(windowsScript, /if \(\$Migrations -or \$MigrationsOnly\)/);
});

test("Windows migrations-only mode does not require Node.js or npm", () => {
  assert.match(windowsScript, /if \(-not \$MigrationsOnly\) \{/);
  assert.match(windowsScript, /if \(-not \$MigrationsOnly\) \{[\s\S]*Get-Command node/);
  assert.match(windowsScript, /if \(-not \$MigrationsOnly\) \{[\s\S]*Get-Command npm\.cmd/);
});

test("Windows replay uses a uniquely named disposable database", () => {
  assert.match(windowsScript, /pinposy_verify_\$PID\$\(\[guid\]::NewGuid\(\)/);
  assert.match(windowsScript, /CREATE DATABASE \$database/);
  assert.match(windowsScript, /DROP DATABASE IF EXISTS \$database/);
});

test("Windows replay captures psql output without corrupting its boolean result", () => {
  assert.match(windowsScript, /function Invoke-LocalPsql[\s\S]*& \$Executable @Arguments \| Out-Host[\s\S]*return \$LASTEXITCODE/);
  assert.equal((windowsScript.match(/Invoke-LocalPsql -Executable \$psql -Arguments/g) || []).length, 6);
  assert.match(windowsScript, /\$psqlExitCode = Invoke-LocalPsql/);
  assert.match(windowsScript, /if \(\$psqlExitCode -ne 0\)/);
});

test("Windows migration replay pins every psql connection to explicit loopback host and port", () => {
  assert.match(windowsScript, /\[ValidateRange\(1, 65535\)\][\s\S]*\[int\]\$PostgresPort = 5432/);
  const psqlCalls = windowsScript.match(/Invoke-LocalPsql -Executable \$psql -Arguments @\(([^\r\n]*)/g) || [];
  assert.equal(psqlCalls.length, 6);
  assert.ok(psqlCalls.every((call) => /"127\.0\.0\.1".*"\$PostgresPort"/.test(call)));
});

test("Windows replay applies stubs, canonical baseline, then exactly 158 active migrations", () => {
  assert.match(windowsScript, /db\/supabase-stub\.sql/);
  assert.match(windowsScript, /001_baseline\.sql/);
  assert.match(windowsScript, /-ge 10/);
  assert.match(windowsScript, /-ne 158/);
  assert.match(windowsScript, /foreach \(\$migration in \$activeMigrations\)/);
});

test("Windows replay rejects gaps or out-of-range migrations in the 010-167 chain", () => {
  assert.match(windowsScript, /10\.\.167/);
  assert.match(windowsScript, /expectedMigrationSequence/);
  assert.match(windowsScript, /actualMigrationSequence/);
  assert.match(windowsScript, /\$actualMigrationSequence -ne \$expectedMigrationSequence/);
});

test("Windows migration replay summary reports the current 010-167 range", () => {
  assert.match(windowsScript, /001 \+ 010-167/);
  assert.doesNotMatch(windowsScript, /001 \+ 010-161/);
});

test("Windows replay always attempts cleanup after database creation", () => {
  assert.match(windowsScript, /finally \{[\s\S]*DROP DATABASE IF EXISTS \$database/);
});

test("verification fallback does not claim an unverified GitHub billing cause", () => {
  assert.doesNotMatch(script, /billing\/spending limit/);
  assert.match(script, /fail before their first step/);
});
