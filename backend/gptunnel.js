const axios = require("axios");
const { resolveServiceBaseUrl } = require("./serviceBaseUrl");
const { httpError } = require("./validate");
const { looksLikePlaceholder } = require("./mail");

const DEFAULT_API_BASE = "https://gptunnel.ru";
const REQUEST_TIMEOUT_MS = 30000;

/**
 * The provider address, with a deliberately narrow test seam.
 *
 * The AI routes are the largest untested surface in the product - they are where credits are spent -
 * and they could not be exercised at all because every provider call goes to a hard-wired address.
 * `AI_PROVIDER_BASE_URL` exists so a test can point one child process at a local stand-in.
 *
 * It fails closed: an override is honoured only when the environment is explicitly development or
 * test, exactly like the dev top-up. In production, staging, or with NODE_ENV unset the constant wins,
 * because a redirected provider would send customer prompts - and the API key in the Authorization
 * header - to whatever address the variable names.
 */
function resolveApiBase(env = process.env) {
  return resolveServiceBaseUrl({ env, variable: "AI_PROVIDER_BASE_URL", defaultBase: DEFAULT_API_BASE });
}

const API_BASE = resolveApiBase();

function finiteUsageNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Раздел 159. Ключ провайдера, заполненный заглушкой (`GPTUNNEL_API_KEY=<gptunnel-key>`), раньше
 * уходил в заголовок как есть: провайдер отвечал 401, axios бросал ошибку, и клиент получал
 * невнятный отказ на самом дорогом действии продукта. Проверка до запроса называет причину.
 */
