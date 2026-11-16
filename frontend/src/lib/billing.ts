import { buildPaymentIdempotencyStorageKey } from '../utils/paymentIdempotencyStorageKey';
import { apiRequest, ApiError } from './api';

export type PayablePlan = 'analytics' | 'start' | 'pro' | 'agency';

const paymentIdempotencyKeys = new Map<string, string>();

function getPaymentIdempotencyKey(scope: string, ownerId: string): string {
  const storageKey = buildPaymentIdempotencyStorageKey(ownerId, scope);
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved && /^[A-Za-z0-9_-]{16,128}$/.test(saved)) return saved;
    const key = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(storageKey, key);
    return key;
  } catch {
    const saved = paymentIdempotencyKeys.get(storageKey);
    if (saved) return saved;
    const key = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    paymentIdempotencyKeys.set(storageKey, key);
    return key;
  }
}

function releaseFailedPaymentIdempotencyKey(scope: string, ownerId: string, error: unknown): void {
  // The server marks requests failed only before calling Prodamus. Unlike an
  // unknown provider outcome, this state is safe to retry with a fresh key.
  if (
    error instanceof ApiError &&
    ['payment_request_not_reusable', 'payment_already_settled'].includes(String(error.data?.code || ''))
  ) {
    releasePaymentIdempotencyKey(scope, ownerId);
  }
}

export function releasePaymentIdempotencyKey(scope: string, ownerId: string): void {
  const storageKey = buildPaymentIdempotencyStorageKey(ownerId, scope);
  paymentIdempotencyKeys.delete(storageKey);
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // The in-memory key is still cleared when browser storage is unavailable.
  }
}

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
  ownerId: string,
  currency: 'rub' | 'usd' = 'rub'
): Promise<PaymentIntent> {
  const scope = `subscription:${plan}:${currency}`;
  const idempotencyKey = getPaymentIdempotencyKey(scope, ownerId);
  let data: PaymentIntent;
  try {
    data = await apiRequest('/billing/create-payment', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ plan, currency }),
    });
  } catch (error) {
    releaseFailedPaymentIdempotencyKey(scope, ownerId, error);
    throw error;
  }
  if (!data?.payment_url) {
    throw new Error('Сервер не вернул ссылку на оплату. Попробуйте ещё раз или напишите в поддержку.');
  }
  // Keep the key while the checkout is open. If the browser fails to navigate
  // or the user reloads the page, retrying must reuse the same provider invoice.
  // The key is cleared only after the backend reports settled/terminal status.
  return data;
}

/** Платёж + немедленный переход к оплате */
export async function payAndRedirect(plan: PayablePlan, ownerId: string, currency: 'rub' | 'usd' = 'rub') {
  const data = await startPayment(plan, ownerId, currency);
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
export async function startCreditsPurchase(packageId: string, ownerId: string): Promise<CreditsPaymentIntent> {
  const scope = `credits:${packageId}:rub`;
  const idempotencyKey = getPaymentIdempotencyKey(scope, ownerId);
  let data: CreditsPaymentIntent;
  try {
    data = await apiRequest('/billing/credits', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ package_id: packageId }),
    });
  } catch (error) {
    releaseFailedPaymentIdempotencyKey(scope, ownerId, error);
    throw error;
  }
  if (!data?.payment_url) {
    throw new Error('Сервер не вернул ссылку на оплату. Попробуйте ещё раз или напишите в поддержку.');
  }
  // Keep the key while the checkout is open so a retry or page reload
  // reuses the same provider invoice instead of creating a second one.
  // The key is cleared only after the backend reports settled/terminal status.
  return data;
}

/** Покупка пакета + немедленный переход к оплате */
export async function buyCreditsAndRedirect(packageId: string, ownerId: string) {
  const data = await startCreditsPurchase(packageId, ownerId);
  window.location.href = data.payment_url;
  return data;
}

/** История покупок пакетов и текущий баланс (GET /billing/credit-purchases) */
export async function fetchCreditPurchases(): Promise<{ balance: number; purchases: CreditPurchaseRow[] }> {
  return apiRequest('/billing/credit-purchases');
}
