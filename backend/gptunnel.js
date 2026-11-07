const axios = require("axios");

const API_BASE = "https://gptunnel.ru";
const REQUEST_TIMEOUT_MS = 30000;

function finiteUsageNumber(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function providerRequestConfig() {
  return {
    timeout: REQUEST_TIMEOUT_MS,
    headers: { Authorization: process.env.GPTUNNEL_API_KEY },
  };
}

function buildImageTaskPayload(prompt, model = "flux-schnell", aspectRatio = "2:3", idempotencyKey) {
  const payload = {
    model,
    prompt,
    params: { aspect_ratio: aspectRatio },
    wait: true,
  };
  if (typeof idempotencyKey === "string" && idempotencyKey.trim()) {
    payload.idempotency_key = idempotencyKey.trim();
  }
  return payload;
}

function imageTaskResult(task) {
  const url = task && task.result && task.result[0] && task.result[0].url;
  const price = task && task.price;
  const taskId = task && task.id;
  if (
    typeof url !== "string" || !url ||
    !Number.isFinite(Number(price)) || Number(price) < 0 ||
    typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId)
  ) {
    throw new Error("Провайдер вернул некорректный результат генерации");
  }
  return { url, price: Number(price), taskId };
}

async function generateTextWithUsage(prompt, options = {}) {
  const payload = {
    model: options.model || "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    ...(Number.isInteger(options.maxTokens) && options.maxTokens > 0
      ? { max_tokens: options.maxTokens }
      : {}),
  };
  const response = await axios.post(
    `${API_BASE}/v1/chat/completions`,
    payload,
    providerRequestConfig()
  );
  const content = response.data && response.data.choices &&
    response.data.choices[0] && response.data.choices[0].message &&
    response.data.choices[0].message.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Провайдер не вернул текстовый результат");
  }
  const usage = response.data && response.data.usage;
  const totalCost = usage && usage.total_cost != null ? Number(usage.total_cost) : NaN;
  if ((!Number.isFinite(totalCost) || totalCost < 0) && options.requireUsage !== false) {
    const error = new Error("Провайдер не вернул достоверную стоимость текстового запроса");
    error.code = "GPTUNNEL_USAGE_COST_MISSING";
    throw error;
  }
  return {
    content,
    usage: {
      promptTokens: finiteUsageNumber(usage && usage.prompt_tokens),
      completionTokens: finiteUsageNumber(usage && usage.completion_tokens),
      totalTokens: finiteUsageNumber(usage && usage.total_tokens),
      promptCost: finiteUsageNumber(usage && usage.prompt_cost),
      completionCost: finiteUsageNumber(usage && usage.completion_cost),
      totalCost: Number.isFinite(totalCost) && totalCost >= 0 ? totalCost : null,
    },
    model: typeof response.data.model === "string" ? response.data.model : payload.model,
    requestId: typeof response.data.id === "string" ? response.data.id : null,
  };
}

async function generateText(prompt, options = {}) {
  const result = await generateTextWithUsage(prompt, { ...options, requireUsage: false });
  return result.content;
}

function normalizeIgnoredParams(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      return [item.key, item.param, item.name].find((key) => typeof key === "string") || "__unknown_ignored_param__";
    }
    return "__unknown_ignored_param__";
  });
}

function normalizeMediaQuote(data) {
  const price = data && typeof data.price === "number" ? data.price : NaN;
  if (!data || data.code !== 0 || data.price == null || data.currency !== "RUB" ||
      !Number.isFinite(price) || price < 0) {
    throw new Error("Провайдер вернул некорректную котировку генерации");
  }
  return {
    model: typeof data.model === "string" ? data.model : null,
    price,
    currency: data.currency,
    params: data.params && typeof data.params === "object" ? data.params : {},
    ignoredParams: normalizeIgnoredParams(data.ignored_params),
  };
}

async function quoteImageTask(prompt, model = "flux-schnell", aspectRatio = "2:3") {
  const response = await axios.post(
    `${API_BASE}/api/v2/media/price`,
    { model, prompt, params: { aspect_ratio: aspectRatio } },
    providerRequestConfig()
  );
  const quote = normalizeMediaQuote(response.data);
  if (quote.model !== model || quote.ignoredParams.length > 0 ||
      quote.params.aspect_ratio !== aspectRatio) {
    throw new Error("Котировка не соответствует запрошенной модели или формату изображения");
  }
  return quote;
}

async function listModels() {
  const response = await axios.get(`${API_BASE}/api/v2/media/models?type=IMAGE`, providerRequestConfig());
  const models = response.data && response.data.models;
  if (!Array.isArray(models)) throw new Error("Провайдер вернул некорректный список моделей");
  return models.map((m) => ({ id: m.id, price: m.price, price_unit: m.price_unit }));
}

async function checkImage(taskId) {
  if (typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId)) {
    throw new Error("Некорректный идентификатор задачи генерации");
  }
  const response = await axios.get(
    `${API_BASE}/api/v2/media/tasks/${encodeURIComponent(taskId)}`,
    providerRequestConfig()
  );
  return response.data;
}

async function waitForImageTask(taskId, callbacks = {}) {
  if (typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId)) {
    throw new Error("Некорректный идентификатор задачи генерации");
  }

  const maxPolls = Number.isInteger(callbacks.maxPolls) ? Math.max(1, Math.min(callbacks.maxPolls, 30)) : 30;
  const pollIntervalMs = Number.isInteger(callbacks.pollIntervalMs) ? Math.max(0, callbacks.pollIntervalMs) : 3000;
  for (let i = 0; i < maxPolls; i++) {
    if (pollIntervalMs > 0) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const task = await checkImage(taskId);

    if (task && task.status === "done") return imageTaskResult(task);

    if (task && (task.status === "queued" || task.status === "running") &&
        typeof callbacks.onTaskUpdate === "function") {
      await callbacks.onTaskUpdate(taskId, task.status);
    }

    if (task && task.status === "failed") {
      const error = new Error("Генерация не удалась: " + (task.error?.message || "неизвестная ошибка"));
      error.providerStatus = "failed";
      error.providerTaskId = taskId;
      throw error;
    }

    if (!task || !["queued", "running", "done", "failed"].includes(task.status)) {
      throw new Error("Провайдер вернул неизвестное состояние задачи");
    }
  }

  return { pending: true, taskId, message: "Ещё генерируется, проверь позже через /check-image/" + taskId };
}

async function generateImage(prompt, model = "flux-schnell", aspectRatio = "2:3", idempotencyKey, callbacks = {}) {
  const createResponse = await axios.post(
    `${API_BASE}/api/v2/media/tasks`,
    buildImageTaskPayload(prompt, model, aspectRatio, idempotencyKey),
    providerRequestConfig()
  );

  const task = createResponse.data;
  if (task && task.status === "done") return imageTaskResult(task);
  if (task && task.status === "failed") {
    const error = new Error("Генерация не удалась: " + (task.error?.message || "неизвестная ошибка"));
    error.providerStatus = "failed";
    error.providerTaskId = typeof task.id === "string" ? task.id : null;
    throw error;
  }

  const taskId = task && task.id;
  if (typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId)) {
    throw new Error("Провайдер вернул некорректный идентификатор задачи");
  }
  if (typeof callbacks.onTaskUpdate === "function") {
    await callbacks.onTaskUpdate(taskId, task && task.status === "running" ? "running" : "queued");
  }
  return waitForImageTask(taskId, callbacks);
}

module.exports = { generateText, generateTextWithUsage, quoteImageTask, normalizeMediaQuote, generateImage, waitForImageTask, listModels, checkImage, buildImageTaskPayload, imageTaskResult };
