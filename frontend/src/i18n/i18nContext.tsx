import React, { createContext, useContext, useEffect, useState } from 'react';
import { en } from './locales/en';
import { ru } from './locales/ru';
import { es } from './locales/es';
import { pt } from './locales/pt';
import { de } from './locales/de';
import { fr } from './locales/fr';
import { zh } from './locales/zh';
import { LanguageInfo, SUPPORTED_LANGUAGES, SupportedLanguage, TranslationSchema } from './types';

export const AI_CONTENT_LANGUAGES = [
  { code: 'en', name: 'English (US & Global)', native: 'English' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
];

const translationsMap: Record<SupportedLanguage, TranslationSchema> = {
  en,
  ru,
  es,
  pt,
  de,
  fr,
  zh,
};

const LANG_STORAGE_KEY = 'pinposy_lang';
const AI_CONTENT_LANG_KEY = 'pinposy_ai_content_lang';

interface I18nContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  aiContentLanguage: string;
  setAiContentLanguage: (lang: string) => void;
  t: TranslationSchema;
  currentLanguageInfo: LanguageInfo;
  supportedLanguages: LanguageInfo[];
  formatNumber: (value: number) => string;
  formatPercent: (value: number, decimals?: number) => string;
  formatCurrency: (value: number, currency?: string) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved && ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'].includes(saved)) {
        return saved as SupportedLanguage;
      }
    } catch {
      // ignore
    }
    // Автоопределение языка браузера при первом визите
    try {
      const browser = (navigator.languages?.[0] || navigator.language || '').toLowerCase();
      const short = browser.split('-')[0];
      const supported: SupportedLanguage[] = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];
      const match = supported.find((l) => l === short || browser.startsWith(l));
      if (match) return match;
    } catch {
      // ignore
    }
    // Unsupported browser languages should fall back to English, not Russian.
    return 'en';
  });

  const [aiContentLanguage, setAiContentLanguageState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(AI_CONTENT_LANG_KEY);
      if (saved && AI_CONTENT_LANGUAGES.some((item) => item.code === saved)) return saved;
    } catch {
      // ignore
    }
    // Match generated content to the selected interface language on first use.
    return AI_CONTENT_LANGUAGES.some((item) => item.code === language) ? language : 'en';
  });

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  };

  const setAiContentLanguage = (lang: string) => {
    setAiContentLanguageState(lang);
    try {
      localStorage.setItem(AI_CONTENT_LANG_KEY, lang);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = translationsMap[language] || translationsMap.en;
  const currentLanguageInfo =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  // Locale-sensitive formatters
  const getLocaleTag = (lang: SupportedLanguage): string => {
    switch (lang) {
      case 'ru': return 'ru-RU';
      case 'es': return 'es-ES';
      case 'pt': return 'pt-BR';
      case 'de': return 'de-DE';
      case 'fr': return 'fr-FR';
      case 'zh': return 'zh-CN';
      default: return 'en-US';
    }
  };

  const formatNumber = (value: number): string => {
    try {
      return new Intl.NumberFormat(getLocaleTag(language)).format(value);
    } catch {
      return value.toLocaleString();
    }
  };

  const formatPercent = (value: number, decimals: number = 1): string => {
    try {
      return new Intl.NumberFormat(getLocaleTag(language), {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value / 100);
    } catch {
      return `${value}%`;
    }
  };

  const formatCurrency = (value: number, currency: string = 'USD'): string => {
    try {
      return new Intl.NumberFormat(getLocaleTag(language), {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `$${value}`;
    }
  };

  const formatDate = (
    dateInput: Date | string | number,
    options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  ): string => {
    try {
      const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
      return new Intl.DateTimeFormat(getLocaleTag(language), options).format(d);
    } catch {
      return String(dateInput);
    }
  };

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        aiContentLanguage,
        setAiContentLanguage,
        t,
        currentLanguageInfo,
        supportedLanguages: SUPPORTED_LANGUAGES,
        formatNumber,
        formatPercent,
        formatCurrency,
        formatDate,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
