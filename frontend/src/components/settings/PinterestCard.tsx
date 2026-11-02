import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';

interface PinterestStatus {
  configured: boolean;
  connected: boolean;
  username?: string | null;
  expires_at?: string | null;
  needs_reauth?: boolean;
}

interface PinterestBoard {
  id: string;
  name: string;
  pin_count: number | null;
}

/**
 * Карточка «Pinterest» для настроек кабинета.
 * Показывает статус подключения, кнопку подключения через официальный OAuth
 * и список досок пользователя. Токены живут только на сервере.
 */
export const PinterestCard: React.FC = () => {
  const [status, setStatus] = useState<PinterestStatus | null>(null);
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const data = await apiRequest('/integrations/pinterest/status');
      setStatus(data);
    } catch (e) {
      const err = e as ApiError;
      setError(err?.message || 'Не удалось узнать статус Pinterest');
    } finally {
      setLoading(false);
    }
  };

  const loadBoards = async () => {
    try {
      const data = await apiRequest('/integrations/pinterest/boards');
      setBoards(data?.boards || []);
    } catch {
      setBoards([]);
    }
  };

  useEffect(() => {
    // Возврат с Pinterest: ?pinterest=connected | denied | error
    const params = new URLSearchParams(window.location.search);
    const result = params.get('pinterest');
    if (result) {
      if (result === 'connected') setNotice('Pinterest подключён');
      if (result === 'denied') setError('Доступ к Pinterest не выдан — попробуйте ещё раз');
      if (result === 'error') setError('Не удалось подключить Pinterest. Попробуйте ещё раз.');
      params.delete('pinterest');
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState({}, '', url.toString());
    }
    loadStatus();
  }, []);

  useEffect(() => {
    if (status?.connected) loadBoards();
  }, [status?.connected]);

  const handleConnect = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest('/integrations/pinterest/link', { method: 'POST' });
      if (!data?.authorize_url) throw new Error('Сервер не вернул ссылку авторизации');
      window.location.href = data.authorize_url;
    } catch (e) {
      const err = e as ApiError;
      setError(
        err?.status === 503
          ? 'Интеграция с Pinterest ещё не настроена на сервере. Напишите на support@pinposy.com.'
          : err?.message || 'Не удалось начать подключение'
      );
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest('/integrations/pinterest/disconnect', { method: 'POST' });
      setStatus((s) => (s ? { ...s, connected: false, username: null, expires_at: null } : s));
      setBoards([]);
    } catch (e) {
      const err = e as ApiError;
      setError(err?.message || 'Не удалось отключить Pinterest');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="custom-card p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-4">
        <div>
          <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
            <Link2 className="w-4 h-4 text-accent-ghost" />
            <span>Pinterest</span>
          </h2>
          <p className="text-xs text-muted-theme mt-0.5">
            Публикация утверждённых пинов в ваш аккаунт через официальный Pinterest API.
          </p>
        </div>

        {status?.connected ? (
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-subtle text-secondary-theme hover:border-strong transition disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
            <span>Отключить</span>
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={busy || loading || status?.configured === false}
            className="accent-btn self-start px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            <span>Подключить Pinterest</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <p className="text-xs text-muted-theme flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Проверяем подключение…
        </p>
      )}

      {!loading && status && status.configured === false && (
        <p className="text-xs text-muted-theme">
          Интеграция пока не настроена на сервере — кнопка станет активной после добавления ключей Pinterest.
        </p>
      )}

      {!loading && status?.connected && (
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-semibold text-primary-theme">
              Подключён: {status.username ? `@${status.username}` : 'аккаунт Pinterest'}
            </span>
          </div>
          {status.expires_at && (
            <p className="text-muted-theme">
              Доступ действует до {new Date(status.expires_at).toLocaleDateString('ru-RU')}
              {status.needs_reauth ? ' — требуется повторное подключение' : ''}
            </p>
          )}

          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-secondary-theme">Ваши доски Pinterest</span>
              <button
                onClick={loadBoards}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent-ghost hover:underline"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Обновить
              </button>
            </div>
            {boards.length === 0 ? (
              <p className="text-muted-theme">Досок не найдено. Создайте доску в Pinterest и нажмите «Обновить».</p>
            ) : (
              <ul className="divide-y divide-subtle rounded-xl border border-subtle">
                {boards.map((b) => (
                  <li key={b.id} className="flex items-center justify-between px-3 py-2">
                    <span className="font-semibold text-primary-theme">{b.name}</span>
                    <span className="text-muted-theme">
                      {b.pin_count != null ? `${b.pin_count} пинов` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
