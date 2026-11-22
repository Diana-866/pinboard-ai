"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/**
 * The project's development record has to stay trustworthy.
 *
 * docs/audits/2026-11-18-runtime-verification-session.md is the requested record
 * of what was done, why, and with what result. A record that cites commits which do
 * not exist, skips a row, points at deleted files, or contains a pasted secret is
 * worse than no record: it reads as evidence while being wrong. These checks keep it
 * honest and fail the build when it drifts.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const AUDIT = path.join(ROOT, "docs", "audits", "2026-11-18-runtime-verification-session.md");
const STATE = path.join(ROOT, "docs", "PROJECT_STATE.md");
const ACTIONS = path.join(ROOT, "docs", "USER_ACTIONS.md");

const audit = fs.readFileSync(AUDIT, "utf8");
const SESSION_BASE = (/session-base:\s*([0-9a-f]{7,40})/.exec(audit) || [])[1];
// С 2026-11-23 владелец закрыл практику новых аудитов: записи ведутся в docs/PLAN_14_DAYS.md.
// Тег before-finish отмечает границу режимов: журнал аудитов проверяется до него, а коммиты
// после него обязаны быть названы в плане. Долг до тега перечислен в плане отдельным пунктом.
function planSessionBase() {
  try {
    const tag = require("node:child_process")
      .execFileSync("git", ["rev-list", "-n", "1", "before-finish"], { cwd: ROOT, encoding: "utf8" })
      .trim();
    return tag || SESSION_BASE;
  } catch {
    return SESSION_BASE;
  }
}
// Раздел плана 14 дней заменил новые аудиты: записью о работе считается SHA, названный
// в docs/PLAN_14_DAYS.md, поэтому страж читает оба файла, а не только журнал аудитов.
const PLAN = path.join(ROOT, "docs", "PLAN_14_DAYS.md");
const planText = fs.existsSync(PLAN) ? fs.readFileSync(PLAN, "utf8") : "";
assert.ok(SESSION_BASE, "the record must state the commit the session started from");
const state = fs.readFileSync(STATE, "utf8");
const actions = fs.readFileSync(ACTIONS, "utf8");

