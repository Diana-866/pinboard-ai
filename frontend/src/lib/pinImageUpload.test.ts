import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  API_URL,
  ApiError,
  buildPinImageUploadInit,
  buildPinImageUploadUrl,
  uploadPinImage,
} from './api';

/**
 * Uploading a customer's own pin image was an inline `fetch` in the approval desk with its own
 * copy of the backend host, no deadline, no session handling and a single generic error for every
 * 4xx. Each of those is a separate way for a paying customer to see "the image could not be
 * replaced" while the real cause is a stale host, a hung socket, an expired session or a 409 the
 * server explained in words.
 */

/** A File is only used for its bytes; Node has Blob, so a tiny stand-in keeps this DOM-free. */
function fileDouble(name = 'pin.png', type = 'image/png'): File {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type });
  return Object.assign(blob, { name, lastModified: Date.now() }) as unknown as File;
}

function responseDouble(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

test('the upload URL comes from the configured base, not from a copy', () => {
  assert.ok(API_URL.length > 0);
  assert.equal(buildPinImageUploadUrl('abc-123'), `${API_URL}/pins/abc-123/image`);
  // A pin id is data: a slash or a query must not become part of the path.
  assert.equal(buildPinImageUploadUrl('a/b?c=1'), `${API_URL}/pins/a%2Fb%3Fc%3D1/image`);
});

test('the request is multipart, so no JSON content type may be forced', () => {
  const init = buildPinImageUploadInit(fileDouble(), 'token-value');
  const headers = (init.headers || {}) as Record<string, string>;

  assert.equal(init.method, 'POST');
  assert.ok(init.body instanceof FormData, 'the body must be a form, not a JSON string');
  assert.equal(headers['Content-Type'], undefined, 'a forced content type destroys the boundary');
  assert.equal(headers.Authorization, 'Bearer token-value');
});

test('without a session the upload asks the caller to sign in instead of uploading', async () => {
  let called = false;
  await assert.rejects(
    () => uploadPinImage('pin-1', fileDouble(), {
      token: null,
      fetchImpl: (async () => { called = true; return responseDouble(200, { image_url: 'https://x/y.png' }); }) as unknown as typeof fetch,
    }),
    (error: unknown) => error instanceof ApiError && error.status === 401 && error.data?.requiresLogin === true
  );
  assert.equal(called, false, 'no request may leave the browser without a token');
});

test('a 401 clears the stored session and tells the UI to redirect', async () => {
  const storage = new Map<string, string>([['token', 'expired-token']]);
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    location: { pathname: '/app', href: '/app' },
  };
  try {
    await assert.rejects(
      () => uploadPinImage('pin-1', fileDouble(), {
        fetchImpl: (async () => responseDouble(401, { error: 'Токен истёк' })) as unknown as typeof fetch,
      }),
      (error: unknown) => error instanceof ApiError && error.status === 401 && error.data?.requiresLogin === true
    );
    assert.equal(storage.has('token'), false, 'an expired session must not be reused for the next upload');
  } finally {
    delete (globalThis as any).window;
  }
});

test('the server explanation survives instead of becoming one generic sentence', async () => {
  await assert.rejects(
    () => uploadPinImage('pin-1', fileDouble(), {
      token: 'token-value',
      fetchImpl: (async () => responseDouble(409, { code: 'image_already_referenced', error: 'Картинка уже используется' })) as unknown as typeof fetch,
    }),
    (error: unknown) => error instanceof ApiError && error.status === 409 && (error.message.length > 0)
  );
});

test('a hung upload is abandoned at the deadline instead of disabling the control forever', async () => {
  let sawAbort = false;
  const fetchImpl = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      sawAbort = true;
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  })) as unknown as typeof fetch;

  const started = Date.now();
  await assert.rejects(
    () => uploadPinImage('pin-1', fileDouble(), { token: 'token-value', fetchImpl, timeoutMs: 30 }),
    (error: unknown) => error instanceof ApiError && error.status === 0
  );
  assert.ok(Date.now() - started < 2000, 'the deadline must be short in this test');
  assert.equal(sawAbort, true, 'the request must actually be aborted, not merely ignored');
});

test('a foreign abort (the component unmounted) is reported as a network stop, not as a timeout', async () => {
  // A real fetch rejects immediately when its signal is already aborted, so the double must too:
  // a promise that only listens for a future event would hang here and hide that case.
  const controller = new AbortController();
  const rejections: string[] = [];
  const fetchImpl = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    const fail = () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    };
    if (init.signal?.aborted) {
      rejections.push('already-aborted');
      return fail();
    }
    init.signal?.addEventListener('abort', () => {
      rejections.push('aborted-later');
      fail();
    });
  })) as unknown as typeof fetch;

  controller.abort();
  await assert.rejects(
    () => uploadPinImage('pin-1', fileDouble(), { token: 'token-value', fetchImpl, signal: controller.signal }),
    (error: unknown) => error instanceof ApiError && error.status === 0
  );
  assert.deepEqual(rejections, ['already-aborted'], 'an unmounted component must not reach the network');

  // And an abort that arrives after the request started is handled the same way.
  const live = new AbortController();
  const pending = uploadPinImage('pin-1', fileDouble(), { token: 'token-value', fetchImpl, signal: live.signal });
  live.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof ApiError && error.status === 0);
});

test('a 2xx without a stored image is refused, so the desk cannot show a picture that does not exist', async () => {
  for (const body of [{}, { image_url: '' }, { image_url: 42 }, null]) {
    await assert.rejects(
      () => uploadPinImage('pin-1', fileDouble(), {
        token: 'token-value',
        fetchImpl: (async () => responseDouble(200, body)) as unknown as typeof fetch,
      }),
      (error: unknown) => error instanceof ApiError && error.status === 502,
      `body ${JSON.stringify(body)} must not be read as a saved image`
    );
  }
});

test('a successful upload returns the stored URL, trimmed', async () => {
  const { imageUrl } = await uploadPinImage('pin-1', fileDouble(), {
    token: 'token-value',
    fetchImpl: (async () => responseDouble(200, { image_url: '  https://cdn.example.com/p.png  ' })) as unknown as typeof fetch,
  });
  assert.equal(imageUrl, 'https://cdn.example.com/p.png');
});

test('the URL builder derives the origin instead of repeating it', () => {
  // Comparing the built URL with API_URL alone cannot catch a copy of the host, because a copied
  // literal equals the configured one whenever the configuration is unchanged. The builder must
  // therefore be read: it may reference the base and must not contain an origin of its own.
  const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export function buildPinImageUploadUrl');
  assert.notEqual(start, -1, 'the builder must stay exported and named');
  const body = source.slice(start, start + 400);
  const end = body.indexOf('}');
  const implementation = body.slice(0, end === -1 ? body.length : end);

  assert.match(implementation, /API_URL/, 'the builder must use the shared base URL');
  assert.doesNotMatch(implementation, /https?:\/\//, 'the builder must not carry an origin of its own');
});
