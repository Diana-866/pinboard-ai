const MAX_ID_LENGTH = 100;

function normalizeReviewQueuePin(idValue, payload) {
  const id = String(idValue || "").trim();
  if (!id || id.length > MAX_ID_LENGTH || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    const error = new Error("Некорректная запись очереди проверки");
    error.httpStatus = 422;
    throw error;
  }
  if (String(payload.id || "") !== id) {
    const error = new Error("ID записи не совпадает");
    error.httpStatus = 422;
    throw error;
  }

  const title = String(payload.title || "").trim();
  const description = String(payload.description || "");
  if (!title || title.length > 100 || description.length > 500) {
    const error = new Error("Проверьте заголовок и описание пина");
    error.httpStatus = 422;
    throw error;
  }

  return {
    id,
    title,
    description,
    boardName: String(payload.boardName || "").slice(0, 120),
    boardId: String(payload.boardId || "").slice(0, 100),
    imageUrl: String(payload.imageUrl || "").slice(0, 2048),
    aspectRatio: String(payload.aspectRatio || "2:3").slice(0, 10),
    reason: String(payload.reason || "").slice(0, 1000),
    trendMetric: String(payload.trendMetric || "").slice(0, 160),
    scheduledTime: String(payload.scheduledTime || "").slice(0, 5),
    scheduledDate: String(payload.scheduledDate || "").slice(0, 10),
    destinationUrl: String(payload.destinationUrl || "").slice(0, 2048),
    accountHandle: payload.accountHandle ? String(payload.accountHandle).slice(0, 100) : undefined,
    accountId: payload.accountId ? String(payload.accountId).slice(0, 100) : undefined,
    pinId: payload.pinId ? String(payload.pinId).slice(0, 100) : undefined,
  };
}

module.exports = { normalizeReviewQueuePin };
