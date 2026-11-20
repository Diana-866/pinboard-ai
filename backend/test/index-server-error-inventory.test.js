"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { scanBareServerErrors } = require("./helpers/bare-5xx-inventory");

/**
 * Section 121. `index.js` is the last big file with bare 5xx, and the admin Pinterest queue had two.
 *
 * A 5xx never carries its message, so every sentence written there is replaced by the generic
 * "внутренняя ошибка сервера, попробуйте позже". Most of these are exactly that - a service that did
 * not answer, where the only possible action is a retry, and the generic sentence already says so.
 * A few carry something else: an operator instruction, an invariant we broke, or a money fact. The
 * point of this guard is that the judgement is made and written down, so a *new* bare 5xx cannot slip
 * in carrying a fact the customer needed while looking like all the others.
 */
const INDEX_EXEMPTIONS = {
  "Сервис подтверждения email временно недоступен":
    "the confirmation service did not answer; the resend screen is still there and a retry is the whole remedy",
  "Сервис профиля временно недоступен":
    "our own profile read failed; the page reloads and no field is actionable from this answer",
  "Не удалось обновить профиль — нужно применить миграцию 003":
    "a missing deployment, not a customer problem: the operator sees it in the error log and the customer can only retry",
  "Не удалось сохранить онбординг. Проверьте, что миграция 004 применена в Supabase.":
    "an operator instruction the customer cannot act on; it belongs in the log, where logError puts it",
  "Сервис тарифов временно недоступен":
    "the tariff read did not answer; the screen offers a retry and nothing else is possible",
  "Не удалось сохранить тариф — нужно применить миграцию 004":
    "a deployment mistake, same reasoning as the onboarding write above; the log keeps the migration number",
  "Сервис проектов временно недоступен":
    "the projects read did not answer; a retry is the only action and the generic sentence already says it",
  "Сервис досок временно недоступен":
    "the boards read did not answer; a retry is the only action and the generic sentence already says it",
  "Неизвестное состояние перегенерации":
    "our own state machine met a status it does not know; there is no customer action, and the log carries the status",
  "Не удалось получить право на перегенерацию":
    "the claim on the regeneration failed, so nothing was started and nothing was charged - a retry is correct",
  "Сохранённая котировка перегенерации повреждена или не соответствует запросу.":
    "thrown before any provider call, so the generation marker attaches generation_not_charged (section 115)",
  "Неизвестное состояние запроса генерации":
    "our own invariant broke and the log carries it; the customer has no action that this answer could name",
  "Не удалось безопасно получить право на генерацию":
    "the claim failed before anything ran, so nothing was charged and a retry is the right answer",
  "Сохранённая котировка генерации не соответствует задаче.":
    "thrown before provider submission, so the generation marker attaches generation_not_charged (section 115)",
  "Не удалось сгенерировать ни одного изображения. Кредиты не списаны":
    "the route resets the provider flag here, so the marker attaches generation_not_charged (sections 115 and 117)",
  "Сервис кредитов временно недоступен":
    "the credits read did not answer; a retry is the only action and the generic sentence already says it",
};

const ADMIN_EXEMPTIONS = {
  "Не удалось загрузить очередь Pinterest":
    "the operator queue read failed; the operator refreshes, and no decision about a pin depends on this answer",
};

function audit(file, exemptions, floor) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const bare = scanBareServerErrors(source);
  assert.ok(bare.length >= floor, `${file}: expected at least ${floor} bare 5xx, found ${bare.length}`);
  for (const args of bare) {
    const matched = Object.entries(exemptions).filter(([fragment]) => args.includes(fragment));
    assert.equal(matched.length, 1, `${file}: "${args.trim().slice(0, 80)}" needs exactly one written reason`);
    assert.ok(matched[0][1].length > 30, `${file}: "${matched[0][0]}" needs a real sentence, not a placeholder`);
  }
  // An exemption that no longer matches anything is how a guard stops asking questions.
  for (const [fragment, reason] of Object.entries(exemptions)) {
    assert.ok(bare.some((args) => args.includes(fragment)), `${file}: stale exemption "${fragment}"`);
    assert.ok(reason.trim().length > 30, `${file}: "${fragment}" lost its reason`);
  }
  return bare.length;
}

test("every bare 5xx in index.js has a written reason", () => {
  assert.ok(audit("index.js", INDEX_EXEMPTIONS, 21) >= 21);
});

test("every bare 5xx in the admin Pinterest queue has a written reason", () => {
  assert.ok(audit("adminPinterestInventory.js", ADMIN_EXEMPTIONS, 2) >= 2);
});

test("the money paths are not in the exemption list at all", () => {
  // Sections 118 and 121 removed both doors that carried a money fact; if one comes back as a bare
  // 5xx, the exemption list must not be the place where it is quietly accepted.
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const bare = scanBareServerErrors(source);
  for (const moneyFact of ["Не удалось сохранить сгенерированные пины", "фактическую стоимость изображения"]) {
    assert.ok(
      !bare.some((args) => args.includes(moneyFact)),
      `"${moneyFact}" must never be a bare 5xx: it tells the customer whether they were charged`
    );
  }
});
