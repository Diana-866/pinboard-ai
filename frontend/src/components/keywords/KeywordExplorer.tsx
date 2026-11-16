import React, { useCallback, useState } from 'react';
import { Search, Sparkles, Wand2, AlertCircle } from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { apiRequest } from '../../lib/api';

/**
 * Keyword ideas for the project niche.
 *
 * This screen used to render invented search volumes, a fabricated 90-day trend
 * chart and made-up competition scores. Pinterest does not expose search volume to
 * applications, so the screen now shows only what the backend can honestly produce:
 * a phrase, the intent behind it and a short note on who it suits.
 */
export type KeywordIntent = 'inspiration' | 'how_to' | 'product' | 'style' | 'seasonal';

export interface KeywordIdea {
  keyword: string;
  intent: KeywordIntent;
  why: string;
}

interface KeywordExplorerProps {
  onGenerateFromKeyword: (keyword: string) => void;
}

interface KeywordIdeasResponse {
  topic: string;
  language: string;
  count: number;
  items: KeywordIdea[];
}

const INTENT_STYLES: Record<KeywordIntent, string> = {
  inspiration: 'bg-pink-50 text-pink-700 border-pink-200',
  how_to: 'bg-sky-50 text-sky-700 border-sky-200',
  product: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  style: 'bg-violet-50 text-violet-700 border-violet-200',
  seasonal: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const KeywordExplorer: React.FC<KeywordExplorerProps> = ({ onGenerateFromKeyword }) => {
  const { t, language } = useI18n();
  const copy = t.keywords;

  const [topic, setTopic] = useState('');
  const [items, setItems] = useState<KeywordIdea[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const requestIdeas = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = (await apiRequest('/keywords', {
        method: 'POST',
        body: JSON.stringify({ topic: trimmed, count: 12, language }),
      })) as KeywordIdeasResponse;
      const rows = Array.isArray(response?.items) ? response.items : [];
      setItems(rows);
      setHasLoaded(true);
    } catch (err) {
      // Never keep stale rows next to an error: they would read as a fresh result.
      setItems([]);
      setHasLoaded(true);
      setError(err instanceof Error && err.message ? err.message : copy.aiError);
    } finally {
      setIsLoading(false);
    }
  }, [topic, isLoading, language, copy.aiError]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-pink-600" />
          {copy.aiTitle}
        </h2>
        <p className="text-slate-500 text-sm mt-2 max-w-3xl">{copy.aiSubtitle}</p>
      </div>

      <form
        className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void requestIdeas();
        }}
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={copy.aiPlaceholder}
            maxLength={200}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none text-sm"
            aria-label={copy.aiPlaceholder}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !topic.trim()}
          className="px-5 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Wand2 className="w-4 h-4" />
          {isLoading ? copy.aiLoading : copy.aiSubmit}
        </button>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && isLoading && items.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          {copy.aiLoading}
        </div>
      )}

      {!error && !isLoading && !hasLoaded && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          {copy.aiEmpty}
        </div>
      )}

      {!error && hasLoaded && items.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          {copy.aiEmpty}
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {items.map((item, index) => (
              <li key={`${item.keyword}-${index}`} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{item.keyword}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${
                        INTENT_STYLES[item.intent] || INTENT_STYLES.inspiration
                      }`}
                    >
                      {copy.intents[item.intent] || copy.intents.inspiration}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    <span className="text-slate-400">{copy.aiWhyLabel}: </span>
                    {item.why}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onGenerateFromKeyword(item.keyword)}
                  className="shrink-0 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:border-pink-300 hover:text-pink-700"
                >
                  {copy.generateFromKeyword}
                </button>
              </li>
            ))}
          </ul>
          <p className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">{copy.aiNote}</p>
        </div>
      )}
    </div>
  );
};
