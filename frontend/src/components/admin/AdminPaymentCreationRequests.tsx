import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../lib/api';

type PaymentCreationRequest = {
  id: string;
  user_id: string;
  request_kind: 'subscription' | 'credits';
  status: 'unknown' | 'creating';
  error_code: string | null;
  created_at: string;
  updated_at: string;
  age_minutes: number | null;
  requires_provider_reconciliation: boolean;
  stale_creation: boolean;
};

type QueueResponse = {
  read_only: boolean;
  automatic_reconciliation: boolean;
  limit: number;
  count: number;
  unknown_count: number;
  creating_count: number;
  stale_creation_count: number;
  items: PaymentCreationRequest[];
  note: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата неизвестна' : date.toLocaleString();
}

export const AdminPaymentCreationRequests: React.FC = () => {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/admin/billing/payment-creation-requests?limit=100') as QueueResponse;
      if (!result || !Array.isArray(result.items) || result.read_only !== true) {
        throw new Error('Сервер вернул некорректный формат очереди платежей.');
      }
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить очередь платежей.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-5 animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary-theme">Неопределённые запросы оплаты</h2>
          <p className="text-sm text-muted-theme mt-1 max-w-3xl">
            Здесь отображаются запросы, для которых создание счёта могло завершиться без подтверждения от Prodamus.
            Очередь доступна только для чтения: автоматический повтор платежа запрещён.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-subtle bg-surface text-sm font-semibold hover:bg-subtle disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="custom-card rounded-2xl p-4">
          <span className="text-xs text-muted-theme">Требуют сверки с провайдером</span>
          <strong className="block text-2xl mt-1 text-amber-600">{data?.unknown_count ?? '—'}</strong>
        </div>
        <div className="custom-card rounded-2xl p-4">
          <span className="text-xs text-muted-theme">Создаются</span>
          <strong className="block text-2xl mt-1 text-primary-theme">{data?.creating_count ?? '—'}</strong>
        </div>
        <div className="custom-card rounded-2xl p-4">
          <span className="text-xs text-muted-theme">Зависшие более 2 минут</span>
          <strong className="block text-2xl mt-1 text-rose-600">{data?.stale_creation_count ?? '—'}</strong>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200 flex gap-3">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <strong className="block">Безопасная ручная сверка</strong>
          <p className="mt-1">Сначала проверьте заказ и входящие уведомления в кабинете Prodamus. Не сбрасывайте запись и не создавайте новый счёт, пока не установлен фактический статус старого заказа.</p>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error}</div>}
      {loading && !data && <p className="text-sm text-muted-theme">Загружаем очередь…</p>}
      {!loading && !error && data?.items.length === 0 && (
        <div className="custom-card rounded-2xl p-8 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500" />
          <p className="font-semibold text-primary-theme mt-2">Проблемных запросов нет</p>
          <p className="text-sm text-muted-theme mt-1">В очереди нет платежей, требующих проверки.</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="custom-card rounded-2xl border border-subtle overflow-hidden">
          <div className="p-4 border-b border-subtle flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-primary-theme text-sm">Очередь запросов</h3>
              <p className="text-xs text-muted-theme mt-0.5">Показано {data.count} · максимум {data.limit}</p>
            </div>
            <span className="text-[11px] rounded-full px-2 py-1 bg-subtle text-secondary-theme">Только чтение</span>
          </div>
          <div className="divide-y divide-subtle">
            {data.items.map((item) => (
              <article key={item.id} className="p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold rounded-full px-2 py-1 ${item.status === 'unknown' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'}`}>
                      {item.status === 'unknown' ? 'Исход неизвестен' : 'Создание счёта'}
                    </span>
                    {item.stale_creation && <span className="text-xs text-rose-600 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Зависший запрос</span>}
                    <span className="text-xs text-muted-theme">{item.request_kind === 'subscription' ? 'Подписка' : 'Пакет кредитов'}</span>
                  </div>
                  <p className="font-mono text-xs text-secondary-theme mt-2 break-all">ID: {item.id}</p>
                  <p className="text-xs text-muted-theme mt-1">Пользователь: {item.user_id}</p>
                  {item.error_code && <p className="text-xs text-muted-theme mt-1">Код ошибки: <span className="font-mono">{item.error_code}</span></p>}
                </div>
                <div className="text-xs text-muted-theme lg:text-right space-y-1">
                  <p className="inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> Возраст: {item.age_minutes === null ? 'неизвестен' : `${item.age_minutes} мин.`}</p>
                  <p>Создан: {formatDate(item.created_at)}</p>
                  <p>Обновлён: {formatDate(item.updated_at)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {data?.note && <p className="text-xs text-muted-theme">{data.note}</p>}
    </section>
  );
};
