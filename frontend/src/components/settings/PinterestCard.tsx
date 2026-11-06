import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { useI18n } from '../../i18n/i18nContext';

interface PinterestAccount {
  id: string;
  pinterest_user_id?: string | null;
  username?: string | null;
  expires_at?: string | null;
  needs_reauth?: boolean;
}

interface PinterestStatus {
  configured: boolean;
  connected: boolean;
  account_count?: number;
  accounts?: PinterestAccount[];
}

interface PinterestBoard {
  id: string;
  name: string;
  pin_count: number | null;
}

/**
 * Pinterest connections are selected by stable PinPosy account ID.
 * Credentials never leave the backend.
 */
export const PinterestCard: React.FC = () => {
  const { t } = useI18n();
  const [status, setStatus] = useState<PinterestStatus | null>(null);
  const [accounts, setAccounts] = useState<PinterestAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const data = await apiRequest('/integrations/pinterest/status');
      const nextAccounts: PinterestAccount[] = Array.isArray(data?.accounts)
        ? data.accounts
        : data?.connected
          ? [{ id: 'legacy', username: data.username, expires_at: data.expires_at }]
          : [];
      setStatus(data);
      setAccounts(nextAccounts);
      setSelectedAccountId((current) =>
        current && nextAccounts.some((account) => account.id === current)
          ? current
          : nextAccounts[0]?.id || null
      );
    } catch (e) {
      const err = e as ApiError;
      setError(err?.message || t.settings.pinterestConnectError);
    } finally {
      setLoading(false);
    }
  };

  const loadBoards = async (accountId: string | null) => {
    if (!accountId || accountId === 'legacy') {
      setBoards([]);
      return;
    }
    try {
      const data = await apiRequest(`/integrations/pinterest/boards?account_id=${encodeURIComponent(accountId)}`);
      setBoards(data?.boards || []);
    } catch {
      setBoards([]);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('pinterest');
    if (result === 'connected') setNotice(t.settings.pinterestConnected);
    if (result === 'denied') setError('Доступ к Pinterest не выдан — попробуйте ещё раз');
    if (result === 'error') setError(t.settings.pinterestConnectError);
    if (result === 'limit') setError('Достигнут лимит Pinterest-аккаунтов вашего тарифа. Измените тариф или отключите другой аккаунт.');
    if (result === 'plan_required') setError(t.settings.pinterestPlanRequired);
    if (result) {
      params.delete('pinterest');
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState({}, '', url.toString());
    }
    loadStatus();
  }, []);

  useEffect(() => {
    loadBoards(selectedAccountId);
  }, [selectedAccountId]);

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

  const handleDisconnect = async (accountId: string) => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest('/integrations/pinterest/disconnect', {
        method: 'POST',
        body: JSON.stringify({ account_id: accountId }),
      });
      setNotice(t.settings.disconnectAccount);
      await loadStatus();
    } catch (e) {
      const err = e as ApiError;
      setError(err?.message || t.settings.pinterestConnectError);
    } finally {
      setBusy(false);
    }
  };

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) || null;

  return (
    <section className="custom-card p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-4">
        <div>
          <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
            <Link2 className="w-4 h-4 text-accent-ghost" />
            <span>Pinterest</span>
          </h2>
          <p className="text-xs text-muted-theme mt-0.5">
            {t.settings.connectedAccountDesc}
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={busy || loading || status?.configured === false}
          className="accent-btn self-start px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          <span>{t.settings.pinterestConnectButton}</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /><span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}
      {loading && (
        <p className="text-xs text-muted-theme flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {t.settings.syncData}…
        </p>
      )}
      {!loading && status?.configured === false && (
        <p className="text-xs text-muted-theme">
          {t.settings.pinterestConnectionUnavailable}
        </p>
      )}

      {!loading && accounts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-secondary-theme">
              {t.settings.connectedAccountsCount.replace('{count}', String(accounts.length)).replace('{max}', String(status?.account_limit ?? '∞'))}
            </span>
            <span className="text-[11px] text-muted-theme">{t.settings.selectPinterestAccount}</span>
          </div>
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${selectedAccountId === account.id ? 'border-accent bg-subtle/50' : 'border-subtle'}`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedAccountId(account.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-semibold text-primary-theme">
                    {account.username ? `@${account.username}` : 'Pinterest-аккаунт'}
                  </span>
                  <span className="block truncate text-[10px] text-muted-theme">
                    {t.settings.pinterestAccountIdLabel}: {account.pinterest_user_id || account.id}
                    {account.needs_reauth ? ' · требуется повторная авторизация' : ''}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDisconnect(account.id)}
                  disabled={busy}
                  title="Отключить этот аккаунт"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-subtle px-2.5 py-2 text-[11px] font-semibold text-secondary-theme hover:border-rose-400 hover:text-rose-500 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                  {t.settings.disconnectAccount}
                </button>
              </li>
            ))}
          </ul>

          {selectedAccount && (
            <div className="space-y-3 border-t border-subtle pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-secondary-theme text-xs">
                  {t.settings.pinterestBoardsTitle} {selectedAccount.username ? `@${selectedAccount.username}` : ''}
                </span>
                <button
                  onClick={() => loadBoards(selectedAccount.id)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent-ghost hover:underline"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Обновить
                </button>
              </div>
              {boards.length === 0 ? (
                <p className="text-xs text-muted-theme">{t.settings.pinterestBoardsEmpty}</p>
              ) : (
                <ul className="divide-y divide-subtle rounded-xl border border-subtle">
                  {boards.map((board) => (
                    <li key={board.id} className="flex items-center justify-between px-3 py-2">
                      <span className="font-semibold text-primary-theme text-xs">{board.name}</span>
                      <span className="text-muted-theme text-xs">
                        {board.pin_count != null ? `${board.pin_count} пинов` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
