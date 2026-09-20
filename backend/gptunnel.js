const axios = require("axios");

async function generateImage(prompt, model = "nano-banana-2-lite") {
  const createResponse = await axios.post(
    "https://gptunnel.ru/api/v2/media/tasks",
    {
      model: model,
      prompt: prompt,
      wait: true,
    },
    { headers: { Authorization: process.env.GPTUNNEL_API_KEY } }
  );
  return response.data.choices[0].message.content;
}

async function listModels() {
  const response = await axios.get("https://gptunnel.ru/api/v2/media/models?type=IMAGE", {
    headers: { Authorization: process.env.GPTUNNEL_API_KEY },
  });
  return response.data.models.map((m) => ({ id: m.id, price: m.price, price_unit: m.price_unit }));
}

async function checkImage(taskId) {
  const response = await axios.get(`https://gptunnel.ru/api/v2/media/tasks/${taskId}`, {
    headers: { Authorization: process.env.GPTUNNEL_API_KEY },
  });
  return response.data;
}

async function generateImage(prompt) {
  const createResponse = await axios.post(
    "https://gptunnel.ru/api/v2/media/tasks",
    {
      model: "nano-banana-pro",
      prompt: prompt,
      wait: true,
    },
    { headers: { Authorization: process.env.GPTUNNEL_API_KEY } }
  );

  let task = createResponse.data;

  if (task.status === "done") {
    return { url: task.result[0].url, price: task.price };
  }

  if (task.status === "failed") {
    throw new Error("Генерация не удалась: " + (task.error?.message || "неизвестная ошибка"));
  }

  const taskId = task.id;

  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const check = await checkImage(taskId);
    task = check;

    if (task.status === "done") {
      return { url: task.result[0].url, price: task.price };
    }

    if (task.status === "failed") {
      throw new Error("Генерация не удалась: " + (task.error?.message || "неизвестная ошибка"));
    }
  }

  return { pending: true, taskId, message: "Ещё генерируется, проверь позже через /check-image/" + taskId };
}

module.exports = { generateText, generateImage, listModels, checkImage };
