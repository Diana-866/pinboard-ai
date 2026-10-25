import React, { useState } from 'react';
import {
  TrendingUp,
  Eye,
  MousePointerClick,
  Bookmark,
  Sparkles,
  ArrowUpRight,
  Clock,
  Layers,
  Calendar,
  ExternalLink,
  ChevronRight,
  Plus,
  Flame,
  Target,
  Zap,
  X,
  Check,
  CheckCircle2,
  Globe,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { BoardItem, ScheduledPinItem, PinterestAccount } from '../../data/mockData';
import {
  getDefaultTimezone,
  saveUserTimezone,
  SUPPORTED_TIMEZONES,
  getTimezoneInfo,
  convertLocalToMoscow,
} from '../../utils/timezone';

interface DashboardViewProps {
  boards: BoardItem[];
  scheduledPins: ScheduledPinItem[];
  onNavigateTab: (tab: string) => void;
  onQuickGenerate: (topic?: string) => void;
  onOpenReview?: () => void;
  pendingCount?: number;
  currentAccount?: PinterestAccount;
  onUpdateAccountAutoTime?: (accountId: string, autoTime: string, nightlyAuto: boolean) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  boards,
  scheduledPins,
  onNavigateTab,
  onQuickGenerate,
  onOpenReview,
  pendingCount = 15,
  currentAccount,
  onUpdateAccountAutoTime,
}) => {
  const { t, formatNumber, formatPercent, formatDate, language } = useI18n();

  const [showTimeModal, setShowTimeModal] = useState(false);
  const [selectedAutoTime, setSelectedAutoTime] = useState(currentAccount?.autoTime || '01:00');
  const [isNightlyActive, setIsNightlyActive] = useState(currentAccount?.nightlyAuto !== false);
  const [userTimezone, setUserTimezone] = useState<string>(() => getDefaultTimezone(language));
  const [timeSavedToast, setTimeSavedToast] = useState(false);

  const handleSaveAutoTime = () => {
    if (onUpdateAccountAutoTime && currentAccount) {
      onUpdateAccountAutoTime(currentAccount.id, selectedAutoTime, isNightlyActive);
    }
    saveUserTimezone(userTimezone);
    setShowTimeModal(false);
    setTimeSavedToast(true);
    setTimeout(() => setTimeSavedToast(false), 3000);
  };

  const metrics = [
    {
      id: 'views',
      label: t.dashboard.monthlyViews,
      value: formatNumber(1258400),
      growth: '+28.4% к прошлому месяцу',
      icon: Eye,
    },
    {
      id: 'impressions',
      label: t.dashboard.pinImpressions,
      value: formatNumber(3482100),
      growth: '+14.2% органический охват',
      icon: TrendingUp,
    },
    {
      id: 'clicks',
      label: t.dashboard.outboundClicks,
      value: formatNumber(48920),
      growth: '+31.8% переходы на сайт',
      icon: MousePointerClick,
    },
    {
      id: 'saveRate',
      label: t.dashboard.saveRate,
      value: formatPercent(5.8),
      growth: '+0.9% виральный индекс',
      icon: Bookmark,
    },
  ];

  // 5 Strategic AI Recommendations requested by user
  const strategicRecommendations = [
    {
      id: 'rec-1',
      badge: 'Всплеск тренда запроса',
      icon: Flame,
      title: 'Зафиксирован всплеск популярности запроса: «Japandi living room color palettes» (+42%)',
      desc: 'Поисковый интерес в категории Home Decor резко вырос за последние 7 дней. Конкуренты ещё не заполнили выдачу качественными пинами 2:3. Рекомендуем выпустить серию из 5 пинов.',
      actionText: 'Сгенерировать пины на тему',
      actionTopic: 'Japandi living room color palettes with warm minimalist aesthetic',
      targetTab: 'generator',
      impact: '+42% рост спроса',
    },
    {
      id: 'rec-2',
      badge: 'Всплеск популярности доски',
      icon: TrendingUp,
      title: 'Зафиксирован всплеск популярности доски: «Scandinavian Living & Cozy Interiors» (+64% кликов)',
      desc: 'Алгоритм Pinterest Smart Feed начал активно рекомендовать эту доску новым пользователям. Для закрепления позиций в топе выдачи рекомендуем добавить 3 свежих пина сегодня.',
      actionText: 'Создать пины для доски',
      actionTopic: 'Cozy Scandinavian interior design styling rules and warm textiles',
      targetTab: 'generator',
      impact: 'Удержание топ-1 в выдаче',
    },
    {
      id: 'rec-3',
      badge: 'Контентный разрыв (Gap)',
      icon: Target,
      title: 'Обнаружен контентный пробел у конкурентов по теме: «Artisanal Iced Matcha Recipes»',
      desc: 'Конкурент @nordic_recipes получает CTR 8.2% на коротких видео-пинах 9:16. Ваша аудитория пересекается на 74%. Рекомендуем создать Idea Pins с пошаговыми инструкциями.',
      actionText: 'Закрыть контентный разрыв',
      actionTopic: 'Artisanal iced matcha cloud latte recipe with vanilla cold foam',
      targetTab: 'generator',
      impact: 'CTR потенциал 8.2%',
    },
    {
      id: 'rec-4',
      badge: 'Оптимальное окно охвата',
      icon: Clock,
      title: 'Алгоритмический пик активности вашей ЦА: вечерний слот 20:15–21:30',
      desc: 'Пины, опубликованные в этот интервал, получают на 38% более высокий стартовый импульс показов. Запланируйте публикации на вечер для максимальной конверсии.',
      actionText: 'Открыть календарь слотов',
      actionTopic: '',
      targetTab: 'calendar',
      impact: '+38% стартовая скорость',
    },
    {
      id: 'rec-5',
      badge: 'Предупреждение по SEO доски',
      icon: Zap,
      title: 'Доска «Clean Skincare & Luxury Shelfies»: SEO-балл снизился до 78%',
      desc: 'В описании доски отсутствуют 3 растущих поисковых ключа месяца: «skin barrier repair», «glass skin glow», «peptide serum». Требуется быстрая оптимизация метаданных.',
      actionText: 'Оптимизировать SEO доски',
      actionTopic: '',
      targetTab: 'boards',
      impact: 'Восстановление 98% SEO',
    },
  ];

  const upcomingPins = scheduledPins.filter((p) => p.status === 'scheduled').slice(0, 4);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Title & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-primary-theme font-heading">
            {t.dashboard.title}
          </h1>
          <p className="text-xs md:text-sm text-secondary-theme mt-1">
            {t.dashboard.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {onOpenReview && (
            <button
              onClick={onOpenReview}
              className="px-3.5 py-2 rounded-xl text-xs md:text-sm font-semibold border border-accent bg-subtle text-primary-theme hover:bg-surface flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              title="Перейти к проверке и подтверждению пинов"
            >
              <Sparkles className="w-4 h-4 text-accent-ghost" />
              <span>На проверке: {pendingCount} {pendingCount === 1 ? 'пин' : pendingCount >= 2 && pendingCount <= 4 ? 'пина' : 'пинов'}</span>
            </button>
          )}

          <button
            onClick={() => onQuickGenerate()}
            className="accent-btn px-4 py-2 rounded-xl text-xs md:text-sm font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Сгенерировать пины</span>
          </button>
        </div>
      </div>

      {/* Auto-Generation Schedule Quick Card */}
      {(() => {
        const tzInfo = getTimezoneInfo(userTimezone);
        const isMsk = userTimezone === 'Europe/Moscow';
        const autoTime = currentAccount?.autoTime || '01:00';
        const mskServerTime = convertLocalToMoscow(autoTime, userTimezone);

        return (
          <div className="custom-card p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-subtle/50 border border-subtle">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent-pill text-accent-ghost shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-primary-theme font-heading">
                    Авто-генерация пинов для {currentAccount?.name || 'Botanica Nordic'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${currentAccount?.nightlyAuto !== false ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-500/15 text-zinc-500'}`}>
                    {currentAccount?.nightlyAuto !== false
                      ? isMsk || (language === 'ru' && isMsk)
                        ? `Ежедневно в ${autoTime} МСК`
                        : `Ежедневно в ${autoTime} ${tzInfo.abbr} (${mskServerTime} МСК на сервере)`
                      : 'Отключена'}
                  </span>
                </div>
                <p className="text-xs text-secondary-theme mt-0.5">
                  Каждый день в <b className="font-mono text-primary-theme">{autoTime} {tzInfo.abbr}</b>
                  {!isMsk && <span className="text-[11px] text-muted-theme"> ({mskServerTime} МСК на сервере)</span>}
                  {' '}формируется пакет готовых пинов с учетом трендов Pinterest.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setSelectedAutoTime(currentAccount?.autoTime || '01:00');
                  setIsNightlyActive(currentAccount?.nightlyAuto !== false);
                  setShowTimeModal(true);
                }}
                className="secondary-btn px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Настроить время автогенерации</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.id}
              className="custom-card p-4 rounded-2xl space-y-2"
            >
              <div className="flex items-center justify-between text-secondary-theme">
                <span className="text-xs font-semibold uppercase tracking-wider">{m.label}</span>
                <div className="p-1.5 rounded-lg bg-subtle text-accent-ghost">
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div>
                <p className="text-2xl md:text-3xl font-bold font-mono text-primary-theme tracking-tight">
                  {m.value}
                </p>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{m.growth}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* STRATEGIC RECOMMENDATIONS SECTION (5 РЕКОМЕНДАЦИЙ) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-ghost" />
            <h2 className="text-base font-bold text-primary-theme font-heading">
              Рекомендации стратега PinPosy
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold accent-pill font-mono">
              5 сигналов ИИ
            </span>
          </div>
          <span className="text-xs text-muted-theme hidden sm:inline">
            Анализ трендов, досок и активности конкурентов в реальном времени
          </span>
        </div>

        {/* 5 Recommendations List */}
        <div className="space-y-2.5">
          {strategicRecommendations.map((rec) => {
            const Icon = rec.icon;
            return (
              <div
                key={rec.id}
                className="custom-card p-4 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all"
              >
                <div className="flex items-start gap-3.5 max-w-4xl">
                  <div className="p-2.5 rounded-xl bg-subtle text-accent-ghost shrink-0 mt-0.5">
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider accent-pill">
                        {rec.badge}
                      </span>
                      <span className="text-xs font-mono font-bold text-primary-theme">
                        {rec.impact}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-primary-theme leading-snug">
                      {rec.title}
                    </h3>
                    <p className="text-xs text-secondary-theme leading-relaxed">
                      {rec.desc}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 self-start lg:self-center">
                  <button
                    onClick={() => {
                      if (rec.actionTopic) {
                        onQuickGenerate(rec.actionTopic);
                      } else {
                        onNavigateTab(rec.targetTab);
                      }
                    }}
                    className="accent-btn px-4 py-2 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs"
                  >
                    <span>{rec.actionText}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Two Column Grid: Upcoming Queue & Top Performing Boards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        {/* Left: Scheduled Automation Queue (7 cols) */}
        <div className="lg:col-span-7 custom-card p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-subtle pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-ghost" />
              <h3 className="text-base font-bold text-primary-theme font-heading">
                {t.dashboard.scheduledQueue}
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('calendar')}
              className="text-xs font-semibold text-accent-ghost hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{t.common.viewAll}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-subtle">
            {upcomingPins.length > 0 ? (
              upcomingPins.map((pin) => (
                <div key={pin.id} className="py-3 flex items-center gap-3.5 first:pt-0 last:pb-0">
                  <img
                    src={pin.imageUrl}
                    alt={pin.title}
                    referrerPolicy="no-referrer"
                    className="w-12 h-18 object-cover rounded-lg border border-subtle shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs md:text-sm font-semibold text-primary-theme line-clamp-1">
                      {pin.title}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-theme">
                      <span>{pin.boardName}</span>
                      <span>·</span>
                      <span className="font-mono">{pin.scheduledTime}</span>
                      {pin.isOptimalSlot && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-accent-pill">
                          Оптимальный слот
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-mono text-muted-theme shrink-0">
                    {formatDate(pin.scheduledDate, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-muted-theme">
                {t.dashboard.emptyQueue}
              </div>
            )}
          </div>
        </div>

        {/* Right: Active Pinterest Boards Health (5 cols) */}
        <div className="lg:col-span-5 custom-card p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-subtle pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent-ghost" />
              <h3 className="text-base font-bold text-primary-theme font-heading">
                {t.boards.title || 'Популярные доски'}
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('boards')}
              className="text-xs font-semibold text-accent-ghost hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{t.common.viewAll}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {boards.slice(0, 4).map((board) => (
              <div
                key={board.id}
                onClick={() => onNavigateTab('boards')}
                className="p-3 rounded-xl border border-subtle hover:border-strong transition-colors flex items-center justify-between gap-3 cursor-pointer bg-subtle"
              >
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-primary-theme truncate">
                    {board.name}
                  </h4>
                  <p className="text-[11px] text-muted-theme mt-0.5">
                    {board.pinCount} пинов · {formatNumber(board.monthlyViews)} просм/мес
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-xs font-bold text-primary-theme">
                    {board.seoScore}%
                  </span>
                  <span className="text-[10px] text-muted-theme block">SEO-балл</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Time Saved Toast */}
      {timeSavedToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-emerald-600 text-white shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Время авто-генерации успешно сохранено: {selectedAutoTime} МСК!</span>
        </div>
      )}

      {/* Auto-Generation Time Customization Modal */}
      {showTimeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-surface border border-subtle w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-subtle pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent-ghost" />
                <h3 className="text-base font-bold text-primary-theme font-heading">
                  Настройка времени авто-генерации
                </h3>
              </div>
              <button
                onClick={() => setShowTimeModal(false)}
                className="p-1 rounded-lg text-secondary-theme hover:bg-subtle cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-subtle border border-subtle">
                <div>
                  <span className="text-xs font-bold text-primary-theme block">
                    Включить авто-генерацию
                  </span>
                  <span className="text-[11px] text-muted-theme">
                    Автоматическое создание пинов каждый день
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isNightlyActive}
                  onChange={(e) => setIsNightlyActive(e.target.checked)}
                  className="w-5 h-5 rounded cursor-pointer accent-accent"
                />
              </div>

              {/* Timezone Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-primary-theme flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-accent-ghost" />
                    <span>Часовой пояс (Timezone):</span>
                  </label>
                  <span className="text-[10px] text-muted-theme font-mono font-bold">
                    {getTimezoneInfo(userTimezone).abbr}
                  </span>
                </div>
                <select
                  value={userTimezone}
                  onChange={(e) => {
                    setUserTimezone(e.target.value);
                    saveUserTimezone(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-subtle border border-subtle text-primary-theme focus:outline-none focus:border-accent cursor-pointer"
                >
                  {SUPPORTED_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {language === 'ru' ? tz.nameRu : tz.nameEn} ({tz.abbr})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-primary-theme block">
                  Точное время генерации (часы и минуты):
                </label>
                <div className="flex items-center gap-2 bg-subtle border border-subtle p-3 rounded-xl">
                  <Clock className="w-4 h-4 text-accent-ghost" />
                  <input
                    type="time"
                    value={selectedAutoTime}
                    onChange={(e) => setSelectedAutoTime(e.target.value)}
                    disabled={!isNightlyActive}
                    className="text-base font-mono font-bold bg-transparent text-primary-theme focus:outline-none cursor-pointer flex-1 disabled:opacity-40"
                  />
                  <span className={`text-xs font-mono font-bold ${userTimezone === 'Europe/Moscow' ? 'text-muted-theme' : 'text-accent-ghost'}`}>
                    {getTimezoneInfo(userTimezone).abbr}
                  </span>
                </div>
              </div>

              {/* Timezone Conversion Notice for Non-Moscow users */}
              {userTimezone !== 'Europe/Moscow' && (
                <div className="p-3 rounded-xl bg-accent-pill border border-accent/20 space-y-1.5 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-secondary-theme">Ваше местное время:</span>
                    <span className="font-mono text-primary-theme font-bold">
                      {selectedAutoTime} {getTimezoneInfo(userTimezone).abbr}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-secondary-theme">Время на серверах в РФ:</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {convertLocalToMoscow(selectedAutoTime, userTimezone)} МСК
                    </span>
                  </div>
                  <p className="text-[10px] text-secondary-theme pt-1 border-t border-accent/15 leading-relaxed">
                    Серверы PinPosy в России автоматически запустят генерацию в {convertLocalToMoscow(selectedAutoTime, userTimezone)} МСК, чтобы пины были готовы ровно к {selectedAutoTime} вашего местного времени.
                  </p>
                </div>
              )}

              {/* Quick Preset Chips */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-muted-theme block font-semibold">
                  Быстрые пресеты:
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {['00:30', '01:00', '02:00', '08:00', '14:30', '19:30', '21:00', '23:00'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSelectedAutoTime(preset)}
                      disabled={!isNightlyActive}
                      className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        selectedAutoTime === preset
                          ? 'accent-btn shadow-xs'
                          : 'bg-subtle text-secondary-theme hover:bg-surface border border-subtle'
                      } disabled:opacity-30`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-secondary-theme bg-subtle/60 p-3 rounded-xl border border-subtle">
                В указанное время система автоматически проанализирует тренды и доски аккаунта <b className="text-primary-theme">{currentAccount?.name || 'Botanica Nordic'}</b> и подготовит партию пинов в очередь проверки.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
              <button
                type="button"
                onClick={() => setShowTimeModal(false)}
                className="secondary-btn px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSaveAutoTime}
                className="accent-btn px-4 py-2 text-xs font-bold cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Сохранить время</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
