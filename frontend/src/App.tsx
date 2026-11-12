/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { getDefaultTimezone, localDateTimeToDate, formatInstantInTimezone } from './utils/timezone';
import { apiRequest } from './lib/api';
import { buildPinterestPinUrl } from './utils/pinterestPinUrl';
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
import { PublishingCalendar } from './components/calendar/PublishingCalendar';
import { parsePersistedScheduleStatus } from './utils/scheduleStatus';
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
import { mapPersistedBoards } from './utils/persistedBoards';
import { getOrCreateProject } from './utils/projectProvisioning';
import { validatePersistedScheduleRows } from './utils/persistedSchedule';
import { mergeRestoredReviewQueue } from './utils/reviewQueueHydration';
import { isReviewQueueOwnerCurrent } from './utils/reviewQueueOwnerFence';
import { findPersistedScheduleMutation, findPersistedScheduleRequest, isPersistedScheduleMutationResponse, isScheduleAbsentFromActiveList, isPersistedScheduleCancellationResponse } from './utils/scheduleMutationReconciliation';

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
  const [initialPricingPlan, setInitialPricingPlan] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [boardsLoadError, setBoardsLoadError] = useState('');
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boardsReloadToken, setBoardsReloadToken] = useState(0);
  const [scheduledPins, setScheduledPins] = useState<ScheduledPinItem[]>([]);
  const [scheduleLoadError, setScheduleLoadError] = useState('');
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleReloadToken, setScheduleReloadToken] = useState(0);
  const [prefilledTopic, setPrefilledTopic] = useState<string>('');
  const [prefilledDate, setPrefilledDate] = useState<string>('');
  const [prefilledTime, setPrefilledTime] = useState<string>('');
  const [prefilledBoardId, setPrefilledBoardId] = useState<string>('');
  const [isBotOpen, setIsBotOpen] = useState<boolean>(false);

  const { toast, clearToast } = useNotifications();
  const { aiContentLanguage, t } = useI18n();
  const { refreshUser } = useAuth();
 const { activeViewMode, setActiveViewMode, isPrivacyModalOpen, closePrivacyModal, isAdmin, user } = useAuth();

  // Schedule rows belong to the authenticated user. Clear the previous account's
  // calendar immediately on identity change, without clearing it on ordinary reloads.
  const scheduleUserIdRef = React.useRef(user?.id || '');
  React.useLayoutEffect(() => {
    const nextUserId = user?.id || '';
    if (scheduleUserIdRef.current !== nextUserId) {
      scheduleUserIdRef.current = nextUserId;
      setScheduledPins([]);
      setScheduleLoadError('');
    }
  }, [user?.id]);
  // Never expose the previous account's boards after an account switch.
  React.useEffect(() => {
    setBoards([]);
    setBoardsLoadError('');
    setBoardsLoading(Boolean(user?.id));
  }, [user?.id]);

  // Доски загружаются из API, а не из демонстрационного массива браузера.
  React.useEffect(() => {
    let cancelled = false;
    async function loadBoards() {
      if (!user?.id) {
        setBoardsLoading(false);
        return;
      }
      setBoardsLoading(true);
      setBoardsLoadError('');
      try {
        const rows = await apiRequest('/boards');
        const mapped = mapPersistedBoards(rows, t.boards.loadErrorFallback);
        if (!cancelled) setBoards(mapped);
      } catch (error) {
        console.error('[boards] Не удалось загрузить доски:', error);
        if (!cancelled) {
          setBoardsLoadError(error instanceof Error ? error.message : t.boards.loadErrorFallback);
        }
      } finally {
        if (!cancelled) setBoardsLoading(false);
      }
    }
    loadBoards();
    return () => { cancelled = true; };
  }, [user?.id, boardsReloadToken, t.boards.loadErrorFallback]);



  // Never show a previous user's schedule after an account switch.
  React.useEffect(() => {
    setScheduledPins([]);
    setScheduleLoadError('');
    setScheduleLoading(Boolean(user?.id));
  }, [user?.id]);

  // Re-map persisted UTC timestamps when the publishing timezone changes,
  // and reconcile worker-updated statuses when the user returns to this tab.
  React.useEffect(() => {
    const reloadSchedule = () => setScheduleReloadToken((value) => value + 1);
    const reloadWhenVisible = () => {
      if (document.visibilityState === 'visible') reloadSchedule();
    };
    window.addEventListener('pinposy:timezone-changed', reloadSchedule);
    document.addEventListener('visibilitychange', reloadWhenVisible);
    return () => {
      window.removeEventListener('pinposy:timezone-changed', reloadSchedule);
      document.removeEventListener('visibilitychange', reloadWhenVisible);
    };
  }, []);

  // Keep the visible publishing calendar in sync with background worker results.
  // Poll only while the user is viewing the calendar and the tab is foregrounded;
  // visibilitychange above performs an immediate refresh when they return.
  React.useEffect(() => {
    if (!user?.id || activeTab !== 'calendar') return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setScheduleReloadToken((value) => value + 1);
      }
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [user?.id, activeTab]);

  // Расписание загружается из БД; демонстрационные публикации не показываем.
  React.useEffect(() => {
    let cancelled = false;
    async function loadSchedule() {
      if (!user?.id) {
        setScheduledPins([]);
        setScheduleLoadError('');
        setScheduleLoading(false);
        return;
      }
      setScheduleLoading(true);
      setScheduleLoadError('');
      try {
        const response = await apiRequest('/schedule');
        if (cancelled) return;
        const rows = validatePersistedScheduleRows(response);
        const mapped: ScheduledPinItem[] = rows.map((row: any) => {
          const date = new Date(row.scheduled_at);
          const local = formatInstantInTimezone(date, getDefaultTimezone());
          const pinterestPinId = String(row.pinterest_pin_id || '').trim();
          const pinterestPinUrl = buildPinterestPinUrl(pinterestPinId);
          return {
            id: String(row.id),
            pinId: String(row.pin_id),
            title: row.snapshot_image_url ? (row.snapshot_title || 'Без названия') : (row.pins?.title || 'Без названия'),
            boardId: String(row.pins?.board_id || ''),
            boardName: row.pins?.boards?.title || 'Без доски',
            imageUrl: row.snapshot_image_url || row.pins?.image_url || '',
            scheduledDate: local.date,
            scheduledTime: local.time,
            status: parsePersistedScheduleStatus(row.status),
            retryable: row.retryable === true,
            retryReason: row.retry_reason || undefined,
            failureReason: row.failure_reason === 'board_unavailable' ? 'board_unavailable' : null,
            destinationUrl: row.snapshot_image_url ? (row.snapshot_destination_url || '') : (row.destination_url || ''),
            pinterestBoardId: row.pinterest_board_id || undefined,
            pinterestAccountId: row.pinterest_account_id || undefined,
            pinterestPinId: pinterestPinUrl ? pinterestPinId : undefined,
            pinterestPinUrl,
            isOptimalSlot: false,
          };
        });
        setScheduledPins(mapped);
      } catch (error) {
        console.error('[schedule] Не удалось загрузить расписание:', error);
        if (!cancelled) setScheduleLoadError('Не удалось загрузить расписание. Проверьте соединение и попробуйте ещё раз. Существующие публикации не удалены.');
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
    }
    loadSchedule();
    return () => { cancelled = true; };
  }, [user?.id, scheduleReloadToken]);

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
      const detail = (e as CustomEvent<string | { tab: string; planId?: string }>).detail;
      const tab = typeof detail === 'string' ? detail : detail?.tab;
      if (tab) {
        if (tab === 'pricing' && typeof detail !== 'string') setInitialPricingPlan(detail.planId || null);
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

  // Pinterest connections and limits are loaded from the authenticated backend.
  const [accounts, setAccounts] = useState<PinterestAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const [maxAccounts, setMaxAccounts] = useState<number>(0);

  // Synchronized Pending Review Pins queue (Shared between Dashboard, Calendar, Sidebar & ManualApprovalDesk).
  // Queue entries are session-local and must never survive an authenticated-user switch.
  const [pendingReviewPins, setPendingReviewPins] = useState<PendingReviewPin[]>([]);
  const pendingReviewPinsRef = React.useRef<PendingReviewPin[]>([]);
  const reviewQueueWriteChainsRef = React.useRef<Map<string, Promise<unknown>>>(new Map());
  const pendingReviewUserIdRef = React.useRef(user?.id || '');
  const pendingReviewOwnerGenerationRef = React.useRef(0);
  const reviewQueueHydratingRef = React.useRef(false);
  const reviewQueueTouchedIdsRef = React.useRef<Set<string>>(new Set());

  // Restore the authenticated user's review queue from the backend. Never use
  // localStorage: it is not an ownership boundary and can leak across accounts.
  React.useLayoutEffect(() => {
    // Increment even when the same account signs back in: stale async work from
    // an earlier A -> B -> A session must not become valid again.
    pendingReviewOwnerGenerationRef.current += 1;
    pendingReviewUserIdRef.current = user?.id || '';
    reviewQueueHydratingRef.current = Boolean(user?.id);
    reviewQueueTouchedIdsRef.current = new Set();
    pendingReviewPinsRef.current = [];
    setPendingReviewPins([]);
  }, [user?.id]);

  React.useEffect(() => {
    let active = true;
    const ownerId = user?.id || '';
    const ownerSnapshot = { userId: ownerId, generation: pendingReviewOwnerGenerationRef.current };
    const isCurrentOwner = () => isReviewQueueOwnerCurrent(ownerSnapshot, {
      userId: pendingReviewUserIdRef.current,
      generation: pendingReviewOwnerGenerationRef.current,
    });
    if (!ownerId) return () => { active = false; };

    apiRequest('/review-queue')
      .then((rows) => {
        if (!active || !isCurrentOwner()) return;
        const safeRows = Array.isArray(rows) ? rows as PendingReviewPin[] : [];
        const hydratedRows = mergeRestoredReviewQueue(
          safeRows,
          pendingReviewPinsRef.current,
          reviewQueueTouchedIdsRef.current,
        );
        reviewQueueHydratingRef.current = false;
        reviewQueueTouchedIdsRef.current.clear();
        pendingReviewPinsRef.current = hydratedRows;
        setPendingReviewPins(hydratedRows);
      })
      .catch((error) => {
        if (!active || !isCurrentOwner()) return;
        reviewQueueHydratingRef.current = false;
        reviewQueueTouchedIdsRef.current.clear();
        console.error('[review-queue] Не удалось восстановить очередь:', error);
        window.dispatchEvent(new CustomEvent('pinposy:review-queue-error'));
      });
    return () => { active = false; };
  }, [user?.id]);

  const handlePinterestStatusChange = React.useCallback((status: { configured: boolean; account_limit?: number | null; accounts?: Array<{ id: string; username?: string | null; pinterest_user_id?: string | null; needs_reauth?: boolean }> }) => {
    const rows = Array.isArray(status.accounts) ? status.accounts : [];
    const mapped: PinterestAccount[] = rows.map((account, index) => ({
      id: String(account.id),
      name: account.username || account.pinterest_user_id || `Pinterest ${index + 1}`,
      handle: account.username ? `@${account.username}` : String(account.pinterest_user_id || ''),
      avatar: '',
      boardsCount: 0,
      monthlyViews: '—',
      minDailyPins: 8,
      maxDailyPins: 16,
      nightlyAuto: false,
      status: account.needs_reauth ? 'error' : 'active',
      niche: '',
    }));
    setAccounts(mapped);
    setActiveAccountId((current) =>
      current && mapped.some((account) => account.id === current)
        ? current
        : mapped[0]?.id || ''
    );
    setMaxAccounts(status.configured === false
      ? 0
      : status.account_limit == null ? 99 : Math.max(0, Number(status.account_limit) || 0));
  }, []);

  React.useEffect(() => {
    // Remove demo account/review data left by older client builds.
    localStorage.removeItem('pinposy_accounts');
    localStorage.removeItem('pinposy_pending_pins');
  }, []);

  // Pinterest accounts and plan limits come from the server, never from demo/local state.
  React.useEffect(() => {
    let active = true;
    // Clear the previous session immediately so another signed-in user never
    // sees stale Pinterest profiles or the previous user's plan limit.
    setAccounts([]);
    setActiveAccountId('');
    setMaxAccounts(0);

    if (!user?.id) {
      return () => { active = false; };
    }

    apiRequest('/integrations/pinterest/status')
      .then((data) => {
        if (!active) return;
        handlePinterestStatusChange(data);
      })
      .catch((error) => {
        console.error('[pinterest] Не удалось загрузить подключённые аккаунты:', error);
        if (active) {
          setAccounts([]);
          setActiveAccountId('');
          setMaxAccounts(0);
        }
      });

    return () => { active = false; };
  }, [user?.id, handlePinterestStatusChange]);

  const handleUpdatePendingPins = (updater: (prev: PendingReviewPin[]) => PendingReviewPin[]) => {
    const ownerId = user?.id || '';
    const ownerSnapshot = { userId: ownerId, generation: pendingReviewOwnerGenerationRef.current };
    const isCurrentOwner = () => isReviewQueueOwnerCurrent(ownerSnapshot, {
      userId: pendingReviewUserIdRef.current,
      generation: pendingReviewOwnerGenerationRef.current,
    });
    // Ignore callbacks from a child rendered for the previous account.
    if (!isCurrentOwner()) return Promise.reject(new Error('Сессия пользователя изменилась.'));
 
    const previous = pendingReviewPinsRef.current;
    const next = updater(previous);
    if (next === previous) return Promise.resolve();
    if (reviewQueueHydratingRef.current) {
      const previousById = new Map(previous.map((pin) => [pin.id, pin]));
      const nextById = new Map(next.map((pin) => [pin.id, pin]));
      for (const id of previousById.keys()) {
        if (!nextById.has(id)) reviewQueueTouchedIdsRef.current.add(id);
      }
      for (const id of nextById.keys()) {
        if (!previousById.has(id) || JSON.stringify(previousById.get(id)) !== JSON.stringify(nextById.get(id))) {
          reviewQueueTouchedIdsRef.current.add(id);
        }
      }
    }
    pendingReviewPinsRef.current = next;
    setPendingReviewPins(next);

    const previousById = new Map(previous.map((pin) => [pin.id, pin]));
    const nextById = new Map(next.map((pin) => [pin.id, pin]));
    const enqueueById = (id: string, operation: () => Promise<unknown>) => {
      const chains = reviewQueueWriteChainsRef.current;
      const previousOperation = chains.get(id) || Promise.resolve();
      const currentOperation = previousOperation.catch(() => undefined).then(() => {
        if (!isCurrentOwner()) throw new Error('Review queue owner changed before persistence.');
        return operation();
      });
      chains.set(id, currentOperation);
      currentOperation.finally(() => {
        if (chains.get(id) === currentOperation) chains.delete(id);
      }).catch(() => undefined);
      return currentOperation;
    };
    const writes = next
      .filter((pin) => !previousById.has(pin.id) || JSON.stringify(previousById.get(pin.id)) !== JSON.stringify(pin))
      .map((pin) => enqueueById(pin.id, () => apiRequest(`/review-queue/${encodeURIComponent(pin.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ pin }),
      })));
    const removals = previous
      .filter((pin) => !nextById.has(pin.id))
      .map((pin) => enqueueById(pin.id, () => apiRequest(`/review-queue/${encodeURIComponent(pin.id)}`, { method: 'DELETE' })));

    return Promise.all([...writes, ...removals]).then(() => undefined).catch((error) => {
      console.error('[review-queue] Не удалось сохранить изменения очереди:', error);
      // Do not overwrite newer edits or a newly authenticated user's queue.
      if (isCurrentOwner() && pendingReviewPinsRef.current === next) {
        pendingReviewPinsRef.current = previous;
        setPendingReviewPins(previous);
      }
      window.dispatchEvent(new CustomEvent('pinposy:review-queue-error'));
      throw error;
    });
  };

  const currentAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];
  const pendingCount = pendingReviewPins.length;

  const handleSchedulePin = async (pin: ScheduledPinItem) => {
    // A schedule operation spans multiple API requests. Fence every async
    // continuation to the session that initiated it, including A -> B -> A.
    const ownerSnapshot = {
      userId: pendingReviewUserIdRef.current,
      generation: pendingReviewOwnerGenerationRef.current,
    };
    const isCurrentOwner = () => isReviewQueueOwnerCurrent(ownerSnapshot, {
      userId: pendingReviewUserIdRef.current,
      generation: pendingReviewOwnerGenerationRef.current,
    });
    const assertCurrentOwner = () => {
      if (!ownerSnapshot.userId || !isCurrentOwner()) {
        throw new Error('Сессия пользователя изменилась. Обновите страницу и повторите действие.');
      }
    };
    assertCurrentOwner();
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
    // Approval from the review desk is a real persisted transition, not just
    // a local queue animation. Persist edited creative fields before freezing
    // the immutable schedule snapshot.
    const approvedTitle = String(pin.title || '').trim().slice(0, 100);
    if (!approvedTitle) throw new Error('Название пина не может быть пустым.');
    const approvedDescription = typeof pin.description === 'string'
      ? pin.description.trim().slice(0, 500)
      : undefined;
    const creativePatch: Record<string, string> = { title: approvedTitle };
    if (approvedDescription !== undefined) creativePatch.description = approvedDescription;
    const updatedPin = await apiRequest(`/pins/${encodeURIComponent(pin.pinId)}`, {
      method: 'PATCH',
      body: JSON.stringify(creativePatch),
    });
    assertCurrentOwner();
    if (!updatedPin || updatedPin.id !== pin.pinId ||
        updatedPin.title !== approvedTitle ||
        (approvedDescription !== undefined && updatedPin.description !== approvedDescription)) {
      throw new Error('Сервер не подтвердил сохранение изменений пина.');
    }
    const approvedPin = await apiRequest(`/pins/${encodeURIComponent(pin.pinId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'approved' }),
    });
    assertCurrentOwner();
    if (!approvedPin || approvedPin.id !== pin.pinId || approvedPin.status !== 'approved') {
      throw new Error('Сервер не подтвердил одобрение пина.');
    }

    const schedulePayload = {
      scheduled_at: localDateTime.toISOString(),
      timezone,
      destination_url: pin.destinationUrl || undefined,
      pinterest_board_id: pin.pinterestBoardId || undefined,
      pinterest_account_id: pin.pinterestAccountId || undefined,
    };
    let saved: any;
    const expectedRequest = {
      pinId: pin.pinId,
      scheduledAt: localDateTime.toISOString(),
      pinterestBoardId: String(pin.pinterestBoardId || ''),
      pinterestAccountId: pin.pinterestAccountId || undefined,
      statuses: ['scheduled', 'publishing', 'failed', 'unknown'],
    };
    try {
      const response = await apiRequest(`/pins/${encodeURIComponent(pin.pinId)}/schedule`, {
        method: 'POST',
        body: JSON.stringify(schedulePayload),
      });
      assertCurrentOwner();
      // A 2xx response is not enough: only accept the exact persisted row that
      // the calendar would later load. Malformed success responses are ambiguous.
      saved = findPersistedScheduleRequest([response], expectedRequest);
      if (!saved) throw new Error('Сервер не подтвердил сохранение расписания.');
    } catch (originalError) {
      // The server may have committed the schedule even when the response was
      // lost or malformed. Reconcile against the persisted list before surfacing
      // the original error; never infer success from a loose pin-ID match alone.
      try {
        const rows = await apiRequest('/schedule');
        assertCurrentOwner();
        saved = findPersistedScheduleRequest(rows, expectedRequest);
        if (!saved) throw originalError;
      } catch {
        throw originalError;
      }
    }
    assertCurrentOwner();
    const date = formatInstantInTimezone(new Date(saved.scheduled_at), timezone);
    const persisted: ScheduledPinItem = {
      ...pin,
      title: approvedTitle,
      ...(approvedDescription !== undefined ? { description: approvedDescription } : {}),
      id: String(saved.id),
      pinId: String(saved.pin_id),
      scheduledDate: date.date,
      scheduledTime: date.time,
      status: parsePersistedScheduleStatus(saved.status),
      retryable: saved.retryable === true,
      retryReason: saved.retry_reason || undefined,
      failureReason: saved.failure_reason === 'board_unavailable' ? 'board_unavailable' : null,
      pinterestBoardId: saved.pinterest_board_id || pin.pinterestBoardId,
      pinterestAccountId: saved.pinterest_account_id || pin.pinterestAccountId,
      accountHandle: accounts.find((account) => account.id === (saved.pinterest_account_id || pin.pinterestAccountId))?.handle || pin.accountHandle,
    };
    setScheduledPins((prev) => [persisted, ...prev.filter((item) => item.id !== persisted.id)]);
  };

  const handleReconcileLegacySchedule = async (pin: ScheduledPinItem, accountId: string) => {
    try {
      const expected = {
        scheduleId: pin.id,
        statuses: ['scheduled', 'failed', 'publishing', 'unknown'],
        pinterestBoardId: String(pin.pinterestBoardId || ''),
        pinterestAccountId: accountId,
      };
      let saved: any;
      try {
        const response = await apiRequest(`/schedule/${encodeURIComponent(pin.id)}/reconcile-account`, {
          method: 'POST',
          body: JSON.stringify({ pinterest_account_id: accountId }),
        });
        if (!isPersistedScheduleMutationResponse(response, expected)) {
          throw new Error('Сервер не подтвердил привязку аккаунта к этому расписанию.');
        }
        saved = response;
      } catch (originalError) {
        // Account reconciliation is an atomic DB transition. If its response
        // is lost, accept only the exact schedule/account/board from GET.
        try {
          const rows = await apiRequest('/schedule');
          saved = findPersistedScheduleMutation(rows, expected);
          if (!saved) throw originalError;
        } catch {
          throw originalError;
        }
      }

      const account = accounts.find((item) => item.id === saved.pinterest_account_id);
      setScheduledPins((prev) => prev.map((item) => item.id === pin.id ? {
        ...item,
        status: parsePersistedScheduleStatus(saved.status),
        pinterestAccountId: saved.pinterest_account_id,
        pinterestBoardId: saved.pinterest_board_id,
        accountHandle: account?.handle || account?.name || item.accountHandle || '',
        retryable: saved.retryable === true,
        retryReason: typeof saved.retry_reason === 'string' ? saved.retry_reason : undefined,
        failureReason: saved.failure_reason === 'board_unavailable' ? 'board_unavailable' : null,
      } : item));
      setScheduleReloadToken((value) => value + 1);
    } catch (error) {
      console.error('[schedule] Не удалось восстановить старое расписание:', error);
      window.alert(error instanceof Error ? error.message : 'Не удалось восстановить расписание');
      throw error;
    }
  };

  const handleChangeFailedScheduleBoard = async (
    pin: ScheduledPinItem,
    pinterestBoardId: string,
    boardName: string
  ) => {
    try {
      let saved: any;
      const expected = {
        scheduleId: pin.id,
        statuses: ['scheduled', 'publishing'],
        pinterestBoardId,
        pinterestAccountId: String(pin.pinterestAccountId || ''),
      };
      try {
        const response = await apiRequest(`/schedule/${encodeURIComponent(pin.id)}/change-board`, {
          method: 'POST',
          body: JSON.stringify({ pinterest_board_id: pinterestBoardId }),
        });
        if (!isPersistedScheduleMutationResponse(response, expected)) {
          throw new Error('Сервер не подтвердил новое состояние публикации.');
        }
        saved = response;
      } catch (originalError) {
        // A lost or malformed 2xx response is ambiguous. Reconcile only against
        // this exact schedule, target board, account and queued state.
        try {
          const rows = await apiRequest('/schedule');
          saved = findPersistedScheduleMutation(rows, expected);
          if (!saved) throw originalError;
        } catch {
          throw originalError;
        }
      }

      const date = formatInstantInTimezone(new Date(saved.scheduled_at), getDefaultTimezone());
      setScheduledPins((prev) => prev.map((item) => item.id === pin.id ? {
        ...item,
        scheduledDate: date.date,
        scheduledTime: date.time,
        status: parsePersistedScheduleStatus(saved.status),
        pinterestBoardId,
        boardName: boardName || item.boardName,
        retryable: false,
        retryReason: undefined,
        failureReason: null,
      } : item));
      // Refresh the canonical row so the calendar reflects any server-side
      // retry metadata and worker state after the atomic board-change RPC.
      setScheduleReloadToken((value) => value + 1);
    } catch (error) {
      console.error('[schedule] Не удалось сменить Pinterest-доску:', error);
      window.alert(error instanceof Error ? error.message : 'Не удалось сменить доску Pinterest');
      throw error;
    }
  };

  const handleRetryScheduledPin = async (pin: ScheduledPinItem) => {
    try {
      let saved: any;
      const expected = {
        scheduleId: pin.id,
        statuses: ['scheduled', 'publishing'],
        pinterestBoardId: String(pin.pinterestBoardId || ''),
        pinterestAccountId: String(pin.pinterestAccountId || ''),
      };
      try {
        const response = await apiRequest(`/schedule/${encodeURIComponent(pin.id)}/retry`, {
          method: 'POST',
        });
        if (!isPersistedScheduleMutationResponse(response, expected)) {
          throw new Error('Сервер не подтвердил новое состояние публикации.');
        }
        saved = response;
      } catch (originalError) {
        // A lost or malformed 2xx response is ambiguous too. Accept only the
        // exact schedule after it is visibly back in the queue on the same destination.
        try {
          const rows = await apiRequest('/schedule');
          saved = findPersistedScheduleMutation(rows, expected);
          if (!saved) throw originalError;
        } catch {
          throw originalError;
        }
      }

      const date = formatInstantInTimezone(new Date(saved.scheduled_at), getDefaultTimezone());
      setScheduledPins((prev) => prev.map((item) => item.id === pin.id ? {
        ...item,
        scheduledDate: date.date,
        scheduledTime: date.time,
        status: parsePersistedScheduleStatus(saved.status),
        // A successful retry is a new queued state, not a failed row with
        // stale retry controls/diagnostics. Preserve the exact destination
        // returned by the server and let the normal loader hydrate the rest.
        retryable: false,
        retryReason: undefined,
        failureReason: null,
        pinterestBoardId: saved.pinterest_board_id || item.pinterestBoardId,
        pinterestAccountId: saved.pinterest_account_id || item.pinterestAccountId,
      } : item));
      setScheduleReloadToken((value) => value + 1);
    } catch (error) {
      console.error('[schedule] Не удалось повторить публикацию:', error);
      window.alert(error instanceof Error ? error.message : 'Не удалось повторить публикацию');
      throw error;
    }
  };

  const handleCancelScheduledPin = async (pin: ScheduledPinItem) => {
    try {
      const response = await apiRequest(`/schedule/${encodeURIComponent(pin.id)}/cancel`, {
        method: 'POST',
      });
      if (!isPersistedScheduleCancellationResponse(response, pin.id)) {
        throw new Error('Сервер не подтвердил отмену именно этой публикации. Проверяем сохранённое расписание.');
      }
      setScheduledPins((prev) => prev.filter((item) => item.id !== pin.id));
    } catch (originalError) {
      // GET /schedule intentionally omits cancelled rows. A valid list without
      // this previously visible schedule confirms that cancellation committed
      // even if the POST response was lost. Any malformed/failed read is inconclusive.
      try {
        const rows = await apiRequest('/schedule');
        if (!isScheduleAbsentFromActiveList(rows, pin.id)) throw originalError;
        setScheduledPins((prev) => prev.filter((item) => item.id !== pin.id));
      } catch {
        console.error('[schedule] Не удалось подтвердить отмену публикации:', originalError);
        window.alert(originalError instanceof Error ? originalError.message : 'Не удалось отменить публикацию');
        throw originalError;
      }
    }
  };

  const handleAddBoard = async (board: BoardItem, createRequestId: string) => {
    try {
      const project = await getOrCreateProject(
        String(user?.id || ''),
        () => apiRequest('/projects'),
        () => apiRequest('/projects', {
          method: 'POST',
          body: JSON.stringify({ niche: board.category, language: aiContentLanguage }),
        }),
      );

      const saved = await apiRequest('/boards', {
        method: 'POST',
        body: JSON.stringify({
          project_id: project.id,
          title: board.name,
          description: '',
          category: board.category,
          create_request_id: createRequestId,
        }),
      });
      if (!saved || saved.id == null) {
        throw new Error('Сервер не подтвердил сохранение доски. Обновите список перед повторной попыткой.');
      }

      const persisted: BoardItem = {
        ...board,
        id: String(saved.id),
        name: saved.title || board.name,
        category: board.category,
      };
      setBoards((prev) => [persisted, ...prev.filter((item) => item.id !== persisted.id)]);
      // Reconcile against the server after creation. This also invalidates an
      // older in-flight GET /boards response that could otherwise overwrite
      // this newly-created board with a stale snapshot.
      setBoardsReloadToken((value) => value + 1);
      setBoardsLoadError('');
    } catch (error) {
      console.error('[boards] Не удалось создать доску:', error);
      throw error instanceof Error
        ? error
        : new Error('Не удалось сохранить доску. Проверьте соединение и попробуйте ещё раз.');
    }
  };

  const handleUpdateBoard = async (boardId: string, patch: { title: string; category: string }) => {
    const saved = await apiRequest(`/boards/${encodeURIComponent(boardId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (!saved || String(saved.id) !== String(boardId)) {
      throw new Error('Сервер не подтвердил обновление этой доски. Обновите список перед повторной попыткой.');
    }
    setBoards((prev) => prev.map((item) => item.id === boardId
      ? { ...item, name: saved.title || patch.title, category: saved.category || patch.category }
      : item));
    setBoardsReloadToken((value) => value + 1);
    setBoardsLoadError('');
  };

  const handleGenerateFromTopic = (topic?: string, date?: string, time?: string, boardId?: string) => {
    // Each navigation starts with exactly the supplied context; never leak a
    // previous calendar slot into a later, unrelated generation session.
    setPrefilledTopic(topic || '');
    setPrefilledDate(date || '');
    setPrefilledTime(time || '');
    setPrefilledBoardId(boardId || '');
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
            />
          )}

          {activeTab === 'generator' && (
            <PinGenerator
              boards={boards}
              onPinsChanged={() => setBoardsReloadToken((value) => value + 1)}
              initialTopic={prefilledTopic}
              initialDate={prefilledDate}
              initialTime={prefilledTime}
              initialBoardId={prefilledBoardId}
              onSchedulePin={handleSchedulePin}
              onAddToReview={async (pin) => {
                const ownerSnapshot = {
                  userId: user?.id || '',
                  generation: pendingReviewOwnerGenerationRef.current,
                };
                const isCurrentOwner = () => isReviewQueueOwnerCurrent(ownerSnapshot, {
                  userId: pendingReviewUserIdRef.current,
                  generation: pendingReviewOwnerGenerationRef.current,
                });
                if (!ownerSnapshot.userId || !isCurrentOwner()) {
                  throw new Error('Сессия пользователя изменилась. Обновите страницу и повторите попытку.');
                }
                const existing = pendingReviewPinsRef.current.find((item) => item.pinId === pin.pinId);
                if (existing) {
                  setActiveTab('review');
                  return;
                }
                await apiRequest(`/review-queue/${encodeURIComponent(pin.id)}`, {
                  method: 'PUT',
                  body: JSON.stringify({ pin }),
                });
                if (!isCurrentOwner()) {
                  throw new Error('Сессия пользователя изменилась во время сохранения.');
                }
                if (reviewQueueHydratingRef.current) reviewQueueTouchedIdsRef.current.add(pin.id);
                const next = [...pendingReviewPinsRef.current, pin];
                pendingReviewPinsRef.current = next;
                setPendingReviewPins(next);
                setActiveTab('review');
              }}
              onGoToCalendar={() => setActiveTab('calendar')}
            />
          )}

          {activeTab === 'keywords' && (
            <KeywordExplorer
              onGenerateFromKeyword={(kw) => handleGenerateFromTopic(kw)}
            />
          )}

          {activeTab === 'calendar' && (
            <PublishingCalendar
              scheduledPins={scheduledPins}
              scheduleLoadError={scheduleLoadError}
              scheduleLoading={scheduleLoading}
              onRetryLoadSchedule={() => setScheduleReloadToken((value) => value + 1)}
              boards={boards}
              onAddPin={handleSchedulePin}
              onCancelSchedule={handleCancelScheduledPin}
              onRetrySchedule={handleRetryScheduledPin}
              onChangeFailedScheduleBoard={handleChangeFailedScheduleBoard}
              onReconcileLegacySchedule={handleReconcileLegacySchedule}
              onGoToGenerator={(topic, date, time, boardId) => handleGenerateFromTopic(topic, date, time, boardId)}
              onOpenReview={() => setActiveTab('review')}
              accounts={accounts}
              pendingCount={pendingCount}
            />
          )}

          {activeTab === 'boards' && (
            <BoardsManager
              boards={boards}
              loadError={boardsLoadError}
              isLoading={boardsLoading}
              onRetry={() => setBoardsReloadToken((value) => value + 1)}
              onAddBoard={handleAddBoard}
              onUpdateBoard={handleUpdateBoard}
            />
          )}

          {activeTab === 'analytics' && <AnalyticsView />}

          {activeTab === 'pricing' && <PricingView initialPlanId={initialPricingPlan} />}

          {activeTab === 'settings' && (
            <SettingsView
              onGoToPricing={() => setActiveTab('pricing')}
              onPinterestStatusChange={handlePinterestStatusChange}
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
        account={{
          credits: user?.credits_balance,
          planLabel: user?.tariff_plan && user.tariff_plan !== 'none' ? user.tariff_plan : undefined,
          boardsCount: boards.length,
          scheduledCount: scheduledPins.filter((pin) => pin.status === 'scheduled').length,
          pendingCount,
        }}
      />

      {/* Real-time Toast Queue Notification */}
      {toast && (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
          className="fixed top-20 right-4 sm:right-6 z-50 p-4 rounded-2xl custom-card border border-strong shadow-2xl flex items-start gap-3 max-w-sm animate-in slide-in-from-top-2 duration-200"
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toast.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-accent-light text-accent'}`}>
            <span className="text-sm">{toast.type === 'error' ? '⚠️' : '✨'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h5 className="text-xs font-bold text-primary-theme font-heading">{toast.title}</h5>
            <p className="text-[11px] text-secondary-theme mt-0.5 leading-snug">{toast.message}</p>
          </div>
          {toast.type === 'error' && (
            <button
              onClick={() => window.location.reload()}
              className="text-xs font-semibold text-accent hover:underline whitespace-nowrap"
            >
              Обновить
            </button>
          )}
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