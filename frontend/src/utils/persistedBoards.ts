import { BoardItem } from '../data/mockData';

const DEFAULT_BOARD_COVER = '/src/assets/images/pin_home_decor_1790670043705.jpg';

/**
 * Convert the authenticated boards API response into the UI model.
 * Fail the entire response on malformed records instead of silently showing
 * an incomplete board list that could be mistaken for deleted user data.
 */
export function mapPersistedBoards(rows: unknown, invalidResponseMessage: string): BoardItem[] {
  if (!Array.isArray(rows)) {
    throw new Error(invalidResponseMessage);
  }

  return rows.map((row: any) => {
    if (!row || (typeof row.id !== 'string' && typeof row.id !== 'number') ||
        typeof row.title !== 'string' || !row.title.trim()) {
      throw new Error(invalidResponseMessage);
    }

    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    // Board description stores the category selected in BoardsManager.
    // Project niche is shared by every board and is only a legacy fallback.
    const category = typeof row.description === 'string' && row.description.trim()
      ? row.description.trim()
      : typeof project?.niche === 'string' && project.niche.trim()
        ? project.niche.trim()
        : '—';

    return {
      id: String(row.id),
      name: row.title.trim(),
      category,
      pinCount: 0,
      monthlyViews: 0,
      seoScore: 0,
      missingKeywords: [],
      targetWeeklyPins: 7,
      coverImage: DEFAULT_BOARD_COVER,
    };
  });
}
