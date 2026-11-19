import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Mail, RefreshCw, RotateCcw } from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface OutboxHealth {
  generated_at: string;
  counts: { pending: number; sending: number; stale_sending: number; dead: number };
  oldest_pending_at: string | null;
  oldest_pending_age_seconds: number | null;
  dead_items: Array<{
    id: string;
    attempts: number;
    max_attempts: number;
    last_error_code: string | null;
    created_at: string;
    updated_at: string;
  }>;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatAge(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds} сек.`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин.`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч. ${Math.floor((seconds % 3600) / 60)} мин.`;
  return `${Math.floor(seconds / 86400)} дн. ${Math.floor((seconds % 86400) / 3600)} ч.`;
}

export const AdminEmailOutbox: React.FC = () => {
  const [health, setHealth] = useState<OutboxHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requeueing, setRequeueing] = useState<string | null>(null);
  const [requeued, setRequeued] = useState<Record<string, { previous_attempts: number | null; template_key: string | null }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/admin/billing/email-outbox?limit=50');
      setHealth(result as OutboxHealth);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить состояние очереди');
    } finally {
      setLoading(false);
    }
  }, []);

  // A dead email is otherwise lost: the dispatcher gave up and nothing else could put it back.
  // The row id comes from the health payload above, and the server decides whether it is requeueable —
  // the panel only reports what the server confirmed, because "requeued" that is not true is worse
  // than no button at all.
  const requeue = useCallback(async (id: string) => {
    setRequeueing(id);
    setError('');
    try {
      const result = await apiRequest(`/admin/billing/email-outbox/${encodeURIComponent(id)}/requeue`, {
        method: 'POST',
      });
      const confirmed = result as { requeued?: boolean; previous_attempts?: number | null; template_key?: string | null };
      if (confirmed?.requeued !== true) {
        throw new Error('Сервер не подтвердил возврат письма в очередь.');
      }
      setRequeued((previous) => ({
        ...previous,
        [id]: {
          previous_attempts: confirmed.previous_attempts ?? null,
          template_key: confirmed.template_key ?? null,
        },
      }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось вернуть письмо в очередь');
    } finally {
      setRequeueing(null);
    }
  }, [load]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const counts = health?.counts;
  const cards = [
    { label: 'Ожидают отправки', value: counts?.pending, note: 'pending' },
    { label: 'Сейчас отправляются', value: counts?.sending, note: 'sending' },
    { label: 'Просроченная блокировка', value: counts?.stale_sending, note: 'stale_sending' },
    { label: 'Не доставлены после попыток', value: counts?.dead, note: 'dead' },
  ];

  return (
    <section className="space-y-5 animate-in fade-in duration-150">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary-theme flex items-center gap-2">
            <Mail className="w-5 h-5" /> Очередь транзакционных писем
          </h2>
          <p className="text-xs text-muted-theme mt-1">
            Только диагностика. Отправка и изменение статусов из этой панели недоступны.
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="px-3 py-2 rounded-xl border border-subtle text-xs font-semibold flex items-center gap-2 hover:bg-subtle disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {!health && loading && <div className="custom-card p-5 text-sm text-muted-theme">Загружаю состояние очереди…</div>}

      {health && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {cards.map((card) => (
              <div key={card.note} className="custom-card rounded-2xl p-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-theme">{card.label}</div>
                <div className="text-2xl font-bold font-mono text-primary-theme mt-2">{card.value ?? '—'}</div>
                <div className="text-[10px] text-muted-theme mt-1">{card.note}</div>
              </div>
            ))}
          </div>

          <div className="custom-card rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary-theme">
              <Clock3 className="w-4 h-4" /> Возраст очереди
            </div>
            <div className="text-xs text-secondary-theme">
              Самое старое ожидающее письмо: <strong>{formatDate(health.oldest_pending_at)}</strong>
            </div>
            <div className="text-xs text-secondary-theme">
              Возраст: <strong>{formatAge(health.oldest_pending_age_seconds)}</strong>
            </div>
            <div className="text-[10px] text-muted-theme">Срез данных: {formatDate(health.generated_at)} · автообновление раз в минуту</div>
          </div>

          <div className="custom-card rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-subtle flex items-center gap-2">
              {health.dead_items.length > 0
                ? <AlertTriangle className="w-4 h-4 text-rose-500" />
                : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              <h3 className="text-sm font-bold text-primary-theme">Письма, исчерпавшие лимит попыток</h3>
              <span className="text-xs text-muted-theme">({counts?.dead ?? 0} всего)</span>
            </div>
            {health.dead_items.length === 0 ? (
              <p className="p-4 text-sm text-emerald-600 dark:text-emerald-400">Нет писем со статусом dead.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-subtle text-muted-theme">
                    <tr>
                      <th className="p-3 font-semibold">ID записи</th>
                      <th className="p-3 font-semibold">Попытки</th>
                      <th className="p-3 font-semibold">Код ошибки</th>
                      <th className="p-3 font-semibold">Последнее изменение</th>
                      <th className="p-3 font-semibold">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.dead_items.map((item) => (
                      <tr key={item.id} className="border-t border-subtle">
                        <td className="p-3 font-mono text-secondary-theme">{item.id}</td>
                        <td className="p-3 text-primary-theme">{item.attempts}/{item.max_attempts}</td>
                        <td className="p-3 font-mono text-secondary-theme">{item.last_error_code || 'не указан'}</td>
                        <td className="p-3 text-secondary-theme">{formatDate(item.updated_at)}</td>
                        <td className="p-3">
                          {requeued[item.id] ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              В очереди
                              {requeued[item.id].template_key ? ` · ${requeued[item.id].template_key}` : ''}
                            </span>
                          ) : (
                            <button
                              onClick={() => void requeue(item.id)}
                              disabled={requeueing !== null}
                              className="px-2 py-1 rounded-lg border border-subtle text-[11px] font-semibold flex items-center gap-1 hover:bg-subtle disabled:opacity-50"
                            >
                              <RotateCcw className={`w-3 h-3 ${requeueing === item.id ? 'animate-spin' : ''}`} />
                              Вернуть в очередь
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="px-4 pb-4 text-[11px] text-muted-theme">
              Показаны последние 50 записей. Адреса получателей и содержимое писем не запрашиваются и не отображаются.
              Возврат в очередь сбрасывает счётчик попыток: письмо уйдёт повторно. Перед возвратом убедитесь,
              что SMTP не принял предыдущую попытку, иначе получатель увидит письмо дважды — это допустимо для
              активации подписки, но не для одноразовых кодов.
            </p>
          </div>
        </>
      )}
    </section>
  );
};
