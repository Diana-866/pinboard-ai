import React, { useCallback, useState } from 'react';
import { KeyRound, LockKeyhole, RefreshCw, ShieldCheck, Unlock } from 'lucide-react';
import { apiRequest } from '../../lib/api';

/**
 * Операторская панель замка входа (серверные маршруты из §65, миграция 164).
 *
 * Без неё единственным способом снять блокировку был curl или правка базы руками — при том что
 * атакующий может намеренно блокировать адрес владельца, а клиент после пяти опечаток ждёт окно
 * впустую. Панель намеренно на русском: остальные админ-разделы тоже, это внутренний инструмент.
 */

interface LockoutState {
  email: string;
  locked: boolean;
  failedAttempts: number;
  retryAfterSeconds: number;
}

interface ResetResult {
  email: string;
  cleared: boolean;
  affectedRows: number;
  reason: string | null;
}

function formatWait(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)} сек.`;
  return `${Math.ceil(seconds / 60)} мин.`;
}

export const AdminLoginLockout: React.FC = () => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<LockoutState | null>(null);
  const [reset, setReset] = useState<ResetResult | null>(null);
  const [loading, setLoading] = useState<'check' | 'reset' | null>(null);
  const [error, setError] = useState('');

  const normalized = email.trim();

  const check = useCallback(async () => {
    if (!normalized) {
      setError('Укажите адрес аккаунта.');
      return;
    }
    setLoading('check');
    setError('');
    setReset(null);
    try {
      const result = await apiRequest(
        `/admin/accounts/login-lockout?email=${encodeURIComponent(normalized)}`
      );
      setState(result as LockoutState);
    } catch (e) {
      setState(null);
      setError(e instanceof Error ? e.message : 'Не удалось получить состояние замка');
    } finally {
      setLoading(null);
    }
  }, [normalized]);

  const clear = useCallback(async () => {
    if (!normalized) {
      setError('Укажите адрес аккаунта.');
      return;
    }
    setLoading('reset');
    setError('');
    try {
      const result = await apiRequest('/admin/accounts/login-lockout/reset', {
        method: 'POST',
        body: JSON.stringify({ email: normalized }),
      });
      setReset(result as ResetResult);
      setState((previous) => (previous ? { ...previous, locked: false, retryAfterSeconds: 0 } : previous));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось снять блокировку');
    } finally {
      setLoading(null);
    }
  }, [normalized]);

  return (
    <section className="space-y-5 animate-in fade-in duration-150">
      <div>
        <h2 className="text-lg font-bold text-primary-theme flex items-center gap-2">
          <LockKeyhole className="w-5 h-5" /> Замок входа
        </h2>
        <p className="text-xs text-muted-theme mt-1">
          Пять неудачных паролей блокируют вход по адресу на 15 минут. Здесь можно посмотреть
          состояние и снять блокировку, не дожидаясь окна. Ничего не удаляется: обнуляется только
          счётчик неудач.
        </p>
      </div>

      <div className="custom-card rounded-2xl p-4 space-y-3">
        <label htmlFor="lockout-email" className="block text-xs font-semibold text-secondary-theme">
          Адрес аккаунта
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="lockout-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="customer@example.com"
            className="flex-1 rounded-xl border border-subtle bg-surface px-3 py-2 text-sm text-primary-theme"
          />
          <button
            onClick={() => void check()}
            disabled={loading !== null || !normalized}
            className="px-3 py-2 rounded-xl border border-subtle text-xs font-semibold flex items-center justify-center gap-2 hover:bg-subtle disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading === 'check' ? 'animate-spin' : ''}`} />
            Проверить
          </button>
          <button
            onClick={() => void clear()}
            disabled={loading !== null || !normalized}
            className="px-3 py-2 rounded-xl border border-subtle text-xs font-semibold flex items-center justify-center gap-2 hover:bg-subtle disabled:opacity-50"
          >
            <Unlock className="w-4 h-4" />
            Снять блокировку
          </button>
        </div>
        <p className="text-[10px] text-muted-theme flex items-center gap-1">
          <KeyRound className="w-3 h-3" /> Адрес проверяется на сервере; неизвестный адрес не
          раскрывается как существующий.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {state && (
        <div className="custom-card rounded-2xl p-4 space-y-2">
          <div className="text-sm font-semibold text-primary-theme flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Состояние
          </div>
          <div className="text-xs text-secondary-theme">
            Аккаунт: <strong>{state.email}</strong>
          </div>
          <div className="text-xs text-secondary-theme">
            Заблокирован: <strong>{state.locked ? 'да' : 'нет'}</strong>
            {state.locked ? ` · осталось ${formatWait(state.retryAfterSeconds)}` : ''}
          </div>
          <div className="text-xs text-secondary-theme">
            Неудачных попыток подряд: <strong>{state.failedAttempts}</strong>
          </div>
        </div>
      )}

      {reset && (
        <div className="custom-card rounded-2xl p-4 space-y-2">
          <div className="text-sm font-semibold text-primary-theme flex items-center gap-2">
            <Unlock className="w-4 h-4" /> Результат сброса
          </div>
          <div className="text-xs text-secondary-theme">
            {reset.cleared
              ? `Счётчик сброшен, затронуто строк: ${reset.affectedRows}.`
              : 'Сервер не подтвердил сброс — повторите позже.'}
          </div>
          {reset.reason && <div className="text-[10px] text-muted-theme">Причина: {reset.reason}</div>}
        </div>
      )}
    </section>
  );
};
