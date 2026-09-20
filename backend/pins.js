const { generateText, generateImage } = require("./gptunnel");

async function generatePins(board, project, model, count) {
  const prompt = `Ты придумываешь пины для Pinterest-доски.
Доска: ${board.title}
Описание доски: ${board.description}
Ниша: ${project.niche || "не указана"}
Тон: ${project.tone || "нейтральный"}

Придумай ${count} идей пинов для этой доски. Для каждого пина: короткий заголовок (до 60 символов), описание для поиска на Pinterest (1-2 предложения, с ключевыми словами) и image_prompt — подробное описание изображения на английском языке для генерации через AI (стиль, композиция, объект).

Ответь строго в формате JSON-массива без лишнего текста:
[{"title": "...", "description": "...", "image_prompt": "..."}, ...]`;

  const aiResponse = await generateText(prompt);

  let ideas;
  try {
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    ideas = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse);
  } catch (e) {
    throw new Error("Не удалось разобрать идеи пинов от нейросети");
  }

  const pins = [];
  for (const idea of ideas) {
    const image = await generateImage(idea.image_prompt, model);
    pins.push({
      board_id: board.id,
      image_url: image.url,
      title: idea.title,
      description: idea.description,
      status: "pending",
      model_used: model,
      credits_cost: image.price,
    });
  }

  return pins;
}

module.exports = { generatePins };