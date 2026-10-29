import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, CreditCard, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { SubscriptionRow } from '../../lib/billing';

interface Payload {
  totals: { paidCount: number; paidAmount: number; pendingCount: number };
  subscriptions: SubscriptionRow[];
}

const STATUS_LABEL: Record<string, string> = {
  success: 'Оплачено',
  pending: 'Ожидает оплаты',
  canceled: 'Отменено клиентом',
  denied: 'Отклонено банком',
  expired: 'Истекло',
};

const STATUS_STYLE: Record<string, string> = {
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  canceled: 'bg-subtle text-muted-theme border-subtle',
  denied: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  expired: 'bg-subtle text-muted-theme border-subtle',
};

const PLAN_LABEL: Record<string, string> = {
  analytics: 'Аналитика',
  start: 'Старт',
  pro: 'Про',
  agency: 'Agency',
};

/**
 * Админка → «5. Подписки и платежи».
 * Читает GET /admin/subscriptions (таблица subscriptions, миграция 006).
 * Демо-данные не используются: если миграция не применена, покажем понятную ошибку.
 */
export const AdminSubscriptions: React.FC = () => {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('/admin/subscriptions');
      setData(res);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить подписки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data?.subscriptions || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary-theme font-heading flex items-center gap-2">
            <CreditCard className="w-4.5 h-4.5 text-accent-ghost" />
            Подписки и платежи Prodamus
          </h2>
          <p className="text-[11.5px] text-muted-theme mt-0.5">
            Таблица <span className="font-mono">subscriptions</span>: каждая попытка оплаты — отдельная
            строка со статусом. Успешный вебхук переводит <span className="font-mono">pending</span> в{' '}
            <span className="font-mono">success</span> и активирует тариф на 30 дней.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3.5 py-2 rounded-xl border border-subtle bg-subtle hover:bg-surface text-xs font-semibold text-secondary-theme hover:text-primary-theme flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="custom-card p-4">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-theme">
            Оплаченных подписок
          </span>
          <p className="mt-1 text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {data?.totals?.paidCount ?? 0}
          </p>
        </div>
        <div className="custom-card p-4">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-theme">
            Сумма оплат
          </span>
          <p className="mt-1 text-xl font-bold font-mono text-primary-theme">
            {(data?.totals?.paidAmount ?? 0).toLocaleString('ru-RU')} ₽
          </p>
        </div>
        <div className="custom-card p-4">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-theme">
            Ожидают оплаты
          </span>
          <p className="mt-1 text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {data?.totals?.pendingCount ?? 0}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {error}
            <br />
            Проверьте, что применена миграция{' '}
            <span className="font-mono">db/migrations/006_subscriptions.sql</span>.
          </span>
        </div>
      )}

      <div className="custom-card overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-subtle text-[10px] uppercase tracking-wider text-muted-theme">
              <th className="py-3 px-3">Дата</th>
              <th className="py-3 px-3">Пользователь</th>
              <th className="py-3 px-3">Тариф</th>
              <th className="py-3 px-3">Статус</th>
              <th className="py-3 px-3 text-right">Сумма</th>
              <th className="py-3 px-3">Период</th>
              <th className="py-3 px-3">order_id</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="py-8 px-3 text-center text-muted-theme">
                  Платежей ещё не было. Создайте демо-платёж из раздела «Тарифы» в кабинете.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-subtle/60 hover:bg-subtle/40 transition-colors">
                <td className="py-2.5 px-3 font-mono text-[11px] text-muted-theme whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="py-2.5 px-3 text-secondary-theme max-w-[220px] truncate">
                  {r.email || <span className="font-mono text-[10px] text-muted-theme">{r.user_id}</span>}
                </td>
                <td className="py-2.5 px-3 font-semibold text-primary-theme">
                  {PLAN_LABEL[r.plan] || r.plan}
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold ${
                      STATUS_STYLE[r.status] || 'bg-subtle text-muted-theme border-subtle'
                    }`}
                  >
                    {r.status === 'success' ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : r.status === 'pending' ? (
                      <Clock className="w-3 h-3" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-primary-theme tabular-nums whitespace-nowrap">
                  {Number(r.amount).toLocaleString('ru-RU')} {String(r.currency || 'rub').toUpperCase()}
                </td>
                <td className="py-2.5 px-3 font-mono text-[10.5px] text-muted-theme whitespace-nowrap">
                  {r.period_start && r.period_end
                    ? `${new Date(r.period_start).toLocaleDateString('ru-RU')} — ${new Date(
                        r.period_end
                      ).toLocaleDateString('ru-RU')}`
                    : '—'}
                </td>
                <td className="py-2.5 px-3 font-mono text-[10px] text-muted-theme max-w-[180px] truncate">
                  {r.provider_payment_id || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
