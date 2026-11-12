import { BoardItem } from '../data/mockData';

const DEFAULT_BOARD_COVER = '/src/assets/images/pin_home_decor_1790670043705.jpg';
const LEGACY_BOARD_CATEGORIES = new Set([
  'Home Decor',
  'Recipes',
  'Wellness',
  'Travel',
  'Digital Products',
  'Fashion',
]);

/**
 * Convert the authenticated boards API response into the UI model.
 * Fail the entire response on malformed records instead of silently showing
 * an incomplete board list that could be mistaken for deleted user data.
 */
export function mapPersistedBoards(rows: unknown, invalidResponseMessage: string): BoardItem[] {
  if (!Array.isArray(rows)) {
    throw new Error(invalidResponseMessage);
  }

  const seenIds = new Set<string>();
  return rows.map((row: any) => {
    if (!row || (typeof row.id !== 'string' && typeof row.id !== 'number') ||
        typeof row.title !== 'string' || !row.title.trim()) {
      throw new Error(invalidResponseMessage);
    }

    const id = String(row.id).trim();
    if (!id || String(row.id) !== id || seenIds.has(id)) {
      throw new Error(invalidResponseMessage);
    }
    seenIds.add(id);

    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const storedCategory = typeof row.category === 'string' ? row.category.trim() : '';
    const legacyCategory = typeof row.description === 'string' && LEGACY_BOARD_CATEGORIES.has(row.description.trim())
      ? row.description.trim()
      : '';
    // Generated boards use description for SEO copy; only known legacy manual
    // category values may be recovered from that column.
    const category = storedCategory || legacyCategory ||
      (typeof project?.niche === 'string' && project.niche.trim() ? project.niche.trim() : '—');

    return {
      id,
      name: row.title.trim(),
      category,
      pinCount: Number.isInteger(row.pin_count) && row.pin_count >= 0 ? row.pin_count : 0,
      monthlyViews: 0,
      seoScore: 0,
      missingKeywords: [],
      targetWeeklyPins: 7,
      coverImage: DEFAULT_BOARD_COVER,
    };
  });
}
