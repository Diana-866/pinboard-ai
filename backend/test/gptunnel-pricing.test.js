"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const {
  generateText,
  generateTextWithUsage,
  quoteImageTask,
  normalizeMediaQuote,
} = require("../gptunnel");

test("quoteImageTask requests a quote using the exact image task parameters", async (t) => {
  const originalPost = axios.post;
  let call;
  axios.post = async (url, payload, config) => {
    call = { url, payload, config };
    return { data: { code: 0, model: "flux-schnell", price: 0.9, currency: "RUB", params: { aspect_ratio: "9:16" } } };
  };
  t.after(() => { axios.post = originalPost; });

  const quote = await quoteImageTask("a botanical poster", "flux-schnell", "9:16");
  assert.match(call.url, /\/api\/v2\/media\/price$/);
  assert.deepEqual(call.payload, {
    model: "flux-schnell",
    prompt: "a botanical poster",
    params: { aspect_ratio: "9:16" },
  });
  assert.equal(quote.price, 0.9);
  assert.equal(quote.currency, "RUB");
  assert.deepEqual(quote.params, { aspect_ratio: "9:16" });
});

test("quoteImageTask rejects non-RUB, malformed and negative quotes", async (t) => {
  for (const data of [
    { code: 0, price: 1, currency: "USD" },
    { code: 0, price: "not-a-number", currency: "RUB" },
    { code: 0, price: -1, currency: "RUB" },
    { code: 1, price: 1, currency: "RUB" },
  ]) {
    assert.throws(() => normalizeMediaQuote(data), /некорректную котировку/i);
  }
});

test("generateTextWithUsage preserves provider usage and request identity", async (t) => {
  const originalPost = axios.post;
  let sent;
  axios.post = async (url, payload) => {
    sent = { url, payload };
    return {
      data: {
        id: "chatcmpl_test_123",
        model: "gpt-4o",
        choices: [{ message: { content: "generated text" } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 40,
          total_tokens: 140,
          prompt_cost: 0.02,
          completion_cost: 0.03,
          total_cost: 0.05,
        },
      },
    };
  };
  t.after(() => { axios.post = originalPost; });

  const result = await generateTextWithUsage("write a short plan", { maxTokens: 200 });
  assert.match(sent.url, /\/v1\/chat\/completions$/);
  assert.equal(sent.payload.max_tokens, 200);
  assert.equal(result.content, "generated text");
  assert.equal(result.usage.totalCost, 0.05);
  assert.equal(result.usage.totalTokens, 140);
  assert.equal(result.requestId, "chatcmpl_test_123");
});

test("generateTextWithUsage fails closed when provider omits total_cost", async (t) => {
  const originalPost = axios.post;
  axios.post = async () => ({
    data: { choices: [{ message: { content: "text without billing metadata" } }], usage: { total_tokens: 12 } },
  });
  t.after(() => { axios.post = originalPost; });

  await assert.rejects(
    generateTextWithUsage("prompt"),
    (error) => error.code === "GPTUNNEL_USAGE_COST_MISSING"
  );
});

test("legacy generateText remains compatible when usage metadata is absent", async (t) => {
  const originalPost = axios.post;
  axios.post = async () => ({
    data: { choices: [{ message: { content: "legacy response" } }] },
  });
  t.after(() => { axios.post = originalPost; });

  assert.equal(await generateText("prompt"), "legacy response");
});
