const axios = require('axios');

async function generateText(prompt) {
  const response = await axios.post(
    'https://gptunnel.ru/v1/chat/completions',
    {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    },
    { headers: { Authorization: process.env.GPTUNNEL_API_KEY } }
  );
  return response.data.choices[0].message.content;
}

async function generateImage(prompt) {
  const createResponse = await axios.post(
    'https://gptunnel.ru/api/v2/media/tasks',
    {
      model: 'nano-banana-pro',
      prompt: prompt,
      wait: true,
    },
    { headers: { Authorization: process.env.GPTUNNEL_API_KEY } }
  );

  let task = createResponse.data;

  if (task.status === 'done') {
    return { url: task.result[0].url, price: task.price };
  }

  if (task.status === 'failed') {
    throw new Error('Генерация не удалась: ' + (task.error?.message || 'неизвестная ошибка'));
  }

  const taskId = task.id;

  for (let i = 0; i < 15; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const checkResponse = await axios.get(
      `https://gptunnel.ru/api/v2/media/tasks/${taskId}`,
      { headers: { Authorization: process.env.GPTUNNEL_API_KEY } }
    );

    task = checkResponse.data;

    if (task.status === 'done') {
      return { url: task.result[0].url, price: task.price };
    }

    if (task.status === 'failed') {
      throw new Error('Генерация не удалась: ' + (task.error?.message || 'неизвестная ошибка'));
    }
  }

  throw new Error('Генерация не завершилась за отведённое время');
}

module.exports = { generateText, generateImage };