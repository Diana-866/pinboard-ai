"use strict";

const http = require("node:http");

/**
 * A tiny PostgREST stand-in, enough for supabase-js to believe it is talking to Supabase.
 *
 * It exists so the real backend can be started as a child process in a test: index.js cannot be
 * required without also starting an HTTP server, and the customer-facing routes it holds had no
 * executed test at all. Every request is recorded, and any route can be scripted per test.
 */
function startFakePostgrest() {
  const requests = [];
  const routes = new Map();

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const url = new URL(req.url, "http://127.0.0.1");
      const path = url.pathname;
      const key = `${req.method} ${path}`;
      requests.push({ method: req.method, path, query: Object.fromEntries(url.searchParams), body, headers: req.headers });

      const scripted = routes.get(key) || routes.get(`${req.method} ${path.replace(/^\/rest\/v1\//, "")}`);
      if (typeof scripted === "function") {
        const answer = scripted({ url, body, headers: req.headers });
        res.writeHead(answer.status || 200, { "Content-Type": "application/json", ...(answer.headers || {}) });
        res.end(answer.body === undefined ? "" : JSON.stringify(answer.body));
        return;
      }

      const isRpc = path.startsWith("/rest/v1/rpc/");
      const status = scripted ? scripted.status || 200 : 200;
      const payload = scripted && "body" in scripted
        ? scripted.body
        : isRpc ? null : (req.method === "GET" ? [] : []);
      res.writeHead(status, {
        "Content-Type": "application/json",
        // supabase-js reads the count from this header; an empty range means zero rows.
        "Content-Range": Array.isArray(payload) ? `0-${Math.max(payload.length - 1, 0)}/${payload.length}` : "*/*",
        "Content-Location": path,
        ...(scripted && scripted.headers ? scripted.headers : {}),
      });
      res.end(payload === undefined ? "" : JSON.stringify(payload));
    });
  });

  return {
    requests,
    route(key, answer) { routes.set(key, answer); return this; },
    rpc(name, answer) { routes.set(`POST /rest/v1/rpc/${name}`, answer); return this; },
    table(method, name, answer) { routes.set(`${method} /rest/v1/${name}`, answer); return this; },
    listen() {
      return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
      });
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

module.exports = { startFakePostgrest };
