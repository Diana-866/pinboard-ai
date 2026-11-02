import { apiRequest } from './api';

export type PayablePlan = 'analytics' | 'start' | 'pro' | 'agency';

export interface PaymentIntent {
  ok: boolean;
  subscription_id: string;
  order_id: string;
  plan: PayablePlan;
  amount: number;
  currency: string;
  payment_url: string;
  demo: boolean;
}

/**
 * Создаёт платёж на бэкенде (POST /billing/create-payment) и уводит браузер
 * на страницу оплаты Prodamus. Возвращает ссылку — на случай, если редирект
 * заблокирован (например, открытие в новой вкладке).
 */
export async function startPayment(
  plan: PayablePlan,
  currency: 'rub' | 'usd' = 'rub'
): Promise<PaymentIntent> {
  const data: PaymentIntent = await apiRequest('/billing/create-payment', {
    method: 'POST',
    body: JSON.stringify({ plan, currency }),
  });
  if (!data?.payment_url) {
    throw new Error('Сервер не вернул ссылку на оплату. Попробуйте ещё раз или напишите в поддержку.');
  }
  return data;
}

/** Платёж + немедленный переход к оплате */
export async function payAndRedirect(plan: PayablePlan, currency: 'rub' | 'usd' = 'rub') {
  const data = await startPayment(plan, currency);
  window.location.href = data.payment_url;
  return data;
}

export interface SubscriptionRow {
  id: string;
  plan: string;
  status: 'pending' | 'success' | 'canceled' | 'denied' | 'expired';
  amount: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  provider_payment_id: string | null;
  email?: string | null;
  user_id?: string;
}

// --- Пакеты кредитов (разовые покупки, НЕ сгорают) ---

export interface CreditPack {
  id: string;
  title: string;
  credits: number;
  amount: { rub: number };
}

export interface CreditsPaymentIntent {
  ok: boolean;
  purchase_id: string;
  order_id: string;
  package_id: string;
  credits: number;
  amount: number;
  currency: string;
  payment_url: string;
  demo: boolean;
}

export interface CreditPurchaseRow {
  id: string;
  package_id: string;
  pack_title: string | null;
  credits: number;
  status: 'pending' | 'success' | 'canceled' | 'denied';
  amount: number;
  currency: string;
  paid_at: string | null;
  balance_credited_at: string | null;
  created_at: string;
  provider_payment_id: string | null;
}

/** Каталог пакетов кредитов с ценами (GET /billing/credit-packs) */
export async function fetchCreditPacks(): Promise<CreditPack[]> {
  const data = await apiRequest('/billing/credit-packs');
  return data?.packs || [];
}

/** Покупка пакета: POST /billing/credits { package_id } → pending-покупка + ссылка Prodamus */
export async function startCreditsPurchase(packageId: string): Promise<CreditsPaymentIntent> {
  const data: CreditsPaymentIntent = await apiRequest('/billing/credits', {
    method: 'POST',
    body: JSON.stringify({ package_id: packageId }),
  });
  if (!data?.payment_url) {
    throw new Error('Сервер не вернул ссылку на оплату. Попробуйте ещё раз или напишите в поддержку.');
  }
  return data;
}

/** Покупка пакета + немедленный переход к оплате */
export async function buyCreditsAndRedirect(packageId: string) {
  const data = await startCreditsPurchase(packageId);
  window.location.href = data.payment_url;
  return data;
}

/** История покупок пакетов и текущий баланс (GET /billing/credit-purchases) */
export async function fetchCreditPurchases(): Promise<{ balance: number; purchases: CreditPurchaseRow[] }> {
  return apiRequest('/billing/credit-purchases');
}
