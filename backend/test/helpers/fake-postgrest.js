"use strict";

const http = require("node:http");

/**
 * A tiny PostgREST stand-in, enough for supabase-js to believe it is talking to Supabase.
 *
 * It exists so the real backend can be started as a child process in a test: index.js cannot be
 * required without also starting an HTTP server, and the customer-facing routes it holds had no
 * executed test at all. Every request is recorded, and any route can be scripted per test.
 *
 * Two behaviours matter for faithfulness and were both learned the hard way:
 * - `.single()` asks for `application/vnd.pgrst.object+json`, so the answer must be a bare object,
 *   and a result that is not exactly one row must be 406 PGRST116 - otherwise "no rows" silently
 *   arrives as `[]`, which the route code treats as a found row;
 * - `.maybeSingle()` is post-processed by supabase-js itself (array -> object / null), while
 *   `.single()` is not, so the server has to do the work.
 */
function startFakePostgrest() {
  const requests = [];
  const routes = new Map();

  const send = (res, status, payload, extraHeaders, headOnly) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      // supabase-js reads a count from this header when the request asked for one.
      "Content-Range": Array.isArray(payload) ? `0-${Math.max(payload.length - 1, 0)}/${payload.length}` : "*/*",
      ...(extraHeaders || {}),
    });
    // A HEAD request is a preflight for a count: the body is empty and only headers matter.
    res.end(headOnly || payload === undefined ? "" : JSON.stringify(payload));
  };

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const url = new URL(req.url, "http://127.0.0.1");
      const path = url.pathname;
      const query = Object.fromEntries(url.searchParams);
      // HEAD (used for count-only reads) answers like GET without a body, so it routes the same way.
      const lookupMethod = req.method === "HEAD" ? "GET" : req.method;
      const key = `${lookupMethod} ${path}`;
      requests.push({ method: req.method, path, query, body, headers: req.headers });

      const scripted = routes.get(key) || routes.get(`${lookupMethod} ${path.replace(/^\/rest\/v1\//, "")}`);
      const answer = typeof scripted === "function"
        ? scripted({ url, query, body, headers: req.headers })
        : scripted;
      const isRpc = path.startsWith("/rest/v1/rpc/");
      const status = (answer && answer.status) || 200;
      let payload = answer && "body" in answer
        ? answer.body
        : isRpc ? null : [];

      const wantsObject = String(req.headers.accept || "").includes("vnd.pgrst.object+json");
      if (wantsObject && Array.isArray(payload)) {
        if (payload.length !== 1) {
          send(res, 406, {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
            details: `Results contain ${payload.length} rows`,
            hint: null,
          });
          return;
        }
        payload = payload[0];
      }

      send(res, status, payload, answer && answer.headers, req.method === "HEAD");
    });
  });

  return {
    requests,
    /** Set when a test needs the ownership check to see another account's row. */
    ownedBy: null,
    route(key, answer) { routes.set(key, answer); return this; },
    rpc(name, answer) { routes.set(`POST /rest/v1/rpc/${name}`, answer); return this; },
    table(method, name, answer) {
      routes.set(`${method} /rest/v1/${name}`, answer);
      // Some helpers address tables through the RPC-shaped key; keep both in step.
      routes.set(`${method} ${name}`, answer);
      return this;
    },
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
