/**
 * Section 136.
 *
 * The settings screen and the calendar offered timezones as `language === 'ru' ? zone.nameRu : zone.nameEn`,
 * so Spanish, Portuguese, German, French and Chinese customers picked their timezone from a list written in
 * English. Only two of the seven supported languages had a name at all, because the option carried exactly
 * two of them.
 *
 * The names live here instead, one table per language, so a language without names is a visible hole
 * rather than a silent English fallback. A zone we do not know still falls back to the name it carries,
 * which keeps this helper usable with data added later.
 */

export type TimezoneNameLanguage = 'en' | 'ru' | 'es' | 'pt' | 'de' | 'fr' | 'zh';

export const TIMEZONE_NAME_LANGUAGES: readonly TimezoneNameLanguage[] = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];

type LocalizedNames = Record<string, string>;

const ES: LocalizedNames = {
  'Europe/Moscow': 'Moscú (MSK, UTC+3)',
  'America/New_York': 'Hora del Este de EE. UU. (Nueva York, Miami, EST/EDT)',
  'America/Chicago': 'Hora Central de EE. UU. (Chicago, Dallas, CST/CDT)',
  'America/Denver': 'Hora de las Montañas de EE. UU. (Denver, Phoenix, MST/MDT)',
  'America/Los_Angeles': 'Hora del Pacífico de EE. UU. (Los Ángeles, Seattle, PST/PDT)',
  'Europe/London': 'Reino Unido / Londres',
  'Europe/Berlin': 'Europa Central (Berlín, París)',
  'Asia/Dubai': 'EAU / Dubái (GST, UTC+4)',
  'Asia/Singapore': 'Singapur / Hong Kong (SGT, UTC+8)',
  'Asia/Tokyo': 'Japón / Tokio (JST, UTC+9)',
  'Australia/Sydney': 'Australia / Sídney',
};

const PT: LocalizedNames = {
  'Europe/Moscow': 'Moscou (MSK, UTC+3)',
  'America/New_York': 'Horário do Leste dos EUA (Nova York, Miami, EST/EDT)',
  'America/Chicago': 'Horário Central dos EUA (Chicago, Dallas, CST/CDT)',
  'America/Denver': 'Horário das Montanhas dos EUA (Denver, Phoenix, MST/MDT)',
  'America/Los_Angeles': 'Horário do Pacífico dos EUA (Los Angeles, Seattle, PST/PDT)',
  'Europe/London': 'Reino Unido / Londres',
  'Europe/Berlin': 'Europa Central (Berlim, Paris)',
  'Asia/Dubai': 'EAU / Dubai (GST, UTC+4)',
  'Asia/Singapore': 'Singapura / Hong Kong (SGT, UTC+8)',
  'Asia/Tokyo': 'Japão / Tóquio (JST, UTC+9)',
  'Australia/Sydney': 'Austrália / Sydney',
};

const DE: LocalizedNames = {
  'Europe/Moscow': 'Moskau (MSK, UTC+3)',
  'America/New_York': 'US-Ostküstenzeit (New York, Miami, EST/EDT)',
  'America/Chicago': 'US-Zentralzeit (Chicago, Dallas, CST/CDT)',
  'America/Denver': 'US-Gebirgszeit (Denver, Phoenix, MST/MDT)',
  'America/Los_Angeles': 'US-Pazifikzeit (Los Angeles, Seattle, PST/PDT)',
  'Europe/London': 'Vereinigtes Königreich / London',
  'Europe/Berlin': 'Mitteleuropa (Berlin, Paris)',
  'Asia/Dubai': 'VAE / Dubai (GST, UTC+4)',
  'Asia/Singapore': 'Singapur / Hongkong (SGT, UTC+8)',
  'Asia/Tokyo': 'Japan / Tokio (JST, UTC+9)',
  'Australia/Sydney': 'Australien / Sydney',
};

const FR: LocalizedNames = {
  'Europe/Moscow': 'Moscou (MSK, UTC+3)',
  'America/New_York': 'Heure de l’Est des États-Unis (New York, Miami, EST/EDT)',
  'America/Chicago': 'Heure du Centre des États-Unis (Chicago, Dallas, CST/CDT)',
  'America/Denver': 'Heure des Rocheuses (Denver, Phoenix, MST/MDT)',
  'America/Los_Angeles': 'Heure du Pacifique (Los Angeles, Seattle, PST/PDT)',
  'Europe/London': 'Royaume-Uni / Londres',
  'Europe/Berlin': 'Europe centrale (Berlin, Paris)',
  'Asia/Dubai': 'ÉAU / Dubaï (GST, UTC+4)',
  'Asia/Singapore': 'Singapour / Hong Kong (SGT, UTC+8)',
  'Asia/Tokyo': 'Japon / Tokyo (JST, UTC+9)',
  'Australia/Sydney': 'Australie / Sydney',
};

const ZH: LocalizedNames = {
  'Europe/Moscow': '莫斯科（MSK，UTC+3）',
  'America/New_York': '美国东部时间（纽约、迈阿密，EST/EDT）',
  'America/Chicago': '美国中部时间（芝加哥、达拉斯，CST/CDT）',
  'America/Denver': '美国山地时间（丹佛、凤凰城，MST/MDT）',
  'America/Los_Angeles': '美国太平洋时间（洛杉矶、西雅图，PST/PDT）',
  'Europe/London': '英国 / 伦敦',
  'Europe/Berlin': '中欧（柏林、巴黎）',
  'Asia/Dubai': '阿联酋 / 迪拜（GST，UTC+4）',
  'Asia/Singapore': '新加坡 / 香港（SGT，UTC+8）',
  'Asia/Tokyo': '日本 / 东京（JST，UTC+9）',
  'Australia/Sydney': '澳大利亚 / 悉尼',
};

const LOCALIZED: Record<Exclude<TimezoneNameLanguage, 'en' | 'ru'>, LocalizedNames> = {
  es: ES,
  pt: PT,
  de: DE,
  fr: FR,
  zh: ZH,
};

export interface NamedTimezone {
  value: string;
  nameEn: string;
  nameRu: string;
}

/**
 * The name of a timezone in the customer's language, falling back to the name the option carries when we
 * have no translation for it - never to English for a language we do translate.
 */
export function timezoneDisplayName(
  zone: NamedTimezone,
  language: string,
  translate?: (key: string) => string
): string {
  const normalized = String(language || '').toLowerCase() as TimezoneNameLanguage;
  if (normalized === 'ru') return zone.nameRu;
  if (normalized === 'en') return zone.nameEn;
  const table = LOCALIZED[normalized as Exclude<TimezoneNameLanguage, 'en' | 'ru'>];
  if (table) return table[zone.value] || translate?.(`timezone.${zone.value}`) || zone.nameEn;
  // Язык, для которого у нас нет таблицы: честно отдаём английское имя, а не пустоту.
  return zone.nameEn;
}

/**
 * Languages that have no name of their own for this zone.
 *
 * Deliberately strict: it reads the tables, not `timezoneDisplayName`, because that function falls back to
 * the English name. A detector that accepted the fallback would report no gaps while the customer still
 * read English - the defect it exists to prevent.
 */
export function missingTimezoneNames(zone: NamedTimezone): TimezoneNameLanguage[] {
  return TIMEZONE_NAME_LANGUAGES.filter((language) => {
    if (language === 'ru') return !zone.nameRu || !zone.nameRu.trim();
    if (language === 'en') return !zone.nameEn || !zone.nameEn.trim();
    const table = LOCALIZED[language];
    const name = table[zone.value];
    return !name || !name.trim();
  });
}
