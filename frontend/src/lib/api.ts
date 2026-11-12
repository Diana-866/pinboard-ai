import { clearAuthToken, readAuthToken } from "./authStorage";

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

export async function apiRequest(path: string, options: RequestInit = {}) {
  const token = readAuthToken();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    // обрыв сети / сервер спит — понятное сообщение вместо краша res.json() (E9)
    throw new ApiError("Сервер не отвечает. Возможно, он просыпается после простоя — подождите минуту и попробуйте снова.", 0);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new ApiError("Сервер вернул некорректный ответ. Попробуйте позже.", res.status);
    data = null;
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
    throw new ApiError(data?.error || "Произошла ошибка. Попробуйте ещё раз.", res.status, data);
  }

  return data;
}


/**
 * Upload multipart form data without setting Content-Type manually: the browser
 * must add the boundary. Keep auth/error handling consistent with apiRequest.
 */
export async function apiUpload(path: string, body: FormData) {
  const token = readAuthToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
  } catch {
    throw new ApiError("Сервер не отвечает. Возможно, он просыпается после простоя — подождите минуту и попробуйте снова.", 0);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new ApiError("Сервер вернул некорректный ответ. Попробуйте позже.", res.status);
  }

  if (!res.ok) {
    // Match apiRequest: invalid credentials on login/register are form errors,
    // not expired sessions, and must not clear the token or force navigation.
    const isAuthAttempt = path === "/login" || path === "/register";
    if (res.status === 401 && !isAuthAttempt && typeof window !== "undefined") {
      clearAuthToken();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    throw new ApiError(data?.error || "Не удалось загрузить файл. Попробуйте ещё раз.", res.status, data);
  }
  return data;
}
