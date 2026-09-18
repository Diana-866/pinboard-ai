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
  const response = await axios.post(
    'https://gptunnel.ru/v1/images/generations',
    {
      model: 'nano-banana-pro',
      prompt: prompt,
    },
    { headers: { Authorization: process.env.GPTUNNEL_API_KEY } }
  );
  return response.data;
}

module.exports = { generateText, generateImage };