"use strict";

/**
 * Section 110. Three of the last five defects were the same shape: a 5xx whose message was written
 * for the customer, thrown with `httpError`, and therefore replaced by "внутренняя ошибка сервера,
 * попробуйте позже" before it reached anyone (sections 106, 107, 109). Reading the file for them was
 * the only method, and reading is what missed them the first time.
 *
 * This guard turns that reading into an inventory. Every 5xx in the Pinterest module must either
 * carry a machine code - so the client can say it in the customer's language - or be listed below
 * with the reason why the generic sentence is the honest answer. A new uncoded 5xx fails the guard,
 * and an exemption whose site disappeared also fails it, so the list cannot rot.
 *
 * The guard cannot see a code built from a variable; it is a lower bound, and it says so.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE_PATH = path.join(__dirname, "..", "pinterest.js");

/**
 * The customer cannot act on these, so one generic sentence is more honest than a fake instruction.
 * The key is a distinctive fragment of the message in the source.
 */
const EXEMPT = {
  "Интеграция Pinterest не настроена":
    "A deployment configuration error: the message names the missing environment variables for the operator, and no code would help the customer, who can only report it.",
  "Не удалось проверить состояние обновления Pinterest-доступа":
    "Our own read of the refresh lease failed. Retrying is the only option and the generic text already says so.",
  "Не удалось безопасно начать обновление Pinterest-доступа":
    "Our own write failed before Pinterest was called; nothing happened to the connection, so there is nothing to explain.",
  "Не удалось подтвердить обновление Pinterest-доступа":
    "Same family as the line above: the retry instructions are ours, not a fact about Pinterest.",
  "Не удалось безопасно зарезервировать публикацию":
    "The reservation is ours; the customer cannot distinguish this from any other server hiccup, and a retry is safe.",
  "Не удалось безопасно отключить Pinterest":
    "The disconnect did not happen, so the account is still connected; a retry is safe and there is nothing else to say.",
};

/** Requests every 5xx and every coded refusal in the module, bound by the end of the statement. */
function scan(source) {
  const text = source.replace(/\r\n/g, "\n");
  const uncoded = [];
  const coded = [];
  const pattern = /throw\s+(httpError|pinterestTransientError|publicationReconciliationError)\(([\s\S]*?)\);\n/g;
  for (const match of text.matchAll(pattern)) {
    const [, helper, args] = match;
    if (helper === "httpError") {
      const status = Number(args.split(",")[0]);
      if (!Number.isInteger(status) || status < 500) continue;
      uncoded.push(args);
    } else {
      coded.push(args);
    }
  }
  return { uncoded, coded };
}

test("every 5xx in the Pinterest module is coded or exempted with a reason", () => {
  const source = fs.readFileSync(SOURCE_PATH, "utf8");
  const { uncoded, coded } = scan(source);

  // A broken scanner must not pass by finding nothing: the module has coded refusals either way.
  assert.ok(coded.length >= 8, `the scanner must see the coded refusals, saw ${coded.length}`);
  assert.ok(uncoded.length > 0, "the scanner must see the remaining uncoded 5xx sites");

  const unclassified = uncoded.filter((args) => !Object.keys(EXEMPT).some((fragment) => args.includes(fragment)));
  assert.deepEqual(
    unclassified.map((args) => args.slice(0, 70)),
    [],
    "a 5xx the customer can act on must carry a code instead of a message nobody sees"
  );

  // And an exemption must still describe a real site.
  for (const [fragment, reason] of Object.entries(EXEMPT)) {
    assert.ok(
      uncoded.some((args) => args.includes(fragment)),
      `the exemption "${fragment}" no longer matches a 5xx site; delete it`
    );
    assert.ok(typeof reason === "string" && reason.trim().length > 20, `the exemption "${fragment}" needs a real reason`);
  }
});

test("the scanner itself refuses a new uncoded 5xx and accepts a coded one", () => {
  // Self-check on synthetic samples: a guard that cannot tell the two apart proves nothing.
  const synthetic = [
    'throw httpError(502, "Pinterest не отвечает. Попробуйте позже.");',
    'throw pinterestTransientError("pinterest_unavailable", "…", 502);',
    'throw publicationReconciliationError("…", 503);',
    'throw httpError(422, "не 5xx, не считается");',
  ].join("\n") + "\n";
  const { uncoded, coded } = scan(synthetic);
  assert.equal(uncoded.length, 1, "exactly one uncoded 5xx in the sample");
  assert.equal(coded.length, 2, "both coded helpers must be recognised");
  assert.ok(uncoded[0].includes("Pinterest не отвечает"));
});

test("the two refusals the customer can act on carry their codes", () => {
  const source = fs.readFileSync(SOURCE_PATH, "utf8").replace(/\r\n/g, "\n");
  // A 403 from Pinterest on the board, image or text: retrying the same pin cannot help.
  assert.match(source, /pinterestTransientError\(\s*\n\s*"pinterest_publication_rejected"/);
  // A concurrent token refresh: the answer is "wait a few seconds", not "internal error".
  assert.match(source, /pinterestTransientError\(\s*\n\s*"pinterest_refresh_in_progress"/);
});
