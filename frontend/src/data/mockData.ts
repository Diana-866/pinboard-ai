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

export interface CompetitorViralPin {
  id: string;
  title: string;
  image: string;
  saves: number;
  impressions: number;
  ctr: string;
}

export interface CompetitorItem {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  monthlyViews: number;
  monthlyImpressions: number;
  monthlySaves: number;
  saveRate: number;
  followers: number;
  pinFrequency: number;
  topBoard: string;
  bestTimeToPin: string;
  visualCtrScore: number;
  dominantFormat: string;
  growth30d: number;
  gapKeywords: string[];
  topViralPins: CompetitorViralPin[];
}

export interface KeywordItem {
  id: string;
  query: string;
  category: string;
  monthlyVolume: number;
  trendPct: number;
  competition: 'Low' | 'Medium' | 'High';
  intent: 'Inspirational' | 'Transactional' | 'Commercial' | 'Educational';
  cpcValue: number;
  relatedTags: string[];
}

export interface ScheduledPinItem {
  id: string;
  pinId?: string;
  title: string;
  boardId: string;
  boardName: string;
  imageUrl: string;
  scheduledDate: string; // ISO date string
  scheduledTime: string;
  status: 'scheduled' | 'published' | 'draft';
  impressions?: number;
  saves?: number;
  clicks?: number;
  destinationUrl: string;
  pinterestBoardId?: string;
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
    avatar: '/src/assets/images/pin_home_decor_1790670043705.jpg',
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
    coverImage: '/src/assets/images/pin_home_decor_1790670043705.jpg',
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
    coverImage: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
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
    coverImage: '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
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
    coverImage: '/src/assets/images/pin_travel_amalfi_1790670078173.jpg',
  },
];

export const INITIAL_COMPETITORS: CompetitorItem[] = [
  {
    id: 'comp-1',
    name: 'Botanica Studio Living',
    handle: '@botanicastudio',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
    monthlyViews: 3820000,
    monthlyImpressions: 8940000,
    monthlySaves: 245000,
    saveRate: 6.4,
    followers: 128400,
    pinFrequency: 14,
    topBoard: 'Organic Minimalist Home',
    bestTimeToPin: '8:45 PM EST',
    visualCtrScore: 9.4,
    dominantFormat: '2:3 Multi-frame Collage',
    growth30d: 14.2,
    gapKeywords: ['limewash paint ideas', 'wabi sabi coffee table decor', 'neutral entryway bench'],
    topViralPins: [
      {
        id: 'cvp-1',
        title: 'Neutral Living Room Styling with Limewash Paint & Linen',
        image: '/src/assets/images/pin_home_decor_1790670043705.jpg',
        saves: 42100,
        impressions: 610000,
        ctr: '4.9%',
      },
      {
        id: 'cvp-2',
        title: 'Travertine Coffee Table Rules & Shelf Decor Layouts',
        image: '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
        saves: 28400,
        impressions: 390000,
        ctr: '4.2%',
      },
      {
        id: 'cvp-3',
        title: 'Wabi-Sabi Organic Ceramics: Warm Earthy Interior Guide',
        image: '/src/assets/images/pin_home_decor_1790670043705.jpg',
        saves: 19800,
        impressions: 280000,
        ctr: '3.8%',
      },
    ],
  },
  {
    id: 'comp-2',
    name: 'Nordic Sanctuary Design',
    handle: '@nordicsanctuary',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=face',
    monthlyViews: 2150000,
    monthlyImpressions: 4890000,
    monthlySaves: 132000,
    saveRate: 6.1,
    followers: 86200,
    pinFrequency: 9,
    topBoard: 'Warm Neutral Aesthetic',
    bestTimeToPin: '9:15 PM EST',
    visualCtrScore: 8.8,
    dominantFormat: 'Single Bold Hero + Headline',
    growth30d: 9.6,
    gapKeywords: ['linen curtains aesthetic', 'japandi bedroom color palette', 'fluted wood accent wall'],
    topViralPins: [
      {
        id: 'cvp-4',
        title: 'Fluted Wood Wall DIY with Minimalist Neutral Bedding',
        image: '/src/assets/images/pin_home_decor_1790670043705.jpg',
        saves: 31200,
        impressions: 410000,
        ctr: '4.5%',
      },
      {
        id: 'cvp-5',
        title: 'Japandi Bedroom Palettes That Guarantee Deep Rest',
        image: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
        saves: 21000,
        impressions: 295000,
        ctr: '3.9%',
      },
    ],
  },
  {
    id: 'comp-3',
    name: 'Aesthetic Daily & Rituals',
    handle: '@aestheticdaily',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
    monthlyViews: 5410000,
    monthlyImpressions: 12400000,
    monthlySaves: 480000,
    saveRate: 7.2,
    followers: 215000,
    pinFrequency: 22,
    topBoard: 'Slow Living & Morning Habits',
    bestTimeToPin: '7:30 PM EST',
    visualCtrScore: 9.7,
    dominantFormat: 'Step-by-Step Carousel',
    growth30d: 21.8,
    gapKeywords: ['morning matcha ritual setup', 'clay ceramic cup collection', 'daily wellness checklist'],
    topViralPins: [
      {
        id: 'cvp-6',
        title: 'Iced Vanilla Oat Matcha Foam Recipe (The 3-Minute Secret)',
        image: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
        saves: 84000,
        impressions: 1120000,
        ctr: '5.6%',
      },
      {
        id: 'cvp-7',
        title: 'Morning Skincare Barrier Repair: Glass Skin Routine',
        image: '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
        saves: 62000,
        impressions: 890000,
        ctr: '5.1%',
      },
    ],
  },
  {
    id: 'comp-4',
    name: 'Studio Solace Visuals',
    handle: '@studiosolace',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
    monthlyViews: 1240000,
    monthlyImpressions: 2980000,
    monthlySaves: 88000,
    saveRate: 5.8,
    followers: 44900,
    pinFrequency: 6,
    topBoard: 'Earthy Architecture',
    bestTimeToPin: '8:00 PM EST',
    visualCtrScore: 8.2,
    dominantFormat: 'High-contrast Editorial Still',
    growth30d: 5.4,
    gapKeywords: ['travertine plinth styling', 'warm terracotta planter ideas', 'concrete bathroom shelf'],
    topViralPins: [
      {
        id: 'cvp-8',
        title: 'Amalfi Coast Hidden Views in Positano (Avoid Crowds)',
        image: '/src/assets/images/pin_travel_amalfi_1790670078173.jpg',
        saves: 22000,
        impressions: 340000,
        ctr: '4.1%',
      },
    ],
  },
];

