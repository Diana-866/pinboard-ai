"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest("/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("token", data.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-10 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Регистрация</h1>
        <p className="mb-6 text-sm text-ink-soft">Начните за пару минут</p>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            required
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-accent py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {loading ? "Создаём..." : "Зарегистрироваться"}
        </button>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Уже есть аккаунт?{" "}
          <a href="/login" className="font-medium text-accent">
            Войти
          </a>
        </p>
      </form>
    </div>
  );
}
