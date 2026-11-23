"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");

/**
 * The connect button returns `start_url`, and the browser navigates there as a top-level
 * form POST that sets the browser-binding cookie before leaving for Pinterest. On the new
 * server the API lives under /api: Caddy routes /api/* to the backend and strips the prefix.
 *
 * The old builder was `new URL("/integrations/pinterest/start", redirectUri())`, and in URL
 * terms an absolute path REPLACES the base path. With a prefixed redirect URI the browser
 * would land on /integrations/pinterest/start — outside /api/*, where Caddy serves the SPA
 * instead of the backend — and connecting Pinterest would fail only in production, while
 * working locally where the redirect URI carries no prefix.
 */

process.env.PINTEREST_CLIENT_ID = "client-id";
process.env.PINTEREST_CLIENT_SECRET = "client-secret";
process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
process.env.FRONTEND_URL = "https://app.example.com";

const USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

async function startApp(redirectUri) {
  process.env.PINTEREST_REDIRECT_URI = redirectUri;

  const supabasePath = require.resolve("../supabase");
  const pinterestPath = require.resolve("../pinterest");
  const rateLimitPath = require.resolve("../pinterestRateLimit");
  const { respondWithError } = require("../httpErrorResponse");

  const supabase = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: { token_version: 0 }, error: null }),
              };
            },
          };
        },
      };
    },
    rpc: async () => ({ data: 7, error: null }),
  };

  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supabase };
  delete require.cache[pinterestPath];
  delete require.cache[rateLimitPath];

  const express = require("express");
  const pinterest = require("../pinterest");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = USER_ID; next(); });
  pinterest.registerRoutes(app, {
    requireAuth: (req, res, next) => next(),
    requireTariff: () => (req, res, next) => next(),
    handleError: (res, error) => respondWithError(res, error),
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function startUrlFor(redirectUri) {
  const app = await startApp(redirectUri);
  try {
    const response = await fetch(`${app.base}/integrations/pinterest/link`, { method: "POST" });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.start_url, "string");
    return body.start_url;
  } finally {
    await app.close();
  }
}

test("the connect link keeps the API prefix the deployment puts in front of the backend", async () => {
  const startUrl = await startUrlFor("https://www.pinposy.com/api/integrations/pinterest/callback");
  assert.equal(startUrl, "https://www.pinposy.com/api/integrations/pinterest/start");
});

test("without a prefix the connect link is unchanged", async () => {
  const startUrl = await startUrlFor("https://api.example.com/integrations/pinterest/callback");
  assert.equal(startUrl, "https://api.example.com/integrations/pinterest/start");
});

test("a trailing slash on the redirect URI does not produce a doubled separator", async () => {
  const startUrl = await startUrlFor("https://www.pinposy.com/api/integrations/pinterest/callback/");
  assert.equal(startUrl, "https://www.pinposy.com/api/integrations/pinterest/start");
});

test("a redirect URI that is not the callback path still yields a start URL beside it", async () => {
  const startUrl = await startUrlFor("https://www.pinposy.com/api/pinterest/return");
  assert.equal(startUrl, "https://www.pinposy.com/api/pinterest/start");
});