export const INITIAL_KEYWORDS: KeywordItem[] = [
  {
    id: 'kw-1',
    query: 'minimalist living room styling ideas',
    category: 'Home Decor',
    monthlyVolume: 245000,
    trendPct: 42,
    competition: 'Low',
    intent: 'Inspirational',
    cpcValue: 1.45,
    relatedTags: ['scandi living room', 'warm minimalism', 'neutral sofa decor', 'cozy aesthetic apartment'],
  },
  {
    id: 'kw-2',
    query: 'aesthetic iced matcha latte recipe foam',
    category: 'Recipes',
    monthlyVolume: 182000,
    trendPct: 28,
    competition: 'Medium',
    intent: 'Educational',
    cpcValue: 0.95,
    relatedTags: ['ceremonial matcha drink', 'cold foam recipe', 'oat milk latte aesthetic', 'morning cafe at home'],
  },
  {
    id: 'kw-3',
    query: 'clean skincare shelfie routine order',
    category: 'Wellness',
    monthlyVolume: 138000,
    trendPct: 35,
    competition: 'Low',
    intent: 'Commercial',
    cpcValue: 2.1,
    relatedTags: ['glass skin serum order', 'barrier restore moisturizer', 'minimalist aesthetic bathroom', 'travertine tray decor'],
  },
  {
    id: 'kw-4',
    query: 'amalfi coast 5 day travel itinerary',
    category: 'Travel',
    monthlyVolume: 312000,
    trendPct: 64,
    competition: 'High',
    intent: 'Commercial',
    cpcValue: 3.25,
    relatedTags: ['positano ferry guide', 'ravello sunset views', 'budget amalfi trip', 'best photo spots italy'],
  },
  {
    id: 'kw-5',
    query: 'neutral bedroom aesthetic warm cozy',
    category: 'Home Decor',
    monthlyVolume: 285000,
    trendPct: 15,
    competition: 'Medium',
    intent: 'Inspirational',
    cpcValue: 1.8,
    relatedTags: ['linen duvet cover', 'wooden nightstand styling', 'dimmable warm lamp', 'japandi bedroom decor'],
  },
  {
    id: 'kw-6',
    query: 'digital planner notion template aesthetic',
    category: 'Digital Products',
    monthlyVolume: 164000,
    trendPct: 53,
    competition: 'Medium',
    intent: 'Transactional',
    cpcValue: 2.85,
    relatedTags: ['life dashboard notion', 'aesthetic habit tracker', 'ipad goodnotes planner', 'student productivity system'],
  },
  {
    id: 'kw-7',
    query: 'clay ceramic vase styling dried florals',
    category: 'Home Decor',
    monthlyVolume: 92000,
    trendPct: 19,
    competition: 'Low',
    intent: 'Inspirational',
    cpcValue: 1.15,
    relatedTags: ['pampas grass arrangement', 'matte pottery vase', 'shelf decor aesthetic', 'coffee table centerpiece'],
  },
  {
    id: 'kw-8',
    query: 'morning routine habit stack slow living',
    category: 'Wellness',
    monthlyVolume: 215000,
    trendPct: 31,
    competition: 'Low',
    intent: 'Inspirational',
    cpcValue: 1.6,
    relatedTags: ['5am club routine', 'journaling prompts morning', 'screen free mornings', 'healthy breakfast aesthetic'],
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
    avatar: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
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
    avatar: '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
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
    avatar: '/src/assets/images/pin_travel_amalfi_1790670078173.jpg',
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
    imageUrl: '/src/assets/images/pin_home_decor_1790670043705.jpg',
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
    imageUrl: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
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
    imageUrl: '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
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
    imageUrl: '/src/assets/images/pin_travel_amalfi_1790670078173.jpg',
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
    imageUrl: '/src/assets/images/pin_home_decor_1790670043705.jpg',
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
    imageUrl: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
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
