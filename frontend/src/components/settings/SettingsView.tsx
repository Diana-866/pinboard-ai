import React, { useState } from 'react';
import {
  Palette,
  Globe,
  CreditCard,
  Check,
  Clock,
} from 'lucide-react';
import { useTheme } from '../../theme/themeContext';
import { useI18n } from '../../i18n/i18nContext';
import { useAuth } from '../../context/AuthContext';
import { PinterestAccount } from '../../data/mockData';
import {
  getDefaultTimezone,
  saveUserTimezone,
  SUPPORTED_TIMEZONES,
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
  onPinterestStatusChange?: (status: { configured: boolean; account_limit?: number | null; accounts?: Array<{ id: string; username?: string | null; pinterest_user_id?: string | null; needs_reauth?: boolean }> }) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onGoToPricing, onPinterestStatusChange }) => {
  const { theme, setTheme, allThemes } = useTheme();
  const { language, setLanguage, t, supportedLanguages } = useI18n();
  const { user } = useAuth();

  const [userTimezone, setUserTimezone] = useState<string>(() => getDefaultTimezone(language));
  const planId = user?.tariff_plan || 'none';
  const currentPlanName = user?.subscription_active === false || planId === 'none'
    ? t.settings.noActivePlan
    : planId === 'analytics' ? t.pricing.planAnalyticsTitle
      : planId === 'start' ? t.pricing.planStartTitle
        : planId === 'pro' ? t.pricing.planProTitle
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

      <PinterestCard onAccountsChanged={onPinterestStatusChange} />

      {/* TIME ZONE */}
      <section className="custom-card p-6 space-y-3">
        <div>
          <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent-ghost" />
            <span>{t.settings.timezoneSection}</span>
          </h2>
          <p className="text-xs text-muted-theme mt-0.5">{t.settings.timezoneSectionDesc}</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <select
            value={userTimezone}
            onChange={(event) => {
              const nextTimezone = event.target.value;
              setUserTimezone(nextTimezone);
              saveUserTimezone(nextTimezone);
            }}
            className="w-full sm:max-w-md rounded-xl border border-subtle bg-surface px-3 py-2 text-sm text-primary-theme"
            aria-label={t.settings.timezoneSection}
          >
            {!SUPPORTED_TIMEZONES.some((zone) => zone.value === userTimezone) && (
              <option value={userTimezone}>{userTimezone}</option>
            )}
            {SUPPORTED_TIMEZONES.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {language === 'ru' ? zone.nameRu : zone.nameEn}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-theme">{t.settings.timezoneAutoDetected}</span>
        </div>
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
