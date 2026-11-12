import { BoardItem } from '../data/mockData';
import defaultBoardCover from '../assets/images/1.png';

const DEFAULT_BOARD_COVER = defaultBoardCover;
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

/** Validate the single row returned by POST /boards before adding it to local UI state. */
export function requireCreatedBoardResponse(
  value: unknown,
  invalidResponseMessage: string,
): { id: string; title: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(invalidResponseMessage);
  }
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' || typeof row.id === 'number'
    ? String(row.id)
    : '';
  if (!id.trim() || id !== id.trim() || typeof row.title !== 'string' || !row.title.trim()) {
    throw new Error(invalidResponseMessage);
  }
  return { id, title: row.title.trim() };
}

/** Validate the server's PATCH /boards/:id response before reconciling UI state. */
export function requireUpdatedBoardResponse(
  value: unknown,
  expectedId: string,
  invalidResponseMessage: string,
): { id: string; title: string; category: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(invalidResponseMessage);
  }
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' || typeof row.id === 'number'
    ? String(row.id)
    : '';
  if (id !== expectedId || !id.trim() || id !== id.trim() ||
      typeof row.title !== 'string' || !row.title.trim() ||
      (row.category != null && typeof row.category !== 'string')) {
    throw new Error(invalidResponseMessage);
  }
  return {
    id,
    title: row.title.trim(),
    category: typeof row.category === 'string' && row.category.trim()
      ? row.category.trim()
      : null,
  };
}
