/**
 * Типы данных интерфейса.
 *
 * Демонстрационные массивы (аккаунты, доски, расписание) отсюда удалены: экран, показывающий
 * выдуманные проекты и цифры, невозможно отличить от рабочего, и владелец принимал такие
 * картинки за реальные данные. Всё, что видно в интерфейсе, приходит из API.
 */
export interface BoardItem {
  id: string;
  name: string;
  category: string;
  pinCount: number;
  monthlyViews: number;
  seoScore: number;
  missingKeywords: string[];
  targetWeeklyPins: number;
  coverImage: string;
}

export interface ScheduledPinItem {
  id: string;
  pinId?: string;
  title: string;
  description?: string;
  boardId: string;
  boardName: string;
  imageUrl: string;
  scheduledDate: string; // ISO date string
  scheduledTime: string;
  status: 'scheduled' | 'publishing' | 'published' | 'failed' | 'unknown' | 'cancelled' | 'draft';
  retryable?: boolean;
  retryReason?: string;
  failureReason?: 'board_unavailable' | null;
  impressions?: number;
  saves?: number;
  clicks?: number;
  destinationUrl: string;
  pinterestBoardId?: string;
  pinterestAccountId?: string;
  pinterestPinId?: string;
  pinterestPinUrl?: string;
  isOptimalSlot?: boolean;
  accountId?: string;
  accountHandle?: string;
}

export interface PinterestAccount {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  boardsCount: number;
  monthlyViews: string;
  minDailyPins: number;
  maxDailyPins: number;
  nightlyAuto: boolean;
  autoTime?: string; // Configurable auto-generation time (e.g. '01:00')
  timezone?: string; // Configurable timezone (e.g. 'Europe/Moscow', 'America/New_York')
  status: 'active' | 'syncing' | 'error';
  niche: string;
}

// Helper to generate dates relative to today
const getRelativeDate = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

