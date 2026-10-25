import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Check, Sparkles, Rocket, PartyPopper, CreditCard } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

/**
 * Полноэкранный 3-шаговый онбординг в стиле лендинга
 * (грязно-розовый #B96B7C, скругления 16–24px, шрифт Outfit).
 * Показывается в /app, пока user.onboarded === false.
 */

const ROSE = '#B96B7C';
const ROSE_LIGHT = '#F4E1E6';

interface PlanCard {
  id: 'start' | 'standard' | 'pro';
  name: string;
  price: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

const PLANS: PlanCard[] = [
  {
    id: 'start',
    name: 'Старт',
    price: '390 ₽',
    tagline: 'Посмотреть, что происходит',
    features: ['Только аналитика', 'Статистика пинов и досок', 'Тренды Pinterest'],
  },
  {
    id: 'standard',
    name: 'Стандарт',
    price: '890 ₽',
    tagline: 'Всё, чтобы работать каждый день',
    features: [
      'Генерация пинов и досок',
      'Утверждение пинов (свайп-дека)',
      'Планировщик публикаций',
      'Аналитика включена',
    ],
    highlight: true,
  },
  {
    id: 'pro',
    name: 'Про',
    price: '1690 ₽',
    tagline: 'Максимум для роста',
    features: ['Всё из тарифа «Стандарт»', 'Приоритетная генерация', 'Приоритетная поддержка'],
  },
];

type Step = 1 | 2 | 3;

export const OnboardingWizard: React.FC = () => {
  const { refreshUser, user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [productComment, setProductComment] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<'start' | 'standard' | 'pro'>('standard');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<null | 'later' | 'pay'>(null);

  const URL_RE = /^https?:\/\/.+/i;

  /** Сохраняет онбординг на бэке (PATCH /me/onboarding) и обновляет user */
  async function completeOnboarding(intent: 'later' | 'pay') {
    setError('');
    setSaving(true);
    try {
      const url = websiteUrl.trim();
      // Шаг 1 можно пропустить: пустая ссылка допустима, но непустая — только http/https
      if (url && !URL_RE.test(url)) {
        setError('Ссылка должна начинаться с http:// или https://');
        setSaving(false);
        setStep(1);
        return;
      }
      if (productComment.length > 2000) {
        setError('Комментарий о продукте — до 2000 символов');
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
      await refreshUser();
      setDone(intent);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить. Попробуйте ещё раз.');
      setSaving(false);
    }
  }

  const closeWizard = () => {
    setDone(null);
    window.dispatchEvent(new CustomEvent('pinposy:navigate-tab', { detail: 'dashboard' }));
  };

  const goPricing = () => {
    setDone(null);
    window.dispatchEvent(new CustomEvent('pinposy:navigate-tab', { detail: 'pricing' }));
  };

  // --- Экран успеха / заглушка платежей ---
  if (done) {
    const isPay = done === 'pay';
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-page px-4 py-8">
        <div className="w-full max-w-md rounded-3xl border border-subtle bg-surface p-10 text-center shadow-2xl">
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
                Платежи скоро запустятся
              </h2>
              <p className="mt-3 text-sm text-secondary-theme">
                Тариф «{PLANS.find((p) => p.id === selectedPlan)?.name}» мы запомнили — как только
                оплату включим, первыми сообщим вам на почту.
              </p>
            </>
          ) : (
            <>
              <h2
                className="text-2xl font-bold text-primary-theme"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                Готово{user?.name ? `, ${user.name}` : ''}! 🎉
              </h2>
              <p className="mt-3 text-sm text-secondary-theme">
                Мы запомнили, что вы продвигаете. Пока тариф не выбран, открыт раздел
                «Аналитика» — остальное откроется после выбора тарифа.
              </p>
            </>
          )}
          <button type="button" onClick={goPricing} className="wizard-cta mt-6 w-full rounded-2xl py-3.5 text-sm font-bold">
            Перейти к тарифам
          </button>
          <button
            type="button"
            onClick={closeWizard}
            className="mt-2 w-full rounded-2xl py-3 text-sm font-semibold text-secondary-theme hover:text-primary-theme"
          >
            В кабинет
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
                Ссылка на то, что продвигаешь
              </h2>
              <p className="mt-2 text-sm text-secondary-theme">
                Сайт, блог или товар на маркетплейсе — так мы поймём нишу и стиль вашего контента.
                Можно пропустить и добавить позже.
              </p>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://мой-магазин.ру"
                className="mt-6 w-full rounded-2xl border border-subtle bg-page px-4 py-3.5 text-sm text-primary-theme outline-none transition focus:border-accent"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setStep(2)}
                className="wizard-cta mt-8 w-full rounded-2xl py-3.5 text-sm font-bold"
              >
                {websiteUrl.trim() ? 'Дальше' : 'Пропустить'}
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
                Расскажи о продукте
              </h2>
              <p className="mt-2 text-sm text-secondary-theme">
                Что продвигать и ваши пожелания: ниша, сколько пинов в день, стиль — всё, что
                поможет ИИ делать пины точнее.
              </p>
              <textarea
                value={productComment}
                onChange={(e) => setProductComment(e.target.value.slice(0, 2000))}
                placeholder="Например: продаю свечи ручной работы, аудитория — женщины 25–40, хочу 3 пина в день, стиль — уютный минимализм…"
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
                  aria-label="Назад"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="wizard-cta flex-1 rounded-2xl py-3.5 text-sm font-bold"
                >
                  Дальше
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
                Выбери тариф
              </h2>
              <p className="mt-2 text-sm text-secondary-theme">
                Можно начать с аналитики — генерация откроется на платном тарифе.
              </p>

              <div className="mt-6 space-y-3">
                {PLANS.map((plan) => {
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
                                Популярный
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
                            {plan.price}
                          </div>
                          <div className="text-[11px] text-muted-theme">/ мес</div>
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
                  aria-label="Назад"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => completeOnboarding('later')}
                  disabled={saving}
                  className="secondary-btn flex-1 rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? 'Сохраняем…' : 'Позже'}
                </button>
                <button
                  type="button"
                  onClick={() => completeOnboarding('pay')}
                  disabled={saving}
                  className="wizard-cta flex-1 rounded-2xl py-3.5 text-sm font-bold disabled:opacity-50"
                >
                  <Rocket className="mr-1.5 inline h-4 w-4" />
                  {saving ? 'Сохраняем…' : 'Оплатить'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
