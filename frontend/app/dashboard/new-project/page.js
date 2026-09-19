"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../../lib/api";

const steps = ["Сайт", "Ниша", "Язык", "Цель", "Стиль"];

export default function NewProjectPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ website_url: "", niche: "", language: "ru", goal: "", tone: "" });
  const router = useRouter();

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  async function handleFinish() {
    await apiRequest("/projects", { method: "POST", body: JSON.stringify(form) });
    router.push("/dashboard");
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-ink outline-none transition focus:border-accent";

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8 flex items-center gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col gap-2">
            <div className={`h-1 rounded-full ${i < step ? "bg-accent" : "bg-border"}`} />
            <p className={`text-xs ${i < step ? "text-ink" : "text-ink-soft"}`}>{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-8">
        {step === 1 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink">Ссылка на сайт</label>
            <input
              className={inputClass}
              value={form.website_url}
              onChange={(e) => update("website_url", e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink">Ниша</label>
            <input
              className={inputClass}
              value={form.niche}
              onChange={(e) => update("niche", e.target.value)}
              placeholder="Например: рецепты"
            />
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink">Язык контента</label>
            <select className={inputClass} value={form.language} onChange={(e) => update("language", e.target.value)}>
              <option value="ru">Русский</option>
              <option value="en">Английский</option>
            </select>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink">Цель</label>
            <select className={inputClass} value={form.goal} onChange={(e) => update("goal", e.target.value)}>
              <option value="">Выберите цель</option>
              <option value="traffic">Трафик на сайт</option>
              <option value="sales">Продажи</option>
              <option value="reach">Охват</option>
            </select>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink">Тон и стиль</label>
            <textarea
              className={inputClass}
              rows={4}
              value={form.tone}
              onChange={(e) => update("tone", e.target.value)}
              placeholder="Например: тёплый, продающий, для аудитории 25-40 лет"
            />
          </div>
        )}

        <div className="mt-8 flex justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink"
            >
              Назад
            </button>
          ) : (
            <span />
          )}
          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
            >
              Далее
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
            >
              Создать проект
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
