const { generateText } = require("./gptunnel");

async function generateBoards(project) {
  const prompt = `Ты помогаешь планировать контент для Pinterest-аккаунта.
Ниша: ${project.niche || "не указана"}
Саммари сайта: ${project.site_summary || "нет данных"}
Тон и стиль: ${project.tone || "нейтральный"}
Цель: ${project.goal || "не указана"}

Придумай 5 идей досок (Pinterest boards) под эту нишу. Для каждой доски — короткое цепляющее название (до 40 символов) и описание на 1-2 предложения, оптимизированное для поиска на Pinterest (используй релевантные ключевые слова естественно).

Ответь строго в формате JSON-массива без лишнего текста:
[{"title": "...", "description": "..."}, ...]`;

  const aiResponse = await generateText(prompt);

  try {
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse);
  } catch (e) {
    throw new Error("Не удалось разобрать ответ нейросети в список досок");
  }
}

module.exports = { generateBoards };