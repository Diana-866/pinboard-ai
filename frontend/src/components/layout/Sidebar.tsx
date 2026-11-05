import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Sparkles,
  Search,
  Users,
  Calendar,
  Layers,
  BarChart3,
  CreditCard,
  Settings,
  X,
  ShieldCheck,
  Check,
  Plus,
  ArrowUpRight,
  LogOut,
  Camera,
  Upload,
  User,
  ChevronRight,
  Sliders,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { useAuth } from '../../context/AuthContext';
import { PinPosyLogo } from '../common/PinPosyLogo';
import { PinterestAccount } from '../../data/mockData';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  accounts?: PinterestAccount[];
  activeAccountId?: string;
  onSelectAccount?: (id: string) => void;
  onAddAccountClick?: () => void;
  onGoToPricing?: () => void;
  maxAccounts?: number;
  pendingCount?: number;
}

const PRESET_AVATARS = [
  { id: 'av-1', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face', label: 'Елена (Классика)' },
  { id: 'av-2', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&crop=face', label: 'Александра' },
  { id: 'av-3', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face', label: 'Михаил' },
  { id: 'av-4', url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&h=120&fit=crop&crop=face', label: 'София' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  mobileOpen,
  onMobileClose,
  accounts = [],
  activeAccountId,
  onSelectAccount,
  onAddAccountClick,
  onGoToPricing,
  maxAccounts = 3,
  pendingCount = 0,
}) => {
  const { t } = useI18n();
  const { user, isAuthenticated, logout, updateUserAvatar, openAuthModal } = useAuth();

  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [useLetterAvatar, setUseLetterAvatar] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pinposy_use_letter_avatar') === 'true';
    } catch {
      return false;
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAccountId = activeAccountId || accounts[0]?.id;

  const isUnlimited = user?.tariff_plan === 'agency' || maxAccounts >= 99;
  const isLimitReached = !isUnlimited && accounts.length >= maxAccounts;
  const planLabel = user?.tariff_plan === 'analytics' ? t.pricing.planAnalyticsTitle
    : user?.tariff_plan === 'start' ? t.pricing.planStartTitle
      : user?.tariff_plan === 'pro' || user?.tariff_plan === 'standard' ? t.pricing.planProTitle
        : user?.tariff_plan === 'agency' ? t.pricing.planAgencyTitle : t.settings?.noActivePlan || t.nav.planLabel;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const resultUrl = uploadEvent.target?.result as string;
        if (resultUrl) {
          updateUserAvatar(resultUrl);
          setUseLetterAvatar(false);
          try {
            localStorage.setItem('pinposy_use_letter_avatar', 'false');
          } catch {
            // ignore
          }
          setAvatarModalOpen(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectPreset = (url: string) => {
    updateUserAvatar(url);
    setUseLetterAvatar(false);
    try {
      localStorage.setItem('pinposy_use_letter_avatar', 'false');
    } catch {
      // ignore
    }
    setAvatarModalOpen(false);
  };

  const handleSetLetterMode = () => {
    setUseLetterAvatar(true);
    try {
      localStorage.setItem('pinposy_use_letter_avatar', 'true');
    } catch {
      // ignore
    }
    setAvatarModalOpen(false);
  };

  // Determine avatar initial letter
  const userInitial = (user?.name?.trim()?.[0] || 'E').toUpperCase();

  interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }

  const navItems: NavItem[] = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'generator', label: t.nav.pinGenerator, icon: Sparkles },
    {
      id: 'review',
      label: t.nav.reviewPins,
      icon: CheckSquare,
      badge: pendingCount && pendingCount > 0 ? String(pendingCount) : undefined,
    },
    { id: 'keywords', label: t.nav.keywordResearch, icon: Search },
    { id: 'competitors', label: t.nav.competitorAudit, icon: Users },
    { id: 'calendar', label: t.nav.calendar, icon: Calendar },
    { id: 'boards', label: t.nav.boards, icon: Layers },
    { id: 'analytics', label: t.nav.analytics, icon: BarChart3 },
    { id: 'pricing', label: t.nav.pricing, icon: CreditCard },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* Sidebar container - Sticky and fixed in viewport */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-surface border-r border-subtle z-40 flex flex-col h-screen shrink-0 transition-transform duration-200 ease-out md:sticky md:top-0 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Area */}
        <div className="h-16 shrink-0 px-5 flex items-center justify-between border-b border-subtle">
          <div className="flex items-center gap-2.5">
            <PinPosyLogo size={34} />
          </div>

          <button
            onClick={onMobileClose}
            className="md:hidden p-1.5 rounded-lg text-secondary-theme hover:bg-subtle cursor-pointer"
            aria-label={t.common.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto min-h-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  if (mobileOpen) onMobileClose();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs md:text-sm font-medium transition-all cursor-pointer text-left ${
                  isActive
                    ? 'accent-btn shadow-xs font-semibold'
                    : 'text-secondary-theme hover:bg-subtle hover:text-primary-theme'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-inherit' : 'text-muted-theme'}`} />
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isActive
                      ? 'accent-btn text-white'
                      : 'bg-subtle text-secondary-theme border border-subtle'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* LOWER SECTION: USER PROFILE & PINTEREST ACCOUNTS (User requirement) */}
        <div className="shrink-0 p-3 border-t border-subtle bg-subtle/30 space-y-3">
          {/* 1. USER PROFILE CARD (Сверху картинка / буква, тариф, email, выйти из аккаунта) */}
          <div className="p-2.5 rounded-2xl bg-surface border border-subtle shadow-xs space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* User Avatar: Either image or Letter initial (user-configurable) */}
                <div className="relative group shrink-0">
                  <button
                    type="button"
                    onClick={() => setAvatarModalOpen(true)}
                    className="w-10 h-10 rounded-xl overflow-hidden border border-subtle focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer flex items-center justify-center transition-transform hover:scale-105"
                    title={t.nav.avatarClickTitle}
                  >
                    {!useLetterAvatar && user?.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full accent-btn text-white font-heading font-bold text-base flex items-center justify-center">
                        {userInitial}
                      </div>
                    )}
                  </button>

                  {/* Camera icon indicator on hover */}
                  <button
                    type="button"
                    onClick={() => setAvatarModalOpen(true)}
                    className="absolute -bottom-1 -right-1 p-1 rounded-full bg-surface border border-subtle text-primary-theme shadow-xs opacity-80 hover:opacity-100 cursor-pointer"
                    title={t.nav.configureAvatar}
                  >
                    <Camera className="w-2.5 h-2.5 text-accent-ghost" />
                  </button>
                </div>

                {/* User name & email */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-primary-theme truncate">
                      {user?.name || t.nav.userProfile}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-theme font-mono truncate">
                    {user?.email || ''}
                  </p>
                </div>
              </div>

              {/* Logout button */}
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={logout}
                  className="p-1.5 rounded-lg text-muted-theme hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                  title={t.nav.logout}
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Plan Badge & Switch Plan */}
            <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-subtle text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-theme uppercase font-semibold">{t.nav.planLabel}</span>
                <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[10px] accent-pill text-accent-ghost">
                  {planLabel}
                </span>
                {isUnlimited && (
                  <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    (∞ {t.nav.unlimited})
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (onGoToPricing) onGoToPricing();
                  else onTabChange('pricing');
                }}
                className="text-[10px] text-accent-ghost font-semibold hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>{t.nav.plans}</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* 2. CONNECTED PINTEREST ACCOUNTS SECTION (1 из 3 / Безлимитно, клик перебрасывает в настройки) */}
          <div className="p-2.5 rounded-2xl bg-surface border border-subtle shadow-xs space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold text-primary-theme uppercase tracking-wider font-heading flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-accent-ghost" />
                <span>{t.nav.pinterestAccounts}</span>
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                isUnlimited
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-subtle text-primary-theme'
              }`}>
                {isUnlimited ? `∞ ${t.nav.unlimited}` : t.nav.accountCountTemplate.replace('{count}', String(accounts.length)).replace('{max}', String(maxAccounts))}
              </span>
            </div>

            {/* List of Connected Accounts */}
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {accounts.map((acc) => {
                const isSelected = acc.id === selectedAccountId;
                return (
                  <button
                    key={acc.id}
                    onClick={() => {
                      if (onSelectAccount) onSelectAccount(acc.id);
                      // Exact user request: clicking a specific account redirects to settings of that account
                      onTabChange('settings');
                    }}
                    className={`w-full p-2 rounded-xl text-left flex items-center justify-between gap-2 transition-all cursor-pointer group ${
                      isSelected
                        ? 'bg-subtle ring-1 ring-accent border border-accent/40 shadow-2xs'
                        : 'hover:bg-subtle/80 border border-transparent'
                    }`}
                    title={`${t.nav.settings}: ${acc.name}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={acc.avatar}
                          alt={acc.name}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-full object-cover border border-subtle"
                        />
                        <span
                          className={`w-2 h-2 rounded-full absolute -bottom-0.5 -right-0.5 border border-surface ${
                            isSelected ? 'bg-emerald-500 ring-2 ring-emerald-500/30' : 'bg-zinc-400'
                          }`}
                          title={t.nav.syncStatus}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-primary-theme truncate group-hover:text-accent-ghost transition-colors">
                          {acc.name}
                        </p>
                        <p className="text-[10px] text-muted-theme truncate font-mono">
                          {acc.handle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-accent-ghost stroke-[3]" />
                      )}
                      <Sliders className="w-3 h-3 text-muted-theme group-hover:text-primary-theme opacity-60 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Connect Account Button */}
            <div className="pt-1 border-t border-subtle">
              {!isLimitReached ? (
                <button
                  type="button"
                  onClick={() => {
                    if (onAddAccountClick) onAddAccountClick();
                    else onTabChange('settings');
                  }}
                  className="w-full py-1.5 px-2 rounded-xl text-xs font-semibold text-primary-theme hover:bg-subtle flex items-center justify-center gap-1.5 cursor-pointer transition-colors border border-dashed border-subtle hover:border-accent"
                  title={t.nav.connectPinterestAccount}
                >
                  <Plus className="w-3.5 h-3.5 text-accent-ghost" />
                  <span>{t.nav.connectAccount}</span>
                </button>
              ) : (
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-700 dark:text-amber-300 flex items-center justify-between gap-1">
                  <span>{t.nav.accountLimitTemplate.replace('{count}', String(maxAccounts)).replace('{max}', String(maxAccounts))}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (onGoToPricing) onGoToPricing();
                      else onTabChange('pricing');
                    }}
                    className="font-bold underline cursor-pointer"
                  >
                    {t.nav.removeLimit}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* AVATAR CUSTOMIZATION MODAL (User requirement: letter initial or custom image upload) */}
      {avatarModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-sm bg-surface border border-strong rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-accent-ghost" />
                <h3 className="text-sm font-bold text-primary-theme font-heading">
                  {t.nav.avatarModalTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAvatarModalOpen(false)}
                className="p-1 rounded-lg text-muted-theme hover:text-primary-theme hover:bg-subtle cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Avatar Preview */}
            <div className="flex flex-col items-center justify-center gap-2 py-2">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-accent shadow-md flex items-center justify-center">
                {!useLetterAvatar && user?.avatar ? (
                  <img src={user.avatar} alt={t.nav.currentAvatarAlt} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full accent-btn text-white font-heading font-bold text-2xl flex items-center justify-center">
                    {userInitial}
                  </div>
                )}
              </div>
              <p className="text-xs font-semibold text-primary-theme">
                {useLetterAvatar ? t.nav.avatarLetterTemplate.replace('{letter}', userInitial) : t.nav.customPhoto}
              </p>
            </div>

            {/* Action 1: Upload custom image */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-secondary-theme block uppercase tracking-wider">
                {t.nav.uploadCustomImage}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 rounded-xl border border-subtle bg-subtle hover:bg-surface text-xs font-semibold text-primary-theme flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
              >
                <Upload className="w-3.5 h-3.5 text-accent-ghost" />
                <span>{t.nav.chooseFile}</span>
              </button>
            </div>

            {/* Action 2: Choose Letter Initial Avatar */}
            <div className="space-y-2 pt-2 border-t border-subtle">
              <label className="text-[11px] font-bold text-secondary-theme block uppercase tracking-wider">
                {t.nav.useNameInitial}
              </label>
              <button
                type="button"
                onClick={handleSetLetterMode}
                className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  useLetterAvatar
                    ? 'accent-btn shadow-xs'
                    : 'border-subtle bg-subtle hover:bg-surface text-primary-theme'
                }`}
              >
                <div className="w-5 h-5 rounded-md accent-btn text-white text-[11px] font-bold flex items-center justify-center">
                  {userInitial}
                </div>
                <span>{t.nav.useInitialAvatar.replace('{letter}', userInitial)}</span>
              </button>
            </div>

            {/* Action 3: Choose from preset avatars */}
            <div className="space-y-2 pt-2 border-t border-subtle">
              <label className="text-[11px] font-bold text-secondary-theme block uppercase tracking-wider">
                {t.nav.choosePresetAvatar}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {PRESET_AVATARS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p.url)}
                    className="p-1 rounded-xl border border-subtle hover:border-accent hover:scale-105 transition-all cursor-pointer group"
                    title={p.label}
                  >
                    <img
                      src={p.url}
                      alt={p.label}
                      className="w-12 h-12 rounded-lg object-cover mx-auto"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

