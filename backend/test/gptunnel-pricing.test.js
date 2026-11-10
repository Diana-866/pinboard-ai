"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const {
  generateText,
  generateTextWithUsage,
  quoteImageTask,
  normalizeMediaQuote,
  imageTaskResult,
  providerTaskError,
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

test("quoteImageTask rejects ignored parameters in both string and object response forms", async (t) => {
  const originalPost = axios.post;
  axios.post = async () => ({
    data: {
      code: 0,
      model: "flux-schnell",
      price: 0.9,
      currency: "RUB",
      params: { aspect_ratio: "2:3" },
      ignored_params: [{ key: "aspect_ratio", reason: "unsupported" }],
    },
  });
  t.after(() => { axios.post = originalPost; });
  await assert.rejects(quoteImageTask("prompt", "flux-schnell", "9:16"), /формату изображения/i);
});

test("quoteImageTask rejects a quote whose applied aspect ratio differs", async (t) => {
  const originalPost = axios.post;
  axios.post = async () => ({
    data: { code: 0, model: "flux-schnell", price: 0.9, currency: "RUB", params: { aspect_ratio: "2:3" } },
  });
  t.after(() => { axios.post = originalPost; });
  await assert.rejects(quoteImageTask("prompt", "flux-schnell", "9:16"), /формату изображения/i);
});

test("quoteImageTask rejects non-RUB, malformed and negative quotes", async (t) => {
  for (const data of [
    { code: 0, price: 1, currency: "USD" },
    { code: 0, price: "not-a-number", currency: "RUB" },
    { code: 0, price: -1, currency: "RUB" },
    { code: 0, currency: "RUB" },
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

test("generateTextWithUsage never coerces empty or boolean cost metadata to zero", async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  for (const total_cost of ["", "   ", false, true, {}, "not-a-number"]) {
    axios.post = async () => ({
      data: {
        choices: [{ message: { content: "text with malformed billing metadata" } }],
        usage: { total_cost },
      },
    });

    await assert.rejects(
      generateTextWithUsage("prompt"),
      (error) => error.code === "GPTUNNEL_USAGE_COST_MISSING"
    );

    const result = await generateTextWithUsage("prompt", { requireUsage: false });
    assert.equal(result.usage.totalCost, null);
  }
});

test("generateTextWithUsage accepts valid numeric-string cost and preserves a real zero", async (t) => {
  const originalPost = axios.post;
  t.after(() => { axios.post = originalPost; });

  for (const [total_cost, expected] of [["0.125", 0.125], [0, 0]]) {
    axios.post = async () => ({
      data: {
        choices: [{ message: { content: "valid response" } }],
        usage: { total_cost },
      },
    });
    const result = await generateTextWithUsage("prompt");
    assert.equal(result.usage.totalCost, expected);
  }
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


test("providerTaskError preserves failed-task refund and cost metadata", () => {
  const error = providerTaskError({
    id: "0123456789abcdef01234567",
    status: "failed",
    price: 1.25,
    refunded: false,
    error: { code: 1001, title: "SENSITIVE_CONTENT", message: "Rejected" },
  });
  assert.equal(error.providerStatus, "failed");
  assert.equal(error.providerTaskId, "0123456789abcdef01234567");
  assert.equal(error.providerPrice, 1.25);
  assert.equal(error.providerRefunded, false);
  assert.equal(error.providerErrorCode, 1001);
  assert.equal(error.providerErrorTitle, "SENSITIVE_CONTENT");
});

test("providerTaskError does not infer refund when provider omits the field", () => {
  const error = providerTaskError({
    id: "0123456789abcdef01234567",
    status: "failed",
    price: 0,
    error: { message: "Failed" },
  });
  assert.equal(error.providerPrice, 0);
  assert.equal(error.providerRefunded, null);
  assert.equal(error.providerErrorCode, null);
});

test("providerTaskError rejects invalid provider price as unknown metadata", () => {
  const error = providerTaskError({
    id: "0123456789abcdef01234567",
    status: "failed",
    price: "not-a-number",
    refunded: true,
  });
  assert.equal(error.providerPrice, null);
  assert.equal(error.providerRefunded, true);
});


test("image task result rejects zero or negative provider prices before financial settlement", () => {
  const base = {
    id: "provider-task-priced",
    status: "done",
    result: [{ url: "https://provider.example/image.png" }],
  };
  assert.deepEqual(imageTaskResult({ ...base, price: 1.25 }), {
    url: "https://provider.example/image.png",
    price: 1.25,
    taskId: "provider-task-priced",
  });
  for (const price of [0, -0.01, "0", "-1"]) {
    assert.throws(
      () => imageTaskResult({ ...base, price }),
      /некорректный результат генерации/
    );
  }
});
