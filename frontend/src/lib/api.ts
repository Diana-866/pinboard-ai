import { clearAuthToken, readAuthToken } from "./authStorage";
import { getApiFallbackMessage } from "./apiErrorMessages";
import { getLocalizedApiError } from "../i18n/appErrorCopy";
import {
  REQUEST_TIMEOUT_MS,
  currentLocale,
  getRateLimitMessage,
  getRateLimitWait,
  getTimeoutMessage,
  isAbortError,
  shouldRetryTransparently,
} from "./apiResilience";

const configuredApiUrl = (import.meta as any).env?.VITE_API_URL;

/**
 * Адрес API приводится к виду без завершающих слэшей.
 *
 * Пути запросов начинаются со слэша (`/login`), поэтому значение `/api/` давало `/api//login`:
 * Caddy снимает `/api`, backend получает `//login` и отвечает 404. Достаточно было скопировать
 * адрес из браузера вместе с завершающим слэшем, чтобы все запросы перестали находить маршрут.
 */
export function normalizeApiBase(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed || fallback;
}

// Адрес по умолчанию нужен только сборке без переменной. Он записан именно так, чтобы
// присутствие VITE_API_URL убирало его из бандла: иначе в готовый фронтенд попадал бы
// адрес прошлого хостинга и «работал» вместо выключенного сервиса.
export const API_URL = configuredApiUrl
  ? normalizeApiBase(configuredApiUrl, configuredApiUrl)
  : "https://pinboard-ai-backend.onrender.com";

// Раздел 157. Без этой строки отсутствие VITE_API_URL не видно никому: браузер молча уходит на
// чужой (уже развёрнутый) сервер, а клиент получает «сервер не отвечает». Владелец потратил на этот
// поиск три круга. Только в режиме разработки и только латиницей — это сообщение для разработчика.
if ((import.meta as any).env?.DEV && !configuredApiUrl) {
  console.warn(
    "[api] VITE_API_URL is not set; requests go to " + API_URL + ". Set it in frontend/.env (and restart the dev server)."
  );
}

export class ApiError extends Error {
  status: number;
  /** Доп. поля ответа: например 403 при неподтверждённом email содержит
   *  { code: 'email_not_verified', emailSent, retryAfterSeconds, email } */
  data: any;
  constructor(message: string, status: number, data: any = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Один запрос без повторов. Отдельный таймаут нужен потому, что раньше зависшее
 * соединение оставляло спиннер включённым навсегда: fetch без сигнала не завершается
 * сам. Внешний signal (если передан) по-прежнему уважается — оба источника отменяют
 * один и тот же контроллер.
 */
async function sendOnce(path: string, options: ApiRequestOptions, token: string | null) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const external = options.signal;
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    const { timeoutMs: _timeoutMs, signal: _signal, ...fetchOptions } = options;
    return await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", forwardAbort);
  }
}

