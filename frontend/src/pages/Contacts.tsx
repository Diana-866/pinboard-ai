import { formattingLocale } from '../lib/intlLocale';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Receipt, ShieldCheck, FileText, Globe2, Coins } from 'lucide-react';
import { useI18n } from '../i18n/i18nContext';
import { apiRequest } from '../lib/api';

const ROSE_CTA = '#B96B7C';

/* Реквизиты продавца. Prodamus на этапе проверки сайта требует, чтобы данные
 * исполнителя (ФИО + ИНН) были видны в подвале сайта или на странице «Контакты».
 * Эти же данные дублируются в подвале лендинга (frontend/src/pages/Landing.tsx). */
export const SELLER = {
  name: 'Баннова Диана Александровна',
  inn: '231294708907',
  status: 'Плательщик налога на профессиональный доход (самозанятая)',
  email: 'support@pinposy.com',
  site: 'https://pinposy.com',
};

const PLANS = [
  { id: 'analytics', ru: 'Аналитика', en: 'Analytics' },
  { id: 'start', ru: 'Старт', en: 'Start' },
  { id: 'pro', ru: 'Про', en: 'Pro' },
  { id: 'agency', ru: 'Agency', en: 'Agency' },
];

export const Contacts: React.FC = () => {
  const { language } = useI18n();
  const ru = language === 'ru';
  const [planPrices, setPlanPrices] = useState<Record<string, { rub: number; usd: number }> | null>(null);
  const [creditPackMin, setCreditPackMin] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/billing/plans')
      .then((res: any) => {
        if (!Array.isArray(res?.plans)) throw new Error('Invalid plan catalog');
        const next: Record<string, { rub: number; usd: number }> = {};
        for (const plan of res.plans) {
          const rub = Number(plan.amount?.rub);
          const usd = Number(plan.amount?.usd);
          if (!['analytics', 'start', 'pro', 'agency'].includes(plan.id) ||
              !Number.isFinite(rub) || rub <= 0 || !Number.isFinite(usd) || usd <= 0) {
            throw new Error('Invalid plan catalog entry');
          }
          next[plan.id] = { rub, usd };
        }
        if (Object.keys(next).length !== 4) throw new Error('Incomplete plan catalog');
        if (!cancelled) setPlanPrices(next);
      })
      .catch(() => {
        if (!cancelled) setPlanPrices({});
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/billing/credit-packs')
      .then((res: any) => {
        if (!Array.isArray(res?.packs)) throw new Error('Invalid credit pack catalog');
        const expected = ['pack_100', 'pack_500', 'pack_1000'];
        const prices = res.packs.map((pack: any) => {
          const amount = Number(pack.amount?.rub);
          if (!expected.includes(pack.id) || !Number.isFinite(amount) || amount <= 0) {
            throw new Error('Invalid credit pack catalog entry');
          }
          return amount;
        });
        if (prices.length !== expected.length || new Set(res.packs.map((pack: any) => pack.id)).size !== expected.length) {
          throw new Error('Incomplete credit pack catalog');
        }
        if (!cancelled) setCreditPackMin(Math.min(...prices));
      })
      .catch(() => {
        if (!cancelled) setCreditPackMin(null);
      });
    return () => { cancelled = true; };
  }, []);

  const formatPrice = (amount: number, currency: 'rub' | 'usd') =>
    new Intl.NumberFormat(formattingLocale(language), {
      minimumFractionDigits: currency === 'usd' ? 2 : 0,
      maximumFractionDigits: currency === 'usd' ? 2 : 0,
    }).format(amount) + (currency === 'rub' ? ' ₽' : ' $');

  const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex flex-col gap-0.5 border-b border-[#F2DFE4] py-3 last:border-0 sm:flex-row sm:gap-4">
      <span className="w-56 shrink-0 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#B29AA1]">
        {label}
      </span>
      <span className="text-[13.5px] leading-relaxed text-[#2A1F24]">{children}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8A6E76] transition-colors hover:text-[#A94D5F]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {ru ? 'На главную' : 'Back to home'}
        </Link>

        <h1 className="mt-6 font-heading text-2xl font-extrabold tracking-tight text-[#2A1F24] sm:text-3xl">
          {ru ? 'Контакты и реквизиты' : 'Contacts and details'}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#8A6E76]">
          {ru
            ? 'Сервис PinPosy — облачный инструмент для планирования и автоматизации Pinterest-контента.'
            : 'PinPosy is a cloud tool for planning and automating Pinterest content.'}
        </p>

        {/* Исполнитель */}
        <section className="mt-8 rounded-2xl border border-[#F2DFE4] bg-[#FDF6F7] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-heading text-sm font-extrabold text-[#2A1F24]">
            <ShieldCheck className="h-4 w-4" style={{ color: ROSE_CTA }} />
            {ru ? 'Исполнитель услуг' : 'Service provider'}
          </h2>
          <div className="mt-2">
            <Row label={ru ? 'ФИО' : 'Name'}>{SELLER.name}</Row>
            <Row label={ru ? 'ИНН' : 'Tax ID (INN)'}>
              <span className="font-mono">{SELLER.inn}</span>
            </Row>
            <Row label={ru ? 'Налоговый статус' : 'Tax status'}>
              {ru ? SELLER.status : 'Self-employed under the Russian professional income tax (NPD)'}
            </Row>
            <Row label={ru ? 'E-mail' : 'E-mail'}>
              <a href={`mailto:${SELLER.email}`} className="font-semibold text-[#A94D5F] hover:underline">
                {SELLER.email}
              </a>
            </Row>
            <Row label={ru ? 'Сайт' : 'Website'}>
              <a href={SELLER.site} className="text-[#A94D5F] hover:underline">
                pinposy.com
              </a>
            </Row>
          </div>
        </section>

        {/* Поддержка */}
        <section className="mt-6">
          <h2 className="flex items-center gap-2 font-heading text-sm font-extrabold text-[#2A1F24]">
            <Mail className="h-4 w-4" style={{ color: ROSE_CTA }} />
            {ru ? 'Связаться с нами' : 'Contact us'}
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#5F4A51]">
            {ru
              ? 'По любым вопросам — оплата, доступ, возврат, техническая проблема — пишите на '
              : 'For anything — payments, access, refunds, technical issues — write to '}
            <a href="mailto:support@pinposy.com" className="font-semibold text-[#A94D5F] hover:underline">
              support@pinposy.com
            </a>
            {ru ? '. Отвечаем в течение одного рабочего дня.' : '. We reply within one business day.'}
          </p>
        </section>

        {/* Тарифы и стоимость — третий пункт проверки сайта в Prodamus */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 font-heading text-sm font-extrabold text-[#2A1F24]">
            <Coins className="h-4 w-4" style={{ color: ROSE_CTA }} />
            {ru ? 'Тарифы и стоимость' : 'Plans and pricing'}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#8A6E76]">
            {ru
              ? 'Подписка оформляется на 30 дней с момента подтверждения оплаты. Автоматического продления и списаний без вашего действия нет — по окончании периода тариф продлевается вручную в разделе «Тарифы».'
              : 'A subscription runs for 30 days from payment confirmation. There is no automatic renewal or charge without your action — it is renewed manually in the Pricing section.'}
          </p>

          <div className="mt-3 rounded-2xl border border-[#F2DFE4] bg-white px-4 py-2">
            {PLANS.map((p) => {
              const amounts = planPrices?.[p.id];
              return (
              <div
                key={p.id}
                className="flex items-baseline justify-between gap-3 border-b border-[#F2DFE4] py-2.5 last:border-0"
              >
                <span className="text-[13.5px] font-semibold text-[#2A1F24]">{ru ? p.ru : p.en}</span>
                <span className="whitespace-nowrap text-[13.5px] font-semibold text-[#A94D5F]">
                  {amounts ? formatPrice(amounts.rub, 'rub') : '—'} <span className="font-normal text-[#8A6E76]">{ru ? '/ мес' : '/ mo'}</span>
                  <span className="ml-2 font-normal text-[#B29AA1]">{amounts ? formatPrice(amounts.usd, 'usd') : ''}</span>
                </span>
              </div>
              );
            })}
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="text-[13.5px] font-semibold text-[#2A1F24]">
                {ru ? 'Пакеты кредитов (бессрочные)' : 'Credit packs (non-expiring)'}
              </span>
              <span className="whitespace-nowrap text-[13.5px] font-semibold text-[#A94D5F]">
                {creditPackMin !== null
                  ? `${ru ? 'от' : 'from'} ${new Intl.NumberFormat(formattingLocale(language)).format(creditPackMin)} ₽`
                  : '—'}
              </span>
            </div>
          </div>

          <p className="mt-2 text-[11.5px] leading-relaxed text-[#B29AA1]">
            {ru
              ? 'Для подписки доступны цены в RUB и USD — выбранная валюта и доступные способы оплаты будут показаны на защищённой странице Prodamus перед подтверждением. Пакеты кредитов оплачиваются только в RUB. Итоговую сумму и возможные комиссии платёжного провайдера проверяйте до оплаты.'
              : 'Subscriptions are listed in RUB and USD. The selected currency and available payment methods are shown on Prodamus’s secure checkout page before confirmation. Credit packs are charged in RUB only. Review the final amount and any payment-provider fees before paying.'}
          </p>
        </section>

        {/* Оплата */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 font-heading text-sm font-extrabold text-[#2A1F24]">
            <Receipt className="h-4 w-4" style={{ color: ROSE_CTA }} />
            {ru ? 'Оплата, срок доступа и возврат' : 'Payment, access period and refunds'}
          </h2>
          <ul className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-[#5F4A51]">
            <li>
              <b>{ru ? 'Способ оплаты.' : 'Payment method.'}</b>{' '}
              {ru
                ? 'Доступные способы оплаты зависят от страны и отображаются на защищённой странице Prodamus. Данные карты вводятся на стороне платёжного сервиса и не сохраняются в PinPosy.'
                : 'Available payment methods depend on your country and are displayed on the secure Prodamus checkout page. Card details are entered with the payment provider and are not stored by PinPosy.'}
            </li>
            <li>
              <b>{ru ? 'Срок доступа.' : 'Access period.'}</b>{' '}
              {ru
                ? 'Подписка оформляется на 30 дней с момента подтверждения оплаты. Автоматического продления и списаний без вашего действия нет — по окончании периода вы продлеваете тариф вручную в разделе «Тарифы».'
                : 'A subscription runs for 30 days from payment confirmation. There is no automatic renewal or charge without your action — after the period ends you renew manually in the Pricing section.'}
            </li>
            <li>
              <b>{ru ? 'Чек.' : 'Receipt.'}</b>{' '}
              {ru
                ? 'Чек формируется в приложении «Мой налог» и направляется на e-mail, указанный при оплате.'
                : 'A receipt is generated in the Russian “My Tax” app and sent to the e-mail provided at checkout.'}
            </li>
            <li>
              <b>{ru ? 'Возврат.' : 'Refunds.'}</b>{' '}
              {ru
                ? 'Если сервис не работает, доступ не был предоставлен или платёж прошёл ошибочно — напишите на support@pinposy.com с номером платежа. Мы рассмотрим обращение; если основания для возврата подтвердятся, после одобрения оформим заявку на возврат в Prodamus. Фактический срок поступления денег зависит от платёжного провайдера и банка и может составлять до 30 рабочих дней. Условия возврата также описаны в '
                : 'If the Service is unavailable, paid access was not provided, or you were charged in error, e-mail support@pinposy.com with your payment ID. We will review your request; if a refund is approved, after approval, we will submit a refund request to Prodamus. The time it takes for the funds to reach you depends on the payment provider and your bank and may take up to 30 business days. Refund terms are also described in the '}
              <Link to="/terms" className="font-semibold text-[#A94D5F] hover:underline">
                {ru ? 'Условиях использования' : 'Terms of Service'}
              </Link>
              .
            </li>
          </ul>
        </section>

        {/* Документы */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 font-heading text-sm font-extrabold text-[#2A1F24]">
            <FileText className="h-4 w-4" style={{ color: ROSE_CTA }} />
            {ru ? 'Документы' : 'Documents'}
          </h2>
          <div className="mt-3 flex flex-col gap-2 text-[13.5px]">
            <Link to="/terms" className="font-semibold text-[#A94D5F] hover:underline">
              {ru ? 'Условия использования (оферта)' : 'Terms of Service'}
            </Link>
            <Link to="/privacy" className="font-semibold text-[#A94D5F] hover:underline">
              {ru ? 'Политика конфиденциальности' : 'Privacy Policy'}
            </Link>
          </div>
        </section>

        <p className="mt-10 flex items-start gap-2 rounded-xl border border-[#F2DFE4] bg-[#FDF6F7] p-4 text-[11.5px] leading-relaxed text-[#8A6E76]">
          <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: ROSE_CTA }} />
          <span>
            {ru
              ? 'PinPosy — цифровой сервис. Товары не отгружаются, физическая доставка не требуется. Услуга оказывается дистанционно с момента активации тарифа.'
              : 'PinPosy is a digital service. No goods are shipped and no physical delivery is required. The service is provided remotely from the moment the plan is activated.'}
          </span>
        </p>
      </div>
    </div>
  );
};
