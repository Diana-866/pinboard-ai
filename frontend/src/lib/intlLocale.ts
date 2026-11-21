/**
 * Section 142.
 *
 * Every place that formatted money or numbers chose between two locales: `language === 'ru' ? 'ru-RU' : 'en-US'`.
 * The product supports seven languages, so Spanish, Portuguese, German, French and Chinese customers were
 * shown American formatting - `1,990.00` where a German reader expects `1.990,00`, and `$11.9` grouping that
 * reads as eleven dollars and nine hundredths to someone used to a decimal comma. On a pricing screen that
 * is not cosmetic: the number is the message.
 *
 * One mapping, in one place, so the next formatter does not have to invent its own pair.
 */

export type FormattingLanguage = 'en' | 'ru' | 'es' | 'pt' | 'de' | 'fr' | 'zh';

const LOCALES: Record<FormattingLanguage, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  fr: 'fr-FR',
  zh: 'zh-CN',
};

/**
 * The BCP-47 locale to format numbers and dates with. Unknown input falls back to English rather than to
 * the last language that happened to be supported, and the caller can see that in the result.
 */
export function formattingLocale(language: unknown): string {
  const normalized = String(language ?? '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LOCALES, normalized)) {
    return LOCALES[normalized as FormattingLanguage];
  }
  return LOCALES.en;
}

/** The currency a language pays in, used together with {@link formattingLocale}. */
export function currencyForLanguage(language: unknown): 'RUB' | 'USD' {
  return String(language ?? '').trim().toLowerCase() === 'ru' ? 'RUB' : 'USD';
}