async function readBody(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Request options plus an optional deadline override.
 *
 * The default deadline protects against a connection that never settles. A few endpoints
 * legitimately run far longer than that — image generation works through up to ten
 * sequential provider tasks — and aborting those would cancel the client side while the
 * server kept spending credits, so those call sites state their own budget.
 */
export type ApiRequestOptions = RequestInit & { timeoutMs?: number };

export async function apiRequest(path: string, options: ApiRequestOptions = {}) {
  const token = readAuthToken();
  let attempt = 0;

  for (;;) {
    let res: Response;
    try {
      res = await sendOnce(path, options, token);
    } catch (error) {
      // Наш собственный таймаут — отдельное сообщение: «сервер не отвечает» и «сервер
      // слишком долго думает» для пользователя разные ситуации.
      if (isAbortError(error) && !options.signal?.aborted) {
        throw new ApiError(getTimeoutMessage(currentLocale()), 0);
      }
      // обрыв сети / сервер спит — понятное сообщение вместо краша res.json() (E9)
      throw new ApiError(getApiFallbackMessage("network", currentLocale()), 0);
    }

    const data = await readBody(res);

    if (res.status === 429) {
      const seconds = getRateLimitWait(res.headers, data);
      // Короткое ожидание повторяем молча; длинное — сообщаем, сколько ждать.
      if (shouldRetryTransparently(seconds, attempt)) {
        attempt += 1;
        await delay((seconds as number) * 1000);
        continue;
      }
      throw new ApiError(getRateLimitMessage(seconds, currentLocale()), 429, data);
    }

    if (!res.ok) {
      // Просроченный/битый токен: разлогиниваем и отправляем на вход (E8).
      // НО 401 от самих /login и /register — это ошибка ввода (неверный пароль),
      // а не повод для редиректа: раньше страница молча перезагружалась и
      // пользователь не видел сообщение «Неверный email или пароль».
      const isAuthAttempt = path === "/login" || path === "/register";
      if (res.status === 401 && !isAuthAttempt && typeof window !== "undefined") {
        clearAuthToken();
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
      // A known code wins over the server's Russian text; an unknown one keeps it.
      const localized = getLocalizedApiError(data?.code, res.status);
      throw new ApiError(
        localized || data?.error || getApiFallbackMessage("generic", currentLocale()),
        res.status,
        data
      );
    }

    return data;
  }
}

/**
 * Uploading a pin image.
 *
 * This used to be an inline `fetch` inside the approval desk with its own copy of the backend
 * host, no deadline and no session handling: on a deployment the copy went stale and uploads
 * aimed at the old host, a half-open upload left the control disabled forever, a 401 was reported
 * as "the image could not be replaced" instead of signing the customer out, and the server's own
 * message (409/422 with a localized code) was thrown away. The upload now goes through the same
 * base URL, the same timeout semantics and the same error mapping as every other request.
 *
 * Multipart is the reason this cannot simply use apiRequest: that wrapper forces a JSON
 * content type, which destroys the multipart boundary.
 */
export const PIN_IMAGE_UPLOAD_TIMEOUT_MS = 60_000;

export function buildPinImageUploadUrl(pinId: string): string {
  return `${API_URL}/pins/${encodeURIComponent(pinId)}/image`;
}

/** No Content-Type on purpose: the browser sets the multipart boundary. */
export function buildPinImageUploadInit(file: File, token: string | null): RequestInit {
  const body = new FormData();
  body.append("image", file);
  return {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  };
}

export type PinImageUploadDeps = {
  fetchImpl?: typeof fetch;
  token?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export async function uploadPinImage(
  pinId: string,
  file: File,
  deps: PinImageUploadDeps = {}
): Promise<{ imageUrl: string }> {
  const token = deps.token !== undefined ? deps.token : readAuthToken();
  if (!token) {
    // No token means the session is gone; the caller redirects instead of showing an upload error.
    throw new ApiError(getApiFallbackMessage("generic", currentLocale()), 401, { requiresLogin: true });
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? PIN_IMAGE_UPLOAD_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const external = deps.signal;
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", forwardAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetchImpl(buildPinImageUploadUrl(pinId), {
      ...buildPinImageUploadInit(file, token),
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error) && !external?.aborted) {
      throw new ApiError(getTimeoutMessage(currentLocale()), 0);
    }
    throw new ApiError(getApiFallbackMessage("network", currentLocale()), 0);
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", forwardAbort);
  }

  const data = await readBody(res);

  if (!res.ok) {
    const requiresLogin = res.status === 401;
    if (requiresLogin) clearAuthToken();
    const localized = getLocalizedApiError(data?.code, res.status);
    throw new ApiError(
      localized || data?.error || getApiFallbackMessage("generic", currentLocale()),
      res.status,
      { ...(data && typeof data === "object" ? data : {}), requiresLogin }
    );
  }

  const imageUrl = data && typeof data.image_url === "string" ? data.image_url.trim() : "";
  if (!imageUrl) {
    // A 2xx without a stored image would leave the desk showing a picture that does not exist.
    throw new ApiError(getApiFallbackMessage("generic", currentLocale()), 502);
  }
  return { imageUrl };
}
