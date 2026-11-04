import React from 'react';
import { Layers, ChevronRight, Plus, Globe, Clock, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { BoardItem, ScheduledPinItem, PinterestAccount } from '../../data/mockData';

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
  pendingCount = 0,
}) => {
  const { t, formatNumber, formatDate } = useI18n();



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
              title={t.dashboard.startReviewBtn}
            >
              <Sparkles className="w-4 h-4 text-accent-ghost" />
              <span>{pendingCount} · {t.dashboard.startReviewBtn}</span>
            </button>
          )}

          <button
            onClick={() => onQuickGenerate()}
            className="accent-btn px-4 py-2 rounded-xl text-xs md:text-sm font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.dashboard.generateBatch}</span>
          </button>
        </div>
      </div>

      <section className="custom-card p-5 rounded-2xl border border-subtle bg-subtle/40" role="status">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-accent-pill text-accent-ghost shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-primary-theme">{t.dashboard.dataNoticeTitle}</h2>
            <p className="text-xs text-secondary-theme leading-relaxed">{t.dashboard.dataNoticeDescription}</p>
          </div>
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
                          {t.calendar.optimalSlotBadge}
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
                {t.boards.title}
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
            {boards.length > 0 ? boards.slice(0, 4).map((board) => (
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
                    {t.dashboard.boardMetricsUnavailable}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-xs font-bold text-primary-theme">
                    —
                  </span>
                  <span className="text-[10px] text-muted-theme block">{t.dashboard.boardMetricsUnavailable}</span>
                </div>
              </div>
            )) : (
              <p className="py-6 text-center text-xs text-muted-theme">{t.dashboard.emptyBoards}</p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};
