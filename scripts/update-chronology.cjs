#!/usr/bin/env node
"use strict";

/**
 * Regenerates the chronology appendix of the session record from git history.
 *
 * The owner needs the whole development sequence reconstructible, and a hand-maintained list
 * drifts: it already lagged behind 49 of 109 commits. This script derives every row from the
 * repository itself, so completeness is mechanical instead of a promise:
 *
 *   commit | date | subject | where the reasoning lives
 *
 * "Where" is resolved from evidence, never invented:
 *   - a register row in the audit that cites the commit            -> "реестр, строка N"
 *   - the audit sections this commit added                          -> "§N — написаны этим коммитом"
 *   - a mention in docs/PROJECT_STATE.md                            -> "PROJECT_STATE"
 *   - an action id this commit added to docs/USER_ACTIONS.md        -> "UA-nnn — добавлено этим коммитом"
 *   - otherwise                                                     -> "—" (and the guard fails)
 *
 * A row that ends up as "—" is the script telling you the commit has no recorded reason yet;
 * add a register row or a section, then run it again.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { buildTable, spliceTable, compareAppendix } = require("./lib/chronology-appendix.cjs");

const ROOT = path.resolve(__dirname, "..");
const AUDIT_REL = "docs/audits/2026-11-18-runtime-verification-session.md";
const AUDIT = path.join(ROOT, AUDIT_REL);
const STATE_REL = "docs/PROJECT_STATE.md";
const ACTIONS_REL = "docs/USER_ACTIONS.md";

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const dryRun = argv.includes("--dry-run");

const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });

const audit = fs.readFileSync(AUDIT, "utf8");
const sessionBase = (/session-base:\s*([0-9a-f]{7,40})/.exec(audit) || [])[1];
if (!sessionBase) {
  console.error("The record must state the commit the session started from (<!-- session-base: … -->).");
  process.exit(1);
}

/** Register rows by number, and the register row that cites each commit. */
const registerRows = new Map();
const rowByCommit = new Map();
for (const line of audit.split("\n")) {
  const numbered = /^\| (\d+) \|/.exec(line);
  if (!numbered) continue;
  registerRows.set(Number(numbered[1]), line);
  for (const hash of line.matchAll(/`([0-9a-f]{7,40})`/g)) {
    if (!rowByCommit.has(hash[1])) rowByCommit.set(hash[1], Number(numbered[1]));
  }
}

const sectionNumbers = new Set([...audit.matchAll(/^#{2,3} (\d+(?:\.\d+)*)\./gm)].map((match) => match[1]));
const stateText = fs.readFileSync(path.join(ROOT, STATE_REL), "utf8");

function sectionsAddedBy(hash) {
  let diff;
  try {
    diff = git(["show", hash, "--", AUDIT_REL]);
  } catch {
    return [];
  }
  const added = diff.split("\n").filter((line) => line.startsWith("+")).join("\n");
  return [...new Set([...added.matchAll(/^\+#{2,3} (\d+(?:\.\d+)*)\./gm)].map((match) => match[1]))]
    .filter((number) => sectionNumbers.has(number));
}

function registerRowsAddedBy(hash) {
  let diff;
  try {
    diff = git(["show", hash, "--", AUDIT_REL]);
  } catch {
    return 0;
  }
  return diff.split("\n").filter((line) => /^\+\| \d+ \|/.test(line)).length;
}

function actionsAddedBy(hash) {
  let diff;
  try {
    diff = git(["show", hash, "--", ACTIONS_REL]);
  } catch {
    return [];
  }
  const added = diff.split("\n").filter((line) => line.startsWith("+")).join("\n");
  return [...new Set([...added.matchAll(/(UA-\d{3})/g)].map((match) => match[1]))];
}

function addressFor(hash) {
  if (rowByCommit.has(hash)) return `реестр, строка ${rowByCommit.get(hash)}`;

  const sections = sectionsAddedBy(hash);
  if (sections.length > 0) return `${sections.map((number) => `§${number}`).join(", ")} — написаны этим коммитом`;

  // A commit that only extended the register is recorded by the rows it added.
  if (registerRowsAddedBy(hash) > 0) return "реестр — расширен этим коммитом";

  const actions = actionsAddedBy(hash);
  if (actions.length > 0) return `${ACTIONS_REL} ${actions.join(", ")} — добавлено этим коммитом`;

  if (stateText.includes(hash)) return "PROJECT_STATE";

  return "—";
}

const commits = git(["log", "--reverse", "--pretty=%h\u001f%ad\u001f%s", "--date=short", `${sessionBase}..HEAD`])
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [hash, date, subject] = line.split("\u001f");
    return { hash, date, subject, address: addressFor(hash) };
  });

const table = buildTable(commits);
const updated = spliceTable(audit, table);
if (updated === null) {
  console.error("The record has no chronology appendix heading (### 56.4. Приложение. Полная хронология…).");
  process.exit(1);
}

const unexplained = commits.filter((commit) => commit.address === "—");

if (checkOnly) {
  const verdict = compareAppendix(audit, commits);
  if (verdict.status === "no-appendix") {
    console.error(`The record has no usable chronology appendix: ${verdict.detail}`);
    process.exit(1);
  }
  if (verdict.status === "stale") {
    console.error(`The chronology appendix is out of date: ${verdict.detail}`);
    process.exit(1);
  }
  if (unexplained.length > 0) {
    console.error(`Commits with no recorded reason:\n${unexplained.map((c) => `  ${c.hash} ${c.subject}`).join("\n")}`);
    process.exit(1);
  }
  const note = verdict.status === "head-lag" ? ` (${verdict.detail})` : "";
  console.log(`OK: ${commits.length} commits, every one has a recorded reason${note}.`);
  process.exit(0);
}

if (unexplained.length > 0) {
  console.error(`Warning: these commits have no recorded reason yet ("—"):\n${unexplained.map((c) => `  ${c.hash} ${c.subject}`).join("\n")}`);
}

if (dryRun) {
  console.log(updated === audit ? "Appendix already up to date." : "Appendix would change.");
  process.exit(unexplained.length > 0 ? 1 : 0);
}

fs.writeFileSync(AUDIT, updated);
console.log(`Chronology appendix regenerated: ${commits.length} commits from ${sessionBase}.`);
