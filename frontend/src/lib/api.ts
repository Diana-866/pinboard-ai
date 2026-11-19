import { clearAuthToken, readAuthToken } from "./authStorage";
import { getApiFallbackMessage } from "./apiErrorMessages";
import {
  REQUEST_TIMEOUT_MS,
  currentLocale,
  getRateLimitMessage,
  getRateLimitWait,
  getTimeoutMessage,
  isAbortError,
  shouldRetryTransparently,
} from "./apiResilience";

const API_URL = (import.meta as any).env?.VITE_API_URL || "https://pinboard-ai-backend.onrender.com";

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
      throw new ApiError(
        data?.error || getApiFallbackMessage("generic", currentLocale()),
        res.status,
        data
      );
    }

    return data;
  }
}
