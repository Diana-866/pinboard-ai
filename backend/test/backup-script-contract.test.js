"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

/**
 * Дни 10–11 плана: бэкап базы. Проверяется сам скрипт с подставными pg_dump/pg_restore:
 * живой PostgreSQL на машине разработки требует пароля, а «должно работать» — не проверка.
 */
const ROOT = path.join(__dirname, "..", "..");
const SCRIPT = path.join(ROOT, "deploy", "backup.sh");
const hasBash = (() => {
  const probe = spawnSync("bash", ["-c", "exit 0"], { encoding: "utf8" });
  return probe.status === 0;
})();

function sandbox({ dumpFails = false, restoreFails = false, objects = 3 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pinposy-backup-"));
  const bin = path.join(dir, "bin");
  const backups = path.join(dir, "backups");
  fs.mkdirSync(bin);
  fs.mkdirSync(backups);

  const dumpLog = path.join(dir, "dump-calls.log");
  fs.writeFileSync(
    path.join(bin, "pg_dump"),
    [
      "#!/usr/bin/env bash",
      'echo "$@" >> "' + dumpLog.split(String.fromCharCode(92)).join("/") + '"',
      'file=""',
      'while [ $# -gt 0 ]; do if [ "$1" = "--file" ]; then file="$2"; fi; shift; done',
      // Сбойный pg_dump успевает создать частичный файл — именно его скрипт обязан убрать.
      dumpFails ? 'printf "partial\n" > "$file"; exit 1' : 'printf "fake dump body\n" > "$file"',
      "exit 0",
    ].join("\n") + "\n"
  );
  fs.writeFileSync(
    path.join(bin, "pg_restore"),
    [
      "#!/usr/bin/env bash",
      restoreFails ? "exit 1" : Array.from({ length: objects }, (_, index) => `echo "${index + 1}; 0 0 TABLE public t${index} postgres"`).join("\n"),
      "exit 0",
    ].join("\n") + "\n"
  );
  for (const name of ["pg_dump", "pg_restore"]) fs.chmodSync(path.join(bin, name), 0o755);
  return { dir, bin, backups, dumpLog };
}

function runScript(box, args = [], extraEnv = {}) {
  const env = {
    ...process.env,
    PATH: `${box.bin}${path.delimiter}${process.env.PATH}`,
    BACKUP_DIR: box.backups,
    PG_DUMP: "pg_dump",
    PG_RESTORE: "pg_restore",
    RETENTION_DAYS: "14",
    DATABASE_URL: extraEnv.DATABASE_URL === undefined ? "postgres://user:supersecret@example.invalid/db" : extraEnv.DATABASE_URL,
    ...extraEnv,
  };
  return spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8", env });
}

test("the script parses and exists", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  assert.ok(fs.existsSync(SCRIPT));
  assert.equal(spawnSync("bash", ["-n", SCRIPT], { encoding: "utf8" }).status, 0);
});

test("a successful dump is written, checksummed and verified", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const box = sandbox();
  const result = runScript(box, [], { BACKUP_DIR: box.backups });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const dumps = fs.readdirSync(box.backups).filter((name) => name.endsWith(".dump"));
  assert.equal(dumps.length, 1, "exactly one dump per run");
  const dump = path.join(box.backups, dumps[0]);
  assert.ok(fs.statSync(dump).size > 0);
  assert.match(dumps[0], /^pinposy-\d{8}T\d{6}Z\.dump$/, "the name must carry the UTC timestamp");
  const checksum = fs.readFileSync(`${dump}.sha256`, "utf8").trim();
  assert.match(checksum, /^[0-9a-f]{64}$/, "a checksum must be recorded");
  assert.match(result.stdout, /backup: verified/, "the dump must be verified, not only written");
});

test("the dump uses the flags that make it restorable elsewhere", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const box = sandbox();
  assert.equal(runScript(box).status, 0);
  const call = fs.readFileSync(box.dumpLog, "utf8");
  assert.match(call, /--format=custom/, "pg_restore needs the custom format");
  assert.match(call, /--no-owner/);
  assert.match(call, /--no-privileges/);
});

test("the database url never reaches the output", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const box = sandbox();
  const result = runScript(box, [], { DATABASE_URL: "postgres://user:supersecret@example.invalid/db" });
  assert.equal(result.status, 0);
  const combined = `${result.stdout}${result.stderr}`;
  assert.ok(!combined.includes("supersecret"), "the password must never be printed");
  assert.ok(!combined.includes("example.invalid"), "the host must never be printed");
});

test("a missing database url stops before dumping", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const box = sandbox();
  const result = runScript(box, [], { DATABASE_URL: "" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /DATABASE_URL is not set/);
  assert.ok(!fs.existsSync(box.dumpLog) || fs.readFileSync(box.dumpLog, "utf8").trim() === "", "pg_dump must not run");
});

test("a failed dump leaves no file and reports failure", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const box = sandbox({ dumpFails: true });
  const result = runScript(box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pg_dump failed|dump file is empty|dump is not readable/);
  assert.deepEqual(fs.readdirSync(box.backups), [], "a failed dump must not leave a partial file behind");
});

test("a dump that cannot be read back fails the run", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const box = sandbox({ restoreFails: true });
  const result = runScript(box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dump is not readable/);
});

test("a dump with no objects is not called a backup", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const box = sandbox({ objects: 0 });
  const result = runScript(box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dump contains no objects/);
});

test("old dumps are pruned only after the new one is verified", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const box = sandbox();
  const old = path.join(box.backups, "pinposy-20200101T000000Z.dump");
  fs.writeFileSync(old, "old");
  fs.writeFileSync(`${old}.sha256`, "x");
  const oldTime = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  fs.utimesSync(old, oldTime, oldTime);
  assert.equal(runScript(box).status, 0);
  assert.ok(!fs.existsSync(old), "dumps older than the retention window must be removed");
  const fresh = fs.readdirSync(box.backups).filter((name) => name.endsWith(".dump"));
  assert.equal(fresh.length, 1, "the new dump must survive");
});

test("--verify checks an existing file and rejects a broken one", (t) => {
  if (!hasBash) {
    t.skip("bash is unavailable");
    return;
  }
  const box = sandbox();
  const good = path.join(box.dir, "good.dump");
  fs.writeFileSync(good, "body");
  assert.equal(runScript(box, ["--verify", good]).status, 0);
  const broken = path.join(box.dir, "broken.dump");
  fs.writeFileSync(broken, "");
  const result = runScript(box, ["--verify", broken]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /empty/);
});
