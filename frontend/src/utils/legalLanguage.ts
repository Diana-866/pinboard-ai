export type LegalLanguage = 'ru' | 'en';

/** The legal documents are published in Russian and English only. */
export function resolveLegalLanguage(language: unknown): LegalLanguage {
  return String(language || '').trim().toLowerCase() === 'ru' ? 'ru' : 'en';
}
