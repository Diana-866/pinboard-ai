import homeDecorImage from '../assets/images/1.png';
import matchaImage from '../assets/images/2.png';
import skincareImage from '../assets/images/3.png';
import travelImage from '../assets/images/4.png';

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

export const INITIAL_ACCOUNTS: PinterestAccount[] = [
  {
    id: 'acc-1',
    name: 'Botanica Nordic Living',
    handle: '@botanica_nordic',
    avatar: homeDecorImage,
    boardsCount: 4,
    monthlyViews: '340,2K',
    minDailyPins: 8,
    maxDailyPins: 16,
    nightlyAuto: true,
    autoTime: '01:00',
    timezone: 'Europe/Moscow',
    status: 'active',
    niche: 'Home Decor & Japandi Design',
  },
];

export const INITIAL_BOARDS: BoardItem[] = [
  {
    id: 'b-1',
    name: 'Scandinavian Living & Cozy Interiors',
    category: 'Home Decor',
    pinCount: 148,
    monthlyViews: 420500,
    seoScore: 94,
    missingKeywords: ['linen sofa styling', 'travertine coffee table', 'warm minimalist rug'],
    targetWeeklyPins: 12,
    coverImage: homeDecorImage,
  },
  {
    id: 'b-2',
    name: 'Artisanal Drinks & Matcha Rituals',
    category: 'Recipes',
    pinCount: 94,
    monthlyViews: 285000,
    seoScore: 89,
    missingKeywords: ['oat milk matcha foam', 'aesthetic iced latte glass', 'ceremonial grade tips'],
    targetWeeklyPins: 8,
    coverImage: matchaImage,
  },
  {
    id: 'b-3',
    name: 'Clean Skincare & Luxury Shelfies',
    category: 'Wellness',
    pinCount: 112,
    monthlyViews: 340000,
    seoScore: 91,
    missingKeywords: ['travertine bathroom tray', 'barrier repair serum routine', 'morning glass skin'],
    targetWeeklyPins: 10,
    coverImage: skincareImage,
  },
  {
    id: 'b-4',
    name: 'European Escapes & Amalfi Dreamscapes',
    category: 'Travel',
    pinCount: 86,
    monthlyViews: 210000,
    seoScore: 86,
    missingKeywords: ['positano viewpoint map', 'amalfi ferry tips', 'quiet italian villages'],
    targetWeeklyPins: 6,
    coverImage: travelImage,
  },
];

// Helper to generate dates relative to today
const getRelativeDate = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

export const PRESET_ACCOUNTS_TO_ADD: Omit<PinterestAccount, 'id'>[] = [
  {
    name: 'Artisanal Matcha Rituals',
    handle: '@matcha_rituals',
    avatar: matchaImage,
    boardsCount: 3,
    monthlyViews: '185,4K',
    minDailyPins: 6,
    maxDailyPins: 12,
    nightlyAuto: true,
    autoTime: '01:00',
    status: 'active',
    niche: 'Drinks, Matcha & Food Recipes',
  },
  {
    name: 'Clean Skincare & Barrier Glow',
    handle: '@minimal_skin',
    avatar: skincareImage,
    boardsCount: 2,
    monthlyViews: '94,1K',
    minDailyPins: 4,
    maxDailyPins: 10,
    nightlyAuto: false,
    autoTime: '02:00',
    status: 'active',
    niche: 'Beauty & Glass Skin Routine',
  },
  {
    name: 'Amalfi & European Escapes',
    handle: '@amalfi_voyage',
    avatar: travelImage,
    boardsCount: 5,
    monthlyViews: '512,0K',
    minDailyPins: 10,
    maxDailyPins: 20,
    nightlyAuto: true,
    autoTime: '03:15',
    status: 'active',
    niche: 'Travel, Italy & Photography',
  },
];

export const INITIAL_SCHEDULED_PINS: ScheduledPinItem[] = [
  {
    id: 'pin-1',
    title: '7 Warm Minimalist Living Room Rules That Transform Your Space',
    boardId: 'b-1',
    boardName: 'Scandinavian Living & Cozy Interiors',
    imageUrl: homeDecorImage,
    scheduledDate: getRelativeDate(0),
    scheduledTime: '20:30',
    status: 'scheduled',
    isOptimalSlot: true,
    destinationUrl: 'https://pinposy.com/blog/warm-minimalist-living',
    accountId: 'acc-1',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'pin-2',
    title: 'Artisanal Iced Matcha Cloud Latte: The 3-Minute Secret Foam',
    boardId: 'b-2',
    boardName: 'Artisanal Drinks & Matcha Rituals',
    imageUrl: matchaImage,
    scheduledDate: getRelativeDate(1),
    scheduledTime: '21:15',
    status: 'scheduled',
    isOptimalSlot: true,
    destinationUrl: 'https://pinposy.com/recipes/iced-matcha-cloud',
    accountId: 'acc-1',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'pin-3',
    title: 'The Minimalist AM Routine for Barrier Repair & Glass Skin Glow',
    boardId: 'b-3',
    boardName: 'Clean Skincare & Luxury Shelfies',
    imageUrl: skincareImage,
    scheduledDate: getRelativeDate(2),
    scheduledTime: '19:45',
    status: 'scheduled',
    isOptimalSlot: false,
    destinationUrl: 'https://pinposy.com/skincare/am-barrier-repair',
    accountId: 'acc-1',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'pin-4',
    title: 'Amalfi Coast Hidden Views: 5 Spots Tourists Always Miss in Positano',
    boardId: 'b-4',
    boardName: 'European Escapes & Amalfi Dreamscapes',
    imageUrl: travelImage,
    scheduledDate: getRelativeDate(3),
    scheduledTime: '20:15',
    status: 'scheduled',
    isOptimalSlot: true,
    destinationUrl: 'https://pinposy.com/guides/amalfi-hidden-gems',
    accountId: 'acc-1',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'pin-5',
    title: 'Japandi Bedroom Color Palettes That Promote Restful Deep Sleep',
    boardId: 'b-1',
    boardName: 'Scandinavian Living & Cozy Interiors',
    imageUrl: homeDecorImage,
    scheduledDate: getRelativeDate(-2),
    scheduledTime: '20:30',
    status: 'published',
    impressions: 48920,
    saves: 2314,
    clicks: 1420,
    destinationUrl: 'https://pinposy.com/blog/japandi-bedroom-palette',
    accountId: 'acc-1',
    accountHandle: '@botanica_nordic',
  },
  {
    id: 'pin-6',
    title: 'Ceremony Grade vs Culinary Matcha: What Coffee Shops Hide',
    boardId: 'b-2',
    boardName: 'Artisanal Drinks & Matcha Rituals',
    imageUrl: matchaImage,
    scheduledDate: getRelativeDate(-5),
    scheduledTime: '21:00',
    status: 'published',
    impressions: 89400,
    saves: 5120,
    clicks: 3840,
    destinationUrl: 'https://pinposy.com/recipes/ceremony-vs-culinary-matcha',
    accountId: 'acc-1',
    accountHandle: '@botanica_nordic',
  },
];
