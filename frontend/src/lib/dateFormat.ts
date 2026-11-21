/**
 * Section 143.
 *
 * Six places in the admin panel formatted timestamps with `date.toLocaleString()` and no locale, so the
 * same row read differently depending on the operator's browser: a German operator saw `12.12.2026,
 * 09:41:00` where the Russian operator saw `12.12.2026, 09:41:00` - and, worse, an American one saw
 * `12/12/2026, 9:41:00 AM`, where the day and the month swap places. The panel is used to decide about
 * money and deletions, so a date that depends on who is looking is a defect.
 *
 * One function, one locale, one fallback. `formattingLocale` keeps the choice of locale in the place that
 * already owns it.
 */
import { formattingLocale } from './intlLocale';

/** The character a missing or unusable timestamp renders as. */
export const EMPTY_TIMESTAMP = '—';

/**
 * A timestamp as the panel shows it, or {@link EMPTY_TIMESTAMP} when the value cannot be read.
 * Deterministic for a given language: the same row looks the same for every operator with that language.
 */
export function formatTimestamp(value: string | number | Date | null | undefined, language: string): string {
  if (value === null || value === undefined || value === '') return EMPTY_TIMESTAMP;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) return EMPTY_TIMESTAMP;
  return date.toLocaleString(formattingLocale(language), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
