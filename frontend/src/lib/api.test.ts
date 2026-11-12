import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, apiUpload } from "./api";

function withGlobals(
  values: { fetch?: typeof fetch; window?: unknown },
  run: () => Promise<void>,
) {
  const previousFetch = globalThis.fetch;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  if (values.fetch) globalThis.fetch = values.fetch;
  if ("window" in values) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: values.window,
    });
  }
  return run().finally(() => {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
}

function makeFormData() {
  const body = new FormData();
  body.append("file", new Blob(["image-bytes"], { type: "image/png" }), "pin.png");
  return body;
}

test("apiUpload sends authenticated multipart data without overriding the boundary", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const storage = { getItem: (key: string) => key === "token" ? "session-token" : null, removeItem: () => {} };

  await withGlobals({
    window: { localStorage: storage, location: { pathname: "/review", href: "/review" } },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ url: "/uploads/pin.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
  }, async () => {
    const result = await apiUpload("/review/upload", makeFormData());
    assert.deepEqual(result, { url: "/uploads/pin.png" });
  });

  assert.equal(request?.url, "https://pinboard-ai-backend.onrender.com/review/upload");
  assert.equal(request?.init?.method, "POST");
  assert.equal(new Headers(request?.init?.headers).get("Authorization"), "Bearer session-token");
  assert.equal(new Headers(request?.init?.headers).has("Content-Type"), false);
  assert.ok(request?.init?.body instanceof FormData);
});

test("apiUpload exposes backend errors as ApiError with response data", async () => {
  await withGlobals({
    fetch: (async () => new Response(JSON.stringify({ error: "File is too large", limit: 10 }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch,
  }, async () => {
    await assert.rejects(
      apiUpload("/review/upload", makeFormData()),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 413);
        assert.equal(error.message, "File is too large");
        assert.deepEqual(error.data, { error: "File is too large", limit: 10 });
        return true;
      },
    );
  });
});

test("apiUpload handles network failures with the shared offline message", async () => {
  await withGlobals({
    fetch: (async () => { throw new TypeError("NetworkError"); }) as typeof fetch,
  }, async () => {
    await assert.rejects(
      apiUpload("/review/upload", makeFormData()),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 0);
        assert.match(error.message, /Сервер не отвечает/);
        return true;
      },
    );
  });
});

test("apiUpload clears an expired session and redirects to login", async () => {
  let removed = false;
  const location = { pathname: "/review", href: "/review" };
  await withGlobals({
    window: {
      localStorage: { getItem: () => "expired-token", removeItem: () => { removed = true; } },
      location,
    },
    fetch: (async () => new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch,
  }, async () => {
    await assert.rejects(apiUpload("/review/upload", makeFormData()), ApiError);
  });

  assert.equal(removed, true);
  assert.equal(location.href, "/login");
});

test("apiUpload reports malformed error responses without leaking JSON parse errors", async () => {
  await withGlobals({
    fetch: (async () => new Response("not-json", { status: 502 })) as typeof fetch,
  }, async () => {
    await assert.rejects(
      apiUpload("/review/upload", makeFormData()),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 502);
        assert.match(error.message, /некорректный ответ/);
        return true;
      },
    );
  });
});
