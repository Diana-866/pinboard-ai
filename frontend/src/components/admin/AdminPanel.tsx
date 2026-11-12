import React, { useState, useMemo } from 'react';
import { AdminMail } from './AdminMail';
import { AdminEmailOutbox } from './AdminEmailOutbox';
import { AdminSubscriptions } from './AdminSubscriptions';
import { AdminBillingExceptions } from './AdminBillingExceptions';
import { AdminFinancialOperations } from './AdminFinancialOperations';
import { AdminPinterestSchedules } from './AdminPinterestSchedules';
import { AdminPinterestScheduler } from './AdminPinterestScheduler';
import { AdminPaymentCreationRequests } from './AdminPaymentCreationRequests';
import {
  Users,
  Activity,
  DollarSign,
  TrendingUp,
  Bot,
  BarChart3,
  Moon,
  Mail,
  Search,
  Filter,
  Download,
  Calendar,
  Clock,
  ArrowRight,
  Receipt,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Printer,
  QrCode,
  Share2,
  Layers,
  ArrowUpRight,
  ExternalLink,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import {
  ADMIN_USERS,
  ADMIN_TRANSACTIONS,
  AdminUserRecord,
  TransactionRecord,
  TaxRegime,
  calculateTax,
  exportTransactionsToCsv,
} from '../../data/adminMockData';
import { PinPosyLogo } from '../common/PinPosyLogo';
import { useAuth } from '../../context/AuthContext';

interface AdminPanelProps {
  onBackToApp: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToApp }) => {
  const { logout } = useAuth();
  // Navigation tabs within Admin Panel
  const [adminTab, setAdminTab] = useState<'users' | 'accounting' | 'night_and_bot' | 'mail' | 'subscriptions' | 'billing_exceptions' | 'email_outbox' | 'pinterest' | 'financial_operations' | 'payment_creation_requests' | 'pinterest_scheduler'>('users');

  // Search & Filter for Users tab
  const [userSearch, setUserSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [nightFilter, setNightFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserRecord | null>(null);

  // Accounting & Tax State
  const [selectedRegime, setSelectedRegime] = useState<TaxRegime>('self_employed');
  const [accountingPeriod, setAccountingPeriod] = useState<string>('current_month');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<TransactionRecord | null>(null);

  const handleAdminLogout = () => logout();

  // Filter transactions by period
  const filteredTransactions = useMemo(() => {
    let list = ADMIN_TRANSACTIONS;
    if (accountingPeriod === 'current_month') {
      list = list.filter((t) => t.dateTime.startsWith('2026-10'));
    } else if (accountingPeriod === 'september_2026') {
      list = list.filter((t) => t.dateTime.startsWith('2026-09'));
    } else if (accountingPeriod === 'q3_2026') {
      list = list.filter(
        (t) =>
          t.dateTime.startsWith('2026-07') ||
          t.dateTime.startsWith('2026-08') ||
          t.dateTime.startsWith('2026-09')
      );
    }

    if (transactionSearch.trim()) {
      const q = transactionSearch.toLowerCase();
      list = list.filter(
        (t) =>
          t.userName.toLowerCase().includes(q) ||
          t.userEmail.toLowerCase().includes(q) ||
          t.fiscalReceiptNumber.toLowerCase().includes(q) ||
          t.planName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [accountingPeriod, transactionSearch]);

  // Tax calculations
  const taxSummary = useMemo(() => {
    return calculateTax(filteredTransactions, selectedRegime);
  }, [filteredTransactions, selectedRegime]);

  // Filter users
  const filteredUsers = useMemo(() => {
    return ADMIN_USERS.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        user.email.toLowerCase().includes(userSearch.toLowerCase());
      const matchesPlan = planFilter === 'all' || user.plan === planFilter;
      const matchesNight =
        nightFilter === 'all'
          ? true
          : nightFilter === 'enabled'
          ? user.nightGenerationEnabled
          : !user.nightGenerationEnabled;
      return matchesSearch && matchesPlan && matchesNight;
    });
  }, [userSearch, planFilter, nightFilter]);

  // Aggregate user stats
  const aggregateStats = useMemo(() => {
    const totalUsers = ADMIN_USERS.length;
    const totalGenerations = ADMIN_USERS.reduce((sum, u) => sum + u.stats.totalGenerations, 0);
    const totalBotInquiries = ADMIN_USERS.reduce((sum, u) => sum + u.stats.botInquiries, 0);
    const totalAnalyticsViews = ADMIN_USERS.reduce((sum, u) => sum + u.stats.analyticsViews, 0);
    const nightUsers = ADMIN_USERS.filter((u) => u.nightGenerationEnabled).length;
    const activeSubscribers = ADMIN_USERS.filter(
      (u) => u.subscriptionStatus === 'active' && u.plan !== 'Free Trial'
    ).length;

    return {
      totalUsers,
      totalGenerations,
      totalBotInquiries,
      totalAnalyticsViews,
      nightUsers,
      activeSubscribers,
    };
  }, []);

  // CSV Export handler
  const handleExportCsv = () => {
    const csvContent = exportTransactionsToCsv(filteredTransactions);
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `PinPosy_Accounting_Taxes_${selectedRegime}_${accountingPeriod}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper to calculate transaction individual tax
  const getTransactionTax = (t: TransactionRecord) => {
    switch (selectedRegime) {
      case 'self_employed':
        return t.payerType === 'individual'
          ? Math.round(t.amountRub * 0.04)
          : Math.round(t.amountRub * 0.06);
      case 'usn_income_6':
        return Math.round(t.amountRub * 0.06);
      case 'usn_profit_15':
        return Math.max(Math.round(t.amountRub * 0.01), Math.round(t.grossProfitRub * 0.15));
      case 'patent':
        return 0; // Fixed overall
    }
  };

  return (
    <div className="min-h-screen bg-page text-primary-theme flex flex-col font-sans transition-colors">
      {/* Top Admin Navigation Header */}
      <header className="h-16 px-4 md:px-8 border-b border-subtle bg-surface sticky top-0 z-40 flex items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <PinPosyLogo size={26} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-primary-theme font-heading tracking-tight text-base sm:text-lg">
                PinPosy Admin
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                Администратор
              </span>
            </div>
            <p className="text-[11px] text-muted-theme truncate hidden sm:block">
              Вся статистика использования, ночные очереди, тарифы и налоговая бухгалтерия
            </p>
          </div>
        </div>

        {/* Back to Client App & User profile */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBackToApp}
            className="px-3.5 py-1.5 rounded-xl border border-subtle bg-subtle hover:bg-surface text-secondary-theme hover:text-primary-theme text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>← На сайт PinPosy</span>
          </button>

          <button
            onClick={handleAdminLogout}
            className="px-3.5 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Завершить сеанс администратора"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Выйти</span>
          </button>
        </div>
      </header>

      {/* Admin Tabs Bar */}
      <div className="border-b border-subtle bg-surface/50 backdrop-blur-xs px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-4 overflow-x-auto scrollbar-none py-2.5">
          <button
            onClick={() => setAdminTab('users')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              adminTab === 'users'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>1. Пользователи и активность ({ADMIN_USERS.length})</span>
          </button>

          <button
            onClick={() => setAdminTab('accounting')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              adminTab === 'accounting'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>2. Бухгалтерия, налоги и чеки</span>
          </button>

          <button
            onClick={() => setAdminTab('night_and_bot')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              adminTab === 'night_and_bot'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>3. Ночная генерация и ИИ-бот</span>
          </button>

          <button
            onClick={() => setAdminTab('mail')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              adminTab === 'mail'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>4. Почта поддержки</span>
          </button>

          <button
            onClick={() => setAdminTab('email_outbox')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              adminTab === 'email_outbox'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>5. Очередь писем</span>
          </button>

          <button
            onClick={() => setAdminTab('billing_exceptions')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              adminTab === 'billing_exceptions'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>6. Исключения платежей</span>
          </button>

          <button
            onClick={() => setAdminTab('financial_operations')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              adminTab === 'financial_operations'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>7. Незавершённые операции</span>
          </button>

          <button
            onClick={() => setAdminTab('subscriptions')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              adminTab === 'subscriptions'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>8. Подписки и платежи</span>
          </button>

          <button
            onClick={() => setAdminTab('payment_creation_requests')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              adminTab === 'payment_creation_requests'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>10. Создание платежей</span>
          </button>

          <button
            onClick={() => setAdminTab('pinterest_scheduler')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${adminTab === 'pinterest_scheduler'
              ? 'accent-btn shadow-xs'
              : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'}`}
          >
            <Activity className="w-4 h-4" />
            <span>11. Worker Pinterest</span>
          </button>

          <button
            onClick={() => setAdminTab('pinterest')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              adminTab === 'pinterest'
                ? 'accent-btn shadow-xs'
                : 'text-secondary-theme hover:text-primary-theme hover:bg-subtle'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>9. Pinterest — очередь</span>
          </button>
        </div>
      </div>

      {/* Main Admin Content Container */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6 pb-24">
        <section
          role="alert"
          aria-live="polite"
          className="rounded-2xl border-2 border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200"
        >
          <p className="font-bold uppercase tracking-wide">Демонстрационные данные — не реальные данные PinPosy</p>
          <p className="mt-1">
            Разделы «Пользователи», «Бухгалтерия» и «Ночная генерация и ИИ-бот» используют встроенные примеры.
            Имена, email, суммы, чеки, налоговые расчёты и показатели вымышлены. Не используйте их для
            учёта, отчётности, связи с клиентами или принятия финансовых решений.
          </p>
        </section>
        {adminTab === 'mail' && <AdminMail />}
        {adminTab === 'email_outbox' && <AdminEmailOutbox />}
        {adminTab === 'subscriptions' && <AdminSubscriptions />}
        {adminTab === 'billing_exceptions' && <AdminBillingExceptions />}
        {adminTab === 'financial_operations' && <AdminFinancialOperations />}
        {adminTab === 'payment_creation_requests' && <AdminPaymentCreationRequests />}
        {adminTab === 'pinterest' && <AdminPinterestSchedules />}
        {adminTab === 'pinterest_scheduler' && <AdminPinterestScheduler />}
        {/* ============================================================ */}
        {/* TAB 1: USERS & DETAILED GENERATION STATS                     */}
        {/* ============================================================ */}
        {adminTab === 'users' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* KPI Cards Row */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
              <div className="custom-card p-4 rounded-2xl">
                <span className="text-[11px] font-semibold text-muted-theme uppercase tracking-wider block">
                  Всего пользователей
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-primary-theme mt-1 block">
                  {aggregateStats.totalUsers}
                </span>
                <span className="text-[11px] text-emerald-500 font-medium mt-1 flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3" /> +12 за месяц
                </span>
              </div>

              <div className="custom-card p-4 rounded-2xl">
                <span className="text-[11px] font-semibold text-muted-theme uppercase tracking-wider block">
                  Всего генераций пинов
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-primary-theme mt-1 block">
                  {aggregateStats.totalGenerations.toLocaleString()}
                </span>
                <span className="text-[11px] text-muted-theme font-mono mt-1 block">
                  ~142 пина/день
                </span>
              </div>

              <div className="custom-card p-4 rounded-2xl">
                <span className="text-[11px] font-semibold text-muted-theme uppercase tracking-wider block">
                  Запросов к боту
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-primary-theme mt-1 block">
                  {aggregateStats.totalBotInquiries.toLocaleString()}
                </span>
                <span className="text-[11px] text-accent-ghost font-medium mt-1 block">
                  ИИ-стратег
                </span>
              </div>

              <div className="custom-card p-4 rounded-2xl">
                <span className="text-[11px] font-semibold text-muted-theme uppercase tracking-wider block">
                  Просмотров аналитики
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-primary-theme mt-1 block">
                  {aggregateStats.totalAnalyticsViews.toLocaleString()}
                </span>
                <span className="text-[11px] text-muted-theme font-mono mt-1 block">
                  Pinterest Graph
                </span>
              </div>

              <div className="custom-card p-4 rounded-2xl border-indigo-500/20 bg-indigo-500/5">
                <span className="text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1 block">
                  <Moon className="w-3 h-3" /> Ночной режим
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-primary-theme mt-1 block">
                  {aggregateStats.nightUsers} польз.
                </span>
                <span className="text-[11px] text-indigo-600 dark:text-indigo-300 font-medium mt-1 block">
                  {Math.round((aggregateStats.nightUsers / aggregateStats.totalUsers) * 100)}% базы
                </span>
              </div>

              <div className="custom-card p-4 rounded-2xl">
                <span className="text-[11px] font-semibold text-muted-theme uppercase tracking-wider block">
                  Платные подписки
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-primary-theme mt-1 block">
                  {aggregateStats.activeSubscribers}
                </span>
                <span className="text-[11px] text-emerald-500 font-medium mt-1 block">
                  100% активны
                </span>
              </div>
            </div>

            {/* User Search & Filters Bar */}
            <div className="custom-card p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-muted-theme absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Поиск по имени, email, домену или бренду..."
                  className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-app-input border border-subtle text-primary-theme placeholder:text-muted-theme focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Plan Filter */}
                <select
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-surface border border-subtle text-primary-theme focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="all">Все тарифы</option>
                  <option value="Agency">Agency (14 900 ₽)</option>
                  <option value="Pro">Pro (4 900 ₽)</option>
                  <option value="Start">Start (2 490 ₽)</option>
                  <option value="Analytics">Analytics (990 ₽)</option>
                  <option value="Free Trial">Free Trial</option>
                </select>

                {/* Night Mode Filter */}
                <select
                  value={nightFilter}
                  onChange={(e) => setNightFilter(e.target.value as any)}
                  className="px-3 py-2 text-xs rounded-xl bg-surface border border-subtle text-primary-theme focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="all">Ночная генерация: Все</option>
                  <option value="enabled">Только включена 🌙</option>
                  <option value="disabled">Только выключена</option>
                </select>
              </div>
            </div>

            {/* Users Master Table */}
            <div className="custom-card rounded-2xl overflow-hidden border border-subtle">
              <div className="p-4 border-b border-subtle bg-subtle/40 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-primary-theme font-heading">
                    Клиентская база и персональная статистика использования
                  </h3>
                  <p className="text-xs text-muted-theme mt-0.5">
                    Нажмите «По дням» у любого пользователя, чтобы раскрыть график генераций по дням
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold text-secondary-theme">
                  Показано: {filteredUsers.length} из {ADMIN_USERS.length}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-subtle bg-subtle text-[11px] font-semibold text-secondary-theme uppercase tracking-wider">
                      <th className="py-3 px-4">Пользователь</th>
                      <th className="py-3 px-3">Тариф / Статус</th>
                      <th className="py-3 px-3 text-right">Генераций (всего)</th>
                      <th className="py-3 px-3 text-center">Разбивка по дням</th>
                      <th className="py-3 px-3 text-right">К боту</th>
                      <th className="py-3 px-3 text-right">Аналитика</th>
                      <th className="py-3 px-3 text-center">Ночной режим</th>
                      <th className="py-3 px-3 text-center">Аккаунты / Доски</th>
                      <th className="py-3 px-4 text-right">Активность</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {filteredUsers.map((user) => (
                      <React.Fragment key={user.id}>
                        <tr className="hover:bg-subtle/50 transition-colors">
                          {/* User info */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={user.avatar}
                                alt={user.name}
                                className="w-8 h-8 rounded-full object-cover border border-subtle shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-primary-theme truncate">
                                    {user.name}
                                  </span>
                                  {user.role === 'admin' && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                      Owner
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-muted-theme truncate block font-mono">
                                  {user.email}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Plan */}
                          <td className="py-3 px-3">
                            <div>
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase tracking-wider ${
                                  user.plan === 'Agency'
                                    ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                                    : user.plan === 'Pro'
                                    ? 'bg-accent-light text-accent'
                                    : user.plan === 'Start'
                                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                    : 'bg-zinc-500/15 text-secondary-theme'
                                }`}
                              >
                                {user.plan}
                              </span>
                              <span className="text-[10px] text-muted-theme block mt-0.5 font-mono">
                                {user.planPriceRub.toLocaleString()} ₽/мес
                              </span>
                            </div>
                          </td>

                          {/* Total Generations */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-primary-theme tabular-nums text-sm">
                            {user.stats.totalGenerations}
                          </td>

                          {/* Daily Breakdown expander button */}
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() =>
                                setSelectedUserDetail(
                                  selectedUserDetail?.id === user.id ? null : user
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                                selectedUserDetail?.id === user.id
                                  ? 'accent-btn shadow-xs'
                                  : 'border-subtle bg-subtle hover:bg-surface text-secondary-theme hover:text-primary-theme'
                              }`}
                            >
                              <span>{selectedUserDetail?.id === user.id ? 'Скрыть ▲' : 'По дням ▼'}</span>
                            </button>
                          </td>

                          {/* Bot inquiries */}
                          <td className="py-3 px-3 text-right font-mono text-primary-theme tabular-nums">
                            {user.stats.botInquiries}
                          </td>

                          {/* Analytics views */}
                          <td className="py-3 px-3 text-right font-mono text-primary-theme tabular-nums">
                            {user.stats.analyticsViews}
                          </td>

                          {/* Night mode */}
                          <td className="py-3 px-3 text-center">
                            {user.nightGenerationEnabled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                                <Moon className="w-3 h-3" /> Вкл (02:00)
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-theme font-mono">—</span>
                            )}
                          </td>

                          {/* Connected Accounts & Boards */}
                          <td className="py-3 px-3 text-center font-mono text-xs text-secondary-theme">
                            <span>{user.connectedAccounts} акк. / {user.connectedBoards} досок</span>
                          </td>

                          {/* Last Active */}
                          <td className="py-3 px-4 text-right text-[11px] text-muted-theme font-mono">
                            {user.lastActive}
                          </td>
                        </tr>

                        {/* Expandable Daily Generation Row */}
                        {selectedUserDetail?.id === user.id && (
                          <tr className="bg-subtle/30 border-b border-subtle">
                            <td colSpan={9} className="p-4 sm:p-6 animate-in fade-in duration-150">
                              <div className="custom-card p-4 rounded-xl border border-strong bg-surface space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-subtle pb-2.5">
                                  <div className="flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-accent-ghost" />
                                    <h4 className="text-xs font-bold text-primary-theme font-heading">
                                      График генераций по дням для: {user.name} ({user.email})
                                    </h4>
                                  </div>
                                  <span className="text-[11px] text-muted-theme font-mono">
                                    За последние 14 дней активной работы
                                  </span>
                                </div>

                                {/* Daily bars visualization */}
                                <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5 pt-2">
                                  {user.stats.dailyGenerations.map((day, idx) => {
                                    const maxInSet = Math.max(
                                      ...user.stats.dailyGenerations.map((d) => d.count),
                                      1
                                    );
                                    const heightPct = Math.max(
                                      12,
                                      Math.round((day.count / maxInSet) * 100)
                                    );
                                    const dateFormatted = day.date.slice(5); // MM-DD

                                    return (
                                      <div
                                        key={idx}
                                        className="flex flex-col items-center gap-1 group relative"
                                      >
                                        <div className="h-24 w-full bg-subtle rounded-lg flex items-end p-1 relative overflow-hidden">
                                          <div
                                            className="w-full rounded-md accent-btn transition-all duration-300 group-hover:opacity-90"
                                            style={{ height: `${heightPct}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-mono font-bold text-primary-theme tabular-nums">
                                          {day.count}
                                        </span>
                                        <span className="text-[9px] text-muted-theme font-mono">
                                          {dateFormatted}
                                        </span>

                                        {/* Hover Tooltip */}
                                        <div className="absolute bottom-full mb-1 px-2 py-1 bg-surface border border-strong rounded-md shadow-lg text-[10px] whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10 font-mono">
                                          {day.date}: {day.count} пинов
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: ACCOUNTING, TAX REGIMES, AND FISCAL RECEIPTS          */}
        {/* ============================================================ */}
        {adminTab === 'accounting' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Top Period & Tax Regime Selector Bar */}
            <div className="custom-card p-5 rounded-2xl space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-subtle pb-4">
                <div>
                  <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-500" />
                    <span>Бухгалтерский учет, налоги и фискализация (ФНС)</span>
                  </h2>
                  <p className="text-xs text-muted-theme mt-0.5">
                    Выберите вашу систему налогообложения для расчета налогов и формирования чеков
                  </p>
                </div>

                {/* Period Selector & CSV Export */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-subtle bg-surface text-xs font-semibold">
                    <Calendar className="w-4 h-4 text-muted-theme" />
                    <select
                      value={accountingPeriod}
                      onChange={(e) => setAccountingPeriod(e.target.value)}
                      className="bg-transparent text-primary-theme focus:outline-none cursor-pointer"
                    >
                      <option value="current_month">Текущий месяц (Октябрь 2026)</option>
                      <option value="september_2026">Сентябрь 2026</option>
                      <option value="q3_2026">3 квартал 2026</option>
                      <option value="all_time">Все время</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="px-3.5 py-1.5 rounded-xl border border-subtle bg-subtle text-muted-theme text-xs font-semibold flex items-center gap-1.5 cursor-not-allowed opacity-60"
                    title="Экспорт недоступен: в этом разделе пока только демонстрационные данные"
                  >
                    <Download className="w-4 h-4" />
                    <span>Экспорт отключён (демо)</span>
                  </button>
                </div>
              </div>

              {/* Tax Regime Selector Chips */}
              <div>
                <label className="block text-[11px] font-bold text-secondary-theme uppercase tracking-wider mb-2">
                  Система налогообложения (нажмите для мгновенного пересчета налога):
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {/* 1. Самозанятый */}
                  <button
                    type="button"
                    onClick={() => setSelectedRegime('self_employed')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedRegime === 'self_employed'
                        ? 'bg-accent-light/30 border-accent ring-2 ring-accent/30 shadow-xs'
                        : 'border-subtle bg-surface hover:bg-subtle/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-primary-theme">Самозанятый (НПД)</span>
                      {selectedRegime === 'self_employed' && (
                        <CheckCircle2 className="w-4 h-4 text-accent-ghost" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-theme leading-tight">
                      4% с физлиц, 6% с юрлиц/ИП. Лимит до 2.4 млн ₽/год. Формирование чеков в «Мой налог».
                    </p>
                  </button>

                  {/* 2. УСН Доходы 6% */}
                  <button
                    type="button"
                    onClick={() => setSelectedRegime('usn_income_6')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedRegime === 'usn_income_6'
                        ? 'bg-accent-light/30 border-accent ring-2 ring-accent/30 shadow-xs'
                        : 'border-subtle bg-surface hover:bg-subtle/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-primary-theme">ИП УСН «Доходы» 6%</span>
                      {selectedRegime === 'usn_income_6' && (
                        <CheckCircle2 className="w-4 h-4 text-accent-ghost" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-theme leading-tight">
                      6% со всей полученной выручки сервиса до вычета расходов.
                    </p>
                  </button>

                  {/* 3. УСН Доходы минус Расходы 15% */}
                  <button
                    type="button"
                    onClick={() => setSelectedRegime('usn_profit_15')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedRegime === 'usn_profit_15'
                        ? 'bg-accent-light/30 border-accent ring-2 ring-accent/30 shadow-xs'
                        : 'border-subtle bg-surface hover:bg-subtle/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-primary-theme">ИП УСН «Д-Р» 15%</span>
                      {selectedRegime === 'usn_profit_15' && (
                        <CheckCircle2 className="w-4 h-4 text-accent-ghost" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-theme leading-tight">
                      15% от валовой прибыли (Выручка минус подтвержденный расход GPT-Tunnel).
                    </p>
                  </button>

                  {/* 4. Патент (ПСН) */}
                  <button
                    type="button"
                    onClick={() => setSelectedRegime('patent')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedRegime === 'patent'
                        ? 'bg-accent-light/30 border-accent ring-2 ring-accent/30 shadow-xs'
                        : 'border-subtle bg-surface hover:bg-subtle/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-primary-theme">Патент (ПСН)</span>
                      {selectedRegime === 'patent' && (
                        <CheckCircle2 className="w-4 h-4 text-accent-ghost" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-theme leading-tight">
                      Фиксированная стоимость патента на IT-разработку (~3 500 ₽/мес).
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Financial Summary Metric Cards - Exactly User Formulas */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              {/* 1. Revenue */}
              <div className="custom-card p-4 rounded-2xl">
                <span className="text-[11px] font-semibold text-muted-theme uppercase tracking-wider block">
                  Выручка за период
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-primary-theme mt-1 block">
                  {taxSummary.totalRevenue.toLocaleString()} ₽
                </span>
                <span className="text-[11px] text-secondary-theme font-mono mt-1 block">
                  ≈ ${Math.round(taxSummary.totalRevenue / 83.5).toLocaleString()} USD
                </span>
              </div>

              {/* 2. GPT-Tunnel Cost */}
              <div className="custom-card p-4 rounded-2xl border-rose-500/20 bg-rose-500/5">
                <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
                  Расход GPT-Tunnel
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1 block">
                  −{taxSummary.totalGptTunnelCost.toLocaleString()} ₽
                </span>
                <span className="text-[11px] text-muted-theme font-mono mt-1 block">
                  Токены нейросетей
                </span>
              </div>

              {/* 3. Gross Profit (Revenue - GPTTunnel) */}
              <div className="custom-card p-4 rounded-2xl border-emerald-500/20 bg-emerald-500/5">
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  Валовая прибыль
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 block">
                  {taxSummary.grossProfit.toLocaleString()} ₽
                </span>
                <span className="text-[11px] text-muted-theme font-mono mt-1 block">
                  Выручка − gpttunel
                </span>
              </div>

              {/* 4. Tax calculated */}
              <div className="custom-card p-4 rounded-2xl border-amber-500/20 bg-amber-500/5">
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                  Налог за период
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1 block">
                  −{taxSummary.taxAmount.toLocaleString()} ₽
                </span>
                <span className="text-[11px] text-muted-theme font-mono mt-1 block">
                  Ставка: {taxSummary.effectiveTaxRate}%
                </span>
              </div>

              {/* 5. Net Profit After Tax */}
              <div className="custom-card p-4 rounded-2xl border-accent/30 bg-accent-light/10 col-span-2 md:col-span-1">
                <span className="text-[11px] font-bold text-accent-ghost uppercase tracking-wider block">
                  Итого после налога
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-primary-theme mt-1 block">
                  {taxSummary.netProfit.toLocaleString()} ₽
                </span>
                <span className="text-[11px] text-emerald-500 font-semibold font-mono mt-1 block">
                </span>
              </div>
            </div>

            {/* Tax Details Explainer Notice */}
            <div className="p-3.5 rounded-xl bg-subtle border border-subtle text-xs text-secondary-theme flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  <strong>Текущий расчет:</strong> {taxSummary.taxDescription}. Все чеки зарегистрированы
                  в ФНС с передачей фискальных данных через ОФД.
                </span>
              </div>
              <span className="font-mono text-[11px] text-muted-theme shrink-0">
                Транзакций: {filteredTransactions.length}
              </span>
            </div>

            {/* Transactions & Fiscal Receipts Table */}
            <div className="custom-card rounded-2xl overflow-hidden border border-subtle">
              <div className="p-4 border-b border-subtle bg-subtle/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-primary-theme font-heading">
                    Реестр платежей, тарифов и фискальных чеков
                  </h3>
                  <p className="text-xs text-muted-theme mt-0.5">
                    Нажмите «Чек ФНС», чтобы открыть фискальный чек с QR-кодом для налоговой
                  </p>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-muted-theme absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={transactionSearch}
                    onChange={(e) => setTransactionSearch(e.target.value)}
                    placeholder="Поиск по чеку, клиенту..."
                    className="pl-9 pr-3 py-1.5 text-xs rounded-xl bg-app-input border border-subtle text-primary-theme placeholder:text-muted-theme focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-subtle bg-subtle text-[11px] font-semibold text-secondary-theme uppercase tracking-wider">
                      <th className="py-3 px-4">Дата и время</th>
                      <th className="py-3 px-3">Клиент (покупатель)</th>
                      <th className="py-3 px-3">Тариф</th>
                      <th className="py-3 px-3 text-right">Выручка (₽)</th>
                      <th className="py-3 px-3 text-right">GPT-Tunnel (₽)</th>
                      <th className="py-3 px-3 text-right">Валовая прибыль</th>
                      <th className="py-3 px-3 text-right">Налог ({selectedRegime === 'self_employed' ? 'НПД' : 'УСН'})</th>
                      <th className="py-3 px-3 text-right">Итого чистыми</th>
                      <th className="py-3 px-3">Оплата</th>
                      <th className="py-3 px-4 text-center">Фискальный чек</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {filteredTransactions.map((trx) => {
                      const taxVal = getTransactionTax(trx);
                      const netVal = trx.grossProfitRub - taxVal;

                      return (
                        <tr key={trx.id} className="hover:bg-subtle/50 transition-colors">
                          {/* Date and time */}
                          <td className="py-3 px-4 font-mono text-[11px] text-primary-theme whitespace-nowrap">
                            {trx.dateTime}
                          </td>

                          {/* Client */}
                          <td className="py-3 px-3">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-primary-theme truncate">
                                  {trx.userName}
                                </span>
                                {trx.payerType === 'legal_entity' && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                    Юрлицо/ИП
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-theme font-mono truncate block">
                                {trx.userEmail}
                              </span>
                            </div>
                          </td>

                          {/* Plan */}
                          <td className="py-3 px-3">
                            <span className="font-semibold text-primary-theme">{trx.planName}</span>
                          </td>

                          {/* Revenue */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-primary-theme tabular-nums">
                            {trx.amountRub.toLocaleString()} ₽
                          </td>

                          {/* GPT-Tunnel Cost */}
                          <td className="py-3 px-3 text-right font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                            −{trx.gptTunnelCostRub.toLocaleString()} ₽
                          </td>

                          {/* Gross Profit */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {trx.grossProfitRub.toLocaleString()} ₽
                          </td>

                          {/* Tax */}
                          <td className="py-3 px-3 text-right font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                            −{taxVal.toLocaleString()} ₽
                          </td>

                          {/* Net profit */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-primary-theme tabular-nums">
                            {netVal.toLocaleString()} ₽
                          </td>

                          {/* Payment method */}
                          <td className="py-3 px-3 text-[11px] text-secondary-theme whitespace-nowrap">
                            {trx.paymentMethod}
                          </td>

                          {/* Fiscal Receipt Button */}
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => setSelectedReceipt(trx)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-subtle bg-subtle hover:bg-surface text-primary-theme flex items-center justify-center gap-1.5 transition-colors cursor-pointer mx-auto shadow-xs active:scale-95"
                              title="Посмотреть фискальный чек ФНС с QR-кодом"
                            >
                              <Receipt className="w-3.5 h-3.5 text-accent-ghost" />
                              <span>Чек ФНС</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: NIGHT GENERATION QUEUE & BOT INSIGHTS                 */}
        {/* ============================================================ */}
        {adminTab === 'night_and_bot' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Night Automation Banner */}
            <div className="custom-card p-6 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-surface to-purple-500/10 border border-indigo-500/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-500 flex items-center justify-center shrink-0">
                    <Moon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-primary-theme font-heading">
                      Ночная фоновая генерация (Night Queue Engine)
                    </h3>
                    <p className="text-xs text-muted-theme mt-0.5">
                      Пакетное создание пинов в часы минимальной нагрузки на API (00:00 – 06:00 МСК)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    Очередь активна и готова к запуску
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-surface/80 border border-subtle">
                  <span className="text-[11px] text-muted-theme uppercase font-semibold">
                    Пользователей с ночным режимом
                  </span>
                  <span className="text-xl font-bold font-mono text-primary-theme mt-1 block">
                    {ADMIN_USERS.filter((u) => u.nightGenerationEnabled).length} чел.
                  </span>
                  <p className="text-[10px] text-secondary-theme mt-1">
                    Тарифы Pro и Agency генерируют расписание на 7–30 дней вперед ночью
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface/80 border border-subtle">
                  <span className="text-[11px] text-muted-theme uppercase font-semibold">
                    Запланировано на сегодня (ночь)
                  </span>
                  <span className="text-xl font-bold font-mono text-indigo-500 dark:text-indigo-400 mt-1 block">
                    480 пинов
                  </span>
                  <p className="text-[10px] text-secondary-theme mt-1">
                    Будет отправлено в очередь Pinterest в 02:30 МСК
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface/80 border border-subtle">
                  <span className="text-[11px] text-muted-theme uppercase font-semibold">
                    Экономия себестоимости API
                  </span>
                  <span className="text-xl font-bold font-mono text-emerald-500 mt-1 block">
                    ~38%
                  </span>
                  <p className="text-[10px] text-secondary-theme mt-1">
                    Снижение пиковой нагрузки за счет батч-обработки
                  </p>
                </div>
              </div>
            </div>

            {/* AI Strategist Bot Analytics */}
            <div className="custom-card p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-subtle pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl accent-btn flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-primary-theme font-heading">
                      Статистика обращений к ИИ-стратегу PinPosy
                    </h3>
                    <p className="text-xs text-muted-theme">
                      Анализ популярных пользовательских запросов и конверсий в действия
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-secondary-theme">
                  Всего запросов: {aggregateStats.totalBotInquiries}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-xs font-bold text-secondary-theme uppercase tracking-wider block">
                    Топ популярных вопросов пользователей к боту:
                  </span>
                  <div className="space-y-1.5 text-xs">
                    {[
                      { q: '«В какие часы лучше выкладывать пины?»', count: 184, conv: '92%' },
                      { q: '«Какой заголовок даст максимальный CTR?»', count: 142, conv: '88%' },
                      { q: '«Как поднять охваты в нише Home Decor?»', count: 118, conv: '85%' },
                      { q: '«Какие ключевые слова в тренде на этой неделе?»', count: 104, conv: '94%' },
                      { q: '«Аудит досок и исправление ошибок SEO»', count: 76, conv: '80%' },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-subtle border border-subtle flex items-center justify-between"
                      >
                        <span className="text-primary-theme font-medium truncate max-w-[280px]">
                          {item.q}
                        </span>
                        <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                          <span className="text-muted-theme">{item.count} раз</span>
                          <span className="text-emerald-500 font-bold">{item.conv} переходов</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-secondary-theme uppercase tracking-wider block">
                    Пользователи с наибольшим количеством запросов к боту:
                  </span>
                  <div className="space-y-1.5 text-xs">
                    {ADMIN_USERS.slice()
                      .sort((a, b) => b.stats.botInquiries - a.stats.botInquiries)
                      .slice(0, 5)
                      .map((u) => (
                        <div
                          key={u.id}
                          className="p-2.5 rounded-xl bg-subtle border border-subtle flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={u.avatar}
                              alt={u.name}
                              className="w-6 h-6 rounded-full object-cover shrink-0"
                            />
                            <span className="font-semibold text-primary-theme truncate">
                              {u.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-accent-ghost font-bold">
                              {u.stats.botInquiries} обращений
                            </span>
                            <span className="text-muted-theme">({u.plan})</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================ */}
      {/* FISCAL RECEIPT MODAL (Чек ФНС для отчетности в налоговой)     */}
      {/* ============================================================ */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-surface border border-strong rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-subtle bg-surface flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-accent-ghost" />
                <div>
                  <h3 className="text-sm font-bold text-primary-theme font-heading">
                    Фискальный кассовый чек № {selectedReceipt.fiscalReceiptNumber}
                  </h3>
                  <p className="text-[11px] text-muted-theme font-mono">
                    ФНС России · Признак расчета: ПРИХОД
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-1.5 rounded-xl text-muted-theme hover:text-primary-theme hover:bg-subtle transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Official Paper Receipt Replica */}
            <div className="p-5 sm:p-6 bg-app-input font-mono text-xs space-y-3.5 border-b border-subtle">
              <div className="text-center space-y-0.5 border-b border-dashed border-subtle pb-3">
                <p className="font-bold text-sm tracking-wider">PINPOSY INTELLIGENCE</p>
                <p className="text-[11px] text-secondary-theme">ИНН: {selectedReceipt.inn}</p>
                <p className="text-[10px] text-muted-theme">{selectedReceipt.taxPayerName}</p>
                <p className="text-[10px] text-muted-theme">
                  Сайт проверки чеков: kkt-online.nalog.ru
                </p>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-theme">Дата и время:</span>
                  <span className="font-bold">{selectedReceipt.dateTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-theme">Покупатель:</span>
                  <span className="font-bold truncate max-w-[240px]">{selectedReceipt.userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-theme">Email покупателя:</span>
                  <span>{selectedReceipt.userEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-theme">Тип плательщика:</span>
                  <span>{selectedReceipt.payerType === 'legal_entity' ? 'Юрлицо/ИП' : 'Физическое лицо'}</span>
                </div>
              </div>

              {/* Position */}
              <div className="border-t border-b border-dashed border-subtle py-2.5 space-y-1">
                <div className="flex justify-between font-bold">
                  <span>Доступ к ПО PinPosy ({selectedReceipt.planName})</span>
                  <span>{selectedReceipt.amountRub.toLocaleString()} ₽</span>
                </div>
                <div className="flex justify-between text-[10px] text-muted-theme">
                  <span>1 шт × {selectedReceipt.amountRub.toLocaleString()} ₽</span>
                  <span>
                    Налог ({selectedRegime === 'self_employed' ? 'НПД' : 'УСН'}):{' '}
                    {getTransactionTax(selectedReceipt).toLocaleString()} ₽
                  </span>
                </div>
              </div>

              {/* Total */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm font-bold">
                  <span>ИТОГО К ОПЛАТЕ:</span>
                  <span className="text-base text-accent-ghost">{selectedReceipt.amountRub.toLocaleString()} ₽</span>
                </div>
                <div className="flex justify-between text-[11px] text-muted-theme">
                  <span>Оплата безналичными:</span>
                  <span>{selectedReceipt.amountRub.toLocaleString()} ₽ ({selectedReceipt.paymentMethod})</span>
                </div>
              </div>

              {/* Fiscal Requisites */}
              <div className="border-t border-dashed border-subtle pt-2.5 text-[10px] text-muted-theme space-y-0.5">
                <div className="flex justify-between">
                  <span>ФН (Фискальный накопитель):</span>
                  <span className="font-bold">{selectedReceipt.fnNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>ФД (Фискальный документ):</span>
                  <span className="font-bold">{selectedReceipt.fdNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>ФПД (Фискальный признак):</span>
                  <span className="font-bold">{selectedReceipt.fpdNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Статус передачи в ФНС:</span>
                  <span className="text-emerald-500 font-bold">Доставлен оператору ОФД</span>
                </div>
              </div>

              {/* QR Code Placeholder for Tax Inspector Scanner */}
              <div className="pt-2 flex items-center justify-center gap-3">
                <div className="p-2 bg-surface rounded-xl border border-strong flex flex-col items-center">
                  <QrCode className="w-16 h-16 text-primary-theme" />
                  <span className="text-[9px] text-muted-theme mt-1">QR для ФНС</span>
                </div>
                <div className="text-[10px] text-secondary-theme leading-tight max-w-[200px]">
                  Отсканируйте камерой смартфона в приложении «Мой налог» или ФНС России для проверки подлинности чека.
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-surface flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-3 py-1.5 rounded-xl border border-subtle hover:bg-subtle text-xs font-semibold text-primary-theme flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Распечатать</span>
              </button>

              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-1.5 rounded-xl accent-btn text-xs font-bold cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
