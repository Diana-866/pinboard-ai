import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, Check, Sparkles, Rocket, PartyPopper, CreditCard } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/i18nContext';
import { getOnboardingCopy } from '../../i18n/onboardingCopy';

/** Three-step onboarding shown until the user's profile is configured. */

const ROSE = '#B96B7C';
const ROSE_LIGHT = '#F4E1E6';

type PlanId = 'analytics' | 'start' | 'pro' | 'agency';

interface PlanCard {
  id: PlanId;
  name: string;
  price: string | null;
  tagline: string;
  features: string[];
  highlight?: boolean;
}


type Step = 1 | 2 | 3;

export const OnboardingWizard: React.FC = () => {
  const { refreshUser, user } = useAuth();
  const { language } = useI18n();
  const t = getOnboardingCopy(language);
  const [planPrices, setPlanPrices] = useState<Record<PlanId, number> | null>(null);
  const [planPricesError, setPlanPricesError] = useState(false);
  const plans: PlanCard[] = [
    { id: 'analytics', name: t.planAnalytics, price: planPrices ? new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US').format(planPrices.analytics) + ' ₽' : null, tagline: t.planAnalyticsTag, features: [...t.planAnalyticsFeatures] },
    { id: 'start', name: t.planStart, price: planPrices ? new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US').format(planPrices.start) + ' ₽' : null, tagline: t.planStartTag, features: [...t.planStartFeatures] },
    { id: 'pro', name: t.planPro, price: planPrices ? new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US').format(planPrices.pro) + ' ₽' : null, tagline: t.planProTag, features: [...t.planProFeatures], highlight: true },
    { id: 'agency', name: t.planAgency, price: planPrices ? new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US').format(planPrices.agency) + ' ₽' : null, tagline: t.planAgencyTag, features: [...t.planAgencyFeatures] },
  ];

  useEffect(() => {
    let active = true;
    apiRequest('/billing/plans')
      .then((response: any) => {
        if (!Array.isArray(response?.plans)) throw new Error('Invalid plan catalog');
        const next: Partial<Record<PlanId, number>> = {};
        for (const plan of response.plans) {
          const amount = Number(plan.amount?.rub);
          if (!['analytics', 'start', 'pro', 'agency'].includes(plan.id) || !Number.isFinite(amount) || amount <= 0) {
            throw new Error('Invalid plan catalog entry');
          }
          next[plan.id as PlanId] = amount;
        }
        if (Object.keys(next).length !== 4) throw new Error('Incomplete plan catalog');
        if (active) {
          setPlanPrices(next as Record<PlanId, number>);
          setPlanPricesError(false);
        }
      })
      .catch(() => {
        if (active) {
          setPlanPrices(null);
          setPlanPricesError(true);
        }
      });
    return () => { active = false; };
  }, [language]);
  const [step, setStep] = useState<Step>(1);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [productComment, setProductComment] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('pro');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<null | 'later' | 'pay'>(null);

  const URL_RE = /^https?:\/\/.+/i;

  /** Persist onboarding details and refresh the authenticated user. */
  async function completeOnboarding(intent: 'later' | 'pay') {
    setError('');
    setSaving(true);
    try {
      const url = websiteUrl.trim();
      // The website field is optional; non-empty values must use HTTP or HTTPS.
      if (url && !URL_RE.test(url)) {
        setError(t.urlError);
        setSaving(false);
        setStep(1);
        return;
      }
      if (productComment.length > 2000) {
        setError(t.commentError);
        setSaving(false);
        setStep(2);
        return;
      }
      await apiRequest('/me/onboarding', {
        method: 'PATCH',
        body: JSON.stringify({
          websiteUrl: url || null,
          productComment: productComment.trim() || '',
        }),
      });
      // Keep the wizard mounted until its completion screen is acknowledged.
      // Refreshing here would flip App.needsOnboarding and unmount this component.
      setDone(intent);
    } catch (e: any) {
      setError(t.saveError);
      setSaving(false);
    }
  }

  const finishOnboarding = async (tab: 'dashboard' | 'pricing') => {
    setError('');
    const refreshed = await refreshUser();
    if (!refreshed) {
      setError(language === 'ru'
        ? 'Данные сохранены, но не удалось обновить профиль. Проверьте соединение и нажмите ещё раз.'
        : 'Your details were saved, but the profile could not be refreshed. Check your connection and try again.');
      return;
    }
    // A successful refresh marks onboarding complete in App and unmounts this
    // wizard. Dispatch navigation afterwards so the requested destination wins.
    window.dispatchEvent(new CustomEvent('pinposy:navigate-tab', { detail: tab === 'pricing' ? { tab, planId: selectedPlan } : tab }));
  };

  const closeWizard = () => finishOnboarding('dashboard');
  const goPricing = () => finishOnboarding('pricing');

  // --- Confirmation after saving onboarding details ---
  if (done) {
    const isPay = done === 'pay';
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-page px-4 py-8">
        <div className="w-full max-w-md rounded-3xl border border-subtle bg-surface p-10 text-center shadow-2xl">
          {error && (
            <div role="alert" className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: ROSE_LIGHT }}
          >
            {isPay ? (
              <CreditCard className="h-7 w-7" style={{ color: ROSE }} />
            ) : (
              <PartyPopper className="h-7 w-7" style={{ color: ROSE }} />
            )}
          </div>
          {isPay ? (
            <>
              <h2
                className="text-2xl font-bold text-primary-theme"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {t.paymentTitle}
              </h2>
              <p className="mt-3 text-sm text-secondary-theme">
                {t.paymentBody}
              </p>
            </>
          ) : (
            <>
              <h2
                className="text-2xl font-bold text-primary-theme"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {t.readyTitle.replace('{ name }', user?.name ? `, ${user.name}` : '')} 🎉
              </h2>
              <p className="mt-3 text-sm text-secondary-theme">
                {t.readyBody}
              </p>
            </>
          )}
          <button type="button" onClick={goPricing} className="wizard-cta mt-6 w-full rounded-2xl py-3.5 text-sm font-bold">
            {t.pricingButton}
          </button>
          <button
            type="button"
            onClick={closeWizard}
            className="mt-2 w-full rounded-2xl py-3 text-sm font-semibold text-secondary-theme hover:text-primary-theme"
          >
            {t.workspaceButton}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-4 py-8"
      style={{ background: 'linear-gradient(160deg, #FFF9FA 0%, #FDF2F4 55%, #F7E9ED 100%)' }}
    >
      <div className="w-full max-w-lg">
        {/* Логотип */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5" style={{ color: ROSE }} />
          <span
            className="text-xl font-extrabold tracking-tight"
            style={{ color: ROSE, fontFamily: "'Outfit', sans-serif" }}
          >
            PinPosy
          </span>
        </div>

        <div className="rounded-3xl border border-subtle bg-surface p-8 shadow-xl md:p-10">
          {/* Прогресс: 3 шага */}
          <div className="mb-8 flex items-center gap-2">
            {([1, 2, 3] as Step[]).map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && (
                  <div
                    className="h-1 flex-1 rounded-full transition-colors duration-300"
                    style={{ backgroundColor: step >= s ? ROSE : ROSE_LIGHT }}
                  />
                )}
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300"
                  style={{
                    backgroundColor: step >= s ? ROSE : ROSE_LIGHT,
                    color: step >= s ? '#fff' : ROSE,
                  }}
                >
                  {step > s ? <Check className="h-4 w-4" /> : s}
                </div>
              </React.Fragment>
            ))}
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* --- Шаг 1: ссылка --- */}
          {step === 1 && (
            <div>
              <h2
                className="text-2xl font-bold tracking-tight text-primary-theme"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {t.linkTitle}
              </h2>
              <p className="mt-2 text-sm text-secondary-theme">
                {t.linkBody}
              </p>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder={t.linkPlaceholder}
                className="mt-6 w-full rounded-2xl border border-subtle bg-page px-4 py-3.5 text-sm text-primary-theme outline-none transition focus:border-accent"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setStep(2)}
                className="wizard-cta mt-8 w-full rounded-2xl py-3.5 text-sm font-bold"
              >
                {websiteUrl.trim() ? t.next : t.skip}
                <ArrowRight className="ml-1.5 inline h-4 w-4" />
              </button>
            </div>
          )}

          {/* --- Шаг 2: о продукте --- */}
          {step === 2 && (
            <div>
              <h2
                className="text-2xl font-bold tracking-tight text-primary-theme"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {t.aboutTitle}
              </h2>
              <p className="mt-2 text-sm text-secondary-theme">
                {t.aboutBody}
              </p>
              <textarea
                value={productComment}
                onChange={(e) => setProductComment(e.target.value.slice(0, 2000))}
                placeholder={t.aboutPlaceholder}
                rows={6}
                className="mt-6 w-full resize-none rounded-2xl border border-subtle bg-page px-4 py-3.5 text-sm text-primary-theme outline-none transition focus:border-accent"
                autoFocus
              />
              <p className="mt-1 text-right text-[11px] text-muted-theme">
                {productComment.length} / 2000
              </p>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="secondary-btn rounded-2xl px-5 py-3.5 text-sm"
                  aria-label={t.back}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="wizard-cta flex-1 rounded-2xl py-3.5 text-sm font-bold"
                >
                  {t.next}
                  <ArrowRight className="ml-1.5 inline h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* --- Шаг 3: тарифы --- */}
          {step === 3 && (
            <div>
              <h2
                className="text-2xl font-bold tracking-tight text-primary-theme"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {t.planTitle}
              </h2>
              <p className="mt-2 text-sm text-secondary-theme">
                {t.planBody}
              </p>

              <div className="mt-6 space-y-3">
                {plans.map((plan) => {
                  const isSelected = selectedPlan === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                        isSelected || plan.highlight
                          ? 'border-transparent shadow-lg'
                          : 'border-subtle hover:border-strong'
                      }`}
                      style={
                        isSelected
                          ? { boxShadow: `0 0 0 2px ${ROSE}`, borderColor: ROSE }
                          : plan.highlight
                            ? { boxShadow: `0 0 0 1.5px ${ROSE}`, borderColor: ROSE }
                            : undefined
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="font-bold text-primary-theme"
                              style={{ fontFamily: "'Outfit', sans-serif" }}
                            >
                              {plan.name}
                            </span>
                            {plan.highlight && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                                style={{ backgroundColor: ROSE }}
                              >
                                {t.popular}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-theme">{plan.tagline}</p>
                          <ul className="mt-2 space-y-1">
                            {plan.features.map((f) => (
                              <li
                                key={f}
                                className="flex items-center gap-1.5 text-xs text-secondary-theme"
                              >
                                <Check className="h-3 w-3 shrink-0" style={{ color: ROSE }} />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="shrink-0 text-right">
                          <div
                            className="text-xl font-extrabold"
                            style={{ color: ROSE, fontFamily: "'Outfit', sans-serif" }}
                          >
                            {plan.price || (planPricesError ? (language === 'ru' ? 'Цена недоступна' : 'Price unavailable') : (language === 'ru' ? 'Загрузка…' : 'Loading…'))}
                          </div>
                          <div className="text-[11px] text-muted-theme">{t.perMonth}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="secondary-btn rounded-2xl px-5 py-3.5 text-sm"
                  aria-label={t.back}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => completeOnboarding('later')}
                  disabled={saving}
                  className="secondary-btn flex-1 rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? t.save : t.later}
                </button>
                <button
                  type="button"
                  onClick={() => completeOnboarding('pay')}
                  disabled={saving}
                  className="wizard-cta flex-1 rounded-2xl py-3.5 text-sm font-bold disabled:opacity-50"
                >
                  <Rocket className="mr-1.5 inline h-4 w-4" />
                  {saving ? t.save : t.viewPlans}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
