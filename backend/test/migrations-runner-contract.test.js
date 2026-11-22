"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const migrator = require(path.join(__dirname, "..", "..", "deploy", "apply-migrations.cjs"));

/**
 * Дни 3–4 плана: прогон миграций на сервере. Проверяется сам раннер, без базы:
 * базы на машине разработки нет, а «должно работать» доказательством не считается.
 */
function fakeClient({ applied = [], failOn = null } = {}) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    const sql = args[args.length - 1];
    if (args.includes("-f")) {
      const file = args[args.indexOf("-f") + 1];
      if (failOn && file.includes(failOn)) return { status: 1, stdout: "", stderr: "ERROR: boom" };
      return { status: 0, stdout: "CREATE TABLE", stderr: "" };
    }
    if (/copy \(select version, checksum/.test(sql)) {
      return { status: 0, stdout: applied.map(([v, c]) => `${v},${c}`).join("\n"), stderr: "" };
    }
    if (/insert into public\.schema_migrations/.test(sql)) return { status: 0, stdout: "INSERT 0 1", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { calls, run };
}

test("migrations are applied in numeric order and diagnostics stay out", () => {
  const migrations = migrator.listMigrations();
  assert.ok(migrations.length > 100, `expected the whole migration history, found ${migrations.length}`);
  for (let index = 1; index < migrations.length; index += 1) {
    assert.ok(
      migrations[index - 1].number <= migrations[index].number,
      `${migrations[index - 1].name} must not come after ${migrations[index].name}`
    );
  }
  assert.ok(
    !migrations.some((migration) => migration.name.startsWith(migrator.DIAGNOSTIC_PREFIX)),
    "diagnostic script 000_check_schema.sql changes nothing and must never be recorded as a migration"
  );
  assert.ok(migrations.every((migration) => /^[0-9a-f]{64}$/.test(migration.checksum)));
});

test("a plan applies only what the database does not have", () => {
  const migrations = migrator.listMigrations();
  const applied = new Map([[migrations[0].name, migrations[0].checksum]]);
  const { plan, conflicts } = migrator.buildPlan(migrations, applied);
  assert.equal(plan.length, migrations.length - 1);
  assert.deepEqual(conflicts, []);
  assert.ok(!plan.some((migration) => migration.name === migrations[0].name));
});

test("a migration edited after it was applied stops the run", () => {
  const migrations = migrator.listMigrations();
  const applied = new Map([[migrations[0].name, "0".repeat(64)]]);
  const { plan, conflicts } = migrator.buildPlan(migrations, applied);
  assert.deepEqual(conflicts, [migrations[0].name]);
  assert.equal(plan.length, migrations.length - 1);
});

test("the runner refuses to guess a database", () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const errors = [];
  const originalError = console.error;
  console.error = (message) => errors.push(String(message));
  try {
    assert.equal(migrator.main([], { run: fakeClient().run }), 2);
  } finally {
    console.error = originalError;
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  }
  assert.ok(errors.some((message) => /DATABASE_URL is not set/.test(message)), "the refusal must be explained");
});

test("each migration runs in one transaction with ON_ERROR_STOP and is recorded", () => {
  const client = fakeClient();
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://example.invalid/pinposy";
  const logs = [];
  const originalLog = console.log;
  console.log = (message) => logs.push(String(message));
  try {
    assert.equal(migrator.main([], { run: client.run }), 0);
  } finally {
    console.log = originalLog;
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }

  const fileCalls = client.calls.filter((args) => args.includes("-f"));
  assert.ok(fileCalls.length > 0);
  for (const args of fileCalls) {
    assert.ok(args.includes("--single-transaction"), "a migration must not half-apply");
    assert.deepEqual(args.slice(args.indexOf("-v"), args.indexOf("-v") + 2), ["-v", "ON_ERROR_STOP=1"]);
  }
  const appliedNames = fileCalls.map((args) => path.basename(args[args.indexOf("-f") + 1]));
  assert.deepEqual(appliedNames, migrator.listMigrations().map((migration) => migration.name));
  const inserts = client.calls.filter((args) => /insert into public\.schema_migrations/.test(args[args.length - 1]));
  assert.equal(inserts.length, appliedNames.length, "every applied file must be recorded exactly once");
});

test("a failing migration stops the run and is not recorded", () => {
  const failing = migrator.listMigrations()[1].name;
  const client = fakeClient({ failOn: failing });
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://example.invalid/pinposy";
  const errors = [];
  const originalError = console.error;
  console.error = (message) => errors.push(String(message));
  let code;
  try {
    code = migrator.main([], { run: client.run });
  } finally {
    console.error = originalError;
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }
  assert.equal(code, 1);
  assert.ok(errors.some((message) => message.includes(failing)), "the failing file must be named");
  const recorded = client.calls
    .filter((args) => /insert into public\.schema_migrations/.test(args[args.length - 1]))
    .map((args) => args[args.length - 1]);
  assert.ok(!recorded.some((sql) => sql.includes(failing)), "a failed migration must not be recorded as applied");
});

test("dry run applies nothing", () => {
  const client = fakeClient();
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://example.invalid/pinposy";
  const logs = [];
  const originalLog = console.log;
  console.log = (message) => logs.push(String(message));
  try {
    assert.equal(migrator.main(["--dry-run"], { run: client.run }), 0);
  } finally {
    console.log = originalLog;
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }
  assert.equal(client.calls.filter((args) => args.includes("-f")).length, 0, "dry run must not touch schema files");
  assert.ok(logs.some((line) => /^would apply /.test(line)));
});

test("a migration that applied but was not recorded fails the run", () => {
  // Иначе при следующем прогоне файл применится повторно и «уже применённое» станет ложью.
  const client = fakeClient();
  const inner = client.run;
  const run = (args) => {
    if (/insert into public\.schema_migrations/.test(args[args.length - 1])) {
      return { status: 1, stdout: "", stderr: "ERROR: journal write failed" };
    }
    return inner(args);
  };
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://example.invalid/pinposy";
  const errors = [];
  const originalError = console.error;
  console.error = (message) => errors.push(String(message));
  let code;
  try {
    code = migrator.main([], { run });
  } finally {
    console.error = originalError;
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }
  assert.equal(code, 1);
  assert.ok(
    errors.some((message) => /applied but not recorded/.test(message)),
    "an unrecorded migration must be reported, not swallowed"
  );
});
