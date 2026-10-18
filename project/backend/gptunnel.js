const axios = require("axios");

async function generateText(prompt) {
  const response = await axios.post(
    "https://gptunnel.ru/v1/chat/completions",
    {
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
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

async function generateImage(prompt, model = "flux-schnell", aspectRatio = "2:3") {
  const createResponse = await axios.post(
    "https://gptunnel.ru/api/v2/media/tasks",
    {
      model: model,
      prompt: prompt,
      aspect_ratio: aspectRatio,
      wait: true,
    },
    { headers: { Authorization: process.env.GPTUNNEL_API_KEY } }
  );

  let task = createResponse.data;
  console.log("GPTunnel task result:", JSON.stringify(task));

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
