import React, { useState } from 'react';
import {
  Users,
  Eye,
  Clock,
  Sparkles,
  Plus,
  ArrowUpRight,
  TrendingUp,
  Layers,
  ChevronRight,
  Bookmark,
  Share2,
  ExternalLink,
  Check,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { useNotifications } from '../../context/NotificationContext';
import { INITIAL_COMPETITORS, CompetitorItem } from '../../data/mockData';

interface CompetitorAuditProps {
  onGenerateFromGap: (topic: string) => void;
}

interface SuggestedCompetitor {
  handle: string;
  name: string;
  niche: string;
  avatar: string;
  monthlyViews: number;
  followers: number;
  matchScore: number;
  reason: string;
  sampleKeywords: string[];
}

const DEFAULT_SUGGESTIONS: SuggestedCompetitor[] = [
  {
    handle: '@aesthetichomenordic',
    name: 'Aesthetic Home Nordic',
    niche: 'Скандинавский интерьер & Уют',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&crop=face',
    monthlyViews: 2400000,
    followers: 48500,
    matchScore: 96,
    reason: '96% пересечение по доскам интерьера и высокому Save Rate (5.2%)',
    sampleKeywords: ['скандинавский декор', 'уютная спальня', 'минимализм'],
  },
  {
    handle: '@scandicraft',
    name: 'Scandi Craft Studio',
    niche: 'DIY Декор & Хэндмейд',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&h=120&fit=crop&crop=face',
    monthlyViews: 890000,
    followers: 22400,
    matchScore: 91,
    reason: 'Высокая вовлеченность в запросах #scandihome и #japandiliving',
    sampleKeywords: ['diy интерьер', 'сканди поделки', 'эко декор'],
  },
  {
    handle: '@nordicminimalist',
    name: 'Nordic Minimalist Living',
    niche: 'Минимализм & Организация',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face',
    monthlyViews: 1650000,
    followers: 35100,
    matchScore: 88,
    reason: 'Идентичный формат 9:16 и общая целевая аудитория (женщины 25-44)',
    sampleKeywords: ['минималистичный дом', 'расхламление', 'эстетика порядка'],
  },
  {
    handle: '@cozyhyggecorner',
    name: 'Cozy Hygge Corner',
    niche: 'Хюгге атмосфера & Текстиль',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&crop=face',
    monthlyViews: 720000,
    followers: 18900,
    matchScore: 85,
    reason: 'Топ-сохраняемость в категории спален и теплого освещения',
    sampleKeywords: ['хюгге вечер', 'теплый плед декор', 'свечи эстетика'],
  },
];

const EXTENDED_SUGGESTIONS_POOL: SuggestedCompetitor[] = [
  ...DEFAULT_SUGGESTIONS,
  {
    handle: '@japandispaces',
    name: 'Japandi Spaces Studio',
    niche: 'Japandi & Природный декор',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face',
    monthlyViews: 3100000,
    followers: 62000,
    matchScore: 94,
    reason: '94% пересечение по эстетике дерева, льна и глины. Save Rate 6.1%',
    sampleKeywords: ['джапанди интерьер', 'природные текстуры', 'дзен спальня'],
  },
  {
    handle: '@warmminimalist',
    name: 'Warm Minimalist Living',
    niche: 'Теплый минимализм & Свет',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&h=120&fit=crop&crop=face',
    monthlyViews: 1450000,
    followers: 29800,
    matchScore: 89,
    reason: 'Сильные вирусные пины в формате 2:3 с акцентом на бежевую гамму',
    sampleKeywords: ['теплый минимализм', 'бежевый интерьер', 'уютный свет'],
  },
  {
    handle: '@hyggeceramicstudio',
    name: 'Hygge Ceramics & Home',
    niche: 'Керамика & Предметы интерьера',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&h=120&fit=crop&crop=face',
    monthlyViews: 980000,
    followers: 21500,
    matchScore: 87,
    reason: 'Высокий спрос на идеи подарков и ручную работу для кухни',
    sampleKeywords: ['керамика ручной работы', 'уютная кухня', 'эстетика чая'],
  },
];

export const CompetitorAudit: React.FC<CompetitorAuditProps> = ({
  onGenerateFromGap,
}) => {
  const { t, formatNumber, formatPercent } = useI18n();
  const { enqueueTask } = useNotifications();

  const [competitors, setCompetitors] = useState<CompetitorItem[]>(INITIAL_COMPETITORS);
  const [newHandle, setNewHandle] = useState('');
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorItem>(INITIAL_COMPETITORS[0]);
  const [suggestions, setSuggestions] = useState<SuggestedCompetitor[]>(DEFAULT_SUGGESTIONS);
  const [addedHandles, setAddedHandles] = useState<Set<string>>(new Set());

  const handleRefreshSuggestions = () => {
    const shuffled = [...EXTENDED_SUGGESTIONS_POOL].sort(() => 0.5 - Math.random());
    setSuggestions(shuffled.slice(0, 4));
  };

  const handleAddCompetitor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHandle.trim()) return;

    const clean = newHandle.replace(/^@/, '');
    const newComp: CompetitorItem = {
      id: `comp-${Date.now()}`,
      name: `${clean.charAt(0).toUpperCase() + clean.slice(1)} Studio`,
      handle: `@${clean.toLowerCase()}`,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
      monthlyViews: 0,
      monthlyImpressions: 0,
      monthlySaves: 0,
      saveRate: 0,
      followers: 0,
      pinFrequency: 0,
      topBoard: '',
      bestTimeToPin: '',
      visualCtrScore: 0,
      dominantFormat: '',
      growth30d: 0,
      gapKeywords: [`${clean} aesthetic ideas`, 'minimalist decor hacks', 'warm interior pins'],
      topViralPins: [],
    };

    setCompetitors([newComp, ...competitors]);
    setSelectedCompetitor(newComp);
    setNewHandle('');
  };

  const handleAddSuggested = (sug: SuggestedCompetitor) => {
    if (addedHandles.has(sug.handle)) return;

    const newComp: CompetitorItem = {
      id: `comp-${Date.now()}-${sug.handle}`,
      name: sug.name,
      handle: sug.handle,
      avatar: sug.avatar,
      monthlyViews: 0,
      monthlyImpressions: 0,
      monthlySaves: 0,
      saveRate: 0,
      followers: 0,
      pinFrequency: 0,
      topBoard: '',
      bestTimeToPin: '',
      visualCtrScore: 0,
      dominantFormat: '',
      growth30d: 0,
      gapKeywords: sug.sampleKeywords,
      topViralPins: [],
    };

    setCompetitors((prev) => [newComp, ...prev]);
    setSelectedCompetitor(newComp);
    setAddedHandles((prev) => new Set(prev).add(sug.handle));

    enqueueTask({
      title: t.competitors.addedToAudit,
      message: t.competitors.dataDemoNotice,
      type: 'competitor',
      actionTab: 'competitors',
      durationMs: 4000,
      completionTitle: t.competitors.addedToAudit,
      completionMessage: t.competitors.dataDemoNotice,
    });
  };

  return (
    <div className="space-y-6">
      {/* Title & Intro */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary-theme font-heading">
          {t.competitors.title}
        </h1>
        <p className="text-xs md:text-sm text-secondary-theme mt-1">
          {t.competitors.subtitle}
        </p>
      </div>
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-secondary-theme" role="note">{t.competitors.dataDemoNotice}</p>

      {/* Add Competitor Bar */}
      <form onSubmit={handleAddCompetitor} className="custom-card p-3 rounded-2xl flex items-center gap-2">
        <input
          type="text"
          value={newHandle}
          onChange={(e) => setNewHandle(e.target.value)}
          placeholder={t.competitors.inputPlaceholder}
          className="flex-1 px-3 py-2 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme placeholder:text-muted-theme focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          className="accent-btn px-4 py-2 rounded-xl text-xs md:text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{t.competitors.addCompetitorBtn}</span>
        </button>
      </form>

      {/* Competitor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {competitors.map((comp) => {
          const isSelected = selectedCompetitor.id === comp.id;
          return (
            <div
              key={comp.id}
              onClick={() => setSelectedCompetitor(comp)}
              className={`custom-card p-4 rounded-2xl cursor-pointer transition-all space-y-3 ${
                isSelected
                  ? 'ring-2 ring-accent border-transparent shadow-md'
                  : 'hover:border-strong'
              }`}
            >
              <div className="flex items-center gap-3">
                <img
                  src={comp.avatar}
                  alt={comp.name}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border border-subtle shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-xs md:text-sm font-bold text-primary-theme truncate">
                    {comp.name}
                  </h3>
                  <p className="text-[11px] text-muted-theme font-mono truncate">
                    {comp.handle}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-subtle text-xs">
                <div>
                  <span className="text-[10px] text-muted-theme uppercase tracking-wider block">
                    {t.competitors.monthlyViews}
                  </span>
                  <span className="font-mono font-bold text-primary-theme">
                    {formatNumber(comp.monthlyViews)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-theme uppercase tracking-wider block">
                    {t.competitors.saves}
                  </span>
                  <span className="font-mono font-bold text-primary-theme">
                    {formatNumber(comp.monthlySaves || 120000)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1 text-secondary-theme">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-theme" />
                  <span>{comp.bestTimeToPin}</span>
                </span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  +{comp.growth30d}% 30d
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI RECOMMENDED SIMILAR COMPETITORS SECTION (User requested similar accounts discovery with links) */}
      <div className="custom-card p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-subtle pb-3">
          <div>
            <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent-ghost" />
              <span>{t.competitors.suggestedTitle}</span>
            </h2>
            <p className="text-xs text-muted-theme mt-0.5">
              {t.competitors.suggestedSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <span className="text-xs font-mono text-muted-theme">
              {t.competitors.recommendedCount}: {suggestions.length}
            </span>
            <button
              type="button"
              onClick={handleRefreshSuggestions}
              className="text-xs font-semibold text-accent-ghost hover:underline flex items-center gap-1 cursor-pointer transition-transform active:scale-95"
              title={t.competitors.refreshSuggestions}
            >
              <RefreshCw className="w-3 h-3" />
              <span>{t.competitors.refreshSuggestions}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {suggestions.map((sug) => {
            const isAdded =
              addedHandles.has(sug.handle) ||
              competitors.some((c) => c.handle.toLowerCase() === sug.handle.toLowerCase());

            return (
              <div
                key={sug.handle}
                className="p-4 rounded-xl border border-subtle bg-surface flex flex-col justify-between space-y-3 shadow-xs hover:border-strong transition-all"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={sug.avatar}
                        alt={sug.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-subtle shrink-0 shadow-xs"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs md:text-sm font-bold text-primary-theme truncate">
                          {sug.name}
                        </h4>
                        <a
                          href={`https://pinterest.com/${sug.handle.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-accent-ghost hover:underline font-mono truncate flex items-center gap-0.5"
                          title={t.competitors.visitProfile}
                        >
                          <span>{sug.handle}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>

                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold accent-pill font-mono">
                      {sug.matchScore}%
                    </span>
                  </div>

                  <span className="text-[10px] font-semibold text-muted-theme uppercase tracking-wider block">
                    {sug.niche}
                  </span>

                  <p className="text-[11px] text-secondary-theme leading-relaxed">
                    {sug.reason}
                  </p>

                  <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-muted-theme border-t border-subtle">
                    <span>{formatNumber(sug.monthlyViews)} views</span>
                    <span>{formatNumber(sug.followers)} fans</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <a
                    href={`https://pinterest.com/${sug.handle.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl border border-subtle bg-subtle hover:bg-surface text-secondary-theme hover:text-primary-theme transition-colors cursor-pointer shrink-0"
                    title={t.competitors.visitProfile}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    disabled={isAdded}
                    onClick={() => handleAddSuggested(sug)}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                      isAdded
                        ? 'bg-subtle text-muted-theme border border-subtle cursor-default'
                        : 'accent-btn'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{t.competitors.addedToAudit}</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t.competitors.addToAudit}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Competitor In-Depth Analytics & Audit */}
      <div className="custom-card p-5 rounded-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-primary-theme font-heading">
                {selectedCompetitor.name}
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-subtle text-secondary-theme">
                {selectedCompetitor.handle}
              </span>
              <a
                href={`https://pinterest.com/${selectedCompetitor.handle.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-subtle bg-surface hover:bg-subtle text-[11px] font-semibold text-accent-ghost transition-colors cursor-pointer"
                title={t.competitors.visitProfile}
              >
                <span>{t.competitors.visitProfile}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-secondary-theme mt-1">
              {t.competitors.dominantFormatLabel}: <span className="font-semibold text-primary-theme">{selectedCompetitor.dominantFormat}</span> · {selectedCompetitor.pinFrequency} {t.competitors.pinsPerDayLabel}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              Visual CTR Score: {selectedCompetitor.visualCtrScore} / 10
            </span>
          </div>
        </div>

        {/* 4 Deep Analytics KPI Tiles for Competitor */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-subtle border border-subtle">
            <span className="text-[10px] text-muted-theme uppercase tracking-wider block">
              {t.competitors.impressionsTotal}
            </span>
            <span className="text-base md:text-lg font-mono font-bold text-primary-theme">
              {selectedCompetitor.monthlyImpressions > 0 ? formatNumber(selectedCompetitor.monthlyImpressions) : '—'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-subtle border border-subtle">
            <span className="text-[10px] text-muted-theme uppercase tracking-wider block">
              {t.competitors.savesTotal}
            </span>
            <span className="text-base md:text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {selectedCompetitor.monthlySaves > 0 ? formatNumber(selectedCompetitor.monthlySaves) : '—'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-subtle border border-subtle">
            <span className="text-[10px] text-muted-theme uppercase tracking-wider block">
              {t.competitors.saveRateMetric}
            </span>
            <span className="text-base md:text-lg font-mono font-bold text-primary-theme">
              {selectedCompetitor.saveRate > 0 ? `${selectedCompetitor.saveRate}%` : '—'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-subtle border border-subtle">
            <span className="text-[10px] text-muted-theme uppercase tracking-wider block">
              {t.competitors.followersCount}
            </span>
            <span className="text-base md:text-lg font-mono font-bold text-primary-theme">
              {selectedCompetitor.followers > 0 ? formatNumber(selectedCompetitor.followers) : '—'}
            </span>
          </div>
        </div>

        {/* Most Popular Viral Pins of Competitor (Last 30-90 Days) */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-primary-theme font-heading uppercase tracking-wider text-xs flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-accent-ghost" />
              <span>{t.competitors.viralPinsHeading}</span>
            </h3>
            <span className="text-[11px] text-muted-theme">
              {t.competitors.rankedBySaves}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {selectedCompetitor.topViralPins && selectedCompetitor.topViralPins.map((vp) => (
              <div
                key={vp.id}
                className="p-3 rounded-xl border border-subtle bg-surface flex flex-col justify-between space-y-3 shadow-xs group"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={vp.image}
                    alt={vp.title}
                    referrerPolicy="no-referrer"
                    className="w-14 h-20 object-cover rounded-lg border border-subtle shrink-0"
                  />
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-semibold text-primary-theme line-clamp-2">
                      {vp.title}
                    </p>
                    <div className="space-y-0.5 text-[11px] font-mono text-muted-theme">
                      <span className="block text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatNumber(vp.saves)} {t.competitors.saves.toLowerCase()}
                      </span>
                      <span className="block">
                        {formatNumber(vp.impressions)} {t.dashboard.pinImpressions.toLowerCase()} (CTR: {vp.ctr})
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onGenerateFromGap(vp.title)}
                  className="accent-btn py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{t.competitors.generateSimilarPin}</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Content Gap Opportunities Section */}
        <div className="space-y-3 pt-3 border-t border-subtle">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-ghost" />
            <h3 className="text-sm font-bold text-primary-theme font-heading">
              {t.competitors.gapAnalysisTitle}
            </h3>
          </div>
          <p className="text-xs text-secondary-theme">
            {t.competitors.gapAnalysisDesc}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {selectedCompetitor.gapKeywords.map((gapKw, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-subtle bg-subtle flex flex-col justify-between space-y-3"
              >
                <div>
                  <span className="text-[10px] font-bold text-accent-ghost uppercase tracking-wider">
                    {t.competitors.contentOpportunity}
                  </span>
                  <p className="text-xs md:text-sm font-semibold text-primary-theme mt-1">
                    "{gapKw}"
                  </p>
                  <p className="text-[11px] text-muted-theme mt-1">
                    {t.competitors.competitorTop3Note}
                  </p>
                </div>

                <button
                  onClick={() => onGenerateFromGap(gapKw)}
                  className="accent-btn py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t.competitors.createPinOnTopic}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
