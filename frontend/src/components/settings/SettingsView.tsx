import React, { useState } from 'react';
import {
  Palette,
  Globe,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Check,
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  Trash2,
  Sliders,
  Clock,
} from 'lucide-react';
import { useTheme } from '../../theme/themeContext';
import { useI18n } from '../../i18n/i18nContext';
import { useAuth } from '../../context/AuthContext';
import { ThemeMode } from '../../theme/types';
import { SupportedLanguage } from '../../i18n/types';
import { PinterestAccount } from '../../data/mockData';
import {
  getDefaultTimezone,
  saveUserTimezone,
  SUPPORTED_TIMEZONES,
  getTimezoneInfo,
  convertLocalToMoscow,
} from '../../utils/timezone';

import { PinterestCard } from './PinterestCard';

interface SettingsViewProps {
  onGoToPricing?: () => void;
  accounts?: PinterestAccount[];
  activeAccountId?: string;
  onSelectAccount?: (id: string) => void;
  onAddAccount?: (account: PinterestAccount) => void;
  onRemoveAccount?: (id: string) => void;
  maxAccounts?: number;
  onUpdateAccountAutoTime?: (accountId: string, autoTime: string, nightlyAuto: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onGoToPricing,
  accounts = [],
  activeAccountId,
  onSelectAccount,
  onAddAccount,
  onRemoveAccount,
  maxAccounts = 3,
  onUpdateAccountAutoTime,
}) => {
  const { theme, setTheme, allThemes } = useTheme();
  const { language, setLanguage, t, supportedLanguages } = useI18n();
  const { user } = useAuth();

  const [userTimezone, setUserTimezone] = useState<string>(() => getDefaultTimezone(language));
  const [successToast, setSuccessToast] = useState<string | null>(null);


  const isLimitReached = accounts.length >= maxAccounts;
  const planId = user?.tariff_plan || 'none';
  const currentPlanName = user?.subscription_active === false || planId === 'none'
    ? t.settings.noActivePlan
    : planId === 'analytics' ? t.pricing.planAnalyticsTitle
      : planId === 'start' ? t.pricing.planStartTitle
        : planId === 'pro' || planId === 'standard' ? t.pricing.planProTitle
          : planId === 'agency' ? t.pricing.planAgencyTitle : t.settings.noActivePlan;
  const availableCredits = Number(user?.credits_balance ?? 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Title */}
      <div className="border-b border-subtle pb-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-primary-theme font-heading">
          {t.settings.title}
        </h1>
        <p className="text-xs md:text-sm text-secondary-theme mt-1">
          {t.settings.subtitle}
        </p>
      </div>

      {successToast && (
        <div className="p-3 rounded-xl bg-subtle border border-subtle text-xs text-secondary-theme" role="status">
          {successToast}
        </div>
      )}

      {/* 1. CONNECTED PINTEREST BUSINESS ACCOUNTS */}
      <section className="custom-card p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-accent-ghost" />
                <span>{t.settings.connectedAccountSection}</span>
              </h2>

              {/* Exact user requirement: "Подключено 1 из 3 аккаунтов" */}
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                isLimitReached
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  : 'bg-subtle text-primary-theme border border-subtle'
              }`}>
                {t.settings.connectedAccountsCount.replace('{count}', String(accounts.length)).replace('{max}', String(maxAccounts))}
              </span>
            </div>
            <p className="text-xs text-muted-theme mt-1">
              {t.settings.connectedAccountDesc}
            </p>
          </div>

          {!isLimitReached && (
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="secondary-btn self-start sm:self-auto px-4 py-2 text-xs font-semibold opacity-70 cursor-not-allowed"
              title={t.settings.pinterestConnectionUnavailable}
            >
              {t.settings.pinterestConnectionUnavailable}
            </button>
          )}
        </div>

        {/* List of Connected Accounts */}
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <p className="rounded-xl border border-subtle bg-subtle/40 p-4 text-sm text-secondary-theme">
              {t.settings.noAccountsConnected}
            </p>
          ) : accounts.map((acc) => {
            const isActive = acc.id === (activeAccountId || accounts[0]?.id);
            return (
              <div
                key={acc.id}
                className={`p-4 rounded-xl border transition-all space-y-3 ${
                  isActive
                    ? 'border-accent bg-subtle/60 shadow-xs ring-1 ring-accent/30'
                    : 'border-subtle bg-surface hover:bg-subtle/30'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={acc.avatar}
                      alt={acc.name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full object-cover border border-subtle shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-primary-theme truncate">
                          {acc.name}
                        </span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500" title="API подключен и верифицирован" />
                        {isActive && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full accent-btn text-white">
                            Активный профиль
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-secondary-theme mt-0.5 flex-wrap">
                        <span className="font-mono text-primary-theme font-medium">{acc.handle}</span>
                        <span>·</span>
                        <span>{acc.boardsCount} досок</span>
                        <span>·</span>
                        <span>{acc.monthlyViews} просм/мес</span>
                        <span>·</span>
                        <span>{acc.minDailyPins}–{acc.maxDailyPins} пинов/день</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    {!isActive && onSelectAccount && (
                      <button
                        onClick={() => onSelectAccount(acc.id)}
                        className="secondary-btn px-3 py-1.5 text-xs font-semibold cursor-pointer"
                      >
                        Сделать активным
                      </button>
                    )}

                    <button
                      className="p-2 rounded-lg border border-subtle hover:border-strong text-secondary-theme hover:text-primary-theme cursor-pointer transition-colors"
                      title="Синхронизировать данные"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>

                    {accounts.length > 1 && onRemoveAccount && (
                      <button
                        onClick={() => onRemoveAccount(acc.id)}
                        className="p-2 rounded-lg border border-subtle hover:border-rose-400 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer transition-colors"
                        title="Отключить аккаунт"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Auto-Generation Time Customization Box */}
                {(() => {
                  const tzInfo = getTimezoneInfo(userTimezone);
                  const isMsk = userTimezone === 'Europe/Moscow';
                  const autoTime = acc.autoTime || '01:00';
                  const mskTime = convertLocalToMoscow(autoTime, userTimezone);

                  return (
                    <div className="pt-2.5 border-t border-subtle flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs bg-subtle/50 p-2.5 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-accent-ghost shrink-0" />
                        <div>
                          <span className="font-semibold text-primary-theme block text-xs">
                            Расписание авто-генерации:
                          </span>
                          <span className="text-[11px] text-muted-theme">
                            {acc.nightlyAuto !== false
                              ? isMsk || (language === 'ru' && isMsk)
                                ? `Запуск в ${autoTime} МСК (${acc.minDailyPins}–${acc.maxDailyPins} пинов)`
                                : `Запуск в ${autoTime} ${tzInfo.abbr} (${mskTime} МСК на сервере)`
                              : 'Генерация приостановлена'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={acc.nightlyAuto !== false}
                            onChange={(e) => {
                              if (onUpdateAccountAutoTime) {
                                onUpdateAccountAutoTime(acc.id, acc.autoTime || '01:00', e.target.checked);
                                setSuccessToast(`Автогенерация для ${acc.handle} ${e.target.checked ? 'включена' : 'выключена'}!`);
                                setTimeout(() => setSuccessToast(null), 3000);
                              }
                            }}
                            className="w-3.5 h-3.5 rounded cursor-pointer accent-accent"
                          />
                          <span className="text-secondary-theme text-[11px]">Авто</span>
                        </label>

                        <div className="flex items-center gap-1 bg-surface border border-subtle px-2 py-0.5 rounded-md">
                          <input
                            type="time"
                            value={acc.autoTime || '01:00'}
                            onChange={(e) => {
                              if (onUpdateAccountAutoTime) {
                                onUpdateAccountAutoTime(acc.id, e.target.value, acc.nightlyAuto !== false);
                                setSuccessToast(
                                  isMsk || (language === 'ru' && isMsk)
                                    ? `Время автогенерации для ${acc.handle} установлено на ${e.target.value} МСК!`
                                    : `Время автогенерации для ${acc.handle} установлено на ${e.target.value} ${tzInfo.abbr} (${convertLocalToMoscow(e.target.value, userTimezone)} МСК на сервере)!`
                                );
                                setTimeout(() => setSuccessToast(null), 3000);
                              }
                            }}
                            disabled={acc.nightlyAuto === false}
                            className="text-xs font-mono font-bold bg-transparent text-primary-theme focus:outline-none cursor-pointer disabled:opacity-40"
                          />
                          <span className={`text-[9px] font-mono ${isMsk ? 'text-muted-theme' : 'text-accent-ghost font-bold'}`}>
                            {tzInfo.abbr}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {['00:30', '01:00', '08:00', '21:00'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                if (onUpdateAccountAutoTime) {
                                  onUpdateAccountAutoTime(acc.id, preset, acc.nightlyAuto !== false);
                                  setSuccessToast(
                                    isMsk || (language === 'ru' && isMsk)
                                      ? `Время автогенерации для ${acc.handle} установлено на ${preset} МСК!`
                                      : `Время автогенерации для ${acc.handle} установлено на ${preset} ${tzInfo.abbr} (${convertLocalToMoscow(preset, userTimezone)} МСК на сервере)!`
                                  );
                                  setTimeout(() => setSuccessToast(null), 3000);
                                }
                              }}
                              disabled={acc.nightlyAuto === false}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                                (acc.autoTime || '01:00') === preset
                                  ? 'accent-btn font-bold shadow-xs'
                                  : 'bg-surface text-secondary-theme hover:bg-subtle border border-subtle'
                              } disabled:opacity-30`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Limit Reached Banner with Upgrade Prompt */}
        {isLimitReached && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-primary-theme">
                  Лимит аккаунтов на текущем тарифе исчерпан ({maxAccounts} из {maxAccounts})
                </p>
                <p className="text-[11px] text-secondary-theme mt-0.5">
                  Чтобы добавить ещё аккаунты, улучшите тарифный план до тарифа «Бизнес» или «Агентство».
                </p>
              </div>
            </div>

            {onGoToPricing && (
              <button
                type="button"
                onClick={onGoToPricing}
                className="accent-btn px-4 py-2 text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
              >
                <span>Сменить тариф</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </section>

      {/* 2. THEME SELECTION */}
      <section className="custom-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
            <Palette className="w-4 h-4 text-accent-ghost" />
            <span>{t.settings.appearanceSection}</span>
          </h2>
          <p className="text-xs text-muted-theme mt-0.5">
            {t.settings.appearanceSectionDesc}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {allThemes.map((th) => {
            const isSelected = theme === th.id;
            return (
              <div
                key={th.id}
                onClick={() => setTheme(th.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all space-y-3 ${
                  isSelected
                    ? 'border-accent ring-1 ring-accent bg-subtle'
                    : 'border-subtle bg-surface hover:border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/10"
                      style={{ backgroundColor: th.accentColor }}
                    />
                    <h3 className="text-sm font-bold text-primary-theme font-heading">
                      {th.id === 'light-rose' && t.settings.themeLightRose}
                      {th.id === 'light-mono' && t.settings.themeLightMono}
                      {th.id === 'dark-rose' && t.settings.themeDarkRose}
                      {th.id === 'dark-mono' && t.settings.themeDarkMono}
                    </h3>
                  </div>

                  {isSelected && (
                    <span className="w-5 h-5 rounded-full accent-btn text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-secondary-theme leading-normal">
                  {th.id === 'light-rose' && t.settings.themeLightRoseDesc}
                  {th.id === 'light-mono' && t.settings.themeLightMonoDesc}
                  {th.id === 'dark-rose' && t.settings.themeDarkRoseDesc}
                  {th.id === 'dark-mono' && t.settings.themeDarkMonoDesc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. APPLICATION UI LANGUAGE */}
      <section className="custom-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
            <Globe className="w-4 h-4 text-accent-ghost" />
            <span>{t.settings.languageSection}</span>
          </h2>
          <p className="text-xs text-muted-theme mt-0.5">
            {t.settings.languageSectionDesc}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {supportedLanguages.map((lang) => {
            const isSelected = language === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'border-accent bg-subtle ring-1 ring-accent'
                    : 'border-subtle bg-surface hover:border-strong'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{lang.flag}</span>
                  <span className="text-xs font-bold text-primary-theme">
                    {lang.nativeName}
                  </span>
                </div>

                {isSelected && <Check className="w-4 h-4 text-accent-ghost" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. BILLING & TARIFF DETAILS */}
      <section className="custom-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-accent-ghost" />
            <span>{t.settings.billingSection}</span>
          </h2>
          <p className="text-xs text-muted-theme mt-0.5">
            {t.settings.billingSectionDesc}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-subtle bg-subtle space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-primary-theme uppercase tracking-wider block">
                {t.settings.currentPlan}
              </span>
              <span className="text-xs text-secondary-theme">
                {currentPlanName}
              </span>
            </div>
            {onGoToPricing && (
              <button
                type="button"
                onClick={onGoToPricing}
                className="secondary-btn px-4 py-1.5 text-xs cursor-pointer font-semibold"
              >
                {t.settings.upgradePlan}
              </button>
            )}
          </div>

          <div className="pt-2 border-t border-subtle flex items-center justify-between text-xs">
            <span className="text-secondary-theme">{t.terminology.credits}:</span>
            <span className="font-mono text-base font-bold text-primary-theme">
              {availableCredits.toLocaleString(language)}
            </span>
          </div>
        </div>
      </section>

      {/* 5. TERMS OF SERVICE & PEAK LOAD SLA POLICY */}
      <section className="custom-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent-ghost" />
            <span>{t.terms.termsOfServiceTitle}</span>
          </h2>
          <p className="text-xs text-muted-theme mt-0.5">
            {t.terms.peakLoadTitle}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-subtle bg-subtle space-y-2">
          <span className="text-xs font-bold text-primary-theme block">
            {t.terms.peakLoadTitle}:
          </span>
          <p className="text-xs text-secondary-theme leading-relaxed">
            {t.terms.peakLoadNotice}
          </p>
        </div>
      </section>
    </div>
  );
};
