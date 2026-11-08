import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Clock, RefreshCw, ShieldCheck } from "lucide-react";
import { apiRequest } from "../../lib/api";

type PinterestAttempt = {
  status: string;
  retry_safe: boolean | null;
  attempt_count: number | null;
  updated_at: string | null;
  last_error: string | null;
  pinterest_pin_id: string | null;
  pinterest_board_id: string | null;
};

type PinterestSchedule = {
  schedule_id: string;
  pin_id: string | null;
  pinterest_account_id: string | null;
  pinterest_board_id: string | null;
  pinterest_pin_id: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  updated_at: string | null;
  attempts: number | null;
  next_attempt_at: string | null;
  last_error: string | null;
  claim_present: boolean;
  category: string;
  attempt: PinterestAttempt | null;
  actionable_reconciliation: boolean;
};

type InventoryResponse = {
  limit: number;
  offset: number;
  count: number;
  items: PinterestSchedule[];
  read_only: true;
};

const STATUS_FILTERS = [
  { value: "scheduled,publishing,unknown", label: "Активные и проблемные" },
  { value: "unknown", label: "Неизвестный результат" },
  { value: "publishing", label: "В процессе публикации" },
  { value: "scheduled", label: "Запланированные" },
  { value: "failed", label: "Ошибочные" },
  { value: "published", label: "Опубликованные" },
];

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Запланировано",
  publishing: "Публикуется",
  unknown: "Результат неизвестен",
  failed: "Ошибка",
  published: "Опубликовано",
};

const CATEGORY_LABELS: Record<string, string> = {
  normal: "Обычная запись",
  unknown: "Нужна проверка результата",
  stale_publishing: "Давно выполняется",
  overdue_scheduled: "Просрочено",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function safeError(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [скрыто]")
    .replace(/(access_token|refresh_token|client_secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[скрыто]")
    .slice(0, 320);
}

export const AdminPinterestSchedules: React.FC = () => {
  const [status, setStatus] = useState(STATUS_FILTERS[0].value);
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status, limit: "50", offset: "0" });
      const result = await apiRequest(`/admin/pinterest/schedules?${params.toString()}`);
      if (!result || !Array.isArray(result.items) || result.read_only !== true) {
        throw new Error("Сервер вернул неожиданный формат списка Pinterest.");
      }
      setData(result as InventoryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить очередь Pinterest.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-5 animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-primary-theme">Очередь публикаций Pinterest</h2>
          <p className="text-sm text-muted-theme mt-1">Операционный список расписаний и последних попыток публикации.</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-subtle bg-surface hover:bg-subtle text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>

      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex items-start gap-3 text-sm">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-primary-theme">Только чтение</p>
          <p className="text-muted-theme mt-0.5">Здесь нельзя публиковать, повторять отправку, отменять задачи или менять записи в базе. Подсказка о возможности сверки не является разрешением на действие.</p>
        </div>
      </div>

      <div className="custom-card rounded-2xl p-4">
        <label htmlFor="pinterest-status-filter" className="block text-xs font-semibold text-muted-theme mb-2">Фильтр статуса</label>
        <select
          id="pinterest-status-filter"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-full sm:max-w-sm px-3 py-2.5 rounded-xl bg-surface border border-subtle text-primary-theme text-sm"
        >
          {STATUS_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
        </select>
        {data && <p className="text-xs text-muted-theme mt-2">Записей на текущей странице: {data.count} из максимум 50.</p>}
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold">Не удалось загрузить Pinterest-инвентарь</p>
            <p className="mt-1 break-words">{error}</p>
            <button type="button" onClick={() => void load(true)} className="mt-2 underline font-semibold">Повторить загрузку</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="custom-card rounded-2xl p-8 text-center text-sm text-muted-theme">Загружаем очередь Pinterest…</div>
      ) : !error && data?.items.length === 0 ? (
        <div className="custom-card rounded-2xl p-8 text-center">
          <p className="font-semibold text-primary-theme">Записей не найдено</p>
          <p className="text-sm text-muted-theme mt-1">Для выбранного фильтра очередь пуста.</p>
        </div>
      ) : !error && data && (
        <div className="space-y-3">
          {data.items.map((item) => (
            <article key={item.schedule_id} className="custom-card rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-primary-theme">{STATUS_LABELS[item.status] || item.status}</span>
                  <span className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300">{CATEGORY_LABELS[item.category] || item.category}</span>
                </div>
                <span className="text-[11px] text-muted-theme font-mono">ID: {item.schedule_id}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 text-xs">
                <div><span className="text-muted-theme">Pin ID:</span> <span className="font-mono break-all">{item.pin_id || "—"}</span></div>
                <div><span className="text-muted-theme">Pinterest account:</span> <span className="font-mono break-all">{item.pinterest_account_id || "—"}</span></div>
                <div><span className="text-muted-theme">Board ID:</span> <span className="font-mono break-all">{item.pinterest_board_id || "—"}</span></div>
                <div><span className="text-muted-theme">Создано / обновлено:</span> <span>{formatDate(item.updated_at)}</span></div>
                <div><span className="text-muted-theme">Запланировано:</span> <span>{formatDate(item.scheduled_at)}</span></div>
                <div><span className="text-muted-theme">Опубликовано:</span> <span>{formatDate(item.published_at)}</span></div>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-theme border-t border-subtle pt-3">
                <span>Попыток: <strong className="text-primary-theme">{item.attempts ?? 0}</strong></span>
                <span>Активный claim: <strong className="text-primary-theme">{item.claim_present ? "Да" : "Нет"}</strong></span>
                <span>Последняя попытка: <strong className="text-primary-theme">{item.attempt?.status || "нет данных"}</strong></span>
                <span>Безопасный повтор: <strong className="text-primary-theme">{item.attempt?.retry_safe === true ? "Да" : item.attempt?.retry_safe === false ? "Нет" : "Неизвестно"}</strong></span>
              </div>

              {(item.last_error || item.attempt?.last_error) && (
                <div className="rounded-xl bg-rose-500/5 border border-rose-500/15 p-3 text-xs">
                  <p className="font-semibold text-rose-700 dark:text-rose-300">Последняя ошибка</p>
                  <p className="mt-1 text-secondary-theme break-words">{safeError(item.attempt?.last_error || item.last_error)}</p>
                </div>
              )}

              {item.actionable_reconciliation && (
                <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3 text-xs text-sky-800 dark:text-sky-200">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  Есть предварительные признаки для проверки через серверную процедуру сверки. Это не гарантия допуска и не запускает сверку.
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
