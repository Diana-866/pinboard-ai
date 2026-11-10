const { generateTextWithUsage, generateImage, waitForImageTask } = require("./gptunnel");
const { rehostImage, deletePinImageIfUnreferenced } = require("./storage");
const { parsePinIdeasResponse } = require("./textOutputValidation");

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
    const textResult = await generateTextWithUsage(prompt, { requireUsage: false });
    let ideas;
    try {
      ideas = parsePinIdeasResponse(textResult.content, count);
    } catch (parseError) {
      // Invalid model output cannot become an image plan, but the provider
      // spend still needs its independent accounting fact before we fail.
      if (typeof options.recordTextUsage === "function") {
        await options.recordTextUsage(textResult);
      } else if (typeof options.onTextProviderUsage === "function") {
        await options.onTextProviderUsage(textResult);
      }
      throw parseError;
    }

    const pool = Array.isArray(ratioPool) && ratioPool.length > 0 ? ratioPool : DEFAULT_ASPECT_RATIOS;
    const plannedTasks = ideas.map((idea, index) => ({
      task_index: index + 1,
      title: idea.title,
      description: idea.description,
      prompt: idea.image_prompt,
      model,
      aspect_ratio: aspectRatio === "mixed" ? pool[Math.floor(Math.random() * pool.length)] : aspectRatio,
    }));

    // Prefer one atomic journal operation: usage facts and the normalized plan
    // must commit together, otherwise a successful paid text response can be orphaned.
    if (typeof options.persistTextPlan === "function") {
      tasks = await options.persistTextPlan(textResult, plannedTasks);
    } else {
      if (typeof options.onTextProviderUsage === "function") {
        await options.onTextProviderUsage(textResult);
      }
      tasks = typeof options.persistPlan === "function"
        ? await options.persistPlan(plannedTasks)
        : plannedTasks;
    }
  }

  if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > 10) {
    throw new Error("Не удалось восстановить сохранённый план генерации");
  }

  // Validate and reserve against exact provider quotes before crossing the
  // first billable image-task boundary. The callback also persists quotes so
  // same-key recovery does not need to guess or silently change the ceiling.
  if (typeof options.ensureTaskQuotes === "function") {
    tasks = await options.ensureTaskQuotes(tasks);
    if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > 10) {
      throw new Error("Не удалось проверить стоимость задач генерации");
    }
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
      if (typeof options.recordProviderOutcome === "function" &&
          task.provider_task_id && task.provider_outcome_status !== "succeeded") {
        await options.recordProviderOutcome(taskIndex, {
          taskId: task.provider_task_id,
          price: task.provider_price,
          resultUrl: task.provider_result_url || null,
        }, "succeeded");
      }
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
      let recoveredStorageUrl = null;
      try {
        providerSucceeded = true;
        if (typeof options.recordProviderOutcome === "function" &&
            task.provider_task_id && task.provider_outcome_status !== "succeeded") {
          await options.recordProviderOutcome(taskIndex, {
            taskId: task.provider_task_id,
            price: task.provider_price,
            resultUrl: task.provider_result_url,
          }, "succeeded");
        }
        recoveredStorageUrl = await rehostImage(task.provider_result_url, {
          idempotencyKey: task.provider_idempotency_key,
        });
        if (typeof recoveredStorageUrl !== "string" || !recoveredStorageUrl.trim()) {
          throw new Error("Не удалось получить постоянную ссылку на изображение");
        }
        if (typeof options.updateTask === "function") {
          await options.updateTask(taskIndex, "succeeded", {
            providerTaskId: task.provider_task_id,
            providerResultUrl: task.provider_result_url,
            storageUrl: recoveredStorageUrl,
            providerPrice: task.provider_price,
          });
        }
        pins.push({
          board_id: board.id,
          image_url: recoveredStorageUrl,
          title: task.title,
          description: task.description || "",
          status: "pending",
          model_used: task.model || model,
          aspect_ratio: ratio,
          credits_cost: Number(task.provider_price),
        });
        continue;
      } catch (e) {
        if (e && e.journalError) {
          if (recoveredStorageUrl) {
            await deletePinImageIfUnreferenced(recoveredStorageUrl).catch((cleanupError) => {
              console.error("[pins] не удалось очистить изображение после ошибки журнала:", cleanupError && cleanupError.message);
            });
          }
          throw e;
        }
        unknownTasks.push({ task_index: taskIndex });
        console.error(`[pins] не удалось восстановить Storage для готовой задачи: ${e && e.message}`);
        continue;
      }
    }
    // A provider-confirmed success without either a durable Storage copy or
    // the original result URL cannot be safely recreated. The provider's
    // idempotency retention may have expired, so never fall through to a new
    // create request for this terminal task.
    if (task.status === "succeeded") {
      unknownTasks.push({ task_index: taskIndex, reason: "successful_result_unrecoverable" });
      console.error(`[pins] подтверждённый результат задачи ${taskIndex} не имеет восстанавливаемого URL; повторная отправка заблокирована`);
      continue;
    }
    let uploadedStorageUrl = null;
    try {
      if (typeof options.updateTask === "function" && (!task.status || task.status === "prepared")) {
        await options.updateTask(taskIndex, "submitting");
      }
      if (typeof options.onProviderSubmission === "function") {
        options.onProviderSubmission();
      }
      const providerCallbacks = {
        onTaskUpdate: async (taskId, status) => {
          if (typeof options.updateTask === "function") {
            await options.updateTask(taskIndex, status, { providerTaskId: taskId });
          }
        },
      };
      // A journaled provider task ID is authoritative. Poll that task directly
      // on recovery; never issue another create request just because the prior
      // backend process timed out while the provider was still working.
      const hasRecoverableProviderTask = !!task.provider_task_id &&
        ["submitting", "queued", "running", "unknown"].includes(task.status);
      const image = hasRecoverableProviderTask
        ? await waitForImageTask(task.provider_task_id, providerCallbacks)
        : await generateImage(
            task.prompt,
            task.model || model,
            ratio,
            task.provider_idempotency_key,
            providerCallbacks
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

      if (typeof options.recordProviderOutcome === "function") {
        await options.recordProviderOutcome(taskIndex, {
          taskId: image.taskId,
          price: image.price,
          resultUrl: image.url,
        }, "succeeded");
      } else if (typeof options.updateTask === "function") {
        await options.updateTask(taskIndex, "succeeded", {
          providerTaskId: image.taskId,
          providerResultUrl: image.url,
          providerPrice: image.price,
        });
      }
      providerSucceeded = true;
      uploadedStorageUrl = await rehostImage(image.url, { idempotencyKey: task.provider_idempotency_key });
      if (typeof uploadedStorageUrl !== "string" || !uploadedStorageUrl.trim()) {
        throw new Error("Не удалось получить постоянную ссылку на изображение");
      }
      if (typeof options.updateTask === "function") {
        await options.updateTask(taskIndex, "succeeded", {
          providerTaskId: image.taskId,
          providerResultUrl: image.url,
          storageUrl: uploadedStorageUrl,
          providerPrice: image.price,
        });
      }
      pins.push({
        board_id: board.id,
        image_url: uploadedStorageUrl,
        title: task.title,
        description: task.description || "",
        status: "pending",
        model_used: task.model || model,
        aspect_ratio: ratio,
        credits_cost: image.price,
      });
    } catch (e) {
      if (e && e.journalError) {
        if (uploadedStorageUrl) {
          await deletePinImageIfUnreferenced(uploadedStorageUrl).catch((cleanupError) => {
            console.error("[pins] не удалось очистить изображение после ошибки журнала:", cleanupError && cleanupError.message);
          });
        }
        throw e;
      }
      if (e && e.providerStatus === "failed") {
        if (typeof options.recordProviderOutcome === "function") {
          if (!e.providerTaskId) {
            unknownTasks.push({ task_index: taskIndex });
            if (typeof options.updateTask === "function") {
              await options.updateTask(taskIndex, "unknown", {
                errorCode: "provider_failure_missing_task_id",
              });
            }
            continue;
          }
          await options.recordProviderOutcome(taskIndex, {
            taskId: e.providerTaskId,
            price: e.providerPrice,
            refunded: e.providerRefunded,
            errorCode: e.providerErrorCode,
            errorTitle: e.providerErrorTitle,
          }, "failed");
        } else if (typeof options.updateTask === "function") {
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
