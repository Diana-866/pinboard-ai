"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const libPath = path.join(__dirname, "..", "..", "scripts", "lib", "chronology-appendix.cjs");
const scriptPath = path.join(__dirname, "..", "..", "scripts", "update-chronology.cjs");
const { buildTable, spliceTable, compareAppendix } = require(libPath);

/**
 * The chronology appendix is the record's own completeness guard: every commit of the session
 * must carry the place where its reasoning lives. The guard has one structural blind spot - a
 * commit cannot list itself - and a check that fails on every clean tree is a check the reader
 * learns to ignore. These tests pin both the guard and the tolerance, including the boundary
 * where the tolerance must NOT apply.
 */

const HEADING = "### 56.4. Приложение. Полная хронология сессии";
const HEADER = "| Коммит | Дата | Что сделано | Где обоснование |\n| --- | --- | --- | --- |";

function auditWith(rows) {
  return [
    "# Запись сессии",
    "",
    "<!-- session-base: abc1234 -->",
    "",
    HEADING,
    "",
    HEADER,
    rows,
    "",
    "## Что дальше",
    "",
  ].join("\n");
}

const COMMIT_A = { hash: "aaaaaaa", date: "2026-01-01", subject: "feat: first", address: "PROJECT_STATE" };
const COMMIT_B = { hash: "bbbbbbb", date: "2026-01-02", subject: "docs: second", address: "реестр, строка 7" };

test("a subject containing a pipe cannot break the table", () => {
  const table = buildTable([{ ...COMMIT_A, subject: "fix: a | b" }]);
  const row = table.split("\n")[0];

  assert.match(row, /a \\\| b/, "the pipe inside the subject is escaped");
  // A naive split still sees the escape, which is why the escape - not the split - is the contract;
  // what matters is that the last column is intact and readable.
  assert.ok(row.endsWith("| PROJECT_STATE |"), `the reason column must survive a pipe in the subject: ${row}`);
  assert.equal(row.indexOf("PROJECT_STATE"), row.lastIndexOf("PROJECT_STATE"), "the reason appears once");
});

test("the table is spliced between the heading and the next section, nothing else moves", () => {
  const original = auditWith("| stale |");
  const updated = spliceTable(original, buildTable([COMMIT_A]));

  assert.ok(updated.startsWith("# Запись сессии"), "the prose before the appendix survives");
  assert.ok(updated.endsWith("## Что дальше\n"), "the section after the appendix survives");
  assert.ok(updated.includes("| --- | --- | --- | --- |"), "the column header survives");
  assert.match(updated, /`aaaaaaa`/);
  assert.doesNotMatch(updated, /\| stale \|/, "the old rows are replaced, not appended to");
});

test("a record without the appendix heading is reported as unusable", () => {
  assert.equal(spliceTable("# Запись\n\nno appendix here\n", "| x |"), null);
  assert.equal(compareAppendix("no heading", [COMMIT_A]).status, "no-appendix");
});

test("an appendix that lists every commit is fresh", () => {
  const audit = auditWith(buildTable([COMMIT_A, COMMIT_B]));
  const verdict = compareAppendix(audit, [COMMIT_A, COMMIT_B]);
  assert.equal(verdict.status, "fresh");
});

test("a clean tree lags by exactly one row: the row for HEAD itself", () => {
  // The committed appendix cannot contain the commit that writes it.
  const audit = auditWith(buildTable([COMMIT_A]));
  const verdict = compareAppendix(audit, [COMMIT_A, COMMIT_B]);
  assert.equal(verdict.status, "head-lag");
  assert.match(verdict.detail, /bbbbbbb/);
});

test("the tolerance never covers a missing row that is not HEAD", () => {
  // COMMIT_B is in the middle, so its absence is a real gap, not the unavoidable lag.
  const audit = auditWith(buildTable([COMMIT_A]));
  const verdict = compareAppendix(audit, [COMMIT_A, COMMIT_B, { ...COMMIT_A, hash: "ccccccc", date: "2026-01-03" }]);
  assert.equal(verdict.status, "stale");
});

