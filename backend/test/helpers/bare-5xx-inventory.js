"use strict";

/**
 * Shared scanner for the two "bare 5xx inventory" guards (sections 110, 112, 113).
 *
 * A 5xx never carries its message, so anything written for the customer behind `httpError(5xx, …)`
 * is replaced by "внутренняя ошибка сервера, попробуйте позже" before it reaches anyone. These
 * guards do not try to decide which messages are customer-facing - that judgement belongs in the
 * exemption maps, with a written reason - they only make sure the judgement is made.
 *
 * The scan is bound by the end of the statement, because a message may contain a semicolon, and
 * normalises CRLF first, because the working tree is CRLF on the owner's machine.
 */

/** Every `throw httpError(<status >= 500>, …)` in the source, as the raw argument text. */
function scanBareServerErrors(source) {
  const text = String(source).replace(/\r\n/g, "\n");
  const found = [];
  for (const match of text.matchAll(/throw\s+httpError\(([\s\S]*?)\);\n/g)) {
    const args = match[1];
    const status = Number(args.split(",")[0]);
    if (!Number.isInteger(status) || status < 500) continue;
    found.push(args);
  }
  return found;
}

/**
 * Checks one module against an exemption map.
 *
 * Returns `{ unclassified, total }`: `unclassified` is what the caller must report as a failure, and
 * `total` exists so a guard can refuse to pass by finding nothing.
 */
function classifyModule(source, exemptions) {
  const uncoded = scanBareServerErrors(source);
  const fragments = Object.keys(exemptions);
  const unclassified = uncoded.filter((args) => !fragments.some((fragment) => args.includes(fragment)));
  return { uncoded, unclassified, total: uncoded.length };
}

/**
 * Exemptions that no longer describe a real site are stale, and a stale list is how a guard stops
 * asking questions. Every reason must be a real sentence, not a placeholder.
 */
function findStaleExemptions(seenArgs, exemptions) {
  const stale = [];
  for (const [fragment, reason] of Object.entries(exemptions)) {
    if (!seenArgs.some((args) => args.includes(fragment))) stale.push(fragment);
    if (typeof reason !== "string" || reason.trim().length <= 30) stale.push(`${fragment} (no real reason)`);
    else if (!/[\s]{1}/.test(reason.trim())) stale.push(`${fragment} (reason is not a sentence)`);
  }
  return stale;
}

module.exports = { scanBareServerErrors, classifyModule, findStaleExemptions };
