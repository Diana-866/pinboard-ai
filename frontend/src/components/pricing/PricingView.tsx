import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  Sparkles,
  Check,
  Zap,
  Shield,
  Layers,
  Users,
  MessageSquare,
  ArrowRight,
  TrendingUp,
  X,
  HelpCircle,
  Info,
  Clock,
  Coins,
  Flame,
  Infinity as InfinityIcon,
  CheckCircle,
  History,
  ReceiptText,
} from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { useAuth } from '../../context/AuthContext';
import { payAndRedirect, PayablePlan, SubscriptionRow, buyCreditsAndRedirect, CreditPurchaseRow } from '../../lib/billing';
import { apiRequest } from '../../lib/api';

export const PricingView: React.FC = () => {
  const { t, language } = useI18n();
  const { user, refreshUser } = useAuth();
  // Реальная оплата: создаём платёж на бэкенде и уводим на страницу Prodamus
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [history, setHistory] = useState<SubscriptionRow[]>([]);
  const [tariffEnd, setTariffEnd] = useState<string | null>(null);

  // История платежей пользователя — доказательство, что вебхук сработал
  const loadHistory = () => {
    if (!user) return;
    apiRequest('/billing/subscriptions')
      .then((res: any) => {
        setHistory(res?.subscriptions || []);
        setTariffEnd(res?.tariff?.periodEnd || null);
      })
      .catch(() => {});
  };
  // История покупок пакетов (credit_purchases, миграция 007): видно, что вебхук зачислил баланс
  const [purchases, setPurchases] = useState<CreditPurchaseRow[]>([]);
  const loadPurchases = () => {
    if (!user) return;
    apiRequest('/billing/credit-purchases')
      .then((res: any) => setPurchases(res?.purchases || []))
      .catch(() => {});
  };
  const purchaseStatusLabels: Record<string, string> = {
    success: t.purchases?.statusSuccess || 'Оплачено',
    pending: t.purchases?.statusPending || 'Ожидает оплаты',
    canceled: t.purchases?.statusCanceled || 'Отменён',
    denied: t.purchases?.statusDenied || 'Отклонён',
  };

  useEffect(() => {
    loadPurchases();
  }, [user?.id, user?.credits_balance]);

  useEffect(() => {
    loadHistory();
  }, [user?.id, user?.tariff_plan]);

  const handlePay = async (planId: string) => {
    setPayError(null);
    setPayingId(planId);
    try {
      await payAndRedirect(planId as PayablePlan, currency);
    } catch (e: any) {
      setPayError(e?.message || t.pricing.paymentError || 'Не удалось создать платёж');
      setPayingId(null);
    }
  };

  const [activeTab, setActiveTab] = useState<'plans' | 'credits'>('plans');
  const [currency, setCurrency] = useState<'rub' | 'usd'>(language === 'ru' ? 'rub' : 'usd');
  const currentPlanId = user?.tariff_plan || 'none';

  // Реальный баланс кредитов (users.credits_balance из /me).
  // Докупленные пакеты зачисляются вебхуком Prodamus и НЕ сгорают.
  const totalBalance = user?.credits_balance ?? 0;

  // Покупка пакета: создаём платёж на бэкенде и уводим на страницу Prodamus
  const [payingPackId, setPayingPackId] = useState<string | null>(null);

  // AI Strategist Bot Chat Demo state
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'ai' | 'user'; text: string }>>([
    {
      sender: 'ai',
      text: t.pricing.aiBotSubtitle,
    },
  ]);
  const [chatInput, setChatInput] = useState('');

  // 4 Subscription Plans based on exact user specification
  const plans = [
    {
      id: 'analytics',
      name: t.pricing.planAnalyticsTitle,
      subtitle: t.pricing.planAnalyticsSubtitle,
      summary: t.pricing.planAnalyticsDesc,
      priceRub: '990 ₽',
      priceUsd: '$11,9',
      period: '/ мес',
      credits: 0,
      accounts: '1',
      popular: false,
      badge: null,
      features: [
        '1 connected account',
        '0 credits included',
        'PinPosy AI Strategist Bot 24/7',
        'Pinterest Trend Radar',
        'Competitor monitoring & content gaps',
        'Keyword explorer & CSV export',
        'Board SEO health audit',
      ],
      notIncluded: [
        'Visual Pin generation',
        'Nightly 01:00 auto-generation',
        'Swipe-deck approval',
        'Smart schedule auto-posting',
      ],
    },
    {
      id: 'start',
      name: t.pricing.planStartTitle,
      subtitle: t.pricing.planStartSubtitle,
      summary: t.pricing.planStartDesc,
      priceRub: '1 990 ₽',
      priceUsd: '$24,0',
      period: '/ мес',
      credits: 400,
      accounts: 'до 3',
      popular: false,
      badge: null,
      features: [
        'All Analytics plan features',
        'Up to 3 connected Pinterest accounts',
        '400 monthly credits (burn on renewal)',
        'All 5 aspect ratios (2:3, 9:16, 3:4, 4:5, 1:1)',
        'Full HD image export (up to 1080×1920)',
        'Smart timing slots',
        'Purchase non-expiring credit packs',
      ],
      notIncluded: [
        'Nightly 01:00 auto-generation',
        'Swipe-deck approval',
      ],
    },
    {
      id: 'pro',
      name: t.pricing.planProTitle,
      subtitle: t.pricing.planProSubtitle,
      summary: t.pricing.planProDesc,
      priceRub: '4 990 ₽',
      priceUsd: '$60,1',
      period: '/ мес',
      credits: 1500,
      accounts: 'до 10',
      popular: true,
      badge: t.pricing.popularBadge,
      features: [
        'All Start plan features',
        'Up to 10 connected Pinterest accounts',
        '1,500 monthly credits (burn on renewal)',
        'Nightly 01:00 auto-generation with AI reasoning',
        'Interactive Swipe-deck approval flow',
        'Priority GPU graphics rendering',
        'Reverse-engineering top competitor pins',
        'Priority support chat',
      ],
      notIncluded: [
        'Unlimited accounts',
      ],
    },
    {
      id: 'agency',
      name: t.pricing.planAgencyTitle,
      subtitle: t.pricing.planAgencySubtitle,
      summary: t.pricing.planAgencyDesc,
      priceRub: '12 990 ₽',
      priceUsd: '$156,5',
      period: '/ мес',
      credits: 6000,
      accounts: 'безлимит*',
      popular: false,
      badge: 'Agency Pro',
      features: [
        'All Pro plan features',
        'Unlimited connected accounts (без ограничений*)',
        '6,000 monthly credits (burn on renewal)',
        'Dedicated render cluster with instant queue',
        'Team access & moderator roles',
        'Dedicated Pinterest strategist consultant',
        'Unbranded white-label client PDF reports',
      ],
      notIncluded: [],
    },
  ];

  // Пакеты кредитов (НЕ сгорают). Цены задаёт серверный каталог backend/creditPacks.js —
  // клиент присылает только package_id, суммы приходят с бэкенда.
  const creditPacks = [
    {
      id: 'pack_100',
      name: 'Пакет S',
      credits: 100,
      pricePerCredit: '1,90 ₽',
      priceRub: '190 ₽',
      badge: null,
      popular: false,
    },
    {
      id: 'pack_500',
      name: 'Пакет M',
      credits: 500,
      pricePerCredit: '1,58 ₽',
      priceRub: '790 ₽',
      badge: t.pricing.popularBadge,
      popular: true,
    },
    {
      id: 'pack_1000',
      name: 'Пакет L',
      credits: 1000,
      pricePerCredit: '1,29 ₽',
      priceRub: '1 290 ₽',
      badge: 'Выгодно',
      popular: false,
    },
  ];

  // Реальная покупка пакета кредитов: POST /billing/credits → оплата Prodamus.
  // После оплаты вебхук зачисляет кредиты на баланс (пакеты не сгорают).
  const handleBuyCredits = async (packId: string) => {
    setPayError(null);
    setPayingPackId(packId);
    try {
      await buyCreditsAndRedirect(packId);
    } catch (e: any) {
      setPayError(e?.message || t.pricing.paymentError || 'Не удалось создать платёж');
      setPayingPackId(null);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    setChatMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatInput('');

    setTimeout(() => {
      let reply = `PinPosy AI: «${userText}». `;
      if (userText.toLowerCase().includes('аккаунт') || userText.toLowerCase().includes('account')) {
        reply += 'Для ведения нескольких клиентов или досок рекомендуем тариф «Про» (до 10 аккаунтов) или «Agency» (без ограничений).';
      } else if (userText.toLowerCase().includes('сгора') || userText.toLowerCase().includes('burn') || userText.toLowerCase().includes('expire')) {
        reply += t.pricing.deductionRule;
      } else {
        reply += 'Для большинства активных авторов оптимален тариф «Про» — 1 500 кредитов/мес и ночная автогенерация с утверждением в 1 клик.';
      }
      setChatMessages((prev) => [...prev, { sender: 'ai', text: reply }]);
    }, 600);
  };

  return (
    <div className="space-y-7 pb-10">
      {/* Header & Currency Switcher */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-primary-theme font-heading">
            {t.pricing.title}
          </h1>
          <p className="text-xs md:text-sm text-secondary-theme mt-1 max-w-2xl">
            {t.pricing.subtitle}
          </p>
        </div>

        {/* Currency & Tabs Switchers */}
        <div className="flex items-center gap-3 flex-wrap">
          {activeTab === 'plans' && (
            <>
          {/* Currency Toggle */}
          <div className="bg-subtle p-1 rounded-xl border border-subtle flex items-center gap-1 text-xs font-semibold">
            <button
              onClick={() => setCurrency('rub')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                currency === 'rub'
                  ? 'accent-btn shadow-xs font-bold'
                  : 'text-secondary-theme hover:text-primary-theme'
              }`}
            >
              {t.pricing.currencyRub}
            </button>
            <button
              onClick={() => setCurrency('usd')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                currency === 'usd'
                  ? 'accent-btn shadow-xs font-bold'
                  : 'text-secondary-theme hover:text-primary-theme'
              }`}
            >
              {t.pricing.currencyUsd}
            </button>
          </div>

            </>
          )}

          {/* Section Tabs */}
          <div className="bg-subtle p-1 rounded-xl border border-subtle flex items-center gap-1 text-xs md:text-sm font-semibold">
            <button
              onClick={() => setActiveTab('plans')}
              className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'plans'
                  ? 'accent-btn shadow-xs font-bold'
                  : 'text-secondary-theme hover:text-primary-theme'
              }`}
            >
              {t.pricing.tabPlans}
            </button>
            <button
              onClick={() => setActiveTab('credits')}
              className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'credits'
                  ? 'accent-btn shadow-xs font-bold'
                  : 'text-secondary-theme hover:text-primary-theme'
              }`}
            >
              <Coins className="w-4 h-4" />
              <span>{t.pricing.tabCredits}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Credit Balance & Priority Breakdown Card */}
      <div className="custom-card p-5 rounded-2xl border-l-4 border-l-accent flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 bg-gradient-to-r from-subtle/80 via-surface to-surface">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary-theme uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent-ghost" />
              <span>{t.pricing.balanceTitle}</span>
            </span>
            <span className="font-mono text-lg font-black text-primary-theme">
              {totalBalance.toLocaleString()} {t.nav.creditsLeft}
            </span>
          </div>

          <p className="text-[11px] text-muted-theme leading-relaxed pt-0.5">
            {t.pricing.deductionRule}
          </p>
        </div>

        <button
          onClick={() => setActiveTab('credits')}
          className="accent-btn self-start lg:self-auto px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs cursor-pointer whitespace-nowrap"
        >
          <Coins className="w-4 h-4" />
          <span>{t.pricing.topupCreditsBtn}</span>
        </button>
      </div>

      {/* Error Banner (ошибка создания платежа — подписки и пакеты) */}
      {payError && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs md:text-sm font-semibold flex items-center gap-2.5">
          <X className="w-5 h-5 shrink-0 text-red-500" />
          <span>{payError}</span>
        </div>
      )}

      {/* TAB 1: SUBSCRIPTION PLANS (Часть 1) */}
      {activeTab === 'plans' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map((plan) => {
              const isCurrent = currentPlanId === plan.id;
              const displayPrice = currency === 'rub' ? plan.priceRub : plan.priceUsd;
              const secondaryPrice = currency === 'rub' ? plan.priceUsd : plan.priceRub;

              return (
                <div
                  key={plan.id}
                  className={`custom-card p-5 md:p-6 rounded-3xl flex flex-col justify-between space-y-6 relative transition-all duration-200 ${
                    plan.popular
                      ? 'ring-2 ring-accent shadow-xl border-accent/40 bg-gradient-to-b from-subtle/50 to-surface'
                      : 'hover:border-strong'
                  }`}
                >
                  {plan.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider accent-btn shadow-md">
                      {plan.badge}
                    </span>
                  )}

                  <div className="space-y-4">
                    {/* Header */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-muted-theme uppercase tracking-wider">
                          {plan.subtitle}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-primary-theme font-heading">
                        {plan.name}
                      </h3>
                      <p className="text-[11px] text-secondary-theme mt-1 leading-relaxed min-h-[32px]">
                        {plan.summary}
                      </p>
                    </div>

                    {/* Price Block */}
                    <div className="pt-2 border-t border-subtle">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl md:text-3xl font-extrabold font-mono text-primary-theme">
                          {displayPrice}
                        </span>
                        <span className="text-xs text-muted-theme">{plan.period}</span>
                      </div>
                      <span className="text-[11px] text-muted-theme block mt-0.5 font-mono">
                        {secondaryPrice}
                      </span>
                    </div>

                    {/* Key Metrics Chips */}
                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      <div className="p-2 rounded-xl bg-subtle border border-subtle">
                        <span className="text-[10px] text-muted-theme block uppercase font-medium">
                          {t.pricing.creditsPerMonth}
                        </span>
                        <span className="font-mono font-bold text-primary-theme">
                          {plan.credits === 0 ? '0' : plan.credits.toLocaleString()}
                        </span>
                        <span className="text-[9px] text-amber-500 block leading-none mt-0.5">
                          {t.pricing.burnsNotice}
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-subtle border border-subtle">
                        <span className="text-[10px] text-muted-theme block uppercase font-medium">
                          {t.pricing.accountsLabel}
                        </span>
                        <span className="font-semibold text-primary-theme text-[11px] block truncate">
                          {plan.accounts}
                        </span>
                      </div>
                    </div>

                    {/* Features List */}
                    <div className="pt-3 border-t border-subtle space-y-2 text-xs">
                      <span className="text-[10px] font-bold text-muted-theme uppercase tracking-wider block">
                        {t.pricing.includedFeatures}
                      </span>
                      {plan.features.map((feat, i) => (
                        <div key={i} className="flex items-start gap-2 text-secondary-theme">
                          <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                          <span className="leading-snug text-[11px]">{feat}</span>
                        </div>
                      ))}

                      {plan.notIncluded.map((nInc, i) => (
                        <div key={i} className="flex items-start gap-2 text-muted-theme opacity-50">
                          <X className="w-3.5 h-3.5 text-muted-theme mt-0.5 shrink-0" />
                          <span className="leading-snug text-[11px]">{nInc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Select Plan Button */}
                  <button
                    onClick={() => handlePay(plan.id)}
                    disabled={payingId === plan.id}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs md:text-sm font-semibold transition-all cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-wait ${
                      isCurrent
                        ? 'bg-surface text-primary-theme border border-accent font-bold hover:bg-subtle'
                        : plan.popular
                        ? 'accent-btn'
                        : 'border border-subtle bg-surface hover:bg-subtle text-primary-theme'
                    }`}
                  >
                    {payingId === plan.id
                      ? t.pricing.paymentCreating || 'Создаём счёт…'
                      : isCurrent
                      ? 'Продлить тариф'
                      : `${t.pricing.choosePlan} «${plan.name}»`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Transparent Credit Expiry & Rollover Notice */}
          <div className="p-5 rounded-2xl bg-subtle border border-subtle space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-primary-theme font-heading">
              <Info className="w-4 h-4 text-accent-ghost" />
              <span>{t.pricing.rulesTitle}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-secondary-theme leading-relaxed">
              <div className="p-3.5 rounded-xl bg-surface border border-subtle space-y-1">
                <span className="font-bold text-primary-theme block flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t.pricing.rule1Title}</span>
                </span>
                <p className="text-[11px] text-muted-theme">
                  {t.pricing.rule1Desc}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-subtle space-y-1">
                <span className="font-bold text-primary-theme block flex items-center gap-1.5">
                  <InfinityIcon className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{t.pricing.rule2Title}</span>
                </span>
                <p className="text-[11px] text-muted-theme">
                  {t.pricing.rule2Desc}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-subtle space-y-1">
                <span className="font-bold text-primary-theme block flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-accent-ghost" />
                  <span>{t.pricing.rule3Title}</span>
                </span>
                <p className="text-[11px] text-muted-theme">
                  {t.pricing.rule3Desc}
                </p>
              </div>
            </div>

            {/* Peak Load & SLA Official Policy Card */}
            <div className="p-4 rounded-xl bg-surface border border-subtle flex items-start gap-3 text-xs leading-relaxed">
              <div className="p-2 rounded-lg bg-subtle text-accent-ghost shrink-0 mt-0.5 border border-subtle">
                <Clock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <span className="font-bold text-primary-theme block font-heading">
                  {t.terms.peakLoadTitle}
                </span>
                <p className="text-[11px] text-secondary-theme leading-relaxed">
                  {t.terms.peakLoadNotice}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ONE-TIME CREDIT PACKS (Часть 2 — Докупка кредитов) */}
      {activeTab === 'credits' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-subtle border border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
                <Coins className="w-5 h-5 text-accent-ghost" />
                <span>{t.pricing.creditsPackTitle}</span>
              </h3>
              <p className="text-xs text-secondary-theme mt-1 max-w-3xl leading-relaxed">
                {t.pricing.creditsPackDesc}
              </p>
              <p className="text-[11px] text-muted-theme mt-2">
                {t.pricing.creditPacksCurrencyNotice}
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              {t.pricing.neverBurnBadge}
            </span>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {creditPacks.map((pack) => {
              // Пакеты продаются только за рубли (цены — серверный каталог)
              const displayPrice = pack.priceRub;

              return (
                <div
                  key={pack.id}
                  className={`custom-card p-5 rounded-3xl flex flex-col justify-between space-y-4 relative transition-all ${
                    pack.popular
                      ? 'border-accent ring-2 ring-accent/40 shadow-lg bg-gradient-to-b from-subtle/40 to-surface'
                      : 'hover:border-strong'
                  }`}
                >
                  {pack.badge && (
                    <span className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider accent-btn shadow-xs">
                      {pack.badge}
                    </span>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary-theme font-heading uppercase tracking-wider">
                        {pack.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-subtle text-secondary-theme">
                        {pack.pricePerCredit} / pin
                      </span>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-extrabold font-mono text-primary-theme">
                          +{pack.credits.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-theme font-medium">{t.nav.creditsLeft}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-subtle">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold font-mono text-primary-theme">
                          {displayPrice}
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5 font-semibold">
                        {t.pricing.neverBurnBadge}
                      </span>
                      <div className="text-[10px] text-muted-theme mt-1">
                        {t.pricing.thPricePerCredit}:{' '}
                        <span className="font-mono font-bold text-primary-theme">{pack.pricePerCredit}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleBuyCredits(pack.id)}
                    disabled={payingPackId === pack.id}
                    className="w-full accent-btn py-2.5 px-3 rounded-xl text-xs font-semibold cursor-pointer shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>
                      {payingPackId === pack.id
                        ? t.pricing.paymentCreating || 'Создаём счёт…'
                        : `${t.pricing.buyCreditsBtn} (+${pack.credits})`}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Full Economics Table */}
          <div className="custom-card p-5 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-primary-theme uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent-ghost" />
              <span>{t.pricing.summaryTableTitle}</span>
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-subtle text-muted-theme uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">{t.pricing.thPack}</th>
                    <th className="py-2.5 px-3">{t.pricing.thCredits}</th>
                    <th className="py-2.5 px-3">{t.pricing.thPricePerCredit}</th>
                    <th className="py-2.5 px-3">{t.pricing.thPriceRub}</th>
                    <th className="py-2.5 px-3 text-right">{t.pricing.thAction}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {creditPacks.map((row) => (
                    <tr key={row.id} className="hover:bg-subtle/50 transition-colors">
                      <td className="py-3 px-3 font-bold text-primary-theme">{row.name}</td>
                      <td className="py-3 px-3 font-mono font-bold text-primary-theme">
                        +{row.credits.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 font-mono text-secondary-theme">{row.pricePerCredit}</td>
                      <td className="py-3 px-3 font-mono font-semibold text-primary-theme">{row.priceRub}</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleBuyCredits(row.id)}
                          disabled={payingPackId === row.id}
                          className="accent-btn px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-wait"
                        >
                          {t.pricing.buyCreditsBtn}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* История покупок кредитов (credit_purchases, миграция 007) */}
          {purchases.length > 0 && (
            <div className="custom-card p-5 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-primary-theme uppercase tracking-wider flex items-center gap-2">
                <ReceiptText className="w-4 h-4 text-accent-ghost" />
                <span>{t.purchases?.purchasesHistoryTitle || 'История покупок кредитов'}</span>
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-subtle text-muted-theme uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">{t.purchases?.thPack || 'Пакет'}</th>
                      <th className="py-2.5 px-3">{t.purchases?.thCredits || 'Кредитов'}</th>
                      <th className="py-2.5 px-3">{t.purchases?.thAmount || 'Сумма'}</th>
                      <th className="py-2.5 px-3">{t.purchases?.thStatus || 'Статус'}</th>
                      <th className="py-2.5 px-3">{t.purchases?.thDate || 'Дата'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {purchases.map((p) => (
                      <tr key={p.id} className="hover:bg-subtle/50 transition-colors">
                        <td className="py-3 px-3 font-bold text-primary-theme">
                          {p.pack_title || p.package_id}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-primary-theme">
                          +{p.credits.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-primary-theme">
                          {Number(p.amount).toFixed(0)} ₽
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              p.status === 'success'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : p.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                : 'bg-red-500/10 text-red-600 dark:text-red-400'
                            }`}
                          >
                            {purchaseStatusLabels[p.status] || p.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-secondary-theme">
                          {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-theme flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                {t.purchases?.neverBurn || 'Кредиты из оплаченных пакетов зачислены на баланс и не сгорают.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* AI Strategist Chat Assistant Section */}
      <div className="custom-card p-6 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-3">
          <div>
            <h3 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-accent-ghost" />
              <span>{t.pricing.aiBotTitle}</span>
            </h3>
            <p className="text-xs text-muted-theme mt-0.5">
              {t.pricing.aiBotSubtitle}
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t.pricing.aiBotOnline}</span>
          </span>
        </div>

        {/* Chat History */}
        <div className="space-y-3 max-h-64 overflow-y-auto p-4 rounded-2xl bg-subtle">
          {chatMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-lg p-3 rounded-2xl text-xs md:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'accent-btn rounded-br-xs'
                    : 'bg-surface border border-subtle text-primary-theme rounded-bl-xs shadow-xs'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={t.pricing.aiBotPlaceholder}
            className="flex-1 px-3.5 py-2.5 text-xs md:text-sm bg-app-input border border-subtle rounded-xl text-primary-theme focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            className="accent-btn px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <span>{t.pricing.aiBotAsk}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
