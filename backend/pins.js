const { generateText, generateImage } = require("./gptunnel");
const { rehostImage } = require("./storage");

const DEFAULT_ASPECT_RATIOS = ["2:3", "9:16", "4:5", "3:4"];

async function generatePins(board, project, model, count, aspectRatio = "mixed", ratioPool, options = {}) {
  const topic = typeof options.topic === "string" ? options.topic.slice(0, 500) : "";
  const tone = typeof options.tone === "string" ? options.tone.slice(0, 80) : project.tone || "нейтральный";
  const language = typeof options.language === "string" ? options.language.slice(0, 12) : project.language || "en";
  const languageNames = {
    ru: "русский (Russian)",
    en: "английский (English)",
    de: "немецкий (German)",
    fr: "французский (French)",
    es: "испанский (Spanish)",
    pt: "португальский (Portuguese)",
    zh: "китайский (Chinese)",
    it: "итальянский (Italian)",
    ja: "японский (Japanese)",
  };
  const outputLanguage = languageNames[language] || language;
  const prompt = `Ты придумываешь пины для Pinterest-доски.
Доска: ${board.title}
Описание доски: ${board.description}
Ниша: ${project.niche || "не указана"}
Тема текущей генерации: ${topic || board.title}
Язык результата: ${outputLanguage}
Тон: ${tone}

Придумай ${count} уникальных идей пинов строго на указанном языке. Для каждого пина: короткий заголовок (до 60 символов), описание для поиска на Pinterest (1-2 предложения, с ключевыми словами) и image_prompt — подробное описание изображения на английском языке для генерации через AI (стиль, композиция, объект). Не выдумывай статистику и факты.

Ответь строго в формате JSON-массива без лишнего текста:
[{"title": "...", "description": "...", "image_prompt": "..."}]`;

  let tasks;
  if (typeof options.loadPlan === "function") {
    tasks = await options.loadPlan();
  } else {
    // Text-plan generation is a billable provider boundary too. Mark the parent
    // request outcome as uncertain before sending; if the response or later journal
    // write is lost, the same idempotency key must not silently call the provider again.
    if (typeof options.onTextProviderSubmission === "function") {
      options.onTextProviderSubmission();
    }
    const aiResponse = await generateText(prompt);

    let ideas;
    try {
      const jsonMatch = aiResponse.match(/\\[[\\s\\S]*\\]/);
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
    const plannedTasks = ideas.slice(0, count)
      .filter((idea) => idea && idea.title && idea.image_prompt)
      .map((idea, index) => ({
        task_index: index + 1,
        title: String(idea.title).slice(0, 200),
        description: String(idea.description || "").slice(0, 2000),
        prompt: String(idea.image_prompt).slice(0, 12000),
        model,
        aspect_ratio: aspectRatio === "mixed" ? pool[Math.floor(Math.random() * pool.length)] : aspectRatio,
      }));

    tasks = typeof options.persistPlan === "function"
      ? await options.persistPlan(plannedTasks)
      : plannedTasks;
  }

  if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > 10) {
    throw new Error("Не удалось восстановить сохранённый план генерации");
  }

  const pins = [];
  const pendingTasks = [];
  const unknownTasks = [];
  const failedTasks = [];
  for (const task of tasks) {
    const ratio = task.aspect_ratio;
    const taskIndex = Number(task.task_index);
    let providerSucceeded = false;
    if (task.status === "failed") {
      failedTasks.push({ task_index: taskIndex });
      continue;
    }
    const canSubmitPreparedTask = typeof options.allowPreparedTaskSubmission === "function"
      ? options.allowPreparedTaskSubmission()
      : options.allowPreparedTaskSubmission !== false;
    if (task.status === "prepared" && !canSubmitPreparedTask) {
      // Keep not-yet-confirmed submissions in the journal when the user cannot currently
      // cover another provider call; already-submitted tasks remain recoverable.
      pendingTasks.push({ task_index: taskIndex, status: "awaiting_balance" });
      continue;
    }
    if (task.status === "succeeded" && task.storage_url && task.provider_price != null) {
      pins.push({
        board_id: board.id,
        image_url: task.storage_url,
        title: task.title,
        description: task.description || "",
        status: "pending",
        model_used: task.model || model,
        aspect_ratio: ratio,
        credits_cost: Number(task.provider_price),
      });
      continue;
    }
    // If GPTunnel already returned a result but Storage failed, retry the
    // durable copy from the exact journaled URL. Do not submit another provider
    // create request or depend on provider-side idempotency retention.
    if (task.status === "succeeded" && task.provider_result_url && task.provider_price != null) {
      try {
        providerSucceeded = true;
        const storedUrl = await rehostImage(task.provider_result_url, {
          idempotencyKey: task.provider_idempotency_key,
        });
        if (typeof storedUrl !== "string" || !storedUrl.trim()) {
          throw new Error("Не удалось получить постоянную ссылку на изображение");
        }
        if (typeof options.updateTask === "function") {
          await options.updateTask(taskIndex, "succeeded", {
            providerTaskId: task.provider_task_id,
            providerResultUrl: task.provider_result_url,
            storageUrl: storedUrl,
            providerPrice: task.provider_price,
          });
        }
        pins.push({
          board_id: board.id,
          image_url: storedUrl,
          title: task.title,
          description: task.description || "",
          status: "pending",
          model_used: task.model || model,
          aspect_ratio: ratio,
          credits_cost: Number(task.provider_price),
        });
        continue;
      } catch (e) {
        if (e && e.journalError) throw e;
        unknownTasks.push({ task_index: taskIndex });
        console.error(`[pins] не удалось восстановить Storage для готовой задачи: ${e && e.message}`);
        continue;
      }
    }
    try {
      if (typeof options.updateTask === "function" && (!task.status || task.status === "prepared")) {
        await options.updateTask(taskIndex, "submitting");
      }
      if (typeof options.onProviderSubmission === "function") {
        options.onProviderSubmission();
      }
      const image = await generateImage(
        task.prompt,
        task.model || model,
        ratio,
        task.provider_idempotency_key,
        {
          onTaskUpdate: async (taskId, status) => {
            if (typeof options.updateTask === "function") {
              await options.updateTask(taskIndex, status, { providerTaskId: taskId });
            }
          },
        }
      );

      if (image && image.pending && image.taskId) {
        if (typeof options.updateTask === "function") {
          await options.updateTask(taskIndex, "queued", { providerTaskId: image.taskId });
        }
        pendingTasks.push({ task_index: taskIndex, task_id: image.taskId });
        continue;
      }
      if (!image || !image.url || image.price == null) {
        unknownTasks.push({ task_index: taskIndex });
        if (typeof options.updateTask === "function") {
          await options.updateTask(taskIndex, "unknown", { errorCode: "provider_result_missing" });
        }
        continue;
      }

      if (typeof options.updateTask === "function") {
        await options.updateTask(taskIndex, "succeeded", {
          providerTaskId: image.taskId,
          providerResultUrl: image.url,
          providerPrice: image.price,
        });
      }
      providerSucceeded = true;
      const storedUrl = await rehostImage(image.url, { idempotencyKey: task.provider_idempotency_key });
      if (typeof storedUrl !== "string" || !storedUrl.trim()) {
        throw new Error("Не удалось получить постоянную ссылку на изображение");
      }
      if (typeof options.updateTask === "function") {
        await options.updateTask(taskIndex, "succeeded", {
          providerTaskId: image.taskId,
          providerResultUrl: image.url,
          storageUrl: storedUrl,
          providerPrice: image.price,
        });
      }
      pins.push({
        board_id: board.id,
        image_url: storedUrl,
        title: task.title,
        description: task.description || "",
        status: "pending",
        model_used: task.model || model,
        aspect_ratio: ratio,
        credits_cost: image.price,
      });
    } catch (e) {
      if (e && e.journalError) throw e;
      if (e && e.providerStatus === "failed") {
        if (typeof options.updateTask === "function") {
          await options.updateTask(taskIndex, "failed", {
            providerTaskId: e.providerTaskId,
            errorCode: "provider_task_failed",
          });
        }
        failedTasks.push({ task_index: taskIndex });
      } else {
        unknownTasks.push({ task_index: taskIndex });
        if (!providerSucceeded && typeof options.updateTask === "function") {
          await options.updateTask(taskIndex, "unknown", {
            providerTaskId: e && e.providerTaskId,
            errorCode: "provider_outcome_unknown",
          });
        }
      }
      console.error(`[pins] изображение не сгенерировалось: ${e && e.message}`);
      continue;
    }
  }

  pins.pendingTasks = pendingTasks;
  pins.unknownTasks = unknownTasks;
  pins.failedTasks = failedTasks;
  pins.plannedTaskCount = tasks.length;
  return pins;
}

module.exports = { generatePins };
