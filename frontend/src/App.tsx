/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { getDefaultTimezone, localDateTimeToDate, formatInstantInTimezone } from './utils/timezone';
import { apiRequest } from './lib/api';
import { ThemeProvider } from './theme/themeContext';
import { I18nProvider, useI18n } from './i18n/i18nContext';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { FloatingStrategistBot } from './components/bot/FloatingStrategistBot';
import { AdminPanel } from './components/admin/AdminPanel';
import { PrivacyPolicyModal } from './components/auth/PrivacyPolicyModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { PinGenerator } from './components/pins/PinGenerator';
import { KeywordExplorer } from './components/keywords/KeywordExplorer';
import { CompetitorAudit } from './components/competitors/CompetitorAudit';
import { PublishingCalendar } from './components/calendar/PublishingCalendar';
import { BoardsManager } from './components/boards/BoardsManager';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { PricingView } from './components/pricing/PricingView';
import { SettingsView } from './components/settings/SettingsView';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { LockedSection } from './components/common/LockedSection';
import {
  ManualApprovalDesk,
  PendingReviewPin,
} from './components/review/ManualApprovalDesk';
import {
  BoardItem,
  ScheduledPinItem,
  PinterestAccount,
} from './data/mockData';

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Register } from './pages/Register';
import { VerifyEmail } from './pages/VerifyEmail';
import { CheckEmail } from './pages/CheckEmail';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { Contacts } from './pages/Contacts';
import { EmailVerifyBanner } from './components/auth/EmailVerifyBanner';

const MainApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [scheduledPins, setScheduledPins] = useState<ScheduledPinItem[]>([]);
  const [prefilledTopic, setPrefilledTopic] = useState<string>('');
  const [prefilledDate, setPrefilledDate] = useState<string>('');
  const [isBotOpen, setIsBotOpen] = useState<boolean>(false);

  const { toast, clearToast } = useNotifications();
  const { aiContentLanguage } = useI18n();
  const { refreshUser } = useAuth();
 const { activeViewMode, setActiveViewMode, isPrivacyModalOpen, closePrivacyModal, isAdmin, user } = useAuth();

  // Доски загружаются из API, а не из демонстрационного массива браузера.
  React.useEffect(() => {
    let cancelled = false;
    async function loadBoards() {
      if (!user?.id) {
        setBoards([]);
        return;
      }
      try {
        const rows = await apiRequest('/boards');
        if (cancelled) return;
        const mapped: BoardItem[] = (Array.isArray(rows) ? rows : []).map((row: any) => ({
          id: String(row.id),
          name: row.title || 'Без названия',
          category: row.projects?.niche || row.description || 'Без категории',
          pinCount: 0,
          monthlyViews: 0,
          seoScore: 0,
          missingKeywords: [],
          targetWeeklyPins: 7,
          coverImage: '/src/assets/images/pin_home_decor_1790670043705.jpg',
        }));
        setBoards(mapped);
      } catch (error) {
        console.error('[boards] Не удалось загрузить доски:', error);
        if (!cancelled) setBoards([]);
      } finally {
      }
    }
    loadBoards();
    return () => { cancelled = true; };
  }, [user?.id]);



  // Расписание загружается из БД; демонстрационные публикации не показываем.
  React.useEffect(() => {
    let cancelled = false;
    async function loadSchedule() {
      if (!user?.id) {
        setScheduledPins([]);
        return;
      }
      try {
        const rows = await apiRequest('/schedule');
        if (cancelled) return;
        const mapped: ScheduledPinItem[] = (Array.isArray(rows) ? rows : []).map((row: any) => {
          const date = new Date(row.scheduled_at);
          const local = formatInstantInTimezone(date, getDefaultTimezone());
          return {
            id: String(row.id),
            pinId: String(row.pin_id),
            title: row.pins?.title || 'Без названия',
            boardId: String(row.pins?.board_id || ''),
            boardName: row.pins?.boards?.title || 'Без доски',
            imageUrl: row.pins?.image_url || '',
            scheduledDate: local.date,
            scheduledTime: local.time,
            status: row.status === 'published' ? 'published' : row.status === 'failed' ? 'failed' : row.status === 'publishing' ? 'publishing' : row.status === 'unknown' ? 'unknown' : 'scheduled',
            destinationUrl: row.destination_url || '',
            pinterestBoardId: row.pinterest_board_id || undefined,
            isOptimalSlot: false,
          };
        });
        setScheduledPins(mapped);
      } catch (error) {
        console.error('[schedule] Не удалось загрузить расписание:', error);
        if (!cancelled) setScheduledPins([]);
      }
    }
    loadSchedule();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Тарифные «замочки»: генерацию и разделы открывают Старт/Про/Agency;
  // тариф «Аналитика» (990₽) и «нет тарифа» оставляют замочки (миграция 004)
  const tariffPlan = user?.tariff_plan || 'none';
  // Тариф «standard» — старое имя «Про» (алиас миграции 004). Считаем его активным.
  // Алиас 'standard' — старое имя тарифа «Про» в ранних данных (миграция 004)
  const normalizedPlan = (tariffPlan as string) === 'standard' ? 'pro' : tariffPlan;
  // subscription_active приходит из /me (миграция 006): false, если оплаченный период истёк.
  // Если поле не пришло (старый бэкенд) — доверяем самому tariff_plan.
  const subscriptionActive = user?.subscription_active !== false;
  const isTariffUnlocked =
    subscriptionActive && ['start', 'pro', 'agency'].includes(normalizedPlan);
  const isSectionLocked = !isTariffUnlocked && activeTab !== 'analytics' && activeTab !== 'pricing';

  // Возврат со страницы оплаты Prodamus: ?payment=success (urlSuccess в billing.js).
  // Вебхук и редирект идут параллельно, поэтому обновляем /me несколько раз:
  // 0 c, 3 c, 8 c, 15 c — замочки снимаются, как только Prodamus подтвердит платёж.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'success') return;
    const timers = [0, 3000, 8000, 15000].map((ms) =>
      window.setTimeout(() => {
        refreshUser().catch(() => {});
      }, ms)
    );
    // Чистим query, чтобы обновление страницы не запускало опрос заново
    const url = new URL(window.location.href);
    url.searchParams.delete('payment');
    window.history.replaceState({}, '', url.toString());
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [refreshUser]);

  // Онбординг: визард показываем, пока пользователь его не прошёл
  const needsOnboarding = !!user && user.onboarded === false;

  // Событие от визарда/оверлея: перейти в раздел (например, «Тарифы»)
  React.useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail;
      if (tab) {
        setActiveTab(tab);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('pinposy:navigate-tab', handler);
    return () => window.removeEventListener('pinposy:navigate-tab', handler);
  }, []);

  // Dedicated /admin URL route detection (User request: only accessible via domain/admin)
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return path.startsWith('/admin') || path.startsWith('/app/admin') || hash === '#admin';
  });

  React.useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      setIsAdminRoute(path.startsWith('/admin') || path.startsWith('/app/admin') || hash === '#admin');
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  const handleBackToPublicSite = () => {
    if (window.location.pathname.toLowerCase().startsWith('/admin')) {
      window.history.pushState(null, '', '/');
    }
    if (window.location.hash.toLowerCase() === '#admin') {
      window.location.hash = '';
    }
    setIsAdminRoute(false);
    setActiveViewMode('client');
  };

  // Pinterest Accounts state (User requested fix: "ботаника Nordic подключена 1 из 3")
  // Pinterest OAuth is not available yet: never seed a fictional connected account.
  const [accounts, setAccounts] = useState<PinterestAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const [maxAccounts] = useState<number>(3); // Plan: Start allows up to 3 accounts

  // Synchronized Pending Review Pins queue (Shared between Dashboard, Calendar, Sidebar & ManualApprovalDesk)
  // No review items are loaded until real generated pins are queued.
  const [pendingReviewPins, setPendingReviewPins] = useState<PendingReviewPin[]>([]);

  React.useEffect(() => {
    // Remove demo account/review data left by older client builds.
    localStorage.removeItem('pinposy_accounts');
    localStorage.removeItem('pinposy_pending_pins');
  }, []);

  const handleUpdatePendingPins = (updater: (prev: PendingReviewPin[]) => PendingReviewPin[]) => {
    setPendingReviewPins((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem('pinposy_pending_pins', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleUpdateAccountAutoTime = (accountId: string, autoTime: string, nightlyAuto: boolean) => {
    setAccounts((prev) => {
      const next = prev.map((a) => (a.id === accountId ? { ...a, autoTime, nightlyAuto } : a));
      try {
        localStorage.setItem('pinposy_accounts', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleAddAccount = (acc: PinterestAccount) => {
    setAccounts((prev) => {
      const next = [...prev, acc];
      try {
        localStorage.setItem('pinposy_accounts', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setActiveAccountId(acc.id);
  };

  const handleRemoveAccount = (id: string) => {
    setAccounts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      try {
        localStorage.setItem('pinposy_accounts', JSON.stringify(next));
      } catch {
        // ignore
      }
      if (activeAccountId === id && next.length > 0) {
        setActiveAccountId(next[0].id);
      }
      return next;
    });
  };

  const currentAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];
  const pendingCount = pendingReviewPins.length;

  const handleSchedulePin = async (pin: ScheduledPinItem) => {
    if (!pin.pinId) {
      window.alert('Не найден ID сохранённого пина. Сначала сохраните пин в генераторе.');
      return;
    }
    const timezone = getDefaultTimezone();
    let localDateTime: Date;
    try {
      localDateTime = localDateTimeToDate(pin.scheduledDate, pin.scheduledTime, timezone);
    } catch {
      window.alert('Проверьте дату и время публикации.');
      return;
    }
    const saved = await apiRequest(`/pins/${encodeURIComponent(pin.pinId)}/schedule`, {
      method: 'POST',
      body: JSON.stringify({
        scheduled_at: localDateTime.toISOString(),
        timezone,
        destination_url: pin.destinationUrl || undefined,
        pinterest_board_id: pin.pinterestBoardId || undefined,
      }),
    });
    const date = formatInstantInTimezone(new Date(saved.scheduled_at), timezone);
    const persisted: ScheduledPinItem = {
      ...pin,
      id: String(saved.id),
      pinId: String(saved.pin_id),
      scheduledDate: date.date,
      scheduledTime: date.time,
      status: 'scheduled',
    };
    setScheduledPins((prev) => [persisted, ...prev.filter((item) => item.id !== persisted.id)]);
  };

  const handleAddBoard = async (board: BoardItem) => {
    try {
      let projects = await apiRequest('/projects');
      if (!Array.isArray(projects) || projects.length === 0) {
        const project = await apiRequest('/projects', {
          method: 'POST',
          body: JSON.stringify({ niche: board.category, language: aiContentLanguage }),
        });
        projects = [project];
      }
      const saved = await apiRequest('/boards', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projects[0].id,
          title: board.name,
          description: board.category,
        }),
      });
      const persisted: BoardItem = {
        ...board,
        id: String(saved.id),
        name: saved.title || board.name,
        category: board.category,
      };
      setBoards((prev) => [persisted, ...prev]);
    } catch (error) {
      console.error('[boards] Не удалось создать доску:', error);
      window.alert(error instanceof Error ? error.message : 'Не удалось сохранить доску');
    }
  };

  const handleOptimizeBoard = (boardId: string) => {
    setBoards((prev) =>
      prev.map((b) => (b.id === boardId ? { ...b, seoScore: 98 } : b))
    );
  };

  const handleGenerateFromTopic = (topic?: string, date?: string) => {
    if (topic) {
      setPrefilledTopic(topic);
    }
    if (date) {
      setPrefilledDate(date);
    }
    setActiveTab('generator');
  };

  if (isAdminRoute || activeViewMode === 'admin') {
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center">
          <p className="text-lg font-semibold text-primary-theme">Доступ запрещён</p>
          <p className="mt-2 text-sm text-secondary-theme">У вас нет прав администратора.</p>
          <button
            onClick={handleBackToPublicSite}
            className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm text-white"
          >
            Вернуться в приложение
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      <AdminPanel onBackToApp={handleBackToPublicSite} />
      <PrivacyPolicyModal isOpen={isPrivacyModalOpen} onClose={closePrivacyModal} />
    </>
  );
}

  // Полноэкранный онбординг-визард для новых пользователей
  if (needsOnboarding) {
    return (
      <>
        <OnboardingWizard />
        <PrivacyPolicyModal isOpen={isPrivacyModalOpen} onClose={closePrivacyModal} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-page text-primary-theme flex transition-colors">
      {/* Sidebar Navigation - Flush to left edge with enterprise flat border */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={setActiveAccountId}
        onAddAccountClick={() => setActiveTab('settings')}
        onGoToPricing={() => setActiveTab('pricing')}
        maxAccounts={maxAccounts}
        pendingCount={pendingCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Bar */}
        <Header
          activeTab={activeTab}
          onNewPinClick={() => handleGenerateFromTopic()}
          onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
          onNavigateTab={(tab) => {
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenBot={() => setIsBotOpen(true)}
        />

        {/* Viewport Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-28 sm:pb-32">
          {/* Баннер «Подтвердите email» — виден, пока users.email_verified=false (миграция 005) */}
          <EmailVerifyBanner />
          <LockedSection locked={isSectionLocked} onGoToPricing={() => setActiveTab('pricing')}>
          {activeTab === 'dashboard' && (
            <DashboardView
              boards={boards}
              scheduledPins={scheduledPins}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onQuickGenerate={handleGenerateFromTopic}
              onOpenReview={() => setActiveTab('review')}
              pendingCount={pendingCount}
              currentAccount={currentAccount}
              onUpdateAccountAutoTime={handleUpdateAccountAutoTime}
            />
          )}

          {activeTab === 'review' && (
            <ManualApprovalDesk
              boards={boards}
              pendingPins={pendingReviewPins}
              onUpdatePendingPins={handleUpdatePendingPins}
              onApprovePin={handleSchedulePin}
              onGoToCalendar={() => setActiveTab('calendar')}
              onGoToDashboard={() => setActiveTab('dashboard')}
              onGoToGenerator={(topic?: string) => handleGenerateFromTopic(topic)}
            />
          )}

          {activeTab === 'generator' && (
            <PinGenerator
              boards={boards}
              initialTopic={prefilledTopic}
              initialDate={prefilledDate}
              onSchedulePin={handleSchedulePin}
              onGoToCalendar={() => setActiveTab('calendar')}
            />
          )}

          {activeTab === 'keywords' && (
            <KeywordExplorer
              onGenerateFromKeyword={(kw) => handleGenerateFromTopic(kw)}
            />
          )}

          {activeTab === 'competitors' && (
            <CompetitorAudit
              onGenerateFromGap={(gap) => handleGenerateFromTopic(gap)}
            />
          )}

          {activeTab === 'calendar' && (
            <PublishingCalendar
              scheduledPins={scheduledPins}
              boards={boards}
              onAddPin={handleSchedulePin}
              onGoToGenerator={(topic, date) => handleGenerateFromTopic(topic, date)}
              onOpenReview={() => setActiveTab('review')}
              accounts={accounts}
              pendingCount={pendingCount}
              onUpdateAccountAutoTime={handleUpdateAccountAutoTime}
            />
          )}

          {activeTab === 'boards' && (
            <BoardsManager
              boards={boards}
              onAddBoard={handleAddBoard}
              onOptimizeBoard={handleOptimizeBoard}
            />
          )}

          {activeTab === 'analytics' && <AnalyticsView />}

          {activeTab === 'pricing' && <PricingView />}

          {activeTab === 'settings' && (
            <SettingsView
              onGoToPricing={() => setActiveTab('pricing')}
              accounts={accounts}
              activeAccountId={activeAccountId}
              onSelectAccount={setActiveAccountId}
              onAddAccount={handleAddAccount}
              onRemoveAccount={handleRemoveAccount}
              maxAccounts={maxAccounts}
              onUpdateAccountAutoTime={handleUpdateAccountAutoTime}
            />
          )}
          </LockedSection>
        </main>
      </div>

      {/* Floating AI Strategist Bot (Bottom Right - User Requested) */}
      <FloatingStrategistBot
        onNavigateTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        isOpen={isBotOpen}
        onToggleOpen={() => setIsBotOpen(!isBotOpen)}
      />

      {/* Real-time Toast Queue Notification */}
      {toast && (
        <div className="fixed top-20 right-4 sm:right-6 z-50 p-4 rounded-2xl custom-card border border-strong shadow-2xl flex items-start gap-3 max-w-sm animate-in slide-in-from-top-2 duration-200">
          <div className="w-8 h-8 rounded-xl bg-accent-light text-accent flex items-center justify-center shrink-0">
            <span className="text-sm">✨</span>
          </div>
          <div className="flex-1 min-w-0">
            <h5 className="text-xs font-bold text-primary-theme font-heading">{toast.title}</h5>
            <p className="text-[11px] text-secondary-theme mt-0.5 leading-snug">{toast.message}</p>
          </div>
          <button
            onClick={clearToast}
            className="text-muted-theme hover:text-primary-theme text-xs p-1 rounded-md transition-colors cursor-pointer"
            aria-label="Close notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Authentication Modal & Privacy Policy Modal */}
      <PrivacyPolicyModal isOpen={isPrivacyModalOpen} onClose={closePrivacyModal} />
    </div>
  );
};


function RequireAuth({ children }: { children: React.ReactElement }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <NotificationProvider>
        <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/register" element={<Register />} />
            <Route path="/check-email" element={<CheckEmail />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route
              path="/app/*"
              element={
                <RequireAuth>
                  <MainApp />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </AuthProvider>
        </NotificationProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}