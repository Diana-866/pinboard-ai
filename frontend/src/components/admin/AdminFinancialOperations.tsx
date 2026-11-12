import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Activity, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../lib/api';

type Operation = {
  request_id?: string;
  reservation_id?: string;
  operation: 'generation' | 'regeneration' | 'ambiguous' | 'unmatched' | 'payment_reconciliation';
  payment_id?: string;
  payment_kind?: 'credits' | 'subscription';
  provider_order_id?: string | null;
  amount?: number;
  currency?: string;
  paid_at?: string | null;
  status: string;
  reason: string;
  created_at: string;
  updated_at: string;
  age_minutes: number | null;
  amount_credits?: number;
  task_counts?: { total: number; pending: number; running: number; succeeded: number; failed: number; unknown: number };
  provider_status?: string | null;
};

type QueueResponse = {
  older_than_minutes: number;
  limit_per_category: number;
  truncated: { generation: boolean; regeneration: boolean; reservations: boolean; paid_credits: boolean; paid_subscriptions: boolean };
  counts: { generation: number; regeneration: number; reservations: number; payment_reconciliation: number };
  generation: Operation[];
  regeneration: Operation[];
  reservations: Operation[];
  payment_reconciliation: Operation[];
  read_only: boolean;
  note: string;
};

const REASONS: Record<string, string> = {
  provider_outcome_unresolved: 'Результат AI-провайдера ещё не подтверждён',
  provider_refund_fact_unresolved: 'Не подтверждён факт возврата средств провайдером',
  reconciled_failure_awaiting_finalization: 'Сверка завершена, ожидается финальное закрытие',
  generation_completion_or_settlement_review: 'Нужно проверить завершение генерации и списание',
  provider_task_may_still_be_active: 'Задача провайдера ещё может выполняться',
  provider_succeeded_request_not_completed: 'Провайдер завершил работу, но PinPosy не завершил операцию',
  reservation_without_matching_request_review: 'Резерв кредитов без найденной операции',
  multiple_matching_requests_integrity_review: 'Несколько операций соответствуют одному резерву',
  old_active_reservation_requires_request_review: 'Старый активный резерв требует проверки операции',
  active_reservation_with_terminal_request_integrity_review: 'Резерв активен при завершённой операции — нужна проверка',
  paid_credit_requires_fulfillment_or_refund: 'Оплата подтверждена, но кредиты не зачислены: требуется зачисление или возврат',
  paid_subscription_requires_entitlement_or_refund: 'Оплата подтверждена, но тариф не активирован: требуется решение по зачислению или возврату',
};

