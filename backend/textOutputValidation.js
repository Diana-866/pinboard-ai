const { httpError } = require("./validate");

const ANALYSIS_LIMITS = Object.freeze({ niche: 80, summary: 1200 });
const BOARD_LIMITS = Object.freeze({ count: 5, title: 40, description: 500 });

function boundedText(value, max, label) {
  if (typeof value !== "string") throw httpError(502, `Некорректный ответ нейросети: поле «${label}» должно быть строкой`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw httpError(502, `Некорректный ответ нейросети: поле «${label}» должно содержать от 1 до ${max} символов`);
  }
  return normalized;
}

function validateAnalysisResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(502, "Нейросеть вернула некорректный результат анализа сайта");
  }
  return {
    niche: boundedText(value.niche, ANALYSIS_LIMITS.niche, "niche"),
    summary: boundedText(value.summary, ANALYSIS_LIMITS.summary, "summary"),
  };
}

function validateBoardIdeas(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > BOARD_LIMITS.count) {
    throw httpError(502, `Нейросеть должна вернуть от 1 до ${BOARD_LIMITS.count} идей досок`);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw httpError(502, `Некорректная идея доски №${index + 1}`);
    }
    return {
      title: boundedText(item.title, BOARD_LIMITS.title, `title №${index + 1}`),
      description: boundedText(item.description, BOARD_LIMITS.description, `description №${index + 1}`),
    };
  });
}

function parseAnalysisResponse(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw httpError(502, "Нейросеть вернула пустой ответ при анализе сайта");
  }
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return validateAnalysisResult(JSON.parse(match ? match[0] : raw));
  } catch (error) {
    if (error && error.httpStatus) throw error;
    throw httpError(502, "Не удалось разобрать ответ нейросети при анализе сайта");
  }
}

function parseBoardIdeasResponse(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw httpError(502, "Нейросеть вернула пустой ответ при генерации досок");
  }
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    return validateBoardIdeas(JSON.parse(match ? match[0] : raw));
  } catch (error) {
    if (error && error.httpStatus) throw error;
    throw httpError(502, "Не удалось разобрать ответ нейросети в список досок");
  }
}

module.exports = {
  ANALYSIS_LIMITS,
  BOARD_LIMITS,
  validateAnalysisResult,
  validateBoardIdeas,
  parseAnalysisResponse,
  parseBoardIdeasResponse,
};
