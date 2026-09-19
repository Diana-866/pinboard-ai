'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../../../lib/api';

export default function NewProjectPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ website_url: '', niche: '', language: 'ru', goal: '', tone: '' });
  const router = useRouter();

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  async function handleFinish() {
    await apiRequest('/projects', { method: 'POST', body: JSON.stringify(form) });
    router.push('/dashboard');
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 font-display text-2xl font-semibold text-ink">Новый проект — шаг {step} из 5</h1>

      {step === 1 && (
        <div className="space-y-3">
          <label className="block text-sm">Ссылка на сайт</label>
          <input className="w-full rounded-sm border border-border bg-white p-2 text-ink outline-none focus:border-berry" value={form.website_url} onChange={(e) => update('website_url', e.target.value)} placeholder="https://..." />
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <label className="block text-sm">Ниша</label>
          <input className="w-full rounded-sm border border-border bg-white p-2 text-ink outline-none focus:border-berry" value={form.niche} onChange={(e) => update('niche', e.target.value)} placeholder="Например: рецепты" />
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <label className="block text-sm">Язык контента</label>
          <select className="w-full rounded-sm border border-border bg-white p-2 text-ink outline-none focus:border-berry" value={form.language} onChange={(e) => update('language', e.target.value)}>
            <option value="ru">Русский</option>
            <option value="en">Английский</option>
          </select>
        </div>
      )}
      {step === 4 && (
        <div className="space-y-3">
          <label className="block text-sm">Цель</label>
          <select className="w-full rounded-sm border border-border bg-white p-2 text-ink outline-none focus:border-berry" value={form.goal} onChange={(e) => update('goal', e.target.value)}>
            <option value="">Выбери цель</option>
            <option value="traffic">Трафик на сайт</option>
            <option value="sales">Продажи</option>
            <option value="reach">Охват</option>
          </select>
        </div>
      )}
      {step === 5 && (
        <div className="space-y-3">
          <label className="block text-sm">Тон и стиль (свободное описание)</label>
          <textarea className="w-full rounded-sm border border-border bg-white p-2 text-ink outline-none focus:border-berry" value={form.tone} onChange={(e) => update('tone', e.target.value)} placeholder="Например: тёплый, продающий, для аудитории 25-40 лет" />
        </div>
      )}

      <div className="mt-6 flex justify-between">
        {step > 1 && <button onClick={() => setStep(step - 1)} className="rounded-sm border border-border px-4 py-2">Назад</button>}
        {step < 5 && <button onClick={() => setStep(step + 1)} className="ml-auto rounded-sm bg-berry px-4 py-2 text-white transition hover:bg-berry-dark">Далее</button>}
        {step === 5 && <button onClick={handleFinish} className="ml-auto rounded-sm bg-berry px-4 py-2 text-white transition hover:bg-berry-dark">Создать проект</button>}
      </div>
    </div>
  );
}