function ageLabel(value: number | null) {
  if (value == null) return '—';
  if (value < 60) return `${value} мин.`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours} ч. ${minutes} мин.` : `${hours} ч.`;
}

type PaymentRow = Operation & { payment_id: string; payment_kind: 'credits' | 'subscription' };

function PaymentRefundControl({ row, onRecorded }: { row: PaymentRow; onRecorded: () => void }) {
  const [evidenceType, setEvidenceType] = useState('provider_dashboard');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [actionId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!evidenceReference.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const isCreditPurchase = row.payment_kind === 'credits';
      await apiRequest(isCreditPurchase
        ? '/admin/credit-purchases/record-provider-refund'
        : '/admin/subscriptions/record-provider-refund', {
        method: 'POST',
        body: JSON.stringify({
          [isCreditPurchase ? 'purchase_id' : 'subscription_id']: row.payment_id,
          action_id: actionId,
          evidence_type: evidenceType,
          evidence_reference: evidenceReference.trim(),
        }),
      });
      onRecorded();
    } catch (e: any) {
      setError(e?.message || 'Не удалось записать подтверждение возврата');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-[230px] space-y-1.5">
      <select
        value={evidenceType}
        onChange={(event) => setEvidenceType(event.target.value)}
        className="w-full rounded-lg border border-subtle bg-surface px-2 py-1.5 text-[10px] text-primary-theme"
        aria-label="Тип подтверждения возврата"
      >
        <option value="provider_dashboard">Кабинет Prodamus</option>
        <option value="provider_support">Ответ поддержки</option>
        <option value="payment_statement">Платёжная выписка</option>
        <option value="manual_review">Ручная проверка</option>
      </select>
      <input
        value={evidenceReference}
        onChange={(event) => setEvidenceReference(event.target.value)}
        placeholder="ID возврата / номер обращения"
        maxLength={500}
        className="w-full rounded-lg border border-subtle bg-surface px-2 py-1.5 text-[10px] text-primary-theme"
        aria-label="Номер подтверждения возврата"
      />
      <button
        type="button"
        onClick={submit}
        disabled={saving || evidenceReference.trim().length < 8}
        className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40"
      >
        {saving ? 'Сохраняем…' : 'Подтвердить возврат'}
      </button>
      {error && <p role="alert" className="text-[10px] text-rose-600">{error}</p>}
      <p className="text-[10px] text-muted-theme">Сначала выполните возврат в Prodamus, затем внесите подтверждение.</p>
    </div>
  );
}

function OperationTable({ title, rows, empty, rowLabel, onRefresh }: { title: string; rows: Operation[]; empty: string; rowLabel: string; onRefresh?: () => void }) {
  return (
    <section className="custom-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3">
        <h3 className="text-sm font-bold text-primary-theme">{title}</h3>
        <span className="rounded-full bg-subtle px-2.5 py-1 text-[11px] font-semibold text-secondary-theme">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-theme">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-theme">
              <tr className="border-b border-subtle">
                <th className="px-4 py-2.5">Операция</th>
                <th className="px-4 py-2.5">Состояние</th>
                <th className="px-4 py-2.5">Что проверить</th>
                <th className="px-4 py-2.5">Возраст</th>
                <th className="px-4 py-2.5">Обновлено</th>
                {rows.some((row) => row.payment_kind) && <th className="px-4 py-2.5">Действие</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.request_id || row.reservation_id || row.payment_id || index} className="border-b border-subtle/60 last:border-0">
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-primary-theme">{row.payment_kind === 'credits' ? 'Покупка кредитов' : row.payment_kind === 'subscription' ? 'Подписка' : rowLabel}</div>
                    <div className="mt-0.5 max-w-[180px] truncate font-mono text-[10px] text-muted-theme">{row.request_id || row.reservation_id || row.payment_id}</div>
                    {row.provider_order_id && (
                      <div className="mt-1 text-[10px] text-secondary-theme">
                        Заказ Prodamus: <span className="select-all font-mono font-semibold">{row.provider_order_id}</span>
                      </div>
                    )}
                    {row.amount != null && <div className="mt-1 text-[10px] text-muted-theme">Оплачено: {row.amount} {row.currency?.toUpperCase()}</div>}
                    {row.task_counts && <div className="mt-1 text-[10px] text-muted-theme">Задач: {row.task_counts.total} · успех: {row.task_counts.succeeded} · ошибка: {row.task_counts.failed} · неизвестно: {row.task_counts.unknown}</div>}
                    {row.amount_credits != null && <div className="mt-1 text-[10px] text-muted-theme">Зарезервировано: {row.amount_credits} кр.</div>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{row.status}</span>
                    {row.provider_status && <div className="mt-1 text-[10px] text-muted-theme">Провайдер: {row.provider_status}</div>}
                  </td>
                  <td className="max-w-[320px] px-4 py-3 align-top text-secondary-theme">{REASONS[row.reason] || row.reason}</td>
                  <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-[10px] text-secondary-theme">{ageLabel(row.age_minutes)}</td>
                  <td className="whitespace-nowrap px-4 py-3 align-top text-[10px] text-muted-theme">{new Date(row.updated_at || row.paid_at || row.created_at).toLocaleString()}</td>
                  {row.payment_kind && (
                    <td className="px-4 py-3 align-top">
                      <PaymentRefundControl row={row as PaymentRow} onRecorded={onRefresh || (() => {})} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export const AdminFinancialOperations: React.FC = () => {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/admin/financial-operations/unresolved?older_than_minutes=30&limit=50');
      setData(result);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить очередь финансовых операций');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => data ? data.counts.generation + data.counts.regeneration + data.counts.reservations + data.counts.payment_reconciliation : 0, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-primary-theme font-heading">
            <Activity className="h-5 w-5 text-accent-ghost" /> Незавершённые финансовые операции
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted-theme">Незавершённые генерации, резервы и подтверждённые оплаты. Для платёжной сверки указан ID заказа Prodamus — найдите его в кабинете провайдера.</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-xl border border-subtle bg-subtle px-3.5 py-2 text-xs font-semibold text-secondary-theme hover:bg-surface disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Обновить
        </button>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-400"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="custom-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-theme">Всего в очереди</div><div className="mt-1 text-2xl font-bold text-primary-theme">{total}</div></div>
            <div className="custom-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-theme">Генерации</div><div className="mt-1 text-2xl font-bold text-primary-theme">{data.counts.generation}</div></div>
            <div className="custom-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-theme">Перегенерации</div><div className="mt-1 text-2xl font-bold text-primary-theme">{data.counts.regeneration}</div></div>
            <div className="custom-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-theme">Резервы</div><div className="mt-1 text-2xl font-bold text-primary-theme">{data.counts.reservations}</div></div>
            <div className="custom-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-theme">Оплаты к сверке</div><div className="mt-1 text-2xl font-bold text-primary-theme">{data.counts.payment_reconciliation}</div></div>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 text-xs text-secondary-theme">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <div><strong>Безопасный режим просмотра.</strong> Этот раздел ничего не списывает, не возвращает и не закрывает автоматически. Оплаты в последней таблице подтверждены провайдером, но требуют ручной сверки зачисления или возврата.</div>
          </div>
          <OperationTable title="Генерации" rowLabel="Генерация" rows={data.generation} empty="Старых незавершённых генераций нет." />
          <OperationTable title="Перегенерации" rowLabel="Перегенерация" rows={data.regeneration} empty="Старых незавершённых перегенераций нет." />
          <OperationTable title="Активные резервы кредитов" rowLabel="Резерв кредитов" rows={data.reservations} empty="Старых активных резервов нет." />
          <OperationTable title="Оплаты, требующие сверки" rowLabel="Оплаченный заказ" rows={data.payment_reconciliation} empty="Оплаченных заказов без зачисления нет." onRefresh={load} />
          {(data.truncated.generation || data.truncated.regeneration || data.truncated.reservations || data.truncated.paid_credits || data.truncated.paid_subscriptions) && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">Показана только первая часть очереди (до {data.limit_per_category} записей в каждой категории). Обновите список позже, чтобы увидеть следующие операции.</p>
          )}
          <p className="flex items-center gap-1.5 text-[10px] text-muted-theme"><Clock3 className="h-3 w-3" /> В выборку попадают операции без обновлений более {data.older_than_minutes} минут.</p>
        </>
      )}
      {loading && !data && <p className="py-8 text-center text-xs text-muted-theme">Загружаем очередь…</p>}
      {!loading && !data && !error && <p className="py-8 text-center text-xs text-muted-theme">Нет данных для отображения.</p>}
    </div>
  );
};
