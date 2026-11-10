const { httpError } = require("./validate");

const ANALYSIS_LIMITS = Object.freeze({ niche: 80, summary: 1200 });
const BOARD_LIMITS = Object.freeze({ count: 5, title: 40, description: 500 });
const PIN_IDEA_LIMITS = Object.freeze({ count: 10, title: 200, description: 2000, imagePrompt: 12000 });

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


function validatePinIdeas(value, requestedCount) {
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > PIN_IDEA_LIMITS.count) {
    throw httpError(502, "Некорректное количество идей пинов");
  }
  if (!Array.isArray(value) || value.length < 1) {
    throw httpError(502, "Нейросеть не вернула ни одной идеи пина");
  }
  // Keep the historical behavior of ignoring ideas beyond the requested count,
  // but never silently discard malformed entries inside the requested batch.
  return value.slice(0, requestedCount).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw httpError(502, `Некорректная идея пина №${index + 1}`);
    }
    const description = item.description == null ? "" : item.description;
    if (typeof description !== "string") {
      throw httpError(502, `Некорректная идея пина №${index + 1}: description должно быть строкой`);
    }
    const normalizedDescription = description.trim();
    if (normalizedDescription.length > PIN_IDEA_LIMITS.description) {
      throw httpError(502, `Некорректная идея пина №${index + 1}: description слишком длинное`);
    }
    return {
      title: boundedText(item.title, PIN_IDEA_LIMITS.title, `title пина №${index + 1}`),
      description: normalizedDescription,
      image_prompt: boundedText(item.image_prompt, PIN_IDEA_LIMITS.imagePrompt, `image_prompt пина №${index + 1}`),
    };
  });
}

function parsePinIdeasResponse(raw, requestedCount) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw httpError(502, "Нейросеть вернула пустой ответ при генерации пинов");
  }
  try {
    const match = raw.match(/\\[[\\s\\S]*\\]/);
    return validatePinIdeas(JSON.parse(match ? match[0] : raw), requestedCount);
  } catch (error) {
    if (error && error.httpStatus) throw error;
    throw httpError(502, "Не удалось разобрать идеи пинов от нейросети");
  }
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
  validatePinIdeas,
  parsePinIdeasResponse,
  parseAnalysisResponse,
  parseBoardIdeasResponse,
};
