"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

const recommendationsPath = require.resolve("../recommendations");
const gptunnelPath = require.resolve("../gptunnel");
const {
  getDailyRecommendations,
  buildPrompt,
  validateItems,
  recommendationsEnabled,
  MIN_ITEMS,
  MAX_ITEMS,
} = require("../recommendations");

/**
 * Ежедневные рекомендации: флаг выключен по умолчанию, одна текстовая модель на пользователя
 * в день, ответ кэшируется в daily_recommendations. Главная проверка — честность входа:
 * в подсказку уходят только сохранённые доски, пины и снимки трендов, а моделю прямо
 * запрещено называть числа и «всплески запроса», которых нет в данных.
 */

function makeSupabase({ existing = null, insertError = null, trendsError = null, trends = [] } = {}) {
  const calls = { selects: [], inserts: [] };
  return {
    calls,
    client: {
      from(table) {
        if (table === "daily_recommendations") {
          return {
            select() {
              calls.selects.push(table);
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle: async () => ({ data: existing, error: null }),
                      };
                    },
                  };
                },
              };
            },
            insert(row) {
              calls.inserts.push(row);
              return { error: insertError ? insertError : null };
            },
          };
        }
        // trend_snapshots
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit: async () => {
                        if (trendsError) return { data: null, error: trendsError };
                        return { data: trends, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

function stubGenerateText(fn) {
  require.cache[gptunnelPath] = {
    id: gptunnelPath,
    filename: gptunnelPath,
    loaded: true,
    exports: { ...require("../gptunnel"), generateText: fn },
  };
  delete require.cache[recommendationsPath];
  return require("../recommendations");
}

test("the feature is off unless the flag is exactly true", () => {
  const saved = process.env.RECOMMENDATIONS_ENABLED;
  try {
    delete process.env.RECOMMENDATIONS_ENABLED;
    assert.equal(recommendationsEnabled(), false, "the flag must default to off");
    process.env.RECOMMENDATIONS_ENABLED = "1";
    assert.equal(recommendationsEnabled(), false, "any other value must not enable it");
    process.env.RECOMMENDATIONS_ENABLED = "true";
    assert.equal(recommendationsEnabled(), true);
  } finally {
    if (saved === undefined) delete process.env.RECOMMENDATIONS_ENABLED;
    else process.env.RECOMMENDATIONS_ENABLED = saved;
  }
});

test("the disabled feature answers 404 before the database or the model", async () => {
  const { client, calls } = makeSupabase();
  let modelCalls = 0;
  const mod = stubGenerateText(async () => { modelCalls += 1; return "[]"; });
  const saved = process.env.RECOMMENDATIONS_ENABLED;
  delete process.env.RECOMMENDATIONS_ENABLED;
  try {
    await assert.rejects(
      () => mod.getDailyRecommendations({ supabaseClient: client, userId: "u1", boards: [], pins: [], language: "ru" }),
      (error) => error.httpStatus === 404
    );
    assert.deepEqual(calls.selects, [], "a disabled feature must not touch the database");
    assert.equal(modelCalls, 0, "a disabled feature must not call the model");
  } finally {
    if (saved === undefined) delete process.env.RECOMMENDATIONS_ENABLED;
    else process.env.RECOMMENDATIONS_ENABLED = saved;
  }
});

test("the prompt names only saved facts and forbids invented numbers", () => {
  const prompt = buildPrompt({
    boards: [{ title: "Кофейня дома", pin_count: 12 }],
    pins: [{ title: "Матча-латте", status: "approved" }],
    trends: [{ keyword: "latte art", source_day: "2026-11-24" }],
    language: "ru",
  });
  assert.match(prompt, /Кофейня дома/);
  assert.match(prompt, /Матча-латте/);
  assert.match(prompt, /latte art/);
  assert.match(prompt, /ТОЛЬКО/i);
  assert.match(prompt, /всплеск/i);
  assert.match(prompt, /Не придумывай/);
});

test("without saved trends the prompt says so instead of leaving a hole to fill", () => {
  const prompt = buildPrompt({ boards: [], pins: [], trends: [], language: "ru" });
  assert.match(prompt, /saved_trends.*null/s);
    assert.match(prompt, /boards.*\[\]/s);
  // Честная пометка о том, что трендов нет, живёт в самом JSON (saved_trends: null),
  // а запрет выдумки — в правилах вокруг блока.
  assert.match(prompt, /ТОЛЬКО/);
  assert.match(prompt, /Не придумывай/);
});

test("a valid model answer of 5–7 items is stored once per day", async () => {
  process.env.RECOMMENDATIONS_ENABLED = "true";
  const { client, calls } = makeSupabase({ existing: null });
  const items = Array.from({ length: 5 }, (_, i) => ({ title: `Совет ${i + 1}`, body: "Опирается на сохранённую доску." }));
  const mod = stubGenerateText(async () => JSON.stringify(items));
  const result = await mod.getDailyRecommendations({
    supabaseClient: client, userId: "u1", boards: [], pins: [], language: "ru",
  });
  assert.equal(result.cached, false);
  assert.equal(result.items.length, 5);
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.inserts[0].user_id, "u1");
});

test("a cached answer never calls the model a second time that day", async () => {
  process.env.RECOMMENDATIONS_ENABLED = "true";
  const { client, calls } = makeSupabase({
    existing: { items: [{ title: "Из кэша", body: "Сохранено ранее." }] },
  });
  let modelCalls = 0;
  const mod = stubGenerateText(async () => { modelCalls += 1; return "[]"; });
  const result = await mod.getDailyRecommendations({
    supabaseClient: client, userId: "u1", boards: [], pins: [], language: "ru",
  });
  assert.equal(result.cached, true);
  assert.equal(result.items[0].title, "Из кэша");
  assert.equal(modelCalls, 0, "one model request per user per day");
  assert.deepEqual(calls.inserts, []);
});

test("a model answer outside 5–7 items, or non-JSON, is refused with ai_output_invalid", async () => {
  process.env.RECOMMENDATIONS_ENABLED = "true";
  const mod = stubGenerateText(async () => "не json");
  await assert.rejects(
    () => mod.getDailyRecommendations({
      supabaseClient: makeSupabase().client, userId: "u1", boards: [], pins: [], language: "ru",
    }),
    (error) => error.httpStatus === 502 && error.details.code === "ai_output_invalid"
  );

  const modBad = stubGenerateText(async () => JSON.stringify([{ title: "одна", body: "мало" }]));
  await assert.rejects(
    () => modBad.getDailyRecommendations({
      supabaseClient: makeSupabase().client, userId: "u1", boards: [], pins: [], language: "ru",
    }),
    (error) => error.httpStatus === 502 && error.details.code === "ai_output_invalid"
  );
});

test("validateItems trims and bounds every field", () => {
  const items = validateItems([
    { title: "  " + "Длинный заголовок. ".repeat(30), body: "ок" },
    { title: "короткий", body: "  " + "х".repeat(600) },
    { title: "третий", body: "тело" },
    { title: "четвёртый", body: "тело" },
    { title: "пятый", body: "тело" },
  ]);
  assert.equal(items.length, 5);
  assert.ok(items[0].title.length <= 120, "the title must be bounded");
  assert.ok(items[1].body.length <= 240, "the body must be bounded");
});

test("trends input comes only from saved snapshots; a read failure yields no trends, not invented ones", async () => {
  process.env.RECOMMENDATIONS_ENABLED = "true";
  let seenPrompt = "";
  const mod = stubGenerateText(async (prompt) => {
    seenPrompt = prompt;
    return JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ title: `t${i}`, body: "факт" })));
  });
  const { client } = makeSupabase({ trendsError: { message: "table missing" } });
  await mod.getDailyRecommendations({
    supabaseClient: client, userId: "u1", boards: [], pins: [], language: "ru",
  });
  assert.match(seenPrompt, /saved_trends[^\n]*null/);
});
