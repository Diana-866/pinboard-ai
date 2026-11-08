import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Sparkles,
  Plus,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  X,
  Zap,
  Globe,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { BoardItem, ScheduledPinItem, PinterestAccount } from '../../data/mockData';
import {
  getDefaultTimezone,
  saveUserTimezone,
  SUPPORTED_TIMEZONES,
} from '../../utils/timezone';

interface PublishingCalendarProps {
  scheduledPins: ScheduledPinItem[];
  scheduleLoadError?: string;
  onRetryLoadSchedule?: () => void;
  boards: BoardItem[];
  onAddPin: (pin: ScheduledPinItem) => void;
  onCancelSchedule?: (pin: ScheduledPinItem) => Promise<void>;
  onRetrySchedule?: (pin: ScheduledPinItem) => Promise<void>;
  onChangeFailedScheduleBoard?: (pin: ScheduledPinItem, pinterestBoardId: string) => Promise<void>;
  onReconcileLegacySchedule?: (pin: ScheduledPinItem, accountId: string) => Promise<void>;
  onGoToGenerator: (topic?: string, date?: string) => void;
  onOpenReview?: () => void;
  accounts?: PinterestAccount[];
  pendingCount?: number;
}

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const PublishingCalendar: React.FC<PublishingCalendarProps> = ({
  scheduledPins,
  scheduleLoadError = '',
  onRetryLoadSchedule,
  boards,
  onAddPin,
  onCancelSchedule,
  onRetrySchedule,
  onChangeFailedScheduleBoard,
  onReconcileLegacySchedule,
  onGoToGenerator,
  onOpenReview,
  accounts = [],
  pendingCount = 15,
}) => {
  const { t, formatDate, formatNumber, language } = useI18n();

  const [userTimezone, setUserTimezone] = useState<string>(() => getDefaultTimezone(language));
  const [showTzPicker, setShowTzPicker] = useState(false);

  const [activeView, setActiveView] = useState<'queue' | 'week' | 'month'>('week');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [selectedPin, setSelectedPin] = useState<ScheduledPinItem | null>(null);
  const [legacyAccountId, setLegacyAccountId] = useState('');
  const [replacementBoards, setReplacementBoards] = useState<Array<{ id: string; name: string }>>([]);
  const [replacementBoardId, setReplacementBoardId] = useState('');
  const [replacementBoardsLoading, setReplacementBoardsLoading] = useState(false);
  const [replacementBoardsError, setReplacementBoardsError] = useState('');
  const [busyScheduleAction, setBusyScheduleAction] = useState<string | null>(null);
  const scheduleActionLockRef = useRef<string | null>(null);

  const runScheduleAction = async (actionKey: string, action: () => Promise<void>) => {
    // State updates are asynchronous; the ref closes the rapid double-click gap.
    if (scheduleActionLockRef.current) return;
    scheduleActionLockRef.current = actionKey;
    setBusyScheduleAction(actionKey);
    try {
      await action();
    } finally {
      scheduleActionLockRef.current = null;
      setBusyScheduleAction(null);
    }
  };

  useEffect(() => {
    if (!selectedPin || selectedPin.pinterestAccountId) {
      setLegacyAccountId('');
      return;
    }
    setLegacyAccountId(accounts.length === 1 ? accounts[0].id : '');
  }, [selectedPin, accounts]);

  useEffect(() => {
    let active = true;
    const loadReplacementBoards = async () => {
      if (
        !selectedPin ||
        selectedPin.status !== 'failed' ||
        selectedPin.failureReason !== 'board_unavailable' ||
        !selectedPin.pinterestAccountId ||
        !onChangeFailedScheduleBoard
      ) {
        setReplacementBoards([]);
        setReplacementBoardId('');
        setReplacementBoardsError('');
        setReplacementBoardsLoading(false);
        return;
      }

      setReplacementBoardsLoading(true);
      setReplacementBoardsError('');
      try {
        const result = await apiRequest(
          `/integrations/pinterest/boards?account_id=${encodeURIComponent(selectedPin.pinterestAccountId)}`
        );
        const items = Array.isArray(result?.boards)
          ? result.boards
              .filter((board: any) => board && board.id && board.name)
              .map((board: any) => ({ id: String(board.id), name: String(board.name) }))
          : [];
        if (!active) return;
        setReplacementBoards(items);
        setReplacementBoardId(items.find((board) => board.id !== selectedPin.pinterestBoardId)?.id || '');
        if (!items.length) {
          setReplacementBoardsError(
            language === 'ru' ? 'Pinterest не вернул доступные доски для этого аккаунта.' :
            language === 'de' ? 'Pinterest hat keine verfügbaren Boards für dieses Konto zurückgegeben.' :
            language === 'es' ? 'Pinterest no devolvió tableros disponibles para esta cuenta.' :
            language === 'fr' ? 'Pinterest n’a renvoyé aucun tableau disponible pour ce compte.' :
            language === 'pt' ? 'O Pinterest não retornou pastas disponíveis para esta conta.' :
            language === 'zh' ? 'Pinterest 未返回此账户的可用画板。' :
            'Pinterest returned no available boards for this account.'
          );
        }
      } catch (error) {
        if (!active) return;
        setReplacementBoards([]);
        setReplacementBoardId('');
        setReplacementBoardsError(
          error instanceof Error ? error.message :
          (language === 'ru' ? 'Не удалось загрузить доски Pinterest.' : 'Could not load Pinterest boards.')
        );
      } finally {
        if (active) setReplacementBoardsLoading(false);
      }
    };
    void loadReplacementBoards();
    return () => { active = false; };
  }, [selectedPin?.id, selectedPin?.status, selectedPin?.failureReason, selectedPin?.pinterestAccountId, selectedPin?.pinterestBoardId, onChangeFailedScheduleBoard, language]);

  // Browser-local manual planning targets; these do not trigger automation.
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || 'acc-1');

  useEffect(() => {
    if (accounts.length === 0) {
      setSelectedAccountId('');
      return;
    }
    setSelectedAccountId((current) =>
      current && accounts.some((account) => account.id === current) ? current : accounts[0].id
    );
  }, [accounts]);
  const [accountCadence, setAccountCadence] = useState<
    Record<string, { min: number; max: number }>
  >(() => {
    try {
      const saved = localStorage.getItem('pinposy_account_cadence');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Object.fromEntries(Object.entries(parsed).map(([id, value]: [string, any]) => [
          id,
          { min: Number(value?.min) || 8, max: Number(value?.max) || 16 },
        ]));
      }
    } catch {
      // ignore invalid browser-local preferences
    }
    const initialMap: Record<string, { min: number; max: number }> = {
      'acc-1': { min: 8, max: 16 },
      'acc-2': { min: 5, max: 10 },
      'acc-3': { min: 4, max: 8 },
    };
    accounts.forEach((acc) => {
      if (acc.id) {
        initialMap[acc.id] = {
          min: acc.minDailyPins || 8,
          max: acc.maxDailyPins || 16,
        };
      }
    });
    return initialMap;
  });

  // Modal / Slide-over for "Сгенерировать пины на эту дату"
  const [slotModalData, setSlotModalData] = useState<{
    isOpen: boolean;
    date: string;
    time: string;
    boardId: string;
  } | null>(null);

  const [slotTopic, setSlotTopic] = useState('');

  const getLocalizedTimezoneName = (timeZone: string): string => {
    try {
      return new Intl.DateTimeFormat(language, {
        timeZone,
        timeZoneName: 'long',
      }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value || timeZone;
    } catch {
      return timeZone;
    }
  };

  const getLocalizedTimezoneAbbr = (timeZone: string): string => {
    try {
      return new Intl.DateTimeFormat(language, {
        timeZone,
        timeZoneName: 'short',
      }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value || timeZone;
    } catch {
      return timeZone;
    }
  };

  const timezoneOptions = SUPPORTED_TIMEZONES.some((tz) => tz.value === userTimezone)
    ? SUPPORTED_TIMEZONES
    : [
        {
          value: userTimezone,
          nameEn: userTimezone,
          nameRu: userTimezone,
          abbr: userTimezone,
          offsetHoursFromUtc: 0,
        },
        ...SUPPORTED_TIMEZONES,
      ];

  const currentCadence = accountCadence[selectedAccountId] || { min: 8, max: 16 };

  const handleUpdateCurrentCadence = (
    updates: Partial<{ min: number; max: number }>
  ) => {
    setAccountCadence((prev) => {
      const updated = {
        ...(prev[selectedAccountId] || currentCadence),
        ...updates,
      };
      const next = {
        ...prev,
        [selectedAccountId]: updated,
      };
      try {
        localStorage.setItem('pinposy_account_cadence', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const filteredPins = scheduledPins.filter((p) => {
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchAccount = filterAccount === 'all'
      || p.pinterestAccountId === filterAccount
      || p.accountId === filterAccount
      || p.accountHandle === filterAccount;
    return matchStatus && matchAccount;
  });

  const handleSlotClick = (dateStr: string, timeStr = '20:15') => {
    setSlotModalData({
      isOpen: true,
      date: dateStr,
      time: timeStr,
      boardId: boards[0]?.id || 'b-1',
    });
    setSlotTopic('Minimalist Scandinavian styling and warm beige palette');
  };

  const handleConfirmSlotGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slotModalData) return;

    onGoToGenerator(slotTopic, slotModalData.date);
    setSlotModalData(null);
  };

  // Generate days for week and month view
  const today = new Date();
  const weekDayLabels = Array.from({ length: 7 }).map((_, index) =>
    formatDate(new Date(Date.UTC(2024, 0, 7 + index)), { weekday: 'short', timeZone: 'UTC' })
  );
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(today.getDate() + i);
    return {
      dateObj: d,
      dateStr: formatLocalDate(d),
      dayName: formatDate(d, { weekday: 'short' }),
      dayNumber: d.getDate(),
      monthName: formatDate(d, { month: 'short' }),
    };
  });

  const monthDays = Array.from({ length: 28 }).map((_, i) => {
    const d = new Date();
    d.setDate(today.getDate() - 3 + i);
    return {
      dateObj: d,
      dateStr: formatLocalDate(d),
      dayNumber: d.getDate(),
    };
  });

  const targetAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {scheduleLoadError && (
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs leading-relaxed text-secondary-theme">{scheduleLoadError}</p>
          {onRetryLoadSchedule && (
            <button
              type="button"
              onClick={onRetryLoadSchedule}
              className="shrink-0 rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-semibold text-primary-theme hover:bg-amber-500/10"
            >
              Загрузить снова
            </button>
          )}
        </div>
      )}
      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-primary-theme font-heading">
            {t.calendar.title}
          </h1>
          <p className="text-xs md:text-sm text-secondary-theme mt-1">
            {t.calendar.scheduleDescription}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onOpenReview && (
            <button
              onClick={onOpenReview}
              className="px-3.5 py-2 rounded-xl text-xs md:text-sm font-semibold border border-accent bg-subtle text-primary-theme hover:bg-surface flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Sparkles className="w-4 h-4 text-accent-ghost" />
              <span>{t.calendar.reviewQueueLabel}: {formatNumber(pendingCount)}</span>
            </button>
          )}

          <button
            onClick={() => onGoToGenerator()}
            className="accent-btn px-4 py-2 rounded-xl text-xs md:text-sm font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.calendar.schedulePinBtn}</span>
          </button>
        </div>
      </div>

      {targetAccount && (
      <div className="custom-card p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-3">
          <div>
            <h3 className="text-sm font-bold text-primary-theme font-heading flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-ghost" />
              <span>{t.calendar.cadenceSettingsTitle}</span>
            </h3>
            <p className="text-xs text-secondary-theme mt-0.5">
              {t.calendar.cadenceSettingsDescription}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            {/* Timezone Selector Trigger & Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTzPicker(!showTzPicker)}
                className="px-2 py-1 rounded-lg text-[11px] font-medium border border-subtle bg-subtle hover:bg-surface text-secondary-theme hover:text-primary-theme flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title={t.calendar.chooseTimezone}
              >
                <Globe className="w-3 h-3 text-accent-ghost" />
                <span>{getLocalizedTimezoneAbbr(userTimezone)}</span>
              </button>

              {showTzPicker && (
                <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-surface border border-strong rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 text-xs">
                  <div className="px-2 py-1 text-[10px] font-bold text-muted-theme uppercase border-b border-subtle mb-1">
                    {t.calendar.timezonePickerTitle}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {timezoneOptions.map((tz) => (
                      <button
                        key={tz.value}
                        type="button"
                        onClick={() => {
                          setUserTimezone(tz.value);
                          saveUserTimezone(tz.value);
                          setShowTzPicker(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                          userTimezone === tz.value
                            ? 'bg-subtle text-primary-theme font-bold'
                            : 'text-secondary-theme hover:bg-subtle hover:text-primary-theme'
                        }`}
                      >
                        <span className="truncate">{getLocalizedTimezoneName(tz.value)}</span>
                        <span className="font-mono text-[10px] text-muted-theme shrink-0 ml-1">{getLocalizedTimezoneAbbr(tz.value)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Account Switcher for Limits */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-muted-theme font-semibold uppercase text-[10px] shrink-0">
            {t.calendar.settingsForLabel}
          </span>
          {accounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 whitespace-nowrap ${
                selectedAccountId === acc.id
                  ? 'bg-subtle text-primary-theme border-accent ring-1 ring-accent'
                  : 'bg-surface text-secondary-theme border-subtle hover:bg-subtle'
              }`}
            >
              <span>{acc.name}</span>
              <span className="font-mono text-[10px] text-muted-theme">{acc.handle}</span>
            </button>
          ))}
        </div>

        {/* Inputs: Minimum and Maximum */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
          <div className="flex items-center justify-between p-3 rounded-xl bg-subtle border border-subtle">
            <span className="text-muted-theme">{t.calendar.minPerDayLabel}</span>
            <input
              type="number"
              min={1}
              max={currentCadence.max}
              value={currentCadence.min}
              onChange={(e) => handleUpdateCurrentCadence({ min: Number(e.target.value) })}
              className="w-16 px-2 py-1 text-center font-mono font-bold bg-surface border border-subtle rounded-md text-primary-theme"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-subtle border border-subtle">
            <span className="text-muted-theme">{t.calendar.maxPerDayLabel}</span>
            <input
              type="number"
              min={currentCadence.min}
              max={50}
              value={currentCadence.max}
              onChange={(e) => handleUpdateCurrentCadence({ max: Number(e.target.value) })}
              className="w-16 px-2 py-1 text-center font-mono font-bold bg-surface border border-subtle rounded-md text-primary-theme"
            />
          </div>

          {/* Clickable Queue Review Button (Navigates to Confirmation/Review page) */}
          <button
            type="button"
            onClick={() => onOpenReview && onOpenReview()}
            className="flex items-center justify-between p-3 rounded-xl bg-subtle border border-subtle hover:border-accent hover:bg-surface transition-all cursor-pointer group text-left shadow-xs"
            title={`${formatNumber(pendingCount)} ${t.calendar.reviewQueueLabel}`}
          >
            <div className="min-w-0 pr-2">
              <span className="text-muted-theme block truncate text-[11px]">{t.calendar.queueForAccountLabel} {targetAccount.name || targetAccount.handle}:</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-1 group-hover:underline">
                <span>{formatNumber(pendingCount)} {t.calendar.reviewQueueLabel}</span>
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold accent-btn text-white flex items-center gap-1 group-hover:scale-105 transition-transform shrink-0">
              <span>{t.calendar.reviewButton}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>
        </div>

      </div>

      )}

      {/* View Switcher & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* View Tabs */}
        <div className="custom-card p-1 rounded-xl flex items-center gap-1">
          <button
            onClick={() => setActiveView('week')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeView === 'week'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme'
            }`}
          >
            {t.calendar.weekTab}
          </button>
          <button
            onClick={() => setActiveView('month')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeView === 'month'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme'
            }`}
          >
            {t.calendar.monthTab}
          </button>
          <button
            onClick={() => setActiveView('queue')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeView === 'queue'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme'
            }`}
          >
            {t.calendar.queueTab} ({formatNumber(filteredPins.length)})
          </button>
        </div>

        {/* Filters by Status & Account */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          {/* Account Filter */}
          <div className="flex items-center gap-1.5 border border-subtle rounded-xl px-3 py-1.5 bg-surface">
            <span className="text-muted-theme text-[11px]">{t.terminology.account}:</span>
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="bg-transparent font-semibold text-primary-theme text-xs focus:outline-none cursor-pointer"
            >
              <option value="all">{t.calendar.allAccounts}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.handle || a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          {[
            { value: 'all', label: t.common.all },
            { value: 'scheduled', label: t.calendar.statusScheduled },
            { value: 'publishing', label: t.calendar.statusPublishing },
            { value: 'published', label: t.calendar.statusPublished },
            { value: 'cancelled', label: t.calendar.statusCancelled },
            { value: 'failed', label: t.calendar.statusFailed },
            { value: 'unknown', label: t.calendar.statusUnknown },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilterStatus(value)}
              className={`px-2.5 py-1.5 rounded-lg border border-subtle cursor-pointer transition-colors ${
                filterStatus === value
                  ? 'bg-subtle text-primary-theme font-semibold'
                  : 'bg-surface text-secondary-theme hover:text-primary-theme'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* WEEK VIEW WITH INTERACTIVE SLOTS */}
      {activeView === 'week' && (
        <div className="custom-card p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between text-xs text-secondary-theme">
            <span>{t.calendar.weekInstruction}</span>
            <span className="font-mono text-muted-theme">{t.calendar.timezoneLabel}: {getLocalizedTimezoneAbbr(userTimezone)}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDays.map((day) => {
              const pinsForDay = filteredPins.filter((p) => p.scheduledDate === day.dateStr);

              return (
                <div
                  key={day.dateStr}
                  className="rounded-2xl border border-subtle bg-subtle/50 p-3 flex flex-col justify-between min-h-[340px] space-y-3"
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between border-b border-subtle pb-2">
                    <div>
                      <span className="text-[11px] font-semibold uppercase text-muted-theme block">
                        {day.dayName}
                      </span>
                      <span className="text-base font-bold font-mono text-primary-theme">
                        {day.dayNumber} {day.monthName}
                      </span>
                    </div>

                    <button
                      onClick={() => handleSlotClick(day.dateStr)}
                      className="p-1 rounded-lg border border-subtle bg-surface hover:bg-subtle text-primary-theme cursor-pointer transition-colors shadow-2xs"
                      title={t.calendar.generateDateTitle}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Scheduled Pins in this day */}
                  <div className="space-y-2 flex-1 overflow-y-auto max-h-[220px]">
                    {pinsForDay.map((pin) => (
                      <div
                        key={pin.id}
                        onClick={() => setSelectedPin(pin)}
                        className="p-2 rounded-xl border border-subtle bg-surface hover:border-strong transition-all cursor-pointer space-y-1 shadow-2xs group"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="font-bold text-accent-ghost">{pin.scheduledTime}</span>
                          <span className="text-muted-theme truncate max-w-[80px]">{pin.accountHandle}</span>
                        </div>
                        <p className="text-[11px] font-semibold text-primary-theme line-clamp-2 leading-tight">
                          {pin.title}
                        </p>
                      </div>
                    ))}

                    {/* Empty Time Slot Prompts */}
                    {pinsForDay.length < 3 && (
                      <button
                        onClick={() => handleSlotClick(day.dateStr, '20:15')}
                        className="w-full p-2 rounded-xl border border-dashed border-subtle hover:border-accent bg-surface/60 text-[11px] text-muted-theme hover:text-primary-theme transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t.calendar.primeSlotLabel}</span>
                      </button>
                    )}
                  </div>

                  {/* Bottom Day Cadence Pill */}
                  <div className="pt-2 border-t border-subtle text-[10px] text-muted-theme font-mono flex items-center justify-between">
                    <span>{formatNumber(pinsForDay.length)} {t.calendar.pinCountLabel}</span>
                    <span className="text-emerald-600 font-semibold">{t.calendar.optimalLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MONTH VIEW */}
      {activeView === 'month' && (
        <div className="custom-card p-5 rounded-2xl space-y-4">
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-muted-theme uppercase tracking-wider pb-2 border-b border-subtle">
            {weekDayLabels.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2 min-h-[300px]">
            {monthDays.map((d, idx) => {
              const pins = filteredPins.filter((p) => p.scheduledDate === d.dateStr);

              return (
                <div
                  key={idx}
                  onClick={() => handleSlotClick(d.dateStr)}
                  className="min-h-[90px] p-2 rounded-xl bg-subtle/50 border border-subtle hover:border-strong transition-all flex flex-col justify-between cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-secondary-theme">
                      {d.dayNumber}
                    </span>
                    <Plus className="w-3 h-3 text-muted-theme opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>

                  <div className="space-y-1">
                    {pins.slice(0, 1).map((p) => (
                      <div
                        key={p.id}
                        className="px-1.5 py-0.5 rounded-md bg-surface border border-subtle text-[10px] text-primary-theme truncate shadow-2xs font-semibold"
                      >
                        {p.scheduledTime} · {p.title}
                      </div>
                    ))}
                    {pins.length > 1 && (
                      <span className="text-[9px] font-mono text-muted-theme block">
                        +{formatNumber(pins.length - 1)} {t.calendar.moreLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* QUEUE LIST VIEW */}
      {activeView === 'queue' && (
        <div className="custom-card rounded-2xl overflow-hidden divide-y divide-subtle">
          {filteredPins.length > 0 ? (
            filteredPins.map((pin) => (
              <div
                key={pin.id}
                onClick={() => setSelectedPin(pin)}
                className="p-4 hover:bg-subtle/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={pin.imageUrl}
                    alt={pin.title}
                    referrerPolicy="no-referrer"
                    className="w-14 h-20 object-cover rounded-lg border border-subtle shrink-0 shadow-xs"
                  />
                  <div className="space-y-1 min-w-0">
                    <h3 className="text-xs md:text-sm font-bold text-primary-theme line-clamp-1">
                      {pin.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-secondary-theme">
                      <span>{pin.boardName}</span>
                      <span>·</span>
                      <span className="font-mono text-muted-theme">{pin.scheduledTime}</span>
                      <span>·</span>
                      <span className="font-mono text-[11px] text-primary-theme">{pin.accountHandle}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:self-center">
                  <span className="text-xs font-mono font-semibold text-primary-theme">
                    {formatDate(pin.scheduledDate, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    pin.status === 'published'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : pin.status === 'failed'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                      : pin.status === 'publishing'
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : pin.status === 'unknown'
                      ? 'bg-orange-500/10 text-orange-700 dark:text-orange-400'
                      : pin.status === 'cancelled'
                      ? 'bg-gray-500/10 text-gray-600 dark:text-gray-400'
                      : 'bg-accent-pill text-primary-theme'
                  }`}>
                    {pin.status === 'published'
                      ? t.calendar.statusPublished
                      : pin.status === 'failed'
                      ? t.calendar.statusFailed
                      : pin.status === 'publishing'
                      ? t.calendar.statusPublishing
                      : pin.status === 'unknown'
                      ? t.calendar.statusUnknown
                      : pin.status === 'cancelled'
                      ? t.calendar.statusCancelled
                      : t.calendar.statusQueued}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-muted-theme">
              {t.calendar.emptyQueue}
            </div>
          )}
        </div>
      )}

      {/* MODAL / SLIDE-OVER: Сгенерировать пины на конкретную дату */}
      {slotModalData && (
        <div
          onClick={() => setSlotModalData(null)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="custom-card p-6 rounded-2xl shadow-2xl max-w-lg w-full space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-subtle pb-3">
              <div>
                <h3 className="text-base font-bold text-primary-theme font-heading">
                  {t.calendar.generateDateTitle}
                </h3>
                <span className="text-xs font-mono text-accent-ghost font-semibold">
                  {slotModalData.date} · {slotModalData.time}
                </span>
              </div>
              <button
                onClick={() => setSlotModalData(null)}
                className="text-muted-theme hover:text-primary-theme cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSlotGenerate} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-primary-theme block mb-1">
                  {t.calendar.topicLabel}
                </label>
                <textarea
                  rows={2}
                  required
                  value={slotTopic}
                  onChange={(e) => setSlotTopic(e.target.value)}
                  placeholder={t.calendar.topicPlaceholder}
                  className="w-full px-3 py-2 bg-app-input border border-subtle rounded-xl text-xs text-primary-theme focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="font-semibold text-primary-theme block mb-1">
                  {t.calendar.targetBoardLabel}
                </label>
                <select
                  value={slotModalData.boardId}
                  onChange={(e) =>
                    setSlotModalData((prev) => (prev ? { ...prev, boardId: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 bg-app-input border border-subtle rounded-xl text-xs text-primary-theme focus:outline-none"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-subtle text-[11px] text-secondary-theme">
                ⚡ {t.calendar.dateSavedHint}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setSlotModalData(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary-theme hover:text-primary-theme cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="accent-btn px-4 py-2 text-xs font-semibold cursor-pointer shadow-xs"
                >
                  {t.calendar.generateDateButton}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pin Detail Modal */}
      {selectedPin && (
        <div
          onClick={() => setSelectedPin(null)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="custom-card max-w-lg w-full p-6 rounded-2xl space-y-4 shadow-2xl relative"
          >
            <div className="flex items-start gap-4">
              <img
                src={selectedPin.imageUrl}
                alt={selectedPin.title}
                referrerPolicy="no-referrer"
                className="w-24 h-36 object-cover rounded-xl border border-subtle shrink-0 shadow-md"
              />
              <div className="space-y-1.5 flex-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full accent-pill">
                  {selectedPin.status === 'published'
                    ? t.calendar.statusPublished
                    : selectedPin.status === 'failed'
                    ? t.calendar.statusFailed
                    : selectedPin.status === 'publishing'
                    ? t.calendar.statusPublishing
                    : selectedPin.status === 'unknown'
                    ? t.calendar.statusUnknown
                    : selectedPin.status === 'cancelled'
                    ? t.calendar.statusCancelled
                    : selectedPin.status === 'draft'
                    ? t.calendar.statusDraft
                    : t.calendar.statusQueued}
                </span>
                <h3 className="text-base font-bold text-primary-theme font-heading leading-snug">
                  {selectedPin.title}
                </h3>
                <p className="text-xs text-secondary-theme">
                  {selectedPin.boardName} · {selectedPin.accountHandle}
                </p>
                <p className="text-xs font-mono font-bold text-accent-ghost">
                  {selectedPin.scheduledDate} · {selectedPin.scheduledTime}
                </p>
                {selectedPin.status === 'published' && selectedPin.pinterestPinUrl && (
                  <a
                    href={selectedPin.pinterestPinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-ghost hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t.calendar.openPinterestPin}
                  </a>
                )}
              </div>
            </div>

            {selectedPin.status === 'unknown' && (
              <div role="alert" className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-primary-theme">
                  {t.calendar.unknownPublishHelpTitle}
                </p>
                <p className="text-xs leading-relaxed text-secondary-theme">
                  {t.calendar.unknownPublishHelpBody}
                </p>
              </div>
            )}

            {selectedPin.status === 'failed' && selectedPin.failureReason === 'board_unavailable' && (
              <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-primary-theme">
                  {language === 'ru' ? 'Доска Pinterest недоступна' :
                   language === 'de' ? 'Pinterest-Board nicht verfügbar' :
                   language === 'es' ? 'Tablero de Pinterest no disponible' :
                   language === 'fr' ? 'Tableau Pinterest indisponible' :
                   language === 'pt' ? 'Pasta do Pinterest indisponível' :
                   language === 'zh' ? 'Pinterest 画板不可用' :
                   'Pinterest board unavailable'}
                </p>
                <p className="text-xs leading-relaxed text-secondary-theme">
                  {language === 'ru'
                    ? 'Доска была удалена или доступ к ней потерян. PinPosy не будет повторять публикацию на этой доске. Выберите доступную доску и создайте новое расписание для этого пина.'
                    : language === 'de'
                    ? 'Das Board wurde gelöscht oder der Zugriff ist verloren gegangen. PinPosy wiederholt die Veröffentlichung dort nicht. Wählen Sie ein verfügbares Board und planen Sie diesen Pin erneut.'
                    : language === 'es'
                    ? 'El tablero se eliminó o ya no tienes acceso. PinPosy no volverá a publicar allí. Elige un tablero disponible y programa este pin de nuevo.'
                    : language === 'fr'
                    ? 'Le tableau a été supprimé ou vous n’y avez plus accès. PinPosy ne réessaiera pas sur ce tableau. Choisissez un tableau disponible et reprogrammez cette épingle.'
                    : language === 'pt'
                    ? 'A pasta foi excluída ou o acesso foi perdido. O PinPosy não tentará publicar nela novamente. Escolha uma pasta disponível e agende este Pin outra vez.'
                    : language === 'zh'
                    ? '该画板已被删除或您已失去访问权限。PinPosy 不会在此画板上重试。请选择可用画板并重新安排此 Pin。'
                    : 'The board was deleted or access was lost. PinPosy will not retry this publication there. Choose an available board and schedule this Pin again.'}
                </p>
              </div>
            )}

            {selectedPin.status === 'failed' && selectedPin.failureReason === 'board_unavailable' && !!selectedPin.pinterestAccountId && onChangeFailedScheduleBoard && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-primary-theme">
                  {language === 'ru' ? 'Выбрать другую доску' :
                   language === 'de' ? 'Anderes Board auswählen' :
                   language === 'es' ? 'Elegir otro tablero' :
                   language === 'fr' ? 'Choisir un autre tableau' :
                   language === 'pt' ? 'Escolher outra pasta' :
                   language === 'zh' ? '选择其他画板' : 'Choose another board'}
                </p>
                <p className="text-xs leading-relaxed text-secondary-theme">
                  {language === 'ru'
                    ? 'Пин и его настройки сохранятся. После проверки новой доски расписание будет поставлено в очередь заново. Это доступно только если предыдущая попытка публикации безопасно завершилась.'
                    : language === 'de'
                    ? 'Pin und Einstellungen bleiben erhalten. Nach Prüfung des neuen Boards wird der Beitrag erneut eingeplant. Dies ist nur möglich, wenn der vorherige Veröffentlichungsversuch nachweislich sicher beendet wurde.'
                    : language === 'es'
                    ? 'El Pin y su configuración se conservarán. Tras verificar el nuevo tablero, se volverá a poner en cola. Solo es posible si el intento anterior terminó de forma segura.'
                    : language === 'fr'
                    ? 'L’épingle et ses paramètres seront conservés. Après vérification du nouveau tableau, la publication sera remise en file. Cela n’est possible que si la tentative précédente s’est terminée sans ambiguïté.'
                    : language === 'pt'
                    ? 'O Pin e suas configurações serão mantidos. Após verificar a nova pasta, a publicação voltará à fila. Isso só é possível se a tentativa anterior terminou com segurança.'
                    : language === 'zh'
                    ? 'Pin 及其设置将保留。验证新画板后，发布任务将重新排队。仅当上一次发布尝试已确认安全结束时才可执行。'
                    : 'The Pin and its settings will be preserved. After the new board is verified, the schedule will be queued again. This is only available when the previous attempt is confirmed safe.'}
                </p>
                {replacementBoardsLoading ? (
                  <p className="text-xs text-secondary-theme">{language === 'ru' ? 'Загружаем доски…' : 'Loading boards…'}</p>
                ) : replacementBoards.length > 0 ? (
                  <>
                    <select
                      value={replacementBoardId}
                      onChange={(event) => setReplacementBoardId(event.target.value)}
                      className="w-full rounded-lg border border-subtle bg-app-input px-3 py-2 text-xs text-primary-theme"
                    >
                      <option value="">
                        {language === 'ru' ? 'Выберите доступную доску' : 'Select an available board'}
                      </option>
                      {replacementBoards.map((board) => (
                        <option key={board.id} value={board.id} disabled={board.id === selectedPin.pinterestBoardId}>
                          {board.name}{board.id === selectedPin.pinterestBoardId ? (language === 'ru' ? ' (текущая)' : ' (current)') : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!replacementBoardId || busyScheduleAction !== null}
                      onClick={() => void runScheduleAction(`change-board:${selectedPin.id}`, async () => {
                        try {
                          await onChangeFailedScheduleBoard(selectedPin, replacementBoardId);
                          setSelectedPin(null);
                        } catch {
                          // The parent reports the API error; keep the details open.
                        }
                      })}
                      className="accent-btn px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {busyScheduleAction === `change-board:${selectedPin.id}`
                        ? (language === 'ru' ? 'Проверяем и сохраняем…' : 'Verifying and saving…')
                        : (language === 'ru' ? 'Сменить доску и возобновить' : 'Change board and resume')}
                    </button>
                  </>
                ) : (
                  <p role="alert" className="text-xs text-secondary-theme">{replacementBoardsError}</p>
                )}
                {!!replacementBoardsError && replacementBoards.length > 0 && (
                  <p role="alert" className="text-xs text-secondary-theme">{replacementBoardsError}</p>
                )}
              </div>
            )}

            {selectedPin.status === 'failed' && !selectedPin.pinterestAccountId && onReconcileLegacySchedule && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-primary-theme">
                  У старого расписания не указан Pinterest-аккаунт.
                </p>
                {accounts.length > 1 ? (
                  <select
                    value={legacyAccountId}
                    onChange={(event) => setLegacyAccountId(event.target.value)}
                    className="w-full rounded-lg border border-subtle bg-app-input px-3 py-2 text-xs text-primary-theme"
                  >
                    <option value="">Выберите аккаунт</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.handle || account.name}</option>
                    ))}
                  </select>
                ) : accounts.length === 1 ? (
                  <p className="text-xs text-secondary-theme">
                    Будет проверен единственный подключённый аккаунт: {accounts[0].handle || accounts[0].name}.
                  </p>
                ) : (
                  <p className="text-xs text-secondary-theme">
                    Сначала подключите Pinterest-аккаунт в настройках.
                  </p>
                )}
                <button
                  type="button"
                  disabled={!legacyAccountId || accounts.length === 0 || busyScheduleAction !== null}
                  aria-busy={busyScheduleAction === `reconcile:${selectedPin.id}`}
                  onClick={() => void runScheduleAction(`reconcile:${selectedPin.id}`, async () => {
                    try {
                      await onReconcileLegacySchedule(selectedPin, legacyAccountId);
                      setSelectedPin(null);
                    } catch {
                      // The parent reports the API error; keep the details open.
                    }
                  })}
                  className="accent-btn px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busyScheduleAction === `reconcile:${selectedPin.id}` ? 'Проверяем…' : 'Проверить аккаунт и восстановить расписание'}
                </button>
              </div>
            )}

            {selectedPin.status === 'failed' && selectedPin.retryable === false && !!selectedPin.pinterestAccountId && (
              <p className="text-[11px] text-secondary-theme">
                Безопасный повтор этой публикации не подтверждён сервером.
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
              {selectedPin.status === 'failed' && selectedPin.retryable === true && !!selectedPin.pinterestAccountId && onRetrySchedule && (
              <p className="text-[11px] text-secondary-theme">
                Это задание не возобновляется автоматически после переподключения Pinterest. Нажмите «Повторить», чтобы снова поставить его в очередь.
              </p>
            )}
            {selectedPin.status === 'failed' && selectedPin.retryable === true && !!selectedPin.pinterestAccountId && onRetrySchedule && (
                <button
                  type="button"
                  disabled={busyScheduleAction !== null}
                  aria-busy={busyScheduleAction === `retry:${selectedPin.id}`}
                  onClick={() => void runScheduleAction(`retry:${selectedPin.id}`, async () => {
                    try {
                      await onRetrySchedule(selectedPin);
                      setSelectedPin(null);
                    } catch {
                      // The parent reports the API error; keep the details open.
                    }
                  })}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold text-accent-ghost cursor-pointer hover:bg-accent/10 border border-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busyScheduleAction === `retry:${selectedPin.id}` ? 'Повторяем…' : t.calendar.retryFailedPin}
                </button>
              )}
              {selectedPin.status === 'scheduled' && onCancelSchedule && (
                <button
                  type="button"
                  disabled={busyScheduleAction !== null}
                  aria-busy={busyScheduleAction === `cancel:${selectedPin.id}`}
                  onClick={() => {
                    if (!window.confirm(t.calendar.cancelScheduledPinConfirm)) return;
                    void runScheduleAction(`cancel:${selectedPin.id}`, async () => {
                      try {
                        await onCancelSchedule(selectedPin);
                        setSelectedPin(null);
                      } catch {
                        // The parent reports the API error; keep the details open.
                      }
                    });
                  }}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 cursor-pointer hover:bg-red-500/10 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busyScheduleAction === `cancel:${selectedPin.id}` ? 'Отменяем…' : t.calendar.cancelScheduledPin}
                </button>
              )}
              <button
                onClick={() => setSelectedPin(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-subtle text-primary-theme cursor-pointer hover:bg-surface border border-subtle"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
