const API_URL = (import.meta as any).env?.VITE_API_URL || "https://pinboard-ai-backend.onrender.com";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

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
    throw new ApiError("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.", 0);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new ApiError("Сервер вернул некорректный ответ. Попробуйте позже.", res.status);
    data = null;
  }

  if (!res.ok) {
    // просроченный/битый токен: разлогиниваем и отправляем на вход (E8)
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    throw new ApiError(data?.error || "Произошла ошибка. Попробуйте ещё раз.", res.status);
  }

  return data;
}
