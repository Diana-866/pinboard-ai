"use strict";

/**
 * Pure helpers for the chronology appendix, so the check can be tested without git.
 *
 * The appendix lists every commit of the session with the place where its reasoning lives.
 * A commit cannot be listed inside itself, so a clean tree always lags by exactly one row:
 * the row for HEAD. A check that fails on every clean tree teaches the reader to ignore it,
 * so the comparison accepts the current HEAD as the single expected omission - and only
 * that, and only when HEAD does have a recorded reason of its own.
 */

const HEADING = /^### 56\.4\. Приложение\. Полная хронология/m;

/** One markdown row per commit; a pipe inside a subject would split the column. */
function buildTable(commits) {
  return commits
    .map(({ hash, date, subject, address }) =>
      `| \`${hash}\` | ${date} | ${subject.replace(/\|/g, "\\|")} | ${address} |`)
    .join("\n");
}

/**
 * Replaces the appendix table in `auditText`, leaving everything around it untouched.
 * Returns null when the appendix heading or its table header is missing.
 */
function spliceTable(auditText, table) {
  const headingMatch = HEADING.exec(auditText);
  if (!headingMatch) return null;
  const afterHeading = auditText.slice(headingMatch.index + headingMatch[0].length);
  const endOffset = afterHeading.search(/^#{1,4} /m);
  const appendixBody = endOffset === -1 ? afterHeading : afterHeading.slice(0, endOffset);
  const tableStart = appendixBody.indexOf("| Коммит |");
  if (tableStart === -1) return null;
  const tableHeaderEnd = appendixBody.indexOf("\n", appendixBody.indexOf("| --- |"));
  if (tableHeaderEnd === -1) return null;
  const tableHeader = appendixBody.slice(tableStart, tableHeaderEnd);
  const before = auditText.slice(0, headingMatch.index + headingMatch[0].length) + afterHeading.slice(0, tableStart);
  const after = endOffset === -1 ? "" : afterHeading.slice(endOffset);
  return `${before}${tableHeader}\n${table}\n\n${after}`;
}

/**
 * Compares the committed appendix with the table the history implies.
 *
 * @returns {{status: "fresh"|"head-lag"|"stale"|"no-appendix", detail: string}}
 */
function compareAppendix(auditText, commits) {
  if (!commits || commits.length === 0) return { status: "fresh", detail: "no commits in the session" };
  const fresh = spliceTable(auditText, buildTable(commits));
  if (fresh === null) return { status: "no-appendix", detail: "appendix heading or table header is missing" };
  if (fresh === auditText) return { status: "fresh", detail: "appendix lists every commit" };

  // A commit cannot contain its own row: the last commit is allowed to be the one missing,
  // and only when it has a recorded reason - otherwise the omission would hide a real gap.
  const head = commits[commits.length - 1];
  const withoutHead = spliceTable(auditText, buildTable(commits.slice(0, -1)));
  if (withoutHead === auditText && head.address !== "—") {
    return { status: "head-lag", detail: `row for HEAD ${head.hash} cannot be in its own commit` };
  }
  return { status: "stale", detail: "run node scripts/update-chronology.cjs" };
}

module.exports = { HEADING, buildTable, spliceTable, compareAppendix };
