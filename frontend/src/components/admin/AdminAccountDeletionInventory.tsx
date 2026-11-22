import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ClipboardList, Clock3, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { apiRequest } from '../../lib/api';

type DeletionJob = {
  job_id: string;
  request_id: string;
  step_key: string;
  status: 'pending' | 'retry_wait' | 'running' | 'succeeded' | 'blocked';
  attempts: number;
  error_code: string | null;
  next_attempt_at: string | null;
  updated_at: string;
  age_minutes: number | null;
};

type Inventory = {
  generated_at: string;
  requests: { pending: number; completed: number; canceled: number };
  jobs: { pending: number; retry_wait: number; running: number; succeeded: number; blocked: number };
  oldest_pending_requested_at: string | null;
  oldest_pending_age_minutes: number | null;
  requiring_attention: DeletionJob[];
  requiring_attention_truncated: boolean;
  note: string;
};

const JOB_STATUS_LABEL: Record<DeletionJob['status'], string> = {
  pending: 'В очереди',
  retry_wait: 'Ожидает повтора',
  running: 'Выполняется',
  succeeded: 'Завершено',
  blocked: 'Заблокировано',
};

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isInventory(value: any): value is Inventory {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !value.requests || !value.jobs || !Array.isArray(value.requiring_attention) ||
      typeof value.requiring_attention_truncated !== 'boolean' ||
      typeof value.note !== 'string' ||
      typeof value.generated_at !== 'string' || !Number.isFinite(Date.parse(value.generated_at))) {
    return false;
  }
  if (!['pending', 'completed', 'canceled'].every((key) => isCount(value.requests[key])) ||
      !['pending', 'retry_wait', 'running', 'succeeded', 'blocked'].every((key) => isCount(value.jobs[key]))) {
    return false;
  }
  if (value.oldest_pending_age_minutes !== null && !isCount(value.oldest_pending_age_minutes)) return false;
  return value.requiring_attention.every((job: any) =>
    job && typeof job === 'object' && !Array.isArray(job) &&
    typeof job.job_id === 'string' && typeof job.request_id === 'string' &&
    typeof job.step_key === 'string' && Object.hasOwn(JOB_STATUS_LABEL, job.status) &&
    isCount(job.attempts) &&
    (job.error_code === null || typeof job.error_code === 'string') &&
    (job.next_attempt_at === null || (typeof job.next_attempt_at === 'string' && Number.isFinite(Date.parse(job.next_attempt_at)))) &&
    typeof job.updated_at === 'string' && Number.isFinite(Date.parse(job.updated_at)) &&
    (job.age_minutes === null || isCount(job.age_minutes))
  );
}

function ageLabel(value: number | null) {
  if (value === null) return '—';
  if (value < 60) return `${value} мин.`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours} ч. ${minutes} мин.` : `${hours} ч.`;
}

function dateLabel(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

export const AdminAccountDeletionInventory: React.FC = () => {
  const [data, setData] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/admin/account-deletion/inventory?limit=50');
      if (!isInventory(result)) throw new Error('Сервер вернул некорректную очередь удаления аккаунтов.');
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить очередь удаления аккаунтов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-primary-theme font-heading">
            <ClipboardList className="h-5 w-5 text-accent-ghost" /> Очередь удаления аккаунтов
          </h2>
          <p className="mt-1 text-[11.5px] text-muted-theme">
            Только диагностика. Этот экран не запускает и не повторяет удаление данных.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-subtle bg-subtle px-3.5 py-2 text-xs font-semibold text-secondary-theme hover:bg-surface disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Обновить
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="custom-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-theme">Запросы ожидают</div><div className="mt-1 text-2xl font-bold text-primary-theme">{data.requests.pending}</div></div>
            <div className="custom-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-theme">Jobs заблокировано</div><div className="mt-1 text-2xl font-bold text-primary-theme">{data.jobs.blocked}</div></div>
            <div className="custom-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-theme">Ожидают повтора</div><div className="mt-1 text-2xl font-bold text-primary-theme">{data.jobs.retry_wait}</div></div>
            <div className="custom-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-theme">Выполняются</div><div className="mt-1 text-2xl font-bold text-primary-theme">{data.jobs.running}</div></div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 text-xs text-secondary-theme">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <div>
              <strong>Безопасный режим просмотра.</strong> Заблокированная job сама не повторится. Работающая job продвинется только после корректного завершения или истечения lease.
            </div>
          </div>

          {data.requiring_attention_truncated && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Показаны только первые 50 jobs. Очередь неполная — есть дополнительные записи; не считайте этот список исчерпывающим.
            </div>
          )}

          {data.requiring_attention.length === 0 && !data.requiring_attention_truncated ? (
            <p className="custom-card px-4 py-6 text-center text-xs text-muted-theme">Jobs, требующих внимания, нет.</p>
          ) : data.requiring_attention.length > 0 ? (
            <div className="custom-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3">
                <h3 className="text-sm font-bold text-primary-theme">Jobs, требующие внимания</h3>
                <span className="rounded-full bg-subtle px-2.5 py-1 text-[11px] font-semibold text-secondary-theme">{data.requiring_attention.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-theme">
                    <tr className="border-b border-subtle">
                      <th className="px-4 py-2.5">Шаг / job</th>
                      <th className="px-4 py-2.5">Состояние</th>
                      <th className="px-4 py-2.5">Попытки / ошибка</th>
                      <th className="px-4 py-2.5">Возраст</th>
                      <th className="px-4 py-2.5">Обновлено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.requiring_attention.map((job) => (
                      <tr key={job.job_id} className="border-b border-subtle/60 last:border-0">
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold text-primary-theme">{job.step_key}</div>
                          <div className="mt-0.5 max-w-[190px] truncate font-mono text-[10px] text-muted-theme">{job.job_id}</div>
                          <div className="mt-0.5 max-w-[190px] truncate font-mono text-[10px] text-muted-theme">request: {job.request_id}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{JOB_STATUS_LABEL[job.status]}</span>
                        </td>
                        <td className="px-4 py-3 align-top text-secondary-theme">
                          <div>{job.attempts}</div>
                          <div className="mt-1 break-all text-[10px] text-muted-theme">{job.error_code || '—'}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-[10px] text-secondary-theme">{ageLabel(job.age_minutes)}</td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-[10px] text-muted-theme">{dateLabel(job.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <p className="flex items-center gap-1.5 text-[10px] text-muted-theme"><Clock3 className="h-3 w-3" /> Самый старый запрос: {dateLabel(data.oldest_pending_requested_at)} · возраст {ageLabel(data.oldest_pending_age_minutes)}.</p>
          <p className="text-[10px] text-muted-theme">{data.note}</p>
          <p className="text-[10px] text-muted-theme">Обновлено: {dateLabel(data.generated_at)}</p>
        </>
      )}

      {loading && !data && <p className="py-8 text-center text-xs text-muted-theme">Загружаем очередь…</p>}
      {!loading && !data && !error && <p className="py-8 text-center text-xs text-muted-theme">Нет данных для отображения.</p>}
    </section>
  );
};
