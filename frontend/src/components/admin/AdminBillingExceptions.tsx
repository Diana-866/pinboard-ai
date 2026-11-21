import { EMPTY_TIMESTAMP, formatTimestamp } from '../../lib/dateFormat';
import { formattingLocale } from '../../lib/intlLocale';
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface WebhookException {
  id: string;
  provider: string;
  payment_kind: 'subscription' | 'credits';
  order_id: string | null;
  payment_status: string | null;
  received_sum: string | null;
  received_currency: string | null;
  expected_amount: number | null;
  reason: string;
  created_at: string;
}

export const AdminBillingExceptions: React.FC = () => {
  const [rows, setRows] = useState<WebhookException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest('/admin/billing/webhook-exceptions?limit=100');
      setRows(data.exceptions || []);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить журнал платёжных исключений');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary-theme font-heading flex items-center gap-2">
            <ShieldAlert className="w-4.5 h-4.5 text-accent-ghost" />
            Исключения платёжных вебхуков
          </h2>
          <p className="text-[11.5px] text-muted-theme mt-0.5">
            Подписанные уведомления Prodamus, которые требуют ручной сверки. Исходные payload и персональные данные не показываются.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl border border-subtle bg-subtle hover:bg-surface text-xs font-semibold text-secondary-theme flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="custom-card overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-subtle text-[10px] uppercase tracking-wider text-muted-theme">
              <th className="py-3 px-3">Дата</th>
              <th className="py-3 px-3">Тип</th>
              <th className="py-3 px-3">Заказ</th>
              <th className="py-3 px-3">Статус</th>
              <th className="py-3 px-3 text-right">Получено</th>
              <th className="py-3 px-3 text-right">Ожидалось</th>
              <th className="py-3 px-3">Причина</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={7} className="py-8 px-3 text-center text-muted-theme">
                  Платёжных исключений пока нет.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-subtle/60 hover:bg-subtle/40">
                <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[10px] text-muted-theme">
                  {formatTimestamp(row.created_at, 'ru')}
                </td>
                <td className="py-2.5 px-3">{row.payment_kind === 'credits' ? 'Кредиты' : 'Подписка'}</td>
                <td className="py-2.5 px-3 font-mono text-[10px] max-w-[180px] truncate">{row.order_id || '—'}</td>
                <td className="py-2.5 px-3">{row.payment_status || '—'}</td>
                <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                  {row.received_sum || '—'} {row.received_currency?.toUpperCase() || ''}
                </td>
                <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                  {row.expected_amount == null ? EMPTY_TIMESTAMP : new Intl.NumberFormat(formattingLocale('ru')).format(row.expected_amount)}
                </td>
                <td className="py-2.5 px-3 max-w-[220px] break-words">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-theme">Показаны последние {rows.length} записей (максимум 100).</p>
    </div>
  );
};
