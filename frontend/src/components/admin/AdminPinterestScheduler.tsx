import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface SchedulerHealth {
  generated_at: string;
  status: 'not_seen' | 'healthy' | 'running' | 'stale' | 'failed';
  stale_after_seconds?: number;
  running_timeout_seconds?: number;
  last_started_at?: string | null;
  last_completed_at?: string | null;
  last_started_age_seconds?: number | null;
  last_completed_age_seconds?: number | null;
  last_run_status?: string | null;
  counts?: { claimed: number; published: number; failed: number; scheduled: number; unknown: number };
  last_error_code?: string | null;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatAge(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds} сек.`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин.`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч. ${Math.floor((seconds % 3600) / 60)} мин.`;
  return `${Math.floor(seconds / 86400)} дн. ${Math.floor((seconds % 86400) / 3600)} ч.`;
}

const statusLabels: Record<string, string> = {
  not_seen: 'Worker ещё не запускался',
  healthy: 'Работает',
  running: 'Выполняет задачу',
  stale: 'Нет свежего heartbeat',
  failed: 'Последний запуск завершился ошибкой',
};

export const AdminPinterestScheduler: React.FC = () => {
  const [health, setHealth] = useState<SchedulerHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/admin/operations/pinterest-scheduler');
      const allowedStatuses = ['not_seen', 'healthy', 'running', 'stale', 'failed'];
      if (!result || typeof result !== 'object' || !allowedStatuses.includes(result.status)) {
        throw new Error('Сервер вернул некорректное состояние планировщика.');
      }
      if (requestId === requestIdRef.current) setHealth(result as SchedulerHealth);
    } catch (e) {
      if (requestId === requestIdRef.current) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить состояние планировщика');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => {
      window.clearInterval(timer);
      requestIdRef.current += 1;
    };
  }, [load]);

  const counts = health?.counts;
  const cards = [
    { label: 'В очереди', value: counts?.scheduled, note: 'scheduled' },
    { label: 'Забрано worker', value: counts?.claimed, note: 'claimed' },
    { label: 'Опубликовано', value: counts?.published, note: 'published' },
    { label: 'Ошибки', value: counts?.failed, note: 'failed' },
    { label: 'Неопределённый итог', value: counts?.unknown, note: 'unknown' },
  ];
  const isHealthy = health?.status === 'healthy' || health?.status === 'running';

  return (
    <section className="space-y-5 animate-in fade-in duration-150">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary-theme flex items-center gap-2">
            <Activity className="w-5 h-5" /> Состояние планировщика Pinterest
          </h2>
          <p className="text-xs text-muted-theme mt-1">
            Контроль фоновых запусков через worker или cron. Здесь нет ручного запуска или повторной отправки пинов.
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="px-3 py-2 rounded-xl border border-subtle text-xs font-semibold flex items-center gap-2 hover:bg-subtle disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-600 dark:text-rose-400">{error}</div>}
      {!health && loading && <div className="custom-card p-5 text-sm text-muted-theme">Загружаю состояние планировщика…</div>}

      {health && (
        <>
          <div className={`rounded-2xl border p-4 flex items-start gap-3 ${isHealthy ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
            {isHealthy ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />}
            <div>
              <div className="text-sm font-bold text-primary-theme">{statusLabels[health.status] || health.status}</div>
              <p className="text-xs text-secondary-theme mt-1">
                Последний запуск: {formatDate(health.last_started_at)} · завершение: {formatDate(health.last_completed_at)}
                {health.last_run_status ? ` · Результат: ${health.last_run_status}` : ''}
              </p>
              {health.status === 'not_seen' && <p className="text-xs text-secondary-theme mt-2">Нужно развернуть отдельный worker или настроить внешний cron. Само наличие backend API не запускает публикации по расписанию.</p>}
              {health.last_error_code && <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">Код последней ошибки: <code>{health.last_error_code}</code></p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {cards.map((card) => (
              <div key={card.note} className="custom-card rounded-2xl p-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-theme">{card.label}</div>
                <div className="text-2xl font-bold font-mono text-primary-theme mt-2">{card.value ?? '—'}</div>
                <div className="text-[10px] text-muted-theme mt-1">{card.note}</div>
              </div>
            ))}
          </div>

          <div className="custom-card rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary-theme"><Clock3 className="w-4 h-4" /> Свежесть heartbeat</div>
            <div className="text-xs text-secondary-theme">С последнего старта: <strong>{formatAge(health.last_started_age_seconds)}</strong></div>
            <div className="text-xs text-secondary-theme">С последнего завершения: <strong>{formatAge(health.last_completed_age_seconds)}</strong></div>
            <div className="text-[10px] text-muted-theme">Порог устаревания: {health.stale_after_seconds ?? '—'} сек. · Долгая задача допускается до {health.running_timeout_seconds ?? '—'} сек.</div>
            <div className="text-[10px] text-muted-theme">Обновлено: {formatDate(health.generated_at)} · автообновление раз в минуту</div>
          </div>
          {counts?.unknown ? <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">Есть публикации с неопределённым итогом. Не запускайте их повторно, пока не сверите наличие пинов в Pinterest.</div> : null}
        </>
      )}
    </section>
  );
};
