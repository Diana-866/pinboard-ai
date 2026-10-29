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