test("a HEAD commit without a recorded reason is not excused by the tolerance", () => {
  // Otherwise a commit that adds no register row and no section would slip through unseen.
  const audit = auditWith(buildTable([COMMIT_A]));
  const verdict = compareAppendix(audit, [COMMIT_A, { ...COMMIT_B, address: "—" }]);
  assert.equal(verdict.status, "stale", "an unexplained HEAD must fail, not be tolerated");
});

test("an appendix with an extra row is stale", () => {
  const audit = auditWith(buildTable([COMMIT_A, COMMIT_B, { hash: "ddddddd", date: "2026-01-04", subject: "ghost", address: "PROJECT_STATE" }]));
  assert.equal(compareAppendix(audit, [COMMIT_A, COMMIT_B]).status, "stale");
});

test("the script itself passes --check in a fresh repository after the last commit", () => {
  // End to end, in a throwaway repository: a base commit, then a record commit whose appendix
  // is regenerated and committed together with it. Before the tolerance existed this exact
  // state failed with "appendix is out of date", which made the guard impossible to satisfy.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chronology-"));
  try {
    fs.mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
    fs.mkdirSync(path.join(dir, "docs", "audits"), { recursive: true });
    fs.copyFileSync(scriptPath, path.join(dir, "scripts", "update-chronology.cjs"));
    fs.copyFileSync(libPath, path.join(dir, "scripts", "lib", "chronology-appendix.cjs"));
    fs.writeFileSync(path.join(dir, "docs", "PROJECT_STATE.md"), "- nothing yet\n");
    fs.writeFileSync(path.join(dir, "docs", "USER_ACTIONS.md"), "");

    const auditFile = path.join(dir, "docs", "audits", "2026-11-18-runtime-verification-session.md");
    const run = (args) => spawnSync(process.execPath, [path.join(dir, "scripts", "update-chronology.cjs"), ...args], {
      cwd: dir, encoding: "utf8",
    });
    const git = (args) => execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=T", ...args], { cwd: dir, encoding: "utf8" });

    git(["init", "-q"]);
    git(["add", "-A"]);
    git(["commit", "-qm", "chore: start"]);
    const base = git(["rev-parse", "--short=7", "HEAD"]).trim();

    // The record commit names the base it starts from, and adds a section of its own.
    fs.writeFileSync(auditFile, [
      "# Запись сессии",
      "",
      `<!-- session-base: ${base} -->`,
      "",
      HEADING,
      "",
      HEADER,
      "",
      "## 98. Первый раздел сессии",
      "",
      "текст",
      "",
    ].join("\n"));
    git(["add", "-A"]);
    git(["commit", "-qm", "docs: первый раздел"]);

    // The next commit adds another section and carries the regenerated appendix with it.
    fs.appendFileSync(auditFile, "\n## 99. Второй раздел сессии\n\nтекст\n");
    const generated = run([]);
    assert.equal(generated.status, 0, generated.stderr);
    git(["add", "-A"]);
    git(["commit", "-qm", "docs: второй раздел и хронология"]);

    const check = run(["--check"]);
    assert.equal(check.status, 0, `--check failed in a clean temporary repository:
${check.stdout}
${check.stderr}`);
    assert.match(check.stdout, /OK: 2 commits/);
    assert.match(check.stdout, /row for HEAD/, "the unavoidable one-row lag is stated, not hidden");

    // Now the opposite case: a commit that DOES record something, whose table was not
    // regenerated. It must be refused for being stale, not excused for being unrecorded.
    fs.appendFileSync(auditFile, "\n## 100. Третий раздел сессии\n\nтекст\n");
    const regenerated = run([]);
    assert.equal(regenerated.status, 0, regenerated.stderr);
    git(["add", "-A"]);
    git(["commit", "-qm", "docs: третий раздел и хронология"]);
    assert.equal(run(["--check"]).status, 0, "an addressed HEAD with a current table is accepted");

    fs.appendFileSync(auditFile, "\n## 101. Четвёртый раздел сессии\n\nтекст\n");
    git(["add", "-A"]);
    git(["commit", "-qm", "docs: четвёртый раздел без хронологии"]);
    const stale = run(["--check"]);
    assert.equal(stale.status, 1, "a stale table must be refused even when HEAD is explained");
    assert.match(stale.stderr, /out of date/);
    assert.doesNotMatch(stale.stderr, /no recorded reason/, "the reason must name the real problem");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