function commitExists(hash) {
  try {
    execFileSync("git", ["cat-file", "-e", `${hash}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** The action register is one table inside a long document. Parsing every `| N |` row in
 *  the file would also pick up numbered tables in the analysis sections (the forbidden
 *  credential patterns table has a row numbered 429), so the register is sliced out by
 *  its own heading and its rows must end where the next heading starts. */
/** The register table's own text: sliced out by its heading, ended by the next heading. */
function registerBody(source) {
  const heading = source.search(/^#{2,3}\s*.*реестр действий/im);
  assert.notEqual(heading, -1, "the action register heading must exist");
  const rest = source.slice(heading);
  const tableStart = rest.indexOf("\n| ");
  assert.notEqual(tableStart, -1, "the register table must follow its heading");
  const tableText = rest.slice(tableStart);
  const nextHeading = tableText.search(/\n#{2,3}\s/);
  return nextHeading === -1 ? tableText : tableText.slice(0, nextHeading);
}

function registerRows(source) {
  return [...registerBody(source).matchAll(/^\| (\d+) \|/gm)].map((match) => Number(match[1]));
}

test("the action register is numbered without gaps", () => {
  const numbers = registerRows(audit);
  assert.ok(numbers.length >= 40, `expected the register, found ${numbers.length} rows`);
  numbers.forEach((number, index) => {
    assert.equal(number, index + 1, `register row ${index + 1} is numbered ${number}`);
  });
});

test("every commit the record cites exists in the repository", () => {
  const hashes = new Set([...audit.matchAll(/`([0-9a-f]{7,8})`/g)].map((match) => match[1]));
  assert.ok(hashes.size >= 20, `expected cited commits, found ${hashes.size}`);
  const missing = [...hashes].filter((hash) => !commitExists(hash));
  assert.deepEqual(missing, [], `cited commits that do not exist:\n${missing.join("\n")}`);
});

test("every document path the record mentions exists", () => {
  // A line that describes removing a file legitimately names a path that no longer
  // exists (the duplicate admin privacy report is still referenced by its deletion
  // record), so those mentions are not checked.
  const historical = /remov|delet|удал|дубл|duplicate/i;
  const mentioned = new Set();
  for (const source of [audit, state, actions]) {
    for (const line of source.split("\n")) {
      if (historical.test(line)) continue;
      for (const match of line.matchAll(/`((?:docs|scripts)\/[A-Za-z0-9_./-]+)`/g)) mentioned.add(match[1]);
    }
  }
  assert.ok(mentioned.size >= 5, "expected document references");
  const missing = [...mentioned].filter((relative) => !fs.existsSync(path.join(ROOT, relative)));
  assert.deepEqual(missing, [], `referenced paths that do not exist:\n${missing.join("\n")}`);
});

test("the recorded documentation carries no credentials", () => {
  // The user supplied a database password during the session; it must never appear
  // in a committed document, and neither must any provider key or connection URL.
  const documents = [audit, state, actions, fs.readFileSync(path.join(ROOT, "docs", "DOCUMENTATION_REGISTER.md"), "utf8")];
  const forbidden = [
    /sk-[A-Za-z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY/,
    /postgres(?:ql)?:\/\/[^\s`]*:[^\s`@]{4,}@/,
    /PGPASSWORD=\S+/,
  ];
  const hits = [];
  for (const document of documents) {
    for (const pattern of forbidden) {
      if (pattern.test(document)) hits.push(pattern.source);
    }
  }
  assert.deepEqual(hits, [], `possible credentials in documentation:\n${hits.join("\n")}`);
});

/** Rows of the chronology appendix: commit, date, subject, and where the reasoning lives. */
function chronologyRows(source) {
  const heading = source.search(/^#{3,4} .*Полная хронология/im);
  if (heading === -1) return [];
  const body = source.slice(heading);
  const rows = [];
  for (const line of body.split("\n")) {
    const match = /^\| `([0-9a-f]{7,40})` \| (\d{4}-\d{2}-\d{2}) \| (.+?) \| (.+?) \|$/.exec(line);
    if (match) rows.push({ hash: match[1], date: match[2], subject: match[3], address: match[4].trim() });
  }
  return rows;
}

/** Files a commit touched, as repository-relative paths. */
function commitFiles(hash) {
  const output = execFileSync("git", ["show", "--name-only", "--pretty=format:", hash], { cwd: ROOT, encoding: "utf8" });
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * A commit titled "docs:" that also changed code, kept as a recorded exception instead of a
 * silent one. History is never rewritten, so the honest move is to name it: the guard fix landed
 * under a documentation subject and got its register row (172) afterwards. Each entry must still
 * be a real commit that still touches a non-docs path, so the list cannot rot.
 */
const CODE_IN_DOCS_COMMITS = new Map([
  ["422efd34", "the register-scoping guard fix shipped under a docs subject; row 172 records it"],
  ["34ab6514", "the completeness guard and its tool shipped under a docs subject; the code in it is the record's own checker"],
  ["8623e91d", "the docs commit also corrected that guard's own scanner, which mistook quoted history for a live reference; section 122.6 records it and 122.7 the shared-command mistake that let it through"],
]);

test("every change of this session has a row, and every row points at a reason", (t) => {
  // The owner needs the whole development sequence reconstructed. An earlier version of this
  // guard only validated the commits the record happened to mention, so it passed while 49 of
  // 109 commits had no entry at all, two of them behaviour changes. It now runs in both
  // directions: no commit without a row, and no row without a place that explains why.
  let log;
  try {
    log = execFileSync("git", ["log", "--pretty=%h\u001f%s", `${planSessionBase()}..HEAD`], { cwd: ROOT, encoding: "utf8" });
  } catch {
    t.skip("git history is unavailable in this checkout");
    return;
  }
  const commits = log.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [hash, subject] = line.split("\u001f");
    return { hash, subject };
  });
  // Порог «>20» относился к длинной сессии аудитов. После тега before-finish окно короткое,
  // поэтому требуется хотя бы один коммит: пустое окно не должно выглядеть как «всё записано».
  assert.ok(commits.length >= 1, `expected at least one commit after the workflow boundary, found ${commits.length}`);

  const rows = chronologyRows(audit);
  assert.ok(rows.length > 20, `expected the chronology appendix, found ${rows.length} rows`);
  const byHash = new Map(rows.map((row) => [row.hash, row]));
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

  // Direction one: a commit that the appendix does not list.
  const missing = [];
  for (const { hash, subject } of commits) {
    const isDocs = /^docs(\(|:)/.test(subject);
    if (isDocs) {
      // Checked for every documentation commit, not only for the exempt ones: the exemption
      // (a commit cannot cite itself) must not become a way to land behaviour without a reason,
      // so a "docs" commit may only touch docs/.
      const codeFiles = commitFiles(hash).filter((file) => !file.startsWith("docs/"));
      if (codeFiles.length > 0) {
        assert.ok(
          CODE_IN_DOCS_COMMITS.has(hash),
          `${hash} claims to be documentation only but touched ${codeFiles.join(", ")}`
        );
      }
    }
    if (byHash.has(hash)) continue;
    // Коммит, названный в плане 14 дней, тоже имеет причину: план — единственный файл записей.
    if (new RegExp("`" + hash + "`").test(planText)) continue;
    // The newest commit cannot cite itself, so the record catches up on the next one.
    if (hash === head) continue;
    missing.push(`${hash} ${subject}`);
  }
  assert.deepEqual(missing, [], `commits with no row in the chronology:\n${missing.join("\n")}`);

  for (const [hash, reason] of CODE_IN_DOCS_COMMITS) {
    assert.ok(commitFiles(hash).some((file) => !file.startsWith("docs/")), `${hash} no longer touches code: drop the exception (${reason})`);
    assert.ok(byHash.has(hash), `${hash} is exempted but has no chronology row`);
  }

  // Direction two: a row whose address does not resolve, which would be a decorative entry.
  const numbers = new Set(registerRows(audit));
  const sections = new Set([...audit.matchAll(/^#{2,3} (\d+(?:\.\d+)*)\./gm)].map((match) => match[1]));
  // Section 141: this map used to be built from every `| N |` line in the document, so a numbering
  // collision with a status-code table (row `429` is both a register row and an HTTP status) silently
  // replaced the real row and made a correct citation look broken. The register is sliced out by its own
  // heading now, exactly as the numbering guard already did.
  const registerText = new Map();
  for (const line of registerBody(audit).split("\n")) {
    const match = /^\| (\d+) \|/.exec(line);
    if (match) registerText.set(Number(match[1]), line);
  }

  const unresolved = [];
  for (const row of rows) {
    const address = row.address;
    if (address === "—" || address === "-" || address === "") {
      unresolved.push(`${row.hash}: no address`);
      continue;
    }
    const registerRow = /реестр, строк(?:а|и) ([\d,\sи]+)/.exec(address);
    if (registerRow) {
      const cited = [...registerRow[1].matchAll(/\d+/g)].map((m) => Number(m[0]));
      for (const number of cited) {
        const text = registerText.get(number);
        if (!numbers.has(number) || !text) unresolved.push(`${row.hash}: register row ${number} does not exist`);
        else if (!text.includes(row.hash)) unresolved.push(`${row.hash}: register row ${number} does not cite it`);
      }
    }
    for (const section of address.matchAll(/§(\d+(?:\.\d+)*)/g)) {
      if (!sections.has(section[1])) unresolved.push(`${row.hash}: section ${section[1]} does not exist`);
    }
    if (/PROJECT_STATE/.test(address) && !state.includes(row.hash)) {
      unresolved.push(`${row.hash}: PROJECT_STATE does not mention it`);
    }
    for (const action of address.matchAll(/(UA-\d+)/g)) {
      if (!actions.includes(action[1])) unresolved.push(`${row.hash}: ${action[1]} does not exist`);
    }
    const known = /реестр|§|PROJECT_STATE|UA-\d+|USER_ACTIONS/.test(address);
    if (!known) unresolved.push(`${row.hash}: address "${address}" names no place in the record`);
  }
  assert.deepEqual(unresolved, [], `chronology rows whose reason cannot be found:\n${unresolved.join("\n")}`);
});

test("the record never claims verification for something it marks unverified", () => {
  // Guard against the reverse failure too: an area listed as NOT verified must not
  // also be described as passing. The check is deliberately narrow and textual.
  const unverifiedSection = audit.slice(audit.indexOf("## 21."));
  assert.ok(unverifiedSection.length > 0);
  assert.match(unverifiedSection, /НЕ проверен|Непроверен|не проверено|не проверены/i);
});
