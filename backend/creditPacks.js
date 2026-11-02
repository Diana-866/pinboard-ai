// Серверный каталог пакетов кредитов (разовые покупки).
// ПАКЕТЫ НЕ СГОРАЮТ: кредиты из пакета зачисляются на users.credits_balance навсегда.
//
// Цены задаются ТОЛЬКО здесь. Клиент присылает package_id, сумма и размер пакета
// берутся из этого каталога — сумма, пришедшая от клиента, никогда не используется
// (то же правило, что в подписках: католог один источник цен для фронтенда и вебхука).

const { httpError } = require("./validate");

const CREDIT_PACKS = {
  pack_100: { credits: 100, rub: 190, title: "Пакет S — 100 кредитов" },
  pack_500: { credits: 500, rub: 790, title: "Пакет M — 500 кредитов" },
  pack_1000: { credits: 1000, rub: 1290, title: "Пакет L — 1000 кредитов" },
};

const CURRENCIES = ["rub"]; // пакеты продаются только за рубли

function packCatalog() {
  return Object.entries(CREDIT_PACKS).map(([id, p]) => ({
    id,
    title: p.title,
    credits: p.credits,
    amount: { rub: p.rub },
  }));
}

/** Валидация выбора пакета из запроса клиента */
function normalizePackId(raw) {
  const id = String(raw || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CREDIT_PACKS, id) ? id : null;
}

/** Цена пакета в валюте покупки */
function packAmount(packId, currency) {
  const pack = CREDIT_PACKS[packId];
  if (!pack) throw httpError(422, "Пакет не найден");
  if (!CURRENCIES.includes(currency)) {
    throw httpError(422, "Валюта не поддерживается для пакетов кредитов");
  }
  return pack.rub;
}

module.exports = { CREDIT_PACKS, CURRENCIES, packCatalog, normalizePackId, packAmount };