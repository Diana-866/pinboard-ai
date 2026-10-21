const { generateText, generateImage } = require("./gptunnel");
const { rehostImage } = require("./storage");

const DEFAULT_ASPECT_RATIOS = ["2:3", "9:16", "4:5", "3:4"];

async function generatePins(board, project, model, count, aspectRatio = "mixed", ratioPool) {
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
    const err = new Error("Не удалось разобрать идеи пинов от нейросети");
    err.httpStatus = 502;
    throw err;
  }

  if (!Array.isArray(ideas) || ideas.length === 0) {
    const err = new Error("Нейросеть не вернула ни одной идеи — попробуйте ещё раз");
    err.httpStatus = 502;
    throw err;
  }

  const pool = Array.isArray(ratioPool) && ratioPool.length > 0 ? ratioPool : DEFAULT_ASPECT_RATIOS;

  const pins = [];
  for (const idea of ideas.slice(0, count)) {
    if (!idea || !idea.title || !idea.image_prompt) continue;
    const ratio = aspectRatio === "mixed" ? pool[Math.floor(Math.random() * pool.length)] : aspectRatio;
    try {
      const image = await generateImage(idea.image_prompt, model, ratio);
      if (!image || !image.url || image.price == null) continue; // незавершённая генерация — пропускаем (B8)
      try {
        // Переносим картинку в постоянное хранилище (ссылки GPTunnel временные)
        image.url = await rehostImage(image.url);
      } catch (reErr) {
        console.error(`[pins] ре-хостинг не удался, оставляем исходный URL: ${reErr && reErr.message}`);
      }
      pins.push({
        board_id: board.id,
        image_url: image.url,
        title: idea.title,
        description: idea.description || "",
        status: "pending",
        model_used: model,
        aspect_ratio: ratio,
        credits_cost: image.price,
      });
    } catch (e) {
      // одна неудачная картинка не должна валить всю партию
      console.error(`[pins] изображение не сгенерировалось: ${e && e.message}`);
      continue;
    }
  }

  return pins;
}

module.exports = { generatePins };
