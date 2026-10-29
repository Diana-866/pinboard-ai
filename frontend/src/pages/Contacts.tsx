import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Receipt, ShieldCheck, FileText, Globe2, Coins } from 'lucide-react';
import { useI18n } from '../i18n/i18nContext';

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

/* Актуальные цены. Должны совпадать с:
 *   - лендингом (frontend/src/pages/Landing.tsx, tariffPlans),
 *   - кабинетом (frontend/src/components/pricing/PricingView.tsx, plans),
 *   - бэкендом (backend/billing.js, PLANS) — именно эти суммы уходят в Prodamus. */
const PLANS = [
  { id: 'analytics', ru: 'Аналитика', en: 'Analytics', rub: '990 ₽', usd: '$11.9' },
  { id: 'start', ru: 'Старт', en: 'Start', rub: '1 990 ₽', usd: '$24.0' },
  { id: 'pro', ru: 'Про', en: 'Pro', rub: '4 990 ₽', usd: '$60.1' },
  { id: 'agency', ru: 'Agency', en: 'Agency', rub: '12 990 ₽', usd: '$156.5' },
];

export const Contacts: React.FC = () => {
  const { language } = useI18n();
  const ru = language === 'ru';

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
            {PLANS.map((p) => (
              <div
                key={p.id}
                className="flex items-baseline justify-between gap-3 border-b border-[#F2DFE4] py-2.5 last:border-0"
              >
                <span className="text-[13.5px] font-semibold text-[#2A1F24]">{ru ? p.ru : p.en}</span>
                <span className="whitespace-nowrap text-[13.5px] font-semibold text-[#A94D5F]">
                  {p.rub} <span className="font-normal text-[#8A6E76]">{ru ? '/ мес' : '/ mo'}</span>
                  <span className="ml-2 font-normal text-[#B29AA1]">{p.usd}</span>
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="text-[13.5px] font-semibold text-[#2A1F24]">
                {ru ? 'Пакеты кредитов (бессрочные)' : 'Credit packs (non-expiring)'}
              </span>
              <span className="whitespace-nowrap text-[13.5px] font-semibold text-[#A94D5F]">
                {ru ? 'от 550 ₽' : 'from 550 ₽'}
              </span>
            </div>
          </div>

          <p className="mt-2 text-[11.5px] leading-relaxed text-[#B29AA1]">
            {ru
              ? 'В рублях для карт РФ, в долларах США для зарубежных карт (комиссия платёжного сервиса за зарубежные платежи — 10%). Цены одинаковы на лендинге, в кабинете и на этой странице.'
              : 'Charged in RUB for Russian cards and in USD for international cards (the payment provider charges a 10% fee on cross-border payments). Prices are identical on the landing page, in the app and on this page.'}
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
                ? 'Банковские карты Visa, Mastercard, МИР, а также зарубежные карты Visa и Mastercard — через платёжный сервис Prodamus. Данные карты вводятся на защищённой странице Prodamus и не попадают в PinPosy.'
                : 'Visa, Mastercard and MIR cards, plus international Visa and Mastercard — via the Prodamus payment service. Card details are entered on the secure Prodamus page and never reach PinPosy.'}
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
                ? 'Если сервис не работает или доступ не был предоставлен — напишите на support@pinposy.com с номером платежа, и мы вернём деньги на ту же карту в срок до 10 рабочих дней. Условия возврата также описаны в '
                : 'If the service does not work or access was not granted, e-mail support@pinposy.com with your payment ID and we will refund the same card within 10 business days. Refund terms are also described in the '}
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
