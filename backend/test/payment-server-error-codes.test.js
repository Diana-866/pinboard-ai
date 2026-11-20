"use strict";

/**
 * Section 112. The Pinterest inventory (section 110) covered one module. The payment modules are the
 * other place where a 5xx can hide a message the customer needed: a 5xx never carries its text, so
 * anything written for the customer there is silently replaced by "внутренняя ошибка сервера,
 * попробуйте позже".
 *
 * This is the same rule for the money path, with the same shape: every bare `httpError(5xx, …)` must
 * be listed below with the reason why the generic sentence is the honest answer. A new one fails,
 * and an exemption whose site disappeared also fails, so the list cannot rot.
 *
 * The guard is deliberately narrow. It reads `httpError` only: a coded failure is raised through
 * `paymentError`, `paymentProviderUnavailable`, `withCode` and friends, which are not 5xx-with-a-
 * message shapes and are already covered by the error-code drift guard.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MODULES = ["billing.js", "creditsBilling.js", "credits.js", "creditPacks.js", "prodamus.js"];

/**
 * Each exemption states who reads the message and why a code would not help them.
 * The key is a distinctive fragment of the message in the source.
 */
const EXEMPT = {
  "Переотправка писем недоступна: примените миграцию 165":
    "Admin-only requeue route: the reader is the owner, and the migration number is exactly what they need.",
  "Не удалось поставить письмо в очередь":
    "Same admin route: an operator-level failure, retryable, and the generic text is accurate.",
  "Не удалось получить подписки — примените миграцию 006":
    "Our own read failed (customer and admin list). The customer cannot act and the migration hint is for the log; a code would only dress up a server fault.",
  "Не удалось получить покупки — примените миграцию 007":
    "Same as the subscription list: a failed read of the customer's own rows, nothing to instruct.",
  "Пакет кредитов не имеет цены в запрошенной валюте":
    "Unreachable by construction: assertCatalogIntegrity refuses to start a catalogue with a missing price. Kept as the fail-closed branch that must never sell a free pack.",
};

// Section 113 moved the scanner into test/helpers/bare-5xx-inventory.js: three modules use it now.
const { scanBareServerErrors: scan } = require("./helpers/bare-5xx-inventory");

test("every bare 5xx in the payment modules is exempted with a reason", () => {
  let total = 0;
  const seen = [];
  for (const module of MODULES) {
    const source = fs.readFileSync(path.join(__dirname, "..", module), "utf8");
    const uncoded = scan(source);
    total += uncoded.length;
    seen.push(...uncoded);

    const unclassified = uncoded.filter((args) => !Object.keys(EXEMPT).some((fragment) => args.includes(fragment)));
    assert.deepEqual(
      unclassified.map((args) => `${module}: ${args.slice(0, 60)}`),
      [],
      "a payment 5xx the customer can act on must carry a code instead of a message nobody sees"
    );
  }

  // A scanner that finds nothing proves nothing: the money path raises these today.
  assert.ok(total >= 5, `the scanner must see the payment 5xx sites, saw ${total}`);

  for (const [fragment, reason] of Object.entries(EXEMPT)) {
    assert.ok(
      seen.some((args) => args.includes(fragment)),
      `the exemption "${fragment}" no longer matches a 5xx site; delete it`
    );
    assert.ok(typeof reason === "string" && reason.trim().length > 30, `the exemption "${fragment}" needs a real reason`);
  }
});

test("the scanner refuses a new bare 5xx and ignores a coded one", () => {
  const synthetic = [
    'throw httpError(500, "Не удалось прочитать покупки");',
    'throw paymentProviderUnavailable("провайдер не ответил");',
    'throw httpError(422, "не 5xx, не считается");',
  ].join("\n") + "\n";
  const uncoded = scan(synthetic);
  assert.equal(uncoded.length, 1, "exactly one bare 5xx in the sample");
  assert.ok(uncoded[0].includes("Не удалось прочитать покупки"));
});
