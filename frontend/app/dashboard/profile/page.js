"use client";
import { useEffect, useState } from "react";
import { THEMES, getTheme, setTheme } from "../../../lib/theme";

export default function ProfilePage() {
  const [active, setActive] = useState("light-rose");

  useEffect(() => {
    setActive(getTheme());
  }, []);

  function handleSelect(themeId) {
    setTheme(themeId);
    setActive(themeId);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Профиль</h1>
      <p className="mt-1 text-sm text-ink-soft">Настройки внешнего вида</p>

      <div className="mt-8">
        <p className="mb-3 text-sm font-medium text-ink">Тема оформления</p>
        <div className="grid grid-cols-2 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              className={`flex items-center justify-between rounded-xl border p-4 text-left text-sm transition ${
                active === t.id ? "border-accent text-ink" : "border-border text-ink hover:border-ink"
              }`}
            >
              {t.label}
              {active === t.id && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                  <path d="M4 12l5 5L20 6" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}