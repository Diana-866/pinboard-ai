import React, { useState } from 'react';
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
  getTimezoneInfo,
  convertLocalToMoscow,
} from '../../utils/timezone';

interface PublishingCalendarProps {
  scheduledPins: ScheduledPinItem[];
  boards: BoardItem[];
  onAddPin: (pin: ScheduledPinItem) => void;
  onGoToGenerator: (topic?: string, date?: string) => void;
  onOpenReview?: () => void;
  accounts?: PinterestAccount[];
  pendingCount?: number;
  onUpdateAccountAutoTime?: (accountId: string, autoTime: string, nightlyAuto: boolean) => void;
}

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const PublishingCalendar: React.FC<PublishingCalendarProps> = ({
  scheduledPins,
  boards,
  onAddPin,
  onGoToGenerator,
  onOpenReview,
  accounts = [],
  pendingCount = 15,
  onUpdateAccountAutoTime,
}) => {
  const { t, formatDate, formatNumber, language } = useI18n();

  const [userTimezone, setUserTimezone] = useState<string>(() => getDefaultTimezone(language));
  const [showTzPicker, setShowTzPicker] = useState(false);

  const [activeView, setActiveView] = useState<'queue' | 'week' | 'month'>('week');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [selectedPin, setSelectedPin] = useState<ScheduledPinItem | null>(null);

  // Per-account cadence settings with customizable auto-generation time
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || 'acc-1');
  const [accountCadence, setAccountCadence] = useState<
    Record<string, { min: number; max: number; nightlyAuto: boolean; autoTime: string }>
  >(() => {
    try {
      const saved = localStorage.getItem('pinposy_account_cadence');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    const initialMap: Record<string, { min: number; max: number; nightlyAuto: boolean; autoTime: string }> = {
      'acc-1': { min: 8, max: 16, nightlyAuto: true, autoTime: '01:00' },
      'acc-2': { min: 5, max: 10, nightlyAuto: true, autoTime: '02:30' },
      'acc-3': { min: 4, max: 8, nightlyAuto: false, autoTime: '04:00' },
    };
    accounts.forEach((acc) => {
      if (acc.id) {
        initialMap[acc.id] = {
          min: acc.minDailyPins || 8,
          max: acc.maxDailyPins || 16,
          nightlyAuto: acc.nightlyAuto !== false,
          autoTime: acc.autoTime || '01:00',
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

  const currentCadence = accountCadence[selectedAccountId] || {
    min: 8,
    max: 16,
    nightlyAuto: true,
    autoTime: '01:00',
  };

  const handleUpdateCurrentCadence = (
    updates: Partial<{ min: number; max: number; nightlyAuto: boolean; autoTime: string }>
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
      if (onUpdateAccountAutoTime && updates.autoTime !== undefined) {
        onUpdateAccountAutoTime(selectedAccountId, updated.autoTime, updated.nightlyAuto);
      }
      return next;
    });
  };

  const filteredPins = scheduledPins.filter((p) => {
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchAccount = filterAccount === 'all' || p.accountHandle === filterAccount;
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

  const targetAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0] || {
    id: 'acc-1',
    name: 'Botanica Nordic Living',
    handle: '@botanica_nordic',
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
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

      {/* Cadence & Nightly Auto-Generation Controls Card */}
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="nightly-auto-toggle"
                checked={currentCadence.nightlyAuto}
                onChange={(e) => handleUpdateCurrentCadence({ nightlyAuto: e.target.checked })}
                className="w-4 h-4 rounded cursor-pointer"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-xs font-semibold text-primary-theme">
                {t.calendar.autoGenerationLabel}
              </span>
            </label>

            {/* User Customizable Time Input with Timezone Support */}
            <div className="flex items-center gap-1.5 bg-subtle border border-subtle px-2.5 py-1 rounded-xl shadow-xs">
              <Clock className="w-3.5 h-3.5 text-accent-ghost" />
              <input
                type="time"
                value={currentCadence.autoTime || '01:00'}
                onChange={(e) => handleUpdateCurrentCadence({ autoTime: e.target.value })}
                disabled={!currentCadence.nightlyAuto}
                className="text-xs font-mono font-bold bg-transparent text-primary-theme focus:outline-none cursor-pointer disabled:opacity-40"
                title={t.calendar.autoGenerationTitle}
              />
              <span className={`text-[10px] font-mono font-bold ${userTimezone === 'Europe/Moscow' ? 'text-muted-theme' : 'text-accent-ghost'}`}>
                {getTimezoneInfo(userTimezone).abbr}
              </span>
            </div>

            {/* Timezone Selector Trigger & Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTzPicker(!showTzPicker)}
                className="px-2 py-1 rounded-lg text-[11px] font-medium border border-subtle bg-subtle hover:bg-surface text-secondary-theme hover:text-primary-theme flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title={t.calendar.chooseTimezone}
              >
                <Globe className="w-3 h-3 text-accent-ghost" />
                <span>{getTimezoneInfo(userTimezone).abbr}</span>
              </button>

              {showTzPicker && (
                <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-surface border border-strong rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 text-xs">
                  <div className="px-2 py-1 text-[10px] font-bold text-muted-theme uppercase border-b border-subtle mb-1">
                    {t.calendar.timezonePickerTitle}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {SUPPORTED_TIMEZONES.map((tz) => (
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
                        <span className="truncate">{language === 'ru' ? tz.nameRu : tz.nameEn}</span>
                        <span className="font-mono text-[10px] text-muted-theme shrink-0 ml-1">{tz.abbr}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span className={`text-[11px] font-semibold ${currentCadence.nightlyAuto ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-theme'}`}>
              {currentCadence.nightlyAuto
                ? userTimezone === 'Europe/Moscow' || (language === 'ru' && userTimezone === 'Europe/Moscow')
                  ? `${currentCadence.autoTime || '01:00'} ${getTimezoneInfo(userTimezone).abbr}`
                  : t.calendar.autoTimeMoscowTemplate
                      .replace('{time}', currentCadence.autoTime || '01:00')
                      .replace('{timezone}', getTimezoneInfo(userTimezone).abbr)
                      .replace('{moscowTime}', convertLocalToMoscow(currentCadence.autoTime || '01:00', userTimezone))
                : t.common.inactive}
            </span>
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

        {/* Quick Time Presets & Status */}
        {currentCadence.nightlyAuto && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-subtle text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-theme">{t.calendar.quickTimePresetsLabel}</span>
              {['00:30', '01:00', '02:00', '08:00', '14:30', '19:30', '21:00', '23:00'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleUpdateCurrentCadence({ autoTime: preset })}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                    (currentCadence.autoTime || '01:00') === preset
                      ? 'accent-btn font-bold shadow-xs'
                      : 'bg-subtle text-secondary-theme hover:bg-surface border border-subtle'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <span className="text-[11px] text-secondary-theme font-medium">
              {t.calendar.dailyGenerationHint}
            </span>
          </div>
        )}
      </div>

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
                <option key={a.id} value={a.handle}>
                  {a.handle}
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
            <span className="font-mono text-muted-theme">{t.calendar.timezoneLabel}: {getTimezoneInfo(userTimezone).abbr}</span>
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
                  {slotModalData.date} · Слот {slotModalData.time} (Prime Time)
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
                    ? 'Опубликован'
                    : selectedPin.status === 'failed'
                    ? 'Ошибка публикации'
                    : selectedPin.status === 'publishing'
                    ? 'Публикуется'
                    : selectedPin.status === 'unknown'
                    ? 'Нужна проверка'
                    : selectedPin.status === 'draft'
                    ? 'Черновик'
                    : 'В очереди'}
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
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
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
