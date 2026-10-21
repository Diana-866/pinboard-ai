import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type Lang = 'ru' | 'en';

/** Мини-рендер markdown: #, ##, ###, списки "-", **жирный**, --- */
export function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  );
}

export function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-4">
          {list.map((li, i) => (
            <li key={i}>{renderInline(li)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  lines.forEach((line, idx) => {
    const t = line.trim();
    if (!t || t === '---') {
      flushList();
      return;
    }
    if (t.startsWith('### ')) {
      flushList();
      out.push(
        <h3 key={idx} className="text-base font-semibold text-primary-theme mt-4 mb-2">
          {renderInline(t.slice(4))}
        </h3>
      );
      return;
    }
    if (t.startsWith('## ')) {
      flushList();
      out.push(
        <h2 key={idx} className="text-xl font-semibold text-primary-theme mt-8 mb-3">
          {renderInline(t.slice(3))}
        </h2>
      );
      return;
    }
    if (t.startsWith('# ')) {
      flushList();
      out.push(
        <h1 key={idx} className="text-3xl font-semibold text-primary-theme mb-2">
          {renderInline(t.slice(2))}
        </h1>
      );
      return;
    }
    if (t.startsWith('- ')) {
      list.push(t.slice(2));
      return;
    }
    flushList();
    out.push(
      <p key={idx} className="text-sm text-secondary-theme mb-4">
        {renderInline(t)}
      </p>
    );
  });
  flushList();
  return out;
}

interface LegalPageProps {
  ru: string;
  en: string;
}

export const LegalPage: React.FC<LegalPageProps> = ({ ru, en }) => {
  const [lang, setLang] = useState<Lang>('ru');
  const navigate = useNavigate();

  const back = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/login');
  };

  return (
    <div className="min-h-screen bg-page px-4 py-12">
      <div className="max-w-3xl mx-auto bg-surface border border-subtle rounded-2xl p-6 md:p-12">
        <div className="flex items-center justify-between mb-6">
          <Link to="/" onClick={(e) => { e.preventDefault(); back(); }} className="text-sm text-accent">
            ← Назад
          </Link>
          <div className="flex rounded-lg border border-subtle overflow-hidden text-xs">
            <button
              onClick={() => setLang('ru')}
              className={`px-3 py-1.5 font-bold transition-colors ${
                lang === 'ru' ? 'bg-accent text-white' : 'text-primary-theme hover:bg-accent/5'
              }`}
            >
              RU
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-3 py-1.5 font-bold transition-colors ${
                lang === 'en' ? 'bg-accent text-white' : 'text-primary-theme hover:bg-accent/5'
              }`}
            >
              EN
            </button>
          </div>
        </div>
        {renderMarkdown(lang === 'ru' ? ru : en)}
      </div>
    </div>
  );
};
