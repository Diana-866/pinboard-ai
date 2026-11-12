import React, { useCallback, useEffect, useRef, useState } from "react";
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
  creative_title: string;
  creative_description: string;
  pinterest_account_id: string | null;
  pinterest_account: { username: string | null; pinterest_user_id: string | null; connected: boolean } | null;
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

type SchedulerHealth = {
  status: "not_seen" | "healthy" | "running" | "failed" | "stale";
  generated_at?: string;
  last_started_at?: string | null;
  last_completed_at?: string | null;
  last_started_age_seconds?: number | null;
  last_completed_age_seconds?: number | null;
  counts?: { claimed: number; published: number; failed: number; scheduled: number; unknown: number };
  last_error_code?: string | null;
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
  const [schedulerHealth, setSchedulerHealth] = useState<SchedulerHealth | null>(null);
  const [schedulerHealthError, setSchedulerHealthError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [reconciliationScheduleId, setReconciliationScheduleId] = useState<string | null>(null);
  const [remotePinId, setRemotePinId] = useState("");
  const [remoteBoardId, setRemoteBoardId] = useState("");
  const [evidenceType, setEvidenceType] = useState<"pinterest_dashboard" | "pinterest_api" | "support_confirmation">("pinterest_dashboard");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [actionId, setActionId] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationError, setReconciliationError] = useState("");
  const [reconciliationSuccess, setReconciliationSuccess] = useState("");
  const inventoryRequestIdRef = useRef(0);
  const healthRequestIdRef = useRef(0);

  const loadSchedulerHealth = useCallback(async () => {
    const requestId = ++healthRequestIdRef.current;
    setSchedulerHealthError("");
    try {
      const result = await apiRequest("/admin/operations/pinterest-scheduler");
      if (!result || !["not_seen", "healthy", "running", "failed", "stale"].includes(result.status)) {
        throw new Error("Сервер вернул неожиданный статус планировщика.");
      }
      if (requestId === healthRequestIdRef.current) setSchedulerHealth(result as SchedulerHealth);
    } catch (err) {
      if (requestId === healthRequestIdRef.current) {
        setSchedulerHealthError(err instanceof Error ? err.message : "Не удалось загрузить состояние планировщика.");
      }
    }
  }, []);
  
  const createActionId = () => {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

  const openReconciliation = (item: PinterestSchedule) => {
    setReconciliationScheduleId(item.schedule_id);
    setRemotePinId(item.pinterest_pin_id || item.attempt?.pinterest_pin_id || "");
    setRemoteBoardId(item.pinterest_board_id || item.attempt?.pinterest_board_id || "");
    setEvidenceType("pinterest_dashboard");
    setEvidenceReference("");
    setActionId(createActionId());
    setReconciliationError("");
    setReconciliationSuccess("");
  };

  const submitReconciliation = async (item: PinterestSchedule) => {
    const pinId = remotePinId.trim();
    const boardId = remoteBoardId.trim();
    const reference = evidenceReference.trim();
    if (!pinId || !boardId || !/^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,199}$/.test(reference)) {
      setReconciliationError("Укажите Pinterest Pin ID, Board ID и номер подтверждения (не менее 8 символов).");
      return;
    }
    if (!window.confirm("Подтверждаете, что этот пин найден именно в профиле, указанном в карточке, и на указанной доске? Это действие зафиксирует публикацию как успешную.")) return;
    setReconciling(true);
    setReconciliationError("");
    setReconciliationSuccess("");
    try {
      await apiRequest("/admin/pinterest/reconcile-unknown-publication", {
        method: "POST",
        body: JSON.stringify({
          schedule_id: item.schedule_id,
          pinterest_pin_id: pinId,
          pinterest_board_id: boardId,
          evidence_type: evidenceType,
          evidence_reference: reference,
          action_id: actionId,
        }),
      });
      setReconciliationSuccess("Публикация подтверждена и восстановлена в журнале PinPosy.");
      setReconciliationScheduleId(null);
      await load(true);
    } catch (err) {
      setReconciliationError(err instanceof Error ? err.message : "Не удалось выполнить сверку. Запись не следует повторно публиковать.");
    } finally {
      setReconciling(false);
    }
  };

  const load = useCallback(async (isRefresh = false) => {
    const requestId = ++inventoryRequestIdRef.current;
    void loadSchedulerHealth();
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status, limit: "50", offset: "0" });
      const result = await apiRequest(`/admin/pinterest/schedules?${params.toString()}`);
      if (!result || !Array.isArray(result.items) || result.read_only !== true) {
        throw new Error("Сервер вернул неожиданный формат списка Pinterest.");
      }
      // A slow response for an older filter must not overwrite the newest
      // inventory (or clear its loading/error state).
      if (requestId !== inventoryRequestIdRef.current) return;
      setData(result as InventoryResponse);
    } catch (err) {
      if (requestId !== inventoryRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Не удалось загрузить очередь Pinterest.");
    } finally {
      if (requestId === inventoryRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [status, loadSchedulerHealth]);

  useEffect(() => {
    void load();
    return () => {
      // Invalidate in-flight requests when the filter changes or this panel unmounts.
      inventoryRequestIdRef.current += 1;
      healthRequestIdRef.current += 1;
    };
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

      <div className="custom-card rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-primary-theme">Автоматический планировщик</h3>
            <p className="text-xs text-muted-theme mt-0.5">Последний запуск фоновой обработки Pinterest</p>
          </div>
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${schedulerHealth?.status === "healthy" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : schedulerHealth?.status === "running" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
            {schedulerHealth?.status === "healthy" ? "Работает" : schedulerHealth?.status === "running" ? "Выполняется" : schedulerHealth?.status === "failed" ? "Ошибка" : schedulerHealth?.status === "stale" ? "Нет свежих запусков" : schedulerHealth?.status === "not_seen" ? "Ещё не запускался" : "Загрузка…"}
          </span>
        </div>
        {schedulerHealthError ? (
          <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{schedulerHealthError}</p>
        ) : schedulerHealth ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {[
                ["Взято в работу", schedulerHealth.counts?.claimed],
                ["Опубликовано", schedulerHealth.counts?.published],
                ["Ошибки", schedulerHealth.counts?.failed],
                ["Ожидают", schedulerHealth.counts?.scheduled],
                ["Неизвестно", schedulerHealth.counts?.unknown],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-surface/70 border border-subtle p-2">
                  <p className="text-muted-theme">{label}</p>
                  <p className="text-lg font-bold text-primary-theme tabular-nums">{typeof value === "number" ? value : "—"}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-theme">
              Последний запуск: {formatDate(schedulerHealth.last_started_at)}
              {" · "}
              Завершён: {formatDate(schedulerHealth.last_completed_at)}
              {schedulerHealth.last_error_code ? ` · Код: ${schedulerHealth.last_error_code}` : ""}
            </p>
          </>
        ) : <p className="text-xs text-muted-theme">Загружаем состояние планировщика…</p>}
      </div>

      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex items-start gap-3 text-sm">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-primary-theme">Безопасная сверка без повторной публикации</p>
          <p className="text-muted-theme mt-0.5">Публикации нельзя отправить повторно из этого раздела. Для записи со статусом «Результат неизвестен» можно только зафиксировать уже найденный в Pinterest пин. Отсутствие пина не считается доказательством и не разблокирует повтор.</p>
        </div>
      </div>
      {reconciliationSuccess && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{reconciliationSuccess}</div>}

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

              {(item.creative_title || item.creative_description) && (
                <div className="rounded-xl border border-subtle bg-surface/60 p-3 text-xs space-y-1">
                  <p className="font-semibold text-primary-theme">Содержание запланированного пина</p>
                  {item.creative_title && <p className="text-secondary-theme"><span className="text-muted-theme">Заголовок:</span> {item.creative_title}</p>}
                  {item.creative_description && <p className="text-secondary-theme whitespace-pre-wrap break-words"><span className="text-muted-theme">Описание:</span> {item.creative_description}</p>}
                  <p className="text-muted-theme">Это текст, сохранённый при создании расписания; он помогает найти соответствующий пин в Pinterest.</p>
                </div>
              )}

              <div className="rounded-xl border border-subtle bg-surface/60 p-3 text-xs space-y-1">
                <p className="font-semibold text-primary-theme">Целевой Pinterest-аккаунт</p>
                <p className="text-secondary-theme">Профиль: <strong>{item.pinterest_account?.username ? `@${item.pinterest_account.username}` : "имя не сохранено"}</strong></p>
                <p className="text-secondary-theme">Pinterest User ID: <span className="font-mono break-all">{item.pinterest_account?.pinterest_user_id || "не сохранён"}</span></p>
                <p className={item.pinterest_account?.connected ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>{item.pinterest_account?.connected ? "Аккаунт подключён" : "Аккаунт отключён или недоступен"}</p>
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
                <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3 space-y-3 text-xs text-sky-800 dark:text-sky-200">
                  <div>
                    <Clock className="w-3.5 h-3.5 inline mr-1" />
                    Запись достаточно старая для ручной сверки. Сервер повторно проверит все условия и не позволит завершить её, если состояние изменилось.
                  </div>
                  {reconciliationScheduleId === item.schedule_id ? (
                    <div className="space-y-2 text-primary-theme">
                      <label className="block">
                        <span className="block mb-1 font-semibold">Pinterest Pin ID — укажите ID уже существующего пина</span>
                        <input value={remotePinId} onChange={(event) => setRemotePinId(event.target.value)} maxLength={200} autoComplete="off" className="w-full rounded-lg border border-subtle bg-surface px-3 py-2 font-mono" />
                      </label>
                      <label className="block">
                        <span className="block mb-1 font-semibold">Pinterest Board ID</span>
                        <input value={remoteBoardId} onChange={(event) => setRemoteBoardId(event.target.value)} maxLength={200} autoComplete="off" className="w-full rounded-lg border border-subtle bg-surface px-3 py-2 font-mono" />
                      </label>
                      <label className="block">
                        <span className="block mb-1 font-semibold">Где подтверждено</span>
                        <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as typeof evidenceType)} className="w-full rounded-lg border border-subtle bg-surface px-3 py-2">
                          <option value="pinterest_dashboard">В кабинете Pinterest</option>
                          <option value="pinterest_api">Через Pinterest API</option>
                          <option value="support_confirmation">Подтверждение поддержки Pinterest</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="block mb-1 font-semibold">Номер обращения / записи-подтверждения (не URL)</span>
                        <input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} maxLength={200} autoComplete="off" className="w-full rounded-lg border border-subtle bg-surface px-3 py-2" />
                      </label>
                      <p className="text-amber-700 dark:text-amber-300">Важно: используйте эту форму только если вы лично нашли именно этот пин в нужном аккаунте и на нужной доске. Нельзя вводить выдуманный ID или отмечать публикацию успешной только потому, что запрос завершился ошибкой.</p>
                      {reconciliationError && <p role="alert" className="text-rose-700 dark:text-rose-300">{reconciliationError}</p>}
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void submitReconciliation(item)} disabled={reconciling} className="rounded-lg bg-sky-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{reconciling ? "Сверяем…" : "Подтвердить найденную публикацию"}</button>
                        <button type="button" onClick={() => { setReconciliationScheduleId(null); setReconciliationError(""); }} disabled={reconciling} className="rounded-lg border border-subtle px-3 py-2 font-semibold disabled:opacity-50">Отмена</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => openReconciliation(item)} className="rounded-lg border border-sky-600/40 px-3 py-2 font-semibold hover:bg-sky-500/10">Сверить уже опубликованный пин</button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
