// Серверный каталог пакетов кредитов (разовые покупки).
// ПАКЕТЫ НЕ СГОРАЮТ: кредиты из пакета зачисляются на users.credits_balance навсегда.
//
// Цены задаются ТОЛЬКО здесь. Клиент присылает package_id, сумма и размер пакета
// берутся из этого каталога — сумма, пришедшая от клиента, никогда не используется
// (то же правило, что в подписках: католог один источник цен для фронтенда и вебхука).
//
// Цена хранится в разрезе валюты (amount.rub), а не одним числом: если когда-нибудь
// появится вторая валюта, код физически не сможет молча вернуть рублёвую сумму.

const { httpError } = require("./validate");

// Единственная валюта пакетов на сегодня.
const CURRENCIES = ["rub"];

const CREDIT_PACKS = {
  pack_100: {
    credits: 100,
    amount: { rub: 190 },
    title: "Пакет S — 100 кредитов",
  },
  pack_500: {
    credits: 500,
    amount: { rub: 790 },
    title: "Пакет M — 500 кредитов",
  },
  pack_1000: {
    credits: 1000,
    amount: { rub: 1290 },
    title: "Пакет L — 1000 кредитов",
  },
};

/**
 * Каталог — источник цен для платежей, поэтому его целостность проверяется при
 * загрузке модуля: лучше не стартовать, чем выставить счёт с нулевой или
 * неокруглённой суммой. Идентификатор пакета кодирует его размер (pack_500 =
 * 500 кредитов), и расхождение вводило бы покупателя в заблуждение.
 */
function assertCatalogIntegrity(packs, currencies) {
  const problems = [];
  for (const [id, pack] of Object.entries(packs)) {
    if (!/^pack_[0-9]+$/.test(id)) {
      problems.push(`${id}: идентификатор должен иметь вид pack_<количество кредитов>`);
      continue;
    }
    if (!Number.isInteger(pack.credits) || pack.credits <= 0) {
      problems.push(`${id}: credits должен быть целым положительным числом`);
    }
    if (Number(id.slice("pack_".length)) !== pack.credits) {
      problems.push(`${id}: идентификатор не совпадает с credits=${pack.credits}`);
    }
    if (typeof pack.title !== "string" || !pack.title.trim()) {
      problems.push(`${id}: title обязателен`);
    }
    for (const currency of currencies) {
      const amount = pack.amount && pack.amount[currency];
      if (!Number.isInteger(amount) || amount <= 0) {
        problems.push(`${id}: amount.${currency} должен быть целым положительным числом`);
      }
    }
  }
  const ids = Object.keys(packs);
  const amounts = new Set();
  for (const id of ids) {
    const key = JSON.stringify(packs[id].amount);
    if (amounts.has(key)) problems.push(`${id}: дублирующая цена ${key}`);
    amounts.add(key);
  }
  if (problems.length) {
    throw new Error(`Некорректный каталог пакетов кредитов: ${problems.join("; ")}`);
  }
}

assertCatalogIntegrity(CREDIT_PACKS, CURRENCIES);

function packCatalog() {
  return Object.entries(CREDIT_PACKS).map(([id, pack]) => ({
    id,
    title: pack.title,
    credits: pack.credits,
    amount: { ...pack.amount },
  }));
}

/**
 * Валидация выбора пакета из запроса клиента.
 * Принимаются только строковые идентификаторы: `["pack_100"]` из JSON-тела — не
 * строка, и приводить её через String() нельзя, иначе массив прошёл бы проверку.
 */
function normalizePackId(raw) {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CREDIT_PACKS, id) ? id : null;
}

/** Цена пакета в валюте покупки */
function packAmount(packId, currency) {
  const pack = Object.prototype.hasOwnProperty.call(CREDIT_PACKS, packId)
    ? CREDIT_PACKS[packId]
    : null;
  if (!pack) throw httpError(422, "Пакет не найден");
  if (!CURRENCIES.includes(currency)) {
    throw httpError(422, "Валюта не поддерживается для пакетов кредитов");
  }
  const amount = pack.amount[currency];
  if (!Number.isInteger(amount) || amount <= 0) {
    // Fail closed: отсутствие цены не должно превращаться в бесплатный пакет.
    throw httpError(500, "Пакет кредитов не имеет цены в запрошенной валюте");
  }
  return amount;
}

module.exports = {
  CREDIT_PACKS,
  CURRENCIES,
  assertCatalogIntegrity,
  packCatalog,
  normalizePackId,
  packAmount,
};
