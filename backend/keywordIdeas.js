const { generateText } = require("./gptunnel");
const { httpError } = require("./validate");

/**
 * Pinterest keyword ideas.
 *
 * The service has no access to Pinterest's internal search-volume data, so this
 * endpoint deliberately returns only what a language model can honestly produce:
 * a keyword phrase, the search intent behind it and one line on why it fits the
 * niche. No invented volumes, competition scores or trend percentages — those
 * numbers looked authoritative in the UI and were made up.
 */
const KEYWORD_LIMITS = Object.freeze({
  count: 20,
  keyword: 100,
  why: 200,
});

const INTENTS = Object.freeze(["inspiration", "how_to", "product", "style", "seasonal"]);

function boundedText(value, max, label) {
  if (typeof value !== "string") {
    throw httpError(502, `Некорректный ответ нейросети: поле «${label}» должно быть строкой`);
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > max) {
    throw httpError(502, `Некорректный ответ нейросети: поле «${label}» должно содержать от 1 до ${max} символов`);
  }
  return normalized;
}

function validateKeywordIdeas(value, requestedCount) {
  const limit = Number.isInteger(requestedCount) && requestedCount > 0
    ? Math.min(requestedCount, KEYWORD_LIMITS.count)
    : KEYWORD_LIMITS.count;

  if (!Array.isArray(value) || value.length === 0) {
    throw httpError(502, "Нейросеть не вернула ни одной идеи ключевого слова");
  }

  const seen = new Set();
  const ideas = [];
  for (const [index, item] of value.entries()) {
    if (ideas.length >= limit) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw httpError(502, `Некорректная идея ключевого слова №${index + 1}`);
    }
    const keyword = boundedText(item.keyword, KEYWORD_LIMITS.keyword, `keyword №${index + 1}`);
    const fingerprint = keyword.toLocaleLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    // An unexpected intent must not fail the whole batch: fall back to the
    // neutral one instead of inventing a category.
    const intent = INTENTS.includes(item.intent) ? item.intent : "inspiration";
    ideas.push({
      keyword,
      intent,
      why: boundedText(item.why, KEYWORD_LIMITS.why, `why №${index + 1}`),
    });
  }

  if (ideas.length === 0) {
    throw httpError(502, "Нейросеть вернула только повторы ключевых слов");
  }
  return ideas;
}

function parseKeywordIdeasResponse(raw, requestedCount) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw httpError(502, "Нейросеть вернула пустой ответ при подборе ключевых слов");
  }
  try {
    // The model sometimes wraps the array in prose or a code fence.
    const match = raw.match(/\[[\s\S]*\]/);
    return validateKeywordIdeas(JSON.parse(match ? match[0] : raw), requestedCount);
  } catch (error) {
    if (error && error.httpStatus) throw error;
    throw httpError(502, "Не удалось разобрать идеи ключевых слов от нейросети");
  }
}

function buildKeywordPrompt({ topic, niche, language, count }) {
  return `Ты — Pinterest SEO стратег. Подбери ${count} поисковых фраз, по которым люди ищут контент в Pinterest.

Тема: ${topic}
Ниша проекта: ${niche || "не указана"}
Язык фраз: ${language}

Требования:
— фраза должна быть похожа на реальный поисковый запрос в Pinterest: 2–6 слов, без хештегов;
— фразы не должны повторяться и не должны быть перестановкой одних и тех же слов;
— в поле intent укажи один из вариантов: inspiration, how_to, product, style, seasonal;
— в поле why объясни одной короткой фразой, кому и зачем этот запрос подходит.

Не придумывай числа: не указывай объём поиска, конкуренцию, тренды или проценты — их у нас нет.
Ответь строго JSON-массивом без пояснений:
[{"keyword": "...", "intent": "inspiration", "why": "..."}]`;
}

async function suggestKeywords({ topic, niche, language, count }) {
  const requested = Number.isInteger(count) && count > 0 ? Math.min(count, KEYWORD_LIMITS.count) : 12;
  const response = await generateText(buildKeywordPrompt({ topic, niche, language, count: requested }));
  return parseKeywordIdeasResponse(response, requested);
}

module.exports = {
  KEYWORD_LIMITS,
  INTENTS,
  validateKeywordIdeas,
  parseKeywordIdeasResponse,
  buildKeywordPrompt,
  suggestKeywords,
};