function providerRequestConfig(env = process.env) {
  const key = env && env.GPTUNNEL_API_KEY;
  if (looksLikePlaceholder(key)) {
    const error = httpError(503, "Генерация недоступна: ключ AI-провайдера не настроен на сервере");
    error.details = { ...(error.details || {}), code: "ai_provider_not_configured" };
    throw error;
  }
  return {
    timeout: REQUEST_TIMEOUT_MS,
    headers: { Authorization: key },
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

function providerTaskError(task) {
  const providerError = task && task.error && typeof task.error === "object" ? task.error : {};
  const price = task && typeof task.price === "number" && Number.isFinite(task.price) && task.price >= 0
    ? task.price
    : null;
  const error = new Error("Генерация не удалась: " + (providerError.message || "неизвестная ошибка"));
  error.providerStatus = "failed";
  error.providerTaskId = typeof task?.id === "string" ? task.id : null;
  error.providerPrice = price;
  error.providerRefunded = typeof task?.refunded === "boolean" ? task.refunded : null;
  error.providerErrorCode = Number.isInteger(providerError.code) ? providerError.code : null;
  error.providerErrorTitle = typeof providerError.title === "string" ? providerError.title.slice(0, 120) : null;
  return error;
}

function imageTaskResult(task) {
  const url = task && task.result && task.result[0] && task.result[0].url;
  const price = task && task.price;
  const taskId = task && task.id;
  let parsedUrl = null;
  if (typeof url === "string") {
    try {
      parsedUrl = new URL(url);
    } catch {
      parsedUrl = null;
    }
  }
  if (
    !parsedUrl ||
    parsedUrl.protocol !== "https:" ||
    !parsedUrl.hostname ||
    parsedUrl.username ||
    parsedUrl.password ||
    !Number.isFinite(Number(price)) || Number(price) <= 0 ||
    typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId)
  ) {
    throw new Error("Провайдер вернул некорректный результат генерации");
  }
  return { url: parsedUrl.toString(), price: Number(price), taskId };
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
  const totalCost = finiteUsageNumber(usage && usage.total_cost);
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
      cachedPromptTokens: finiteUsageNumber(usage && usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens),
      cacheWriteTokens: finiteUsageNumber(usage && usage.prompt_tokens_details && usage.prompt_tokens_details.cache_write_tokens),
    },
    costCurrency: "RUB",
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


/**
 * Диагностика отказов провайдера в журнале: статус HTTP-ответа провайдера — статичное
 * целое число, которое безопасно печатать. Без него отказ котировки выглядел в логе как
 * безымянный Error, и причину (нет модели, нет баланса, изменённый формат) нельзя было
 * назвать без доступа к внутренностям ответа.
 */
function logGPTunnelHttpFailure(status, data) {
  if (!Number.isInteger(status) || status < 400 || status > 599) return;
  let code;
  let rawMessage;
  try {
    if (data && typeof data === "object") {
      const nested = data.error && typeof data.error === "object" ? data.error : null;
      const candidate = data.code !== undefined ? data.code : nested && nested.code;
      if (Number.isSafeInteger(candidate) && candidate >= 0 && candidate <= 999999) code = candidate;
      else if (typeof candidate === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(candidate)) code = candidate;
      rawMessage = typeof data.message === "string" ? data.message
        : typeof data.error_description === "string" ? data.error_description
          : nested && typeof nested.message === "string" ? nested.message
            : typeof data.error === "string" ? data.error : undefined;
    } else if (typeof data === "string") {
      rawMessage = data;
    }
  } catch {
    // Never serialize an untrusted provider envelope.
  }
  const record = { level: "error", event: "gptunnel.provider_response_failed", provider_status: status };
  if (code !== undefined) record.provider_code = code;
  if (typeof rawMessage === "string" && rawMessage.trim()) {
    record.provider_message = rawMessage
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
      .replace(/\b(access_token|refresh_token|client_secret|api_key|token|authorization)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
      .replace(/\bgpt_[A-Za-z0-9_-]{8,}\b/gi, "[redacted]")
      .slice(0, 240);
  }
  console.error(JSON.stringify(record));
}

function withProviderStatus(error) {
  if (error && error.isAxiosError && Number.isInteger(error.response && error.response.status)) {
    error.providerStatus = error.response.status;
    if (!error.gptunnelDiagnosticLogged) {
      logGPTunnelHttpFailure(error.response.status, error.response.data);
      error.gptunnelDiagnosticLogged = true;
    }
  }
  return error;
}

async function quoteImageTask(prompt, model = "flux-schnell", aspectRatio = "2:3") {
  let response;
  try {
    response = await axios.post(
      `${API_BASE}/api/v2/media/price`,
      { model, prompt, params: { aspect_ratio: aspectRatio } },
      providerRequestConfig()
    );
  } catch (error) {
    throw withProviderStatus(error);
  }
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

/**
 * Каталог картинок-моделей провайдера меняется: снятые модели отвечают отказом
 * (code 15 / HTTP 410), а имена и цены обновляются. Выбор замены вынесен в чистую
 * функцию: она не ходит в сеть и легко проверяется тестом.
 */
function modelParamEntries(params) {
  if (Array.isArray(params)) {
    return params.filter((entry) => entry && typeof entry.key === "string");
  }
  if (params && typeof params === "object") {
    return Object.entries(params).map(([key, value]) => ({
      key,
      ...(value && typeof value === "object" ? value : {}),
    }));
  }
  return [];
}

function modelHasParam(params, key) {
  if (Array.isArray(params) && params.includes(key)) return true;
  return modelParamEntries(params).some((entry) => entry.key === key);
}

function getImageAspectRatios(params) {
  const parameter = modelParamEntries(params).find((entry) => entry.key === "aspect_ratio");
  const options = parameter && (parameter.options || parameter.values || parameter.enum);
  if (!Array.isArray(options)) return [];
  return options
    .map((option) => typeof option === "string" ? option : option && option.value)
    .filter((value) => typeof value === "string" && /^[0-9]{1,2}:[0-9]{1,2}$/.test(value));
}

function chooseFallbackImageModel(models, requestedModel) {
  const list = Array.isArray(models) ? models : [];
  return list
    .filter((m) => m && typeof m.id === "string"
      && m.id !== requestedModel
      && Number(m.price) > 0
      && !(m.deprecated === true)
      && modelHasParam(m.params, "aspect_ratio"))
    .sort((a, b) => Number(a.price) - Number(b.price))[0] || null;
}

async function listImageModelsFull() {
  const response = await axios.get(`${API_BASE}/api/v2/media/models?type=IMAGE`, providerRequestConfig());
  const models = response.data && response.data.models;
  if (!Array.isArray(models)) throw new Error("Провайдер вернул некорректный список моделей");
  return models.map((m) => ({
    id: m.id,
    price: Number(m.price),
    deprecated: m.deprecated === true,
    params: modelParamEntries(m.params).map((parameter) => parameter.key),
    aspect_ratios: getImageAspectRatios(m.params),
  }));
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
      throw providerTaskError({ ...task, id: taskId });
    }

    if (!task || !["queued", "running", "done", "failed"].includes(task.status)) {
      throw new Error("Провайдер вернул неизвестное состояние задачи");
    }
  }

  return { pending: true, taskId, message: "Ещё генерируется, проверь позже через /check-image/" + taskId };
}

async function generateImage(prompt, model = "flux-schnell", aspectRatio = "2:3", idempotencyKey, callbacks = {}) {
  let createResponse;
  try {
    createResponse = await axios.post(
      `${API_BASE}/api/v2/media/tasks`,
      buildImageTaskPayload(prompt, model, aspectRatio, idempotencyKey),
      providerRequestConfig()
    );
  } catch (error) {
    throw withProviderStatus(error);
  }

  const task = createResponse.data;
  if (task && task.status === "failed") {
    throw providerTaskError(task);
  }

  const taskId = task && task.id;
  if (typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId)) {
    throw new Error("Провайдер вернул некорректный идентификатор задачи");
  }
  if (task && task.status === "done") {
    // A provider may complete synchronously in the create response. Persist its
    // immutable task ID and terminal status before returning the result so a
    // backend restart never has to rediscover it through provider idempotency.
    const result = imageTaskResult(task);
    if (typeof callbacks.onTaskUpdate === "function") {
      await callbacks.onTaskUpdate(taskId, "succeeded");
    }
    return result;
  }
  if (typeof callbacks.onTaskUpdate === "function") {
    await callbacks.onTaskUpdate(taskId, task && task.status === "running" ? "running" : "queued");
  }
  return waitForImageTask(taskId, callbacks);
}

module.exports = { logGPTunnelHttpFailure, withProviderStatus, modelParamEntries, modelHasParam, getImageAspectRatios, chooseFallbackImageModel, listImageModelsFull, providerRequestConfig, resolveApiBase, DEFAULT_API_BASE, providerTaskError, generateText, generateTextWithUsage, quoteImageTask, normalizeMediaQuote, generateImage, waitForImageTask, listModels, checkImage, buildImageTaskPayload, imageTaskResult };
