const axios = require("axios");

const API_BASE = "https://gptunnel.ru";
const REQUEST_TIMEOUT_MS = 30000;

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
  if (typeof url !== "string" || !url || !Number.isFinite(Number(price)) || Number(price) < 0) {
    throw new Error("Провайдер вернул некорректный результат генерации");
  }
  return { url, price: Number(price) };
}

async function generateText(prompt) {
  const response = await axios.post(
    `${API_BASE}/v1/chat/completions`,
    {
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
    },
    providerRequestConfig()
  );
  const content = response.data && response.data.choices &&
    response.data.choices[0] && response.data.choices[0].message &&
    response.data.choices[0].message.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Провайдер не вернул текстовый результат");
  }
  return content;
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

async function generateImage(prompt, model = "flux-schnell", aspectRatio = "2:3") {
  const createResponse = await axios.post(
    `${API_BASE}/api/v2/media/tasks`,
    buildImageTaskPayload(prompt, model, aspectRatio),
    providerRequestConfig()
  );

  let task = createResponse.data;

  if (task && task.status === "done") return imageTaskResult(task);

  if (task && task.status === "failed") {
    throw new Error("Генерация не удалась: " + (task.error?.message || "неизвестная ошибка"));
  }

  const taskId = task && task.id;
  if (typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId)) {
    throw new Error("Провайдер вернул некорректный идентификатор задачи");
  }

  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    task = await checkImage(taskId);

    if (task && task.status === "done") return imageTaskResult(task);

    if (task && task.status === "failed") {
      throw new Error("Генерация не удалась: " + (task.error?.message || "неизвестная ошибка"));
    }
  }

  return { pending: true, taskId, message: "Ещё генерируется, проверь позже через /check-image/" + taskId };
}

module.exports = { generateText, generateImage, listModels, checkImage, buildImageTaskPayload };
