import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  TrendingUp,
  Download,
  Sparkles,
  ArrowUpRight,
  Filter,
  Plus,
  X,
  LineChart,
  Tag,
  ExternalLink,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { INITIAL_KEYWORDS, KeywordItem } from '../../data/mockData';

interface KeywordExplorerProps {
  onGenerateFromKeyword: (keyword: string) => void;
}

interface TrendSeries {
  query: string;
  color: string;
  points: number[];
}

const COMPARISON_COLORS = ['#E05375', '#0EA5E9', '#F59E0B', '#8B5CF6', '#10B981'];

export const KeywordExplorer: React.FC<KeywordExplorerProps> = ({
  onGenerateFromKeyword,
}) => {
  const { t, formatNumber } = useI18n();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Multi-query Pinterest Trends comparison list
  const [comparedQueries, setComparedQueries] = useState<string[]>([
    'minimalist living room styling ideas',
    'scandi living room neutral decor',
    'japandi living room aesthetic',
  ]);

  const [hoveredPoint, setHoveredPoint] = useState<{
    query: string;
    week: string;
    value: number;
    color: string;
    cx: number;
    cy: number;
    pIdx: number;
  } | null>(null);

  // Responsive chart container width tracking
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState<number>(750);

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

  const categories = [
    { id: 'all', label: t.keywords.categories.all },
    { id: 'Home Decor', label: t.keywords.categories.homeDecor },
    { id: 'Fashion', label: t.keywords.categories.fashion },
    { id: 'Recipes', label: t.keywords.categories.recipes },
    { id: 'Digital Products', label: t.keywords.categories.digitalProducts },
    { id: 'Wellness', label: t.keywords.categories.wellness },
    { id: 'Travel', label: t.keywords.categories.travel },
  ];

  // Dynamic suggestions based on search query or category
  const dynamicSuggestions = useMemo(() => {
    const term = searchQuery.toLowerCase().trim();
    if (term.includes('мод') || term.includes('стил') || term.includes('fashion')) {
      return [
        'мода и стиль для детей',
        'мода и стиль Испания',
        'капсульный гардероб осень',
        'эстетичный минимализм стиль',
      ];
    }
    if (term.includes('дом') || term.includes('интерьер') || term.includes('home') || term.includes('decor')) {
      return [
        'дом и интерьер ванная комната',
        'дом и интерьер детская комната',
        'дом и интерьер уютная кухня',
        'скандинавский интерьер гостиная',
      ];
    }
    if (term.includes('рецепт') || term.includes('куриц') || term.includes('food') || term.includes('recipe')) {
      return [
        'рецепты с курицей в духовке',
        'быстрые эстетичные завтраки',
        'матча латте холодная пенка',
        'здоровые веганские боулы',
      ];
    }
    return [
      'скандинавский интерьер гостиная',
      'минималистичная ванная комната',
      'эстетичный рабочий стол notion',
      'уютная спальня теплый беж',
    ];
  }, [searchQuery]);

  const handleAddComparison = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || comparedQueries.includes(trimmed)) return;
    if (comparedQueries.length >= 5) {
      setComparedQueries([...comparedQueries.slice(1), trimmed]);
    } else {
      setComparedQueries([...comparedQueries, trimmed]);
    }
  };

  const handleRemoveComparison = (q: string) => {
    if (comparedQueries.length <= 1) return;
    setComparedQueries(comparedQueries.filter((item) => item !== q));
  };

  // Generate comparison curve points for each query
  const trendSeries: TrendSeries[] = useMemo(() => {
    return comparedQueries.map((query, idx) => {
      // Seed deterministic curve based on query string
      const hash = query.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const base = 40 + (hash % 35);
      const points = [
        base,
        base + (hash % 12) - 4,
        base + ((hash * 2) % 20) + 6,
        base + ((hash * 3) % 28) + 12,
        base + ((hash * 4) % 34) + 18,
        base + ((hash * 5) % 38) + 24,
      ];
      return {
        query,
        color: COMPARISON_COLORS[idx % COMPARISON_COLORS.length],
        points,
      };
    });
  }, [comparedQueries]);

  const weeks = ['Неделя 1', 'Неделя 3', 'Неделя 6', 'Неделя 8', 'Неделя 10', 'Текущая'];
  const maxVolumePoint = 120;

  // Chart Geometry Coordinates
  const chartHeight = 220;
  const padLeft = 45;
  const padRight = 45;
  const padTop = 25;
  const padBottom = 35;
  const plotW = Math.max(200, chartWidth - padLeft - padRight);
  const plotH = chartHeight - padTop - padBottom;

  const filteredKeywords = useMemo(() => {
    return INITIAL_KEYWORDS.filter((item) => {
      const matchQuery =
        item.query.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.relatedTags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      return matchQuery && matchCategory;
    });
  }, [searchQuery, selectedCategory]);

  const handleExportCsv = () => {
    const headers = ['Query', 'Category', 'Monthly Volume', '90-Day Trend (%)', 'Competition', 'Intent'];
    const rows = filteredKeywords.map((k) => [
      `"${k.query}"`,
      k.category,
      k.monthlyVolume,
      k.trendPct,
      k.competition,
      k.intent,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pinsprig-keywords-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary-theme font-heading">
            {t.keywords.title}
          </h1>
          <p className="text-xs md:text-sm text-secondary-theme mt-1">
            {t.keywords.subtitle}
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl text-xs md:text-sm font-semibold border border-subtle bg-surface hover:bg-subtle text-primary-theme flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>{t.keywords.exportCsv}</span>
        </button>
      </div>

      {/* 1. PINTEREST TRENDS COMPARISON & INSIGHTS CHART */}
      <div className="custom-card p-5 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-subtle pb-3">
          <div>
            <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
              <LineChart className="w-4 h-4 text-accent-ghost" />
              <span>Аналитика и инсайты трендов Pinterest (Volume Dynamics)</span>
            </h2>
            <p className="text-xs text-muted-theme mt-0.5">
              Сравнивайте относительную динамику поискового интереса по нескольким запросам одновременно
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-theme">
              {comparedQueries.length} / 5 запросов для сравнения
            </span>
          </div>
        </div>

        {/* Compared Query Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {trendSeries.map((series, idx) => (
            <div
              key={idx}
              className="px-3 py-1 rounded-lg border text-xs flex items-center gap-2 bg-surface shadow-xs transition-all"
              style={{ borderColor: series.color }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: series.color }}
              />
              <span className="font-semibold text-primary-theme truncate max-w-[220px]">
                {series.query}
              </span>
              {comparedQueries.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveComparison(series.query)}
                  className="text-muted-theme hover:text-rose-500 cursor-pointer p-0.5"
                  title="Удалить из графика"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Dynamic Responsive SVG Trend Canvas */}
        <div ref={chartContainerRef} className="w-full relative select-none">
          <svg
            width={chartWidth}
            height={chartHeight}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full overflow-visible"
          >
            {/* Horizontal Grid Lines & Y-axis labels */}
            {[0.25, 0.5, 0.75, 1.0].map((ratio, i) => {
              const y = chartHeight - padBottom - ratio * plotH;
              return (
                <g key={i}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={chartWidth - padRight}
                    y2={y}
                    stroke="currentColor"
                    className="text-subtle opacity-40"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    className="text-[10px] fill-current opacity-40 font-mono"
                  >
                    {Math.round(ratio * 100)}%
                  </text>
                </g>
              );
            })}

            {/* Vertical Guide Line on Hover */}
            {hoveredPoint && (
              <line
                x1={hoveredPoint.cx}
                y1={padTop}
                x2={hoveredPoint.cx}
                y2={chartHeight - padBottom}
                stroke="currentColor"
                className="text-muted-theme opacity-30"
                strokeDasharray="3 3"
              />
            )}

            {/* Data Series Polylines and Bend Dots (Exact vertices / сгибы) */}
            {trendSeries.map((s, sIdx) => {
              // Calculate exact vertex coordinates for each point
              const coords = s.points.map((val, pIdx) => {
                const cx = padLeft + (pIdx / (weeks.length - 1)) * plotW;
                const cy = (chartHeight - padBottom) - (val / maxVolumePoint) * plotH;
                return { cx, cy, val, pIdx };
              });

              const polyPoints = coords.map((c) => `${c.cx},${c.cy}`).join(' ');

              return (
                <g key={sIdx}>
                  {/* The Polyline Line connecting the points */}
                  <polyline
                    fill="none"
                    stroke={s.color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={polyPoints}
                  />

                  {/* Circular dots placed EXACTLY on the polyline bends/vertices (на сгибах) */}
                  {coords.map(({ cx, cy, val, pIdx }) => {
                    const isHovered = hoveredPoint?.query === s.query && hoveredPoint?.pIdx === pIdx;

                    return (
                      <g key={pIdx}>
                        {/* Generous invisible hover target */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r="18"
                          fill="transparent"
                          className="cursor-pointer"
                          onMouseEnter={() =>
                            setHoveredPoint({
                              query: s.query,
                              week: weeks[pIdx],
                              value: val,
                              color: s.color,
                              cx,
                              cy,
                              pIdx,
                            })
                          }
                          onMouseLeave={() => setHoveredPoint(null)}
                        />

                        {/* Outer Glow Halo on Hover */}
                        {isHovered && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r="10"
                            fill={s.color}
                            fillOpacity="0.25"
                            className="pointer-events-none"
                          />
                        )}

                        {/* Perfectly Circular Bend Dot (на сгибе графика) */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 6 : 4.5}
                          fill={s.color}
                          stroke="#FFFFFF"
                          strokeWidth={isHovered ? 2.5 : 1.5}
                          className="pointer-events-none"
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* X Axis Week Labels - positioned mathematically exactly under each point */}
            {weeks.map((w, idx) => {
              const cx = padLeft + (idx / (weeks.length - 1)) * plotW;
              return (
                <text
                  key={idx}
                  x={cx}
                  y={chartHeight - 10}
                  textAnchor="middle"
                  className="text-[11px] fill-current opacity-60 font-mono"
                >
                  {w}
                </text>
              );
            })}
          </svg>

          {/* Floating Tooltip displaying details on vertex hover */}
          {hoveredPoint && (
            <div
              className="absolute pointer-events-none z-30 bg-slate-900/95 dark:bg-zinc-900/95 text-white px-3 py-2 rounded-xl shadow-xl border border-white/10 text-xs backdrop-blur-md transition-all duration-75"
              style={{
                left: `${Math.min(Math.max(hoveredPoint.cx, 110), chartWidth - 110)}px`,
                top: `${Math.max(hoveredPoint.cy - 68, 6)}px`,
                transform: 'translateX(-50%)',
              }}
            >
              <div className="flex items-center gap-1.5 font-bold text-white text-[12px]">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: hoveredPoint.color }}
                />
                <span className="truncate max-w-[210px]">{hoveredPoint.query}</span>
              </div>
              <div className="flex items-center justify-between gap-4 mt-1 text-[11px] text-gray-300 font-mono">
                <span>{hoveredPoint.week}</span>
                <span className="font-bold text-emerald-400">
                  {hoveredPoint.value}% индекс интереса
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. SEARCH & RECOMMENDED QUERY SUGGESTIONS */}
      <div className="custom-card p-4 rounded-2xl space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-theme" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Введи тему (например: дом и интерьер, мода и стиль, рецепты курочки)..."
            className="w-full pl-10 pr-4 py-2.5 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme placeholder:text-muted-theme focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {/* Contextual Recommendations Strip (Pinterest Suggestions) */}
        <div className="p-3 rounded-xl bg-subtle border border-subtle space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-secondary-theme flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent-ghost" />
              <span>Рекомендуемые поисковые запросы по теме (нажмите для сравнения на графике):</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {dynamicSuggestions.map((sug, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAddComparison(sug)}
                className="text-xs px-2.5 py-1 rounded-lg bg-surface hover:bg-subtle border border-subtle text-primary-theme flex items-center gap-1.5 transition-colors cursor-pointer group shadow-2xs"
              >
                <span>{sug}</span>
                <Plus className="w-3 h-3 text-accent-ghost group-hover:scale-125 transition-transform" />
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat.id
                  ? 'accent-btn shadow-xs font-semibold'
                  : 'bg-subtle text-secondary-theme hover:text-primary-theme'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. KEYWORDS METRIC TABLE */}
      <div className="custom-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs md:text-sm border-collapse">
            <thead>
              <tr className="border-b border-subtle bg-subtle text-[11px] font-semibold text-secondary-theme uppercase tracking-wider">
                <th className="py-3 px-4">{t.keywords.tableKeyword}</th>
                <th className="py-3 px-4 text-right">{t.keywords.tableVolume}</th>
                <th className="py-3 px-4 text-right">{t.keywords.tableTrend}</th>
                <th className="py-3 px-4 text-center">{t.keywords.tableCompetition}</th>
                <th className="py-3 px-4">{t.keywords.tableIntent}</th>
                <th className="py-3 px-4 text-right">{t.keywords.tableAction}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {filteredKeywords.map((item) => (
                <tr
                  key={item.id}
                  className="bg-surface hover:bg-subtle/50 transition-colors group"
                >
                  {/* Query & Tags */}
                  <td className="py-3 px-4">
                    <p className="font-semibold text-primary-theme">
                      {item.query}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.relatedTags.slice(0, 2).map((tag, idx) => (
                        <span key={idx} className="text-[10px] text-muted-theme">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Monthly Volume */}
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-primary-theme">
                    {formatNumber(item.monthlyVolume)}
                  </td>

                  {/* 90-Day Trend */}
                  <td className="py-3 px-4 text-right">
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      +{item.trendPct}%
                    </span>
                  </td>

                  {/* Competition */}
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        item.competition === 'Low'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : item.competition === 'Medium'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {item.competition === 'Low'
                        ? t.common.low
                        : item.competition === 'Medium'
                        ? t.common.medium
                        : t.common.high}
                    </span>
                  </td>

                  {/* Intent */}
                  <td className="py-3 px-4 text-secondary-theme text-xs">
                    {item.intent}
                  </td>

                  {/* Actions (Compare + Generate Pin) */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddComparison(item.query)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium border border-subtle bg-subtle hover:bg-surface text-secondary-theme hover:text-primary-theme transition-colors cursor-pointer"
                        title="Добавить на график сравнения"
                      >
                        + График
                      </button>

                      <button
                        onClick={() => onGenerateFromKeyword(item.query)}
                        className="accent-btn px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{t.keywords.generateFromKeyword}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
