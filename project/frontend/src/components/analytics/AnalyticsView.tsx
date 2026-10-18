import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  LineChart,
  MousePointerClick,
  Bookmark,
  Share2,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  ChevronRight,
  UserCheck,
  Filter,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';

interface AnalyticsViewProps {
  onGenerateSimilar?: (topic: string) => void;
}

type SortMetric = 'clicks' | 'impressions' | 'saves' | 'profileVisits' | 'ctr';

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ onGenerateSimilar }) => {
  const { t, formatNumber } = useI18n();
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('30d');
  const [sortBy, setSortBy] = useState<SortMetric>('clicks');
  const [chartMode, setChartMode] = useState<'line' | 'bars'>('line');

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState<number>(750);

  const [hoveredPoint, setHoveredPoint] = useState<{
    label: string;
    views: number;
    saves: number;
    cx: number;
    cyViews: number;
    cySaves: number;
  } | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setChartWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(chartContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Dynamic Chart points by timeframe
  const chartDataByTimeframe = {
    '7d': {
      summary: { views: 320000, clicks: 12400, saveRate: 6.8, trustScore: 97 },
      points: [
        { label: 'Пн', value: 38000, saves: 2400 },
        { label: 'Вт', value: 42000, saves: 2700 },
        { label: 'Ср', value: 45000, saves: 3100 },
        { label: 'Чт', value: 52000, saves: 3800 },
        { label: 'Пт', value: 58000, saves: 4200 },
        { label: 'Сб', value: 65000, saves: 4900 },
        { label: 'Вс', value: 72000, saves: 5400 },
      ],
    },
    '30d': {
      summary: { views: 1258400, clicks: 48920, saveRate: 5.8, trustScore: 96 },
      points: [
        { label: 'День 5', value: 48000, saves: 2450 },
        { label: 'День 10', value: 65000, saves: 3200 },
        { label: 'День 15', value: 89000, saves: 4800 },
        { label: 'День 20', value: 112000, saves: 6100 },
        { label: 'День 25', value: 135000, saves: 7400 },
        { label: 'День 30', value: 168000, saves: 9800 },
      ],
    },
    '90d': {
      summary: { views: 3840000, clicks: 142000, saveRate: 6.2, trustScore: 98 },
      points: [
        { label: 'Нед 2', value: 180000, saves: 11000 },
        { label: 'Нед 4', value: 240000, saves: 14500 },
        { label: 'Нед 6', value: 310000, saves: 19200 },
        { label: 'Нед 8', value: 390000, saves: 24800 },
        { label: 'Нед 10', value: 480000, saves: 31000 },
        { label: 'Нед 12', value: 590000, saves: 38500 },
      ],
    },
  };

  const currentDataset = chartDataByTimeframe[timeframe];
  const maxVal = Math.max(...currentDataset.points.map((p) => p.value));

  const allViralPins = [
    {
      id: 'p-1',
      title: '7 Warm Minimalist Living Room Rules That Transform Your Space',
      board: 'Скандинавский интерьер и уютный дом',
      impressions: 482000,
      clicks: 14200,
      saves: 8900,
      profileVisits: 3120,
      ctrNumeric: 4.8,
      ctr: '4.8%',
      similarRecommendation: 'минималистичные детали интерьера, теплый бежевый текстиль',
      image: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    },
    {
      id: 'p-2',
      title: 'Artisanal Iced Matcha Cloud Latte: The 3-Minute Secret Foam',
      board: 'Рецепты и кулинарные ритуалы',
      impressions: 341000,
      clicks: 9800,
      saves: 6200,
      profileVisits: 2450,
      ctrNumeric: 4.2,
      ctr: '4.2%',
      similarRecommendation: 'холодная кокосовая пенка рецепты, церемониальная матча дома',
      image: '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
    },
    {
      id: 'p-3',
      title: 'The Minimalist AM Routine for Barrier Repair & Glass Skin Glow',
      board: 'Чистая красота и роскошный уход',
      impressions: 295000,
      clicks: 8100,
      saves: 5400,
      profileVisits: 1980,
      ctrNumeric: 3.9,
      ctr: '3.9%',
      similarRecommendation: 'восстановление липидного барьера, корейская сыворотка утром',
      image: '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
    },
    {
      id: 'p-4',
      title: 'Amalfi Coast Hidden Views: 5 Spots Tourists Always Miss in Positano',
      board: 'Европейские побеги и эстетика путешествий',
      impressions: 210000,
      clicks: 6900,
      saves: 4900,
      profileVisits: 1620,
      ctrNumeric: 4.5,
      ctr: '4.5%',
      similarRecommendation: 'бюджетное путешествие по Италии, лучшие закаты Позитано',
      image: '/src/assets/images/pin_travel_amalfi_1790670078173.jpg',
    },
    {
      id: 'p-5',
      title: 'Japandi Bedroom Color Palettes That Promote Restful Deep Sleep',
      board: 'Скандинавский интерьер и уютный дом',
      impressions: 185000,
      clicks: 5800,
      saves: 4300,
      profileVisits: 1350,
      ctrNumeric: 3.8,
      ctr: '3.8%',
      similarRecommendation: 'спальня в стиле ваби-саби, льняное постельное белье палитра',
      image: '/src/assets/images/pin_home_decor_1790670043705.jpg',
    },
  ];

  // Sorted Viral Pins
  const sortedPins = useMemo(() => {
    return [...allViralPins].sort((a, b) => {
      if (sortBy === 'clicks') return b.clicks - a.clicks;
      if (sortBy === 'impressions') return b.impressions - a.impressions;
      if (sortBy === 'saves') return b.saves - a.saves;
      if (sortBy === 'profileVisits') return b.profileVisits - a.profileVisits;
      if (sortBy === 'ctr') return b.ctrNumeric - a.ctrNumeric;
      return 0;
    });
  }, [sortBy]);

  return (
    <div className="space-y-6">
      {/* Header & Timeframe */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary-theme font-heading">
            {t.analytics.title}
          </h1>
          <p className="text-xs md:text-sm text-secondary-theme mt-1">
            {t.analytics.subtitle}
          </p>
        </div>

        {/* Dynamic Timeframe Selector */}
        <div className="custom-card p-1 rounded-xl flex items-center gap-1 self-start sm:self-auto">
          {(['7d', '30d', '90d'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                timeframe === tf
                  ? 'accent-btn shadow-xs'
                  : 'text-secondary-theme hover:text-primary-theme'
              }`}
            >
              {tf === '7d'
                ? t.analytics.timeframe7d
                : tf === '30d'
                ? t.analytics.timeframe30d
                : t.analytics.timeframe90d}
            </button>
          ))}
        </div>
      </div>

      {/* Trust Index & Dynamic Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="custom-card p-4 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-muted-theme font-semibold uppercase tracking-wider block">
              {t.analytics.seoHealthIndex}
            </span>
            <span className="text-xl font-bold font-mono text-primary-theme">
              {currentDataset.summary.trustScore} / 100
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">
              Алгоритм доверяет аккаунту
            </span>
          </div>
        </div>

        <div className="custom-card p-4 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-subtle text-accent-ghost shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-muted-theme font-semibold uppercase tracking-wider block">
              Показы ({timeframe})
            </span>
            <span className="text-xl font-bold font-mono text-primary-theme">
              {formatNumber(currentDataset.summary.views)}
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">
              +18.4% рост охватов
            </span>
          </div>
        </div>

        <div className="custom-card p-4 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-subtle text-accent-ghost shrink-0">
            <MousePointerClick className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-muted-theme font-semibold uppercase tracking-wider block">
              Переходы на сайт ({timeframe})
            </span>
            <span className="text-xl font-bold font-mono text-primary-theme">
              {formatNumber(currentDataset.summary.clicks)}
            </span>
            <span className="text-[10px] text-secondary-theme block">
              CTR: 3.8% в среднем
            </span>
          </div>
        </div>

        <div className="custom-card p-4 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-subtle text-accent-ghost shrink-0">
            <Bookmark className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-muted-theme font-semibold uppercase tracking-wider block">
              Доля сохранений ({timeframe})
            </span>
            <span className="text-xl font-bold font-mono text-primary-theme">
              {currentDataset.summary.saveRate}%
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">
              Высокая виральность
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Impression Trend Chart */}
      <div className="custom-card p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-3">
          <div>
            <h3 className="text-base font-bold text-primary-theme font-heading">
              {t.analytics.impressionsOverTime} ({timeframe})
            </h3>
            <p className="text-xs text-muted-theme mt-0.5">
              Динамика показов и сохранений меняется в зависимости от выбранного периода
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle: Line vs Bars */}
            <div className="flex items-center p-0.5 rounded-lg bg-subtle border border-subtle text-xs">
              <button
                type="button"
                onClick={() => setChartMode('line')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  chartMode === 'line'
                    ? 'accent-btn shadow-xs'
                    : 'text-secondary-theme hover:text-primary-theme'
                }`}
              >
                Линейный тренд
              </button>
              <button
                type="button"
                onClick={() => setChartMode('bars')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  chartMode === 'bars'
                    ? 'accent-btn shadow-xs'
                    : 'text-secondary-theme hover:text-primary-theme'
                }`}
              >
                Столбцы
              </button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                <span className="text-secondary-theme">Показы</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-secondary-theme">Сохранения</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Chart Container */}
        {chartMode === 'line' ? (
          <div ref={chartContainerRef} className="w-full relative select-none">
            {(() => {
              const chHeight = 220;
              const pLeft = 45;
              const pRight = 45;
              const pTop = 25;
              const pBottom = 35;
              const pWidth = Math.max(200, chartWidth - pLeft - pRight);
              const pHeight = chHeight - pTop - pBottom;

              const coords = currentDataset.points.map((pt, pIdx) => {
                const cx = pLeft + (pIdx / (currentDataset.points.length - 1)) * pWidth;
                const cyViews = (chHeight - pBottom) - (pt.value / maxVal) * pHeight;
                const cySaves = (chHeight - pBottom) - ((pt.saves * 12) / maxVal) * pHeight;
                return { cx, cyViews, cySaves, pt, pIdx };
              });

              const viewsPoints = coords.map((c) => `${c.cx},${c.cyViews}`).join(' ');
              const savesPoints = coords.map((c) => `${c.cx},${c.cySaves}`).join(' ');

              return (
                <>
                  <svg
                    width={chartWidth}
                    height={chHeight}
                    viewBox={`0 0 ${chartWidth} ${chHeight}`}
                    className="w-full overflow-visible"
                  >
                    {/* Horizontal Grid lines */}
                    {[0.25, 0.5, 0.75, 1.0].map((ratio, i) => {
                      const y = chHeight - pBottom - ratio * pHeight;
                      return (
                        <g key={i}>
                          <line
                            x1={pLeft}
                            y1={y}
                            x2={chartWidth - pRight}
                            y2={y}
                            stroke="currentColor"
                            className="text-subtle opacity-40"
                            strokeDasharray="4 4"
                          />
                          <text
                            x={pLeft - 8}
                            y={y + 3.5}
                            textAnchor="end"
                            className="text-[10px] fill-current opacity-40 font-mono"
                          >
                            {formatNumber(Math.round(maxVal * ratio))}
                          </text>
                        </g>
                      );
                    })}

                    {/* Vertical Guide on Hover */}
                    {hoveredPoint && (
                      <line
                        x1={hoveredPoint.cx}
                        y1={pTop}
                        x2={hoveredPoint.cx}
                        y2={chHeight - pBottom}
                        stroke="currentColor"
                        className="text-muted-theme opacity-30"
                        strokeDasharray="3 3"
                      />
                    )}

                    {/* Line for Views */}
                    <polyline
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={viewsPoints}
                    />

                    {/* Line for Saves */}
                    <polyline
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="5 3"
                      points={savesPoints}
                    />

                    {/* Circular dots placed EXACTLY on the bends/vertices */}
                    {coords.map(({ cx, cyViews, cySaves, pt, pIdx }) => {
                      const isHovered = hoveredPoint?.label === pt.label;
                      return (
                        <g key={pIdx}>
                          {/* Invisible hover capture area */}
                          <circle
                            cx={cx}
                            cy={cyViews}
                            r="18"
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() =>
                              setHoveredPoint({
                                label: pt.label,
                                views: pt.value,
                                saves: pt.saves,
                                cx,
                                cyViews,
                                cySaves,
                              })
                            }
                            onMouseLeave={() => setHoveredPoint(null)}
                          />

                          {/* Views Vertex Dot */}
                          <circle
                            cx={cx}
                            cy={cyViews}
                            r={isHovered ? 6 : 4.5}
                            fill="var(--accent)"
                            stroke="#FFFFFF"
                            strokeWidth={isHovered ? 2.5 : 1.5}
                            className="pointer-events-none"
                          />

                          {/* Saves Vertex Dot */}
                          <circle
                            cx={cx}
                            cy={cySaves}
                            r={isHovered ? 5.5 : 4}
                            fill="#10B981"
                            stroke="#FFFFFF"
                            strokeWidth={isHovered ? 2.5 : 1.5}
                            className="pointer-events-none"
                          />
                        </g>
                      );
                    })}

                    {/* X Axis Labels positioned directly below each vertex */}
                    {coords.map(({ cx, pt, pIdx }) => (
                      <text
                        key={pIdx}
                        x={cx}
                        y={chHeight - 10}
                        textAnchor="middle"
                        className="text-[11px] fill-current opacity-60 font-mono"
                      >
                        {pt.label}
                      </text>
                    ))}
                  </svg>

                  {/* Tooltip on Vertex Hover */}
                  {hoveredPoint && (
                    <div
                      className="absolute pointer-events-none z-30 bg-slate-900/95 dark:bg-zinc-900/95 text-white px-3 py-2 rounded-xl shadow-xl border border-white/10 text-xs backdrop-blur-md transition-all duration-75"
                      style={{
                        left: `${Math.min(Math.max(hoveredPoint.cx, 100), chartWidth - 100)}px`,
                        top: `${Math.max(hoveredPoint.cyViews - 65, 8)}px`,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      <p className="font-bold text-white text-[12px]">{hoveredPoint.label}</p>
                      <div className="flex items-center gap-3 mt-1 font-mono text-[11px]">
                        <span className="flex items-center gap-1 text-rose-300">
                          <span className="w-2 h-2 rounded-full bg-accent" />
                          {formatNumber(hoveredPoint.views)} показов
                        </span>
                        <span className="flex items-center gap-1 text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          {formatNumber(hoveredPoint.saves)} сохр.
                        </span>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
          /* Dynamic Bars for Selected Timeframe */
          <div className="h-56 flex items-end justify-between gap-2 pt-6 pb-2 px-2 border-b border-subtle">
            {currentDataset.points.map((pt, idx) => {
              const heightPct = Math.round((pt.value / maxVal) * 100);
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <div className="w-full max-w-[48px] flex items-end justify-center gap-1.5 h-full">
                    {/* Impressions bar */}
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-1/2 accent-btn rounded-t-md transition-all group-hover:brightness-110"
                      title={`${pt.label}: ${formatNumber(pt.value)} показов`}
                    />
                    {/* Saves bar */}
                    <div
                      style={{ height: `${Math.max(12, Math.round(heightPct * 0.42))}%` }}
                      className="w-1/2 bg-emerald-500/80 rounded-t-md transition-all group-hover:bg-emerald-500"
                      title={`${pt.label}: ${formatNumber(pt.saves)} сохранений`}
                    />
                  </div>
                  <span className="text-[11px] text-muted-theme font-mono">
                    {pt.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top 5 Viral Pins with Dynamic Filter & Recommendations */}
      <div className="custom-card p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-3">
          <div>
            <h3 className="text-base font-bold text-primary-theme font-heading">
              {t.analytics.topPerformingPins}
            </h3>
            <p className="text-xs text-muted-theme">
              Ранжируйте пины по нужной метрике и создавайте похожие для масштабирования успеха
            </p>
          </div>

          {/* Metric Sort Selector */}
          <div className="flex items-center gap-1.5 bg-subtle p-1 rounded-xl text-xs overflow-x-auto">
            <span className="text-muted-theme pl-1 text-[11px] hidden md:inline">Сортировать по:</span>
            {[
              { id: 'clicks', label: 'Клики на сайт' },
              { id: 'impressions', label: 'Показы' },
              { id: 'saves', label: 'Сохранения' },
              { id: 'profileVisits', label: 'Визиты в профиль' },
              { id: 'ctr', label: 'CTR' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSortBy(f.id as SortMetric)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
                  sortBy === f.id
                    ? 'accent-btn font-semibold shadow-xs'
                    : 'text-secondary-theme hover:text-primary-theme'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Viral Pins List with Recommendations & One-click Generate */}
        <div className="divide-y divide-subtle">
          {sortedPins.map((pin, idx) => (
            <div key={pin.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                <span className="w-5 text-center font-mono font-bold text-xs text-muted-theme pt-1">
                  0{idx + 1}
                </span>
                <img
                  src={pin.image}
                  alt={pin.title}
                  referrerPolicy="no-referrer"
                  className="w-12 h-18 object-cover rounded-lg border border-subtle shrink-0 shadow-xs"
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-xs md:text-sm font-semibold text-primary-theme line-clamp-1">
                    {pin.title}
                  </p>
                  <p className="text-[11px] text-muted-theme">{pin.board}</p>

                  {/* Recommendation Tag & Generate Action */}
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-subtle text-secondary-theme border border-subtle flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-accent-ghost" />
                      <span>Идея для повтора: {pin.similarRecommendation}</span>
                    </span>

                    {onGenerateSimilar && (
                      <button
                        type="button"
                        onClick={() => onGenerateSimilar(pin.title)}
                        className="text-[11px] text-accent-ghost hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <span>Сгенерировать похожий пин</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Numeric Metrics Grid */}
              <div className="flex items-center gap-4 text-right font-mono text-xs pl-8 md:pl-0 shrink-0">
                <div className={sortBy === 'impressions' ? 'font-bold text-accent-ghost' : ''}>
                  <span className="font-semibold text-primary-theme block">
                    {formatNumber(pin.impressions)}
                  </span>
                  <span className="text-[10px] text-muted-theme font-sans">показы</span>
                </div>

                <div className={sortBy === 'clicks' ? 'font-bold text-accent-ghost' : ''}>
                  <span className="font-semibold text-primary-theme block">
                    {formatNumber(pin.clicks)}
                  </span>
                  <span className="text-[10px] text-muted-theme font-sans">клики</span>
                </div>

                <div className={sortBy === 'saves' ? 'font-bold text-accent-ghost' : ''}>
                  <span className="font-semibold text-primary-theme block">
                    {formatNumber(pin.saves)}
                  </span>
                  <span className="text-[10px] text-muted-theme font-sans">сохранения</span>
                </div>

                <div className={sortBy === 'profileVisits' ? 'font-bold text-accent-ghost' : ''}>
                  <span className="font-semibold text-primary-theme block">
                    {formatNumber(pin.profileVisits)}
                  </span>
                  <span className="text-[10px] text-muted-theme font-sans">в профиль</span>
                </div>

                <div className={sortBy === 'ctr' ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                    {pin.ctr}
                  </span>
                  <span className="text-[10px] text-muted-theme font-sans">CTR</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
