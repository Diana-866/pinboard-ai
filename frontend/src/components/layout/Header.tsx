import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Globe,
  Palette,
  ChevronDown,
  Check,
  Plus,
  Bell,
  Clock,
  CheckCircle2,
  Loader2,
  Bot,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { useTheme } from '../../theme/themeContext';
import { useI18n, AI_CONTENT_LANGUAGES } from '../../i18n/i18nContext';
import { useNotifications, TaskStatus } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { ThemeMode } from '../../theme/types';
import { SupportedLanguage } from '../../i18n/types';

interface HeaderProps {
  activeTab: string;
  onNewPinClick: () => void;
  onMobileMenuToggle: () => void;
  onNavigateTab?: (tab: string) => void;
  onOpenBot?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onNewPinClick,
  onMobileMenuToggle,
  onNavigateTab,
  onOpenBot,
}) => {
  const { theme, setTheme, allThemes } = useTheme();
  const { user } = useAuth();
  const { language, setLanguage, t, supportedLanguages } = useI18n();
  const {
    notifications,
    unreadCount,
    activeQueueCount,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'queue'>('all');

  const themeRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (themeRef.current && !themeRef.current.contains(target)) {
        setThemeDropdownOpen(false);
      }
      if (langRef.current && !langRef.current.contains(target)) {
        setLangDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const getModuleTitle = () => {
    switch (activeTab) {
      case 'dashboard': return t.nav.dashboard;
      case 'generator': return t.nav.pinGenerator;
      case 'keywords': return t.nav.keywordResearch;
      case 'calendar': return t.nav.calendar;
      case 'boards': return t.nav.boards;
      case 'analytics': return t.nav.analytics;
      case 'pricing': return t.nav.pricing;
      case 'settings': return t.nav.settings;
      case 'review': return t.nav.reviewPins;
      default: return t.nav.dashboard;
    }
  };

  return (
    <header className="h-16 px-4 md:px-6 flex items-center justify-between border-b border-subtle bg-surface sticky top-0 z-30 transition-colors">
      {/* Zone 1 & 2: Breadcrumb / Mobile hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuToggle}
          className="md:hidden p-2 rounded-lg text-secondary-theme hover:bg-subtle transition-colors"
          aria-label={t.nav.openNavigationMenu}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-primary-theme tracking-tight font-heading truncate max-w-[160px] md:max-w-none">
            {getModuleTitle()}
          </span>
        </div>
      </div>

      {/* Zone 3: Controls (Credits, Theme, Language, Primary CTA) */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Credits Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono tabular-nums bg-subtle border border-subtle text-secondary-theme">
          <Sparkles className="w-3.5 h-3.5 text-accent-ghost" />
          <span className="font-semibold text-primary-theme">{user?.credits_balance ?? 0}</span>
          <span className="text-muted-theme font-sans text-[11px]">{t.nav.creditsLeft}</span>
        </div>

        {/* Notifications & Queue Bell (User requested notification center with queue status) */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setNotifDropdownOpen(!notifDropdownOpen);
              setThemeDropdownOpen(false);
              setLangDropdownOpen(false);
            }}
            className="relative p-2 rounded-lg text-secondary-theme hover:text-primary-theme hover:bg-subtle border border-subtle transition-colors cursor-pointer"
            title={t.notifications.bellTitle}
            aria-label={t.notifications.bellTitle}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold accent-btn text-white shadow-xs">
                {unreadCount}
              </span>
            )}
            {activeQueueCount > 0 && unreadCount === 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            )}
          </button>

          {notifDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-surface border border-strong rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[460px]">
              {/* Header */}
              <div className="p-3.5 border-b border-subtle bg-subtle/50 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-primary-theme font-heading">
                    {t.notifications.title}
                  </h4>
                  <p className="text-[10px] text-muted-theme">
                    {activeQueueCount > 0
                      ? t.notifications.smartQueueCount.replace('{count}', String(activeQueueCount))
                      : t.notifications.allTasksSynced}
                  </p>
                </div>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="text-[11px] font-semibold text-accent-ghost hover:underline cursor-pointer"
                  >
                    {t.notifications.markAllRead}
                  </button>
                )}
              </div>

              {/* Filters: All vs Queue */}
              <div className="px-3 py-1.5 border-b border-subtle bg-surface flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setNotifFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                    notifFilter === 'all'
                      ? 'bg-subtle text-primary-theme font-bold border border-subtle'
                      : 'text-secondary-theme hover:text-primary-theme'
                  }`}
                >
                  {t.notifications.filterAll} ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifFilter('queue')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    notifFilter === 'queue'
                      ? 'bg-subtle text-primary-theme font-bold border border-subtle'
                      : 'text-secondary-theme hover:text-primary-theme'
                  }`}
                >
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span>{t.notifications.filterQueue} ({activeQueueCount})</span>
                </button>
              </div>

              {/* Notifications List */}
              <div className="flex-1 overflow-y-auto divide-y divide-subtle">
                {notifications
                  .filter((item) => (notifFilter === 'queue' ? item.status !== 'ready' : true))
                  .map((item) => {
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          markAsRead(item.id);
                          if (item.actionTab && onNavigateTab) {
                            onNavigateTab(item.actionTab);
                            setNotifDropdownOpen(false);
                          }
                        }}
                        className={`p-3 text-xs transition-colors cursor-pointer hover:bg-subtle flex items-start gap-2.5 ${
                          !item.isRead ? 'bg-accent/5' : ''
                        }`}
                      >
                        {/* Status Icon */}
                        <div className="mt-0.5 shrink-0">
                          {item.status === 'queued' ? (
                            <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                              <Clock className="w-3.5 h-3.5" />
                            </div>
                          ) : item.status === 'in_progress' ? (
                            <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-primary-theme truncate">
                              {item.title}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider ${
                                item.status === 'queued'
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : item.status === 'in_progress'
                                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {item.status === 'queued'
                                ? t.notifications.statusQueued
                                : item.status === 'in_progress'
                                ? t.notifications.statusInProgress
                                : t.notifications.statusReady}
                            </span>
                          </div>

                          <p className="text-[11px] text-secondary-theme leading-relaxed">
                            {item.message}
                          </p>

                          <div className="flex items-center justify-between pt-1 text-[10px] text-muted-theme">
                            <span>{item.timestamp}</span>
                            {item.actionTab && (
                              <span className="text-accent-ghost font-medium hover:underline flex items-center gap-0.5">
                                <span>{t.notifications.viewResult}</span>
                                <span>→</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {notifications.filter((item) =>
                  notifFilter === 'queue' ? item.status !== 'ready' : true
                ).length === 0 && (
                  <div className="p-8 text-center text-xs text-muted-theme">
                    {t.notifications.empty}
                  </div>
                )}
              </div>

              {/* Bot Quick Help Link Footer */}
              {onOpenBot && (
                <div className="p-2.5 bg-subtle border-t border-subtle flex items-center justify-between text-xs">
                  <span className="text-secondary-theme text-[11px] flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-accent-ghost" />
                    <span>{t.notifications.strategistPrompt}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenBot();
                      setNotifDropdownOpen(false);
                    }}
                    className="text-[11px] font-bold accent-ghost hover:underline cursor-pointer"
                  >
                    {t.notifications.askStrategist}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Theme Selector */}
        <div className="relative" ref={themeRef}>
          <button
            onClick={() => {
              setThemeDropdownOpen(!themeDropdownOpen);
              setLangDropdownOpen(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-secondary-theme hover:text-primary-theme hover:bg-subtle border border-subtle transition-colors"
            title={t.nav.switchTheme}
            aria-expanded={themeDropdownOpen}
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t.nav.switchTheme}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {themeDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-52 py-1 bg-surface border border-strong rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-theme uppercase tracking-wider">
                {t.settings.appearanceSection}
              </div>
              {allThemes.map((th) => (
                <button
                  key={th.id}
                  onClick={() => {
                    setTheme(th.id);
                    setThemeDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                    theme === th.id
                      ? 'bg-subtle text-primary-theme font-semibold'
                      : 'text-secondary-theme hover:bg-subtle hover:text-primary-theme'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border shadow-xs"
                      style={{
                        backgroundColor: th.accentColor,
                        borderColor: th.borderPreview,
                      }}
                    />
                    <span>
                      {th.id === 'light-rose' && t.settings.themeLightRose}
                      {th.id === 'light-mono' && t.settings.themeLightMono}
                      {th.id === 'dark-rose' && t.settings.themeDarkRose}
                      {th.id === 'dark-mono' && t.settings.themeDarkMono}
                    </span>
                  </div>
                  {theme === th.id && <Check className="w-3.5 h-3.5 text-accent-ghost" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Language Selector */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => {
              setLangDropdownOpen(!langDropdownOpen);
              setThemeDropdownOpen(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-secondary-theme hover:text-primary-theme hover:bg-subtle border border-subtle transition-colors"
            title={t.settings.languageSection}
            aria-expanded={langDropdownOpen}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="font-semibold uppercase tracking-wider">{language}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {langDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-44 py-1 bg-surface border border-strong rounded-xl shadow-xl z-50 max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-theme uppercase tracking-wider">
                {t.settings.languageSection}
              </div>
              {supportedLanguages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setLangDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                    language === lang.code
                      ? 'bg-subtle text-primary-theme font-semibold'
                      : 'text-secondary-theme hover:bg-subtle hover:text-primary-theme'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{lang.flag}</span>
                    <span>{lang.nativeName}</span>
                  </div>
                  {language === lang.code && <Check className="w-3.5 h-3.5 text-accent-ghost" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AI Strategist Quick Launch in Header */}
        {onOpenBot && (
          <button
            onClick={onOpenBot}
            className="p-2 rounded-lg text-secondary-theme hover:text-primary-theme hover:bg-subtle border border-subtle transition-colors cursor-pointer hidden xs:flex items-center"
            title={t.notifications.strategistTitle}
          >
            <Bot className="w-4 h-4 text-accent-ghost" />
          </button>
        )}

        {/* Primary Action Button */}
        <button
          onClick={onNewPinClick}
          className="accent-btn px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.dashboard.generateBatch}</span>
        </button>
      </div>
    </header>
  );
};
