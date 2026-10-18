import React, { useState } from 'react';
import {
  Palette,
  Globe,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Check,
  RefreshCw,
  ExternalLink,
  Plus,
  AlertCircle,
  ArrowUpRight,
  Trash2,
  Sliders,
  CheckCircle2,
  Lock,
  Clock,
} from 'lucide-react';
import { useTheme } from '../../theme/themeContext';
import { useI18n } from '../../i18n/i18nContext';
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

  const [userTimezone, setUserTimezone] = useState<string>(() => getDefaultTimezone(language));
  const [currentPlanName] = useState('Старт');
  const [showAddModal, setShowAddModal] = useState(false);
  const [connectTab, setConnectTab] = useState<'oauth' | 'token'>('oauth');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Manual input fields for real business account
  const [businessName, setBusinessName] = useState('');
  const [businessHandle, setBusinessHandle] = useState('');
  const [businessToken, setBusinessToken] = useState('');
  const [businessNiche, setBusinessNiche] = useState('Home Decor & Aesthetic Living');

  const isLimitReached = accounts.length >= maxAccounts;

  // Handle OAuth flow
  // Этап 1.1 (planning.md): фейковое OAuth удалено — ревьюер Pinterest не должен видеть выдуманные данные.
  // Настоящее подключение добавим после одобрения заявки на Pinterest API (Этап 6).
  const handleStartOAuth = () => {
    setIsAuthorizing(true);
    setTimeout(() => {
      setIsAuthorizing(false);
      setShowAddModal(false);
      setSuccessToast('Подключение Pinterest появится после одобрения доступа к API. Функция сейчас в разработке.');
      setTimeout(() => setSuccessToast(null), 4000);
    }, 600);
  };

  // Handle Token flow
  // Этап 1.1 (planning.md): фейковое подключение по токену удалено по той же причине.
  const handleSaveTokenAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setShowAddModal(false);
    setSuccessToast('Подключение Pinterest появится после одобрения доступа к API. Функция сейчас в разработке.');
    setTimeout(() => setSuccessToast(null), 4000);
  };

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

      {/* Success Notification */}
      {successToast && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-xs md:text-sm font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successToast}</span>
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
                Подключено {accounts.length} из {maxAccounts} аккаунтов
              </span>
            </div>
            <p className="text-xs text-muted-theme mt-1">
              Бизнес-аккаунты Pinterest, к которым у вас есть доступ для аналитики, парсинга досок и авто-выкладки.
            </p>
          </div>

          {!isLimitReached && (
            <button
              onClick={() => setShowAddModal(true)}
              className="accent-btn self-start sm:self-auto px-4 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Подключить ещё аккаунт</span>
            </button>
          )}
        </div>

        {/* List of Connected Accounts */}
        <div className="space-y-3">
          {accounts.map((acc) => {
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

        {/* Real Pinterest Business Connection Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="p-6 rounded-2xl custom-card shadow-2xl max-w-lg w-full space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-accent-ghost" />
                  <h3 className="text-base font-bold text-primary-theme font-heading">
                    Подключение вашего бизнес-аккаунта Pinterest
                  </h3>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-muted-theme hover:text-primary-theme cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              {/* Mode Tabs: OAuth vs Token */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-subtle border border-subtle text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setConnectTab('oauth')}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    connectTab === 'oauth'
                      ? 'accent-btn shadow-xs'
                      : 'text-secondary-theme hover:text-primary-theme'
                  }`}
                >
                  Pinterest OAuth (Рекомендуется)
                </button>
                <button
                  type="button"
                  onClick={() => setConnectTab('token')}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    connectTab === 'token'
                      ? 'accent-btn shadow-xs'
                      : 'text-secondary-theme hover:text-primary-theme'
                  }`}
                >
                  API-токен / Реквизиты
                </button>
              </div>

              {/* Tab 1: Official Pinterest OAuth */}
              {connectTab === 'oauth' && (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-xl border border-subtle bg-subtle space-y-2">
                    <span className="font-bold text-primary-theme block">
                      Безопасная авторизация через официальный Pinterest API:
                    </span>
                    <ul className="space-y-1 text-secondary-theme text-[11px]">
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Чтение досок и аналитики охвата (boards:read, analytics:read)</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Автоматическая публикация согласованных пинов (pins:write)</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-primary-theme" />
                        <span>Полная изоляция данных. Пароли не сохраняются.</span>
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <label className="font-bold text-primary-theme block">
                      Название вашего бренда / профиля (для отображения в панели):
                    </label>
                    <input
                      type="text"
                      placeholder="Например: My Studio Interiors"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-3 py-2 border border-subtle bg-app-input rounded-xl text-xs text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-bold text-primary-theme block">
                      Pinterest Handle вашего бизнес-аккаунта (@...):
                    </label>
                    <input
                      type="text"
                      placeholder="@my_official_brand"
                      value={businessHandle}
                      onChange={(e) => setBusinessHandle(e.target.value)}
                      className="w-full px-3 py-2 border border-subtle bg-app-input rounded-xl text-xs font-mono text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-bold text-primary-theme block">
                      Основная ниша профиля:
                    </label>
                    <select
                      value={businessNiche}
                      onChange={(e) => setBusinessNiche(e.target.value)}
                      className="w-full px-3 py-2 border border-subtle bg-app-input rounded-xl text-xs text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="Home Decor & Japandi">Home Decor & Japandi Design</option>
                      <option value="Culinary & Matcha">Recipes & Food Photography</option>
                      <option value="Skincare & Beauty">Skincare & Luxury Beauty</option>
                      <option value="Travel & Architecture">Travel & European Escapes</option>
                      <option value="Fashion & Aesthetics">Fashion & Capsule Wardrobe</option>
                    </select>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="secondary-btn px-4 py-2 text-xs font-semibold cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={isAuthorizing}
                      onClick={handleStartOAuth}
                      className="accent-btn px-4 py-2 text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isAuthorizing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Подключение к Pinterest...</span>
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Авторизовать в Pinterest</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Access Token Form */}
              {connectTab === 'token' && (
                <form onSubmit={handleSaveTokenAccount} className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-primary-theme block mb-1">
                      Название аккаунта:
                    </label>
                    <input
                      type="text"
                      placeholder="My Brand Official"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-3 py-2 border border-subtle bg-app-input rounded-xl text-xs text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-primary-theme block mb-1">
                      Handle (@...):
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="@my_official_brand"
                      value={businessHandle}
                      onChange={(e) => setBusinessHandle(e.target.value)}
                      className="w-full px-3 py-2 border border-subtle bg-app-input rounded-xl text-xs font-mono text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-primary-theme block mb-1 flex items-center gap-1">
                      <span>Access Token (Developers Pinterest):</span>
                      <Lock className="w-3 h-3 text-muted-theme" />
                    </label>
                    <input
                      type="password"
                      placeholder="pina_09f8d..."
                      value={businessToken}
                      onChange={(e) => setBusinessToken(e.target.value)}
                      className="w-full px-3 py-2 border border-subtle bg-app-input rounded-xl text-xs font-mono text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <span className="text-[10px] text-muted-theme mt-1 block">
                      Токен шифруется и хранится в изолированной сессии браузера.
                    </span>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="secondary-btn px-4 py-2 text-xs font-semibold cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="accent-btn px-4 py-2 text-xs font-bold cursor-pointer shadow-xs"
                    >
                      Подключить по токену
                    </button>
                  </div>
                </form>
              )}
            </div>
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
                Тариф «{currentPlanName}» · 1 990 ₽ ($24,0) / мес · до {maxAccounts} бизнес-аккаунтов
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
            <span className="text-secondary-theme">Кредитов доступно:</span>
            <span className="font-mono text-base font-bold text-primary-theme">
              840 кредитов
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
